from datetime import datetime

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    barcode: str | None = Field(default=None, max_length=120)


class ItemOut(BaseModel):
    id: int
    sku: str
    name: str
    barcode: str | None

    model_config = {"from_attributes": True}


class StockOut(BaseModel):
    sku: str
    barcode: str | None = None
    name: str
    location: str
    quantity: int
    reserved_quantity: int = 0
    operator: str | None = None
    scanner_id: str | None = None
    scan_at: datetime | None = None


class WarehouseStockOut(BaseModel):
    sku: str
    barcode: str | None = None
    name: str
    warehouse: str
    quantity: int
    reserved_quantity: int = 0
    operator: str | None = None
    scanner_id: str | None = None
    scan_at: datetime | None = None


class ScannerRegistrationOut(BaseModel):
    scanner_id: str


class ScannerRegistrationRequest(BaseModel):
    device_uid: str | None = Field(default=None, max_length=120)
    session_id: str | None = Field(default=None, max_length=120)
    force_new: bool = False


class ReceiveRequest(BaseModel):
    sku: str
    location: str
    quantity: int = Field(gt=0)
    scanner_id: str = Field(min_length=1, max_length=120)
    operator: str | None = Field(default=None, max_length=120)


class IssueRequest(BaseModel):
    sku: str
    location: str
    quantity: int = Field(gt=0)
    scanner_id: str = Field(min_length=1, max_length=120)
    operator: str | None = Field(default=None, max_length=120)


class MoveRequest(BaseModel):
    sku: str
    from_location: str
    to_location: str
    quantity: int = Field(gt=0)
    scanner_id: str = Field(min_length=1, max_length=120)
    operator: str | None = Field(default=None, max_length=120)


class OperationOut(BaseModel):
    id: int
    operation_type: str
    sku: str
    from_location: str | None
    to_location: str | None
    quantity: int
    scanner_id: str
    operator: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PickingImportOut(BaseModel):
    batch_id: str
    created: int
    blocked: int


class PickingCancelRequest(BaseModel):
    batch_id: str = Field(min_length=1, max_length=120)


class PickingBatchOut(BaseModel):
    batch_id: str
    source_filename: str | None = None
    total_tasks: int
    assigned_tasks: int
    status: str
    progress_percent: int
    created_at: datetime | None = None


class PickingTaskOut(BaseModel):
    id: int
    batch_id: str
    sku: str
    barcode: str | None = None
    name: str | None = None
    source_location: str | None
    target_location: str
    quantity: int
    status: str
    scanner_id: str | None = None
    operator: str | None = None
    assigned_at: datetime | None = None
    picked_at: datetime | None = None
    created_at: datetime


class ShippingOut(BaseModel):
    scan_at: datetime | None = None
    batch_id: str
    source_filename: str | None = None
    picking_status: str
    shipping_status: str
    sku: str
    barcode: str | None = None
    name: str | None = None
    source_location: str | None = None
    target_location: str
    quantity: int
    operator: str | None = None
    scanner_id: str | None = None
    assigned_at: datetime | None = None
    picked_at: datetime | None = None
    created_at: datetime


class PickingNextRequest(BaseModel):
    batch_id: str = Field(min_length=1, max_length=120)
    scanner_id: str = Field(min_length=1, max_length=120)
    operator: str | None = Field(default=None, max_length=120)


class PickingCompleteRequest(BaseModel):
    task_id: int
    sku: str
    source_location: str
    target_location: str
    scanner_id: str = Field(min_length=1, max_length=120)
    operator: str | None = Field(default=None, max_length=120)
