---
name: nextjs-server-components
description: Next.js App Router Server Components, Client Components, layouts, data fetching, and Server Actions. Use when working with Next.js app directory, component boundaries, or data fetching patterns.
---

# Next.js Server Components

Expert guidance for using Next.js Server Components effectively.

## Quick Reference

| Concept | Pattern | When to Use |
|---------|---------|-------------|
| Server Component | Default (no "use client") | Data fetching, heavy computation, no interactivity |
| Client Component | Add "use client" | State, hooks, browser APIs, event handlers |
| Layout | app/layout.tsx | Shared UI across routes |
| Template | app/template.tsx | Shared UI that re-renders on navigation |
| Server Action | async function in Server Component | Form mutations, data updates |
| Parallel Routes | folder@(sidebar) | Independent route segments |

## What Do You Need?

1. **Server vs Client** - Choosing the right component type
2. **Data fetching** - Async components, caching, revalidation
3. **Server Actions** - Form handling, mutations
4. **Patterns** - Composition, prop drilling prevention
5. **Streaming** - Suspense boundaries, loading states

Specify a number or describe your Next.js component scenario.

## Routing

| Response | Reference to Read |
|----------|-------------------|
| 1, "server", "client", "boundary" | [component-types.md](./references/component-types.md) |
| 2, "data", "fetch", "cache", "revalidate" | [data-fetching.md](./references/data-fetching.md) |
| 3, "action", "mutation", "form" | [server-actions.md](./references/server-actions.md) |
| 4, "pattern", "composition", "prop drilling" | [patterns.md](./references/patterns.md) |
| 5, "suspense", "loading", "streaming" | [streaming.md](./references/streaming.md) |

## Essential Principles

**Default to Server Components**: Only add "use client" when you genuinely need client-side features. This is the single most important Next.js best practice.

**Server Components for**: Data fetching, database queries, API calls, heavy computation, keeping sensitive tokens safe.

**Client Components for**: State (useState), effects (useEffect), browser APIs, event handlers, React hooks.

**Push Client Components down**: Move "use client" as deep in the tree as possible. Keep the root Server Component.

## Common Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| Client Component that should be Server | High | Remove "use client", make async |
| Fetching in useEffect | High | Use Server Component or Server Action |
| "use client" at root | Medium | Push down to leaf components |
| Not using async for data fetching | Low | Make Server Component async |
| Prop drilling through Server | Low | Pass to Client child, don't bridge |

## Code Patterns

### Server Component (Default)
```typescript
// Good: Async Server Component
export default async function UserProfile({ userId }: { userId: string }) {
  const user = await fetchUser(userId)
  return <div>{user.name}</div>
}
```

### Client Component (When Needed)
```typescript
"use client"

import { useState } from 'react'

export function InteractiveButton() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Server Action
```typescript
// Server Action in Server Component
async function createTodo(formData: FormData) {
  'use server'
  const title = formData.get('title') as string
  await db.todos.create({ title })
}

export default function Page() {
  return <form action={createTodo}>...</form>
}
```

## Reference Index

| File | Topics |
|------|--------|
| [component-types.md](./references/component-types.md) | Server vs Client, boundary placement |
| [data-fetching.md](./references/data-fetching.md) | Async components, fetch caching, revalidation |
| [server-actions.md](./references/server-actions.md) | Form actions, mutations, revalidation |
| [patterns.md](./references/patterns.md) | Composition, prop drilling prevention |
| [streaming.md](./references/streaming.md) | Suspense, loading.tsx, progressive rendering |

## Success Criteria

Components are correct when:
- Default to Server (no "use client" unless needed)
- "use client" only for interactivity, browser APIs, hooks
- Data fetching in Server Components, not useEffect
- Server Actions for mutations, not API routes
- Client boundaries pushed down as far as possible
