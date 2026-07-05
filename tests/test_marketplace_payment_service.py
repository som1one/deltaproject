"""Unit tests for marketplace payment service."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.marketplace_payment_service import (
    PAYMENT_EXPIRATION_MINUTES,
    PaymentResult,
    PaymentService,
    PaymentServiceError,
    PayoutResult,
    _get_auth_header,
    _kopeks_to_amount_str,
)


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
