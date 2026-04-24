import uuid

from pydantic import BaseModel


class BloggerOptionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    telegram: str | None
