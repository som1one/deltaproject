import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field


class WorkerMessageScriptRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    body: str
    category: str
    keywords: list[str]
    sort_order: int
    created_at: datetime


class WorkerMessageScriptCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=255)]
    body: Annotated[str, Field(min_length=1, max_length=50_000)]
    category: Annotated[str, Field(min_length=1, max_length=255)] = "Общие"
    keywords: list[str] = Field(default_factory=list)
    sort_order: int = 0


class WorkerMessageScriptPatch(BaseModel):
    title: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    body: Annotated[str | None, Field(None, min_length=1, max_length=50_000)] = None
    category: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    keywords: list[str] | None = None
    sort_order: int | None = None


class WorkerScriptCategoriesResponse(BaseModel):
    categories: list[str]
