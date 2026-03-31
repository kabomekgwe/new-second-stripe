# Plan: Test Add Payment Method Flow

## Overview

Test and fix the "Add Payment Method" functionality end-to-end, covering frontend Stripe Elements, backend sync logic, webhooks, and database persistence.

## Architecture Flow

```
User → /payment-methods/add
  → POST /payment-methods/setup-intent (client secret)
  → Stripe PaymentElement (render)
  → stripe.confirmSetup()
  → POST /payment-methods/sync (payment method ID)
  → Database upsert
  ← Redirect to /payment-methods with success

Webhook (async):
  setup_intent.succeeded / payment_method.attached
  → Database sync (idempotent)
```

## Issues to Investigate

### Potential Problems Found

1. **Redundant Sync Paths**: Both frontend sync (`POST /payment-methods/sync`) and webhooks (`setup_intent.succeeded`, `payment_method.attached`) save the same data - could cause race conditions or duplicate logic
2. **Default PM Logic**: Three places set default: sync endpoint, setup-intent webhook, payment-method webhook - potential inconsistency
3. **Error Handling**: Frontend catches sync errors but shows success anyway - may hide real issues
4. **Metadata Not Stored**: `payment_method.handler.ts` doesn't store metadata column but `payment-methods.sql.service.ts` does

## Subagent Tasks (7 Agents)

### Agent 1: Frontend Integration Tester
**Goal**: Test Stripe PaymentElement integration and form submission

**Files**:
- `frontend/app/(protected)/payment-methods/add/page.tsx`
- `frontend/lib/store/payment-methods-api.ts`
- `frontend/lib/stripe.ts`

**Tasks**:
1. Verify Stripe Elements loads with correct client secret
2. Test form submission with test cards: `4242424242424242` (success), `4000000000000002` (decline)
3. Check error states: missing client secret, Stripe load failure
4. Verify sync endpoint is called after confirmSetup succeeds
5. Test redirect behavior on success
6. Identify any missing error handling or loading states

**Test Cards** (from e2e tests):
```javascript
STRIPE_TEST_CARDS = {
  visa: '4242424242424242',
  declined: '4000000000000002',
  require3DS: '4000002500003155',
}
```

---

### Agent 2: Backend API Tester
**Goal**: Test backend endpoints for setup intent creation and payment method sync

**Files**:
- `core-backend/src/payment-methods/payment-methods.controller.ts`
- `core-backend/src/payment-methods/payment-methods.service.ts`
- `core-backend/src/payment-methods/payment-methods.sql.service.ts`

**Tasks**:
1. Test `POST /payment-methods/setup-intent` returns valid client secret
2. Test `POST /payment-methods/sync` with valid payment method ID
3. Test error cases:
   - Missing stripePaymentMethodId
   - Invalid payment method ID (not found in Stripe)
   - User without Stripe customer ID
4. Verify first payment method is set as default
5. Check idempotency - calling sync twice should not fail

---

### Agent 3: Webhook Handler Tester
**Goal**: Test webhook handlers for payment method events

**Files**:
- `webhooks-backend/src/webhooks/handlers/payment-method.handler.ts`
- `webhooks-backend/src/webhooks/handlers/setup-intent.handler.ts`
- `webhooks-backend/src/webhooks/webhooks.service.ts`

**Tasks**:
1. Test `payment_method.attached` webhook processing
2. Test `setup_intent.succeeded` webhook processing
3. Verify both handlers correctly find user by Stripe customer ID
4. Check default payment method logic is consistent across both handlers
5. Test webhook with missing customer ID
6. Verify webhook handler doesn't fail if PM already synced from frontend

---

### Agent 4: Database Integration Tester
**Goal**: Test database operations for payment method persistence

**Files**:
- `core-backend/src/payment-methods/payment-methods.sql.service.ts`
- `shared/src/entities/payment-method.entity.ts`

**Tasks**:
1. Test `upsertFromStripe` creates new payment method
2. Test `upsertFromStripe` updates existing payment method (ON CONFLICT)
3. Test `setDefault` correctly updates all payment methods for user
4. Verify unique constraint on `stripePaymentMethodId` works
5. Check cascade delete when user is deleted
6. Test query performance with multiple payment methods per user

**Key SQL to Test**:
```sql
-- Upsert
INSERT INTO payment_methods (...) VALUES (...)
ON CONFLICT ("stripePaymentMethodId") DO UPDATE SET ...

-- Set Default
UPDATE payment_methods SET "isDefault" = false WHERE "userId" = $1
UPDATE payment_methods SET "isDefault" = true 
  WHERE "userId" = $1 AND "stripePaymentMethodId" = $2
```

---

### Agent 5: E2E Flow Tester
**Goal**: Run existing E2E tests and identify failures

**Files**:
- `e2e-tests/tests/complete-user-flow.spec.ts`
- `e2e-tests/tests/payments.spec.ts`

**Tasks**:
1. Run `pnpm test:e2e` in e2e-tests directory
2. Capture screenshots and logs from test failures
3. Identify which step fails: registration, login, add PM, verify PM
4. Check for timing issues (Stripe iframe loading, network delays)
5. Look for flaky test patterns (waits, retries, timeouts)
6. Compare test expectations with actual app behavior

**Test Command**:
```bash
cd e2e-tests
pnpm test tests/complete-user-flow.spec.ts
```

---

### Agent 6: Race Condition Investigator
**Goal**: Identify race conditions between frontend sync and webhook handlers

**Files**:
- `frontend/app/(protected)/payment-methods/add/page.tsx` (line 148-156)
- `core-backend/src/payment-methods/payment-methods.service.ts` (line 217-252)
- `webhooks-backend/src/webhooks/handlers/setup-intent.handler.ts` (line 15-49)
- `webhooks-backend/src/webhooks/handlers/payment-method.handler.ts` (line 13-55)

**Known Race Scenarios**:
1. Frontend sync + `setup_intent.succeeded` webhook arrive simultaneously
2. `payment_method.attached` + `setup_intent.succeeded` webhooks for same PM
3. Default PM set by frontend sync, then overwritten by webhook

**Tasks**:
1. Map all code paths that write to `payment_methods` table
2. Check for locking mechanisms (transactions, SELECT FOR UPDATE)
3. Verify upsert logic handles concurrent writes
4. Identify if default PM logic can be inconsistent
5. Propose fix: single source of truth for default PM setting

---

### Agent 7: Integration & Smoke Tester
**Goal**: Run full end-to-end flow manually and document issues

**Prerequisites**:
- Core backend running on port 3001
- Frontend running on port 3000
- Webhooks backend running on port 3002
- Stripe CLI forwarding webhooks
- PostgreSQL database running

**Tasks**:
1. Start all services:
   ```bash
   # Terminal 1
   cd core-backend && pnpm run start:dev
   
   # Terminal 2
   cd frontend && pnpm run dev
   
   # Terminal 3
   cd webhooks-backend && pnpm run start:dev
   
   # Terminal 4
   stripe listen --forward-to localhost:3002/webhooks
   ```
2. Register new user at http://localhost:3000/auth/register
3. Login with new user
4. Navigate to /payment-methods
5. Click "Add Payment Method"
6. Fill Stripe test card: 4242424242424242, 12/30, 123
7. Submit and verify:
   - Success message appears
   - Redirects to /payment-methods
   - Card appears in list
   - Shows as default (first card)
8. Add second card and verify both appear
9. Check database for correct records:
   ```sql
   SELECT * FROM payment_methods WHERE "userId" = '<user_id>';
   ```
10. Check Stripe Dashboard for payment methods attached to customer
11. Document any errors, unexpected behavior, or missing features

---

## Expected Output from Each Agent

Each agent should produce:

1. **Test Results**: Pass/Fail status for each test case
2. **Logs/Errors**: Console output, API responses, database queries
3. **Issues Found**: List of bugs, inconsistencies, or improvements needed
4. **Recommendations**: Specific code changes or additional tests needed

## Success Criteria

- ✅ User can add payment method via UI
- ✅ Payment method appears in database
- ✅ First payment method is set as default
- ✅ Multiple payment methods can be added
- ✅ No race conditions or duplicate entries
- ✅ E2E tests pass consistently
- ✅ Webhook handlers work when frontend sync fails

## Critical Logic Fixes Needed

Based on initial analysis, these fixes are likely required:

1. **Consolidate default PM setting**: Only set default in one place
2. **Add idempotency protection**: Use database transactions or locks
3. **Fix metadata storage**: Ensure webhook handlers store metadata
4. **Improve frontend error handling**: Don't show success if sync fails
5. **Add logging**: Better visibility into sync vs webhook paths

## Timeline

- Agents 1-4: Test individual components (30 minutes each)
- Agent 5: Run E2E tests (15 minutes)
- Agent 6: Race condition analysis (30 minutes)
- Agent 7: Manual integration test (30 minutes)
- Aggregate results and implement fixes (60 minutes)

**Total**: ~4 hours including fixes