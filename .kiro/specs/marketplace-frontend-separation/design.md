# Design Document

## Overview

This document describes the architecture and technical design for the standalone marketplace frontend project (`frontend-marketplace/`). The goal is to create a fully independent Next.js application that shares zero build-time or runtime coupling with the existing agency frontend (`frontend/`), while communicating with the same backend API.

The design mirrors the technology choices and patterns of the agency app (Next.js 16, React 19, TypeScript 6, TanStack Query 5, Framer Motion 12) but applies a distinct light editorial visual theme and a marketplace-specific route structure.

## Architecture

```
deltaproject/
├── frontend/               ← Agency app (UNCHANGED)
├── frontend-marketplace/   ← New standalone marketplace app
│   ├── app/                ← Next.js App Router pages
│   │   ├── globals.css     ← Light theme design system
│   │   ├── layout.tsx      ← Root layout with fonts + providers
│   │   ├── page.tsx        ← Landing page (/)
│   │   ├── catalog/
│   │   │   └── page.tsx    ← Blogger catalog (/catalog)
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── page.tsx    ← Login (/auth/login)
│   │   │   └── register/
│   │   │       └── page.tsx    ← Register (/auth/register)
│   │   ├── orders/
│   │   │   └── page.tsx    ← Orders (/orders)
│   │   └── support/
│   │       └── page.tsx    ← Support (/support)
│   ├── components/
│   │   └── MarketplaceNav.tsx  ← Navigation component
│   ├── lib/                ← Independent copies of shared utilities
│   │   ├── api.ts
│   │   ├── auth-context.tsx
│   │   ├── config.ts
│   │   ├── storage.ts
│   │   ├── types.ts
│   │   ├── format.ts
│   │   └── query-client.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── .env.example
└── backend/                ← Shared FastAPI backend (port 8000)
```

## Components and Interfaces

### 1. Project Configuration (`package.json`, `tsconfig.json`, `next.config.ts`)

**package.json** mirrors the agency app's dependency set:

```json
{
  "name": "deltaproject-marketplace",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "lint": "eslint ."
  },
  "dependencies": {
    "@eslint/eslintrc": "^3.3.5",
    "@tanstack/react-query": "^5.100.8",
    "framer-motion": "^12.39.0",
    "next": "^16.2.4",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    "@types/node": "^24.9.1",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "eslint": "^9.39.1",
    "eslint-config-next": "^16.2.4",
    "typescript": "^6.0.3"
  }
}
```

**tsconfig.json** uses the same structure as the agency app with `@/*` pointing to the marketplace root:

```jsonc
{
  "compilerOptions": {
    "ignoreDeprecations": "6.0",
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts",
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
```

**next.config.ts** allows dev origins for local development:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
```

### 2. Light Theme Design System (`app/globals.css`)

The marketplace uses a warm editorial aesthetic with cream backgrounds and serif typography. Key design tokens:

| Token | Value | Purpose |
|-------|-------|---------|
| `--bg` | `#FFFDF7` | Cream page background |
| `--text-strong` | `#1A1A1A` | Primary dark text |
| `--text` | `rgba(26, 26, 26, 0.86)` | Body text |
| `--text-muted` | `rgba(26, 26, 26, 0.58)` | Secondary text |
| `--font-serif` | `"EB Garamond", Georgia, serif` | Display/heading font |
| `--font-body` | `"Hanken Grotesk", system-ui, sans-serif` | Body font |
| `--accent` | `#1A1A1A` | Primary accent (dark on light) |
| `color-scheme` | `light` | Browser light mode hints |

The CSS file sets `color-scheme: light` on `html`, applies cream background on `body`, and defines all custom properties in `:root`. No file from `frontend/` is imported or referenced.

### 3. Root Layout (`app/layout.tsx`)

The root layout:
- Loads EB Garamond and Hanken Grotesk from Google Fonts
- Imports `globals.css`
- Wraps children in an `AppProviders` component (TanStack Query provider + Auth context)
- Sets `<html lang="ru">` to match the agency app's locale
- Defines marketplace-specific metadata (title, description, Open Graph)

```typescript
import { Suspense } from "react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "looney moon — маркетплейс блогеров",
    template: "%s · looney moon маркетплейс",
  },
  description: "Маркетплейс блогеров looney moon — найдите идеального блогера для рекламной интеграции.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Hanken+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

### 4. MarketplaceNav Component

A client component providing top-level navigation for the marketplace:

```typescript
"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function MarketplaceNav() {
  const { user } = useAuth();

  return (
    <nav className="marketplace-nav">
      <Link href="/" className="brand">looney moon</Link>
      <div className="nav-links">
        <Link href="/catalog">Каталог</Link>
        <Link href="/orders">Заказы</Link>
        <Link href="/support">Поддержка</Link>
      </div>
      <div className="nav-auth">
        {user ? (
          <Link href="/orders">Кабинет</Link>
        ) : (
          <Link href="/auth/login">Войти</Link>
        )}
      </div>
    </nav>
  );
}
```

Key constraints:
- Imports only from `@/lib/` and `@/components/` (marketplace-local paths)
- Never imports from `frontend/` directory
- Displays brand name "looney moon"
- Shows "Войти" (login) link when user is not authenticated

### 5. Shared Libraries (`lib/`)

Each library file is an independent copy placed in `frontend-marketplace/lib/`. These files are copied from `frontend/lib/` at project creation time and then evolve independently:

| File | Purpose |
|------|---------|
| `api.ts` | HTTP client wrapping fetch with auth headers and base URL |
| `auth-context.tsx` | React context providing user session state |
| `config.ts` | Environment variable access (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`) |
| `storage.ts` | LocalStorage wrapper with safe access patterns |
| `types.ts` | Shared TypeScript interfaces and type definitions |
| `format.ts` | Number/date/currency formatting utilities |
| `query-client.ts` | TanStack Query client instance with default options |

The `config.ts` module reads:
- `NEXT_PUBLIC_API_BASE_URL` → `http://localhost:8000` (backend)
- `NEXT_PUBLIC_APP_URL` → `http://localhost:3100` (marketplace self-reference)

### 6. Route Pages

Each route has a minimal page component that renders a placeholder or initial UI:

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Marketplace landing — hero section, featured bloggers |
| `/catalog` | `app/catalog/page.tsx` | Blogger catalog with search/filter |
| `/auth/login` | `app/auth/login/page.tsx` | Login form |
| `/auth/register` | `app/auth/register/page.tsx` | Registration form |
| `/orders` | `app/orders/page.tsx` | User's order history |
| `/support` | `app/support/page.tsx` | Support/contact page |

### 7. Environment Configuration

`.env.example` documents required environment variables:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3100
```

## Data Models

The marketplace reuses the same TypeScript types as the agency app (defined in `lib/types.ts`). Key models relevant to marketplace pages:

```typescript
interface Blogger {
  id: number;
  name: string;
  platform: string;
  subscribers: number;
  price_per_integration: number;
  categories: string[];
  avatar_url?: string;
}

interface Order {
  id: number;
  client_id: number;
  blogger_id: number;
  status: string;
  created_at: string;
  total_amount: number;
}

interface User {
  id: number;
  email: string;
  role: string;
  name: string;
}
```

## Error Handling

- **Network errors**: The `api.ts` client catches fetch failures and surfaces user-friendly error messages. TanStack Query handles retries (3 attempts with exponential backoff by default).
- **Auth errors**: 401 responses trigger token refresh or redirect to `/auth/login`. The `auth-context` manages this flow.
- **Route not found**: Next.js default 404 handling via `not-found.tsx` (to be added).
- **Environment misconfiguration**: `config.ts` throws immediately on missing required env vars at startup, preventing silent failures.

## Interfaces

### API Communication

All pages communicate with the backend via the `api.ts` client:

```typescript
// lib/api.ts — simplified interface
export const api = {
  get: <T>(path: string) => Promise<T>,
  post: <T>(path: string, body: unknown) => Promise<T>,
  put: <T>(path: string, body: unknown) => Promise<T>,
  delete: (path: string) => Promise<void>,
};
```

Base URL is resolved from `appConfig.apiBaseUrl` (`http://localhost:8000`).

### Component Props

```typescript
// MarketplaceNav has no required props — reads auth state from context
interface MarketplaceNavProps {}

// Page components are Next.js page components — no props (params come from route)
```

## Testing Strategy

This feature is primarily structural scaffolding — creating a new project with configuration files, routes, and copied libraries. The testing approach reflects this:

- **Smoke tests**: Verify project structure (files exist, configs are valid, dependencies install)
- **Example-based tests**: Verify specific CSS values, nav link targets, and cross-project isolation
- **Property-based tests**: Verify universal properties across all routes and all source files (rendering correctness, import isolation)

Unit tests cover specific values (CSS tokens, port numbers). Property tests cover universal guarantees (all routes render, no file crosses the boundary).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: All defined routes render without error

*For any* route path in the defined marketplace route set (`/`, `/catalog`, `/auth/login`, `/auth/register`, `/orders`, `/support`), rendering the corresponding page component SHALL produce a valid React element without throwing an exception.

**Validates: Requirements 3.7**

### Property 2: No cross-project imports exist

*For any* TypeScript/TSX source file in the `frontend-marketplace/` directory tree, the file SHALL NOT contain any import path that resolves to a file within `frontend/`.

**Validates: Requirements 1.5, 2.6, 4.3, 5.8**

### Property 3: Navigation links completeness

*For any* rendering of the MarketplaceNav component, the output SHALL contain link elements targeting all required routes (`/`, `/catalog`, `/orders`, `/support`) and SHALL include either an auth link to `/auth/login` (unauthenticated state) or a cabinet link (authenticated state).

**Validates: Requirements 4.2, 4.5**
