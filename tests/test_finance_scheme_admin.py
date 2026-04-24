"""Админские фин. схемы: валидация PUT и разбор ответа списка (без БД)."""

import uuid

import pytest
from pydantic import ValidationError

from schemas.finance import FinanceSchemeAdminPut, FinanceSchemeAdminRead


def test_put_rejects_zero_sum_weights() -> None:
    with pytest.raises(ValidationError):
        FinanceSchemeAdminPut(
            weight_worker=0,
            weight_bloger=0,
            weight_upline=0,
            weight_platform=0,
        )


def test_put_accepts_positive_sum() -> None:
    m = FinanceSchemeAdminPut(
        weight_worker=2000,
        weight_bloger=5000,
        weight_upline=1000,
        weight_platform=8000,
    )
    assert m.weight_worker == 2000


def test_read_schema_roundtrip() -> None:
    bid = uuid.uuid4()
    sid = uuid.uuid4()
    r = FinanceSchemeAdminRead(
        blogger_id=bid,
        blogger_name="Test",
        blogger_email="t@example.com",
        scheme_id=sid,
        weight_worker=1,
        weight_bloger=2,
        weight_upline=3,
        weight_platform=4,
    )
    d = r.model_dump()
    assert d["scheme_id"] == sid
    assert d["blogger_id"] == bid
