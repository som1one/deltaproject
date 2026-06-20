"""Unit-тесты сервисного слоя: messages, notifications, worker dashboard.

Тестирует валидационную логику MessageService, поведение NotificationService
при пограничных случаях и конструирование Pydantic-схем кабинета воркера.

Requirements: 8.2, 8.3, 8.5, 12.1, 12.2, 12.3, 14.5
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from schemas.marketplace_messages import MessageSendRequest
from schemas.worker_dashboard import (
    CommissionEntry,
    ReferralInfo,
    WorkerMarketplaceStats,
)


# ---------------------------------------------------------------------------
# 1. MessageService tests — валидация текста
# ---------------------------------------------------------------------------


class TestMessageServiceValidation:
    """Тесты валидации send_message в MessageService.

    Validates: Requirements 8.2, 8.3 (отправка/получение сообщений)
    """

    @pytest.fixture
    def sender_id(self) -> uuid.UUID:
        return uuid.uuid4()

    @pytest.fixture
    def recipient_id(self) -> uuid.UUID:
        return uuid.uuid4()

    @pytest.mark.asyncio
    async def test_send_message_rejects_empty_text(
        self, sender_id: uuid.UUID, recipient_id: uuid.UUID
    ) -> None:
        """send_message отклоняет пустой текст (ValueError)."""
        from services.marketplace_message_service import send_message

        db = AsyncMock()
        with pytest.raises(ValueError, match="пустым"):
            await send_message(db, sender_id, recipient_id, "")

    @pytest.mark.asyncio
    async def test_send_message_rejects_whitespace_only_text(
        self, sender_id: uuid.UUID, recipient_id: uuid.UUID
    ) -> None:
        """send_message отклоняет текст, состоящий только из пробелов (ValueError)."""
        from services.marketplace_message_service import send_message

        db = AsyncMock()
        with pytest.raises(ValueError, match="пустым|пробелов"):
            await send_message(db, sender_id, recipient_id, "   \t\n  ")

    @pytest.mark.asyncio
    async def test_send_message_rejects_text_over_2000_chars(
        self, sender_id: uuid.UUID, recipient_id: uuid.UUID
    ) -> None:
        """send_message отклоняет текст длиннее 2000 символов (ValueError)."""
        from services.marketplace_message_service import send_message

        db = AsyncMock()
        long_text = "a" * 2001
        with pytest.raises(ValueError, match="2000"):
            await send_message(db, sender_id, recipient_id, long_text)


# ---------------------------------------------------------------------------
# 2. NotificationService tests — логика пагинации и mark_as_read
# ---------------------------------------------------------------------------


class TestNotificationServiceLogic:
    """Тесты логики NotificationService.

    Validates: Requirements 14.5 (in-app уведомления)
    """

    @pytest.mark.asyncio
    async def test_mark_as_read_with_empty_list_returns_zero(self) -> None:
        """mark_as_read с пустым списком ID возвращает 0 без обращения к БД."""
        from services.notification_service import mark_as_read

        db = AsyncMock()
        user_id = uuid.uuid4()

        result = await mark_as_read(db, user_id, [])

        assert result == 0
        # Не должно быть вызовов execute — пустой список сразу возвращает 0
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_notifications_accepts_page_params(self) -> None:
        """get_notifications принимает page и page_size и выполняет запрос."""
        from services.notification_service import get_notifications

        user_id = uuid.uuid4()

        # Мокаем db.execute для count и основного запроса
        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_rows_result = MagicMock()
        mock_rows_result.scalars.return_value.all.return_value = []

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[mock_count_result, mock_rows_result]
        )

        items, total = await get_notifications(db, user_id, page=2, page_size=10)

        assert items == []
        assert total == 0
        assert db.execute.call_count == 2


# ---------------------------------------------------------------------------
# 3. WorkerDashboard — конструирование Pydantic-схем
# ---------------------------------------------------------------------------


class TestWorkerDashboardSchemas:
    """Тесты конструирования схем кабинета воркера.

    Validates: Requirements 12.1, 12.2, 12.3
    """

    def test_referral_info_construction(self) -> None:
        """ReferralInfo конструируется с валидными данными."""
        info = ReferralInfo(
            client_id=uuid.uuid4(),
            client_name="Иванов Иван",
            registered_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
        )
        assert info.client_name == "Иванов Иван"
        assert isinstance(info.client_id, uuid.UUID)
        assert info.registered_at.year == 2024

    def test_commission_entry_construction(self) -> None:
        """CommissionEntry конструируется с валидными данными."""
        entry = CommissionEntry(
            order_id=uuid.uuid4(),
            client_name="Петров Пётр",
            order_amount_kopeks=500_000,
            commission_pct=5.0,
            commission_amount_kopeks=25_000,
            date=datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        assert entry.order_amount_kopeks == 500_000
        assert entry.commission_pct == 5.0
        assert entry.commission_amount_kopeks == 25_000
        assert entry.client_name == "Петров Пётр"

    def test_worker_marketplace_stats_construction(self) -> None:
        """WorkerMarketplaceStats конструируется с валидными данными."""
        stats = WorkerMarketplaceStats(
            total_earnings_kopeks=1_250_000,
            balance_kopeks=750_000,
            referral_count=12,
        )
        assert stats.total_earnings_kopeks == 1_250_000
        assert stats.balance_kopeks == 750_000
        assert stats.referral_count == 12

    def test_worker_marketplace_stats_zero_values(self) -> None:
        """WorkerMarketplaceStats с нулевыми значениями (новый воркер без рефералов)."""
        stats = WorkerMarketplaceStats(
            total_earnings_kopeks=0,
            balance_kopeks=0,
            referral_count=0,
        )
        assert stats.total_earnings_kopeks == 0
        assert stats.balance_kopeks == 0
        assert stats.referral_count == 0
