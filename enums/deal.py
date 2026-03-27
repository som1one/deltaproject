import enum


class DealStatus(str, enum.Enum):
    AGREE = "AGREE"
    PAID = "PAID"
    CLOSE = "CLOSE"
