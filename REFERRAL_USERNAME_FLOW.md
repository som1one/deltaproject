# Referral Username Flow (утверждено)

Цель: единый и прозрачный поток для `site.com/ref/{username}` и `linked_to` в регистрации.

## Принятое решение

1. Публичный входной URL фронта: `/ref/{username}`.
2. Фронт резолвит `username` через бэкенд в `blogger_id`.
3. При `POST /auth/register` фронт отправляет `linked_to = blogger_id`.
4. `PATCH /referral/add` остается как fallback для legacy-сценариев (поздняя привязка), но не основной happy-path.

## Контракт резолва

Рекомендуемый ответ на `GET /referral/{username}`:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "username": "vika-daily",
  "link": "site.com/ref/vika-daily"
}
```

Фронт берет `user_id` и кладет его в `linked_to` при регистрации.

## Текущие расхождения в коде (нужно выровнять)

- В `routers/referral.py` используется `get_referral_by_username`, но она не импортирована.
- В `services/referral_service.py` поиск идет по `ReferralLink.username`, а в `models/referral.py` поля `username` нет.
- `ReferralRead` не содержит `username` (для UI `/ref/{username}` это неудобно).

## Технический план выравнивания

1. Миграция БД: добавить в `ref_links` поле `username` (`unique`, `index`, `lowercase slug`).
2. Модель `ReferralLink`: добавить `username`.
3. Сервис: исправить `get_referral_by_username()` и убрать двойной `scalar_one_or_none()`.
4. Роутер: импортировать `get_referral_by_username`.
5. Схема: расширить `ReferralRead` полем `username`.
6. При `POST /referral` проверять уникальность `username` (409 при конфликте).

## Правила фронта

- На экране `/ref/{username}` сохранять `blogger_id` в local state/session storage до сабмита регистрации.
- Не отправлять произвольный `linked_to`; использовать только id, полученный от `GET /referral/{username}`.
- После успешной регистрации очищать временный referral-контекст.

## Безопасность

- Бэкенд уже валидирует `linked_to` как существующего пользователя с ролью блогера.
- Лимиты анти-спама на реферальные регистрации по IP сохраняются через session_service.
