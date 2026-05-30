# Implementation Plan: admin-finance-management

## Overview

Инкрементальный план реализации восьми направлений администрирования и финансов: причины отклонения сделок (Req 1) и выплат (Req 2), ручная корректировка баланса (Req 3), починка сохранения карты выплаты (Req 4), роль «Тех-админ» с аудитом (Req 5), гарантии доли платформы (Req 6), корректное назначение реферальной доли (Req 7), финансовый дашборд (Req 8).

Порядок: слой данных (enum, модели, миграции) → общие хелперы и авторизация → бэкенд-логика по требованиям с property-тестами рядом с реализацией → финансовый дашборд → фронтенд → проверка деплоя и публикация. Все суммы — целые копейки; преобразование в рубли только на UI. Каждое из 35 свойств корректности из дизайна реализуется одним property-тестом на Hypothesis с тегом `# Feature: admin-finance-management, Property {N}: {текст}` и `@settings(max_examples=100)`.

## Tasks

- [x] 1. Слой данных: перечисления и ORM-модели
  - [x] 1.1 Добавить роль `TECH_ADMIN = "Tech_Admin"` в `UserRole`
    - В `enums/user.py` добавить значение `TECH_ADMIN = "Tech_Admin"` рядом с `WORKER/BLOGER/ADMIN`
    - Убедиться, что ORM-метаданные отражают новое значение для последующей миграции нативного enum
    - _Requirements: 5.1, 5.8_

  - [x] 1.2 Добавить колонку `upline_blogger_id` в модель `User`
    - В `models/user.py` добавить `upline_blogger_id: Mapped[uuid.UUID | None]` (`ForeignKey("users.id", ondelete="SET NULL")`, `nullable=True`, `index=True`)
    - Семантика «блогер → наставник-блогер (аплайн)»; `linked_to` сохраняет смысл «работник → пригласивший блогер»
    - _Requirements: 7.1, 7.3, 7.5, 8.32_

  - [x] 1.3 Создать модель `AdminAuditLog` и зарегистрировать её
    - Создать `models/admin_audit_log.py` с таблицей `admin_audit_logs`: `id` (PK, uuid4), `actor_id` (FK users.id ON DELETE RESTRICT), `target_user_id` (FK users.id ON DELETE CASCADE), `field` (String(64)), `old_value`/`new_value` (Text, nullable, только маскированные представления), `created_at` (server_default now())
    - Индексы по `target_user_id`, `actor_id`, `created_at`
    - Зарегистрировать модель в `models/__init__.py`
    - _Requirements: 5.6, 3.7_

- [ ] 2. Миграции Alembic
  - [-] 2.1 Миграция значения enum `Tech_Admin`
    - Новая ревизия `down_revision = "l6m7n8o9p0q1"`
    - `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Tech_Admin'` внутри `op.get_context().autocommit_block()` (паттерн как в `l6m7n8o9p0q1`)
    - `downgrade`: пересоздание enum без значения либо no-op с комментарием (удаление значения enum в PG невозможно напрямую)
    - _Requirements: 5.1, 5.8_

  - [-] 2.2 Миграция колонки `users.upline_blogger_id` + безопасный бэкофилл
    - Чейнить от ревизии 2.1; `add_column('users', upline_blogger_id ...)` + FK (`ON DELETE SET NULL`) + индекс
    - Бэкофилл: `UPDATE users u SET upline_blogger_id = u.linked_to WHERE u.role = 'Bloger' AND u.linked_to IS NOT NULL AND u.linked_to <> u.id AND EXISTS (SELECT 1 FROM users m WHERE m.id = u.linked_to AND m.role = 'Bloger')` — только валидные аплайны, без наставника по умолчанию
    - `downgrade`: `drop_column`
    - _Requirements: 7.1, 7.4, 7.6_

  - [-] 2.3 Миграция таблицы `admin_audit_logs`
    - Чейнить от ревизии 2.2; `create_table('admin_audit_logs', ...)` со всеми колонками и индексами из модели
    - `downgrade`: `drop_table`
    - _Requirements: 5.6, 3.7_

  - [ ]* 2.4 Тесты применения и отката миграций
    - Тест `upgrade head` и `downgrade` на чистой БД для всех трёх ревизий (enum → колонка → таблица)
    - Проверка корректности бэкофилла `upline_blogger_id`: наставник назначается только для валидных аплайнов (существующий `Bloger`, `≠ self`); прочие остаются `NULL`
    - _Requirements: 5.1, 7.6_

- [ ] 3. Общие хелперы, конфигурация и авторизация
  - [x] 3.1 Вынести общий хелпер `compute_card_hash_and_last4`
    - В `utils/card_hash.py` (или существующем модуле хеширования) выделить `compute_card_hash_and_last4(pan) -> (hash, last4)`, переиспользуемый `set_me_payout_card` и админ-установкой карты партнёра
    - Детерминированный хеш с использованием `PAYOUT_CARD_PEPPER`; не сохранять и не возвращать полный PAN
    - _Requirements: 4.1, 4.4, 5.3_

  - [x] 3.2 Конфигурация `PAYOUT_CARD_PEPPER`
    - Подтвердить наличие `payout_card_pepper` в `core/settings.py` (дефолт `""`) и добавить переменную `PAYOUT_CARD_PEPPER` в `.env.example` с комментарием об обязательности для функции выплат
    - Поведение «отключено без секрета» сохраняется и явно отличимо от успеха (отдельный код `503`)
    - _Requirements: 4.6_

  - [x] 3.3 Зависимость авторизации `get_current_admin_or_tech`
    - В `dependencies/auth.py` добавить `get_current_admin_or_tech`: пропускает роли `ADMIN` и `TECH_ADMIN`, иначе `403`
    - Сохранить `get_current_admin` (только `ADMIN`) для операций над административными аккаунтами
    - _Requirements: 5.5, 5.8, 3.8, 8.1, 8.2_

  - [-] 3.4 Сервис аудита `admin_audit_service`
    - Создать `services/admin_audit_service.py` с функцией записи `AdminAuditLog` (actor_id, target_user_id, field, old_value, new_value, created_at)
    - Для карты в `old_value`/`new_value` писать только маскированное представление (last4), без PAN
    - _Requirements: 5.6, 3.7_

- [ ] 4. Требование 1 — причина отклонения сделки (бэкенд)
  - [~] 4.1 Хелпер причины + `deal_to_read` + схемы
    - В `services/deal_service.py` добавить `get_latest_rejection_reason(deal_id, db) -> str | None` (последняя `DealAdminLog` с `action='status_patch'`, `new_status=REJECTED`, `order_by created_at desc limit 1`)
    - В `deal_to_read`: при `deal.status == REJECTED` проставлять `rejection_reason`, иначе `None`
    - В `schemas/deal.py`: `DealRead += rejection_reason: str | None = None`; сузить `AdminDealStatusPatch.reason` до `max_length=1000`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.8_

  - [ ]* 4.2 Property-тест round-trip причины отклонения сделки
    - **Property 1: Round-trip причины отклонения сделки**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Тег `# Feature: admin-finance-management, Property 1: ...`, `@settings(max_examples=100)`, транзакционная тестовая сессия

  - [ ]* 4.3 Property-тест отклонения длинной причины
    - **Property 2: Длинная причина отклонения сделки отвергается без смены состояния**
    - **Validates: Requirements 1.8**
    - Генератор строк длиной > 1000; проверка ошибки валидации и неизменности статуса

  - [ ]* 4.4 Интеграционный тест устойчивости записи причины
    - Сбой записи `DealAdminLog` (мок) → перевод в `REJECTED` завершается, фиксируется признак ошибки записи причины, операция не прерывается
    - _Requirements: 1.7_

- [ ] 5. Требование 2 — причина отклонения выплаты (бэкенд)
  - [-] 5.1 Выровнять валидацию `AdminLedgerStatusPatch.note`
    - В `schemas/ledger.py` подтвердить/установить `note` с `min_length=1, max_length=4000`; при превышении Pydantic возвращает `422`, статус записи не меняется
    - _Requirements: 2.1, 2.7_

  - [ ]* 5.2 Property-тест round-trip причины отклонения выплаты
    - **Property 3: Round-trip причины отклонения выплаты**
    - **Validates: Requirements 2.1, 2.2**
    - Тег и `@settings(max_examples=100)`; `note` длиной 1–4000, проверка `status == rejected` и сохранённого `note`

- [ ] 6. Требование 3 — ручная корректировка баланса
  - [-] 6.1 Схемы корректировки баланса
    - В `schemas/admin.py` добавить `AdminBalanceAdjustmentRequest` (`amount_kopeks` `ge=-99_999_999_999 le=99_999_999_999`, `reason` `min_length=1 max_length=500`, `model_validator`: запрет нуля и пробельной причины) и `AdminBalanceAdjustmentResponse` (`user`, `ledger_entry`)
    - _Requirements: 3.3, 3.4, 3.6_

  - [~] 6.2 Сервис `admin_adjust_user_balance`
    - В `services/admin_user_service.py` реализовать атомарную операцию с `with_for_update`: валидация суммы/причины, проверка резерва (`payout_request`, `freeze`, `pending_confirmation`) при уменьшении, изменение баланса
    - Создать `LedgerEntry(deal_id=None, amount_kopeks=amount, status=COMPLETED, note=reason.strip(), idempotency_key=f"adj:{uuid4()}")`
    - Записать аудит через `admin_audit_service` (`field='balance_adjustment'`, `actor_id`); при любой ошибке журнала/аудита — полный `rollback`
    - _Requirements: 3.1, 3.2, 3.5, 3.7, 3.9_

  - [~] 6.3 Эндпоинт корректировки баланса
    - В `routers/admin.py` добавить `POST /admin/users/{user_id}/balance-adjustment` под `get_current_admin_or_tech`, возвращающий `AdminBalanceAdjustmentResponse`
    - _Requirements: 3.1, 3.8_

  - [ ]* 6.4 Property-тест изменения баланса
    - **Property 4: Корректировка баланса изменяет баланс на заданную сумму**
    - **Validates: Requirements 3.1, 3.3**

  - [ ]* 6.5 Property-тест записи журнала и аудита
    - **Property 5: Корректировка баланса создаёт корректную запись журнала и аудита**
    - **Validates: Requirements 3.2, 3.7**

  - [ ]* 6.6 Property-тест резерва доступных средств
    - **Property 6: Корректировка не нарушает доступность зарезервированных средств**
    - **Validates: Requirements 3.5**

  - [ ]* 6.7 Интеграционные тесты корректировки баланса
    - Запрос от неадминистратора → `403`, баланс не меняется (Req 3.8); сбой записи журнала (мок) → `rollback`, баланс == исходный (Req 3.9)
    - _Requirements: 3.8, 3.9_

- [ ] 7. Требование 4 — сохранение карты выплаты (исправление)
  - [~] 7.1 Починка `set_me_payout_card`
    - В `services/me_service.py` подтвердить порядок проверок: роль (`403`) → секрет `PAYOUT_CARD_PEPPER` (`503`) → длина 13–19 (`400`) → Луна (`400`) → сохранение хеша и last4 через `compute_card_hash_and_last4`
    - Сохранение независимо от наличия токена выплаты ЮKassa; при любой ошибке валидации прежние `payout_card_hash`/`payout_card_last4` не трогаются
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [~] 7.2 Фронтенд: валидация длины карты 13–19
    - В `frontend/components/.../payout-card-input.tsx` заменить жёсткое `raw.length === expectedLen` на диапазон 13–19 цифр с сохранением Luhn-проверки; кнопка активна при длине в диапазоне и валидном Luhn
    - _Requirements: 4.1, 4.3_

  - [ ]* 7.3 Property-тест round-trip карты и неразглашения PAN
    - **Property 7: Сохранение карты — round-trip и неразглашение PAN**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.7**
    - Чистый тест хелпера: генератор валидных PAN (13–19 цифр + контроль Луна)

  - [ ]* 7.4 Интеграционные тесты конфигурации и независимости от ЮKassa
    - Отсутствие `PAYOUT_CARD_PEPPER` → `503`, данные карты не пишутся (Req 4.6); сохранение карты при `yukassa_payout_active=true` без `payout_token` (Req 4.5)
    - _Requirements: 4.5, 4.6_

- [ ] 8. Требование 5 — роль Тех-админ, управление партнёрами, аудит
  - [~] 8.1 Схемы Тех-админа и партнёров
    - В `schemas/admin.py`: `AdminUserRead += is_owner_admin: bool` (вычисляемое `role == ADMIN`); `AdminUserPatch.percent` `Field(ge=0, le=100)` + `upline_blogger_id: uuid.UUID | None`; новые `AdminPartnerCardSet`, `AdminAuditEntryRead`, `AdminAuditListResponse`
    - _Requirements: 5.2, 5.4, 5.9, 7.1_

  - [~] 8.2 Логика `admin_patch_user` и управления партнёрами
    - В `services/admin_user_service.py`: процент `0.00..100.00` (2 знака); карта партнёра 13–19 цифр через `compute_card_hash_and_last4`; присвоение `upline_blogger_id` с валидацией (целевой и указанный — оба `Bloger`, `≠ self`)
    - Защита последнего владельца: запрет деактивации/удаления/понижения роли, оставляющих 0 активных `Admin` (`409`)
    - Разграничение прав: операции над аккаунтами `Admin`/`Tech_Admin` только для актора `Admin`; лимит 0..10 `Tech_Admin`
    - Аудит изменений `percent` и карты через `admin_audit_service`
    - _Requirements: 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 7.1_

  - [~] 8.3 Эндпоинты карты партнёра и аудита
    - В `routers/admin.py`: `POST /admin/users/{id}/payout-card` (`AdminPartnerCardSet`, уровень Тех-админ) и `GET /admin/users/{id}/audit` (`AdminAuditListResponse`) под `get_current_admin_or_tech`
    - _Requirements: 5.3, 5.4, 5.10_

  - [~] 8.4 Переключение admin-эндпоинтов на `get_current_admin_or_tech`
    - В `routers/admin.py` перевести обзор, пользователей-партнёров, проценты, карты, сделки, журнал на `get_current_admin_or_tech`; операции «создать/сменить роль/деактивировать/удалить аккаунт `Admin`/`Tech_Admin`» оставить под `get_current_admin`
    - _Requirements: 5.5, 5.8_

  - [ ]* 8.5 Property-тест инварианта административных учётных записей
    - **Property 15: Инвариант административных учётных записей**
    - **Validates: Requirements 5.1, 5.7**
    - Стратегия последовательностей операций над набором аккаунтов

  - [ ]* 8.6 Property-тест допустимого процента партнёра
    - **Property 16: Допустимый процент партнёра сохраняется**
    - **Validates: Requirements 5.2**

  - [ ]* 8.7 Property-тест карты партнёра
    - **Property 17: Карта партнёра — round-trip и неразглашение PAN**
    - **Validates: Requirements 5.3**

  - [ ]* 8.8 Property-тест аудита изменений
    - **Property 18: Аудит изменений процента и карты партнёра**
    - **Validates: Requirements 5.6**

  - [ ]* 8.9 Интеграционные тесты матрицы доступа
    - `403` для недостаточных прав; Тех-админ не может управлять админ-аккаунтами; разграничение владелец-`Admin`/`Tech_Admin`/прочие
    - _Requirements: 5.5, 5.8_

- [ ] 9. Требование 6 — корректная доля платформы (гарантии)
  - [~] 9.1 Подтверждение инвариантов начисления и устранение искажающих источников
    - Подтвердить в `services/finance_scheme_service.py` инварианты `distribute_price_kopeks` (`pk = price − wk − bk − uk`, неотрицательность, сумма = базовой)
    - В `services/deal_service.py` подтвердить идемпотентность `_accrue_paid_deal` (`_paid_bundle_exists` + уникальные `idempotency_key`) и проверку системного счёта платформы до любого изменения балансов с явной ошибкой
    - В `scripts/seed_*.py` сделать seed-скрипты идемпотентными/помеченными как демо-данные
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

  - [ ]* 9.2 Property-тест распределения (чистая функция)
    - **Property 8: Распределение — неотрицательность, целочисленность и сохранение суммы**
    - **Validates: Requirements 6.2**
    - БД не требуется; генераторы базовой суммы и весов (с отбрасыванием «все нули»)

  - [ ]* 9.3 Property-тест идемпотентности начисления
    - **Property 9: Идемпотентность начисления по сделке**
    - **Validates: Requirements 6.4**

  - [ ]* 9.4 Property-тест полноты и адресности начислений
    - **Property 10: Полнота и адресность посделочных начислений**
    - **Validates: Requirements 6.1, 6.5**

  - [ ]* 9.5 Регрессионный и конфигурационный тест
    - Регрессия: `distribute_price_kopeks(7777, default) == (972, 2430, 486, 3889)` (Req 6.3); отсутствие системного счёта платформы при начислении → `500`, балансы не меняются (Req 6.6)
    - _Requirements: 6.3, 6.6_

- [ ] 10. Требование 7 — корректное назначение реферальной доли
  - [~] 10.1 Чтение аплайна только из `upline_blogger_id`
    - В `services/deal_service.py` изменить `_accrue_paid_deal` и `_apply_completed_stats`: читать только `bloger_user.upline_blogger_id`; валидный аплайн — существующий `Bloger`, `≠ deal.bloger_id`; иначе `bk += uk; uk = 0; upline=None`
    - При `uk == 0` запись начисления аплайну не создаётся; `set_worker_linked_to` оставить без изменений (только `worker.linked_to`); наставник по умолчанию не назначается
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 10.2 Property-тест реферальной доли валидному аплайну
    - **Property 11: Реферальная доля валидному аплайну**
    - **Validates: Requirements 7.1, 7.7**

  - [ ]* 10.3 Property-тест перенаправления реф-доли блогеру
    - **Property 12: Отсутствие валидного аплайна перенаправляет реф-долю блогеру**
    - **Validates: Requirements 7.2, 7.4**

  - [ ]* 10.4 Property-тест определения аплайна только наставником блогера
    - **Property 13: Аплайн определяется только наставником блогера**
    - **Validates: Requirements 7.3**

  - [ ]* 10.5 Property-тест разделения семантики реферальных связей
    - **Property 14: Разделение семантики реферальных связей**
    - **Validates: Requirements 7.5, 7.6**

- [~] 11. Checkpoint — ядро бэкенда
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Требование 8 — финансовый дашборд (схемы и сервис)
  - [~] 12.1 Схемы дашборда и enum периода
    - Создать `schemas/finance.py` (или расширить): `ReportingPeriod` (`today/week/month/all`), вложенные `TopParticipant`, `TimeSeriesPoint`, `ReferralShareByBlogger`, `ActiveReferralLinks` и расширенная `PlatformFinanceDashboard` со всеми полями `*_kopeks` (целые копейки)
    - Словари статусов всегда содержат все 6 ключей; `earnings_by_role_kopeks` всегда содержит `Worker/Bloger/Platform`; `net_free_funds`/`available_for_payout` могут быть отрицательными
    - _Requirements: 8.1, 8.4_

  - [~] 12.2 Сервис `finance_stats_service` — предусловия и базовые показатели
    - Создать `services/finance_stats_service.py::get_platform_finance_dashboard(db, period=ALL)`; `_period_threshold(period, now)`; проверка системного счёта платформы до любых агрегатов (иначе ошибка конфигурации без частичных данных)
    - Базовые: `platform_balance_kopeks`, `accrued_platform_share_kopeks`, `platform_withdrawn_kopeks`, `net_profit_kopeks`, `earnings_by_role_kopeks`, `total_completed_payouts_kopeks` (деривация из `ledger_entries` по шаблонам `idempotency_key`)
    - _Requirements: 8.3, 8.5, 8.6, 8.7, 8.8_

  - [~] 12.3 Группы A и B — оборот, сделки, обязательства
    - Оборот итог/по статусам (`COALESCE(agreed_price_kopeks, price)`), количество сделок по статусам, `paid_deals_count`, средний чек и средняя комиссия (целое деление, 0 при отсутствии оплаченных)
    - Обязательства платформы (Σ баланса `Worker`+`Bloger`) и чистые свободные средства
    - _Requirements: 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 8.16_

  - [~] 12.4 Группа C — разбивка доли платформы
    - `accrued_platform_share_kopeks` (с учётом периода), `platform_withdrawn_kopeks`, `platform_pending_funds_kopeks` (`freeze`/`pending_confirmation`/`payout_request`), `available_for_payout_kopeks`
    - _Requirements: 8.17, 8.18, 8.19, 8.20_

  - [~] 12.5 Группа D — периоды и динамика
    - Применение `_period_threshold` к обороту, накопленной доле и количеству сделок; по умолчанию `all`; `time_series` — слияние дневных рядов оборота и доли платформы, упорядочено по `date ASC`, дни без данных получают `0`
    - _Requirements: 8.21, 8.22, 8.24_

  - [~] 12.6 Группа E — топ-участники
    - `top_bloggers`/`top_workers`: ≤10, по убыванию `earnings_kopeks`, с `user_id`, `earnings_kopeks`, `paid_deals_count`; пустой список при отсутствии начислений
    - _Requirements: 8.25, 8.26, 8.27_

  - [~] 12.7 Группа F — ожидаемые начисления
    - `expected_accruals_total_kopeks` (Σ базовых сумм `CONFIRMED`, ещё не `PAID`); `expected_future_shares_kopeks` через `distribute_price_kopeks` с той же логикой валидации аплайна, что и в начислении
    - _Requirements: 8.28, 8.29_

  - [~] 12.8 Группа G — реферальная аналитика
    - `total_referral_share_to_uplines_kopeks` (`deal:%:paid:upline`, `completed`); `referral_share_by_blogger` (группировка по `user_id`); `active_referral_links` (блогеры с `upline_blogger_id`, воркеры с `linked_to`)
    - _Requirements: 8.30, 8.31, 8.32_

  - [~] 12.9 Эндпоинт дашборда
    - В `routers/admin.py` добавить `GET /admin/finance/dashboard?period=` под `get_current_admin_or_tech`; невалидный `period` → `422`; без `period` → `all`; отсутствие системного счёта → ошибка конфигурации без частичных данных
    - _Requirements: 8.1, 8.2, 8.3, 8.22, 8.23_

- [ ] 13. Property-тесты финансового дашборда
  - [ ]* 13.1 Property-тест баланса платформы до вывода
    - **Property 19: Баланс платформы до вывода**
    - **Validates: Requirements 8.5**

  - [ ]* 13.2 Property-тест чистой прибыли
    - **Property 20: Чистая прибыль платформы**
    - **Validates: Requirements 8.6**

  - [ ]* 13.3 Property-тест заработка по ролям
    - **Property 21: Заработок по ролям**
    - **Validates: Requirements 8.7**

  - [ ]* 13.4 Property-тест суммарного объёма выплат
    - **Property 22: Суммарный объём проведённых выплат**
    - **Validates: Requirements 8.8**

  - [ ]* 13.5 Property-тест согласованности оборота
    - **Property 23: Оборот — итог и разбивка по статусам согласованы**
    - **Validates: Requirements 8.9, 8.10**

  - [ ]* 13.6 Property-тест количества сделок по статусам
    - **Property 24: Количество сделок по статусам**
    - **Validates: Requirements 8.11**

  - [ ]* 13.7 Property-тест среднего чека и средней комиссии
    - **Property 25: Средний чек и средняя комиссия (с нулевым случаем)**
    - **Validates: Requirements 8.12, 8.13, 8.14**

  - [ ]* 13.8 Property-тест обязательств платформы
    - **Property 26: Обязательства платформы**
    - **Validates: Requirements 8.15**

  - [ ]* 13.9 Property-тест чистых свободных средств
    - **Property 27: Чистые свободные средства**
    - **Validates: Requirements 8.16**

  - [ ]* 13.10 Property-тест сумм платформы
    - **Property 28: Суммы платформы — накоплено, выведено, в ожидании**
    - **Validates: Requirements 8.17, 8.18, 8.19**

  - [ ]* 13.11 Property-тест доступного к выводу
    - **Property 29: Доступно к выводу**
    - **Validates: Requirements 8.20**

  - [ ]* 13.12 Property-тест периодной фильтрации
    - **Property 30: Периодная фильтрация показателей**
    - **Validates: Requirements 8.21**

  - [ ]* 13.13 Property-тест динамики
    - **Property 31: Динамика — упорядоченность и суммируемость**
    - **Validates: Requirements 8.24**

  - [ ]* 13.14 Property-тест топ-участников
    - **Property 32: Топ-участники — упорядоченность, ограничение и содержимое**
    - **Validates: Requirements 8.25, 8.26, 8.27**

  - [ ]* 13.15 Property-тест ожидаемых начислений
    - **Property 33: Ожидаемые начисления и их распределение**
    - **Validates: Requirements 8.28, 8.29**

  - [ ]* 13.16 Property-тест реферальной доли
    - **Property 34: Реферальная доля — итог и согласованная разбивка**
    - **Validates: Requirements 8.30, 8.31**

  - [ ]* 13.17 Property-тест счётчиков активных связей
    - **Property 35: Счётчики активных реферальных связей**
    - **Validates: Requirements 8.32**

  - [ ]* 13.18 Интеграционные тесты дашборда (авторизация, период, конфигурация)
    - `admin`/`tech-admin` → `200`; `worker`/`bloger`/аноним → `403` без показателей (Req 8.1, 8.2); без `period` ≡ `all` (Req 8.22); невалидный `period` → `422` (Req 8.23); отсутствие системного счёта → ошибка конфигурации без частичных данных (Req 8.3); фильтрация по периоду и ограничение top-N
    - _Requirements: 8.2, 8.3, 8.22, 8.23_

- [~] 14. Checkpoint — бэкенд завершён
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Фронтенд — типы и API-клиент
  - [~] 15.1 Типы `lib/types.ts`
    - Добавить `DealRead.rejection_reason: string | null`, роль `Tech_Admin`, `PlatformFinanceDashboard` + `TopParticipant`/`TimeSeriesPoint`/`ReferralShareByBlogger`/`ActiveReferralLinks`/`ReportingPeriod`, типы аудита (`AdminAuditEntry`, `AdminAuditListResponse`), партнёрскую карту
    - _Requirements: 1.4, 5.4, 8.4_

  - [~] 15.2 API-методы `lib/api.ts`
    - Добавить `adjustUserBalance(id, { amount_kopeks, reason })`, `setPartnerPayoutCard(id, { card_number })`, `getUserAudit(id)`, `getPlatformFinanceDashboard(period?)` (передаёт query `period`)
    - _Requirements: 3.1, 5.3, 5.4, 8.1_

- [ ] 16. Фронтенд — причины отклонения
  - [~] 16.1 Причины отклонения в админке
    - В `admin-dashboard.tsx`: блок «Причина отклонения» в карточке сделки при `status === "REJECTED"` (плейсхолдер «Причина не указана» при пустом значении); причина отклонения выплаты рядом с записями журнала `status === "rejected"` (с плейсхолдером) для мобильного и десктоп-варианта
    - _Requirements: 1.4, 1.9, 2.4, 2.6_

  - [~] 16.2 Причины отклонения в кабинете
    - В `cabinet-dashboard.tsx`: причина отклонения сделки участнику при `status === "REJECTED"` (с плейсхолдером); причина отклонения выплаты рядом с записями журнала `rejected` (с плейсхолдером)
    - _Requirements: 1.5, 1.10, 2.3, 2.5_

- [ ] 17. Фронтенд — корректировка баланса и управление партнёрами
  - [~] 17.1 Форма корректировки баланса
    - В `admin-dashboard.tsx` (карточка пользователя): форма «Корректировка баланса» (рубли → копейки, причина), вызов `adjustUserBalance`
    - _Requirements: 3.1_

  - [~] 17.2 Управление партнёрами и аудит
    - В `admin-dashboard.tsx`: отображение процента, last4 карты, баланса, статуса активности и истории изменений (процент/карта/upline); управление картой партнёра и `upline_blogger_id`; блоки управления админ-аккаунтами видимы/активны только владельцу-`Admin` (`is_owner_admin`)
    - _Requirements: 5.4, 5.5, 5.8_

- [ ] 18. Фронтенд — секция «Финансы платформы»
  - [~] 18.1 Каркас секции, пункт навигации и селектор периода
    - В `admin-dashboard.tsx` добавить в тип `AdminSection` значение `"finance"` и пункт меню «Финансы платформы» в `sectionMeta`
    - Переименовать подпись существующей секции `schemes` с «Финансы» на «Схемы» (`sectionMeta.schemes.label`), чтобы развести её с новой сводкой; `title`/`lead` про веса распределения оставить
    - Добавить селектор периода (`today/week/month/all`), управляющий query-параметром и инвалидацией запроса дашборда
    - _Requirements: 8.1, 8.21, 8.22_

  - [~] 18.2 Карточки метрик и таблицы
    - Карточки (Базовые + B + C: баланс, чистая прибыль, обязательства, чистые свободные средства, накопленная доля, выведено, в ожидании, доступно к выводу); таблицы оборота по статусам и количества сделок, средний чек/комиссия; все денежные значения в рублях (÷100, 2 знака) через `formatMoney`
    - _Requirements: 8.4, 8.5, 8.6, 8.9, 8.10, 8.11, 8.12, 8.14, 8.15, 8.16, 8.17, 8.18, 8.19, 8.20_

  - [~] 18.3 Графики динамики, топ-участники, реферальная аналитика, ожидаемые начисления
    - Графики `time_series` в стиле `OverviewCharts` (или `finance-charts.tsx` на тех же CSS-токенах); таблицы `top_bloggers`/`top_workers`; реферальная аналитика (итог, разбивка по аплайнам, счётчики связей); ожидаемые начисления (итог + будущие доли); рубли через `formatMoney`
    - _Requirements: 8.4, 8.24, 8.25, 8.26, 8.27, 8.28, 8.29, 8.30, 8.31, 8.32_

  - [ ]* 18.4 UI-тесты рендеринга и конвертации
    - Отображение причин отклонения и плейсхолдеров; раздел партнёров; селектор периода меняет запрос и перерисовывает метрики; рендеринг карточек/таблиц/графиков/топ-участников/реферальной аналитики; конвертация копейки→рубли с 2 знаками
    - _Requirements: 1.4, 1.5, 1.9, 1.10, 2.3, 2.4, 2.5, 2.6, 5.4, 8.4_

- [~] 19. Checkpoint — фронтенд завершён
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Проверка деплоя и публикация
  - [~] 20.1 Прогнать полный набор тестов бэкенда и typecheck фронтенда
    - Запустить `pytest` (бэкенд) и `npx tsc --noEmit` (фронтенд) локально, чтобы CI (`.github/workflows/deploy.yml`) прошёл; устранить найденные ошибки
    - _Requirements: 6.3_

  - [~] 20.2 Проверить Alembic upgrade/downgrade на тестовой БД
    - Прогнать `alembic upgrade head` и `downgrade` на scratch-БД (деплой выполняет `alembic upgrade head` автоматически через `deploy/remote-deploy.sh`); подтвердить корректность бэкофилла `upline_blogger_id`
    - _Requirements: 5.1, 7.6_

  - [~] 20.3 Обеспечить `PAYOUT_CARD_PEPPER` в production-окружении
    - Задокументировать и проверить наличие `PAYOUT_CARD_PEPPER` в production-переменных (Railway Variables); CI задаёт `ci-dummy-pepper`, прод может не иметь значения — это корневая причина Req 4
    - _Requirements: 4.6_

  - [~] 20.4 Финальный шаг — коммит и push в main (триггер авто-деплоя)
    - **ТРИГГЕР ДЕПЛОЯ:** закоммитить изменения и запушить в `main`, чтобы запустить авто-деплой (CI [pytest + tsc] → `deploy/remote-deploy.sh`: git reset, pip install, alembic upgrade head, npm build, restart)
    - **Примечание:** фактический коммит и push выполняет/подтверждает пользователь; это явный финальный шаг, зависящий от завершения всех задач реализации и тестирования
    - _Requirements: 4.6, 6.3_

## Notes

- Задачи, помеченные `*`, опциональны (тесты) и могут быть пропущены для ускорения MVP; основная реализация не помечается `*`.
- Каждая задача ссылается на конкретные требования и/или свойства корректности для трассируемости.
- Property-тесты на Hypothesis: один тест на свойство, тег `# Feature: admin-finance-management, Property {N}: {текст}`, `@settings(max_examples=100)`. Чистые функции (`distribute_price_kopeks`, хеш карты) тестируются без БД; сервисные/агрегационные свойства — на транзакционной тестовой сессии или in-memory.
- Чекпоинты обеспечивают инкрементальную валидацию.
- Все денежные значения — целые копейки; преобразование в рубли только на UI (÷100, 2 знака).
- Группа 20 (проверка деплоя и push) выполняется последней и зависит от завершения всех задач реализации и тестирования.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "3.1", "3.2", "3.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.4", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.4", "4.1", "8.1", "12.1", "5.2"] },
    { "id": 3, "tasks": ["9.1", "6.2", "4.2", "4.3", "4.4", "12.2", "7.1", "7.3", "7.4"] },
    { "id": 4, "tasks": ["10.1", "8.2", "6.3", "12.3", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 5, "tasks": ["8.3", "12.4", "10.2", "10.3", "10.4", "10.5", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 6, "tasks": ["8.4", "12.5"] },
    { "id": 7, "tasks": ["12.6", "8.5", "8.6", "8.7", "8.8", "8.9"] },
    { "id": 8, "tasks": ["12.7"] },
    { "id": 9, "tasks": ["12.8"] },
    { "id": 10, "tasks": ["12.9"] },
    { "id": 11, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10", "13.11", "13.12", "13.13", "13.14", "13.15", "13.16", "13.17", "13.18"] },
    { "id": 12, "tasks": ["15.1", "7.2"] },
    { "id": 13, "tasks": ["15.2"] },
    { "id": 14, "tasks": ["16.1", "16.2"] },
    { "id": 15, "tasks": ["17.1"] },
    { "id": 16, "tasks": ["17.2"] },
    { "id": 17, "tasks": ["18.1"] },
    { "id": 18, "tasks": ["18.2"] },
    { "id": 19, "tasks": ["18.3"] },
    { "id": 20, "tasks": ["18.4"] },
    { "id": 21, "tasks": ["20.1", "20.2", "20.3"] },
    { "id": 22, "tasks": ["20.4"] }
  ]
}
```
