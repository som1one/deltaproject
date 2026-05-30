import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.admin_audit_log import AdminAuditLog


async def record_admin_audit(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    target_user_id: uuid.UUID,
    field: str,
    old_value: str | None,
    new_value: str | None,
) -> AdminAuditLog:
    """Записать административное действие в журнал аудита `admin_audit_logs`.

    Создаёт запись `AdminAuditLog` (actor_id, target_user_id, field, old_value,
    new_value, created_at) и делает `flush`, НЕ выполняя `commit`: коммит остаётся
    за транзакцией вызывающей стороны (паттерн как у `deal_service`, добавляющего
    записи журнала без коммита внутри хелперов). Это позволяет атомарно связать
    запись аудита с породившей её операцией (например, корректировкой баланса или
    изменением процента/карты партнёра) — при откате транзакции аудит откатывается
    вместе с ней.

    ВАЖНО: вызывающая сторона обязана передавать уже маскированные значения. Для
    платёжной карты в `old_value`/`new_value` следует записывать только маскированное
    представление (например, последние 4 цифры — `last4`), и НИКОГДА полный номер
    карты (PAN). Сервис аудита не выполняет маскирование самостоятельно и сохраняет
    значения как есть.

    Args:
        db: Асинхронная сессия БД.
        actor_id: Идентификатор администратора, выполнившего операцию.
        target_user_id: Идентификатор пользователя, над которым выполнена операция.
        field: Наименование изменённого поля (например, `percent`, `payout_card`,
            `balance_adjustment`).
        old_value: Прежнее значение поля в строковом (маскированном) виде или `None`.
        new_value: Новое значение поля в строковом (маскированном) виде или `None`.

    Returns:
        Созданная и сохранённая (flush) запись `AdminAuditLog`.
    """
    entry = AdminAuditLog(
        actor_id=actor_id,
        target_user_id=target_user_id,
        field=field,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(entry)
    await db.flush()
    return entry


async def list_admin_audit(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditLog], int]:
    """Вернуть историю аудита по пользователю, упорядоченную по убыванию времени.

    Используется для эндпоинта `GET /admin/users/{id}/audit`: возвращает страницу
    записей `AdminAuditLog` для указанного `target_user_id`, отсортированных по
    `created_at` по убыванию (сначала самые свежие), вместе с общим числом записей.

    Args:
        db: Асинхронная сессия БД.
        target_user_id: Идентификатор пользователя, чью историю нужно получить.
        limit: Максимальное число возвращаемых записей.
        offset: Смещение для постраничной выборки.

    Returns:
        Кортеж `(rows, total)`, где `rows` — список записей текущей страницы, а
        `total` — общее число записей аудита для пользователя.
    """
    count_stmt = select(func.count(AdminAuditLog.id)).where(
        AdminAuditLog.target_user_id == target_user_id,
    )
    total = int((await db.execute(count_stmt)).scalar_one())

    stmt = (
        select(AdminAuditLog)
        .where(AdminAuditLog.target_user_id == target_user_id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total
