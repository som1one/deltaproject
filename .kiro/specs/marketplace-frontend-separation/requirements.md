# Requirements Document

## Introduction

This feature creates a standalone Next.js project at `frontend-marketplace/` that serves as the public-facing marketplace site for bloggers and clients. The marketplace project is fully independent from the existing agency frontend at `frontend/` — separate dependencies, separate styling, separate navigation, and separate route structure. The marketplace uses a light editorial theme (cream backgrounds, dark text, EB Garamond + Hanken Grotesk typography) while the agency site retains its dark premium aesthetic (Manrope, Marck Script, black backgrounds).

Both projects communicate with the same backend API running on port 8000. The marketplace runs on port 3100.

## Glossary

- **Marketplace_App**: The standalone Next.js application located at `frontend-marketplace/` that serves the public marketplace for bloggers and clients
- **Agency_App**: The existing Next.js application located at `frontend/` that serves the agency internal site for workers, bloggers, and admins
- **Backend_API**: The FastAPI application running on port 8000 that serves both frontend projects
- **Light_Theme**: The visual design system for the marketplace using cream backgrounds (#FFFDF7), dark text (#1A1A1A), EB Garamond serif font, and Hanken Grotesk sans-serif font
- **Dark_Theme**: The existing visual design system for the agency site using black backgrounds (#000000), white text, Manrope sans-serif, and Marck Script cursive font
- **Marketplace_Nav**: A dedicated navigation component within the marketplace project that provides site-wide navigation links specific to marketplace routes
- **Shared_Libs**: Copies of utility libraries (api, auth-context, config, storage, types, format, query-client) placed independently in the marketplace project

## Requirements

### Requirement 1: Standalone Project Structure

**User Story:** As a developer, I want the marketplace to be an entirely separate Next.js project, so that changes to one project do not affect the other.

#### Acceptance Criteria

1. THE Marketplace_App SHALL have its own `package.json` located at `frontend-marketplace/package.json` containing the same dependency set as the Agency_App (next, react, react-dom, @tanstack/react-query, framer-motion, and corresponding dev dependencies).
2. THE Marketplace_App SHALL have its own `tsconfig.json` with path alias `@/*` pointing to its own root directory.
3. THE Marketplace_App SHALL have its own `next.config.ts` configuration file independent of the Agency_App.
4. THE Marketplace_App SHALL have its own `node_modules/` directory installed from its own `package.json`.
5. WHEN a developer modifies files in `frontend-marketplace/`, THE Agency_App SHALL remain unaffected with no file additions, deletions, or modifications in `frontend/`.

### Requirement 2: Independent Light Theme Styling

**User Story:** As a marketplace visitor, I want the marketplace to have a warm, editorial light theme, so that the marketplace feels distinct and welcoming compared to the agency site.

#### Acceptance Criteria

1. THE Marketplace_App SHALL have its own `app/globals.css` file that defines the Light_Theme design system with CSS custom properties.
2. THE Marketplace_App globals.css SHALL set `--bg` to a cream tone (#FFFDF7) and `--text-strong` to a dark tone (#1A1A1A).
3. THE Marketplace_App globals.css SHALL define `--font-serif` using EB Garamond as the primary display font.
4. THE Marketplace_App globals.css SHALL define `--font-body` using Hanken Grotesk as the primary body font.
5. THE Marketplace_App globals.css SHALL set `color-scheme: light` on the html element.
6. THE Marketplace_App globals.css SHALL NOT import, reference, or share any CSS file from the Agency_App `frontend/` directory.
7. WHILE the Marketplace_App globals.css is being developed, THE Agency_App globals.css SHALL remain unchanged with its dark theme (black background, Manrope, Marck Script).

### Requirement 3: Route Structure

**User Story:** As a marketplace user, I want clear routes for landing, catalog, authentication, orders, and support, so that I can navigate the marketplace intuitively.

#### Acceptance Criteria

1. THE Marketplace_App SHALL serve a marketplace landing page at the root route `/`.
2. THE Marketplace_App SHALL serve a blogger catalog page at the route `/catalog`.
3. THE Marketplace_App SHALL serve a login page at the route `/auth/login`.
4. THE Marketplace_App SHALL serve a registration page at the route `/auth/register`.
5. THE Marketplace_App SHALL serve an orders page at the route `/orders`.
6. THE Marketplace_App SHALL serve a support page at the route `/support`.
7. WHEN a user navigates to any defined route, THE Marketplace_App SHALL render the corresponding page component without errors.

### Requirement 4: Marketplace Navigation Component

**User Story:** As a marketplace user, I want a dedicated navigation bar with links to marketplace pages, so that I can move between sections of the marketplace.

#### Acceptance Criteria

1. THE Marketplace_Nav SHALL be defined as a React component within the `frontend-marketplace/components/` directory.
2. THE Marketplace_Nav SHALL provide navigation links to the landing page (`/`), catalog (`/catalog`), orders (`/orders`), and support (`/support`).
3. THE Marketplace_Nav SHALL NOT import or reference any component from the Agency_App `frontend/components/` directory.
4. THE Marketplace_Nav SHALL display the marketplace brand name or logo.
5. THE Marketplace_Nav SHALL include an authentication link to `/auth/login` when the user is not authenticated.

### Requirement 5: Copied Shared Libraries

**User Story:** As a developer, I want independent copies of shared utility libraries in the marketplace project, so that the two frontends have no runtime or build-time dependency on each other.

#### Acceptance Criteria

1. THE Marketplace_App SHALL contain its own copy of the API client module at `frontend-marketplace/lib/api.ts`.
2. THE Marketplace_App SHALL contain its own copy of the auth context at `frontend-marketplace/lib/auth-context.tsx`.
3. THE Marketplace_App SHALL contain its own copy of the config module at `frontend-marketplace/lib/config.ts`.
4. THE Marketplace_App SHALL contain its own copy of the types module at `frontend-marketplace/lib/types.ts`.
5. THE Marketplace_App SHALL contain its own copy of the storage module at `frontend-marketplace/lib/storage.ts`.
6. THE Marketplace_App SHALL contain its own copy of the query-client module at `frontend-marketplace/lib/query-client.ts`.
7. THE Marketplace_App SHALL contain its own copy of the format utilities module at `frontend-marketplace/lib/format.ts`.
8. WHEN a shared library copy is modified in `frontend-marketplace/lib/`, THE Agency_App corresponding file in `frontend/lib/` SHALL remain unchanged.

### Requirement 6: Development Server Port Configuration

**User Story:** As a developer, I want the marketplace to run on port 3100, so that I can run both frontends simultaneously during development.

#### Acceptance Criteria

1. THE Marketplace_App `dev` script in `package.json` SHALL start the Next.js development server on port 3100.
2. THE Marketplace_App SHALL use `NEXT_PUBLIC_API_BASE_URL` environment variable pointing to the Backend_API at `http://localhost:8000`.
3. THE Marketplace_App SHALL include a `.env.local` or `.env.example` file documenting the required environment variables including `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` and `NEXT_PUBLIC_APP_URL=http://localhost:3100`.
4. WHEN the developer runs `npm run dev` in `frontend-marketplace/`, THE Marketplace_App SHALL be accessible at `http://localhost:3100`.

### Requirement 7: Agency App Preservation

**User Story:** As a developer, I want the existing agency frontend to remain completely untouched, so that there is no risk of breaking the current production site.

#### Acceptance Criteria

1. THE Agency_App `frontend/package.json` SHALL remain unchanged after the marketplace project is created.
2. THE Agency_App `frontend/app/globals.css` SHALL remain unchanged with its Dark_Theme design system.
3. THE Agency_App `frontend/app/layout.tsx` SHALL remain unchanged with its existing metadata and font configuration.
4. THE Agency_App route structure (`frontend/app/`) SHALL remain unchanged with no files added or removed.
5. THE Agency_App shared libraries in `frontend/lib/` SHALL remain unchanged with no files added, removed, or modified.
