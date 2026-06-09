# Squidex — Agent Guide

This is a **white-label AI chatbot platform** (agencies resell branded chatbots to clients).
Backend: a single Powabase project proxied through Next.js.
Frontend: one Next.js app serving both the agency dashboard and the embed widget.

---

## Quick start

```sh
bun dev          # dev server (Next.js 16)
bun run build    # production build
bun run typecheck  # tsc --noEmit (scripts/ excluded from tsconfig)
bun run format   # prettier
bun run migrate  # scripts/migrate.ts → runs db/migrations/*.sql
```

## Framework quirks (Next.js 16.2.6)

This version differs from training data.

- **`middleware.ts` is dead.** Use `proxy.ts` with `export async function proxy(request: NextRequest)`.
  Config matcher works the same. See the existing `proxy.ts` for patterns.
- Read `node_modules/next/dist/docs/` before writing code — breaking changes are documented there.
- Route handlers still use `export async function GET/POST/PATCH/DELETE`.
- `params` in route handlers is a **Promise** — always `const { id } = await params`.

## Package manager & toolchain

- **Bun** — `bun add`, `bun run`, `bun x`
- **Tailwind v4** — `@import "tailwindcss"` in `globals.css`, config in CSS via `@theme inline`.
  No `tailwind.config.ts`. PostCSS via `@tailwindcss/postcss`.
- **shadcn/ui** — radix-nova style. Aliases: `@/components/ui`, `@/lib/utils` (cn helper).
  Add components via the `shadcn` package or write manually.
- **Prettier** — `no semi`, `double quotes`, `trailingComma: es5`, `prettier-plugin-tailwindcss`.

## Powabase backend

Base URL: `https://{ref}.p.powabase.ai`. Every API call needs **two headers**:

```
apikey: <service-role-key>
Authorization: Bearer <service-role-key>
```

All Powabase calls route through `lib/powabase/client.ts` — don't call Powabase directly.
The typed client handles: error types (402/409/503/429), 409 duplicate_source reuse,
503 retry with backoff. Key operations:

| What | Endpoint | Our wrapper |
|------|----------|-------------|
| Upload doc | `POST /api/sources/upload` (multipart) | `uploadSource(file, name)` |
| Create KB | `POST /api/knowledge-bases` | `createKnowledgeBase(name)` |
| Add source to KB | `POST /knowledge-bases/{id}/sources` | `addSourceToKnowledgeBase(kbId, sourceId)` |
| Create agent | `POST /api/agents` | `createAgent({name, model, system_prompt, settings})` |
| Link KB → agent | `POST /api/agents/{id}/knowledge-bases` | `linkKnowledgeBaseToAgent(agentId, kbId)` |
| Chat (SSE) | `POST /api/agents/{id}/run/stream` | `runAgentStream(agentId, message, sessionId?)` |

### Powabase gotchas

- **`temperature` must nest in `settings`** — top-level is silently dropped.
- **`/api/agents/{id}/run` has NO tools.** Always use `/run/stream`.
- **SSE processing:** buffer on `\n`, drop lines starting with `:` (keepalive),
  parse `data: {...}` fields. Events use `event` field. The canonical parser is at
  `references/streaming-sse.md` in the Powabase skill.
- **409 duplicate_source** means identical bytes were already uploaded — reuse the
  existing source (don't error). Our client returns `{ id, duplicate: true }`.
- **402 insufficient_credits** → surface `renews_at`, don't retry.
- **503 billing** → retry with backoff (built into `request()`).
- **Extraction barrier:** don't add a source to a KB until `extraction_status === "extracted"`.
  `attention_required` is also rejected — re-extract with OCR.
- **Source flows:** upload (returns `pending`) → poll `extracted` → add to KB (triggers indexing) → poll `indexed`.
- **RAG pipeline order is enforced in:** `app/api/bots/[id]/sources/upload/route.ts` (`processSourceAsync`).

## Database

Direct Postgres via `pg` Pool (`DATABASE_URL`). 7 tables in `public` schema:

`agencies`, `agency_users`, `client_bots`, `bot_knowledge_sources`, `bot_leads`, `bot_conversations`, `bot_messages`

All tenant-scoped tables carry `agency_id`. RLS policies use `app.current_agency_id` session variable.

### Query helpers in `lib/db/client.ts`

```ts
import { query, withTenant } from "@/lib/db/client"

// Simple query (no tenant isolation needed for reading agency row, etc.)
const rows = await query("SELECT * FROM agencies WHERE id = $1", [id])

// Tenant-isolated transaction (sets app.current_agency_id via SET LOCAL)
const result = await withTenant(agencyId, async () => {
  return query("INSERT INTO client_bots (...) VALUES (...) RETURNING *", [...])
})
```

## Auth (GoTrue)

Powabase ships GoTrue at `/auth/v1/`. We use `@supabase/ssr` (`createServerClient`).

- `lib/auth/gotrue.ts` — creates a server-side Supabase client bound to request cookies
- `lib/auth/session.ts` — `getSession()` returns `SessionUser | null`, used in every protected API route and server component
- `proxy.ts` — checks auth for all routes except: `/`, `/login`, `/register`, `/embed/*`, `/api/auth/*`, `/api/widget/*`
- Registration flow: GoTrue signup → create agency row → create agency_user row (in `POST /api/auth/register`)

## Routes

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public (or redirect to /dashboard) | Landing page |
| `/login`, `/register` | Public | Auth |
| `/dashboard` | Required | Lead-focused homepage |
| `/dashboard/bots` | Required | Bot list |
| `/dashboard/bots/new` | Required | Create bot |
| `/dashboard/bots/[id]` | Required | Bot detail (KB, leads, conversations) |
| `/embed/[slug]` | Public (token) | Widget iframe page |
| `/api/bots/*` | Required | Bot CRUD + KB management |
| `/api/widget/*` | Token-based | Widget config, chat SSE, lead capture |
| `/api/auth/*` | Mixed | Register, login, logout, session |
| `/api/billing/*` | Required | Stripe checkout + portal |
| `/api/webhooks/*` | Public | Stripe webhooks |

## Architecture docs

- **`docs/ARCHITECTURE.md`** — full schema, API spec, tenant isolation, build order, pricing
- **`.agents/skills/powabase/`** — Powabase reference docs (RAG, agents, streaming, billing, etc.)

## Key constraints

- **One user per agency in MVP** — no team roles, no invitations
- **Widget is an iframe** served from `/embed/[slug]` (server-rendered Next.js page inside the same app)
- **Widget auth** uses `embed_token` (32-byte hex string on `client_bots`), not JWTs
- **No separate widget build** — it's part of the main Next.js app
- **Build order (revenue-first):** auth + bot creation → widget + chat → lead capture → Stripe
