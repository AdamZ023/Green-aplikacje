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
    name: str
    location: str
    quantity: int


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
