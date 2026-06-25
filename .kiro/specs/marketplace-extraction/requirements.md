# Документ требований: Выделение маркетплейса в самостоятельное приложение

## Введение

Маркетплейс (каталог блогеров) в настоящее время живёт внутри монолитного Next.js-приложения `frontend/`, которое использует тёмную тему. Маркетплейс же работает в светлой теме и переопределяет CSS-токены локально. Это приводит к конфликтам стилей, нарушает изоляцию и усложняет поддержку. Данная фича предусматривает полное выделение маркетплейса в автономное Next.js-приложение `marketplace/` в корне проекта с собственными стилями, компонентами, утилитами и конфигурацией для деплоя на поддомен `marketplace.looneymoon.com`.

## Глоссарий

- **Main_Platform** — основное Next.js-приложение в `frontend/`, работающее в тёмной теме
- **Marketplace_App** — новое самостоятельное Next.js-приложение в `marketplace/`, работающее в светлой теме
- **Design_Tokens** — CSS custom properties (`--bg`, `--text-strong`, `--border`, `--font-*`, `--radius-*`, `--space-*`, `--transition-*` и т.д.), определённые в `globals.css`
- **Shared_Component** — компонент, который ранее импортировался маркетплейсом из `frontend/` (MarketingNav, SiteFooter)
- **Marketplace_Page** — страница маркетплейса (каталог, auth/login, auth/register, home, orders, support)
- **Marketplace_Component** — React-компонент, используемый только маркетплейсом (stitch-marketplace, marketplace-shell, error-boundary, loading-spinner, ref-tracker)
- **Lib_Module** — утилитарный модуль TypeScript (auth-context, config, types, api, storage, marketplace-categories)

## Требования

### Требование 1: Создание автономного Next.js-приложения маркетплейса

**User Story:** Как разработчик, я хочу иметь маркетплейс в отдельном Next.js-приложении в корне проекта, чтобы стили и код маркетплейса были полностью изолированы от основной платформы.

#### Критерии приёмки

1. THE Marketplace_App SHALL be located at `marketplace/` directory in the project root as a sibling to `frontend/`
2. THE Marketplace_App SHALL have its own `package.json` with the same core dependencies (Next.js 16, React 19, Framer Motion, TanStack React Query)
3. THE Marketplace_App SHALL have its own `next.config.ts` configured for standalone operation
4. THE Marketplace_App SHALL have its own `tsconfig.json` with path aliases pointing to its internal modules
5. THE Marketplace_App SHALL have its own `app/layout.tsx` root layout with Google Fonts (EB Garamond, Hanken Grotesk, Manrope, Cormorant Garamond) loaded via `<link>`

### Требование 2: Создание автономной дизайн-системы (светлая тема)

**User Story:** Как разработчик, я хочу, чтобы маркетплейс имел собственный `globals.css` с дизайн-токенами светлой темы, чтобы он не зависел от стилей основной платформы.

#### Критерии приёмки

1. THE Marketplace_App SHALL have its own `app/globals.css` file defining a complete set of Design_Tokens for the light theme
2. THE Marketplace_App globals.css SHALL define light theme surface values (background: #faf9f7, surface-base: #ffffff)
3. THE Marketplace_App globals.css SHALL define dark text colors for the light theme (text-strong: #000000, text-muted with appropriate opacity)
4. THE Marketplace_App globals.css SHALL define all typography tokens (--font-display, --font-body, --font-narrow, --font-serif, --font-mono)
5. THE Marketplace_App globals.css SHALL define spacing, radius, transition, and status tokens consistent with the marketplace visual identity
6. THE Marketplace_App globals.css SHALL set `color-scheme: light` on the HTML element
7. THE Main_Platform `frontend/app/globals.css` SHALL remain completely unmodified after the extraction

### Требование 3: Перенос страниц маркетплейса

**User Story:** Как разработчик, я хочу перенести все страницы маркетплейса в новое приложение, чтобы маркетплейс обслуживался с поддомена.

#### Критерии приёмки

1. WHEN the Marketplace_App is deployed, THE Marketplace_App SHALL serve the catalog page at the root path `/`
2. THE Marketplace_App SHALL serve the login page at `/auth/login`
3. THE Marketplace_App SHALL serve the registration page at `/auth/register`
4. THE Marketplace_App SHALL serve the home page at `/home`
5. THE Marketplace_App SHALL serve the orders page at `/orders`
6. THE Marketplace_App SHALL serve the support page at `/support`
7. WHEN pages are moved, THE Marketplace_App pages SHALL use internal imports (e.g., `@/components/...`, `@/lib/...`) that resolve within the marketplace app only

### Требование 4: Перенос компонентов маркетплейса

**User Story:** Как разработчик, я хочу, чтобы все компоненты маркетплейса были самодостаточны внутри нового приложения, чтобы не было зависимостей от `frontend/`.

#### Критерии приёмки

1. THE Marketplace_App SHALL contain all Marketplace_Components in `marketplace/components/marketplace/`
2. THE Marketplace_App SHALL contain a self-contained copy of MarketingNav in `marketplace/components/marketing-nav/` with its own CSS module
3. THE Marketplace_App SHALL contain a self-contained copy of SiteFooter in `marketplace/components/site-footer/` with its own CSS module
4. THE Marketplace_App SHALL contain the nav-config module adapted for marketplace-specific navigation
5. WHEN a Shared_Component is copied into the Marketplace_App, THE Shared_Component copy SHALL use only Design_Tokens defined in the Marketplace_App globals.css
6. THE Marketplace_App SHALL NOT import any module from the `frontend/` directory

### Требование 5: Перенос утилитарных модулей

**User Story:** Как разработчик, я хочу, чтобы маркетплейс имел собственные копии необходимых lib-модулей, чтобы он мог работать автономно.

#### Критерии приёмки

1. THE Marketplace_App SHALL contain its own `lib/auth-context.tsx` providing authentication state management
2. THE Marketplace_App SHALL contain its own `lib/config.ts` with environment variable configuration
3. THE Marketplace_App SHALL contain its own `lib/types.ts` with TypeScript type definitions needed by the marketplace
4. THE Marketplace_App SHALL contain its own `lib/api.ts` with API client functions needed by the marketplace
5. THE Marketplace_App SHALL contain its own `lib/storage.ts` with token storage utilities
6. THE Marketplace_App SHALL contain its own `lib/marketplace-categories.ts` with category definitions and fetch logic
7. WHEN Lib_Modules are copied, THE Marketplace_App Lib_Modules SHALL use the `NEXT_PUBLIC_API_BASE_URL` environment variable to reach the backend

### Требование 6: Настройка для деплоя на поддомен

**User Story:** Как DevOps-инженер, я хочу, чтобы маркетплейс был настроен для работы на поддомене `marketplace.looneymoon.com`, чтобы он был доступен отдельно от основной платформы.

#### Критерии приёмки

1. THE Marketplace_App next.config.ts SHALL be configured for standalone deployment on a subdomain
2. THE Marketplace_App SHALL use its own `NEXT_PUBLIC_APP_URL` environment variable pointing to the marketplace subdomain
3. THE Marketplace_App internal links SHALL use relative paths (not absolute URLs pointing to the main platform)
4. WHEN a link in the Marketplace_App points to the main platform (e.g., `/cabinet`), THE Marketplace_App SHALL use the full absolute URL of the main platform domain

### Требование 7: Очистка основной платформы

**User Story:** Как разработчик, я хочу удалить маркетплейс-роуты из основной платформы, чтобы не было мёртвого кода.

#### Критерии приёмки

1. WHEN the extraction is complete, THE Main_Platform SHALL NOT contain the `frontend/app/marketplace/` directory
2. WHEN the extraction is complete, THE Main_Platform SHALL NOT have dead imports referencing moved marketplace components
3. THE Main_Platform `frontend/app/globals.css` SHALL remain unchanged (no modifications allowed)
4. IF the Main_Platform root layout imports a marketplace-only component (RefTracker), THEN THE Main_Platform SHALL remove that import

### Требование 8: Сборка и запуск

**User Story:** Как разработчик, я хочу, чтобы оба приложения (основная платформа и маркетплейс) успешно собирались и запускались независимо друг от друга.

#### Критерии приёмки

1. THE Marketplace_App SHALL build successfully with `next build` without errors
2. THE Main_Platform SHALL build successfully with `next build` without errors after the marketplace routes are removed
3. THE Marketplace_App SHALL start on a configurable port for local development
4. WHEN both apps run locally, THE Marketplace_App SHALL not conflict with the Main_Platform on ports or resources
