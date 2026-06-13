# Requirements Document

## Introduction

Unify the marketing header navigation across all pages in the `(marketing)` route group. Currently each page (landing, FAQ, contacts) renders `MarketingNav` independently with different props, resulting in inconsistent navigation items and layout duplication. This feature extracts the navigation into a shared Next.js App Router layout with a consistent set of links and a dynamic `brandSub` subtitle that reflects the current page context.

## Glossary

- **Marketing_Layout**: A shared Next.js `layout.tsx` file placed in the `app/(marketing)/` route group that wraps all marketing pages and renders the unified header.
- **MarketingNav**: The existing sticky header component (`components/marketing/marketing-nav.tsx`) that renders the brand logo, navigation links, CTA button, and mobile burger menu.
- **brandSub**: A small uppercase subtitle displayed beneath the "looney moon" brand mark in the header, indicating the current page context (e.g. "агентство · faq").
- **Navigation_Items**: The set of inline link entries rendered in the MarketingNav desktop links area and mobile dropdown menu.
- **CTA_Link**: The primary action pill-button link displayed at the right edge of the header on desktop and at the bottom of the mobile menu.

## Requirements

### Requirement 1: Shared Marketing Layout

**User Story:** As a developer, I want the marketing header rendered from a single shared layout, so that navigation changes are applied once and remain consistent across all marketing pages.

#### Acceptance Criteria

1. THE Marketing_Layout SHALL render MarketingNav as the sole header for all pages in the `(marketing)` route group.
2. WHEN a new page is added to the `(marketing)` route group, THE Marketing_Layout SHALL automatically provide the unified header without additional configuration in the page component.
3. THE Marketing_Layout SHALL pass page children below the MarketingNav so that each page renders its own content beneath the shared header.

### Requirement 2: Consistent Navigation Items

**User Story:** As a site visitor, I want to see the same navigation links on every marketing page, so that I can reach any section regardless of which page I am on.

#### Acceptance Criteria

1. THE MarketingNav SHALL display exactly four navigation links: "Агентство", "FAQ", "Контакты", "Каталог" on every marketing page.
2. THE MarketingNav SHALL link "Агентство" to `/`, "FAQ" to `/faq`, "Контакты" to `/contacts`, and "Каталог" to `/marketplace`.
3. THE MarketingNav SHALL render the four navigation links in the order: Агентство, FAQ, Контакты, Каталог.
4. THE MarketingNav SHALL display all four navigation links identically in both the desktop inline navigation and the mobile dropdown menu.

### Requirement 3: Dynamic brandSub Subtitle

**User Story:** As a site visitor, I want the header subtitle to reflect which page I am currently viewing, so that I have a clear contextual indicator of my location on the site.

#### Acceptance Criteria

1. WHEN the visitor is on the main landing page (`/`), THE MarketingNav SHALL display the brandSub value "агентство".
2. WHEN the visitor is on the FAQ page (`/faq`), THE MarketingNav SHALL display the brandSub value "агентство · faq".
3. WHEN the visitor is on the contacts page (`/contacts`), THE MarketingNav SHALL display the brandSub value "агентство · контакты".
4. WHEN the visitor navigates between marketing pages, THE MarketingNav SHALL update the brandSub value to match the current page without a full page reload.

### Requirement 4: CTA Button Consistency

**User Story:** As a site visitor, I want a consistent call-to-action button in the header, so that I can always find the login action regardless of which page I am on.

#### Acceptance Criteria

1. THE MarketingNav SHALL display a CTA link with the label "Войти" on every marketing page.
2. THE MarketingNav SHALL link the CTA to the `/register` path on every marketing page.

### Requirement 5: Page Component Cleanup

**User Story:** As a developer, I want page components to stop rendering MarketingNav individually, so that there is a single source of truth for header configuration and no duplicate headers appear.

#### Acceptance Criteria

1. WHEN the Marketing_Layout is in place, THE landing page component SHALL render only its page-specific content without an inline MarketingNav invocation.
2. WHEN the Marketing_Layout is in place, THE FAQ page component SHALL render only its page-specific content without an inline MarketingNav invocation.
3. WHEN the Marketing_Layout is in place, THE contacts page component SHALL render only its page-specific content without an inline MarketingNav invocation.
4. IF a page component still contains an inline MarketingNav invocation, THEN THE page SHALL display a duplicate header, which constitutes a defect to be resolved.
