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


class PickingBatch(Base):
    __tablename__ = "picking_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    source_filename: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class PickingTask(Base):
    __tablename__ = "picking_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(120), index=True)
    sku: Mapped[str] = mapped_column(String(80), index=True)
    source_location: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    target_location: Mapped[str] = mapped_column(String(80), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    scanner_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    operator: Mapped[str | None] = mapped_column(String(120), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    picked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ScannerDevice(Base):
    __tablename__ = "scanner_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scanner_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    device_uid: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ScannerLoginSession(Base):
    __tablename__ = "scanner_login_sessions"
    __table_args__ = (
        UniqueConstraint("session_id", "device_uid", name="uq_scanner_session_device"),
        UniqueConstraint("session_id", "scanner_id", name="uq_scanner_session_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(120), index=True)
    device_uid: Mapped[str] = mapped_column(String(120), index=True)
    scanner_id: Mapped[str] = mapped_column(String(120), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AllocationWorkspace(Base):
    __tablename__ = "allocation_workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(40), default="robocza", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DeliveryImport(Base):
    __tablename__ = "delivery_imports"
    __table_args__ = (UniqueConstraint("workspace_id", "source_filename", name="uq_delivery_import_workspace_file"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    delivery_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    source_filename: Mapped[str] = mapped_column(String(240))
    delivery_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    total_cartons: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DeliveryPallet(Base):
    __tablename__ = "delivery_pallets"
    __table_args__ = (UniqueConstraint("delivery_id", "pallet_code", name="uq_delivery_pallet_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    delivery_id: Mapped[str] = mapped_column(String(120), index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    pallet_no: Mapped[str] = mapped_column(String(80), index=True)
    pallet_code: Mapped[str] = mapped_column(String(120), index=True)
    total_cartons: Mapped[int] = mapped_column(Integer, default=0)
    allocation_status: Mapped[str] = mapped_column(String(60), default="roboczo_pod_alokacje", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DeliveryPalletContent(Base):
    __tablename__ = "delivery_pallet_contents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    delivery_id: Mapped[str] = mapped_column(String(120), index=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    pallet_code: Mapped[str] = mapped_column(String(120), index=True)
    sku: Mapped[str] = mapped_column(String(120), index=True)
    color: Mapped[str | None] = mapped_column(String(120), nullable=True)
    kind: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    size: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ean: Mapped[str | None] = mapped_column(String(240), nullable=True, index=True)
    quantity_cartons: Mapped[int] = mapped_column(Integer, default=0)
    sumy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allocation_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    overflow_used: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AllocationPlanItem(Base):
    __tablename__ = "allocation_plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(120), index=True)
    source_filename: Mapped[str] = mapped_column(String(240), index=True)
    mdk: Mapped[str] = mapped_column(String(120), index=True)
    season: Mapped[str | None] = mapped_column(String(80), nullable=True)
    assortment_group: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    delivery_plan: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ean_prepack: Mapped[str | None] = mapped_column(String(240), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
