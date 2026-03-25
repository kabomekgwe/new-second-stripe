# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stripe payment integration monorepo with four packages: core API, webhook handler, Next.js frontend, and shared library.

## Tech Stack

- **Backend:** NestJS 11, TypeORM 0.3, PostgreSQL 16, Redis 7
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Stripe.js
- **Auth:** Passport.js (local strategy) with Redis-backed sessions
- **Payments:** Stripe SDK v20 with idempotency keys
- **Runtime:** Node.js 22, TypeScript 5.7

## Commands

### Development

```bash
# Start all services (DB, Redis, backends, frontend)
docker-compose up

# Or run individually:
cd core-backend && npm run start:dev     # Port 4917
cd webhooks-backend && npm run start:dev # Port 4923
cd frontend && npm run dev              # Port 3847

# Build shared package first (backends depend on it)
cd shared && npm run build
```

### Testing

```bash
cd core-backend && npm test              # Unit tests
cd core-backend && npm run test:e2e      # E2E tests
cd webhooks-backend && npm test
```

### Linting

```bash
cd core-backend && npm run lint
cd webhooks-backend && npm run lint
cd frontend && npm run lint
```

## Architecture

### Package Relationships

```
frontend (Next.js) --> core-backend (NestJS) --> PostgreSQL
                                              --> Redis (sessions)
                                              --> Stripe API

Stripe --> webhooks-backend (NestJS) --> PostgreSQL
                                     --> (updates same DB as core-backend)

shared/ --> imported by both backends (entities, types, constants)
```

### Key Design Decisions

- **Two separate backends:** core-backend handles user-facing API; webhooks-backend handles Stripe webhooks (needs `rawBody: true` for signature verification). They share the same PostgreSQL database.
- **Shared package:** TypeORM entities, API types, Stripe enums, and currency constants live in `shared/` and are imported via relative path (`../shared`). Must be built before backends.
- **Session auth:** Express sessions stored in Redis (7-day expiry), not JWT. Frontend uses `credentials: 'include'` on all fetch calls.
- **Idempotency:** All Stripe API calls use idempotency keys to prevent duplicate charges. See `core-backend/src/common/utils/idempotency.ts`.
- **FX quotes:** Payments support multi-currency conversion with Stripe FX quotes. Base currency is GBP.

### Module Organization (core-backend)

| Module | Purpose |
|--------|---------|
| `auth/` | Login/register, Passport local strategy, session guards |
| `stripe/` | Stripe SDK wrapper (customers, intents, payment methods) |
| `users/` | User CRUD, Stripe customer linkage |
| `payments/` | PaymentIntent lifecycle |
| `payment-methods/` | SetupIntents, attach/detach methods |
| `billing/` | Usage-based billing with scheduled cycles (`@nestjs/schedule`) |
| `config/` | Database and session configuration |
| `common/` | Exception filters, logging interceptor, idempotency utils |

### Webhook Event Flow

webhooks-backend receives Stripe events at `POST /webhook`, routes them through handlers:
- `payment-intent.handler.ts` - payment state changes
- `setup-intent.handler.ts` - payment method setup completion
- `payment-method.handler.ts` - method updates/detach

### Frontend Structure

- `app/(protected)/` - Authenticated routes (dashboard)
- `app/auth/` - Login/register pages
- `components/` - Organized by domain (auth, billing, payments, payment-methods, ui)
- `lib/api-client.ts` - Fetch wrapper with credentials for session cookies
- `lib/stripe.ts` - Stripe.js client initialization

### Database Entities (shared/src/entities/)

- `User` - email, passwordHash (excluded from serialization), country, stripeCustomerId, defaultPaymentMethodId
- `Payment` - amount, currency, status, stripePaymentIntentId, fxQuote fields
- `PaymentMethod` - type, last4, expiry, stripePaymentMethodId
- `UsageCharge` - billing cycle charges

## Environment Setup

Copy `.env.example` in core-backend, webhooks-backend, and frontend. Key vars:
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` - Stripe API keys
- `STRIPE_WEBHOOK_SECRET` - For webhook signature verification (webhooks-backend only)
- `SESSION_SECRET` - Express session encryption (core-backend only)
- PostgreSQL defaults: host=localhost, port=5481, db=stripe_app, user=postgres
- Redis default: redis://localhost:6382

## Startup Order

PostgreSQL -> Redis -> core-backend -> webhooks-backend -> frontend

## Workflow Rules (Auto-Applied)

### Before Starting Any Implementation Task

**Step 1: Assess Scale**

| Scale | Signals | Files | Action |
|-------|---------|-------|--------|
| Quick | "fix", "bug", "typo", "update" | 1-3 | Skip to implementation |
| Standard | "feature", "add", "implement" | 4-15 | Create Control Manifest |
| Enterprise | "system", "migrate", "redesign" | 15+ | Full project docs |

**Step 2: Based on Scale**

- **Quick**: Implement directly, add test if applicable, quick review
- **Standard**:
  1. Check for Control Manifest at `.claude/manifests/[feature].md`
  2. Create if missing using `/manifest <feature>`
  3. Follow constraints defined in manifest
- **Enterprise**:
  1. Ensure `.claude/docs/` exists with PRD + Architecture
  2. Use `/init-docs` if missing
  3. Break work into epics/stories with Control Manifests each

**Step 3: Before Handoff Between Agents**

- Commit current work with descriptive message
- Include commit hash in handoff message
- Reference Control Manifest if exists
- Update manifest with any deviations
