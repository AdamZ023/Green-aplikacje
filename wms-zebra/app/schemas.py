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


class PickingFinishRequest(BaseModel):
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


class AllocationWorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class AllocationWorkspaceOut(BaseModel):
    workspace_id: str
    name: str
    status: str
    total_pallets: int = 0
    total_cartons: int = 0
    confirmed_cartons: int = 0
    unconfirmed_cartons: int = 0
    plan_items: int = 0
    created_at: datetime


class AllocationImportOut(BaseModel):
    workspace_id: str
    source_filename: str
    imported: int
    replaced: bool = False
    message: str


class AllocationActionOut(BaseModel):
    message: str


class AllocationEventOut(BaseModel):
    id: int
    workspace_id: str
    event_type: str
    description: str
    source_filename: str | None = None
    sku: str | None = None
    color: str | None = None
    pallet_count: int | None = None
    carton_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AllocationDeliveryOut(BaseModel):
    delivery_id: str
    delivery_ref: str | None = None
    source_filename: str
    total_cartons: int
    pallet_count: int = 0
    created_at: datetime


class AllocationSectionRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    sku: str = Field(min_length=1, max_length=120)
    color: str | None = Field(default=None, max_length=120)


class AllocationSectionMoveRequest(AllocationSectionRequest):
    target_position: str = Field(min_length=1, max_length=40)


class AllocationWorkspaceDeleteRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)


class AllocationPalletOut(BaseModel):
    pallet_code: str
    pallet_no: str
    delivery_ref: str | None = None
    source_filename: str | None = None
    total_cartons: int
    status: str
    layout_row: str | None = None
    layout_position: str | None = None
    sku_list: str | None = None
    ean_list: str | None = None


class AllocationContentOut(BaseModel):
    delivery_ref: str | None = None
    source_filename: str | None = None
    pallet_code: str
    sku: str
    color: str | None = None
    kind: str | None = None
    size: str | None = None
    ean: str | None = None
    quantity_cartons: int
    status: str


class AllocationPlanItemOut(BaseModel):
    mdk: str
    color: str | None = None
    supplier: str | None = None
    delivery_plan: str | None = None
    ean_prepack: str | None = None
    source_filename: str
    status: str
