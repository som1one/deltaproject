# Implementation Plan: Marketplace Extraction

## Обзор

Выделяем маркетплейс из монолитного `frontend/` в самостоятельное Next.js-приложение `marketplace/`. Работа идёт поэтапно: сначала каркас, затем наполнение, затем очистка основной платформы.

## Tasks

- [x] 1. Создать каркас marketplace-приложения
  - [x] 1.1 Создать `marketplace/package.json` с зависимостями (Next.js 16, React 19, Framer Motion, TanStack React Query, TypeScript, ESLint)
    - Скрипты: dev (port 3001), build, start, lint
    - _Requirements: 1.2, 1.3_
  - [x] 1.2 Создать `marketplace/tsconfig.json` с path alias `@/*` → `./*`
    - _Requirements: 1.4_
  - [x] 1.3 Создать `marketplace/next.config.ts` с `allowedDevOrigins` для localhost и marketplace.localhost
    - _Requirements: 1.3, 6.1_
  - [x] 1.4 Создать `marketplace/app/globals.css` — полная светлая дизайн-система
    - Включить все CSS custom properties: surfaces, borders, text, status, typography, radii, spacing, transitions
    - Значения: --bg: #faf9f7, --surface-base: #ffffff, --text-strong: #000000, color-scheme: light
    - Включить CSS reset (box-sizing, body margin, font smoothing, scrollbars, selection, focus-visible)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 1.5 Создать `marketplace/app/layout.tsx` — root layout с Google Fonts, globals.css импорт и AppProviders
    - _Requirements: 1.5_

- [x] 2. Перенести lib-модули в маркетплейс
  - [x] 2.1 Создать `marketplace/lib/types.ts` — только типы, используемые маркетплейсом (BloggerProfile, AuthTokensResponse, UserMeRead, UserRole)
    - _Requirements: 5.3_
  - [x] 2.2 Создать `marketplace/lib/storage.ts` — копия token storage утилит
    - _Requirements: 5.5_
  - [x] 2.3 Создать `marketplace/lib/config.ts` — с `NEXT_PUBLIC_API_BASE_URL` и `NEXT_PUBLIC_APP_URL`
    - _Requirements: 5.2, 5.7_
  - [x] 2.4 Создать `marketplace/lib/api.ts` — урезанный API-клиент (marketplace endpoints + auth + me)
    - Удалить все admin, finance, deals, worker endpoints
    - _Requirements: 5.4_
  - [x] 2.5 Создать `marketplace/lib/auth-context.tsx` — AuthProvider и useAuth hook
    - _Requirements: 5.1_
  - [x] 2.6 Создать `marketplace/lib/marketplace-categories.ts` — категории и fetch-функция
    - _Requirements: 5.6_

- [x] 3. Перенести компоненты в маркетплейс
  - [x] 3.1 Создать `marketplace/components/providers/app-providers.tsx` — QueryClientProvider + AuthProvider
    - _Requirements: 1.5_
  - [x] 3.2 Скопировать `marketplace/components/marketing-nav/marketing-nav.tsx` и `marketing-nav.module.css` — адаптировать импорты
    - Убрать `@/components/marketing/` путь, сделать локальный импорт
    - _Requirements: 4.2, 4.5_
  - [x] 3.3 Создать `marketplace/components/marketing-nav/nav-config.ts` — адаптировать навигацию для маркетплейса
    - Ссылки: / (каталог), /home, /support; CTA → /auth/login
    - Ссылки на основную платформу — абсолютные URL
    - _Requirements: 4.4, 6.3, 6.4_
  - [x] 3.4 Скопировать `marketplace/components/site-footer/site-footer.tsx` и `site-footer.module.css`
    - Адаптировать цвета под светлую тему (через CSS tokens, не хардкод)
    - _Requirements: 4.3, 4.5_
  - [x] 3.5 Перенести `marketplace/components/marketplace/stitch-marketplace.tsx` и `stitch-marketplace.module.css`
    - Обновить импорты: `@/components/marketing-nav/marketing-nav`, `@/components/site-footer/site-footer`, `@/lib/auth-context`, `@/lib/types`
    - _Requirements: 4.1, 4.6_
  - [x] 3.6 Перенести `marketplace/components/marketplace/marketplace-shell.tsx`, `marketplace-ui.module.css`, `error-boundary.tsx`, `loading-spinner.tsx`, `ref-tracker.tsx`, `use-async-operation.ts`, `index.ts`
    - Обновить все внутренние импорты
    - _Requirements: 4.1_

- [x] 4. Checkpoint — проверить сборку компонентов
  - Ensure all tests pass, ask the user if questions arise.
  - Запустить `cd marketplace && npm install && npx tsc --noEmit` для проверки типов

- [x] 5. Перенести страницы маркетплейса
  - [x] 5.1 Создать `marketplace/app/page.tsx` — каталог (из `frontend/app/marketplace/page.tsx`)
    - Обновить все импорты на внутренние `@/...`
    - Убрать `/marketplace` из внутренних ссылок (теперь корень)
    - _Requirements: 3.1, 3.7_
  - [x] 5.2 Создать `marketplace/app/auth/login/page.tsx` — из `frontend/app/marketplace/auth/login/page.tsx`
    - Обновить импорты и внутренние ссылки
    - _Requirements: 3.2, 3.7_
  - [x] 5.3 Создать `marketplace/app/auth/register/page.tsx` — из `frontend/app/marketplace/auth/register/page.tsx`
    - Обновить импорты и внутренние ссылки
    - _Requirements: 3.3, 3.7_
  - [x] 5.4 Создать `marketplace/app/home/page.tsx` — из `frontend/app/marketplace/home/page.tsx`
    - _Requirements: 3.4, 3.7_
  - [x] 5.5 Создать `marketplace/app/orders/page.tsx` — из `frontend/app/marketplace/orders/page.tsx`
    - _Requirements: 3.5, 3.7_
  - [x] 5.6 Создать `marketplace/app/support/page.tsx` — из `frontend/app/marketplace/support/page.tsx`
    - _Requirements: 3.6, 3.7_

- [x] 6. Checkpoint — полная сборка маркетплейса
  - Ensure all tests pass, ask the user if questions arise.
  - Запустить `cd marketplace && npm run build` — должен собраться без ошибок
  - _Requirements: 8.1_

- [x] 7. Очистка основной платформы
  - [x] 7.1 Удалить директорию `frontend/app/marketplace/` целиком
    - _Requirements: 7.1_
  - [x] 7.2 Удалить импорт `RefTracker` из `frontend/app/layout.tsx` (если он используется только маркетплейсом)
    - _Requirements: 7.4_
  - [x] 7.3 Проверить и удалить мёртвые импорты в `frontend/` — любые ссылки на перенесённые marketplace-файлы
    - _Requirements: 7.2_
  - [x] 7.4 Убедиться, что `frontend/app/globals.css` НЕ был изменён (сравнить хэш)
    - _Requirements: 7.3, 2.7_

- [x] 8. Финальный checkpoint — сборка обоих приложений
  - Ensure all tests pass, ask the user if questions arise.
  - Запустить `cd frontend && npm run build` — основная платформа собирается
  - Запустить `cd marketplace && npm run build` — маркетплейс собирается
  - _Requirements: 8.1, 8.2_

- [ ]* 9. Скрипт проверки изоляции
  - [ ]* 9.1 Написать скрипт, проверяющий отсутствие импортов из `frontend/` в файлах `marketplace/`
    - Grep по паттернам: `from "../../frontend`, `from '../frontend`, `@/../../frontend`
    - _Requirements: 4.6_
  - [ ]* 9.2 Написать скрипт проверки полноты CSS-токенов — все `var(--*)` из CSS Modules маркетплейса определены в `marketplace/app/globals.css`
    - _Requirements: 2.1, 4.5_

## Примечания

- Задачи с `*` — опциональные (скрипты валидации)
- `frontend/app/globals.css` НЕ ТРОГАТЬ ни при каких обстоятельствах
- Бэкенд не изменяется
- Маркетплейс dev-сервер — port 3001, основная платформа — port 3000
- Все ссылки из маркетплейса на основную платформу — абсолютные URL (env-переменная `NEXT_PUBLIC_MAIN_APP_URL`)
