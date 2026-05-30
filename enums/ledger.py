import enum


class LedgerEntryStatus(str, enum.Enum):
    """Статус строки журнала (значения совпадают с PostgreSQL enum ledger_entry_status)."""

    PAYOUT_REQUEST = "payout_request"
    FREEZE = "freeze"
    PENDING_CONFIRMATION = "pending_confirmation"
    COMPLETED = "completed"
    REJECTED = "rejected"
    ESCROW_HELD = "escrow_held"  # активное удержание собранных платформой средств
    ESCROW_RELEASED = "escrow_released"  # удержание распределено участникам
    ESCROW_REFUNDED = "escrow_refunded"  # удержание возвращено до распределения
