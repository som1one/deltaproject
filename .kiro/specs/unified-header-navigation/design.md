# Design Document

## Overview

This feature refactors the marketing header navigation from per-page inline rendering to a single shared Next.js App Router layout. The `app/(marketing)/layout.tsx` file becomes the sole owner of `MarketingNav` instantiation, using `usePathname()` to derive the dynamic `brandSub` subtitle. Page components (`LandingPage`, `FaqPage`, `ContactsPage`) are cleaned up to remove their individual `MarketingNav` calls.

## Architecture

### Key Design Decisions

1. **Client wrapper component** — Since `usePathname()` requires client context and Next.js layouts are server components by default, a lightweight `"use client"` wrapper (`MarketingNavShell`) is introduced. The layout itself remains a server component and delegates only the nav rendering to this client boundary.
2. **Centralized nav config** — Navigation items and CTA are defined once in the wrapper and passed to `MarketingNav` as props. No per-page configuration needed.
3. **Pure mapping function** — A `getBrandSub(pathname)` helper maps the current route to its subtitle string, making the logic testable in isolation.

## Components and Interfaces

### MarketingNavShell (new)

A `"use client"` component that wraps `MarketingNav` with pathname-aware logic.

**File:** `frontend/components/marketing/marketing-nav-shell.tsx`

```tsx
"use client";

import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getBrandSub, NAV_ITEMS, NAV_CTA } from "@/components/marketing/nav-config";

export const MarketingNavShell = () => {
  const pathname = usePathname();
  const brandSub = getBrandSub(pathname);

  return <MarketingNav brandSub={brandSub} items={NAV_ITEMS} cta={NAV_CTA} />;
};
```

### Marketing Layout (new)

Server component layout that renders `MarketingNavShell` above page children.

**File:** `frontend/app/(marketing)/layout.tsx`

```tsx
import { MarketingNavShell } from "@/components/marketing/marketing-nav-shell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNavShell />
      {children}
    </>
  );
}
```

### nav-config (new)

Shared configuration module exporting navigation items, CTA, and the `getBrandSub` mapping function.

**File:** `frontend/components/marketing/nav-config.ts`

```ts
import type { MarketingNavItem } from "@/components/marketing/marketing-nav";

export const NAV_ITEMS: MarketingNavItem[] = [
  { href: "/", label: "Агентство" },
  { href: "/faq", label: "FAQ" },
  { href: "/contacts", label: "Контакты" },
  { href: "/marketplace", label: "Каталог" },
];

export const NAV_CTA: MarketingNavItem = { href: "/register", label: "Войти" };

const BRAND_SUB_MAP: Record<string, string> = {
  "/": "агентство",
  "/faq": "агентство · faq",
  "/contacts": "агентство · контакты",
  "/marketplace": "агентство · каталог",
};

/**
 * Returns the brandSub subtitle for a given marketing pathname.
 * Falls back to "агентство" for unrecognized paths.
 */
export function getBrandSub(pathname: string): string {
  return BRAND_SUB_MAP[pathname] ?? "агентство";
}
```

### Page Components (modified)

Each page component is updated to remove its `MarketingNav` import and invocation:

- `LandingPage` — remove `MarketingNav` import and its JSX block; remove `useSessionTarget` logic that only computed CTA props.
- `FaqPage` — remove `MarketingNav` import and its JSX block.
- `ContactsPage` — remove `MarketingNav` import and its JSX block.

### MarketingNav (unchanged)

The existing `MarketingNav` component remains unchanged. It continues to accept `brandSub`, `items`, and `cta` props. The only difference is that it's now instantiated once from the layout rather than per-page.

## Interfaces

### MarketingNavItem (existing)

```ts
export type MarketingNavItem = { href: string; label: string };
```

### MarketingNavProps (existing)

```ts
type MarketingNavProps = {
  brandSub?: string;
  items: MarketingNavItem[];
  cta: MarketingNavItem;
};
```

### getBrandSub function signature

```ts
function getBrandSub(pathname: string): string;
```

**Input:** A Next.js pathname string (e.g. `"/"`, `"/faq"`, `"/contacts"`).
**Output:** The corresponding brandSub subtitle string. Falls back to `"агентство"` for unknown paths.

## Data Models

No new data models are introduced. The feature reuses the existing `MarketingNavItem` type and introduces a static `BRAND_SUB_MAP` record for pathname-to-subtitle lookups.

### BRAND_SUB_MAP

```ts
const BRAND_SUB_MAP: Record<string, string> = {
  "/": "агентство",
  "/faq": "агентство · faq",
  "/contacts": "агентство · контакты",
  "/marketplace": "агентство · каталог",
};
```

## Data Flow

```
Browser URL change
  → Next.js client router updates pathname
  → usePathname() in MarketingNavShell re-renders
  → getBrandSub(pathname) computes new subtitle
  → MarketingNav receives updated brandSub prop
  → Header subtitle updates without full page reload
```

## Error Handling

- **Unknown pathname:** `getBrandSub` returns the default `"агентство"` string for any path not in the map. This ensures the header always displays a valid subtitle even if a new marketing page is added before updating the config.
- **Missing layout:** If the layout file is accidentally removed, Next.js falls back to the root layout; pages would render without a header. This is a development-time issue caught by visual inspection or automated tests.

## Testing Strategy

### Unit Tests (example-based)
- Verify the layout renders exactly one `MarketingNav` with correct items
- Verify navigation links appear in the correct order (Агентство, FAQ, Контакты, Каталог)
- Verify CTA displays "Войти" linking to `/register`
- Verify each page component (LandingPage, FaqPage, ContactsPage) does NOT render its own `MarketingNav`
- Verify specific brandSub values for `/`, `/faq`, `/contacts` pathnames

### Property Tests
- Navigation config consistency across desktop/mobile rendering
- `getBrandSub` mapping completeness and fallback behavior

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigation items render consistently in desktop and mobile

*For any* navigation item in the `NAV_ITEMS` config array, the rendered MarketingNav component SHALL display that item with the correct label and href in both the desktop inline links section and the mobile dropdown menu.

**Validates: Requirements 2.2, 2.4**

### Property 2: brandSub mapping is total and correct

*For any* pathname in the defined `BRAND_SUB_MAP` keys, the `getBrandSub` function SHALL return the corresponding subtitle string; and *for any* pathname NOT in the map, it SHALL return the default value `"агентство"`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**
