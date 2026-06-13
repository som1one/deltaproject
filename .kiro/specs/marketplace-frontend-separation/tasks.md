# Implementation Plan: Marketplace Frontend Separation

## Overview

Create a standalone Next.js application at `frontend-marketplace/` that serves as an independent marketplace site, fully decoupled from the existing agency frontend at `frontend/`. The implementation copies shared libraries, creates a distinct light-theme design system, sets up marketplace-specific routes and navigation, and configures the project to run on port 3100.

## Tasks

- [ ] 1. Set up project structure and configuration
  - [ ] 1.1 Create `frontend-marketplace/` directory and `package.json`
    - Create `frontend-marketplace/package.json` with project name `deltaproject-marketplace`
    - Include dependencies: next ^16.2.4, react ^19.2.5, react-dom ^19.2.5, @tanstack/react-query ^5.100.8, framer-motion ^12.39.0, @eslint/eslintrc ^3.3.5
    - Include devDependencies: @types/node ^24.9.1, @types/react ^19.2.2, @types/react-dom ^19.2.2, eslint ^9.39.1, eslint-config-next ^16.2.4, typescript ^6.0.3
    - Set `dev` script to `next dev -p 3100`, `start` script to `next start -p 3100`
    - _Requirements: 1.1, 6.1_

  - [ ] 1.2 Create `frontend-marketplace/tsconfig.json`
    - Configure `@/*` path alias pointing to marketplace root
    - Match agency app's compiler options (target ES2017, module esnext, moduleResolution bundler, jsx react-jsx)
    - Include next-env.d.ts, .next/types, all .ts/.tsx/.mts files
    - _Requirements: 1.2_

  - [ ] 1.3 Create `frontend-marketplace/next.config.ts`
    - Export NextConfig with `allowedDevOrigins: ["127.0.0.1", "localhost"]`
    - _Requirements: 1.3_

  - [ ] 1.4 Create `frontend-marketplace/.env.example`
    - Document `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
    - Document `NEXT_PUBLIC_APP_URL=http://localhost:3100`
    - _Requirements: 6.2, 6.3_

- [ ] 2. Copy shared libraries to `frontend-marketplace/lib/`
  - [ ] 2.1 Copy `lib/api.ts` from `frontend/lib/api.ts`
    - Place at `frontend-marketplace/lib/api.ts`
    - Ensure no imports reference `frontend/` paths
    - _Requirements: 5.1_

  - [ ] 2.2 Copy `lib/auth-context.tsx` from `frontend/lib/auth-context.tsx`
    - Place at `frontend-marketplace/lib/auth-context.tsx`
    - _Requirements: 5.2_

  - [ ] 2.3 Copy `lib/config.ts` from `frontend/lib/config.ts`
    - Place at `frontend-marketplace/lib/config.ts`
    - Verify it reads `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_URL`
    - _Requirements: 5.3, 6.2_

  - [ ] 2.4 Copy `lib/types.ts` from `frontend/lib/types.ts`
    - Place at `frontend-marketplace/lib/types.ts`
    - _Requirements: 5.4_

  - [ ] 2.5 Copy `lib/storage.ts` from `frontend/lib/storage.ts`
    - Place at `frontend-marketplace/lib/storage.ts`
    - _Requirements: 5.5_

  - [ ] 2.6 Copy `lib/query-client.ts` from `frontend/lib/query-client.ts`
    - Place at `frontend-marketplace/lib/query-client.ts`
    - _Requirements: 5.6_

  - [ ] 2.7 Copy `lib/format.ts` from `frontend/lib/format.ts`
    - Place at `frontend-marketplace/lib/format.ts`
    - _Requirements: 5.7_

- [ ] 3. Copy providers and create light theme
  - [ ] 3.1 Copy `components/providers/app-providers.tsx` from `frontend/components/providers/`
    - Place at `frontend-marketplace/components/providers/app-providers.tsx`
    - Ensure imports reference `@/lib/` (marketplace-local paths)
    - _Requirements: 5.2, 5.6_

  - [ ] 3.2 Create `frontend-marketplace/app/globals.css` with light theme
    - Set `:root` custom properties: `--bg: #FFFDF7`, `--text-strong: #1A1A1A`, `--text: rgba(26,26,26,0.86)`, `--text-muted: rgba(26,26,26,0.58)`
    - Define `--font-serif: "EB Garamond", Georgia, serif` and `--font-body: "Hanken Grotesk", system-ui, sans-serif`
    - Define `--accent: #1A1A1A`
    - Set `color-scheme: light` on `html`
    - Apply cream background and body font on `body`
    - Do NOT import or reference any file from `frontend/`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 3.3 Create `frontend-marketplace/app/layout.tsx` root layout
    - Load EB Garamond and Hanken Grotesk from Google Fonts via `<link>` tags
    - Import `globals.css`
    - Wrap children in `AppProviders`
    - Set `<html lang="ru">` and marketplace metadata (title: "looney moon — маркетплейс блогеров")
    - _Requirements: 2.3, 2.4, 3.7_

- [ ] 4. Checkpoint - Verify project structure
  - Ensure all configuration files and library copies are in place, ask the user if questions arise.

- [ ] 5. Create MarketplaceNav component and route pages
  - [ ] 5.1 Create `frontend-marketplace/components/MarketplaceNav.tsx`
    - Implement as a client component (`"use client"`)
    - Import `useAuth` from `@/lib/auth-context`
    - Include brand link to `/` displaying "looney moon"
    - Include nav links to `/catalog`, `/orders`, `/support`
    - Show "Войти" link to `/auth/login` when user is not authenticated
    - Show "Кабинет" link when user is authenticated
    - Do NOT import anything from `frontend/`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 5.2 Copy and create marketplace landing page at `frontend-marketplace/app/page.tsx`
    - Copy marketplace page content from `frontend/app/marketplace/page.tsx`
    - Adapt imports to use `@/` paths (marketplace-local)
    - Include MarketplaceNav component
    - _Requirements: 3.1_

  - [ ] 5.3 Create catalog page at `frontend-marketplace/app/catalog/page.tsx`
    - Copy and adapt relevant catalog/blogger listing UI from `frontend/app/marketplace/` or `frontend/components/marketplace/`
    - Use marketplace-local imports only
    - _Requirements: 3.2_

  - [ ] 5.4 Create login page at `frontend-marketplace/app/auth/login/page.tsx`
    - Copy and adapt login form from `frontend/app/marketplace/auth/` or `frontend/app/(auth)/login/`
    - Use marketplace-local imports only
    - _Requirements: 3.3_

  - [ ] 5.5 Create register page at `frontend-marketplace/app/auth/register/page.tsx`
    - Copy and adapt registration form from `frontend/app/(auth)/register/` or create marketplace-specific version
    - Use marketplace-local imports only
    - _Requirements: 3.4_

  - [ ] 5.6 Create orders page at `frontend-marketplace/app/orders/page.tsx`
    - Copy and adapt orders UI from `frontend/app/marketplace/orders/`
    - Use marketplace-local imports only
    - _Requirements: 3.5_

  - [ ] 5.7 Create support page at `frontend-marketplace/app/support/page.tsx`
    - Copy and adapt support UI from `frontend/app/marketplace/support/`
    - Use marketplace-local imports only
    - _Requirements: 3.6_

- [ ] 6. Checkpoint - Verify all routes render
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Install dependencies and verify dev server
  - [ ] 7.1 Run `npm install` in `frontend-marketplace/`
    - Install all dependencies from package.json
    - Verify `node_modules/` is created
    - _Requirements: 1.4, 6.4_

  - [ ] 7.2 Verify the dev server starts on port 3100
    - Run `npm run dev` and confirm the server binds to port 3100
    - Verify no errors during startup
    - _Requirements: 6.1, 6.4_

- [ ]* 7.3 Write property test: No cross-project imports
  - **Property 2: No cross-project imports exist**
  - Scan all .ts/.tsx files in `frontend-marketplace/` and assert no import path resolves to `frontend/`
  - **Validates: Requirements 1.5, 2.6, 4.3, 5.8**

- [ ]* 7.4 Write property test: All routes render without error
  - **Property 1: All defined routes render without error**
  - For each route (`/`, `/catalog`, `/auth/login`, `/auth/register`, `/orders`, `/support`), verify the page component renders a valid React element
  - **Validates: Requirements 3.7**

- [ ]* 7.5 Write property test: Navigation links completeness
  - **Property 3: Navigation links completeness**
  - Render MarketplaceNav and verify it contains links to `/`, `/catalog`, `/orders`, `/support` and either `/auth/login` or cabinet link
  - **Validates: Requirements 4.2, 4.5**

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All files in `frontend/` must remain untouched (Requirement 7) — this is enforced by only creating/modifying files in `frontend-marketplace/`
- The implementation language is TypeScript (Next.js/React) as specified in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5"] }
  ]
}
```
