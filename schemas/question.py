import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field


class QuestionCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    telegram: Annotated[str, Field(min_length=1, max_length=255)]
    title: Annotated[str, Field(min_length=1, max_length=255)]
    text: Annotated[str, Field(min_length=1, max_length=5000)]


class QuestionResponse(BaseModel):
    id: uuid.UUID
    name: str
    telegram: str
    title: str
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}
