from datetime import timezone, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Item, Operation, PickingTask, Stock


class WmsError(ValueError):
    pass


def scan_timestamp() -> datetime:
    return datetime.now(timezone.utc)


def get_item_by_code(db: Session, code: str) -> Item | None:
    normalized = code.strip()
    return db.scalar(select(Item).where((Item.sku == normalized) | (Item.barcode == normalized)))


def create_item(db: Session, sku: str, name: str, barcode: str | None) -> Item:
    item = Item(sku=sku.strip(), name=name.strip(), barcode=barcode.strip() if barcode else None)
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise WmsError("SKU albo kod kreskowy juz istnieje.") from exc
    db.refresh(item)
    return item


def get_or_create_stock(db: Session, item: Item, location: str) -> Stock:
    stock = db.scalar(
        select(Stock)
        .where(Stock.item_id == item.id, Stock.location == location)
        .with_for_update()
    )
    if stock:
        return stock

    stock = Stock(item_id=item.id, location=location, quantity=0)
    db.add(stock)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        stock = db.scalar(select(Stock).where(Stock.item_id == item.id, Stock.location == location))
        if stock:
            return stock
        raise
    return stock


def receive_stock(db: Session, sku: str, location: str, quantity: int, scanner_id: str, operator: str | None) -> Stock:
    item = get_item_by_code(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU ani kodu EAN.")

    stock = get_or_create_stock(db, item, location)
    stock.quantity += quantity
    db.add(
        Operation(
            operation_type="receive",
            sku=item.sku,
            to_location=location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
            created_at=scan_timestamp(),
        )
    )
    db.commit()
    db.refresh(stock)
    return stock


def issue_stock(db: Session, sku: str, location: str, quantity: int, scanner_id: str, operator: str | None) -> Stock:
    item = get_item_by_code(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU ani kodu EAN.")

    stock = get_or_create_stock(db, item, location)
    if stock.quantity < quantity:
        raise WmsError("Za malo towaru na lokalizacji.")

    stock.quantity -= quantity
    db.add(
        Operation(
            operation_type="issue",
            sku=item.sku,
            from_location=location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
            created_at=scan_timestamp(),
        )
    )
    db.commit()
    db.refresh(stock)
    return stock


def move_stock(
    db: Session,
    sku: str,
    from_location: str,
    to_location: str,
    quantity: int,
    scanner_id: str,
    operator: str | None,
) -> tuple[Stock, Stock]:
    if from_location == to_location:
        raise WmsError("Lokalizacja zrodlowa i docelowa sa takie same.")

    item = get_item_by_code(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU ani kodu EAN.")

    source = get_or_create_stock(db, item, from_location)
    if source.quantity < quantity:
        raise WmsError("Za malo towaru na lokalizacji zrodlowej.")

    target = get_or_create_stock(db, item, to_location)
    source.quantity -= quantity
    target.quantity += quantity
    db.add(
        Operation(
            operation_type="move",
            sku=item.sku,
            from_location=from_location,
            to_location=to_location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
            created_at=scan_timestamp(),
        )
    )
    db.commit()
    db.refresh(source)
    db.refresh(target)
    return source, target


def complete_picking_task(
    db: Session,
    task_id: int,
    scanned_code: str,
    source_location: str,
    target_location: str,
    scanner_id: str,
    operator: str | None,
) -> PickingTask:
    task = db.scalar(select(PickingTask).where(PickingTask.id == task_id).with_for_update())
    if not task:
        raise WmsError("Nie znaleziono zadania picking.")
    if task.status not in {"pending", "assigned"}:
        raise WmsError("Zadanie picking nie jest juz aktywne.")
    if task.status == "assigned" and task.scanner_id and task.scanner_id != scanner_id:
        raise WmsError("Zadanie picking jest przypisane do innego skanera.")
    if not task.source_location:
        raise WmsError("Zadanie nie ma dostepnej lokalizacji zrodlowej.")

    item = get_item_by_code(db, scanned_code)
    if not item or item.sku != task.sku:
        raise WmsError("Zeskanowano inny produkt niz w zadaniu.")
    if source_location.strip() != task.source_location:
        raise WmsError("Zeskanowano inna lokalizacje zrodlowa.")
    if target_location.strip() != task.target_location:
        raise WmsError("Zeskanowano inna lokalizacje docelowa.")

    source = get_or_create_stock(db, item, task.source_location)
    if source.quantity < task.quantity:
        raise WmsError("Za malo towaru na lokalizacji picking.")

    source.quantity -= task.quantity
    now = scan_timestamp()
    task.status = "done"
    task.scanner_id = scanner_id
    task.operator = operator
    task.picked_at = now
    db.add(
        Operation(
            operation_type="picking",
            sku=item.sku,
            from_location=task.source_location,
            to_location=task.target_location,
            quantity=task.quantity,
            scanner_id=scanner_id,
            operator=operator,
            created_at=now,
        )
    )
    db.commit()
    db.refresh(task)
    return task
