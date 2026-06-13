import datetime
import uuid
from typing import Annotated, Union

from pydantic import BaseModel, EmailStr, Field, computed_field, model_validator

from enums.user import UserRole
from schemas.ledger import LedgerEntryRead, LedgerListResponse
from schemas.me import BloggerMeStatsRead, WorkerMeStatsRead


class AdminUserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    email: str
    nickname: str | None
    telegram: str | None
    role: UserRole
    linked_to: uuid.UUID | None
    percent: float
    balance: int
    is_active: bool
    payout_card_last4: str | None = None
    payout_card_brand: str | None = None
    payout_card_holder: str | None = None
    payout_card_bank: str | None = None
    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_owner_admin(self) -> bool:
        """Владелец-Admin (role == ADMIN); Tech_Admin сюда не входит — для UI-логики."""
        return self.role == UserRole.ADMIN


class AdminUserPatch(BaseModel):
    role: UserRole | None = None
    percent: Annotated[float | None, Field(ge=0, le=100)] = None
    upline_blogger_id: uuid.UUID | None = None
    is_active: bool | None = None
    email: EmailStr | None = None
    telegram: Annotated[str | None, Field(None, max_length=255)] = None
    name: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    nickname: Annotated[
        str | None,
        Field(
            None,
            min_length=3,
            max_length=32,
            pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$",
        ),
    ] = None
    blogger_cabinet_pin: Annotated[
        str | None,
        Field(None, max_length=64, description="Только для блогера; пустая строка сбрасывает PIN"),
    ] = None


class AdminBalanceAdjustmentRequest(BaseModel):
    amount_kopeks: Annotated[int, Field(ge=-99_999_999_999, le=99_999_999_999)]
    reason: Annotated[str, Field(min_length=1, max_length=500)]

    @model_validator(mode="after")
    def _validate(self) -> "AdminBalanceAdjustmentRequest":
        if self.amount_kopeks == 0:
            raise ValueError("Сумма корректировки не может быть нулевой")
        if not self.reason.strip():
            raise ValueError("Причина не может состоять из пробелов")
        return self


class AdminBalanceAdjustmentResponse(BaseModel):
    user: AdminUserRead
    ledger_entry: LedgerEntryRead


class AdminPartnerCardSet(BaseModel):
    """Карта партнёра, задаваемая Тех-админом; PAN в БД не сохраняется.

    Точная валидация (13–19 цифр + алгоритм Луна) выполняется на сервере.
    """

    card_number: Annotated[str, Field(min_length=12, max_length=32)]
    card_brand: str | None = None
    card_holder: str | None = None
    card_bank: str | None = None

class AdminAuditEntryRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    actor_id: uuid.UUID
    target_user_id: uuid.UUID
    field: str
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime.datetime


class AdminAuditListResponse(BaseModel):
    items: list[AdminAuditEntryRead]
    total: int


class AdminBloggerCreateRequest(BaseModel):
    nickname: Annotated[
        str,
        Field(
            min_length=3,
            max_length=32,
            pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$",
        ),
    ]
    name: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    telegram: Annotated[str | None, Field(None, max_length=255)] = None


class AdminBloggerCreateResponse(BaseModel):
    user: AdminUserRead
    nickname: str
    generated_password: str


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRead]
    total: int


class AdminUserLedgerResponse(LedgerListResponse):
    pass


class AdminWorkerCabinetStatsRead(WorkerMeStatsRead):
    """Статистика работника для админки (как в кабинете + ожидающие выплаты)."""

    balance_pending_confirmation_kopeks: int = 0


class AdminBloggerCabinetStatsRead(BloggerMeStatsRead):
    """Статистика блогера для админки (как в кабинете + ожидающие выплаты)."""

    balance_pending_confirmation_kopeks: int = 0


AdminUserStatsResponse = Union[AdminWorkerCabinetStatsRead, AdminBloggerCabinetStatsRead]


class AdminOverviewResponse(BaseModel):
    users_total: int
    users_active: int
    users_inactive: int
    users_by_role: dict[str, int]
    balance_total_kopeks: int
    balance_by_role: dict[str, int]
    deals_total: int
    deals_by_status: dict[str, int]
