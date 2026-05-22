from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Item, Operation, Stock


class WmsError(ValueError):
    pass


def get_item_by_sku(db: Session, sku: str) -> Item | None:
    return db.scalar(select(Item).where(Item.sku == sku))


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
    item = get_item_by_sku(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU.")

    stock = get_or_create_stock(db, item, location)
    stock.quantity += quantity
    db.add(
        Operation(
            operation_type="receive",
            sku=sku,
            to_location=location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
        )
    )
    db.commit()
    db.refresh(stock)
    return stock


def issue_stock(db: Session, sku: str, location: str, quantity: int, scanner_id: str, operator: str | None) -> Stock:
    item = get_item_by_sku(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU.")

    stock = get_or_create_stock(db, item, location)
    if stock.quantity < quantity:
        raise WmsError("Za malo towaru na lokalizacji.")

    stock.quantity -= quantity
    db.add(
        Operation(
            operation_type="issue",
            sku=sku,
            from_location=location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
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

    item = get_item_by_sku(db, sku)
    if not item:
        raise WmsError("Nie znaleziono SKU.")

    source = get_or_create_stock(db, item, from_location)
    if source.quantity < quantity:
        raise WmsError("Za malo towaru na lokalizacji zrodlowej.")

    target = get_or_create_stock(db, item, to_location)
    source.quantity -= quantity
    target.quantity += quantity
    db.add(
        Operation(
            operation_type="move",
            sku=sku,
            from_location=from_location,
            to_location=to_location,
            quantity=quantity,
            scanner_id=scanner_id,
            operator=operator,
        )
    )
    db.commit()
    db.refresh(source)
    db.refresh(target)
    return source, target
