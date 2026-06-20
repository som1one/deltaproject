# Implementation Plan: Заказы через реферал воркера

## Overview

Реализация подсистемы «Заказы через реферал воркера» — расширения маркетплейса блогеров. Включает: новые модели данных и миграции, state machine переходов статусов, систему сообщений, уведомлений, управление расчётным счётом, расширение EscrowService (подтверждение оплаты, возврат средств), кабинет воркера и админские эндпоинты. Стек: Python/FastAPI, PostgreSQL, Alembic, Hypothesis (PBT).

## Tasks

- [x] 1. Модели данных, enum и миграции
  - [x] 1.1 Добавить статус CANCELLED в MarketplaceOrderStatus enum и новые поля MarketplaceOrder
    - Добавить `CANCELLED = "CANCELLED"` в `enums/marketplace.py` → `MarketplaceOrderStatus`
    - Добавить в `models/marketplace_order.py` поля: `refunded_at`, `refund_reason`, `refunded_by`, `confirmed_by`, `blogger_confirmed_at`
    - _Requirements: 10.1, 10.5, 11.3_

  - [x] 1.2 Создать модель SettlementAccount
    - Создать файл `models/settlement_account.py` с моделью singleton-записи (id=1)
    - Поля: `account_number` (String 20), `bic` (String 9), `bank_name` (String 255), `recipient_name` (String 255), `updated_by` (UUID FK), `updated_at`
    - _Requirements: 1.1, 1.2_

  - [x] 1.3 Создать модель MarketplaceMessage
    - Создать файл `models/marketplace_message.py`
    - Поля: `id` (UUID PK), `sender_id`, `recipient_id` (FK users), `text` (String 2000), `created_at`
    - Индексы: `ix_mkt_msg_conversation` (sender_id, recipient_id), `ix_mkt_msg_created_at`
    - _Requirements: 8.2, 8.3, 8.5_

  - [x] 1.4 Создать модель Notification
    - Создать файл `models/notification.py`
    - Поля: `id` (UUID PK), `user_id` (FK users), `event_type` (String 50), `payload` (JSONB), `is_read` (Boolean, default false), `created_at`
    - Индексы: `ix_notifications_user_unread`, `ix_notifications_created_at`
    - _Requirements: 14.5_

  - [x] 1.5 Создать модель OrderStatusHistory
    - Создать файл `models/order_status_history.py`
    - Поля: `id` (UUID PK), `order_id` (FK marketplace_orders), `old_status`, `new_status`, `changed_by` (FK users), `reason` (nullable), `created_at`
    - Индекс: `ix_osh_order_id`
    - _Requirements: 13.4_

  - [x] 1.6 Создать Alembic-миграцию для всех новых таблиц и изменений
    - ALTER TYPE добавить CANCELLED в PostgreSQL enum `marketplaceorderstatus`
    - ALTER TABLE `marketplace_orders` добавить новые колонки
    - CREATE TABLE `settlement_accounts`, `marketplace_messages`, `notifications`, `order_status_history`
    - Создать все индексы
    - _Requirements: 1.1, 8.2, 10.1, 13.4, 14.5_

- [x] 2. Pydantic-схемы
  - [x] 2.1 Создать схемы для расчётного счёта
    - Создать файл `schemas/settlement_account.py`
    - `SettlementAccountUpsert` с regex-валидацией `^\d{20}$` для номера, `^\d{9}$` для БИК
    - `SettlementAccountResponse` с полями account_number, bic, bank_name, recipient_name, updated_at
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 Расширить схемы заказов
    - Обновить `schemas/marketplace_orders.py`: добавить `OrderDetailResponse` с `settlement_account` и `available_actions`
    - Добавить `RefundRequest` с валидацией причины (1–1000 символов, не пробелы)
    - Добавить `CommissionSettingsUpdate` с model_validator (сумма ≤ 80%)
    - _Requirements: 2.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.4_

  - [x] 2.3 Создать схемы для сообщений
    - Создать файл `schemas/marketplace_messages.py`
    - `MessageSendRequest` с валидацией текста (1–2000 символов, не пробелы)
    - `MessageResponse`, `ConversationResponse` с пагинацией
    - _Requirements: 8.4, 8.5_

  - [x] 2.4 Создать схемы для уведомлений и кабинета воркера
    - Добавить `NotificationResponse`, `NotificationListResponse`, `MarkReadRequest`
    - Добавить `ReferralInfo`, `CommissionEntry`, `WorkerMarketplaceStats`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 14.5_

- [x] 3. State Machine и OrderService
  - [x] 3.1 Реализовать state machine переходов статусов
    - Создать файл `services/order_state_machine.py`
    - Реализовать `ALLOWED_TRANSITIONS` dict и функцию `validate_transition(current, target) -> bool`
    - Реализовать `transition_order(db, order, target_status, changed_by, reason)` — атомарное обновление + запись в OrderStatusHistory
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 3.2 Property-тест: допустимость переходов статусов
    - **Property 4: Допустимость переходов статусов (State Machine)**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.5, 11.7, 3.3**

  - [x] 3.3 Расширить эндпоинт создания заказа
    - Обновить `POST /marketplace/orders` в `routers/marketplace_orders.py`: добавить `amount_kopeks` из тела запроса, снапшот комиссий, привязку worker_id из `marketplace_referred_by`
    - Валидация: message (1–1000), amount_kopeks (100–1_000_000_000), блогер активен
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 6.4, 7.7_

  - [x]* 3.4 Property-тест: валидация создания заказа
    - **Property 10: Валидация создания заказа**
    - **Validates: Requirements 9.3, 9.4**

  - [x] 3.5 Реализовать отмену заказа клиентом
    - Добавить эндпоинт `PATCH /marketplace/orders/{id}/cancel` в `routers/marketplace_orders.py`
    - Разрешить только из PENDING_PAYMENT, только клиенту-владельцу
    - _Requirements: 10.5_

  - [x] 3.6 Реализовать подтверждение выполнения блогером (расширить complete)
    - Обновить `PATCH /marketplace/orders/{id}/complete` — установить `blogger_confirmed_at`, перевести в `BLOGGER_CONFIRMED`
    - Проверка: только назначенный блогер, только из ESCROW_HELD
    - Отправить уведомление заказчику
    - _Requirements: 4.1, 4.2, 4.3, 14.2_

  - [x] 3.7 Реализовать подтверждение получения заказчиком (расширить confirm)
    - Обновить `PATCH /marketplace/orders/{id}/confirm` — перевести в COMPLETED, запустить distribute_funds
    - Проверка: только заказчик-владелец, только из BLOGGER_CONFIRMED
    - Отправить уведомления блогеру и воркеру
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 14.3_

  - [x]* 3.8 Property-тест: контроль доступа при подтверждении
    - **Property 11: Контроль доступа при подтверждении**
    - **Validates: Requirements 4.3, 4.6**

  - [x] 3.9 Реализовать расширенный ответ с деталями заказа
    - Обновить `GET /marketplace/orders/{id}` — возвращать `settlement_account` (только для PENDING_PAYMENT), `available_actions` в зависимости от роли и статуса
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 3.10 Property-тест: видимость реквизитов по статусу
    - **Property 14: Видимость реквизитов по статусу**
    - **Validates: Requirements 2.3**

- [x] 4. Checkpoint — Проверка state machine и базового flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. SettlementAccountService и админские эндпоинты реквизитов
  - [x] 5.1 Реализовать SettlementAccountService
    - Создать файл `services/settlement_account_service.py`
    - Реализовать `get_settlement_account(db)` и `upsert_settlement_account(db, data, admin_id)`
    - Singleton-логика: всегда id=1, upsert через INSERT ON CONFLICT
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 Создать роутер для расчётного счёта
    - Добавить эндпоинты в `routers/marketplace_admin.py`: `GET /admin/settlement-account`, `PUT /admin/settlement-account`
    - Проверка роли Admin
    - _Requirements: 1.1, 1.2, 1.7_

  - [x]* 5.3 Property-тест: валидация полей расчётного счёта
    - **Property 5: Валидация полей расчётного счёта**
    - **Validates: Requirements 1.3, 1.4**

- [x] 6. EscrowService — подтверждение оплаты и возврат
  - [x] 6.1 Реализовать confirm_payment в EscrowService
    - Добавить функцию `confirm_payment(order_id, admin_id, db)` в `services/marketplace_escrow_service.py`
    - Логика: проверить статус PENDING_PAYMENT → переход ESCROW_HELD + freeze_funds + запись confirmed_by
    - Идемпотентность через `idempotency_key = f"{order_id}:confirm_payment"`
    - Уведомление блогеру
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.2 Реализовать process_refund в EscrowService
    - Добавить функцию `process_refund(order_id, admin_id, reason, db)` в `services/marketplace_escrow_service.py`
    - Логика: проверить статус ESCROW_HELD или BLOGGER_CONFIRMED → REFUNDED, сохранить reason, refunded_at, refunded_by
    - Балансы НЕ меняются (средства были заморожены, не распределены)
    - Уведомления заказчику и блогеру
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 14.4_

  - [x] 6.3 Добавить админские эндпоинты подтверждения и возврата
    - `PATCH /admin/marketplace/orders/{id}/confirm-payment` в `routers/marketplace_admin.py`
    - `PATCH /admin/marketplace/orders/{id}/refund` в `routers/marketplace_admin.py`
    - Проверка роли Admin, валидация тела запроса (RefundRequest)
    - _Requirements: 3.4, 11.6_

  - [x]* 6.4 Property-тест: возврат не меняет балансы
    - **Property 12: Возврат не меняет балансы**
    - **Validates: Requirements 11.2**

  - [x]* 6.5 Property-тест: валидация причины возврата
    - **Property 13: Валидация причины возврата**
    - **Validates: Requirements 11.4**

- [x] 7. Распределение средств и комиссии
  - [x] 7.1 Реализовать эндпоинты настройки комиссий
    - Добавить `GET /admin/marketplace/commission-settings` и `PUT /admin/marketplace/commission-settings` в `routers/marketplace_admin.py`
    - Использовать `CommissionSettingsUpdate` schema с cross-field валидацией
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 7.2 Property-тест: валидация комиссий
    - **Property 6: Валидация комиссий**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

  - [x] 7.3 Расширить distribute_funds для учёта worker_commission
    - Убедиться, что `services/marketplace_escrow_service.py` → `distribute_funds` корректно использует `worker_commission_pct` из снапшота заказа
    - Если worker_pct = 0 (нет воркера) → вся доля воркера уходит блогеру
    - Записи LedgerEntry для каждого получателя
    - Идемпотентность: `idempotency_key = f"{order_id}:distribute"`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 7.4 Property-тест: инвариант суммы распределения
    - **Property 1: Инвариант суммы распределения**
    - **Validates: Requirements 5.5**

  - [x]* 7.5 Property-тест: корректность формулы распределения
    - **Property 2: Корректность формулы распределения**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x]* 7.6 Property-тест: идемпотентность распределения
    - **Property 3: Идемпотентность распределения средств**
    - **Validates: Requirements 5.7**

- [x] 8. Checkpoint — Проверка финансовой логики
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. MessageService — переписка заказчика и блогера
  - [x] 9.1 Реализовать MessageService
    - Создать файл `services/marketplace_message_service.py`
    - Реализовать `send_message(db, sender_id, recipient_id, text)` — валидация текста, сохранение
    - Реализовать `get_conversation(db, user_id, partner_id, page, page_size)` — пагинация, хронологический порядок
    - Создание уведомления получателю при отправке
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 9.2 Создать роутер для сообщений
    - Создать файл `routers/marketplace_messages.py`
    - `POST /marketplace/messages` — отправка сообщения (роль Client или Blogger)
    - `GET /marketplace/messages/{partner_id}` — история с пагинацией
    - Проверка доступа: только участники переписки или Admin
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x]* 9.3 Property-тест: валидация сообщений
    - **Property 8: Валидация сообщений**
    - **Validates: Requirements 8.4**

  - [x]* 9.4 Property-тест: хронологический порядок сообщений
    - **Property 9: Хронологический порядок сообщений**
    - **Validates: Requirements 8.5**

- [x] 10. NotificationService
  - [x] 10.1 Реализовать NotificationService
    - Создать файл `services/notification_service.py`
    - Реализовать `notify(db, user_id, event_type, payload)` — создание in-app нотификации
    - Реализовать `get_notifications(db, user_id, page, page_size, unread_only)` — пагинированный список
    - Реализовать `mark_as_read(db, user_id, notification_ids)` — отметить прочитанными (только свои)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 10.2 Создать роутер для уведомлений
    - Добавить эндпоинты `GET /marketplace/notifications`, `PATCH /marketplace/notifications/read`
    - Может быть в `routers/marketplace_orders.py` или отдельный файл
    - _Requirements: 14.5_

- [x] 11. Пожизненная привязка воркера
  - [x] 11.1 Реализовать логику неизменяемости marketplace_referred_by
    - Добавить проверку в `services/marketplace_referral_service.py`: если `marketplace_referred_by` уже установлено — запретить перезапись
    - Убедиться, что при создании заказа `worker_id` берётся из `marketplace_referred_by` заказчика
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 11.2 Property-тест: неизменяемость привязки воркера
    - **Property 7: Неизменяемость привязки воркера**
    - **Validates: Requirements 6.3**

- [x] 12. WorkerDashboardService — кабинет воркера
  - [x] 12.1 Реализовать WorkerDashboardService
    - Создать файл `services/worker_dashboard_service.py`
    - Реализовать `get_referrals(db, worker_id, page, page_size)` — список приведённых заказчиков
    - Реализовать `get_commission_history(db, worker_id, page, page_size)` — история начислений
    - Реализовать `get_stats(db, worker_id)` — сводка (баланс, общая сумма комиссий)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 12.2 Создать роутер кабинета воркера
    - Добавить эндпоинты: `GET /marketplace/worker/referrals`, `GET /marketplace/worker/commissions`, `GET /marketplace/worker/stats`
    - Проверка роли Worker
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 13. Админские эндпоинты управления заказами
  - [x] 13.1 Реализовать список заказов с фильтрами
    - Добавить `GET /admin/marketplace/orders` в `routers/marketplace_admin.py`
    - Фильтрация по: статусу, дате, blogger_id, client_id, worker_id
    - Пагинация (page_size=50)
    - _Requirements: 13.1, 13.2_

  - [x] 13.2 Реализовать детали заказа и сводку
    - `GET /admin/marketplace/orders/{id}` — полная информация + history + ledger entries + доли распределения
    - `GET /admin/marketplace/summary` — оборот, количество по статусам, сумма комиссий воркерам
    - _Requirements: 13.3, 13.4, 13.5_

- [x] 14. Интеграция и wiring
  - [x] 14.1 Зарегистрировать новые роутеры в main.py
    - Подключить `marketplace_messages` router
    - Убедиться, что все новые эндпоинты доступны
    - _Requirements: 8.1, 12.1, 14.5_

  - [x] 14.2 Интеграция NotificationService во все переходы статусов
    - При ESCROW_HELD → уведомление блогеру
    - При BLOGGER_CONFIRMED → уведомление заказчику
    - При COMPLETED → уведомления блогеру и воркеру
    - При REFUNDED → уведомления заказчику и блогеру
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x]* 14.3 Unit-тесты: полный жизненный цикл заказа
    - Тест happy path: create → confirm_payment → complete → confirm → distribute
    - Тест cancel path: create → cancel
    - Тест refund path: create → confirm_payment → refund
    - _Requirements: 3.1, 4.2, 4.5, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1_

  - [x]* 14.4 Unit-тесты: сервисы (messages, notifications, worker dashboard)
    - Тесты отправки и получения сообщений
    - Тесты создания и получения уведомлений
    - Тесты кабинета воркера (рефералы, комиссии, статистика)
    - _Requirements: 8.2, 8.3, 8.5, 12.1, 12.2, 12.3, 14.5_

- [x] 15. Final checkpoint — Финальная проверка
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Hypothesis library)
- Unit tests validate specific examples and edge cases
- Все суммы в копейках (целые числа), формула: `blogger = amount - floor(amount*platform_pct/100) - floor(amount*worker_pct/100)`
- Существующий `marketplace_escrow_service.py` уже содержит `freeze_funds`, `distribute_funds`, `refund_to_client` — расширяем, не переписываем

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3.1", "5.1", "9.1", "10.1", "11.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.2", "7.1", "9.2", "10.2", "12.1"] },
    { "id": 4, "tasks": ["3.4", "3.5", "3.6", "5.3", "7.2", "9.3", "9.4", "11.2", "12.2"] },
    { "id": 5, "tasks": ["3.7", "3.8", "6.1", "7.3", "13.1"] },
    { "id": 6, "tasks": ["3.9", "3.10", "6.2", "6.3", "13.2"] },
    { "id": 7, "tasks": ["6.4", "6.5", "7.4", "7.5", "7.6", "14.1"] },
    { "id": 8, "tasks": ["14.2"] },
    { "id": 9, "tasks": ["14.3", "14.4"] }
  ]
}
```
