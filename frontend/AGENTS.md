# Frontend Agent Rules (Next.js 16)

## Standalone Repository

This is a **standalone repo**. The backend (NestJS) is a separate repository.
API communication via `/api/core/*` rewrites in next.config.ts.

## Full Rules

The `.cursorrules` file contains the complete rule set (20 sections, ~830 lines).

### 20 Sections At a Glance

| # | Section | Key Point |
|---|---|---|
| 1 | Universal Principles | Simplicity first, Rule of Three, Boy Scout, Delete > Deprecate |
| 2 | Zero Tolerance | No wrapper functions, no classes-when-functions, no barrels, max 2-level nesting |
| 3 | KISS/DRY/YAGNI/TDD | No pattern without a problem, extract after 3 uses |
| 4 | Backend API Contract | Backend is source of truth, mirror types with comment |
| 5 | App Router Conventions | Server Components default, file naming, Server Actions, data fetching |
| 6 | RTK Query | ADD for multi-component data; DON'T ADD for single-page reads |
| 7 | Forms & Validation | Native form + Server Actions + Zod preferred |
| 8 | Tailwind 4 | Direct classes, no @apply, no CSS modules |
| 9 | Stripe.js | loadStripe at module scope, ssr: false |
| 10 | Component Architecture | Server-first, colocate, no provider wrappers |
| 11 | TypeScript | unknown > any, type vs interface, no premature generics |
| 12 | Testing | One assertion per concept, inline data, no complex factories |
| 13 | Security | CSRF via RTK interceptor, Zod on Server Actions, no localStorage secrets |
| **14** | **Accessibility** | **Labels on inputs, buttons not divs, focus rings, alt text** |
| **15** | **Performance** | **Dynamic imports for Stripe.js, Promise.all for parallel fetches** |
| **16** | **API Rewrites** | **Use /api/core/* not direct backend URL, rename proxy.ts → middleware.ts** |
| 17 | Git | Small commits, WHAT and WHY |
| 18 | Code Review | 20-item checklist including a11y and dynamic imports |
| 19 | Decision Framework | 10 questions before creating anything |
| 20 | Boy Scout Rule | 13-point refactor-on-touch checklist |

Full rules: see `frontend/.cursorrules`
