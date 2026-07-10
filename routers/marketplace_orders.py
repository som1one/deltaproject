"""Роутер заказов маркетплейса блогеров.

Полный цикл: оффер (из карточки или чата) → принятие/отказ исполнителем →
оплата на счёт платформы → работа с дедлайном → сдача работы →
3 дня на приёмку заказчиком → завершение с распределением средств → отзывы.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus
from enums.user import UserRole
from models.marketplace_order import MarketplaceOrder
from models.user import User
from schemas.marketplace_orders import (
    OfferCreateRequest,
    OfferDeclineRequest,
    OrderCreateRequest,
    OrderDetailResponse,
    OrderListResponse,
    OrderResponse,
    RequestChangesRequest,
    ReviewCreateRequest,
    ReviewResponse,
    SubmitWorkRequest,
)
from schemas.settlement_account import SettlementAccountResponse
from services import (
    marketplace_order_flow_service,
    marketplace_payment_settings_service,
    marketplace_review_service,
    notification_service,
    settlement_account_service,
)
from services.marketplace_order_flow_service import OrderFlowError
from services.marketplace_review_service import ReviewError
from services.order_state_machine import transition_order

router = APIRouter(prefix="/marketplace/orders", tags=["marketplace-orders"])


async def _get_order_or_404(
    db: AsyncSession, order_id: uuid.UUID, *, for_update: bool = False
) -> MarketplaceOrder:
    query = select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
    if for_update:
        query = query.with_for_update()
    order = (await db.execute(query)).scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )
    return order


def _ensure_participant(order: MarketplaceOrder, user: User) -> None:
    if user.id not in (order.client_id, order.blogger_id) and user.role not in (
        UserRole.ADMIN,
        UserRole.TECH_ADMIN,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому заказу",
        )


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Создать заказ из карточки автора (только роль Client).

    Заказ создаётся как оффер (OFFER_PENDING): автор видит услугу, цену,
    сроки и ТЗ в чате и решает — принять или отказать. До принятия чат
    остаётся открытым для вопросов.
    """
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только заказчики могут создавать заказы",
        )

    try:
        order = await marketplace_order_flow_service.create_offer(
            db,
            sender=user,
            client_id=user.id,
            blogger_id=body.blogger_id,
            message=body.message,
            amount_kopeks=body.amount_kopeks,
            service_type_id=body.service_type_id,
            deadline_days=body.deadline_days,
            publish_at=body.publish_at,
        )
    except OrderFlowError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.post("/offer", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_offer_from_chat(
    body: OfferCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Предложить услугу из чата — доступно и заказчику, и автору.

    Стороны определяются ролями: клиент всегда платит, автор всегда
    исполняет. В чат добавляется карточка-оффер с кнопками принятия.
    """
    if user.role not in (UserRole.CLIENT, UserRole.BLOGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Офферы доступны только заказчикам и авторам",
        )

    counterpart = (
        await db.execute(select(User).where(User.id == body.counterpart_id))
    ).scalar_one_or_none()
    if counterpart is None or not counterpart.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Собеседник не найден"
        )

    if user.role == UserRole.CLIENT:
        if counterpart.role != UserRole.BLOGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Предложить услугу можно только автору",
            )
        client_id, blogger_id = user.id, counterpart.id
    else:
        if counterpart.role != UserRole.CLIENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Автор может предложить услугу только заказчику",
            )
        client_id, blogger_id = counterpart.id, user.id

    try:
        order = await marketplace_order_flow_service.create_offer(
            db,
            sender=user,
            client_id=client_id,
            blogger_id=blogger_id,
            message=body.message,
            amount_kopeks=body.amount_kopeks,
            service_type_id=body.service_type_id,
            deadline_days=body.deadline_days,
            publish_at=body.publish_at,
        )
    except OrderFlowError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.get("", response_model=OrderListResponse)
async def list_orders(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=20, ge=1, le=50, description="Размер страницы"),
) -> OrderListResponse:
    """Список заказов текущего пользователя.

    Client видит свои заказы, Blogger видит назначенные ему заказы.
    """
    if user.role == UserRole.CLIENT:
        filter_condition = MarketplaceOrder.client_id == user.id
    elif user.role == UserRole.BLOGER:
        filter_condition = MarketplaceOrder.blogger_id == user.id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только клиентам и блогерам",
        )

    count_query = select(func.count()).select_from(
        select(MarketplaceOrder).where(filter_condition).subquery()
    )
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * page_size
    items_query = (
        select(MarketplaceOrder)
        .where(filter_condition)
        .order_by(MarketplaceOrder.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    orders = (await db.execute(items_query)).scalars().all()

    # Имена сторон одним запросом
    user_ids = {o.client_id for o in orders} | {o.blogger_id for o in orders}
    names: dict[uuid.UUID, str] = {}
    if user_ids:
        names_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        names = {row.id: row.name for row in names_result.all()}

    items: list[OrderResponse] = []
    for o in orders:
        item = OrderResponse.model_validate(o)
        item.blogger_name = names.get(o.blogger_id)
        item.client_name = names.get(o.client_id)
        items.append(item)

    return OrderListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


def _available_actions(order: MarketplaceOrder, user: User) -> list[str]:
    """Кнопки, доступные пользователю в текущем статусе заказа."""
    actions: list[str] = []
    is_admin = user.role in (UserRole.ADMIN, UserRole.TECH_ADMIN)
    is_client = user.id == order.client_id
    is_blogger = user.id == order.blogger_id
    order_status = order.status

    if order_status == MarketplaceOrderStatus.OFFER_PENDING.value:
        acceptor = marketplace_order_flow_service.acceptor_id(order)
        if user.id == acceptor:
            actions.extend(["accept_offer", "decline_offer"])
        elif user.id == order.offered_by:
            actions.append("cancel")

    if order_status == MarketplaceOrderStatus.PENDING_PAYMENT.value:
        if is_admin:
            actions.append("confirm_payment")
        if is_client:
            actions.append("cancel")
            if order.payment_reported_at is None:
                actions.append("mark_paid")

    if order_status == MarketplaceOrderStatus.ESCROW_HELD.value:
        if is_blogger:
            actions.append("submit_work")
        if is_admin:
            actions.append("refund")

    if order_status == MarketplaceOrderStatus.BLOGGER_CONFIRMED.value:
        if is_client:
            actions.extend(["confirm", "request_changes"])
        if is_admin:
            actions.append("refund")

    return actions


@router.get("/{order_id}", response_model=OrderDetailResponse)
async def get_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderDetailResponse:
    """Детали заказа с проверкой доступа.

    Доступно клиенту-владельцу заказа, назначенному блогеру или Admin.
    Возвращает реквизиты оплаты (только PENDING_PAYMENT), available_actions
    и отзывы: свой и полученный (текст отзыва видит только адресат).
    """
    order = await _get_order_or_404(db, order_id)
    _ensure_participant(order, user)

    is_admin = user.role in (UserRole.ADMIN, UserRole.TECH_ADMIN)
    is_client = user.id == order.client_id

    # Реквизиты оплаты — только в ожидании оплаты и только клиенту/админу
    sa_response: SettlementAccountResponse | None = None
    card_requisites = None
    yookassa_available = False
    if order.status == MarketplaceOrderStatus.PENDING_PAYMENT.value and (
        is_client or is_admin
    ):
        account = await settlement_account_service.get_settlement_account(db)
        if account is not None:
            sa_response = SettlementAccountResponse.model_validate(account)
        payment_settings = await marketplace_payment_settings_service.get_payment_settings(db)
        card_requisites = marketplace_payment_settings_service.to_card_requisites(payment_settings)
        creds = marketplace_payment_settings_service.effective_yookassa_from_row(payment_settings)
        yookassa_available = creds.active

    names_result = await db.execute(
        select(User.id, User.name).where(
            User.id.in_([order.client_id, order.blogger_id])
        )
    )
    names = {row.id: row.name for row in names_result.all()}

    # Отзывы: свой (my_review) и адресованный мне (review_of_me)
    my_review = None
    review_of_me = None
    can_review = False
    if order.status == MarketplaceOrderStatus.COMPLETED.value:
        reviews = await marketplace_review_service.reviews_for_order(
            db, order_id=order.id
        )
        for review in reviews:
            if review.author_id == user.id:
                my_review = ReviewResponse.model_validate(review)
            if review.target_id == user.id:
                review_of_me = ReviewResponse.model_validate(review)
        can_review = my_review is None and user.id in (
            order.client_id,
            order.blogger_id,
        )

    available_actions = _available_actions(order, user)
    if can_review:
        available_actions.append("review")

    response = OrderDetailResponse.model_validate(order)
    response.settlement_account = sa_response
    response.card_requisites = card_requisites
    response.yookassa_available = yookassa_available
    response.blogger_name = names.get(order.blogger_id)
    response.client_name = names.get(order.client_id)
    response.available_actions = available_actions
    response.my_review = my_review
    response.review_of_me = review_of_me

    return response


@router.patch("/{order_id}/accept", response_model=OrderResponse)
async def accept_offer(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Принять оффер: OFFER_PENDING → PENDING_PAYMENT.

    Принять может только получатель предложения (автор — если предложил
    заказчик, и наоборот). С момента принятия фиксируются сроки.
    """
    order = await _get_order_or_404(db, order_id, for_update=True)
    _ensure_participant(order, user)

    try:
        order = await marketplace_order_flow_service.accept_offer(db, order, user)
    except OrderFlowError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/decline", response_model=OrderResponse)
async def decline_offer(
    order_id: uuid.UUID,
    body: OfferDeclineRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Отклонить оффер: OFFER_PENDING → OFFER_DECLINED (терминальный)."""
    order = await _get_order_or_404(db, order_id, for_update=True)
    _ensure_participant(order, user)

    try:
        order = await marketplace_order_flow_service.decline_offer(
            db, order, user, body.reason
        )
    except OrderFlowError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/mark-paid", response_model=OrderResponse)
async def mark_order_paid(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Клиент сообщает, что перевёл оплату по реквизитам.

    Статус не меняется (остаётся PENDING_PAYMENT) — устанавливается
    payment_reported_at и уведомляются администраторы, которые должны
    проверить поступление и подтвердить оплату вручную.
    """
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут сообщать об оплате",
        )

    order = await _get_order_or_404(db, order_id, for_update=True)

    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сообщить об оплате можно только для заказа, ожидающего оплату",
        )

    if order.payment_reported_at is None:
        order.payment_reported_at = datetime.now(timezone.utc)

        admins_result = await db.execute(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        for (admin_id,) in admins_result.all():
            await notification_service.notify(
                db=db,
                user_id=admin_id,
                event_type="order_payment_reported",
                payload={
                    "order_id": str(order.id),
                    "amount": order.amount_kopeks,
                    "client_name": user.name,
                },
            )

        await db.commit()
        await db.refresh(order)

    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/submit-work", response_model=OrderResponse)
async def submit_work(
    order_id: uuid.UUID,
    body: SubmitWorkRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Блогер сдаёт работу: ESCROW_HELD → BLOGGER_CONFIRMED.

    Обязательна ссылка на публикацию или комментарий. У заказчика
    появляется 3 дня на приёмку; после — авто-подтверждение.
    """
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Сдать работу может только автор",
        )

    order = await _get_order_or_404(db, order_id, for_update=True)

    if order.blogger_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь исполнителем этого заказа",
        )

    order = await marketplace_order_flow_service.submit_work(
        db, order, user, body.result
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/request-changes", response_model=OrderResponse)
async def request_changes(
    order_id: uuid.UUID,
    body: RequestChangesRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Заказчик возвращает работу на доработку с обязательной причиной.

    BLOGGER_CONFIRMED → ESCROW_HELD. Просто так отменить оплаченный заказ
    заказчик не может — деньги остаются на счёте платформы, спорные
    ситуации решает поддержка.
    """
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вернуть работу на доработку может только заказчик",
        )

    order = await _get_order_or_404(db, order_id, for_update=True)

    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    order = await marketplace_order_flow_service.request_changes(
        db, order, user, body.reason
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/confirm", response_model=OrderResponse)
async def confirm_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Клиент подтверждает приёмку работы.

    Переход: BLOGGER_CONFIRMED → COMPLETED.
    После подтверждения вызывается distribute_funds: доли блогера,
    платформы и воркера (если заказчика привёл воркер) зачисляются
    на балансы, отправляются уведомления.
    """
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут подтверждать получение",
        )

    order = await _get_order_or_404(db, order_id, for_update=True)

    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    order = await transition_order(
        db, order, MarketplaceOrderStatus.COMPLETED, user.id
    )
    order.completed_at = datetime.now(timezone.utc)

    from services import marketplace_escrow_service

    await marketplace_escrow_service.distribute_funds(
        order_id=order.id,
        db=db,
    )

    await notification_service.notify(
        db=db,
        user_id=order.blogger_id,
        event_type="order_completed",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "client_name": user.name,
        },
    )

    if order.worker_id is not None:
        await notification_service.notify(
            db=db,
            user_id=order.worker_id,
            event_type="order_completed_worker_commission",
            payload={
                "order_id": str(order.id),
                "amount": order.amount_kopeks,
                "client_name": user.name,
            },
        )

    await marketplace_order_flow_service.send_system_message(
        db,
        order=order,
        actor_id=user.id,
        text="Работа принята — сделка завершена. Спасибо! Не забудьте оставить отзыв.",
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Отмена до оплаты.

    OFFER_PENDING → CANCELLED (инициатором оффера) или
    PENDING_PAYMENT → CANCELLED (клиентом). Оплаченный заказ отменить
    нельзя — только возврат через поддержку.
    """
    order = await _get_order_or_404(db, order_id, for_update=True)
    _ensure_participant(order, user)

    if order.status == MarketplaceOrderStatus.OFFER_PENDING.value:
        if user.id != order.offered_by:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Отозвать предложение может только его автор",
            )
    elif order.status == MarketplaceOrderStatus.PENDING_PAYMENT.value:
        if user.id != order.client_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Отменить заказ может только заказчик",
            )
    # Прочие статусы отклонит стейт-машина
    was_offer = order.status == MarketplaceOrderStatus.OFFER_PENDING.value

    order = await transition_order(
        db, order, MarketplaceOrderStatus.CANCELLED, user.id
    )

    # Контрагент видит отмену в чате — offer-карточка обновит статус
    await marketplace_order_flow_service.send_system_message(
        db,
        order=order,
        actor_id=user.id,
        text="Предложение отозвано." if was_offer else "Заказ отменён.",
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.post(
    "/{order_id}/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    order_id: uuid.UUID,
    body: ReviewCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    """Оставить отзыв по завершённой сделке.

    Текст отзыва увидит только адресат; звёзды идут в публичный рейтинг.
    """
    order = await _get_order_or_404(db, order_id)
    _ensure_participant(order, user)

    try:
        review = await marketplace_review_service.create_review(
            db,
            order=order,
            author_id=user.id,
            rating=body.rating,
            text=body.text,
        )
    except ReviewError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await notification_service.notify(
        db=db,
        user_id=review.target_id,
        event_type="review_received",
        payload={"order_id": str(order.id), "rating": body.rating},
    )

    await db.commit()
    await db.refresh(review)
    return ReviewResponse.model_validate(review)
