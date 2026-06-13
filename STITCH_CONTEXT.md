# ТЗ для Stitch: биржа блогеров

Сделай только frontend для marketplace-зоны в существующем проекте `frontend/` на Next.js App Router + TypeScript + CSS Modules. Backend уже существует. Нельзя менять API-контракты, нельзя выдумывать новые поля в ответах, нельзя требовать backend-эндпоинты, которых сейчас нет.

## Цель

Собрать 3 ключевые части биржи:

1. правильный публичный каталог блогеров;
2. правильный кабинет заказчика (Client);
3. правильный кабинет блогера (Bloger).

Интерфейс должен опираться только на существующие backend-спецификации проекта.

## Важный контекст по ролям

- `Client` — заказчик, регистрируется и логинится через `/marketplace/auth/*`, выбирает блогера, создаёт заказ, оплачивает, подтверждает выполнение, пишет в поддержку.
- `Bloger` — блогер, заполняет свой профиль, видит заказы, отмечает заказ выполненным, выводит деньги.
- `Worker` — воркер участвует в реферальной модели, но в этой задаче не является основной ролью UI биржи.

## Что делать нельзя

- Не менять backend.
- Не добавлять новые поля в существующие ответы API.
- Не рассчитывать, что backend вернёт:
  - `blogger_name`
  - `client_name`
  - `blogger_category`
  - `total_spent_kopeks`
  - `balance_kopeks` внутри профиля блогера
- Не использовать фиктивные данные в финальной реализации.
- Не делать “универсальный кабинет на все роли”. Нужны отдельные UX-сценарии для `Client` и `Bloger`.

## Техническая база, которую надо использовать

- Next.js App Router
- TypeScript
- CSS Modules
- React Query / TanStack Query
- существующий `useAuth()` из `frontend/lib/auth-context.tsx`
- `appConfig.apiBaseUrl`
- текущую marketplace-структуру маршрутов

## Главный принцип

Если каких-то display-полей нет в API, Stitch должен:

- либо показать данные без них;
- либо догрузить связанные сущности вторым запросом;
- либо аккуратно упростить UI.

Но Stitch не должен подменять отсутствие данных вымышленными полями.

---

## 1. Публичный каталог блогеров

### Маршрут

- `/marketplace`

### Источники данных

- `GET /marketplace/bloggers`
- `GET /marketplace/categories`

### Параметры каталога

`GET /marketplace/bloggers`

- `page`
- `category` — можно передавать несколько значений
- `min_subscribers`
- `max_subscribers`
- `min_price`
- `max_price`

### Ответ каталога

```ts
type BloggerCardResponse = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subscriber_count: number;
  average_price_kopeks: number;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
};

type BloggerCatalogResponse = {
  items: BloggerCardResponse[];
  total: number;
  page: number;
  page_size: number;
};
```

### Что должно быть в каталоге

- hero-блок биржи;
- список категорий;
- фильтры:
  - категория;
  - подписчики от/до;
  - цена от/до;
- сетка карточек блогеров;
- пагинация;
- пустое состояние;
- состояние загрузки;
- состояние ошибки.

### Что должно быть в карточке блогера

- фото или заглушка;
- имя;
- категория;
- число подписчиков;
- средняя цена интеграции;
- кнопка перехода в профиль;
- кнопка “Заказать”.

### Правила

- Показывать только реальные данные из API.
- Цену выводить из `average_price_kopeks`.
- Категорию приводить к человекочитаемой метке.
- Не делать фейковый рейтинг, отзывы, completion rate, сроки ответа, если их нет в backend.

---

## 2. Публичный профиль блогера

### Маршрут

- `/marketplace/bloggers/[id]`

### Источник данных

- `GET /marketplace/bloggers/{blogger_id}`

### Ответ

```ts
type BloggerProfileResponse = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subscriber_count: number;
  average_price_kopeks: number;
  description: string;
  portfolio_links: string[];
  social_links: string[];
  photo_url: string | null;
  preferred_contact: string | null;
  is_active: boolean;
  orders_enabled: boolean;
  created_at: string;
  updated_at: string;
};
```

### Что должно быть на странице

- большой блок профиля;
- фото;
- имя;
- категория;
- подписчики;
- цена;
- описание;
- ссылки на соцсети;
- ссылки на портфолио;
- статус “принимает заказы / не принимает заказы”;
- CTA “Оформить заказ”.

### Правила

- Если `orders_enabled === false` или `is_active === false`, кнопку заказа блокировать.
- Не показывать то, чего нет в модели: кейсы с цифрами, ER, охваты, дедлайны, если этих данных нет.

---

## 3. Кабинет заказчика (Client)

### Маршрут

- `/marketplace/cabinet`

### Назначение

Это отдельный кабинет заказчика на бирже, не блогера и не воркера.

### Доступ

- Только для авторизованного пользователя marketplace.
- Если не авторизован, редирект на `/marketplace/auth/login`.

### Основные задачи заказчика

- видеть свои заказы;
- открыть детали заказа;
- оплатить заказ, если он создан и ждёт оплаты;
- подтвердить выполнение заказа;
- обратиться в поддержку по заказу;
- перейти обратно в каталог.

### Источники данных

- `GET /marketplace/orders`
- `GET /marketplace/orders/{order_id}`
- `POST /marketplace/payments/{order_id}/create`
- `GET /marketplace/payments/{order_id}/status`
- `PATCH /marketplace/orders/{order_id}/confirm`
- `GET /marketplace/bloggers/{id}` — при необходимости для отображения имени блогера по `blogger_id`

### Важно по контракту заказов

Ответ списка и деталей заказа содержит только это:

```ts
type OrderResponse = {
  id: string;
  client_id: string;
  blogger_id: string;
  worker_id: string | null;
  status:
    | "PENDING_PAYMENT"
    | "PAYMENT_FAILED"
    | "ESCROW_HELD"
    | "BLOGGER_CONFIRMED"
    | "COMPLETED"
    | "REFUNDED";
  amount_kopeks: number;
  message: string;
  platform_commission_pct: number;
  worker_commission_pct: number;
  yookassa_payment_id: string | null;
  payment_url: string | null;
  payment_expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type OrderListResponse = {
  items: OrderResponse[];
  total: number;
  page: number;
  page_size: number;
};
```

### Это критично

В API нет `blogger_name`, поэтому Stitch должен:

- либо для списка заказов сделать догрузку профилей блогеров по `blogger_id`;
- либо временно показывать заказ через ID + кнопку в детали;
- но не использовать несуществующее поле `blogger_name`.

### Что должно быть в кабинете заказчика

- верхний блок с кратким описанием;
- список заказов с пагинацией;
- у каждого заказа:
  - блогер;
  - сумма;
  - статус;
  - дата создания;
  - переход в детали;
- понятные статусы:
  - `PENDING_PAYMENT` — ждёт оплаты;
  - `PAYMENT_FAILED` — ошибка оплаты;
  - `ESCROW_HELD` — деньги в эскроу, заказ в работе;
  - `BLOGGER_CONFIRMED` — блогер отметил как выполненный;
  - `COMPLETED` — заказ завершён;
  - `REFUNDED` — возврат.

### Детальная страница заказа

### Маршрут

- `/marketplace/orders/[id]`

### Что должно быть

- информация по заказу;
- сумма;
- статус;
- сообщение/бриф;
- дата создания;
- дата оплаты, если есть;
- дата завершения, если есть;
- имя/карточка блогера через догрузку профиля;
- кнопка оплаты, если статус `PENDING_PAYMENT`;
- кнопка подтверждения, если статус `BLOGGER_CONFIRMED`;
- кнопка обращения в поддержку, если статус `ESCROW_HELD` или `BLOGGER_CONFIRMED`.

### Логика оплаты

Если статус `PENDING_PAYMENT`:

- при клике вызвать `POST /marketplace/payments/{order_id}/create`;
- взять `payment_url`;
- перенаправить пользователя на оплату.

Если оплата уже была создана, можно также использовать данные заказа `payment_url`, если они есть и актуальны, но основной безопасный поток — через `create payment`.

### Логика подтверждения

Если статус `BLOGGER_CONFIRMED`:

- вызвать `PATCH /marketplace/orders/{order_id}/confirm`;
- после успеха обновить заказ;
- показать сообщение, что заказ завершён и средства распределены.

### Пустое состояние

- “У вас пока нет заказов”
- CTA: перейти в каталог блогеров

---

## 4. Создание заказа заказчиком

### Маршрут

- `/marketplace/orders/new?blogger={profileId}`

### Источники данных

- `GET /marketplace/bloggers/{blogger_id}`
- `POST /marketplace/orders`
- `POST /marketplace/payments/{order_id}/create`

### Поля формы

`POST /marketplace/orders`

```ts
{
  blogger_id: string;
  message: string; // 1..1000
}
```

### UX формы

- выбранный блогер;
- цена интеграции;
- textarea для брифа;
- счётчик символов;
- валидация:
  - пустое сообщение нельзя;
  - максимум 1000 символов;
- после создания заказа сразу запускать создание оплаты и редирект на YooKassa.

### Важно

- В query-параметре `blogger` сейчас должен использоваться именно `profile.id`, потому что публичный профиль открывается по `blogger_profile.id`.
- Но `POST /marketplace/orders` ожидает `blogger_id`, который backend трактует как `user_id` блогера.

Поэтому Stitch должен явно проверить текущий поток и не смешивать `profile.id` и `profile.user_id`.

Правильное поведение:

- если страница пришла из публичного профиля, сначала получить профиль;
- в заказ передавать `profile.user_id` как `blogger_id`.

Это одна из самых важных точек.

---

## 5. Кабинет блогера (Bloger)

### Рекомендуемый маршрут

- `/marketplace/blogger/cabinet`

Если в проекте уже используется другой маршрут для marketplace-части блогера, можно сохранить его, но кабинет блогера должен быть отдельным от кабинета заказчика.

### Назначение

Кабинет блогера должен решать 4 задачи:

1. управление своим профилем в каталоге;
2. просмотр входящих заказов;
3. отметка заказа как выполненного;
4. вывод заработанных средств.

### Источники данных

- `GET /marketplace/blogger/profile`
- `POST /marketplace/blogger/profile`
- `PATCH /marketplace/blogger/profile`
- `GET /marketplace/orders`
- `PATCH /marketplace/orders/{order_id}/complete`
- `GET /marketplace/withdrawals`
- `POST /marketplace/withdrawals`

### Что должно быть в кабинете блогера

#### Блок 1. Профиль в каталоге

- статус профиля;
- активен ли профиль;
- принимает ли заказы;
- категория;
- подписчики;
- цена;
- описание;
- соцсети;
- портфолио;
- preferred contact;
- фото.

#### Блок 2. Редактирование профиля

Форма должна работать с реальными полями:

```ts
type BloggerProfileCreateOrPatch = {
  category?: string;
  subscriber_count?: number;
  average_price_kopeks?: number;
  description?: string;
  social_links?: string[];
  portfolio_links?: string[];
  photo_url?: string | null;
  preferred_contact?: string | null;
  is_active?: boolean;
  orders_enabled?: boolean;
};
```

### Валидации профиля

- `category`: 1..50 символов
- `subscriber_count`: от 1
- `average_price_kopeks`: от 100
- `description`: 1..500
- `social_links`: минимум 1, максимум 10
- `portfolio_links`: максимум 5
- все ссылки должны быть `http://` или `https://`

### Логика

- Если профиль ещё не создан, показывать onboarding-форму создания.
- Если профиль уже есть, показывать режим редактирования.

#### Блок 3. Входящие заказы

`GET /marketplace/orders` для блогера возвращает его заказы.

В списке должны быть:

- ID заказа или короткий номер;
- сумма;
- статус;
- дата;
- сообщение клиента;
- переход в детали.

Если нужны имя клиента или карточка клиента, Stitch не должен ожидать `client_name` из API, потому что его нет.

#### Логика действий по заказу

Если статус `ESCROW_HELD`:

- показывать кнопку “Отметить выполненным”;
- вызывать `PATCH /marketplace/orders/{order_id}/complete`;
- после успеха статус должен стать `BLOGGER_CONFIRMED`.

Если статус другой:

- кнопка не показывается.

#### Блок 4. Баланс и вывод

Показывать:

- историю выводов;
- форму вывода;
- статусы выводов.

### Важно про баланс

В `GET /marketplace/blogger/profile` нет поля баланса.

Поэтому Stitch не должен брать баланс оттуда.

Если нужен текущий marketplace-баланс блогера, нужно использовать существующий endpoint `/me` и поле:

```ts
marketplace_balance_kopeks
```

Если marketplace UI сейчас использует отдельный auth context без загрузки `/me`, Stitch должен аккуратно добавить запрос на `/me` только для получения баланса текущего пользователя.

### Вывод средств

`POST /marketplace/withdrawals`

```ts
{
  amount_kopeks: number; // минимум 100
}
```

### Ограничения вывода

- только для блогера и воркера;
- должна быть привязана карта;
- сумма не больше доступного `marketplace_balance_kopeks`.

### История выводов

`GET /marketplace/withdrawals`

Показывать:

- сумму;
- статус:
  - `pending`
  - `completed`
  - `failed`
- дату;
- возможную ошибку, если есть `error_message`.

---

## 6. Поддержка

### Маршрут

- `/marketplace/support`

### Источники данных

- `GET /marketplace/support/tickets`
- `POST /marketplace/support/tickets`

### Создание тикета

```ts
{
  order_id: string;
  message: string; // 1..2000, не только пробелы
}
```

### Правила

- Тикет можно создавать только клиенту или блогеру.
- Для заказов только в статусах:
  - `ESCROW_HELD`
  - `BLOGGER_CONFIRMED`

### Что должно быть на странице

- форма обращения;
- история моих обращений;
- статусы тикетов;
- сценарий входа по query `?order=...`.

---

## 7. Аутентификация заказчика

### Маршруты

- `/marketplace/auth/register`
- `/marketplace/auth/login`

### Backend

- `POST /marketplace/auth/register`
- `POST /marketplace/auth/login`
- `POST /marketplace/auth/refresh`

### Регистрация

```ts
{
  name: string;
  email: string;
  password: string; // min 8
  referral_code?: string | null;
}
```

### Важно

- Если в URL есть `?ref=...`, передавать как `referral_code`.
- После успешной регистрации сразу сохранять `access_token` и `refresh_token`.

---

## 8. UI/UX требования

- Не делать generic-dashboard.
- Биржа должна выглядеть как продукт для покупки рекламных интеграций, а не как CRM.
- Каталог — публичный и продающий.
- Кабинет заказчика — про ясность статусов и быстрые действия.
- Кабинет блогера — про управление профилем, заказами и деньгами.
- Нужны хорошие empty / loading / error states.
- На мобильном всё должно быть рабочим без поломки сеток.

## 9. Acceptance criteria

Работа считается правильной, если:

1. каталог работает только на существующих эндпоинтах;
2. профиль блогера открывается и не показывает вымышленные метрики;
3. заказчик может:
   - зарегистрироваться;
   - зайти;
   - открыть каталог;
   - перейти в профиль блогера;
   - создать заказ;
   - уйти в оплату;
   - открыть заказ;
   - подтвердить выполнение;
   - создать тикет поддержки;
4. блогер может:
   - создать или отредактировать профиль;
   - увидеть свои заказы;
   - отметить заказ выполненным;
   - увидеть свой баланс через `/me`;
   - подать заявку на вывод;
   - увидеть историю выводов;
5. нигде не используются несуществующие поля API;
6. нигде не перепутаны `blogger_profile.id` и `blogger_profile.user_id`.

## 10. Что Stitch должен проверить перед завершением

- все маршруты реально существуют в `frontend/app`;
- все запросы соответствуют backend;
- в заказе правильно передаётся `profile.user_id`, а не `profile.id`;
- кабинет заказчика и кабинет блогера разделены;
- все кнопки действий привязаны к правильным статусам заказа;
- баланс блогера не берётся из `/marketplace/blogger/profile`, а берётся из `/me`.

## 11. Коротко: что именно надо собрать

- качественный публичный каталог;
- корректный профиль блогера;
- корректный кабинет заказчика;
- корректный кабинет блогера;
- поддержку;
- без выдуманных backend-полей;
- без изменения существующей серверной логики.
