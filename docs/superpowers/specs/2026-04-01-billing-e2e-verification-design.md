# Billing End-to-End Verification & Fix

## Context

The billing system for monthly management fees exists in code but has never been tested end-to-end. A separate microservice updates `User.monthlyManagementFee` in the database. A cron job on the 1st of each month reads that value and reports usage to Stripe's metered billing system, which generates invoices, charges users, and triggers webhooks that update charge status and send email receipts.

The Stripe Billing Meter and metered Price have not been created in the Stripe Dashboard yet — these are prerequisites for the code to function.

## Scope

1. **Stripe Dashboard Setup** — Create required Stripe objects (Meter + Price)
2. **Backend Audit & Fix** — Verify the billing flow works, fix issues found
3. **Frontend Verification** — Confirm the existing billing page renders correctly

## Architecture (Existing)

```
Microservice → updates User.monthlyManagementFee in DB
                      ↓
BillingScheduler (cron 9AM 1st) → BillingService.chargeAllUsers()
                      ↓
findBillableUsers() → users where fee > 0, has payment method, has Stripe customer
                      ↓
For each user:
  ensureBillingSubscription() → create/find Stripe subscription with metered price
  createMeterEvent() → report usage amount to Stripe
  upsertUsageCharge() → record charge as PROCESSING (stripeInvoiceId = null at this point)
                      ↓
Stripe generates invoice automatically from meter events
                      ↓
Webhook: invoice.finalized → attach stripeInvoiceId + stripePaymentIntentId to charge (remains PROCESSING)
Webhook: invoice.paid → update charge to PAID + send email via Resend
Webhook: invoice.payment_failed → update charge to FAILED
                      ↓
Note: Webhook matching uses (stripeSubscriptionId, stripeSubscriptionItemId, billingPeriodStart, billingPeriodEnd)
— NOT invoice ID. Period date alignment between meter events and invoice line items is critical.
                      ↓
Frontend: /billing page shows current fee + charge history table
```

## 1. Stripe Dashboard Setup

### Objects to Create (Test Mode)

| Object | Config | Notes |
|--------|--------|-------|
| Billing Meter | event_name: `management_fee`, aggregation: `sum` | Tracks fee units |
| Product | name: `Management Fee` | Container for the price |
| Price | metered, per_unit, £0.01/unit, linked to meter | 1500 units = £15.00 |

### Environment Variable

```
STRIPE_BILLING_METERED_PRICE_ID=price_xxxxx
```

### Pre-flight Check

After setting the env var, verify the price is linked to a meter:
- `retrievePrice(priceId)` returns `recurring.meter` (non-null)
- `retrieveBillingMeter(meterId)` returns `event_name`

If either fails, `getBillingMeterEventName()` throws at charge time — catch this early.

## 2. Backend Audit Checklist

### Module Registration
- [ ] `@nestjs/schedule` `ScheduleModule.forRoot()` imported in `AppModule`
- [ ] `BillingScheduler` registered as a provider in `BillingModule`
- [ ] `BillingModule` imported in `AppModule`

### Environment & Config
- [ ] `STRIPE_BILLING_METERED_PRICE_ID` is set and non-empty (constructor defaults to `''` which passes the production guard but fails at call time)
- [ ] Webhook event router (`webhooks.service.ts`) includes `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created/updated/deleted` in its event constants

### BillingService Flow
- [ ] `findBillableUsers()` query returns users correctly
- [ ] `ensureBillingSubscription()` creates subscription on first call, reuses on subsequent
- [ ] `createMeterEvent()` successfully reports to Stripe
- [ ] `upsertUsageCharge()` creates record with correct period dates
- [ ] Idempotency key prevents duplicate charges in same month

### Webhook Handlers
- [ ] `invoice.finalized` event processed — `stripeInvoiceId` populated on charge record
- [ ] `invoice.paid` event processed — charge status updated to PAID
- [ ] `invoice.payment_failed` event processed — charge status updated to FAILED
- [ ] Email sent on PAID status (via Resend)
- [ ] `customer.subscription.created/updated/deleted` events handled

### Known Issues to Investigate
- **Period date matching** (HIGH RISK): `findUsageCharges` matches by `(subscriptionId, subscriptionItemId, billingPeriodStart, billingPeriodEnd)`. The `toPeriodEndDate` helper subtracts 1 second before stripping time. If Stripe's invoice `line.period.end` timestamp doesn't align, the lookup returns zero rows and the charge is never updated.
- **`current_period_start/end` type cast** (CONFIRMED): Both `billing.service.ts` and `subscription.handler.ts` use unsafe casts `& { current_period_start?: number }` because these fields aren't in the `2026-02-25.clover` TypeScript types. Verify they still exist at runtime.
- **Meter event `identifier` uniqueness**: Stripe may reject duplicate identifiers — confirm behavior.
- **`amountGbp` naming**: Stored in pence, not pounds. Frontend `formatPence` divides by 100. Email passes `amountPence: Number(charge.amountGbp)`. Semantically correct but fragile naming.

## 3. Frontend Verification

### Existing Components
- `CurrentFee` — displays `monthlyManagementFee` and `accountValue`
- `BillingHistory` — table with period, amount, status columns

### Verify
- [ ] RTK Query endpoint `/billing` returns charge data
- [ ] RTK Query endpoint `/billing/current-fee` returns fee data
- [ ] Table renders with correct formatting (pence → pounds)
- [ ] Status badges show correct colors
- [ ] Empty state shown when no charges exist

## Key Files

| File | Purpose |
|------|---------|
| `core-backend/src/billing/billing.service.ts` | Core billing logic |
| `core-backend/src/billing/billing.scheduler.ts` | Cron trigger |
| `core-backend/src/billing/billing.sql.service.ts` | Database queries |
| `core-backend/src/billing/billing.controller.ts` | REST endpoints |
| `core-backend/src/stripe/stripe.service.ts` | Stripe API wrapper |
| `core-backend/src/common/utils/idempotency.ts` | Idempotency key generation |
| `webhooks-backend/src/webhooks/webhooks.service.ts` | Webhook event router |
| `webhooks-backend/src/webhooks/handlers/invoice.handler.ts` | Invoice webhook handling |
| `webhooks-backend/src/webhooks/handlers/subscription.handler.ts` | Subscription webhook handling |
| `webhooks-backend/src/email/email.service.ts` | Invoice email sending |
| `shared/src/entities/usage-charge.entity.ts` | UsageCharge entity |
| `shared/src/entities/billing-subscription.entity.ts` | BillingSubscription entity |
| `shared/src/types/stripe.types.ts` | ChargeStatus & BillingSubscriptionStatus enums |
| `frontend/app/(protected)/billing/page.tsx` | Billing page |
| `frontend/components/billing/billing-history.tsx` | Charge history table |
| `frontend/components/billing/current-fee.tsx` | Current fee display |
| `frontend/lib/store/billing-api.ts` | RTK Query billing endpoints |

## Testing Strategy

### Happy Path
1. **Set up Stripe objects** in test mode dashboard
2. **Set a test user's** `monthlyManagementFee` to a value (e.g., 1500 = £15.00)
3. **Start Stripe CLI** webhook forwarding: `stripe listen --forward-to localhost:3001/webhooks`
4. **Manually trigger** `POST /billing/charge` with amount matching `monthlyManagementFee`
5. **Verify in Stripe Dashboard** that meter event was created and invoice generated
6. **Verify** `usage_charges` row has `stripeInvoiceId` populated (confirms `invoice.finalized` webhook worked)
7. **Verify** charge status is PAID in database (confirms `invoice.paid` webhook worked)
8. **Check** the frontend billing page shows the charge correctly
9. **Verify** invoice email is received (if Resend configured)

### Failure Path
10. **Create a charge with declining card** (Stripe test card `4000000000000341`) — confirm status becomes FAILED and no email is sent

### Idempotency
11. **Trigger `POST /billing/charge` twice** for same user in same month — confirm only one `usage_charge` row exists and no second meter event in Stripe

## Decision: Keep Stripe-Managed Billing

We're keeping the existing Stripe metered billing approach rather than switching to raw PaymentIntents because:
- Stripe handles retry logic (Smart Retries) for failed payments
- Built-in dunning management
- Subscription lifecycle states managed by Stripe
- Invoice generation handled by Stripe
- Less custom code to maintain
