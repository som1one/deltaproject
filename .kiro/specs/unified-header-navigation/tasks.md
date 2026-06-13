# Implementation Plan: Unified Header Navigation

## Overview

Extract `MarketingNav` instantiation from individual page components into a shared `app/(marketing)/layout.tsx` layout. A centralized `nav-config.ts` module defines navigation items, CTA, and a pure `getBrandSub()` mapping function. A lightweight `"use client"` wrapper (`MarketingNavShell`) uses `usePathname()` to drive the dynamic subtitle. Each page component is then cleaned up to remove its inline `MarketingNav` call.

## Tasks

- [x] 1. Create navigation configuration module
  - [x] 1.1 Create `frontend/components/marketing/nav-config.ts`
    - Export `NAV_ITEMS` array with four entries: Агентство → `/`, FAQ → `/faq`, Контакты → `/contacts`, Каталог → `/marketplace`
    - Export `NAV_CTA` object: label "Войти", href `/register`
    - Define `BRAND_SUB_MAP` record mapping `/` → "агентство", `/faq` → "агентство · faq", `/contacts` → "агентство · контакты", `/marketplace` → "агентство · каталог"
    - Export `getBrandSub(pathname: string): string` that returns the mapped value or default "агентство"
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2_

  - [ ]* 1.2 Write property test for `getBrandSub` mapping
    - **Property 2: brandSub mapping is total and correct**
    - For any pathname in BRAND_SUB_MAP keys, getBrandSub returns the corresponding value; for any other string it returns "агентство"
    - Set up Vitest + fast-check as test framework if not already present
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 2. Create client wrapper and shared layout
  - [x] 2.1 Create `frontend/components/marketing/marketing-nav-shell.tsx`
    - "use client" component that imports `usePathname` from `next/navigation`
    - Calls `getBrandSub(pathname)` and renders `<MarketingNav brandSub={brandSub} items={NAV_ITEMS} cta={NAV_CTA} />`
    - _Requirements: 1.1, 3.4_

  - [x] 2.2 Create `frontend/app/(marketing)/layout.tsx`
    - Server component that imports `MarketingNavShell`
    - Renders `<MarketingNavShell />` followed by `{children}`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Checkpoint - Verify layout renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Remove per-page MarketingNav from page components
  - [x] 4.1 Remove MarketingNav from `frontend/components/marketing/landing-page.tsx`
    - Remove `MarketingNav` import
    - Remove `<MarketingNav ... />` JSX block
    - Remove `useSessionTarget` import and logic that only computed CTA props (keep if used elsewhere in the component)
    - _Requirements: 5.1_

  - [x] 4.2 Remove MarketingNav from `frontend/components/marketing/faq-page.tsx`
    - Remove `MarketingNav` import
    - Remove `<MarketingNav ... />` JSX block
    - _Requirements: 5.2_

  - [x] 4.3 Remove MarketingNav from `frontend/components/marketing/contacts-page.tsx`
    - Remove `MarketingNav` import
    - Remove `<MarketingNav ... />` JSX block
    - _Requirements: 5.3_

- [x] 5. Checkpoint - Ensure no duplicate headers and consistent navigation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Property and unit tests for navigation consistency
  - [ ]* 6.1 Write property test for navigation item rendering consistency
    - **Property 1: Navigation items render consistently in desktop and mobile**
    - For any item in NAV_ITEMS, MarketingNav displays it with correct label and href in both desktop and mobile views
    - **Validates: Requirements 2.2, 2.4**

  - [ ]* 6.2 Write unit tests for MarketingNavShell and layout integration
    - Verify layout renders exactly one MarketingNav
    - Verify navigation links appear in order: Агентство, FAQ, Контакты, Каталог
    - Verify CTA displays "Войти" linking to `/register`
    - Verify page components do NOT render their own MarketingNav
    - _Requirements: 1.1, 2.1, 2.3, 4.1, 4.2, 5.1, 5.2, 5.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `MarketingNav` component is NOT modified — only its instantiation point changes
- No test framework exists yet; optional test tasks include Vitest + fast-check setup

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["6.1", "6.2"] }
  ]
}
```
