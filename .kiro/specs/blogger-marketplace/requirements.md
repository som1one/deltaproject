# Requirements Document

## Introduction

Биржа блогеров — отдельный публичный сайт-маркетплейс, куда воркеры приводят заказчиков (клиентов) по реферальным ссылкам. На бирже отображаются карточки блогеров с подробной информацией (категория, подписчики, средняя цена). Заказчик выбирает блогера, оплачивает заказ через ЮKassa, деньги замораживаются на платформе (эскроу). После выполнения рекламы и подтверждения обеими сторонами средства распределяются: блогер получает свою долю на баланс, воркер — реферальную комиссию, платформа — 25% (настраивается). Блогер может вывести баланс через ЮKassa. Споры решаются через поддержку.

## Glossary

- **Marketplace**: Отдельный публичный веб-сайт (биржа блогеров), доступный заказчикам без авторизации для просмотра каталога
- **Client (Заказчик)**: Новая роль пользователя — покупатель рекламы, регистрируется на маркетплейсе по реферальной ссылке воркера
- **Worker (Воркер)**: Существующая роль; приводит заказчиков на маркетплейс по реферальной ссылке и получает комиссию с каждой покупки
- **Blogger (Блогер)**: Существующая роль; размещает профиль на маркетплейсе, выполняет рекламные заказы, получает оплату на баланс
- **Admin (Администратор)**: Существующая роль; управляет настройками платформы, комиссиями, пользователями и спорами
- **Blogger_Card**: Публичная карточка блогера на маркетплейсе с информацией о категории, подписчиках, цене и портфолио
- **Order (Заказ)**: Сущность, описывающая сделку между заказчиком и блогером на маркетплейсе
- **Escrow_Service**: Подсистема замораживания и распределения средств на платформе
- **Platform_Commission**: Процент комиссии платформы с каждого заказа (по умолчанию 25%)
- **Worker_Referral_Commission**: Доля воркера от суммы заказа, приведённого по его реферальной ссылке
- **YooKassa_Gateway**: Платёжный шлюз ЮKassa для приёма оплат от заказчиков и вывода средств блогерам
- **Support_System**: Система обращений в поддержку для решения споров между участниками

## Requirements

### Requirement 1: Marketplace Catalog Display

**User Story:** As a Client, I want to browse a catalog of bloggers on the marketplace, so that I can find a suitable blogger for my advertising needs.

#### Acceptance Criteria

1. THE Marketplace SHALL display a paginated list of Blogger_Cards with 20 items per page, sorted by newest profile creation date descending
2. WHEN a Client applies category filters, THE Marketplace SHALL display only Blogger_Cards matching the selected categories
3. WHEN a Client applies subscriber count filters, THE Marketplace SHALL display only Blogger_Cards within the specified subscriber range
4. WHEN a Client applies price range filters, THE Marketplace SHALL display only Blogger_Cards within the specified price range
5. WHEN a Client applies multiple filters simultaneously, THE Marketplace SHALL display only Blogger_Cards matching all applied filter conditions (AND logic)
6. IF no Blogger_Cards match the applied filters, THEN THE Marketplace SHALL display an empty state message indicating no results were found and suggest clearing filters
7. THE Blogger_Card SHALL display the blogger name, category, subscriber count, average price, and profile photo (or a default placeholder if no photo is uploaded)
8. WHEN a Client clicks on a Blogger_Card, THE Marketplace SHALL navigate to the full blogger profile page

### Requirement 2: Blogger Profile Page

**User Story:** As a Client, I want to view a detailed blogger profile, so that I can evaluate the blogger before placing an order.

#### Acceptance Criteria

1. THE Marketplace SHALL display the full blogger profile including: name, category, subscriber count, average price (in rubles), description (up to 500 characters), portfolio examples (up to 5 links), and social media links (up to 5 links)
2. WHEN the blogger profile has no portfolio examples or no social media links, THE Marketplace SHALL hide the corresponding section rather than displaying an empty section
3. THE Marketplace SHALL display a "Place Order" button on the blogger profile page
4. WHILE the Blogger is inactive (is_active is false) or has disabled orders, THE Marketplace SHALL hide the "Place Order" button and display an "Unavailable" status indicator
5. IF a Client navigates to a blogger profile that does not exist or has been removed, THEN THE Marketplace SHALL display an error page indicating the profile is not available and provide a link back to the catalog
6. WHEN a Client opens a blogger profile page, THE Marketplace SHALL render the complete profile content within 3 seconds under normal network conditions

### Requirement 3: Blogger Onboarding Profile

**User Story:** As a Blogger, I want to fill in my marketplace profile on first login, so that my card appears on the marketplace with complete information.

#### Acceptance Criteria

1. WHEN a Blogger logs in and has not yet completed the marketplace profile, THE System SHALL redirect the Blogger to a profile completion form and prevent access to other Blogger cabinet pages until the profile is submitted
2. THE profile completion form SHALL require: category (from predefined list), subscriber count (integer from 1 to 999,000,000), average price per ad (from 1 to 10,000,000 rubles), description (1 to 500 characters), and at least one social media link (valid URL, maximum 10 links)
3. THE profile completion form SHALL optionally accept: portfolio examples (up to 5 valid URLs), profile photo (JPEG or PNG, maximum 5 MB), and preferred contact method (selected from a predefined list of options)
4. WHEN the Blogger submits the profile form with valid data, THE System SHALL save the profile and make the Blogger_Card visible on the Marketplace
5. IF the Blogger submits the profile form with invalid data, THEN THE System SHALL display per-field validation errors indicating which fields failed and why, without clearing any entered data
6. IF the Blogger navigates away from the profile completion form before submitting, THEN THE System SHALL preserve the incomplete state and redirect the Blogger back to the form on next login

### Requirement 4: Worker Referral System for Marketplace

**User Story:** As a Worker, I want to share a referral link to the marketplace, so that I earn commission from clients I bring to the platform.

#### Acceptance Criteria

1. WHEN a Worker accesses the referral section of the Worker cabinet, THE System SHALL generate and display a unique marketplace referral link containing the Worker's identifier, with a maximum length of 2048 characters
2. WHEN a Client registers on the Marketplace via a Worker referral link, THE System SHALL permanently associate the Client with the referring Worker such that the association cannot be changed or reassigned to another Worker
3. IF a Client attempts to register via a Worker referral link that references a non-existent or inactive Worker, THEN THE System SHALL allow the Client to register without a Worker association and display no referral error to the Client
4. THE Worker cabinet SHALL display a list of Clients registered via the Worker referral link, showing each Client's name and registration date, with a maximum of 50 Clients per page
5. THE Worker cabinet SHALL display total earnings from marketplace referral commissions as a numeric value in rubles (derived from kopeks)
6. THE Worker cabinet SHALL NOT display the "Create Application" functionality

### Requirement 5: Client Registration and Authentication

**User Story:** As a Client, I want to register on the marketplace, so that I can place orders with bloggers.

#### Acceptance Criteria

1. WHEN a visitor arrives via a Worker referral link, THE Marketplace SHALL pre-fill the referral association with the referring Worker and prompt the visitor to complete the registration form
2. THE registration form SHALL require: name (1 to 255 characters), email (valid email format, up to 320 characters), and password (8 to 100 characters)
3. WHEN a Client submits valid registration data, THE System SHALL create a Client account, permanently associate the Client with the referring Worker (if arrived via referral link), authenticate the Client, and redirect to the Marketplace
4. IF a Client submits registration data with an already-used email, THEN THE System SHALL display an error indicating the email is taken and preserve all other entered form data
5. IF a Client submits registration data with invalid fields (name empty or exceeding 255 characters, invalid email format, or password shorter than 8 characters or longer than 100 characters), THEN THE System SHALL display specific validation errors per field without losing other entered data
6. WHEN a registered Client logs in with valid credentials, THE System SHALL authenticate the Client and redirect to the Marketplace
7. IF a registered Client logs in with an incorrect email or password, THEN THE System SHALL display an error indicating invalid credentials without revealing which field is incorrect
8. IF a registered Client attempts to log in but the account is deactivated, THEN THE System SHALL display an error indicating the account is inactive and prevent authentication

### Requirement 6: Order Creation and Payment

**User Story:** As a Client, I want to place an order with a blogger and pay via YooKassa, so that I can purchase advertising services.

#### Acceptance Criteria

1. WHEN a Client clicks "Place Order" on a blogger profile, THE Marketplace SHALL display an order form with the blogger's price and a message field accepting 1 to 1000 characters
2. WHEN a Client submits the order form with a valid message (1 to 1000 characters), THE System SHALL create an Order with status "PENDING_PAYMENT"
3. IF a Client submits the order form with an empty message or a message exceeding 1000 characters, THEN THE System SHALL display a validation error indicating the message length constraint and SHALL NOT create an Order
4. WHEN the Order is created, THE YooKassa_Gateway SHALL generate a payment link for the order amount with an expiration period of 60 minutes
5. IF the YooKassa_Gateway fails to generate a payment link, THEN THE System SHALL update the Order status to "PAYMENT_FAILED" and notify the Client with an error message indicating payment initiation failure
6. WHEN the Client completes payment via YooKassa, THE Escrow_Service SHALL freeze the full order amount on the platform account
7. WHEN payment is confirmed, THE System SHALL update the Order status to "ESCROW_HELD" and notify the Blogger via in-app notification
8. IF payment fails, is cancelled, or the payment link expires, THEN THE System SHALL update the Order status to "PAYMENT_FAILED" and notify the Client via in-app notification

### Requirement 7: Order Fulfillment Flow

**User Story:** As a Blogger, I want to mark an order as completed after filming the ad, so that I can receive payment.

#### Acceptance Criteria

1. WHILE an Order has status "ESCROW_HELD", THE Blogger cabinet SHALL display a "Complete Work" button for that Order only to the Blogger assigned to that Order
2. WHEN the Blogger assigned to the Order clicks "Complete Work", THE System SHALL update the Order status to "BLOGGER_CONFIRMED" and notify the Client
3. IF a user other than the Blogger assigned to the Order attempts to mark the Order as complete, THEN THE System SHALL reject the action with an access error and preserve the current Order status
4. WHILE an Order has status "BLOGGER_CONFIRMED", THE Client cabinet SHALL display a "Confirm Delivery" button for that Order only to the Client who placed that Order
5. WHEN the Client who placed the Order clicks "Confirm Delivery", THE System SHALL update the Order status to "COMPLETED"
6. IF a user other than the Client who placed the Order attempts to confirm delivery, THEN THE System SHALL reject the action with an access error and preserve the current Order status
7. WHEN the Order status changes to "COMPLETED", THE Escrow_Service SHALL distribute funds: Blogger receives (order amount minus Platform_Commission minus Worker_Referral_Commission), Worker receives Worker_Referral_Commission, Platform retains Platform_Commission
8. IF the Order has no associated referring Worker, THEN THE Escrow_Service SHALL distribute funds with Worker_Referral_Commission equal to zero, so that the Blogger receives (order amount minus Platform_Commission) and Platform retains Platform_Commission
9. WHEN funds are distributed, THE System SHALL credit the Blogger balance and the Worker balance (if a referring Worker exists) in the ledger

### Requirement 8: Platform Commission Configuration

**User Story:** As an Admin, I want to configure the platform commission percentage, so that I can adjust platform revenue.

#### Acceptance Criteria

1. THE Admin panel SHALL display a "Marketplace Settings" section showing the current Platform_Commission value as a percentage with up to 2 decimal places
2. WHEN the Admin submits a Platform_Commission value that is less than 1 or greater than 50, THE System SHALL reject the input and display an error message indicating the allowed range is 1 to 50 percent inclusive
3. WHEN the Admin saves a valid Platform_Commission value (integer or decimal between 1 and 50 inclusive), THE System SHALL persist the new value and display a success confirmation within 3 seconds
4. THE System SHALL apply the Platform_Commission that was active at the time of Order creation to that Order, regardless of subsequent changes to the Platform_Commission value
5. IF the Admin submits a Platform_Commission value with more than 2 decimal places, THEN THE System SHALL reject the input and display an error message indicating a maximum of 2 decimal places is allowed

### Requirement 9: Blogger Balance and Withdrawal

**User Story:** As a Blogger, I want to withdraw my earned balance via YooKassa, so that I can receive money to my bank card.

#### Acceptance Criteria

1. THE Blogger cabinet SHALL display the current available balance in rubles with kopek precision (two decimal places)
2. WHEN the Blogger requests a withdrawal, THE System SHALL validate that the requested amount is at least 1.00 RUB, does not exceed the available balance, and contains no more than two decimal places
3. IF the Blogger requests a withdrawal with an amount that is less than 1.00 RUB, exceeds the available balance, or has more than two decimal places, THEN THE System SHALL reject the request, retain the balance unchanged, and return a validation error indicating the reason
4. IF the Blogger requests a withdrawal and no bank card is linked to the Blogger account, THEN THE System SHALL reject the request and return an error indicating that a bank card must be linked before withdrawal
5. WHEN the Blogger submits a valid withdrawal request, THE System SHALL reduce the available balance by the requested amount, set the withdrawal status to "PENDING", and THE YooKassa_Gateway SHALL initiate a payout to the Blogger's linked bank card
6. WHEN YooKassa confirms the payout, THE System SHALL set the withdrawal status to "COMPLETED" and record the transaction in the ledger
7. IF YooKassa rejects the payout, THEN THE System SHALL set the withdrawal status to "FAILED", restore the requested amount to the Blogger available balance, and record the failed transaction in the ledger

### Requirement 10: Worker Referral Commission

**User Story:** As a Worker, I want to receive a commission from each purchase made by clients I referred, so that I am rewarded for bringing customers.

#### Acceptance Criteria

1. WHEN an Order status changes to "COMPLETED" and the Escrow_Service distributes funds, THE Escrow_Service SHALL credit the referring Worker's balance with the Worker_Referral_Commission amount calculated as the configured Worker_Referral_Commission percentage of the Order amount (before deducting Platform_Commission), and SHALL create a ledger entry recording the commission amount, Order identifier, and timestamp
2. IF the Client who placed the Order has no associated referring Worker, THEN THE Escrow_Service SHALL distribute funds without crediting any Worker_Referral_Commission and SHALL allocate the Worker_Referral_Commission portion to the Platform balance
3. THE Worker cabinet SHALL display a paginated history of referral commissions showing for each entry: Order identifier, Client name, Order amount, commission percentage applied, commission amount in rubles, and date of crediting, with a maximum of 50 entries per page
4. THE Admin panel SHALL allow configuration of the Worker_Referral_Commission percentage as a value between 1 and 30 percent (inclusive) with precision up to two decimal places, with a platform-wide default of 5 percent applied to all new Orders
5. IF the Admin submits a Worker_Referral_Commission percentage value outside the range of 1 to 30 or with more than two decimal places, THEN THE System SHALL reject the update, retain the current percentage value, and return a validation error
6. WHEN a Worker requests a withdrawal of a specified amount, THE System SHALL validate that the requested amount does not exceed the Worker's available balance and that the Worker has a linked bank card, and SHALL process the payout via YooKassa_Gateway to the Worker's linked bank card
7. IF a Worker requests a withdrawal without a linked bank card, THEN THE System SHALL reject the withdrawal request and return an error indicating that a bank card must be linked before withdrawal

### Requirement 11: Support and Dispute Resolution

**User Story:** As a Client or Blogger, I want to contact support when there is a dispute, so that the issue can be resolved fairly.

#### Acceptance Criteria

1. WHILE an Order has status "ESCROW_HELD" or "BLOGGER_CONFIRMED", THE System SHALL display a "Contact Support" button linked to that Order in the Client cabinet and the Blogger cabinet
2. WHEN a Client or Blogger submits a support request for an Order, THE System SHALL create a support ticket containing the Order identifier, the submitting user's identifier and role, and a message of 1 to 2000 characters
3. IF a support request message is empty, consists only of whitespace, or exceeds 2000 characters, THEN THE System SHALL reject the submission and return a validation error without creating a ticket
4. THE Admin panel SHALL display a list of open support tickets showing for each ticket: ticket identifier, Order identifier, Order status, Order amount, submitting user's name and role, and submission timestamp
5. WHEN the Admin resolves a dispute in favor of the Client for an Order in status "ESCROW_HELD" or "BLOGGER_CONFIRMED", THE Escrow_Service SHALL refund the frozen order amount to the Client via YooKassa_Gateway and update the Order status to "REFUNDED"
6. WHEN the Admin resolves a dispute in favor of the Blogger for an Order in status "ESCROW_HELD" or "BLOGGER_CONFIRMED", THE Escrow_Service SHALL distribute funds as defined in Requirement 7 criterion 7 (Blogger receives order amount minus Platform_Commission minus Worker_Referral_Commission, Worker receives Worker_Referral_Commission, Platform retains Platform_Commission) and update the Order status to "COMPLETED"
7. WHEN the Admin resolves a dispute, THE System SHALL close the support ticket and record the resolution decision, Admin identifier, and a reason of 1 to 1000 characters in the ticket history

### Requirement 12: Marketplace UI Design

**User Story:** As a Client, I want the marketplace to have a clean and intuitive interface, so that I can easily find and order blogger services.

#### Acceptance Criteria

1. THE Marketplace SHALL use olive green (#6B8E23) as the primary accent color across all pages
2. THE Marketplace SHALL use rounded input fields and buttons with a minimum border-radius of 8px and box-shadow with blur radius between 4px and 8px at no more than 0.2 opacity
3. THE Marketplace SHALL use a layout where no more than 3 primary content sections are visible per viewport, headings are visually distinct from body text by at least 1.5x font size ratio, and interactive elements are visually distinguishable from static content through color or underline
4. THE Marketplace SHALL be responsive on devices with viewport width 320px and above such that all interactive elements have a minimum touch target of 44x44px, no horizontal scrolling is required, and all features accessible on desktop remain accessible on mobile
5. THE Marketplace SHALL display a loading indicator within 200ms of initiating any asynchronous operation
6. IF an asynchronous operation does not complete within 30 seconds, THEN THE Marketplace SHALL replace the loading indicator with an error message indicating the operation timed out and offer a retry option

### Requirement 13: Admin Panel Marketplace Management

**User Story:** As an Admin, I want to manage marketplace settings, bloggers, orders, and disputes from the admin panel, so that I can oversee platform operations.

#### Acceptance Criteria

1. THE Admin panel SHALL display a marketplace dashboard with: total number of Orders across all statuses, total revenue in rubles calculated as the sum of order amounts for Orders in statuses "ESCROW_HELD", "BLOGGER_CONFIRMED", and "COMPLETED", count of Bloggers with active status, and count of registered Clients
2. THE Admin panel SHALL allow viewing and editing Blogger profiles including: category selection from the predefined category list, pricing (value between 1 and 999,999 rubles), and active/inactive status toggle
3. THE Admin panel SHALL display a paginated list of all Orders (maximum 50 per page) with filtering by status (from the set: PENDING_PAYMENT, PAYMENT_FAILED, ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED), by date range, by blogger, and by client
4. THE Admin panel SHALL allow manual Order status changes limited to transitions: from "ESCROW_HELD" to "COMPLETED" (resolve in favor of Blogger) and from "ESCROW_HELD" to a refunded state (resolve in favor of Client), requiring a reason text of 1 to 500 characters for each manual change
5. WHEN the Admin deactivates a Blogger, THE Marketplace SHALL hide the Blogger_Card from the catalog on the next page load (within 5 seconds), while all existing Orders for that Blogger in statuses "ESCROW_HELD" or "BLOGGER_CONFIRMED" SHALL remain active and processable
6. IF the Admin attempts a manual Order status change on an Order not in status "ESCROW_HELD", THEN THE Admin panel SHALL reject the change and display an error indicating that manual status changes are only permitted for Orders in escrow

### Requirement 14: Client Cabinet

**User Story:** As a Client, I want a personal cabinet on the marketplace, so that I can track my orders and manage my account.

#### Acceptance Criteria

1. THE Client cabinet SHALL display a paginated list of all Orders placed by the Client, showing order date, blogger name, order amount, and current status, sorted by creation date descending with a maximum of 20 orders per page
2. THE Client cabinet SHALL display the total amount spent on the platform, calculated as the sum of order amounts for Orders in statuses "COMPLETED" only
3. WHEN an Order status changes, THE Client cabinet SHALL reflect the updated status within 5 seconds of page refresh
4. THE Client cabinet SHALL provide access to order details including blogger name, blogger category, payment status, order amount, and a "Contact Support" button linked to the Order
5. IF the Client has no Orders, THEN THE Client cabinet SHALL display an empty state message indicating no orders have been placed
6. IF a non-authenticated user or a user with a role other than Client attempts to access the Client cabinet, THEN THE System SHALL deny access and redirect to the login page
