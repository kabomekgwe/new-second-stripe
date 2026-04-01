# Adaptive Pricing via Embedded Checkout on /payments/new

## Context

The `/payments/new` page currently uses a 3-step PaymentIntent flow: enter GBP amount, select saved payment method, review & confirm. The backend already has a Checkout Session endpoint with `adaptive_pricing: { enabled: true }`, but the frontend doesn't use it. Stripe's Adaptive Pricing only works with Checkout Sessions, not raw PaymentIntents.

This change replaces the PaymentIntent flow with Stripe's Embedded Checkout, enabling automatic local currency conversion for international users.

## Design

### New User Flow

1. **Step 1 (Amount):** User enters amount in GBP (same as current)
2. **Step 2 (Pay):** Stripe Embedded Checkout renders in-page. Stripe handles payment method selection, Adaptive Pricing currency display, and payment confirmation.
3. **Return:** After payment, user is redirected to `/payments?session_id={CHECKOUT_SESSION_ID}` (existing behavior).

### Frontend Changes

#### `payment-form.tsx` (rewrite)

- **Keep:** `StepAmount` component (GBP amount entry), `StepIndicator` (update to 2 steps: Amount, Pay), `formatPence`/`formatCurrency` utilities, `PaymentStatus` success/error screens
- **Add:** New `StepCheckout` component that:
  - Calls `POST /payments/create-checkout-session` with `{ amountGbp }` to get `clientSecret`
  - Renders `<EmbeddedCheckoutProvider>` + `<EmbeddedCheckout>` from `@stripe/react-stripe-js`
  - Stripe's embedded UI handles payment method selection and Adaptive Pricing
- **Remove:** `StepMethod`, `StepConfirmPay`, all FX quote state/logic, `useCreatePaymentIntentMutation`, `useGetFxQuoteMutation`, `useSetDefaultMethodMutation`, payment-methods-api import

#### `payments-api.ts` (add endpoint)

```typescript
createCheckoutSession: builder.mutation<CreateCheckoutSessionResponse, CreateCheckoutSessionRequest>({
  query: (body) => ({ url: '/payments/create-checkout-session', method: 'POST', body }),
  invalidatesTags: ['Payments'],
}),
```

Import `CreateCheckoutSessionRequest` and `CreateCheckoutSessionResponse` from `@stripe-app/shared` (already defined).

#### Component State (simplified)

```
step: 'amount' | 'checkout' | 'success' | 'error'
amountGbp: number
errorMessage: string
checkoutClientSecret: string | null
```

No more: `selectedMethodId`, `fxQuote`, `isQuoteLoading`, `quoteError`, `setDefaultMethod`.

### Backend Changes

**None.** The `POST /payments/create-checkout-session` endpoint already exists with:
- `adaptive_pricing: { enabled: true }`
- `ui_mode: 'embedded'`
- `return_url: ${frontendUrl}/payments?session_id={CHECKOUT_SESSION_ID}`
- Payment record creation in database

### Webhook Changes

**None.** Checkout session handlers already exist:
- `checkout.session.completed` -> SUCCEEDED
- `checkout.session.async_payment_succeeded` -> SUCCEEDED
- `checkout.session.async_payment_failed` -> FAILED
- `checkout.session.expired` -> CANCELLED

### Files to Modify

| File | Action |
|------|--------|
| `frontend/components/payments/payment-form.tsx` | Rewrite: remove PI flow, add Embedded Checkout |
| `frontend/lib/store/payments-api.ts` | Add `createCheckoutSession` mutation |

### Files Unchanged

| File | Reason |
|------|--------|
| `core-backend/src/payments/payments.service.ts` | Checkout session endpoint already exists (lines 137-197) |
| `core-backend/src/payments/payments.controller.ts` | Route already exists (line 39-45) |
| `core-backend/src/payments/dto/create-checkout-session.dto.ts` | DTO already defined |
| `shared/src/types/api.types.ts` | Types already defined (lines 90-97) |
| `webhooks-backend/src/webhooks/handlers/checkout-session.handler.ts` | Handlers already exist |

## Verification

1. Start the app: `docker compose up` (or equivalent)
2. Navigate to `http://localhost:3000/payments/new`
3. Enter a GBP amount and click Continue
4. Verify Stripe Embedded Checkout renders with:
   - Payment method selection (cards, wallets)
   - Adaptive Pricing showing local currency if user is non-GBP
5. Complete a test payment with `4242 4242 4242 4242`
6. Verify redirect to `/payments` page
7. Check payment appears in payment history with correct status
8. Test with a non-GBP user to verify Adaptive Pricing shows converted amount
