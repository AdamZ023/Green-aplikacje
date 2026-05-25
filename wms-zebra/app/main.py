from io import BytesIO
import re

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import qrcode
import qrcode.image.svg
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import Item, Operation, ScannerDevice, Stock
from app.schemas import (
    ItemCreate,
    ItemOut,
    IssueRequest,
    MoveRequest,
    OperationOut,
    ReceiveRequest,
    ScannerRegistrationOut,
    StockOut,
)
from app.security import require_api_key
from app.services import WmsError, create_item, issue_stock, move_stock, receive_stock

APP_VERSION = "20260525-7"
CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

Base.metadata.create_all(bind=engine)
if "scanner_devices" not in inspect(engine).get_table_names():
    ScannerDevice.__table__.create(bind=engine)

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
    if settings.wms_public_url:
        scanner_url = f"{settings.wms_public_url.rstrip('/')}/zebra-v2?v={APP_VERSION}"
    else:
        scanner_url = f"{request.url_for('zebra_v2')}?v={APP_VERSION}"
    image = qrcode.make(scanner_url, image_factory=factory, box_size=12, border=2)
    buffer = BytesIO()
    image.save(buffer)
    return Response(content=buffer.getvalue(), media_type="image/svg+xml", headers=CACHE_HEADERS)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/scanners/register",
    response_model=ScannerRegistrationOut,
    dependencies=[Depends(require_api_key)],
)
def register_scanner(db: Session = Depends(get_db)) -> ScannerRegistrationOut:
    existing_ids = set(db.scalars(select(ScannerDevice.scanner_id)))
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

    device = ScannerDevice(scanner_id=scanner_id)
    db.add(device)
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
    rows = db.execute(
        select(Item.sku, Item.barcode, Item.name, Stock.location, Stock.quantity)
        .join(Stock, Stock.item_id == Item.id)
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


@app.get("/api/operations", response_model=list[OperationOut], dependencies=[Depends(require_api_key)])
def operations(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[Operation]:
    return list(db.scalars(select(Operation).order_by(Operation.id.desc()).limit(limit)))
