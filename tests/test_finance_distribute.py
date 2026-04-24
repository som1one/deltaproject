"""Распределение суммы по весам схемы блогера."""

import uuid

from models.blogger_finance_scheme import BloggerFinanceScheme
from services.finance_scheme_service import (
    DEFAULT_WEIGHT_BLOGER,
    DEFAULT_WEIGHT_PLATFORM,
    DEFAULT_WEIGHT_UPLINE,
    DEFAULT_WEIGHT_WORKER,
    distribute_price_kopeks,
)


def _default_scheme(blogger_id: uuid.UUID | None = None) -> BloggerFinanceScheme:
    return BloggerFinanceScheme(
        blogger_id=blogger_id or uuid.uuid4(),
        weight_worker=DEFAULT_WEIGHT_WORKER,
        weight_bloger=DEFAULT_WEIGHT_BLOGER,
        weight_upline=DEFAULT_WEIGHT_UPLINE,
        weight_platform=DEFAULT_WEIGHT_PLATFORM,
    )


def test_distribute_parts_sum_to_price() -> None:
    scheme = _default_scheme()
    price = 1_000_000
    wk, bk, uk, pk = distribute_price_kopeks(price, scheme)
    assert wk + bk + uk + pk == price
    assert wk >= 0 and bk >= 0 and uk >= 0 and pk >= 0


def test_distribute_small_price() -> None:
    scheme = _default_scheme()
    wk, bk, uk, pk = distribute_price_kopeks(100, scheme)
    assert wk + bk + uk + pk == 100


def test_distribute_zero_total_weights_returns_zeros() -> None:
    scheme = BloggerFinanceScheme(
        blogger_id=uuid.uuid4(),
        weight_worker=0,
        weight_bloger=0,
        weight_upline=0,
        weight_platform=0,
    )
    wk, bk, uk, pk = distribute_price_kopeks(10_000, scheme)
    assert (wk, bk, uk, pk) == (0, 0, 0, 0)
