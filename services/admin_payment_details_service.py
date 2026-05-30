"""Сервис_Реквизитов_Администратора (Блок A).

Управляет Платёжными_Реквизитами_Администратора — singleton-записью реквизитов
приёма платежей платформы (Карта_Приёма и/или Платёжная_Ссылка). В отличие от
Карты_Выплаты (где хранится только хеш), полный номер Карты_Приёма нужно
предъявлять Плательщику, поэтому он хранится в зашифрованном виде
(``utils/card_crypto``), а для маскированного отображения и аудита — последние
4 цифры.

Порядок проверок согласован с ``services/me_service.set_me_payout_card`` и
``services/admin_user_service.admin_set_partner_card``: длина 13–19 цифр →
алгоритм Луна. Изменения фиксируются в Аудите через
``services/admin_audit_service.record_admin_audit`` — для карты записывается
ТОЛЬКО маскированное представление (last4), никогда полный PAN.
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models.admin_payment_details import AdminPaymentDetails
from models.user import User
from schemas.payment_details import AdminPaymentDetailsRead, PaymentRequisites
from services.admin_audit_service import record_admin_audit
from utils.card_crypto import CardCryptoKeyError, decrypt_pan, encrypt_pan
from utils.card_hash import luhn_ok, normalize_pan


class _UnsetType:
    """Тип-маркер «реквизит не передан в запросе» (отличает keep от clear)."""

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - диагностическое представление
        return "<UNSET>"


_UNSET = _UnsetType()


def _mask(last4: str | None) -> str | None:
    """Маскированное представление карты для Аудита (только last4)."""
    return f"****{last4}" if last4 else None


def _normalize_input(value: str | None | _UnsetType) -> str | None | _UnsetType:
    """Привести вход к None, если строка пуста/состоит из пробелов.

    Значение ``_UNSET`` (реквизит не передан) сохраняется как есть, чтобы
    отличить «не трогать» от «очистить».
    """
    if isinstance(value, _UnsetType):
        return _UNSET
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _validate_collection_card(card: str) -> tuple[str, str]:
    """Проверить Карту_Приёма и вернуть ``(нормализованный PAN, last4)``.

    Порядок проверок как у ``set_me_payout_card``/``admin_set_partner_card``:
    только цифры и длина 13–19 → алгоритм Луна. При нарушении — ``400`` (Req 2.2),
    прежняя карта остаётся нетронутой (присваивание происходит у вызывающей
    стороны только после успешной валидации).
    """
    pan = normalize_pan(card)
    if len(pan) < 13 or len(pan) > 19 or not pan.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректная длина номера Карты_Приёма (ожидается 13–19 цифр)",
        )
    if not luhn_ok(pan):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный номер Карты_Приёма",
        )
    return pan, pan[-4:]


def _validate_payment_link(link: str) -> str:
    """Проверить Платёжную_Ссылку: абсолютный HTTPS-URL длиной ≤ 2048 (Req 2.3).

    При нарушении — ``422``; прежняя ссылка остаётся нетронутой.
    """
    if len(link) > 2048:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Платёжная_Ссылка не должна превышать 2048 символов",
        )
    parsed = urlparse(link)
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Платёжная_Ссылка должна быть абсолютным URL по схеме HTTPS",
        )
    return link


def _to_masked_read(row: AdminPaymentDetails | None) -> AdminPaymentDetailsRead:
    """Собрать маскированное представление из строки реквизитов (без расшифровки)."""
    if row is None:
        return AdminPaymentDetailsRead(
            payment_link=None,
            collection_card_last4=None,
            is_active=False,
        )
    is_active = bool(row.collection_card_pan_encrypted) or bool(row.payment_link)
    return AdminPaymentDetailsRead(
        payment_link=row.payment_link,
        collection_card_last4=row.collection_card_last4,
        is_active=is_active,
    )


async def set_admin_payment_details(
    actor: User,
    *,
    collection_card: str | None | _UnsetType = _UNSET,
    payment_link: str | None | _UnsetType = _UNSET,
    db: AsyncSession,
) -> AdminPaymentDetailsRead:
    """Сохранить/заменить Платёжный_Реквизит_Администратора (Req 1.1, 1.2, 1.4, 2.x).

    Атомарно (одна транзакция, ``with_for_update`` на singleton-строке). Семантика
    «не передано / очистить / заменить» определяется через ``model_fields_set``
    схемы ``AdminPaymentDetailsSet`` на стороне роутера: поле, отсутствующее в
    ``model_fields_set``, не передаётся (остаётся ``_UNSET`` → прежнее значение
    сохраняется); переданная пустая/пробельная строка → реквизит очищается;
    переданное значение → реквизит заменяется.

    Порядок: нормализация входа → Req 1.4 (итог без активного реквизита → ``422``)
    → валидация карты (``400``) → валидация ссылки (``422``) → шифрование PAN
    (пустой ключ → ``503``) и сохранение → Аудит изменённых реквизитов (карта —
    только last4) → ``commit``. При любой ошибке выполняется полный ``rollback``,
    прежние реквизиты остаются без изменений.

    Args:
        actor: Администратор (``Admin``/``Tech_Admin``), выполняющий операцию.
        collection_card: Карта_Приёма; ``_UNSET`` — не передана (keep), пустая
            строка/``None`` — очистить, значение — заменить.
        payment_link: Платёжная_Ссылка; семантика аналогична ``collection_card``.
        db: Асинхронная сессия БД.

    Returns:
        Маскированное представление сохранённых реквизитов.

    Raises:
        HTTPException: 422 — итог без активного реквизита или невалидная ссылка;
            400 — невалидная Карта_Приёма; 503 — не задан ключ шифрования.
    """
    card_sent = not isinstance(collection_card, _UnsetType)
    link_sent = not isinstance(payment_link, _UnsetType)

    card_in = _normalize_input(collection_card)
    link_in = _normalize_input(payment_link)

    try:
        row = (
            await db.execute(select(AdminPaymentDetails).with_for_update())
        ).scalar_one_or_none()

        prior_encrypted = row.collection_card_pan_encrypted if row is not None else None
        prior_last4 = row.collection_card_last4 if row is not None else None
        prior_link = row.payment_link if row is not None else None

        # Req 1.4 — итоговое состояние должно содержать хотя бы один реквизит.
        # Резолвим присутствие карты/ссылки с учётом прежних значений: непереданный
        # реквизит сохраняет прежнее присутствие, переданный — задаёт новое.
        final_card_present = (prior_encrypted is not None) if not card_sent else (card_in is not None)
        final_link_present = (prior_link is not None) if not link_sent else (link_in is not None)
        if not final_card_present and not final_link_present:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Должен быть задан хотя бы один реквизит: Карта_Приёма или Платёжная_Ссылка",
            )

        # Валидация переданных значений ДО каких-либо изменений строки, чтобы при
        # ошибке прежние реквизиты остались нетронутыми (Req 2.2, 2.3).
        new_pan: str | None = None
        new_last4: str | None = None
        if card_sent and card_in is not None:
            new_pan, new_last4 = _validate_collection_card(card_in)

        new_link: str | None = None
        if link_sent and link_in is not None:
            new_link = _validate_payment_link(link_in)

        # Определяем фактические изменения (для Аудита) и новые значения колонок.
        card_changed = False
        link_changed = False

        if row is None:
            row = AdminPaymentDetails()
            db.add(row)

        if card_sent:
            if card_in is None:
                # Очистка карты.
                card_changed = prior_encrypted is not None or prior_last4 is not None
                row.collection_card_pan_encrypted = None
                row.collection_card_last4 = None
            else:
                # Замена карты: шифруем PAN (пустой ключ → 503), храним last4.
                try:
                    row.collection_card_pan_encrypted = encrypt_pan(
                        new_pan,  # type: ignore[arg-type]
                        settings.collection_card_enc_key,
                    )
                except CardCryptoKeyError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Сохранение Карты_Приёма отключено: не задан COLLECTION_CARD_ENC_KEY",
                    ) from exc
                row.collection_card_last4 = new_last4
                card_changed = True

        if link_sent:
            link_changed = new_link != prior_link
            row.payment_link = new_link

        row.updated_by = actor.id

        # Аудит каждого изменённого реквизита (Req 2.5, 2.6). Для карты — только
        # маскированное представление (last4), никогда полный PAN.
        if card_changed:
            await record_admin_audit(
                db,
                actor_id=actor.id,
                target_user_id=settings.platform_revenue_user_id,
                field="collection_card",
                old_value=_mask(prior_last4),
                new_value=_mask(new_last4),
            )
        if link_changed:
            await record_admin_audit(
                db,
                actor_id=actor.id,
                target_user_id=settings.platform_revenue_user_id,
                field="payment_link",
                old_value=prior_link,
                new_value=new_link,
            )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(row)
    return _to_masked_read(row)


async def get_admin_payment_details_masked(db: AsyncSession) -> AdminPaymentDetailsRead:
    """Вернуть маскированные реквизиты приёма (Req 1.3): ссылка + last4 + is_active.

    Полный PAN НЕ расшифровывается. Если запись отсутствует — пустое неактивное
    представление.
    """
    row = (await db.execute(select(AdminPaymentDetails))).scalars().first()
    return _to_masked_read(row)


async def get_active_payment_requisites_full(db: AsyncSession) -> PaymentRequisites | None:
    """Вернуть полные реквизиты приёма для предъявления Плательщику по сделке.

    Расшифровывает полный номер Карты_Приёма (если задан) и возвращает
    ``PaymentRequisites`` с ``available = (карта или ссылка) is not None``.
    Используется ``deal_to_read`` для авторизованных получателей по сделке в
    статусе ``CONFIRMED``. Если запись реквизитов отсутствует — ``None``.

    Raises:
        HTTPException: 503 — задан зашифрованный PAN, но ключ
            ``COLLECTION_CARD_ENC_KEY`` не сконфигурирован.
    """
    row = (await db.execute(select(AdminPaymentDetails))).scalars().first()
    if row is None:
        return None

    card_full: str | None = None
    if row.collection_card_pan_encrypted:
        try:
            card_full = decrypt_pan(
                row.collection_card_pan_encrypted,
                settings.collection_card_enc_key,
            )
        except CardCryptoKeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Чтение Карты_Приёма отключено: не задан COLLECTION_CARD_ENC_KEY",
            ) from exc

    available = (card_full is not None) or (row.payment_link is not None)
    return PaymentRequisites(
        collection_card_full=card_full,
        payment_link=row.payment_link,
        available=available,
    )
