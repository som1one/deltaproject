import enum


class LedgerEntryStatus(str, enum.Enum):
    """Статус строки журнала (значения совпадают с PostgreSQL enum ledger_entry_status)."""

    PAYOUT_REQUEST = "payout_request"
    FREEZE = "freeze"
    PENDING_CONFIRMATION = "pending_confirmation"
    COMPLETED = "completed"
    REJECTED = "rejected"
