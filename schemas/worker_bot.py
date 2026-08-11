"""Схемы админского управления ботом воркеров: настройки, ростер, рассылки."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WorkerBotSettingsRead(BaseModel):
    auto_nudges_enabled: bool
    paused_until: datetime | None = None


class WorkerBotSettingsUpdate(BaseModel):
    auto_nudges_enabled: bool
    paused_until: datetime | None = Field(
        default=None,
        description="Молчать до этого момента; null — паузы нет",
    )


class NudgeRuleRead(BaseModel):
    kind: str
    title: str
    is_enabled: bool
    cooldown_days: int
    threshold_days: int
    text_template: str
    updated_at: datetime | None = None


class NudgeRuleUpdate(BaseModel):
    is_enabled: bool | None = None
    cooldown_days: int | None = Field(default=None, ge=1, le=365)
    threshold_days: int | None = Field(default=None, ge=0, le=365)
    text_template: str | None = Field(default=None, min_length=10, max_length=2000)


class SegmentRead(BaseModel):
    key: str
    description: str
    # None — сегмент считается только в момент отправки (нужен опрос Bot API)
    total: int | None = None
    reachable: int | None = None


class RosterItem(BaseModel):
    user_id: uuid.UUID
    name: str
    referrals: int
    earnings_kopeks: int
    days_silent: int | None = None
    days_since_registration: int | None = None
    bot_connected: bool


class WorkerBotOverview(BaseModel):
    settings: WorkerBotSettingsRead
    segments: list[SegmentRead]
    roster: list[RosterItem]
    total_workers: int
    total_referrals: int
    total_earnings_kopeks: int
    bot_connected_count: int


class BroadcastRequest(BaseModel):
    segment: str
    text: str = Field(min_length=1, max_length=3000)


class BroadcastPreview(BaseModel):
    segment: str
    description: str
    total: int
    reachable: int
    names: list[str]


class BroadcastResult(BaseModel):
    delivered: int
    skipped_no_chat: int
    failed: int
    failures: list[str]


class NudgeLogItem(BaseModel):
    user_id: uuid.UUID
    name: str
    kind: str
    sent_at: datetime


class NudgeLogResponse(BaseModel):
    items: list[NudgeLogItem]
    total: int
