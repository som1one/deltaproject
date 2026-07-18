"""Unit tests for marketplace payment service."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from enums.marketplace import MarketplaceOrderStatus
from services.marketplace_payment_service import (
    PAYMENT_EXPIRATION_MINUTES,
    PaymentResult,
    PaymentService,
    PaymentServiceError,
    PayoutResult,
    _get_auth_header,
    _kopeks_to_amount_str,
)


def _pending_order_db(order_status: str = MarketplaceOrderStatus.PENDING_PAYMENT.value):
    """AsyncMock БД, где select возвращает заказ в нужном статусе."""
    order = MagicMock()
    order.status = order_status
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = order
    db.execute.return_value = result
    return db


class _FakeResponse:
    is_success = True
    status_code = 200
    reason_phrase = "OK"
    text = ""

    @staticmethod
    def json() -> dict:
        return {"id": "pay_1", "confirmation": {"confirmation_url": "https://pay.example"}}


def _capturing_client(captured: dict):
    """httpx.AsyncClient-заглушка, кладущая тело POST в captured['payload']."""

    class _Client:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a) -> bool:
            return False

        async def post(self, url, json=None, headers=None):
            captured["payload"] = json
            return _FakeResponse()

    return _Client


# ------------------------------------------------------------------
# Helper function tests
# ------------------------------------------------------------------


class TestKopeksToAmountStr:
    """Tests for _kopeks_to_amount_str conversion."""

    def test_basic_conversion(self) -> None:
        assert _kopeks_to_amount_str(10050) == "100.50"

    def test_whole_rubles(self) -> None:
        assert _kopeks_to_amount_str(10000) == "100.00"

    def test_one_kopek(self) -> None:
        assert _kopeks_to_amount_str(1) == "0.01"

    def test_one_ruble(self) -> None:
        assert _kopeks_to_amount_str(100) == "1.00"

    def test_large_amount(self) -> None:
        assert _kopeks_to_amount_str(100_000_000) == "1000000.00"

    def test_zero(self) -> None:
        assert _kopeks_to_amount_str(0) == "0.00"


class TestGetAuthHeader:
    """Tests for _get_auth_header."""

    def test_returns_basic_auth(self) -> None:
        header = _get_auth_header("shop_123", "secret_456")
        assert header.startswith("Basic ")
        # Decode and verify
        import base64

        decoded = base64.b64decode(header.split(" ")[1]).decode()
        assert decoded == "shop_123:secret_456"

    def test_strips_whitespace(self) -> None:
        import base64

        header = _get_auth_header("  shop_123 ", " secret_456\n")
        decoded = base64.b64decode(header.split(" ")[1]).decode()
        assert decoded == "shop_123:secret_456"


# ------------------------------------------------------------------
# Payment webhook handling tests
# ------------------------------------------------------------------


class TestHandlePaymentWebhook:
    """Tests for PaymentService.handle_payment_webhook."""

    @pytest.mark.asyncio
    async def test_ignores_non_marketplace_payment(self) -> None:
        """Webhook with non-marketplace metadata type is ignored."""
        db = AsyncMock()
        event = {
            "event": "payment.succeeded",
            "object": {
                "id": "pay_123",
                "metadata": {"order_id": str(uuid.uuid4()), "type": "other"},
            },
        }
        await PaymentService.handle_payment_webhook(event, db=db)
        # No DB queries should be made for non-marketplace events
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_missing_object(self) -> None:
        """Webhook without object field is ignored."""
        db = AsyncMock()
        event = {"event": "payment.succeeded"}
        await PaymentService.handle_payment_webhook(event, db=db)
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_missing_payment_id(self) -> None:
        """Webhook without payment id is ignored."""
        db = AsyncMock()
        event = {
            "event": "payment.succeeded",
            "object": {"metadata": {"order_id": str(uuid.uuid4()), "type": "marketplace"}},
        }
        await PaymentService.handle_payment_webhook(event, db=db)
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_missing_order_id_in_metadata(self) -> None:
        """Webhook without order_id in metadata is ignored after DB lookup."""
        db = AsyncMock()
        event = {
            "event": "payment.succeeded",
            "object": {
                "id": "pay_123",
                "metadata": {"type": "marketplace"},
            },
        }
        await PaymentService.handle_payment_webhook(event, db=db)
        # Should not query DB since order_id is missing
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_succeeded_notifies_blogger(self) -> None:
        """payment.succeeded: блогер получает order_confirmed (как при админ-подтверждении)."""
        order = _pending_order()
        order.client_id = uuid.uuid4()
        order.blogger_id = uuid.uuid4()
        order.amount_kopeks = 500000

        client_user = MagicMock()
        client_user.name = "Клиент"
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = client_user
        db.execute.return_value = result

        notify = AsyncMock()
        with patch(
            "services.marketplace_escrow_service.freeze_funds", AsyncMock()
        ), patch("services.notification_service.notify", notify):
            await PaymentService._handle_payment_succeeded(order, "pay_1", db=db)

        notify.assert_awaited_once()
        kwargs = notify.await_args.kwargs
        assert kwargs["user_id"] == order.blogger_id
        assert kwargs["event_type"] == "order_confirmed"
        assert kwargs["payload"]["client_name"] == "Клиент"

    @pytest.mark.asyncio
    async def test_succeeded_skips_processed_order(self) -> None:
        """Идемпотентность: заказ уже не в PENDING_PAYMENT — ничего не делаем."""
        order = _pending_order()
        order.status = MarketplaceOrderStatus.ESCROW_HELD.value
        db = AsyncMock()

        notify = AsyncMock()
        with patch("services.notification_service.notify", notify):
            await PaymentService._handle_payment_succeeded(order, "pay_1", db=db)

        notify.assert_not_awaited()
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_invalid_order_id(self) -> None:
        """Webhook with invalid UUID order_id is ignored."""
        db = AsyncMock()
        event = {
            "event": "payment.succeeded",
            "object": {
                "id": "pay_123",
                "metadata": {"order_id": "not-a-uuid", "type": "marketplace"},
            },
        }
        await PaymentService.handle_payment_webhook(event, db=db)
        db.execute.assert_not_called()


# ------------------------------------------------------------------
# Payout webhook handling tests
# ------------------------------------------------------------------


class TestHandlePaoutWebhook:
    """Tests for PaymentService.handle_payout_webhook."""

    @pytest.mark.asyncio
    async def test_ignores_non_marketplace_payout(self) -> None:
        """Webhook with non-marketplace_withdrawal type is ignored."""
        db = AsyncMock()
        event = {
            "event": "payout.succeeded",
            "object": {
                "id": "po_123",
                "metadata": {"type": "other"},
            },
        }
        await PaymentService.handle_payout_webhook(event, db=db)
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_missing_object(self) -> None:
        """Webhook without object field is ignored."""
        db = AsyncMock()
        event = {"event": "payout.succeeded"}
        await PaymentService.handle_payout_webhook(event, db=db)
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_missing_payout_id(self) -> None:
        """Webhook without payout id is ignored."""
        db = AsyncMock()
        event = {
            "event": "payout.succeeded",
            "object": {"metadata": {"type": "marketplace_withdrawal"}},
        }
        await PaymentService.handle_payout_webhook(event, db=db)
        db.execute.assert_not_called()


# ------------------------------------------------------------------
# Payment creation: фискальный чек 54-ФЗ (Receipt)
# ------------------------------------------------------------------


class TestCreatePaymentReceipt:
    """create_payment должен слать receipt — иначе ЮKassa отвечает
    'Receipt is missing or illegal'."""

    @pytest.mark.asyncio
    async def test_payload_includes_receipt(self) -> None:
        db = _pending_order_db()
        creds = MagicMock(active=True, shop_id="shop", secret_key="secret")
        captured: dict = {}

        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=creds),
        ), patch(
            "services.marketplace_payment_service.httpx.AsyncClient",
            _capturing_client(captured),
        ):
            res = await PaymentService.create_payment(
                order_id=uuid.uuid4(),
                amount_kopeks=148_800,
                return_url="https://return.example",
                customer_email="client@example.com",
                db=db,
            )

        assert isinstance(res, PaymentResult)
        payload = captured["payload"]
        receipt = payload["receipt"]
        assert receipt["customer"]["email"] == "client@example.com"
        assert len(receipt["items"]) == 1
        item = receipt["items"][0]
        assert item["amount"] == {"value": "1488.00", "currency": "RUB"}
        assert item["vat_code"] == 1  # settings default: без НДС
        assert item["payment_subject"] == "service"
        # Сумма чека совпадает с суммой платежа
        assert payload["amount"]["value"] == "1488.00"

    @pytest.mark.asyncio
    async def test_missing_email_raises(self) -> None:
        db = _pending_order_db()
        creds = MagicMock(active=True, shop_id="shop", secret_key="secret")

        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=creds),
        ):
            with pytest.raises(PaymentServiceError):
                await PaymentService.create_payment(
                    order_id=uuid.uuid4(),
                    amount_kopeks=1000,
                    return_url="https://return.example",
                    customer_email="   ",
                    db=db,
                )


# ------------------------------------------------------------------
# Payment status sync (fallback, если вебхук не дошёл)
# ------------------------------------------------------------------


def _get_client(status_value: str | Exception):
    """httpx.AsyncClient-заглушка для GET /v3/payments/{id}."""

    class _Resp:
        is_success = True
        status_code = 200

        @staticmethod
        def json() -> dict:
            return {"id": "pay_1", "status": status_value}

    class _Client:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a) -> bool:
            return False

        async def get(self, url, headers=None):
            if isinstance(status_value, Exception):
                raise status_value
            return _Resp()

    return _Client


def _pending_order(payment_id: str | None = "pay_1") -> MagicMock:
    order = MagicMock()
    order.id = uuid.uuid4()
    order.status = MarketplaceOrderStatus.PENDING_PAYMENT.value
    order.yookassa_payment_id = payment_id
    return order


class TestSyncPaymentStatus:
    """Tests for PaymentService.sync_payment_status."""

    def _creds(self, active: bool = True) -> MagicMock:
        return MagicMock(active=active, shop_id="shop", secret_key="secret")

    @pytest.mark.asyncio
    async def test_skips_when_not_pending_payment(self) -> None:
        order = _pending_order()
        order.status = MarketplaceOrderStatus.ESCROW_HELD.value
        changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is False

    @pytest.mark.asyncio
    async def test_skips_without_payment_id(self) -> None:
        order = _pending_order(payment_id=None)
        changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is False

    @pytest.mark.asyncio
    async def test_skips_when_yookassa_inactive(self) -> None:
        order = _pending_order()
        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=self._creds(active=False)),
        ):
            changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is False

    @pytest.mark.asyncio
    async def test_succeeded_dispatches_transition(self) -> None:
        order = _pending_order()
        succeeded = AsyncMock()
        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=self._creds()),
        ), patch(
            "services.marketplace_payment_service.httpx.AsyncClient",
            _get_client("succeeded"),
        ), patch.object(PaymentService, "_handle_payment_succeeded", succeeded):
            changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is True
        succeeded.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_canceled_dispatches_transition(self) -> None:
        order = _pending_order()
        canceled = AsyncMock()
        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=self._creds()),
        ), patch(
            "services.marketplace_payment_service.httpx.AsyncClient",
            _get_client("canceled"),
        ), patch.object(PaymentService, "_handle_payment_canceled", canceled):
            changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is True
        canceled.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_pending_returns_false(self) -> None:
        order = _pending_order()
        succeeded = AsyncMock()
        canceled = AsyncMock()
        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=self._creds()),
        ), patch(
            "services.marketplace_payment_service.httpx.AsyncClient",
            _get_client("pending"),
        ), patch.object(
            PaymentService, "_handle_payment_succeeded", succeeded
        ), patch.object(PaymentService, "_handle_payment_canceled", canceled):
            changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is False
        succeeded.assert_not_awaited()
        canceled.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_network_error_returns_false(self) -> None:
        order = _pending_order()
        with patch(
            "services.marketplace_payment_service._effective_credentials",
            AsyncMock(return_value=self._creds()),
        ), patch(
            "services.marketplace_payment_service.httpx.AsyncClient",
            _get_client(RuntimeError("boom")),
        ):
            changed = await PaymentService.sync_payment_status(order, db=AsyncMock())
        assert changed is False
