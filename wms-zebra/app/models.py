from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    barcode: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    stocks: Mapped[list["Stock"]] = relationship(back_populates="item")


class Stock(Base):
    __tablename__ = "stocks"
    __table_args__ = (UniqueConstraint("item_id", "location", name="uq_stock_item_location"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    location: Mapped[str] = mapped_column(String(80), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    item: Mapped[Item] = relationship(back_populates="stocks")


class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    operation_type: Mapped[str] = mapped_column(String(40), index=True)
    sku: Mapped[str] = mapped_column(String(80), index=True)
    from_location: Mapped[str | None] = mapped_column(String(80), nullable=True)
    to_location: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    scanner_id: Mapped[str] = mapped_column(String(120), index=True)
    operator: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ScannerDevice(Base):
    __tablename__ = "scanner_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scanner_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    device_uid: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
