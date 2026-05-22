from io import BytesIO

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import qrcode
import qrcode.image.svg
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import Item, Operation, Stock
from app.schemas import ItemCreate, ItemOut, IssueRequest, MoveRequest, OperationOut, ReceiveRequest, StockOut
from app.security import require_api_key
from app.services import WmsError, create_item, issue_stock, move_stock, receive_stock

Base.metadata.create_all(bind=engine)

app = FastAPI(title="WMS Zebra API", version="0.1.0")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse("app/static/dashboard.html")


@app.get("/scanner", include_in_schema=False)
def scanner() -> FileResponse:
    return FileResponse("app/static/scanner.html")


@app.get("/scanner-qr.svg", include_in_schema=False)
def scanner_qr(request: Request) -> Response:
    factory = qrcode.image.svg.SvgPathImage
    if settings.wms_public_url:
        scanner_url = f"{settings.wms_public_url.rstrip('/')}/scanner"
    else:
        scanner_url = str(request.url_for("scanner"))
    image = qrcode.make(scanner_url, image_factory=factory, box_size=12, border=2)
    buffer = BytesIO()
    image.save(buffer)
    return Response(content=buffer.getvalue(), media_type="image/svg+xml")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
        select(Item.sku, Item.name, Stock.location, Stock.quantity)
        .join(Stock, Stock.item_id == Item.id)
        .order_by(Item.sku, Stock.location)
    ).all()
    return [StockOut(sku=sku, name=name, location=location, quantity=quantity) for sku, name, location, quantity in rows]


@app.post("/api/stock/receive", response_model=StockOut, dependencies=[Depends(require_api_key)])
def receive(payload: ReceiveRequest, db: Session = Depends(get_db)) -> StockOut:
    try:
        stock = receive_stock(db, payload.sku, payload.location, payload.quantity, payload.scanner_id, payload.operator)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StockOut(sku=stock.item.sku, name=stock.item.name, location=stock.location, quantity=stock.quantity)


@app.post("/api/stock/issue", response_model=StockOut, dependencies=[Depends(require_api_key)])
def issue(payload: IssueRequest, db: Session = Depends(get_db)) -> StockOut:
    try:
        stock = issue_stock(db, payload.sku, payload.location, payload.quantity, payload.scanner_id, payload.operator)
    except WmsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StockOut(sku=stock.item.sku, name=stock.item.name, location=stock.location, quantity=stock.quantity)


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
        StockOut(sku=source.item.sku, name=source.item.name, location=source.location, quantity=source.quantity),
        StockOut(sku=target.item.sku, name=target.item.name, location=target.location, quantity=target.quantity),
    ]


@app.get("/api/operations", response_model=list[OperationOut], dependencies=[Depends(require_api_key)])
def operations(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[Operation]:
    return list(db.scalars(select(Operation).order_by(Operation.id.desc()).limit(limit)))
