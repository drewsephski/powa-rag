/**
 * Powabase API response types.
 *
 * These match the live API shapes. Verify against docs.powabase.ai
 * (appending .md to a page path) when unsure — the surface is evolving.
 */

// ── Agents ──

export interface PowabaseAgent {
  id: string
  name: string
  model: string
  system_prompt: string
  settings: Record<string, unknown>
  created_at: string
}

// ── Knowledge Bases ──

export interface PowabaseKnowledgeBase {
  id: string
  name: string
  description?: string
  indexing_config?: Record<string, unknown>
  retrieval_config?: {
    method?: string
    top_k?: number
    vector_weight?: number
    context_mode?: string
    reranker?: {
      model?: string
      candidate_count?: number
    }
    query_enrichment?: {
      enabled?: boolean
      model?: string
    }
  }
  created_at: string
}

// ── Sources ──

export interface PowabaseSource {
  id: string
  name?: string
  file_type?: string
  storage_path?: string
  extraction_status: "pending" | "extracting" | "extracted" | "attention_required" | "failed" | "cancelled"
  task_id?: string
  derivatives?: Record<string, unknown>
  auto_metadata?: {
    page_count?: number
  }
  created_at: string
}

// ── SSE Events (from /api/agents/{id}/run/stream) ──

export type PowabaseSSEEvent =
  | { event: "start"; run_id: string; session_id: string }
  | { event: "step_started"; step: unknown }
  | { event: "step_completed"; step: unknown }
  | { event: "content_delta"; delta: string }
  | { event: "chunk"; content: string }
  | { event: "tool_call"; tool_name: string; arguments: unknown }
  | { event: "tool_result"; tool_name: string; result: unknown }
  | { event: "reasoning_delta"; delta: string }
  | { event: "reasoning"; text: string }
  | { event: "approval_requested"; tool_name: string; tool_input: unknown }
  | { event: "context_handler_created"; context_handler_id: string }
  | { event: "complete"; run_id: string; content?: string; usage?: Record<string, unknown> }
  | { event: "error"; message: string; code?: string }

// ── Pagination ──

export interface PowabaseListResponse {
  total: number
  limit: number
  offset: number
}

export interface PowabaseAgentListResponse extends PowabaseListResponse {
  agents: PowabaseAgent[]
}

export interface PowabaseKBListResponse extends PowabaseListResponse {
  knowledge_bases: PowabaseKnowledgeBase[]
}

// ── Run status ──

export interface PowabaseRunStatus {
  error?: string
  events?: PowabaseSSEEvent[]
  retrieved_context?: unknown[]
  input_messages?: unknown[]
  output_messages?: unknown[]
  usage?: Record<string, unknown>
  status?: string
  tool_calls?: unknown[]
  reasoning_steps?: unknown[]
}
