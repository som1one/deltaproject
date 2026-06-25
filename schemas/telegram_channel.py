"""Pydantic schemas for Telegram channel subscription feature."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TelegramChannelConfigRead(BaseModel):
    channel_id: str
    channel_title: str
    channel_url: str
    is_enabled: bool

    model_config = {"from_attributes": True}


class TelegramChannelConfigSet(BaseModel):
    channel_id: str = Field(..., min_length=1, max_length=128)
    channel_title: str = Field(default="", max_length=255)
    channel_url: str = Field(default="", max_length=512)
    is_enabled: bool = True


class TelegramChannelStatsResponse(BaseModel):
    total: int
    today: int
    this_week: int
    this_month: int
    period_count: int | None = None


class TelegramChannelSubCheck(BaseModel):
    """Response for the public check endpoint (used by frontend during registration)."""
    required: bool
    subscribed: bool
    channel_url: str = ""
    channel_title: str = ""
