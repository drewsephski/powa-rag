# Squidex — White-Label AI Chatbot Platform

> **Product:** Agencies build and resell branded AI chatbots to their clients.
> **Backend:** Single Powabase project, proxied through our Next.js server.
> **Frontend:** One Next.js app (dashboard + widget pages).
> **MVP Goal:** Agency signs up → creates bot → uploads docs → embeds widget → captures qualified leads. 3 weeks.

---

## 1. Database Schema

### Core Tables

```sql
-- 1. AGENCIES — our customers
CREATE TABLE agencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  owner_name  TEXT,
  owner_email TEXT,

  settings            JSONB DEFAULT '{}',
  stripe_customer_id  TEXT,
  subscription_status TEXT DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled')),
  subscription_plan   TEXT DEFAULT 'starter',
  trial_ends_at       TIMESTAMPTZ,

  -- Rollup counters (enough for MVP billing)
  bot_count      INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. AGENCY USERS — one per agency in MVP (no roles, no teams)
CREATE TABLE agency_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  gotrue_id   UUID UNIQUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agency_id, email)
);

-- 3. CLIENT BOTS — each end-client's chatbot
CREATE TABLE client_bots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,             -- /widget/[slug]
  status      TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),

  -- RAG (maps to Powabase KB + agent)
  indexing_strategy TEXT DEFAULT 'chunk_embed',
  retrieval_method  TEXT DEFAULT 'hybrid',
  retrieval_config  JSONB DEFAULT '{"reranker":true,"query_enrichment":false,"context_mode":"text"}',

  -- Widget branding
  widget_config JSONB DEFAULT jsonb_build_object(
    'primary_color',    '#2563eb',
    'bot_name',         'Assistant',
    'welcome_message',  'Hi! How can I help you today?',
    'position',         'right',
    'show_powered_by',  true
  ),

  -- Lead capture
  lead_capture_enabled  BOOLEAN DEFAULT true,
  lead_capture_keywords TEXT[] DEFAULT ARRAY[
    'pricing','price','cost','quote','demo','consultation',
    'services','hire','contract','proposal','talk to sales'
  ],

  -- Auth
  embed_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Powabase references
  powabase_kb_id    UUID,
  powabase_agent_id UUID,

  -- Counters
  total_conversations INTEGER DEFAULT 0,
  total_leads         INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_bots_embed_token ON client_bots(embed_token);

-- 4. KNOWLEDGE SOURCES — docs or websites
CREATE TABLE bot_knowledge_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES client_bots(id) ON DELETE CASCADE,
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'website')),

  filename         TEXT,
  file_type        TEXT,
  file_size_bytes  BIGINT,
  website_url      TEXT,
  crawl_depth      INTEGER DEFAULT 2,
  powabase_source_id UUID,
  extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','extracting','extracted','attention_required','failed')),

  page_count  INTEGER,
  char_count  INTEGER,
  auto_sync   BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 5. LEADS — captured visitor info (the core business metric)
CREATE TABLE bot_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID NOT NULL REFERENCES client_bots(id) ON DELETE CASCADE,
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES bot_conversations(id),

  visitor_email   TEXT NOT NULL,
  visitor_name    TEXT,
  visitor_phone   TEXT,             -- collected during qualification
  company_name    TEXT,             -- collected during qualification
  lead_reason     TEXT,             -- what triggered capture: 'pricing_inquiry', 'service_inquiry', 'consultation_request', 'unanswered'
  notes           TEXT,             -- AI-generated summary of what they wanted
  status          TEXT DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'closed')),

  metadata JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. CONVERSATIONS — chat sessions (simple table, no fancy UI)
CREATE TABLE bot_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID NOT NULL REFERENCES client_bots(id) ON DELETE CASCADE,
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  powabase_session_id UUID,
  visitor_id          TEXT,
  visitor_page_url    TEXT,
  message_count       INTEGER DEFAULT 0,
  lead_captured       BOOLEAN DEFAULT false,
  lead_id             UUID REFERENCES bot_leads(id),

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 7. MESSAGES — individual chat messages
CREATE TABLE bot_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  sources         JSONB,
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bot_messages_conversation ON bot_messages(conversation_id, created_at);
```

### Row-Level Security

```sql
ALTER TABLE client_bots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_messages          ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON client_bots
  FOR ALL USING (agency_id = current_setting('app.current_agency_id')::UUID);
-- Same policy on: bot_knowledge_sources, bot_leads, bot_conversations, bot_messages
```

---

## 2. Tenant Isolation

Three layers, same strategy as before — but simpler because there's one user per agency.

**JWT custom claim:**
```json
{
  "sub": "gotrue-user-id",
  "email": "user@agency.com",
  "app_metadata": {
    "agency_id": "uuid",
    "role": "owner"
  }
}
```

**DB isolation helper:**
```typescript
// lib/db/tenant.ts
export async function withTenant<T>(
  agencyId: string,
  fn: () => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_agency_id', ${agencyId}, true)`
    );
    return fn();
  });
}
```

**Widget auth:** Same embed token approach. Simple lookup, no JWT for visitors.

---

## 3. API Specification

### Internal Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Create GoTrue user + agency + first user |
| POST | `/api/auth/login` | Authenticate via GoTrue |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/session` | Current user + agency |

| GET | `/api/agency` | Agency profile + usage |
| PATCH | `/api/agency` | Update agency name |

| GET | `/api/bots` | List bots |
| POST | `/api/bots` | Create bot (→ KB + agent in Powabase) |
| GET | `/api/bots/:id` | Bot detail (config, stats, embed code) |
| PATCH | `/api/bots/:id` | Update bot config |
| DELETE | `/api/bots/:id` | Archive bot |

| GET | `/api/bots/:id/sources` | List KB sources |
| POST | `/api/bots/:id/sources/upload` | Upload document → Powabase |
| POST | `/api/bots/:id/sources/website` | Add website URL |
| DELETE | `/api/bots/:id/sources/:sid` | Remove source |

| GET | `/api/bots/:id/leads` | List leads (new → contacted → closed) |
| GET | `/api/bots/:id/leads/:lid` | Lead detail |
| PATCH | `/api/bots/:id/leads/:lid` | Update lead status |

| GET | `/api/bots/:id/conversations` | List conversations |
| GET | `/api/bots/:id/conversations/:cid` | Conversation + messages |

| GET | `/api/billing/plan` | Current plan |
| POST | `/api/billing/checkout` | Stripe Checkout session |
| POST | `/api/billing/portal` | Stripe Customer Portal |
| POST | `/api/webhooks/stripe` | Stripe events |

### Widget Routes (public, bot-token authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/embed/[slug]` | **Server-rendered widget page** (Next.js page, not API) |
| GET | `/api/widget/[slug]/config` | Widget branding config (JSON, cached) |
| POST | `/api/widget/[slug]/chat` | Send message → SSE stream back |

---

## 4. Widget Architecture

### Approach: Next.js-only, no separate app

The widget is built **inside the same Next.js app** as the dashboard. No separate Vite project.

```
How it works:

1. Agency sees embed code in dashboard:
   <script src="https://app.squidex.ai/widget/[slug].js"></script>

2. This script injects an iframe pointing to:
   https://app.squidex.ai/embed/[slug]

3. /embed/[slug] is a Next.js page that renders the full widget UI
   → Server-rendered (fast initial load)
   → Same theme/branding as dashboard components
   → Reuses the same React component library
   → Communicates with parent page via postMessage (for resize, scroll lock)

4. The iframe calls our internal API:
   /api/widget/[slug]/config  → branding + settings
   /api/widget/[slug]/chat    → SSE streaming
```

### Why iframe-inside-script-tag for MVP

| Concern | Mitigation |
|---------|-----------|
| Separate app to maintain | **It's not separate.** Same Next.js app, same components, one build |
| Shadow DOM complexity | **Iframe is simpler** — full style isolation by default, works on every platform |
| SEO / indexing | Widget doesn't need SEO (it's an embed) |
| Mobile responsive | Widget page is responsive, iframe just resizes |
| Extract later | When revenue exists, the widget page can be extracted to a standalone app without changing the embed snippet |

### Widget Components (inside Next.js `app/embed/[slug]/page.tsx`)

```
app/embed/[slug]/
  page.tsx               ← Server component, fetches config, shells out
  chat-panel.tsx         ← Client component: messages, input, streaming
  message-list.tsx
  message-bubble.tsx
  lead-capture-form.tsx
  header.tsx

Uses the same shadcn/ui components as the dashboard.
```

### Lead Capture Flow (the core product feature)

Instead of only capturing on "bot can't answer," the bot **proactively qualifies**:

```
Visitor asks: "How much does your service cost?"
                ↓
Bot detects buying intent (pricing keyword match)
                ↓
Bot responds naturally AND flags intent to backend
                ↓
After 1-2 exchanges, bot says:
  "Would you like me to have someone reach out with a custom quote?"
                ↓
Lead capture form slides in:
  Name ______  Email ______  Phone ______
                ↓
Lead stored in dashboard
Bot continues answering questions
```

The Powabase agent system prompt includes:

> You are a helpful sales-qualified assistant. When a visitor asks about pricing,
> services, demos, consultations, or shows buying intent, answer their question
> helpfully then naturally offer to connect them with the team. When they agree,
> capture their information. Your primary goal is to generate qualified leads
> for the business, not just answer questions.

This is the default prompt, agencies can customize it.

---

## 5. Dashboard

### Pages (MVP)

```
/                       → Lead-focused overview
/bots                   → Bot list + create
/bots/[id]              → Bot detail, sources, leads
/bots/[id]/settings     → Branding, widget config, embed code
/billing                → Plan + subscription
```

### Homepage Layout

```
┌──────────────────────────────────────────────────┐
│  🔴 New Leads (12)    🟡 Contacted (5)    ✅ →   │
│  Last 7 days: +8 leads from 3 bots               │
├──────────────────────────────────────────────────┤
│                                                  │
│  Uncaptured → capture them                       │
│  ┌──────────────────────────────────────────┐    │
│  │ Jane D.  Acme Corp   "pricing inquiry"   │    │
│  │ Mike K.  Widgets Inc  "demo request"     │    │
│  │ Sarah L. Example Co   "consultation"     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Leads This Month: 42                            │
│  Best Bot: "acme-support" (18 leads)             │
│  Conversion Rate: 34%                            │
│                                                  │
│  ───────────────────────                         │
│  Recent Conversations                             │
│  Today 3:24p  acme-support  12 msgs  ✅ lead     │
│  Today 2:15p  widgetco-help  8 msgs              │
│  Today 1:00p  acme-support  23 msgs  ✅ lead     │
└──────────────────────────────────────────────────┘
```

Leads are the primary metric. Conversations are a simple table. No charts,
no analytics dashboards, no team management.

---

## 6. Folder Structure

```
/app
  (auth)/
    login/
    register/
  (dashboard)/
    layout.tsx
    page.tsx                      ← Lead-focused overview
    bots/
      page.tsx                    ← Bot list
      new/page.tsx
      [id]/
        page.tsx                  ← Bot detail (leads, sources, stats)
        settings/page.tsx         ← Branding, config, embed code
    billing/page.tsx
  embed/
    [slug]/page.tsx               ← Widget iframe target (server-rendered)
  api/
    auth/...                      ← Auth routes
    agency/...                    ← Agency profile
    bots/...
      [id]/
        sources/...               ← KB management
        leads/...                 ← Lead CRUD
        conversations/...         ← Conversation list
    billing/...
    webhooks/stripe/route.ts
    widget/
      [slug]/
        config/route.ts           ← Widget branding config
        chat/route.ts             ← SSE streaming endpoint

/components
  /ui                            ← shadcn
  /auth
  /layout                        ← Sidebar, top nav
  /bots                          ← Bot list, create dialog
  /leads                         ← Lead table, lead detail (!!! focus here)
  /widget                        ← Chat panel, messages, lead form (shared with /embed)
  /billing
  /shared                        ← Data table, empty state, confirm dialog

/lib
  /powabase                      ← Typed API client
    client.ts                    ← Shared connection
    agents.ts                    ← Agent CRUD
    knowledge-bases.ts
    sources.ts
    upload.ts
  /db
    client.ts                    ← Postgres connection
    tenant.ts                    ← withTenant() isolation
  /auth
    gotrue.ts
    session.ts
    middleware.ts
  /billing
    stripe.ts
  /widget                        ← Widget config helpers, embed code generator
  utils.ts
  validators.ts

/types
  database.ts
  api.ts
```

---

## 7. Build Plan — 3 Weeks to Revenue

### Week 1: Foundation + Bot Creation

```
Day 1-2: Backbone
  ☐ Run database migration
  ☐ Powabase API client (lib/powabase/)
  ☐ DB client + withTenant() wrapper
  ☐ GoTrue auth integration
  ☐ Agency registration → creates agency + first user
  ☐ Login/logout/session management

Day 3-4: Bot CRUD + Powabase Integration
  ☐ Dashboard layout (sidebar, top nav)
  ☐ Create bot → Powabase KB + agent created
  ☐ Bot list page
  ☐ Bot detail page (config, embed code)
  ☐ Bot settings page (branding)

Day 5: Knowledge Base
  ☐ Document upload UI → Powabase source
  ☐ Website scraper setup
  ☐ Source list with extraction status
  ☐ Source → KB linking → indexing
```

### Week 2: Widget Chat

```
Day 6-7: Widget Infrastructure
  ☐ /embed/[slug] page (widget iframe target)
  ☐ Widget chat UI (header, messages, input)
  ☐ /api/widget/[slug]/config endpoint
  ☐ Embed code generator (dashboard shows <script> snippet)

Day 8-9: Streaming + Conversation
  ☐ SSE streaming via /api/widget/[slug]/chat
  ☐ Backend proxies to Powabase agent run/stream
  ☐ Conversation persistence (widget saves, server stores)
  ☐ Message list + conversation viewer

Day 10: Polish + Edge Cases
  ☐ Branding applied to widget (colors, name, welcome message)
  ☐ Loading, empty, error states
  ☐ Widget responsive on mobile
  ☐ End-to-end test: create bot → upload doc → embed → chat
```

### Week 3: Lead Capture + Stripe + Launch

```
Day 11-13: Lead Capture (the core business feature)
  ☐ AI system prompt includes lead qualification instructions
  ☐ Buying intent detection in chat flow
  ☐ Lead capture form in widget
  ☐ Lead list + detail in dashboard
  ☐ Lead status management (new → contacted → closed)
  ☐ Lead reason tracking (pricing, demo, consultation, unanswered)

Day 14: Dashboard Polish
  ☐ Homepage focused on leads (new leads, conversion, best bot)
  ☐ Conversation list (simple table, no fancy viewer)
  ☐ Bot leads page

Day 15-16: Billing
  ☐ Stripe integration (Checkout + Customer Portal + webhooks)
  ☐ Pricing page
  ☐ Plan enforcement (limit bots, responses)
  ☐ Billing page in dashboard

Day 17-18: Launch Prep
  ☐ Usage limit enforcement
  ☐ Rate limiting (bot token)
  ☐ Error monitoring
  ☐ Landing page
  ☐ Marketing site

Day 19-21: Buffer + Launch
  ☐ Bug fixes from testing
  ☐ First agency onboarding
  ☐ 🚀 LAUNCH
```

---

## 8. Pricing

```yaml
starter:
  price: $199/mo
  bots: 3
  responses: 10,000/mo
  leads: unlimited
  lead_qualification: true

growth:
  price: $499/mo
  bots: 15
  responses: 50,000/mo
  leads: unlimited
  lead_qualification: true

agency:
  price: $999/mo
  bots: 50
  responses: 200,000/mo
  leads: unlimited
  lead_qualification: true
```

Agencies resell at their own price to their clients. We charge flat.

---

## 9. Lead Capture — Implementation Detail

### Detection

The widget proxy (backend) receives every message. It checks:

1. **Keyword match** — message contains words from `lead_capture_keywords` array
2. **AI signal** — the agent's response includes a `capture_intent: true` flag
   (injected via system prompt instructing the agent to signal qualification)

When triggered, the backend returns a special SSE event before the streaming
response begins:

```
event: lead_intent
data: {"trigger": "pricing_inquiry", "confidence": 0.92}
```

The widget displays the lead capture form after 1-2 natural exchanges.

### Data Collected

```typescript
interface LeadCapture {
  visitor_email:  string;    // required
  visitor_name:   string;    // optional
  visitor_phone:  string;    // optional
  company_name:   string;    // optional
  lead_reason:    'pricing_inquiry' | 'service_inquiry' | 'consultation_request' | 'unanswered';
  notes:          string;    // AI-generated: "Wanted pricing for enterprise plan, currently evaluating vendors"
  conversation_id: string;
  page_url:       string;    // page they were on
}
```

### Dashboard Display

```
┌─────────────────────────────────────────────────────────────┐
│  NEW LEADS (12)                          [Export] [Filter]  │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Contact  │ Company  │ Reason   │ Status   │ Date            │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Jane D.  │ Acme Inc │ Pricing  │ ● new    │ 2 min ago       │
│  jane@ac│           │          │          │                 │
│ Mike K.  │ —        │ Unanswe… │ ● new    │ 15 min ago      │
│  mike@ex│           │          │          │                 │
│ Sarah L. │ WidgetCo │ Demo     │ ◉ cont…  │ 1 hour ago      │
│  sarah@w│           │          │          │                 │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

Click a lead to view detail (conversation snapshot, full transcript, notes, metadata).

---

## 10. What We're NOT Building (MVP)

| Feature | Reason Dropped | Future? |
|---------|---------------|---------|
| Team roles + invitations | One user per agency | ✅ Phase 2 |
| Audit logs | Nobody buys for audit logs | ❌ Maybe never |
| Usage logs table | Counters on agencies table is fine | ✅ When metering at scale |
| Analytics charts | 3 numbers (leads, conversations, messages) | ✅ Phase 2 |
| Conversation viewer | Simple table with date + bot + lead capture | ✅ Phase 2 |
| Separate widget build | One Next.js app until revenue exists | ✅ After revenue |
| Lead export | Build when an agency asks for it | ✅ On request |
| Human handoff | Significant complexity, not needed for v1 | ✅ Phase 2 |
| Custom domains | Nice-to-have, not necessary | ✅ Phase 2 |
| Multi-language | Increases scope 3x | ✅ Phase 2 |

---

## 11. Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Widget rendering** | Iframe inside script tag | One Next.js app, full style isolation, works everywhere, zero build complexity |
| **Lead capture trigger** | Proactive (keyword detection + AI signal) | Generates more revenue than passive "bot can't answer" |
| **Dashboard homepage** | Leads-first | Reinforces the value proposition to agencies every login |
| **One user per agency** | No roles, no teams | Ships in days instead of weeks |
| **Build order** | 3 weeks, revenue-first | Week 1 = bots work, Week 2 = chat works, Week 3 = leads + billing |
| **Powabase integration** | Proxy all calls through backend | Security, control, rate limiting, logging in one place |
