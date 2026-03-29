# Frontend API Contract (MVP)

Актуальный контракт для фронтенда по публичным/кабинетным ручкам (без админки).

## Общие правила

- Base URL: `<api-host>`
- Авторизация: `Authorization: Bearer <token>`
- Все суммы денег в API передаются в **копейках** (`int`).
- Ошибки в формате FastAPI: `{ "detail": "..." }`

## Enum

### `UserRole`
- `Worker`
- `Bloger`
- `Admin`

### `DealStatus`
- `NEW`
- `REVIEW`
- `CONFIRMED`
- `PAID`
- `COMPLETED`

Переходы статусов в `PATCH /deals/{deal_id}` только линейные:
`NEW -> REVIEW -> CONFIRMED -> PAID -> COMPLETED`.

### `LedgerEntryStatus`
- `payout_request`
- `freeze`
- `pending_confirmation`
- `completed`
- `rejected`

## Auth

### `POST /auth/register`
Request:
```json
{
  "name": "Иван",
  "email": "ivan@example.com",
  "telegram": "@ivan",
  "password": "string>=8",
  "role": "Worker",
  "linked_to": "uuid|null"
}
```
Response:
```json
{
  "message": "User created successfully",
  "token": "access_jwt",
  "refresh_token": "refresh_jwt"
}
```
Ошибки: `400`, `429`.

### `POST /auth/login`
Вход **только для Admin**.
Request:
```json
{
  "email": "ivan@example.com",
  "password": "..."
}
```
Response:
```json
{
  "message": "Login successful",
  "token": "access_jwt",
  "refresh_token": "refresh_jwt"
}
```
Ошибки: `400`, `403`, `429`.

### `POST /auth/user-login`
Вход для `Worker`/`Bloger` (не-админов).
Request:
```json
{
  "email": "ivan@example.com",
  "password": "..."
}
```
Response:
```json
{
  "message": "Login successful",
  "token": "access_jwt",
  "refresh_token": "refresh_jwt"
}
```
Ошибки: `400`, `403`, `429`.

### `POST /auth/refresh`
Request:
```json
{ "refresh_token": "..." }
```
Response:
```json
{ "token": "access_jwt", "refresh_token": "new_refresh_jwt" }
```
Ошибки: `401`, `404`, `429`.

### `POST /auth/logout`
Требует access token.
Response:
```json
{ "message": "Logout successful" }
```

## Me

### `GET /me`
Response (`UserMeRead`):
```json
{
  "id": "uuid",
  "name": "...",
  "email": "...",
  "telegram": "@...",
  "role": "Worker",
  "linked_to": "uuid|null",
  "percent": 0.0,
  "balance": 0,
  "balance_pending_confirmation_kopeks": 0
}
```

### `PATCH /me`
Request (`UserMePatch`): `name?`, `telegram?`, `email?`, `password?`, `current_password?`.
Response: как `GET /me`.

### `GET /me/stats`
Worker:
```json
{ "role": "Worker", "deals": 0, "agree": 0, "paid": 0, "earn": 0 }
```
Blogger:
```json
{ "role": "Bloger", "deals": 0, "earn": 0, "workers": 0 }
```

### `GET /me/deals`
Response:
```json
{
  "deals": [
    {
      "id": "uuid",
      "worker_id": "uuid",
      "bloger_id": "uuid",
      "shop_link": "...",
      "item_name": "...",
      "status": "NEW",
      "price": 1500000,
      "seller_tg": "@seller",
      "seller_number": "+7999...",
      "created_at": "2026-03-27T12:00:00Z"
    }
  ]
}
```

### `GET /me/ledger`
Query: `limit` (1..100), `offset` (>=0), `status?` из `LedgerEntryStatus`.
Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "deal_id": "uuid|null",
      "amount_kopeks": 0,
      "status": "completed",
      "created_at": "...",
      "updated_at": "...",
      "idempotency_key": "string|null",
      "note": "string|null"
    }
  ],
  "total": 0
}
```

### `POST /me/payout-requests`
Request:
```json
{ "amount_kopeks": 100000 }
```
Response: `LedgerEntryRead`.

## Deals

### `POST /deals`
Request:
```json
{
  "shop_link": "https://...",
  "item_name": "...",
  "seller_tg": "@...",
  "seller_number": "+7...",
  "price": 1500000,
  "bloger_id": "uuid"
}
```
Response: `DealRead`.
Ошибки: `403` (не worker), `400` (неверный блогер).

### `GET /deals/{deal_id}`
Response: `DealRead`.
Ошибки: `401`, `403`, `404`.

### `PATCH /deals/{deal_id}`
Request:
```json
{ "status": "REVIEW" }
```
Response: `DealRead`.
Ошибки: `400` (недопустимый переход), `403`, `404`.

## Referral

### `POST /referral`
Только блогер.
Request:
```json
{ "link": "site.com/ref/vika-daily" }
```
Response:
```json
{ "id": "uuid", "user_id": "uuid", "link": "..." }
```

### `PATCH /referral/add`
Request:
```json
{ "referral_id": "uuid" }
```
Response:
```json
{ "linked": true, "message": "...", "blogger_id": "uuid" }
```

### `GET /referral/{username}`
Публичный маршрут задуман под `site.com/ref/username`, но в текущем коде есть рассинхрон модели/сервиса; использовать после выравнивания flow в документе `REFERRAL_USERNAME_FLOW.md`.

## Admin

Все ручки требуют access-токен пользователя с ролью `Admin`.

### `GET /admin/users`
Query: `role?`, `email?`, `linked_to?`, `limit` (1..100), `offset` (>=0).
Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "...",
      "email": "...",
      "telegram": "@...",
      "role": "Worker",
      "linked_to": "uuid|null",
      "percent": 0.0,
      "balance": 0,
      "is_active": true
    }
  ],
  "total": 1
}
```

### `GET /admin/users/{user_id}`
Response: `AdminUserRead`.
Ошибки: `401`, `404`.

### `PATCH /admin/users/{user_id}`
Request (служебные правки):
```json
{
  "role": "Bloger",
  "percent": 10.0,
  "is_active": true,
  "email": "new@example.com",
  "telegram": "@newtg",
  "name": "Новое имя"
}
```
Response: `AdminUserRead`.
Ошибки: `401`, `404`, `409`.

### `GET /admin/users/{user_id}/ledger`
Быстрый аудит финансов конкретного пользователя.
Query: `status?`, `limit` (1..100), `offset` (>=0).
Response: `LedgerListResponse`.
Ошибки: `401`, `404`.

### `DELETE /admin/users/{user_id}`
Удаляет пользователя.
Response: `204 No Content`.
Ошибки: `401`, `404`, `409`.

### `GET /admin/deals`
Query: `status?`, `worker_id?`, `bloger_id?`, `from?`, `to?`.
Response: `DealRead[]`.
Ошибки: `401`, `404`.

### `GET /admin/deals/{deal_id}`
Response: `DealRead`.
Ошибки: `401`, `404`.

### `PATCH /admin/deals/{deal_id}/status`
Request:
```json
{ "status": "REVIEW", "reason": "Ручная модерация: уточнение статуса" }
```
Response: `DealRead`.
Ошибки: `401`, `404`, `409`.

### `POST /admin/deals/{deal_id}/recalc-finance`
Идемпотентно восстанавливает/досчитывает финансовые проводки сделки.
Request:
```json
{ "reason": "Пересчёт после ручной проверки" }
```
Response: `DealRead`.
Ошибки: `401`, `404`, `409`.

### `GET /admin/ledger`
Query: `status?`, `user_id?`, `from?`, `to?`, `limit` (1..100), `offset` (>=0).
Response: `LedgerListResponse`.
Ошибки: `401`.

### `GET /admin/ledger/{entry_id}`
Response: `LedgerEntryRead`.
Ошибки: `401`, `404`.

### `POST /admin/payouts/{entry_id}/complete`
Явно проводит выплату (переводит запись в `completed` и списывает сумму с баланса пользователя).
Response: `LedgerEntryRead`.
Ошибки: `401`, `404`, `409`.

## Rate limit (текущие дефолты)

- `register`: `5/minute;20/hour;60/day`
- `login`: `10/minute;40/hour;120/day`
- `refresh`: `30/minute;200/hour;800/day`
- `logout`: `60/minute;300/hour`
- `deals create`: `12/minute;80/hour;300/day`
- `deals mutate`: `45/minute;400/hour;2000/day`
- `deals read`: `90/minute;800/hour;4000/day`

Ключ лимитов: IP (с `X-Forwarded-For`) либо `user_id` из access JWT для защищённых ручек сделок.
