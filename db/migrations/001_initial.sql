-- Squidex: Initial Schema
-- Creates all tables for the white-label chatbot platform

-- 1. AGENCIES
CREATE TABLE IF NOT EXISTS agencies (
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

  bot_count      INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. AGENCY USERS
CREATE TABLE IF NOT EXISTS agency_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  gotrue_id   UUID UNIQUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agency_id, email)
);

-- 3. CLIENT BOTS
CREATE TABLE IF NOT EXISTS client_bots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),

  indexing_strategy TEXT DEFAULT 'chunk_embed',
  retrieval_method  TEXT DEFAULT 'hybrid',
  retrieval_config  JSONB DEFAULT '{"reranker":true,"query_enrichment":false,"context_mode":"text"}',

  widget_config JSONB DEFAULT jsonb_build_object(
    'primary_color',    '#2563eb',
    'bot_name',         'Assistant',
    'welcome_message',  'Hi! How can I help you today?',
    'position',         'right',
    'show_powered_by',  true
  ),

  lead_capture_enabled  BOOLEAN DEFAULT true,
  lead_capture_keywords TEXT[] DEFAULT ARRAY[
    'pricing','price','cost','quote','demo','consultation',
    'services','hire','contract','proposal','talk to sales'
  ],

  embed_token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  powabase_kb_id      UUID,
  powabase_agent_id   UUID,

  total_conversations INTEGER DEFAULT 0,
  total_leads         INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_bots_embed_token ON client_bots(embed_token);

-- 4. KNOWLEDGE SOURCES
CREATE TABLE IF NOT EXISTS bot_knowledge_sources (
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

-- 5. CONVERSATIONS
CREATE TABLE IF NOT EXISTS bot_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID NOT NULL REFERENCES client_bots(id) ON DELETE CASCADE,
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  powabase_session_id UUID,
  visitor_id          TEXT,
  visitor_page_url    TEXT,
  message_count       INTEGER DEFAULT 0,
  lead_captured       BOOLEAN DEFAULT false,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. LEADS
CREATE TABLE IF NOT EXISTS bot_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID NOT NULL REFERENCES client_bots(id) ON DELETE CASCADE,
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES bot_conversations(id),

  visitor_email   TEXT NOT NULL,
  visitor_name    TEXT,
  visitor_phone   TEXT,
  company_name    TEXT,
  lead_reason     TEXT DEFAULT 'unanswered'
    CHECK (lead_reason IN ('pricing_inquiry','service_inquiry','consultation_request','unanswered')),
  notes           TEXT,
  status          TEXT DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'closed')),

  metadata JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Add lead_id FK after bot_leads exists
ALTER TABLE bot_conversations ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES bot_leads(id);

-- 7. MESSAGES
CREATE TABLE IF NOT EXISTS bot_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  sources         JSONB,
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_messages_conversation ON bot_messages(conversation_id, created_at);

-- Enable RLS
ALTER TABLE client_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_messages ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy function
CREATE OR REPLACE FUNCTION get_current_agency_id()
RETURNS UUID AS $$
  SELECT current_setting('app.current_agency_id', true)::UUID;
$$ LANGUAGE SQL STABLE;

-- RLS policies
CREATE POLICY tenant_isolation ON client_bots
  FOR ALL USING (agency_id = get_current_agency_id());

CREATE POLICY tenant_isolation ON bot_knowledge_sources
  FOR ALL USING (agency_id = get_current_agency_id());

CREATE POLICY tenant_isolation ON bot_leads
  FOR ALL USING (agency_id = get_current_agency_id());

CREATE POLICY tenant_isolation ON bot_conversations
  FOR ALL USING (agency_id = get_current_agency_id());

CREATE POLICY tenant_isolation ON bot_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM bot_conversations WHERE agency_id = get_current_agency_id()
    )
  );

-- Agency users: members can see other users in their agency
CREATE POLICY tenant_isolation ON agency_users
  FOR ALL USING (agency_id = get_current_agency_id());
