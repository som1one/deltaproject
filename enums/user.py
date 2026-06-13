import enum

class UserRole(str, enum.Enum):
    """Роли из ТЗ: Worker, Bloger, Admin, Tech_Admin, Client.

    Tech_Admin — расширенная административная роль с правами уровня Admin,
    за исключением управления другими административными учётными записями.
    Client — покупатель рекламы на маркетплейсе блогеров.
    """

    WORKER = "Worker"
    BLOGER = "Bloger"
    ADMIN = "Admin"
    TECH_ADMIN = "Tech_Admin"
    CLIENT = "Client"