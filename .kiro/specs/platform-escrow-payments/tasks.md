# Implementation Plan: platform-escrow-payments

## Overview

Инкрементальный план реализации эскроу-платежей платформы: приём платежей администратором (Карта_Приёма с шифрованием PAN + Платёжная_Ссылка, Блок A) и эскроу-жизненный цикл сделки с двумя новыми статусами `ESCROW_HELD`/`REFUNDED` и тремя административными действиями — Подтверждение_Получения, Распределение, Возврат (Блок B). Начисление участникам происходит **только** на переходе `ESCROW_HELD → PAID`, что закрывает работу «на доверии».

Порядок: слой данных (перечисления, модель, настройки) → миграции Alembic → схемы → шифрование PAN → сервис реквизитов приёма → предъявление реквизитов по сделке → машина состояний и эскроу-действия в `deal_service.py` (с property-тестами рядом с реализацией) → роутеры → фронтенд (типы/API → админка → кабинет) → обратная совместимость и регрессии. Все суммы — целые копейки; преобразование в рубли только на UI.

Реализация опирается на уже существующую инфраструктуру соседнего спека `admin-finance-management` (роль `Tech_Admin`, зависимость `get_current_admin_or_tech`, `admin_audit_service.record_admin_audit`, `utils/card_hash.normalize_pan/luhn_ok`, `finance_scheme_service.distribute_price_kopeks`, ключи `deal:{id}:paid:{role}`, `settings.platform_revenue_user_id`) и не дублирует её. Миграции чейнятся от текущего head `o9p0q1r2s3t4`.

Каждое из 17 свойств корректности из дизайна реализуется одним property-тестом на Hypothesis с тегом `# Feature: platform-escrow-payments, Property {N}: {текст}` и `@settings(max_examples=100)`. Чистые функции (`card_crypto`, `distribute_price_kopeks`) тестируются без БД; сервисные свойства — на транзакционной тестовой сессии с откатом после каждого примера.

## Tasks

- [ ] 1. Слой данных: перечисления, ORM-модель, настройки
  - [x] 1.1 Добавить статусы `ESCROW_HELD`/`REFUNDED` в `DealStatus`
    - В `enums/deal.py` добавить значения `ESCROW_HELD = "ESCROW_HELD"` и `REFUNDED = "REFUNDED"` рядом с существующими статусами
    - Убедиться, что ORM-метаданные отражают новые значения для последующей миграции нативного PG-enum
    - _Requirements: 8.1_

  - [x] 1.2 Добавить значения жизненного цикла удержания в `LedgerEntryStatus`
    - В `enums/ledger.py` добавить `ESCROW_HELD = "escrow_held"`, `ESCROW_RELEASED = "escrow_released"`, `ESCROW_REFUNDED = "escrow_refunded"`
    - Дизайн: Data Models → «Изменение enum `ledger_entry_status`»
    - _Requirements: 5.7, 7.7_

  - [x] 1.3 Создать модель `AdminPaymentDetails` и зарегистрировать её
    - Создать `models/admin_payment_details.py` (singleton-таблица `admin_payment_details`): `id` (PK, uuid4), `collection_card_pan_encrypted` (Text, nullable — ciphertext полного PAN), `collection_card_last4` (String(4), nullable), `payment_link` (String(2048), nullable), `updated_by` (FK `users.id` ON DELETE SET NULL), `created_at`/`updated_at` (server_default now(), `updated_at` onupdate now())
    - В БД нет колонки с открытым PAN; полный номер только в зашифрованном виде
    - Зарегистрировать модель в `models/__init__.py`
    - Дизайн: Data Models → «Новая таблица `admin_payment_details`»
    - _Requirements: 1.1, 2.1_

  - [x] 1.4 Добавить настройку `collection_card_enc_key`
    - В `core/settings.py` добавить `collection_card_enc_key: str = Field(default="", validation_alias="COLLECTION_CARD_ENC_KEY", ...)` (Fernet, base64 32 байта)
    - Добавить `COLLECTION_CARD_ENC_KEY` в `.env.example` с комментарием: пусто → приём/чтение полного PAN отдают `503` (паттерн как у `PAYOUT_CARD_PEPPER`)
    - _Requirements: 2.1_

- [ ] 2. Миграции Alembic
  - [ ] 2.1 Миграция значений enum `deal_status`
    - Новая ревизия с `down_revision = "o9p0q1r2s3t4"`; внутри `op.get_context().autocommit_block()`: `ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'ESCROW_HELD' BEFORE 'PAID'` и `... ADD VALUE IF NOT EXISTS 'REFUNDED'` (паттерн как `l6m7n8o9p0q1`/`m7n8o9p0q1r2`)
    - `downgrade`: документированный no-op (удаление значения enum в PG небезопасно)
    - _Requirements: 8.1_

  - [ ] 2.2 Миграция значений enum `ledger_entry_status`
    - Чейнить от ревизии 2.1; в `autocommit_block`: `ALTER TYPE ledger_entry_status ADD VALUE IF NOT EXISTS 'escrow_held' | 'escrow_released' | 'escrow_refunded'`
    - `downgrade`: документированный no-op
    - _Requirements: 5.7, 7.7_

  - [ ] 2.3 Миграция таблицы `admin_payment_details`
    - Чейнить от ревизии 2.2; `op.create_table('admin_payment_details', ...)` со всеми колонками из модели + `ForeignKeyConstraint(updated_by → users.id, ondelete="SET NULL")` (образец `o9p0q1r2s3t4_admin_audit_logs.py`)
    - `downgrade`: `drop_table`
    - _Requirements: 1.1, 2.1_

  - [ ]* 2.4 Smoke-тесты применения миграций и обратной совместимости
    - `alembic upgrade head` на чистой БД для всех трёх ревизий; `DealStatus` содержит `ESCROW_HELD`/`REFUNDED`, `LedgerEntryStatus` — три escrow-значения
    - Проверка обратной совместимости: существующие сделки в `PAID`/`COMPLETED` не затронуты миграцией
    - _Requirements: 8.1_

- [ ] 3. Схемы (Pydantic v2)
  - [x] 3.1 Схемы реквизитов приёма
    - В `schemas/finance.py` (или новый `schemas/payment_details.py`) добавить `AdminPaymentDetailsSet` (`collection_card: str | None`, `payment_link: str | None`; различие «не передано vs очистить» через `model_fields_set`), `AdminPaymentDetailsRead` (`payment_link`, `collection_card_last4`, `is_active`), `PaymentRequisites` (`collection_card_full`, `payment_link`, `available`)
    - Точная валидация (Luhn 13–19, HTTPS ≤ 2048) — в сервисе
    - _Requirements: 1.3, 2.1, 2.3_

  - [x] 3.2 Схема действия + поле реквизитов в `DealRead`
    - В `schemas/deal.py` добавить `AdminEscrowActionRequest` (`reason: Field(min_length=1, max_length=1000)` + `model_validator`, отклоняющий пробельную причину)
    - В `DealRead` добавить `payment_requisites: PaymentRequisites | None = None`
    - _Requirements: 4.6, 3.1_

- [ ] 4. Шифрование PAN при хранении
  - [x] 4.1 Утилита `utils/card_crypto.py`
    - Создать `encrypt_pan(pan_normalized, key) -> str` и `decrypt_pan(ciphertext, key) -> str` на `cryptography.fernet.Fernet` (аутентифицированное шифрование, ключ из `settings.collection_card_enc_key`)
    - Пустой ключ → ошибка, транслируемая сервисом в `503`; полный PAN никогда не логируется
    - _Requirements: 2.1_

  - [ ]* 4.2 Unit-тест round-trip шифрования и поведения без ключа
    - Чистый тест: `decrypt_pan(encrypt_pan(pan, key), key) == pan`; ciphertext не содержит и не равен PAN; пустой ключ → ошибка/`503`
    - _Requirements: 2.1_

- [ ] 5. Сервис реквизитов приёма (Блок A)
  - [ ] 5.1 Реализовать `services/admin_payment_details_service.py`
    - `set_admin_payment_details(actor, collection_card, payment_link, db)`: атомарно с `with_for_update` на singleton-строке; нормализация входа; Req 1.4 (оба `None` → `422`); валидация карты через `normalize_pan`/`luhn_ok` + длина 13–19 (иначе `400`); валидация ссылки (HTTPS-абсолют, ≤ 2048, иначе `422`); шифрование PAN + `last4`; замена/очистка/сохранение прежних по `model_fields_set`; аудит каждого изменённого реквизита через `record_admin_audit` (карта — только `last4`); полный `rollback` при ошибке
    - `get_admin_payment_details_masked(db)`: `payment_link` + `collection_card_last4` + `is_active` (без расшифровки)
    - `get_active_payment_requisites_full(db)`: расшифровка PAN → `PaymentRequisites`; `available = (card or link) is not None`
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.5, 2.6_

  - [ ]* 5.2 Property-тест round-trip и шифрования реквизитов
    - **Property 1: Реквизиты приёма — round-trip set/replace/read и шифрование PAN без разглашения**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1**
    - Генераторы валидных PAN (13–19 цифр + контроль Луна) и HTTPS-ссылок; проверка маскированного чтения, расшифровки, неразглашения PAN, полной замены при повторном сохранении

  - [ ]* 5.3 Property-тест отклонения невалидного реквизита
    - **Property 2: Невалидный реквизит отвергается без изменения прежних**
    - **Validates: Requirements 2.2, 2.3**
    - Генераторы невалидных PAN (нецифры/длина/Луна) и ссылок (не-HTTPS/относительные/> 2048); проверка ошибки и неизменности прежних реквизитов

  - [ ]* 5.4 Property-тест аудита с маскированием
    - **Property 4: Аудит изменений реквизитов с маскированием карты**
    - **Validates: Requirements 2.5, 2.6**
    - Проверка записи аудита (actor_id, field, old/new, timestamp); для карты old/new только `last4`, никогда полный PAN

  - [ ]* 5.5 Интеграционные тесты граничных случаев реквизитов
    - Пустой запрос (ни карты, ни ссылки) → `422`, прежние не меняются (Req 1.4); отсутствие `COLLECTION_CARD_ENC_KEY` при set/чтении полного PAN → `503`, данные не пишутся/не расшифровываются
    - _Requirements: 1.4, 2.1_

- [ ] 6. Предъявление реквизитов по сделке (`deal_to_read`)
  - [ ] 6.1 Расширить `deal_to_read` полем `payment_requisites`
    - В `services/deal_service.py`: при `deal.status == CONFIRMED` и наличии Активного_Платёжного_Реквизита добавлять `payment_requisites` (полный PAN и/или ссылка) для работника, блогера и админа; при отсутствии активных — `available=false` без ошибки; для прочих статусов — `None`
    - Использовать `get_active_payment_requisites_full`
    - _Requirements: 3.1, 3.2, 3.3, 2.4_

  - [ ]* 6.2 Property-тест видимости полного PAN
    - **Property 3: Полный номер Карты_Приёма виден только по правилу роли и статуса**
    - **Validates: Requirements 2.4, 3.1, 3.3**
    - Генераторы зрителей (роль × участие) и статусов сделки; полный PAN присутствует ⟺ (`Admin`/`Tech_Admin` или работник/блогер) ∧ `CONFIRMED` ∧ активная карта

  - [ ]* 6.3 Интеграционные тесты доступа и отсутствия реквизитов
    - `CONFIRMED` без активных реквизитов → `available=false` без ошибки (Req 3.2); посторонний по сделке → `403` (Req 3.4)
    - _Requirements: 3.2, 3.4_

- [ ] 7. Checkpoint — Блок A (реквизиты приёма)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Эскроу — машина состояний и общая смена статуса
  - [ ] 8.1 Обновить `_status_order` и добавить хелперы удержания
    - В `services/deal_service.py`: `_status_order` = `NEW(0) < REVIEW(1) < CONFIRMED(2) < ESCROW_HELD(3) < PAID(4) < COMPLETED(5)`, `REJECTED`/`REFUNDED` = `-1` (терминал)
    - Добавить `_escrow_hold_key(deal_id) -> "deal:{id}:escrow:hold"` и `_get_escrow_hold(deal_id, db) -> LedgerEntry | None`
    - _Requirements: 8.1, 6.1_

  - [ ] 8.2 Перестроить `admin_patch_deal_status`
    - Удалить блок начисления по пересечению границы `PAID` (начисление теперь только в `admin_distribute_escrow`)
    - Отклонять (`409`) переходы в `ESCROW_HELD`/`PAID`/`REFUNDED` с указанием использовать дедикейтед-действие (Req 6.4: прямой `CONFIRMED → PAID` запрещён)
    - `REFUNDED` — терминальный: любой переход из него → `409` (Req 7.6); `REJECTED` только из `NEW`/`REVIEW`/`CONFIRMED`; `PAID → COMPLETED` сохранён
    - _Requirements: 6.4, 6.5, 7.6, 8.2, 8.3_

  - [ ]* 8.3 Property-тест допустимости переходов
    - **Property 11: Допустимость переходов статусов**
    - **Validates: Requirements 6.1, 6.5, 8.2, 8.3**
    - `ESCROW_HELD` только из `CONFIRMED`; `COMPLETED` только из `PAID`; `REJECTED` только из `NEW`/`REVIEW`/`CONFIRMED`; иное → отклонение без смены статуса

  - [ ]* 8.4 Property-тест терминальности `REFUNDED`
    - **Property 14: REFUNDED — терминальный статус**
    - **Validates: Requirements 7.6**
    - Любой запрос смены статуса из `REFUNDED` (включая эскроу-действия и общий patch) → отклонение, статус остаётся `REFUNDED`

- [ ] 9. Эскроу — Подтверждение_Получения
  - [ ] 9.1 Реализовать `admin_confirm_receipt(deal_id, admin_user, reason, db)`
    - В `services/deal_service.py`: `SELECT ... FOR UPDATE`; идемпотентность (если `_get_escrow_hold` вернул строку → успех без новых записей, статус/балансы без изменений); иначе при `status != CONFIRMED` → `409`; иначе `status = ESCROW_HELD` + `LedgerEntry(user_id=platform, deal_id, amount_kopeks=Base_Amount, status=escrow_held, idempotency_key="deal:{id}:escrow:hold", note=reason)` без движения балансов; `DealAdminLog(action="receipt_confirm", old=CONFIRMED, new=ESCROW_HELD, admin_id, reason)`; `commit`
    - `Base_Amount = deal_distribution_amount_kopeks(deal)` (`agreed_price_kopeks` иначе `price`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_

  - [ ]* 9.2 Property-тест фиксации удержания без движения балансов
    - **Property 5: Подтверждение_Получения фиксирует удержание без движения балансов**
    - **Validates: Requirements 4.1, 4.2**
    - `CONFIRMED → ESCROW_HELD`, ровно одно Удержание_Эскроу на `Base_Amount`; балансы работника/блогера/аплайна/платформы неизменны

  - [ ]* 9.3 Property-тест отклонения вне `CONFIRMED`
    - **Property 6: Подтверждение_Получения отвергается вне статуса CONFIRMED**
    - **Validates: Requirements 4.4**
    - Сделка вне `CONFIRMED` без существующего удержания → ошибка, статус неизменен

- [ ] 10. Эскроу — Распределение
  - [ ] 10.1 Реализовать `admin_distribute_escrow(deal_id, admin_user, reason, db)`
    - В `services/deal_service.py`: `FOR UPDATE`; идемпотентность через `_paid_bundle_exists` (успех без изменений); иначе при `status != ESCROW_HELD` → `409` (запрет распределения без удержания, балансы неизменны); иначе проверка системного счёта платформы (Req 9.5, внутри `_accrue_paid_deal`); `_accrue_paid_deal(deal, db)` (без изменений логики, ключи `deal:{id}:paid:{role}`); `status = PAID`; `hold.status = escrow_released`; `DealAdminLog(action="distribute", old=ESCROW_HELD, new=PAID, admin_id, reason)`; `commit`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2, 6.3, 9.5_

  - [ ]* 10.2 Property-тест сохранения суммы и адресности начислений
    - **Property 7: Распределение — сохранение суммы и адресность начислений**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - `ESCROW_HELD → PAID`; прирост баланса каждого участника = его доля; платформе ровно `pk`; сумма долей = `Base_Amount`

  - [ ]* 10.3 Property-тест маршрутизации Реферальной_Доли
    - **Property 8: Маршрутизация Реферальной_Доли при Распределении**
    - **Validates: Requirements 5.4, 5.5**
    - Валидный аплайн (`Bloger`, `≠` блогера) получает `uk`; иначе `bk += uk` и начисление аплайну = 0

  - [ ]* 10.4 Property-тест пометки удержания распределённым
    - **Property 9: Распределение помечает Удержание_Эскроу распределённым**
    - **Validates: Requirements 5.7**
    - После Распределения удержание = `escrow_released`, исключено из учёта удерживаемых средств

  - [ ]* 10.5 Property-тест невозможности Распределения без эскроу
    - **Property 10: Невозможность Распределения без подтверждённого получения средств**
    - **Validates: Requirements 6.2, 6.3, 6.4**
    - Сделка вне `ESCROW_HELD` (в т.ч. `CONFIRMED`) → Распределение отклонено, статус и балансы неизменны; `PAID` достижим только из `ESCROW_HELD`

  - [ ]* 10.6 Property-тест калькулятора распределения
    - **Property 16: Калькулятор_Распределения — неотрицательность, целочисленность и сохранение суммы**
    - **Validates: Requirements 9.1**
    - Чистая функция `distribute_price_kopeks`; БД не требуется; генераторы базовой суммы и весов (с отбрасыванием «все нули»)

  - [ ]* 10.7 Интеграционный тест отсутствия системного счёта платформы
    - Нет `platform_revenue_user_id` при Распределении → `500`, балансы участников неизменны, удержание остаётся `escrow_held`
    - _Requirements: 9.5_

- [ ] 11. Эскроу — Возврат
  - [ ] 11.1 Реализовать `admin_refund_escrow(deal_id, admin_user, reason, db)`
    - В `services/deal_service.py`: `FOR UPDATE`; идемпотентность (уже `REFUNDED` + удержание помечено возвращённым → успех без изменений); иначе при `status != ESCROW_HELD` → `409`; иначе `status = REFUNDED`; `hold.status = escrow_refunded` (исключено из учёта удерживаемых средств); балансы не меняются, начислений нет; `DealAdminLog(action="refund", old=ESCROW_HELD, new=REFUNDED, admin_id, reason)`; `commit`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [ ]* 11.2 Property-тест реверса удержания без начислений
    - **Property 12: Возврат реверсирует удержание без начислений**
    - **Validates: Requirements 7.1, 7.2, 7.7, 9.3**
    - `ESCROW_HELD → REFUNDED`, удержание = `escrow_refunded`; балансы неизменны; суммарные начисления по сделке = 0

  - [ ]* 11.3 Property-тест отклонения Возврата вне `ESCROW_HELD`
    - **Property 13: Возврат отвергается вне статуса ESCROW_HELD**
    - **Validates: Requirements 7.4**
    - Сделка вне `ESCROW_HELD` → Возврат отклонён, статус неизменен

- [ ] 12. Эскроу — сквозные инварианты (идемпотентность и журнал)
  - [ ]* 12.1 Property-тест идемпотентности трёх действий
    - **Property 15: Идемпотентность Подтверждения_Получения, Распределения и Возврата**
    - **Validates: Requirements 4.7, 5.6, 9.2, 9.4**
    - Любое число повторов: одно удержание; балансы/посделочные записи неизменны после первого Распределения; Возврат не реверсируется повторно; итог по Подтверждение→Распределение = `Base_Amount` ровно один раз

  - [ ]* 12.2 Property-тест журналирования эскроу-действий
    - **Property 17: Журналирование эскроу-действий**
    - **Validates: Requirements 4.3, 7.3, 8.6**
    - Для каждого из {Подтверждение_Получения, Распределение, Возврат} создаётся `DealAdminLog` с admin_id, прежним/новым статусом и причиной 1–1000 символов

- [ ] 13. Роутеры (`routers/admin.py`)
  - [ ] 13.1 Эндпоинты реквизитов приёма
    - `GET /admin/payment-details` (→ `AdminPaymentDetailsRead`, маскированно) и `PUT /admin/payment-details` (`AdminPaymentDetailsSet` → set/replace/валидация/аудит) под `get_current_admin_or_tech`
    - _Requirements: 1.1, 1.3, 1.5_

  - [ ] 13.2 Эндпоинты эскроу-действий
    - `POST /admin/deals/{id}/confirm-receipt`, `/distribute`, `/refund` (body `AdminEscrowActionRequest`) под `get_current_admin_or_tech`, вызывают соответствующие функции `deal_service`
    - _Requirements: 4.5, 7.5, 8.4, 8.5_

  - [ ]* 13.3 Интеграционные тесты авторизации ролей
    - Реквизиты (`GET`/`PUT`) и три эскроу-действия: `worker`/`bloger`/аноним → `403` без изменения состояния; `admin`/`tech_admin` → успех; пустая/пробельная/> 1000 причина → `422`, статус неизменен
    - _Requirements: 1.5, 4.5, 4.6, 7.5, 8.4, 8.5_

- [ ] 14. Checkpoint — бэкенд завершён
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Фронтенд — типы и API-клиент
  - [ ] 15.1 Типы `lib/types.ts`
    - `DealStatus += "ESCROW_HELD" | "REFUNDED"`; добавить `PaymentRequisites`, `AdminPaymentDetails`, `AdminPaymentDetailsSet`; в `DealRead` — `payment_requisites: PaymentRequisites | null`
    - _Requirements: 3.1, 8.1_

  - [ ] 15.2 API-методы `lib/api.ts`
    - `getAdminPaymentDetails()`, `setAdminPaymentDetails({ collection_card, payment_link })`, `confirmDealReceipt(id, { reason })`, `distributeDeal(id, { reason })`, `refundDeal(id, { reason })`
    - _Requirements: 1.1, 1.3, 4.1, 5.1, 7.1_

- [ ] 16. Фронтенд — админка (`admin-dashboard.tsx`)
  - [ ] 16.1 Карточка управления реквизитами приёма
    - В секции «Финансы платформы» добавить карточку в стиле `metricGroup` (согласованно с `financeHero`/`metricGroups`): поле Платёжной_Ссылки, поле Карты_Приёма (переиспользовать `payout-card-input.tsx`, Luhn 13–19), отображение `last4`/ссылки, кнопка сохранения через `setAdminPaymentDetails`
    - _Requirements: 1.1, 1.3, 2.2_

  - [ ] 16.2 Эскроу-действия по сделке + статусы и фильтры
    - Кнопки «Подтвердить получение» (`CONFIRMED`), «Распределить» (`ESCROW_HELD`), «Возврат» (`ESCROW_HELD`), каждая открывает `Modal` с обязательным полем причины (`TextArea`, 1..1000); добавить `StatusPill` и фильтры для `ESCROW_HELD`/`REFUNDED`
    - _Requirements: 4.1, 5.1, 7.1, 8.1_

  - [ ] 16.3 Показ реквизитов приёма по сделке
    - В деталях сделки в `CONFIRMED` показывать `payment_requisites` (полный PAN и/или ссылка) с `CopyButton`; при `available=false` — подсказка «Реквизиты приёма не настроены»
    - _Requirements: 3.1, 3.2_

  - [ ]* 16.4 UI-тесты админки (React Testing Library)
    - Сохранение реквизитов и отображение `last4`/ссылки; видимость эскроу-кнопок по статусу и модалка причины; статусы/фильтры `ESCROW_HELD`/`REFUNDED`; отображение `payment_requisites` с `CopyButton`
    - _Requirements: 1.3, 3.1, 4.1, 8.1_

- [ ] 17. Фронтенд — кабинет (`cabinet-dashboard.tsx`)
  - [ ] 17.1 Показ реквизитов приёма по своей сделке в `CONFIRMED`
    - Показывать `payment_requisites` (полный PAN и/или ссылку) с `CopyButton` только для своих сделок в `CONFIRMED`; добавить лейблы статусов `ESCROW_HELD`/`REFUNDED`
    - _Requirements: 3.1, 3.3_

  - [ ]* 17.2 UI-тесты кабинета
    - Реквизиты видны только в `CONFIRMED` своей сделки; статусы `ESCROW_HELD`/`REFUNDED` отображаются корректно
    - _Requirements: 3.1, 3.3_

- [ ] 18. Обратная совместимость и регрессии
  - [ ]* 18.1 Регресс посделочных начислений и идемпотентности `PAID`
    - Существующие начисления `deal:{id}:paid:{role}` и их идемпотентность сохранены; сделки в `PAID`/`COMPLETED` ведут себя как прежде; прямой `CONFIRMED → PAID` через общий patch отклонён
    - _Requirements: 5.6, 6.4, 8.1_

  - [ ]* 18.2 Совместимость с финансовым дашбордом соседнего спека
    - Запись Удержания_Эскроу (`status` ∈ escrow_*, `deal_id` непустой, ключ `deal:{id}:escrow:hold`) исключена из агрегатов дашборда (доля платформы, выплаты, «в ожидании»); доля платформы и выплаты не искажаются
    - _Requirements: 5.7, 7.7_

- [ ] 19. Финальный checkpoint — все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи, помеченные `*`, опциональны (тесты) и могут быть пропущены для ускорения MVP; основная реализация не помечается `*` и должна быть выполнена.
- Каждая задача ссылается на конкретные требования (`_Requirements: X.Y_`) и/или свойства корректности для трассируемости и на компоненты дизайна.
- Property-тесты на Hypothesis: один тест на свойство, тег `# Feature: platform-escrow-payments, Property {N}: {текст}`, `@settings(max_examples=100)`. Чистые функции (`card_crypto`, `distribute_price_kopeks`) — без БД; сервисные свойства — на транзакционной тестовой сессии с откатом после каждого примера.
- Property-тесты размещены рядом с реализацией (на одну волну позже), чтобы ошибки ловились рано.
- Миграции `ALTER TYPE ... ADD VALUE` в `autocommit_block` не откатываются транзакцией теста; тесты, зависящие от новых значений enum, исполняются на БД с применёнными миграциями.
- Чекпоинты обеспечивают инкрементальную валидацию. Все денежные значения — целые копейки; преобразование в рубли только на UI (÷100, 2 знака).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "3.1", "3.2", "4.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "4.2", "5.1", "8.1"] },
    { "id": 2, "tasks": ["2.4", "5.2", "5.3", "5.4", "5.5", "8.2"] },
    { "id": 3, "tasks": ["6.1", "8.3", "8.4"] },
    { "id": 4, "tasks": ["9.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["10.1", "9.2", "9.3"] },
    { "id": 6, "tasks": ["11.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7"] },
    { "id": 7, "tasks": ["13.1", "11.2", "11.3", "12.1", "12.2"] },
    { "id": 8, "tasks": ["13.2", "15.1", "15.2"] },
    { "id": 9, "tasks": ["13.3", "16.1"] },
    { "id": 10, "tasks": ["16.2", "17.1"] },
    { "id": 11, "tasks": ["16.3", "17.2"] },
    { "id": 12, "tasks": ["16.4", "18.1", "18.2"] }
  ]
}
```
