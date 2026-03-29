import uuid
from typing import Annotated

from pydantic import BaseModel, Field


class ReferralCreate(BaseModel):
    link: Annotated[str, Field(min_length=1, max_length=2048)]


class ReferralRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    link: str


class ReferralBindRequest(BaseModel):
    referral_id: uuid.UUID


class ReferralLinkedResponse(BaseModel):
    linked: bool = True
    message: str
    blogger_id: uuid.UUID
