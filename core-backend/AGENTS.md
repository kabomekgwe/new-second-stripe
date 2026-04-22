# Backend Agent Rules (NestJS 11)

## Standalone Repository

This is a **standalone repo**. The frontend (Next.js) is a separate repository.
CORS origin via FRONTEND_URL environment variable.

## Full Rules

The `.cursorrules` file contains the complete rule set (30 sections, ~950 lines).

### 30 Sections At a Glance

| # | Section | Key Point |
|---|---|---|
| 1 | Universal Principles | Simplicity first, Rule of Three, Boy Scout, Delete > Deprecate |
| 2 | Zero Tolerance | No delegation services, no Symbol tokens, no barrels, max 2-level nesting |
| 3 | KISS/DRY/YAGNI/TDD | No pattern without a problem, extract after 3 uses |
| 4 | Frontend API Contract | Backend is source of truth, consistent error shape |
| 5 | Module Architecture | Feature modules self-contained, global DatabaseModule/StripeModule |
| 6 | Request Lifecycle | Middleware → Guards → Interceptors → Pipes → Controller → Service → Filters |
| 7 | Controllers | Thin, declarative, no business logic |
| 8 | Services | Only when real logic exists beyond delegation |
| 9 | Data Access | OracleService with raw SQL, bind params, MERGE INTO, sql-mappers |
| 10 | DTOs & Validation | class-validator, no inheritance, global ValidationPipe |
| 11 | Guards | AuthenticatedGuard on protected, no RolesGuard until needed |
| 12 | Pipes | ValidationPipe covers 95%, no custom pipes unless needed |
| 13 | Interceptors | Logging + serialization already global, don't add more |
| 14 | Exception Filters | Built-in exceptions, don't catch-and-rethrow |
| 15 | Stripe | Thin wrappers, idempotency keys, webhooks need raw body |
| 16 | Auth & Sessions | Passport + Redis + CSRF, session regeneration on login |
| 17 | Configuration | ConfigService, no wrappers, required vs optional env vars |
| 18 | Security | Helmet, CORS, CSRF, rate limiting, session security |
| 19 | Scheduling | @Cron for billing, tasks must be idempotent |
| **20** | **Pagination** | **offset/limit, default 20, max 100, allowlist sort values** |
| **21** | **Health Checks** | **Simple /health, no auth, no DB queries** |
| **22** | **Rate Limit Errors** | **ThrottlerGuard 429s, @Throttle on auth, no custom handling** |
| **23** | **Docker** | **Multi-stage builds, health checks, migrations on startup** |
| 24 | Testing | Service + mapper tests, no simple-delegation tests |
| 25 | Logging | NestJS Logger, no console.log, no sensitive data |
| 26 | TypeScript | strict, unknown > any, no premature generics |
| 27 | Git | Small commits, WHAT and WHY |
| 28 | Code Review | Checklist including pagination, health checks |
| 29 | Decision Framework | 10 questions before creating anything |
| 30 | Boy Scout Rule | 10-point refactor-on-touch checklist |

Full rules: see `core-backend/.cursorrules`
