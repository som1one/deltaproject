# Implementation Plan: Blogger Marketplace

## Overview

Реализация биржи блогеров — публичного маркетплейса, интегрированного в существующую платформу deltaproject. Реализация включает: миграции БД, бэкенд-сервисы (эскроу, платежи, рефералы), API-роутеры, фронтенд-страницы маркетплейса и расширения кабинетов. Стек: Python/FastAPI (бэкенд), TypeScript/Next.js (фронтенд), PostgreSQL, YooKassa.

## Tasks

- [x] 1. Database migrations and models
  - [x] 1.1 Create Alembic migration for enum changes and user table modifications
    - Add `Client` value to `user_role` PostgreSQL enum via `ALTER TYPE user_role ADD VALUE 'Client'`
    - Add `marketplace_referred_by` (UUID FK to users, nullable) column to `users` table
    - Add `marketplace_balance_kopeks` (int, default 0) column to `users` table
    - _Requirements: 5.2, 5.3, 4.2_

  - [x] 1.2 Create Alembic migration for new marketplace tables
    - Create `marketplace_settings` table with singleton row (platform_commission_pct=25.00, worker_referral_commission_pct=5.00)
    - Create `blogger_profiles` table with all columns and indexes (category, subscriber_count, average_price_kopeks, is_active)
    - Create `marketplace_orders` table with all columns and indexes (client_id, blogger_id, worker_id, status, commission snapshots)
    - Create `marketplace_escrow_ledger` table with idempotency_key unique constraint
    - Create `marketplace_withdrawals` table
    - Create `support_tickets` table
    - Create `marketplace_referrals` table with unique constraints on worker_id and ref_code
    - _Requirements: 6.2, 7.7, 9.5, 11.2, 4.1_

  - [x] 1.3 Create SQLAlchemy models and enums for marketplace
    - Create `enums/marketplace.py` with MarketplaceOrderStatus, BloggerCategory, SupportTicketStatus, WithdrawalStatus
    - Update `enums/user.py` to add CLIENT to UserRole
    - Create `models/blogger_profile.py` (BloggerProfile model)
    - Create `models/marketplace_order.py` (MarketplaceOrder model)
    - Create `models/marketplace_escrow_ledger.py` (MarketplaceEscrowEntry model)
    - Create `models/marketplace_withdrawal.py` (MarketplaceWithdrawal model)
    - Create `models/support_ticket.py` (SupportTicket model)
    - Create `models/marketplace_settings.py` (MarketplaceSettings model)
    - Create `models/marketplace_referral.py` (MarketplaceReferral model)
    - _Requirements: 1.1, 3.2, 6.2, 8.1, 9.1, 11.2_

  - [x] 1.4 Create Pydantic schemas for marketplace
    - Create `schemas/marketplace.py` with BloggerCardResponse, BloggerProfileResponse, BloggerProfileCreateRequest, BloggerProfileUpdateRequest
    - Create `schemas/marketplace_orders.py` with OrderCreateRequest, OrderResponse, OrderListResponse
    - Create `schemas/marketplace_payments.py` with PaymentCreateResponse, PaymentStatusResponse
    - Create `schemas/marketplace_withdrawals.py` with WithdrawalRequest, WithdrawalResponse
    - Create `schemas/marketplace_support.py` with TicketCreateRequest, TicketResponse
    - Create `schemas/marketplace_auth.py` with ClientRegisterRequest, ClientLoginRequest, TokenResponse
    - Create `schemas/marketplace_admin.py` with DashboardResponse, CommissionSettingsRequest, OrderResolveRequest
    - _Requirements: 1.7, 2.1, 3.2, 5.2, 6.2, 8.1, 9.2, 11.2, 13.1_

- [x] 2. Backend services
  - [x] 2.1 Implement EscrowService (`services/marketplace_escrow_service.py`)
    - Implement `freeze_funds(order_id, amount_kopeks)` — creates ledger entry with type "freeze"
    - Implement `distribute_funds(order_id)` — calculates shares using integer arithmetic (floor for worker/platform, remainder to blogger), creates ledger entries, credits balances
    - Implement `refund_to_client(order_id)` — creates refund ledger entry, initiates YooKassa refund
    - Use `SELECT FOR UPDATE` on order row for concurrency safety
    - Use idempotency_key on ledger entries to prevent duplicate processing
    - _Requirements: 6.6, 7.7, 7.8, 7.9, 10.1, 10.2, 11.5, 11.6_

  - [ ]* 2.2 Write property test for escrow fund distribution (Property 8)
    - **Property 8: Escrow fund distribution conservation**
    - Generate random amounts (100..100_000_000 kopeks) and commission rates (1..50% platform, 0..30% worker)
    - Assert: blogger_share + worker_share + platform_share == amount (conservation)
    - Assert: platform_share == floor(amount * P / 100), worker_share == floor(amount * W / 100)
    - Assert: blogger_share == amount - platform_share - worker_share
    - **Validates: Requirements 7.7, 7.8, 10.1, 10.2**

  - [ ]* 2.3 Write property test for commission temporal snapshot (Property 10)
    - **Property 10: Commission temporal snapshot**
    - Generate orders with commission snapshots, then change global settings
    - Assert: distribution uses snapshot values, not current global values
    - **Validates: Requirements 8.4**

  - [x] 2.4 Implement PaymentService (`services/marketplace_payment_service.py`)
    - Implement `create_payment(order_id, amount_kopeks, return_url)` — calls YooKassa Payment API v3, stores payment_id on order
    - Implement `handle_payment_webhook(event)` — processes payment.succeeded (freeze funds, update to ESCROW_HELD) and payment.canceled (update to PAYMENT_FAILED)
    - Implement `create_payout(user_id, amount_kopeks, payout_token)` — uses existing yookassa_payout_client pattern
    - Implement `handle_payout_webhook(event)` — processes payout.succeeded (COMPLETED) and payout.canceled (FAILED + restore balance)
    - Implement idempotent webhook handling via payment_id/payout_id checks
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 9.5, 9.6, 9.7_

  - [x] 2.5 Implement MarketplaceReferralService (`services/marketplace_referral_service.py`)
    - Implement `generate_referral_link(worker_id)` — creates/retrieves unique ref_code, returns full URL
    - Implement `resolve_referral(ref_code)` — returns worker_id or None if invalid/inactive
    - Implement `get_referred_clients(worker_id, page)` — paginated list of referred clients
    - Implement `get_commission_history(worker_id, page)` — paginated commission entries from ledger
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.3_

  - [ ]* 2.6 Write property test for referral association permanence (Property 6)
    - **Property 6: Referral association permanence**
    - Generate clients with referral associations, perform various operations
    - Assert: marketplace_referred_by never changes after initial set
    - **Validates: Requirements 4.2**

- [x] 3. Checkpoint - Database and services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend API routers (public and auth)
  - [x] 4.1 Implement Marketplace Router (`routers/marketplace.py` endpoints)
    - GET `/marketplace/bloggers` — paginated catalog with filters (category, subscriber range, price range), 20 per page, sorted by created_at desc
    - GET `/marketplace/bloggers/{blogger_id}` — full blogger profile
    - GET `/marketplace/categories` — list of BloggerCategory enum values
    - No auth required for these endpoints
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.4, 2.5_

  - [ ]* 4.2 Write property tests for catalog filtering and pagination (Properties 1, 2, 3)
    - **Property 1: Catalog filtering returns only matching results**
    - **Property 2: Catalog pagination invariants**
    - **Property 3: Blogger card serialization completeness**
    - Generate random blogger profiles and filter combinations
    - Assert: all returned cards match all active filters (AND logic), no matching cards excluded
    - Assert: pages have max 20 items, sorted by created_at desc, union of pages == full result set
    - Assert: all required fields present in card/profile responses
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 2.1, 2.2**

  - [x] 4.3 Implement Client Auth Router (`routers/marketplace_auth.py`)
    - POST `/marketplace/auth/register` — validate name/email/password, check email uniqueness, create Client user, resolve referral, return tokens
    - POST `/marketplace/auth/login` — validate credentials, return tokens
    - POST `/marketplace/auth/refresh` — refresh JWT tokens
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 4.4 Write property test for client registration validation (Property 5)
    - **Property 5: Client registration validation**
    - Generate valid/invalid registration inputs (name 1-255, email valid/taken, password 8-100)
    - Assert: valid inputs create account + return tokens; invalid inputs rejected with per-field errors
    - **Validates: Requirements 5.2, 5.3, 5.5**

  - [x] 4.5 Implement Blogger Profile Router (`routers/marketplace_blogger_profile.py`)
    - GET `/marketplace/blogger/profile` — get own profile (Blogger auth)
    - POST `/marketplace/blogger/profile` — create/complete profile with validation
    - PATCH `/marketplace/blogger/profile` — update profile fields
    - Validate: category from enum, subscriber_count 1..999M, price 1..10M RUB, description 1..500 chars, at least 1 social link
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 4.6 Write property test for profile validation (Property 4)
    - **Property 4: Profile validation round-trip**
    - Generate valid/invalid profile data
    - Assert: valid data saves and card appears; invalid data rejected with per-field errors
    - **Validates: Requirements 3.2, 3.4, 3.5**

- [x] 5. Backend API routers (orders, payments, support)
  - [x] 5.1 Implement Orders Router (`routers/marketplace_orders.py`)
    - POST `/marketplace/orders` — create order (Client auth), validate message 1-1000 chars, check blogger active + orders_enabled, snapshot commissions
    - GET `/marketplace/orders` — list orders for current user (Client sees own, Blogger sees assigned)
    - GET `/marketplace/orders/{order_id}` — order details with auth check
    - PATCH `/marketplace/orders/{order_id}/complete` — Blogger marks complete (only assigned blogger, only ESCROW_HELD)
    - PATCH `/marketplace/orders/{order_id}/confirm` — Client confirms delivery (only order owner, only BLOGGER_CONFIRMED)
    - Use atomic `UPDATE ... WHERE status = expected_status` for state transitions
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 5.2 Write property tests for order creation and state machine (Properties 7, 13)
    - **Property 7: Order creation validation**
    - Generate valid/invalid messages (1-1000 chars), active/inactive bloggers
    - Assert: valid creates PENDING_PAYMENT order; invalid rejected
    - **Property 13: Order state machine authorization**
    - Generate users and orders, attempt unauthorized transitions
    - Assert: only assigned blogger can complete, only order client can confirm; others rejected
    - **Validates: Requirements 6.2, 6.3, 7.2, 7.3, 7.5, 7.6**

  - [x] 5.3 Implement Payments Router (`routers/marketplace_payments.py`)
    - POST `/marketplace/payments/{order_id}/create` — create YooKassa payment for order
    - GET `/marketplace/payments/{order_id}/status` — check payment status
    - Extend existing webhooks router to handle marketplace payment/payout events
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 5.4 Implement Withdrawals Router (`routers/marketplace_withdrawals.py`)
    - POST `/marketplace/withdrawals` — validate amount >= 100 kopeks, <= balance, max 2 decimal places, card linked; deduct balance, create PENDING withdrawal
    - GET `/marketplace/withdrawals` — list user's withdrawals
    - GET `/marketplace/withdrawals/{id}` — withdrawal details
    - Use `SELECT FOR UPDATE` on user balance for concurrency
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.6, 10.7_

  - [ ]* 5.5 Write property tests for withdrawal validation (Properties 11, 12)
    - **Property 11: Withdrawal validation and balance integrity**
    - Generate amounts, balances, card states; assert correct acceptance/rejection
    - **Property 12: Withdrawal failure recovery**
    - Generate withdrawal amounts, simulate payout failure; assert balance restored
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.7, 10.6, 10.7**

  - [x] 5.6 Implement Support Router (`routers/marketplace_support.py`)
    - POST `/marketplace/support/tickets` — create ticket (Client/Blogger auth), validate message 1-2000 chars non-whitespace, order must be ESCROW_HELD or BLOGGER_CONFIRMED
    - GET `/marketplace/support/tickets` — list user's tickets
    - GET `/marketplace/support/tickets/{id}` — ticket details
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 5.7 Write property test for support ticket validation (Property 14)
    - **Property 14: Support ticket message validation**
    - Generate messages of various lengths (empty, whitespace-only, 1-2000, >2000)
    - Assert: valid messages create ticket; invalid rejected
    - **Validates: Requirements 11.2, 11.3**

- [x] 6. Backend API routers (admin)
  - [x] 6.1 Implement Admin Marketplace Router (extends `routers/admin.py`)
    - GET `/admin/marketplace/dashboard` — aggregate stats (total orders, revenue, active bloggers, registered clients)
    - GET `/admin/marketplace/orders` — paginated orders with filters (status, date range, blogger, client), 50 per page
    - PATCH `/admin/marketplace/orders/{id}/resolve` — resolve dispute (favor_client → refund, favor_blogger → distribute), require reason 1-500 chars, only for ESCROW_HELD orders
    - GET `/admin/marketplace/settings` — get commission settings
    - PUT `/admin/marketplace/settings` — update commissions (platform 1-50%, worker 1-30%, max 2 decimal places)
    - GET `/admin/marketplace/support/tickets` — list open tickets
    - PATCH `/admin/marketplace/support/tickets/{id}/resolve` — resolve ticket with decision and reason
    - PATCH `/admin/marketplace/bloggers/{id}` — edit blogger profile/status
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.4, 10.5, 11.4, 11.5, 11.6, 11.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 6.2 Write property tests for commission validation and dashboard (Properties 9, 15)
    - **Property 9: Commission configuration validation**
    - Generate commission values (valid/invalid ranges, decimal places)
    - Assert: valid values persisted; invalid rejected, previous value retained
    - **Property 15: Admin dashboard aggregation correctness**
    - Generate random order sets with various statuses
    - Assert: counts and sums match expected aggregations
    - **Validates: Requirements 8.2, 8.3, 8.5, 10.4, 10.5, 13.1**

- [x] 7. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend marketplace pages (public)
  - [x] 8.1 Create marketplace layout and design tokens
    - Create `frontend/app/(marketplace)/layout.tsx` with olive green theme (#6B8E23)
    - Set up design tokens: border-radius 8px, box-shadow, 44x44px touch targets
    - Implement responsive layout (320px+ viewport, no horizontal scroll)
    - Add loading indicator component (shows within 200ms of async operation)
    - Add error/timeout handling (30s timeout with retry option)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 8.2 Implement catalog page (`frontend/app/(marketplace)/page.tsx`)
    - Display paginated Blogger_Cards grid (20 per page)
    - Implement filter panel: category (multi-select), subscriber range, price range
    - Implement AND logic for combined filters
    - Display empty state when no results match filters
    - Each card shows: name, category, subscriber_count, average_price, photo/placeholder
    - Card click navigates to blogger profile page
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 8.3 Implement blogger profile page (`frontend/app/(marketplace)/bloggers/[id]/page.tsx`)
    - Display full profile: name, category, subscribers, price, description, portfolio links, social links
    - Hide empty sections (no portfolio/social links)
    - Show "Place Order" button (hidden if blogger inactive/orders disabled, show "Unavailable" instead)
    - Handle non-existent profile (error page with link back to catalog)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 8.4 Implement auth pages (`frontend/app/(marketplace)/auth/`)
    - Create `login/page.tsx` — email/password form, error handling (invalid credentials, inactive account)
    - Create `register/page.tsx` — name/email/password form, pre-fill referral from URL param
    - Implement per-field validation errors, preserve entered data on error
    - Handle duplicate email error
    - Redirect to marketplace after successful auth
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 9. Frontend order flow and client cabinet
  - [x] 9.1 Implement order creation flow
    - Order form on blogger profile: message field (1-1000 chars), display price
    - Validation error for empty/too-long message
    - On submit: create order → redirect to YooKassa payment page
    - Handle payment failure/expiration states
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8_

  - [x] 9.2 Implement client cabinet (`frontend/app/(marketplace)/cabinet/page.tsx`)
    - Paginated order list (20 per page, sorted by date desc): date, blogger name, amount, status
    - Total spent display (sum of COMPLETED orders)
    - Empty state when no orders
    - Access control: redirect non-Client users to login
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6_

  - [x] 9.3 Implement order details page (`frontend/app/(marketplace)/orders/[id]/page.tsx`)
    - Display: blogger name, category, payment status, amount, order message
    - "Confirm Delivery" button (only for BLOGGER_CONFIRMED status, only for order owner)
    - "Contact Support" button (for ESCROW_HELD/BLOGGER_CONFIRMED)
    - _Requirements: 7.4, 7.5, 11.1, 14.4_

  - [x] 9.4 Implement support page (`frontend/app/(marketplace)/support/page.tsx`)
    - Ticket creation form: message (1-2000 chars), linked to order
    - List of user's tickets with status
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 10. Frontend blogger cabinet extensions
  - [x] 10.1 Implement blogger profile management (`frontend/app/(dashboard)/blogger/profile/page.tsx`)
    - Profile completion form (first login): category, subscribers, price, description, social links, optional fields
    - Profile edit form for existing profiles
    - Per-field validation errors without clearing data
    - Redirect to form if profile not completed
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 10.2 Implement blogger marketplace orders page (`frontend/app/(dashboard)/blogger/marketplace/page.tsx`)
    - List of assigned orders with status
    - "Complete Work" button for ESCROW_HELD orders (only assigned blogger)
    - Balance display (rubles with kopek precision)
    - Withdrawal form: amount validation (>= 1 RUB, <= balance, 2 decimal places), card linked check
    - Withdrawal history list
    - _Requirements: 7.1, 7.2, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 11. Frontend worker cabinet and admin extensions
  - [x] 11.1 Implement worker referral dashboard (`frontend/app/(dashboard)/worker/marketplace/page.tsx`)
    - Display unique referral link with copy button
    - Paginated list of referred clients (name, registration date, 50 per page)
    - Total referral earnings display
    - Commission history (order ID, client name, amount, commission %, commission amount, date, 50 per page)
    - Withdrawal functionality (same as blogger)
    - Hide "Create Application" button
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 10.3, 10.6, 10.7_

  - [x] 11.2 Implement admin marketplace management pages
    - Dashboard page: total orders, revenue, active bloggers, registered clients
    - Orders list page: paginated (50/page), filters (status, date, blogger, client)
    - Order resolve modal: favor_client/favor_blogger, reason (1-500 chars), only for ESCROW_HELD
    - Commission settings page: platform % (1-50), worker % (1-30), 2 decimal places max
    - Support tickets list: open tickets with order info
    - Ticket resolve modal: decision + reason (1-1000 chars)
    - Blogger management: edit profile fields, toggle active status
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 10.4, 10.5, 11.4, 11.5, 11.6, 11.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 12. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integration and wiring
  - [x] 13.1 Wire YooKassa webhook handling for marketplace events
    - Extend existing `/webhooks/yookassa` endpoint to route marketplace payment/payout events
    - Implement payment.succeeded → EscrowService.freeze_funds → order status ESCROW_HELD
    - Implement payment.canceled → order status PAYMENT_FAILED
    - Implement payout.succeeded → withdrawal COMPLETED
    - Implement payout.canceled → withdrawal FAILED + balance restore
    - Ensure idempotent processing via payment_id/idempotency_key checks
    - _Requirements: 6.6, 6.7, 6.8, 9.6, 9.7_

  - [x] 13.2 Wire order completion flow end-to-end
    - Client confirms delivery → EscrowService.distribute_funds → credit blogger + worker balances
    - Admin resolves for blogger → same distribution flow
    - Admin resolves for client → EscrowService.refund_to_client
    - Verify ledger entries created for all fund movements
    - _Requirements: 7.5, 7.7, 7.8, 7.9, 11.5, 11.6_

  - [ ]* 13.3 Write integration tests for full order lifecycle
    - Test: create order → pay → blogger confirms → client confirms → funds distributed
    - Test: create order → pay → support ticket → admin resolves for client → refund
    - Test: create order → pay → support ticket → admin resolves for blogger → distribute
    - Mock YooKassa HTTP calls
    - _Requirements: 6.2, 6.6, 7.2, 7.5, 7.7, 11.5, 11.6_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All monetary amounts are in kopeks (integer arithmetic) to avoid floating-point errors
- YooKassa integration extends existing `yookassa_payout_client.py` pattern
- Frontend uses React Query (`@tanstack/react-query`) for server state management (already in project)
- Design tokens: olive green #6B8E23, border-radius 8px, box-shadow, 44x44px touch targets

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "2.4", "2.5"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.6"] },
    { "id": 5, "tasks": ["4.1", "4.3", "4.5"] },
    { "id": 6, "tasks": ["4.2", "4.4", "4.6", "5.1", "5.3", "5.4", "5.6"] },
    { "id": 7, "tasks": ["5.2", "5.5", "5.7", "6.1"] },
    { "id": 8, "tasks": ["6.2", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 11, "tasks": ["10.1", "10.2", "11.1", "11.2"] },
    { "id": 12, "tasks": ["13.1", "13.2"] },
    { "id": 13, "tasks": ["13.3"] }
  ]
}
```
