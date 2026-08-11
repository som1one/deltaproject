"""Админское управление ботом воркеров: настройки, ростер, рассылки.

Тот же контур, что и команды бота (`/roster`, `/push`), но из веб-админки:
бот удобен, когда вы в телефоне, админка — когда нужен обзор и правка
текстов. Источник данных общий — services/worker_nudge_service.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from models.user import User
from models.worker_nudge_log import WorkerNudgeLog
from schemas.worker_bot import (
    BroadcastPreview,
    BroadcastRequest,
    BroadcastResult,
    NudgeLogItem,
    NudgeLogResponse,
    NudgeRuleRead,
    NudgeRuleUpdate,
    RosterItem,
    SegmentRead,
    WorkerBotOverview,
    WorkerBotSettingsRead,
    WorkerBotSettingsUpdate,
)
from services import worker_nudge_service

router = APIRouter(prefix="/admin/worker-bot", tags=["admin-worker-bot"])

# Заголовки триггеров берём из кодовых дефолтов — в БД лежит только то,
# что админ реально может менять.
_NUDGE_TITLES = {nudge.key: nudge.title for nudge in worker_nudge_service.AUTO_NUDGES}


def _rule_to_read(rule) -> NudgeRuleRead:
    return NudgeRuleRead(
        kind=rule.kind,
        title=_NUDGE_TITLES.get(rule.kind, rule.kind),
        is_enabled=rule.is_enabled,
        cooldown_days=rule.cooldown_days,
        threshold_days=rule.threshold_days,
        text_template=rule.text_template,
        updated_at=getattr(rule, "updated_at", None),
    )


@router.get("/overview", response_model=WorkerBotOverview)
async def get_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> WorkerBotOverview:
    """Сводка: настройки, размеры сегментов и полный ростер воркеров."""
    settings_row = await worker_nudge_service.get_bot_settings(db)
    await db.commit()

    rows = await worker_nudge_service.collect_worker_rows(db)

    segments: list[SegmentRead] = []
    for key, description in worker_nudge_service.SEGMENTS.items():
        if key in worker_nudge_service.ASYNC_SEGMENTS:
            # Требует getChatMember на каждого — не считаем при каждой
            # загрузке экрана, размер станет известен в превью рассылки.
            segments.append(SegmentRead(key=key, description=description))
            continue
        selected = worker_nudge_service.filter_segment(rows, key)
        segments.append(
            SegmentRead(
                key=key,
                description=description,
                total=len(selected),
                reachable=sum(1 for row in selected if row.bot_connected),
            )
        )

    roster = [
        RosterItem(
            user_id=row.user.id,
            name=row.user.name,
            referrals=row.referrals,
            earnings_kopeks=row.earnings_kopeks,
            days_silent=row.days_silent,
            days_since_registration=row.days_since_registration,
            bot_connected=row.bot_connected,
        )
        for row in sorted(
            rows,
            key=lambda r: (r.referrals, r.earnings_kopeks, -(r.days_silent or 0)),
        )
    ]

    return WorkerBotOverview(
        settings=WorkerBotSettingsRead(
            auto_nudges_enabled=settings_row.auto_nudges_enabled,
            paused_until=settings_row.paused_until,
        ),
        segments=segments,
        roster=roster,
        total_workers=len(rows),
        total_referrals=sum(row.referrals for row in rows),
        total_earnings_kopeks=sum(row.earnings_kopeks for row in rows),
        bot_connected_count=sum(1 for row in rows if row.bot_connected),
    )


@router.get("/settings", response_model=WorkerBotSettingsRead)
async def get_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> WorkerBotSettingsRead:
    row = await worker_nudge_service.get_bot_settings(db)
    await db.commit()
    return WorkerBotSettingsRead(
        auto_nudges_enabled=row.auto_nudges_enabled,
        paused_until=row.paused_until,
    )


@router.put("/settings", response_model=WorkerBotSettingsRead)
async def update_settings(
    body: WorkerBotSettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> WorkerBotSettingsRead:
    """Общий выключатель авто-пинков и пауза до даты."""
    row = await worker_nudge_service.get_bot_settings(db)
    row.auto_nudges_enabled = body.auto_nudges_enabled
    row.paused_until = body.paused_until
    row.updated_by = admin.id
    await db.commit()
    return WorkerBotSettingsRead(
        auto_nudges_enabled=row.auto_nudges_enabled,
        paused_until=row.paused_until,
    )


@router.get("/nudges", response_model=list[NudgeRuleRead])
async def list_nudges(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> list[NudgeRuleRead]:
    """Правила авто-пинков; недостающие досеваются дефолтами из кода."""
    rules = await worker_nudge_service.get_or_seed_rules(db)
    await db.commit()
    return [_rule_to_read(rule) for rule in rules]


@router.patch("/nudges/{kind}", response_model=NudgeRuleRead)
async def update_nudge(
    kind: str,
    body: NudgeRuleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> NudgeRuleRead:
    """Правка триггера: вкл/выкл, окно остывания, порог, текст."""
    rules = {r.kind: r for r in await worker_nudge_service.get_or_seed_rules(db)}
    rule = rules.get(kind)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Триггер {kind} не найден",
        )

    if body.is_enabled is not None:
        rule.is_enabled = body.is_enabled
    if body.cooldown_days is not None:
        rule.cooldown_days = body.cooldown_days
    if body.threshold_days is not None:
        rule.threshold_days = body.threshold_days
    if body.text_template is not None:
        text = body.text_template.strip()
        # {cabinet} подставляется при отправке; текст без неё оставит человека
        # без единой ссылки, куда идти.
        if "{cabinet}" not in text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Текст должен содержать {cabinet} — туда подставится ссылка на кабинет",
            )
        rule.text_template = text

    await db.commit()
    return _rule_to_read(rule)


async def _resolve_targets(db: AsyncSession, segment: str):
    """Отобрать воркеров сегмента (в т.ч. async-сегменты с опросом Bot API)."""
    if segment not in worker_nudge_service.SEGMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неизвестный сегмент {segment}",
        )
    rows = await worker_nudge_service.collect_worker_rows(db)
    if segment in worker_nudge_service.ASYNC_SEGMENTS:
        return await worker_nudge_service.filter_not_in_channel(db, rows)
    return worker_nudge_service.filter_segment(rows, segment)


@router.post("/broadcast/preview", response_model=BroadcastPreview)
async def preview_broadcast(
    body: BroadcastRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> BroadcastPreview:
    """Сколько человек получит рассылку и кто именно — до отправки."""
    targets = await _resolve_targets(db, body.segment)
    reachable = [row for row in targets if row.bot_connected]
    return BroadcastPreview(
        segment=body.segment,
        description=worker_nudge_service.SEGMENTS[body.segment],
        total=len(targets),
        reachable=len(reachable),
        names=[row.user.name for row in reachable[:50]],
    )


@router.post("/broadcast", response_model=BroadcastResult)
async def send_broadcast(
    body: BroadcastRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> BroadcastResult:
    """Отправить сообщение сегменту. Вызывать после превью — это уже отправка."""
    targets = await _resolve_targets(db, body.segment)
    reachable = [row for row in targets if row.bot_connected]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="В сегменте нет ни одного получателя с подключённым ботом",
        )

    report = await worker_nudge_service.broadcast(reachable, body.text)
    return BroadcastResult(
        delivered=report.delivered,
        skipped_no_chat=report.skipped_no_chat,
        failed=report.failed,
        failures=report.failures or [],
    )


@router.get("/nudge-log", response_model=NudgeLogResponse)
async def get_nudge_log(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    limit: int = Query(default=50, ge=1, le=200),
) -> NudgeLogResponse:
    """История авто-пинков: кому, какой триггер, когда."""
    total = int(
        (await db.execute(select(func.count(WorkerNudgeLog.id)))).scalar_one()
    )
    rows = (
        await db.execute(
            select(WorkerNudgeLog, User.name)
            .join(User, WorkerNudgeLog.user_id == User.id)
            .order_by(WorkerNudgeLog.sent_at.desc())
            .limit(limit)
        )
    ).all()
    return NudgeLogResponse(
        items=[
            NudgeLogItem(
                user_id=entry.user_id,
                name=name,
                kind=entry.kind,
                sent_at=entry.sent_at,
            )
            for entry, name in rows
        ],
        total=total,
    )
