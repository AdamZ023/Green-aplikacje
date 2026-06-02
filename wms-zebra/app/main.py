from io import BytesIO
import csv
import re
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import qrcode
import qrcode.image.svg
from sqlalchemy import case, func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import Item, Operation, PickingBatch, PickingTask, ScannerDevice, ScannerLoginSession, Stock
from app.schemas import (
    ItemCreate,
    ItemOut,
    IssueRequest,
    MoveRequest,
    OperationOut,
    PickingBatchOut,
    PickingCancelRequest,
    PickingCompleteRequest,
    PickingFinishRequest,
    PickingImportOut,
    PickingNextRequest,
    PickingTaskOut,
    ReceiveRequest,
    ScannerRegistrationOut,
    ScannerRegistrationRequest,
    ShippingOut,
    StockOut,
    WarehouseStockOut,
)
from app.security import require_api_key
from app.services import (
    WmsError,
    complete_picking_task,
    create_item,
    issue_stock,
    move_stock,
    receive_stock,
    scan_timestamp,
)

APP_VERSION = "20260601-5"
WAREHOUSE_CODE = "9201D"
PICKING_HEADER_ALIASES = {
    "code": {"ean", "barcode", "kod", "kod kreskowy", "sku", "indeks", "index"},
    "quantity": {"ilosc", "qty", "quantity", "szt", "sztuki"},
    "target": {
        "do lokalizacji",
        "lokalizacja docelowa",
        "docelowa lokalizacja",
        "lokalizacja",
        "dest",
        "destination",
        "gdzie",
    },
}
CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}
RESERVED_PICKING_STATUSES = ("pending", "assigned")

Base.metadata.create_all(bind=engine)
inspector = inspect(engine)
if "scanner_devices" not in inspector.get_table_names():
    ScannerDevice.__table__.create(bind=engine)
else:
    scanner_columns = {column["name"] for column in inspector.get_columns("scanner_devices")}
    if "device_uid" not in scanner_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE scanner_devices ADD COLUMN device_uid VARCHAR(120)"))
            connection.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_scanner_devices_device_uid ON scanner_devices (device_uid)")
            )

if "picking_tasks" not in inspector.get_table_names():
    PickingTask.__table__.create(bind=engine)
else:
    picking_columns = {column["name"] for column in inspector.get_columns("picking_tasks")}
    if "assigned_at" not in picking_columns:
        assigned_at_type = "TIMESTAMP WITH TIME ZONE" if engine.url.get_backend_name() == "postgresql" else "TIMESTAMP"
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE picking_tasks ADD COLUMN assigned_at {assigned_at_type}"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_picking_tasks_assigned_at ON picking_tasks (assigned_at)"))

if "picking_batches" not in inspector.get_table_names():
    PickingBatch.__table__.create(bind=engine)

app = FastAPI(title="WMS Zebra API", version="0.1.0")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse("app/static/dashboard.html", headers=CACHE_HEADERS)


@app.get("/scanner", include_in_schema=False)
def scanner() -> FileResponse:
    return FileResponse("app/static/scanner.html", headers=CACHE_HEADERS)


@app.get("/zebra-v2", include_in_schema=False)
def zebra_v2() -> FileResponse:
    return FileResponse("app/static/scanner.html", headers=CACHE_HEADERS)


@app.get("/scanner-qr.svg", include_in_schema=False)
def scanner_qr(request: Request) -> Response:
    factory = qrcode.image.svg.SvgPathImage
    session_id = uuid4().hex
    api_key_param = f"&key={settings.wms_api_key}&session={session_id}"
    if settings.wms_public_url:
        scanner_url = f"{settings.wms_public_url.rstrip('/')}/zebra-v2?v={APP_VERSION}{api_key_param}"
    else:
        scanner_url = f"{request.url_for('zebra_v2')}?v={APP_VERSION}{api_key_param}"
    image = qrcode.make(scanner_url, image_factory=factory, box_size=12, border=2)
    buffer = BytesIO()
    image.save(buffer)
    return Response(content=buffer.getvalue(), media_type="image/svg+xml", headers=CACHE_HEADERS)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    return {
        "database": engine.url.get_backend_name(),
        "driver": engine.url.get_driver_name(),
    }


@app.post(
    "/api/scanners/register",
    response_model=ScannerRegistrationOut,
    dependencies=[Depends(require_api_key)],
)
def register_scanner(
    payload: ScannerRegistrationRequest | None = None,
    db: Session = Depends(get_db),
) -> ScannerRegistrationOut:
    payload = payload or ScannerRegistrationRequest()
    device_uid = payload.device_uid.strip() if payload.device_uid else None
    session_id = payload.session_id.strip() if payload.session_id else None

    if session_id and device_uid:
        existing_session = db.scalar(
            select(ScannerLoginSession).where(
                ScannerLoginSession.session_id == session_id,
                ScannerLoginSession.device_uid == device_uid,
            )
        )
        if not payload.force_new:
            if existing_session:
                return ScannerRegistrationOut(scanner_id=existing_session.scanner_id)
        elif existing_session:
            db.delete(existing_session)
            db.commit()

        for _ in range(20):
            session_ids = set(
                db.scalars(
                    select(ScannerLoginSession.scanner_id).where(ScannerLoginSession.session_id == session_id)
                )
            )
            next_number = 1
            while True:
                scanner_id = f"ZEBRA-{next_number:02d}"
                if scanner_id not in session_ids:
                    break
                next_number += 1

            db.add(ScannerLoginSession(session_id=session_id, device_uid=device_uid, scanner_id=scanner_id))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                continue
            return ScannerRegistrationOut(scanner_id=scanner_id)
        raise HTTPException(status_code=409, detail="Nie mozna nadac ID skanera. Sprobuj ponownie.")

    if device_uid and not payload.force_new:
        existing_device = db.scalar(select(ScannerDevice).where(ScannerDevice.device_uid == device_uid))
        if existing_device:
            return ScannerRegistrationOut(scanner_id=existing_device.scanner_id)

    existing_ids = set(
        db.scalars(select(ScannerDevice.scanner_id).where(ScannerDevice.device_uid.is_not(None)))
    )
    existing_ids.update(db.scalars(select(Operation.scanner_id).where(Operation.scanner_id.like("ZEBRA-%"))))
    existing_numbers = []
    for scanner_id in existing_ids:
        match = re.fullmatch(r"ZEBRA-(\d+)", scanner_id or "")
        if match:
            existing_numbers.append(int(match.group(1)))
    next_number = (max(existing_numbers) if existing_numbers else 0) + 1
    while True:
        scanner_id = f"ZEBRA-{next_number:02d}"
        if scanner_id not in existing_ids:
            break
        next_number += 1

    existing_device = db.scalar(select(ScannerDevice).where(ScannerDevice.device_uid == device_uid)) if device_uid else None
    placeholder = db.scalar(select(ScannerDevice).where(ScannerDevice.scanner_id == scanner_id))
    if placeholder and placeholder.device_uid is None and device_uid:
        db.delete(placeholder)
        db.flush()

    if existing_device:
        existing_device.scanner_id = scanner_id
    else:
        db.add(ScannerDevice(scanner_id=scanner_id, device_uid=device_uid))
    db.commit()
    return ScannerRegistrationOut(scanner_id=scanner_id)


@app.get("/api/items", response_model=list[ItemOut], dependencies=[Depends(require_api_key)])
def list_items(db: Session = Depends(get_db)) -> list[Item]:
    return list(db.scalars(select(Item).order_by(Item.sku)))


@app.post("/api/items", response_model=ItemOut, dependencies=[Depends(require_api_key)])
def add_item(payload: ItemCreate, db: Session = Depends(get_db)) -> Item:
    try:
        return create_item(db, payload.sku, payload.name, payload.barcode)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/stock", response_model=list[StockOut], dependencies=[Depends(require_api_key)])
def list_stock(db: Session = Depends(get_db)) -> list[StockOut]:
    reserved_by_sku_location = get_reserved_by_sku_location(db)
    excluded_locations = get_picking_target_locations(db)
    filters = [Stock.quantity > 0]
    if excluded_locations:
        filters.append(Stock.location.not_in(excluded_locations))
    rows = db.execute(
        select(Item.sku, Item.barcode, Item.name, Stock.location, Stock.quantity)
        .join(Stock, Stock.item_id == Item.id)
        .where(*filters)
        .order_by(Item.sku, Stock.location)
    ).all()
    stock_rows = []
    for sku, barcode, name, location, quantity in rows:
        latest_operation = db.scalar(
            select(Operation)
            .where(
                Operation.sku == sku,
                (
                    (Operation.to_location == location)
                    | (Operation.from_location == location)
                ),
            )
            .order_by(Operation.id.desc())
            .limit(1)
        )
        stock_rows.append(
            StockOut(
                sku=sku,
                barcode=barcode,
                name=name,
                location=location,
                quantity=quantity,
                reserved_quantity=reserved_by_sku_location.get((sku, location), 0),
                operator=latest_operation.operator if latest_operation else None,
                scanner_id=latest_operation.scanner_id if latest_operation else None,
                scan_at=latest_operation.created_at if latest_operation else None,
            )
        )
    return stock_rows


@app.get("/api/warehouse-stock", response_model=list[WarehouseStockOut], dependencies=[Depends(require_api_key)])
def list_warehouse_stock(db: Session = Depends(get_db)) -> list[WarehouseStockOut]:
    reserved_by_sku = get_reserved_by_sku(db)
    excluded_locations = get_picking_target_locations(db)
    stock_join_filter = Stock.item_id == Item.id
    if excluded_locations:
        stock_join_filter = stock_join_filter & Stock.location.not_in(excluded_locations)
    rows = db.execute(
        select(
            Item.sku,
            Item.barcode,
            Item.name,
            func.coalesce(func.sum(Stock.quantity), 0),
        )
        .outerjoin(Stock, stock_join_filter)
        .group_by(Item.sku, Item.barcode, Item.name)
        .order_by(Item.sku)
    ).all()
    stock_rows = []
    for sku, barcode, name, quantity in rows:
        latest_operation = db.scalar(
            select(Operation)
            .where(Operation.sku == sku)
            .order_by(Operation.id.desc())
            .limit(1)
        )
        stock_rows.append(
            WarehouseStockOut(
                sku=sku,
                barcode=barcode,
                name=name,
                warehouse=WAREHOUSE_CODE,
                quantity=quantity,
                reserved_quantity=reserved_by_sku.get(sku, 0),
                operator=latest_operation.operator if latest_operation else None,
                scanner_id=latest_operation.scanner_id if latest_operation else None,
                scan_at=latest_operation.created_at if latest_operation else None,
            )
        )
    return stock_rows


@app.post("/api/stock/receive", response_model=StockOut, dependencies=[Depends(require_api_key)])
def receive(payload: ReceiveRequest, db: Session = Depends(get_db)) -> StockOut:
    try:
        stock = receive_stock(db, payload.sku, payload.location, payload.quantity, payload.scanner_id, payload.operator)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StockOut(
        sku=stock.item.sku,
        barcode=stock.item.barcode,
        name=stock.item.name,
        location=stock.location,
        quantity=stock.quantity,
        operator=payload.operator,
        scanner_id=payload.scanner_id,
        scan_at=None,
    )


@app.post("/api/stock/issue", response_model=StockOut, dependencies=[Depends(require_api_key)])
def issue(payload: IssueRequest, db: Session = Depends(get_db)) -> StockOut:
    try:
        stock = issue_stock(db, payload.sku, payload.location, payload.quantity, payload.scanner_id, payload.operator)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StockOut(
        sku=stock.item.sku,
        barcode=stock.item.barcode,
        name=stock.item.name,
        location=stock.location,
        quantity=stock.quantity,
        operator=payload.operator,
        scanner_id=payload.scanner_id,
        scan_at=None,
    )


@app.post("/api/stock/move", response_model=list[StockOut], dependencies=[Depends(require_api_key)])
def move(payload: MoveRequest, db: Session = Depends(get_db)) -> list[StockOut]:
    try:
        source, target = move_stock(
            db,
            payload.sku,
            payload.from_location,
            payload.to_location,
            payload.quantity,
            payload.scanner_id,
            payload.operator,
        )
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [
        StockOut(
            sku=source.item.sku,
            barcode=source.item.barcode,
            name=source.item.name,
            location=source.location,
            quantity=source.quantity,
            operator=payload.operator,
            scanner_id=payload.scanner_id,
            scan_at=None,
        ),
        StockOut(
            sku=target.item.sku,
            barcode=target.item.barcode,
            name=target.item.name,
            location=target.location,
            quantity=target.quantity,
            operator=payload.operator,
            scanner_id=payload.scanner_id,
            scan_at=None,
        ),
    ]


@app.post("/api/picking/import", response_model=PickingImportOut, dependencies=[Depends(require_api_key)])
async def import_picking(request: Request, db: Session = Depends(get_db)) -> PickingImportOut:
    filename = request.headers.get("X-Filename", "picking.csv")
    content = await request.body()
    try:
        rows = parse_picking_file(filename, content)
        batch_id = uuid4().hex[:12].upper()
        db.add(PickingBatch(batch_id=batch_id, source_filename=filename[:240]))
        created, blocked = create_picking_tasks(db, batch_id, rows)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PickingImportOut(batch_id=batch_id, created=created, blocked=blocked)


@app.get("/api/picking/batches", response_model=list[PickingBatchOut], dependencies=[Depends(require_api_key)])
def list_picking_batches(db: Session = Depends(get_db)) -> list[PickingBatchOut]:
    block_invalid_picking_sources(db)
    task_rows = db.execute(
        select(
            PickingTask.batch_id,
            func.count(PickingTask.id),
            func.sum(case((PickingTask.source_location.is_not(None), 1), else_=0)),
            func.sum(case((PickingTask.status == "done", 1), else_=0)),
            func.sum(case((PickingTask.status == "assigned", 1), else_=0)),
            func.sum(case((PickingTask.status == "canceled", 1), else_=0)),
            func.sum(case((PickingTask.status == "closed", 1), else_=0)),
            func.max(PickingTask.created_at),
        )
        .group_by(PickingTask.batch_id)
        .order_by(func.max(PickingTask.created_at).desc())
    ).all()
    batch_ids = [row[0] for row in task_rows]
    batch_by_id = {}
    if batch_ids:
        batch_by_id = {
            batch.batch_id: batch
            for batch in db.scalars(select(PickingBatch).where(PickingBatch.batch_id.in_(batch_ids)))
        }
    return [
        picking_batch_out(
            batch_id=row[0],
            source_filename=batch_by_id[row[0]].source_filename if row[0] in batch_by_id else None,
            total_tasks=int(row[1] or 0),
            assigned_tasks=int(row[2] or 0),
            done_tasks=int(row[3] or 0),
            active_tasks=int(row[4] or 0),
            canceled_tasks=int(row[5] or 0),
            closed_tasks=int(row[6] or 0),
            created_at=batch_by_id[row[0]].created_at if row[0] in batch_by_id else row[7],
        )
        for row in task_rows
    ]


@app.get("/api/picking/tasks", response_model=list[PickingTaskOut], dependencies=[Depends(require_api_key)])
def list_picking_tasks(
    status: str | None = Query(default=None),
    batch_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[PickingTaskOut]:
    block_invalid_picking_sources(db)
    query = select(PickingTask)
    if status:
        query = query.where(PickingTask.status == status)
    if batch_id:
        query = query.where(PickingTask.batch_id == batch_id)
    query = query.order_by(PickingTask.id if batch_id else PickingTask.id.desc()).limit(limit)
    tasks = list(db.scalars(query))
    return [picking_task_out(db, task) for task in tasks]


@app.post("/api/picking/cancel", response_model=PickingBatchOut, dependencies=[Depends(require_api_key)])
def cancel_picking(payload: PickingCancelRequest, db: Session = Depends(get_db)) -> PickingBatchOut:
    tasks = list(
        db.scalars(
            select(PickingTask)
            .where(PickingTask.batch_id == payload.batch_id)
            .with_for_update()
        )
    )
    if not tasks:
        raise HTTPException(status_code=404, detail="Nie znaleziono pickingu.")

    cancelable = [task for task in tasks if task.status != "done"]
    if not cancelable:
        raise HTTPException(status_code=400, detail="Picking jest juz zebrany i nie mozna go anulowac.")

    for task in cancelable:
        task.status = "canceled"
        task.scanner_id = None
        task.operator = None
        task.assigned_at = None
    db.commit()

    batch = db.scalar(select(PickingBatch).where(PickingBatch.batch_id == payload.batch_id))
    return picking_batch_out(
        batch_id=payload.batch_id,
        source_filename=batch.source_filename if batch else None,
        total_tasks=len(tasks),
        assigned_tasks=sum(1 for task in tasks if task.source_location),
        done_tasks=sum(1 for task in tasks if task.status == "done"),
        active_tasks=0,
        canceled_tasks=sum(1 for task in tasks if task.status == "canceled"),
        closed_tasks=sum(1 for task in tasks if task.status == "closed"),
        created_at=batch.created_at if batch else tasks[0].created_at,
    )


@app.post("/api/picking/finish", response_model=PickingBatchOut, dependencies=[Depends(require_api_key)])
def finish_picking(payload: PickingFinishRequest, db: Session = Depends(get_db)) -> PickingBatchOut:
    tasks = list(
        db.scalars(
            select(PickingTask)
            .where(PickingTask.batch_id == payload.batch_id)
            .with_for_update()
        )
    )
    if not tasks:
        raise HTTPException(status_code=404, detail="Nie znaleziono pickingu.")

    done_count = sum(1 for task in tasks if task.status == "done")
    finishable = [task for task in tasks if task.status not in {"done", "closed"}]
    if not finishable and done_count >= len(tasks):
        raise HTTPException(status_code=400, detail="Picking jest juz zebrany.")
    if not finishable and done_count < len(tasks):
        raise HTTPException(status_code=400, detail="Picking jest juz zakonczony czesciowo.")

    for task in finishable:
        task.status = "closed"
        task.scanner_id = None
        task.operator = None
        task.assigned_at = None
    db.commit()

    batch = db.scalar(select(PickingBatch).where(PickingBatch.batch_id == payload.batch_id))
    return picking_batch_out(
        batch_id=payload.batch_id,
        source_filename=batch.source_filename if batch else None,
        total_tasks=len(tasks),
        assigned_tasks=sum(1 for task in tasks if task.source_location),
        done_tasks=sum(1 for task in tasks if task.status == "done"),
        active_tasks=0,
        canceled_tasks=sum(1 for task in tasks if task.status == "canceled"),
        closed_tasks=sum(1 for task in tasks if task.status == "closed"),
        created_at=batch.created_at if batch else tasks[0].created_at,
    )


@app.get("/api/shipping", response_model=list[ShippingOut], dependencies=[Depends(require_api_key)])
def list_shipping(limit: int = Query(default=500, ge=1, le=1000), db: Session = Depends(get_db)) -> list[ShippingOut]:
    shipping_batch_statuses = get_shipping_picking_batch_statuses(db)
    if not shipping_batch_statuses:
        return []

    shipping_batch_ids = list(shipping_batch_statuses)
    batches_by_id = {
        batch.batch_id: batch
        for batch in db.scalars(select(PickingBatch).where(PickingBatch.batch_id.in_(shipping_batch_ids)))
    }
    tasks = list(
        db.scalars(
            select(PickingTask)
            .where(
                PickingTask.batch_id.in_(shipping_batch_ids),
                PickingTask.status == "done",
            )
            .order_by(PickingTask.picked_at.desc(), PickingTask.id.desc())
            .limit(limit)
        )
    )
    return [
        shipping_out(db, task, batches_by_id.get(task.batch_id), shipping_batch_statuses.get(task.batch_id, "zebrany"))
        for task in tasks
    ]


@app.post("/api/picking/next", response_model=PickingTaskOut | None, dependencies=[Depends(require_api_key)])
def next_picking_task(payload: PickingNextRequest, db: Session = Depends(get_db)) -> PickingTaskOut | None:
    block_invalid_picking_sources(db)
    excluded_locations = get_picking_target_locations(db)
    valid_source_filters = [PickingTask.source_location.is_not(None)]
    if excluded_locations:
        valid_source_filters.append(PickingTask.source_location.not_in(excluded_locations))
    existing_task = db.scalar(
        select(PickingTask)
        .where(
            PickingTask.batch_id == payload.batch_id,
            PickingTask.status == "assigned",
            PickingTask.scanner_id == payload.scanner_id,
            *valid_source_filters,
        )
        .order_by(PickingTask.id)
        .limit(1)
    )
    if existing_task:
        return picking_task_out(db, existing_task)

    task = db.scalar(
        select(PickingTask)
        .where(
            PickingTask.batch_id == payload.batch_id,
            PickingTask.status == "pending",
            *valid_source_filters,
        )
        .order_by(PickingTask.id)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if task:
        task.status = "assigned"
        task.scanner_id = payload.scanner_id
        task.operator = payload.operator
        task.assigned_at = scan_timestamp()
        db.commit()
        db.refresh(task)
    return picking_task_out(db, task) if task else None


@app.post("/api/picking/complete", response_model=PickingTaskOut, dependencies=[Depends(require_api_key)])
def complete_picking(payload: PickingCompleteRequest, db: Session = Depends(get_db)) -> PickingTaskOut:
    try:
        task = complete_picking_task(
            db,
            payload.task_id,
            payload.sku,
            payload.source_location,
            payload.target_location,
            payload.scanner_id,
            payload.operator,
        )
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return picking_task_out(db, task)


@app.get("/api/operations", response_model=list[OperationOut], dependencies=[Depends(require_api_key)])
def operations(
    limit: int = 100,
    operation_type: str | None = None,
    db: Session = Depends(get_db),
) -> list[Operation]:
    limit = max(1, min(int(limit), 500))
    query = select(Operation)
    if operation_type:
        query = query.where(Operation.operation_type == operation_type)
    return list(db.scalars(query.order_by(Operation.id.desc()).limit(limit)))


def parse_picking_file(filename: str, content: bytes) -> list[dict[str, str]]:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else "csv"
    if suffix == "xlsx":
        return parse_picking_xlsx(content)
    if suffix == "csv":
        return parse_picking_csv(content)
    raise WmsError("Obslugiwane sa tylko pliki CSV i XLSX.")


def parse_picking_csv(content: bytes) -> list[dict[str, str]]:
    for encoding in ("utf-8-sig", "cp1250"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise WmsError("Nie mozna odczytac kodowania pliku CSV.")

    sample = text[:2048]
    delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    return list(csv.DictReader(text.splitlines(), delimiter=delimiter))


def parse_picking_xlsx(content: bytes) -> list[dict[str, str]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise WmsError("Brakuje biblioteki openpyxl do odczytu XLSX.") from exc

    workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(value or "").strip() for value in rows[0]]
    parsed = []
    for row in rows[1:]:
        parsed.append({headers[index]: cell_to_text(value) for index, value in enumerate(row)})
    return parsed


def create_picking_tasks(db: Session, batch_id: str, rows: list[dict[str, str]]) -> tuple[int, int]:
    if not rows:
        raise WmsError("Plik picking jest pusty.")

    created = 0
    blocked = 0
    reserved_by_sku_location = get_reserved_by_sku_location(db)
    excluded_locations = get_picking_target_locations(db)
    for row_number, row in enumerate(rows, start=2):
        normalized = {normalize_header(key): str(value or "").strip() for key, value in row.items()}
        code = normalize_code_value(get_picking_value(normalized, "code"))
        quantity_text = get_picking_value(normalized, "quantity")
        target = get_picking_value(normalized, "target")
        if not code and not quantity_text and not target:
            continue
        if not code or not quantity_text or not target:
            raise WmsError(f"Wiersz {row_number}: wymagane sa produkt, ilosc i lokalizacja docelowa.")
        try:
            quantity = int(float(quantity_text.replace(",", ".")))
        except ValueError as exc:
            raise WmsError(f"Wiersz {row_number}: ilosc musi byc liczba.") from exc
        if quantity < 1:
            raise WmsError(f"Wiersz {row_number}: ilosc musi byc wieksza od zera.")

        item = db.scalar(select(Item).where((Item.sku == code) | (Item.barcode == code)))
        if not item:
            raise WmsError(f"Wiersz {row_number}: nie znaleziono produktu {code}.")

        remaining = quantity
        stock_filters = [Stock.item_id == item.id, Stock.quantity > 0]
        if excluded_locations:
            stock_filters.append(Stock.location.not_in(excluded_locations))
        stocks = list(
            db.scalars(
                select(Stock)
                .where(*stock_filters)
                .order_by(Stock.location)
            )
        )
        for stock in stocks:
            if remaining <= 0:
                break
            reserved_quantity = reserved_by_sku_location.get((item.sku, stock.location), 0)
            available_quantity = max(stock.quantity - reserved_quantity, 0)
            if available_quantity <= 0:
                continue
            pick_quantity = min(remaining, available_quantity)
            db.add(
                PickingTask(
                    batch_id=batch_id,
                    sku=item.sku,
                    source_location=stock.location,
                    target_location=target,
                    quantity=pick_quantity,
                    status="pending",
                )
            )
            reserved_by_sku_location[(item.sku, stock.location)] = reserved_quantity + pick_quantity
            created += 1
            remaining -= pick_quantity
        if remaining > 0:
            db.add(
                PickingTask(
                    batch_id=batch_id,
                    sku=item.sku,
                    source_location=None,
                    target_location=target,
                    quantity=remaining,
                    status="blocked",
                )
            )
            created += 1
            blocked += 1

    if created == 0:
        raise WmsError("Nie znaleziono zadnych pozycji do pickingu.")
    db.commit()
    return created, blocked


def get_reserved_by_sku_location(db: Session) -> dict[tuple[str, str], int]:
    excluded_locations = get_picking_target_locations(db)
    filters = [
        PickingTask.status.in_(RESERVED_PICKING_STATUSES),
        PickingTask.source_location.is_not(None),
    ]
    if excluded_locations:
        filters.append(PickingTask.source_location.not_in(excluded_locations))
    rows = db.execute(
        select(
            PickingTask.sku,
            PickingTask.source_location,
            func.coalesce(func.sum(PickingTask.quantity), 0),
        )
        .where(*filters)
        .group_by(PickingTask.sku, PickingTask.source_location)
    ).all()
    return {(sku, location): int(quantity or 0) for sku, location, quantity in rows if location}


def get_picking_target_locations(db: Session) -> set[str]:
    return {
        location
        for location in db.scalars(select(PickingTask.target_location).where(PickingTask.target_location.is_not(None)))
        if location
    }


def block_invalid_picking_sources(db: Session) -> None:
    excluded_locations = get_picking_target_locations(db)
    if not excluded_locations:
        return
    tasks = list(
        db.scalars(
            select(PickingTask)
            .where(
                PickingTask.status.in_(RESERVED_PICKING_STATUSES),
                PickingTask.source_location.in_(excluded_locations),
            )
            .with_for_update()
        )
    )
    if not tasks:
        return
    for task in tasks:
        task.status = "blocked"
        task.source_location = None
        task.scanner_id = None
        task.operator = None
        task.assigned_at = None
    db.commit()


def get_reserved_by_sku(db: Session) -> dict[str, int]:
    excluded_locations = get_picking_target_locations(db)
    filters = [
        PickingTask.status.in_(RESERVED_PICKING_STATUSES),
        PickingTask.source_location.is_not(None),
    ]
    if excluded_locations:
        filters.append(PickingTask.source_location.not_in(excluded_locations))
    rows = db.execute(
        select(
            PickingTask.sku,
            func.coalesce(func.sum(PickingTask.quantity), 0),
        )
        .where(*filters)
        .group_by(PickingTask.sku)
    ).all()
    return {sku: int(quantity or 0) for sku, quantity in rows}


def get_shipping_picking_batch_statuses(db: Session) -> dict[str, str]:
    rows = db.execute(
        select(
            PickingTask.batch_id,
            func.count(PickingTask.id),
            func.sum(case((PickingTask.status == "done", 1), else_=0)),
            func.sum(case((PickingTask.status == "closed", 1), else_=0)),
        )
        .group_by(PickingTask.batch_id)
    ).all()
    statuses = {}
    for batch_id, total, done, closed in rows:
        total = int(total or 0)
        done = int(done or 0)
        closed = int(closed or 0)
        if total <= 0 or done <= 0:
            continue
        if done >= total:
            statuses[batch_id] = "zebrany"
        elif done + closed >= total:
            statuses[batch_id] = "zebrany czesciowo"
    return statuses


def normalize_header(value: str) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def normalize_code_value(value: str) -> str:
    value = value.strip()
    if re.fullmatch(r"\d+\.0", value):
        return value[:-2]
    return value


def cell_to_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def get_picking_value(row: dict[str, str], field: str) -> str:
    aliases = PICKING_HEADER_ALIASES[field]
    for alias in aliases:
        value = row.get(normalize_header(alias))
        if value:
            return value
    return ""


def picking_batch_out(
    batch_id: str,
    source_filename: str | None,
    total_tasks: int,
    assigned_tasks: int,
    done_tasks: int,
    active_tasks: int,
    canceled_tasks: int,
    closed_tasks: int,
    created_at: object,
) -> PickingBatchOut:
    if total_tasks <= 0:
        status = "oczekuje"
        progress_percent = 0
    elif done_tasks >= total_tasks:
        status = "zebrany"
        progress_percent = 100
    elif done_tasks + closed_tasks >= total_tasks and closed_tasks > 0:
        status = "zebrany czesciowo"
        progress_percent = round(done_tasks * 100 / total_tasks)
    elif done_tasks + canceled_tasks >= total_tasks:
        status = "anulowany"
        progress_percent = round(done_tasks * 100 / total_tasks)
    elif done_tasks > 0 or active_tasks > 0:
        status = "w trakcie"
        progress_percent = round(done_tasks * 100 / total_tasks)
    else:
        status = "oczekuje"
        progress_percent = 0
    return PickingBatchOut(
        batch_id=batch_id,
        source_filename=source_filename,
        total_tasks=total_tasks,
        assigned_tasks=assigned_tasks,
        status=status,
        progress_percent=progress_percent,
        created_at=created_at,
    )


def picking_task_out(db: Session, task: PickingTask) -> PickingTaskOut:
    item = db.scalar(select(Item).where(Item.sku == task.sku))
    return PickingTaskOut(
        id=task.id,
        batch_id=task.batch_id,
        sku=task.sku,
        barcode=item.barcode if item else None,
        name=item.name if item else None,
        source_location=task.source_location,
        target_location=task.target_location,
        quantity=task.quantity,
        status=task.status,
        scanner_id=task.scanner_id,
        operator=task.operator,
        assigned_at=task.assigned_at,
        picked_at=task.picked_at,
        created_at=task.created_at,
    )


def shipping_out(db: Session, task: PickingTask, batch: PickingBatch | None, picking_status: str) -> ShippingOut:
    item = db.scalar(select(Item).where(Item.sku == task.sku))
    return ShippingOut(
        scan_at=task.picked_at,
        batch_id=task.batch_id,
        source_filename=batch.source_filename if batch else None,
        picking_status=picking_status,
        shipping_status="gotowe do wysylki",
        sku=task.sku,
        barcode=item.barcode if item else None,
        name=item.name if item else None,
        source_location=task.source_location,
        target_location=task.target_location,
        quantity=task.quantity,
        operator=task.operator,
        scanner_id=task.scanner_id,
        assigned_at=task.assigned_at,
        picked_at=task.picked_at,
        created_at=task.created_at,
    )
