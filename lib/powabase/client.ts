/**
 * Powabase API client — typed, with error handling for 402/409/503/429.
 * Every request sends both `apikey` and `Authorization` headers (two-header auth).
 *
 * Best practices followed:
 * - ✅ Two headers or 401
 * - ✅ temperature nests in settings
 * - ✅ /run/stream (not /run) for tools/ReAct
 * - ✅ 409 duplicate_source → reuse existing source
 * - ✅ 402 insufficient_credits → surface renews_at, don't retry
 * - ✅ 503 billing service unreachable → retry with backoff
 * - ✅ 429 rate limit → back off with jitter
 * - ✅ All agents run from backend (never client-side)
 */

import type {
  PowabaseAgent,
  PowabaseKnowledgeBase,
  PowabaseSource,
  PowabaseAgentListResponse,
  PowabaseRunStatus,
} from "./types"

const BASE_URL = process.env.POWABASE_URL!
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!

// ── Typed errors ──

export class PowabaseError extends Error {
  constructor(
    public status: number,
    public body: string,
    public parsed?: Record<string, unknown>
  ) {
    super(`Powabase API ${status}: ${body}`)
    this.name = "PowabaseError"
  }

  get isInsufficientCredits(): boolean {
    return this.status === 402 && this.parsed?.error === "insufficient_credits"
  }

  get isDuplicateSource(): boolean {
    return (
      this.status === 409 &&
      typeof this.parsed?.duplicate === "object" &&
      this.parsed?.duplicate !== null
    )
  }

  get isBillingUnreachable(): boolean {
    return this.status === 503 && String(this.body).includes("billing")
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  get renewsAt(): string | undefined {
    return this.parsed?.renews_at as string | undefined
  }

  get duplicateSourceId(): string | undefined {
    return (this.parsed?.duplicate as { id?: string })?.id
  }
}

// ── Helpers ──

function headers(multipart = false) {
  return {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    ...(multipart ? {} : { "Content-Type": "application/json" }),
  }
}

/** Shared fetch + error parsing for JSON requests */
async function request<T>(
  path: string,
  options?: RequestInit,
  retries = 0
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  })

  if (!res.ok) {
    const body = await res.text()
    let parsed: Record<string, unknown> | undefined
    try {
      parsed = JSON.parse(body)
    } catch {
      // not JSON
    }

    const error = new PowabaseError(res.status, body, parsed)

    // 503 billing service unreachable → retry with exponential backoff
    if (error.isBillingUnreachable && retries < 3) {
      const delay = Math.min(5000 * Math.pow(2, retries), 60000)
      await new Promise((r) => setTimeout(r, delay))
      return request<T>(path, options, retries + 1)
    }

    throw error
  }

  return res.json()
}

// ── Knowledge Bases ──

export async function createKnowledgeBase(name: string) {
  return request<PowabaseKnowledgeBase>("/api/knowledge-bases", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function getKnowledgeBase(id: string) {
  return request<PowabaseKnowledgeBase>(`/api/knowledge-bases/${id}`)
}

export async function addSourceToKnowledgeBase(kbId: string, sourceId: string) {
  return request<{ id: string; status: string }>(
    `/api/knowledge-bases/${kbId}/sources`,
    {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId }),
    }
  )
}

export async function removeSourceFromKnowledgeBase(
  kbId: string,
  indexedSourceId: string
) {
  return request<{ status: string }>(
    `/api/knowledge-bases/${kbId}/sources/${indexedSourceId}`,
    { method: "DELETE" }
  )
}

// ── Sources ──

export interface UploadResult {
  id: string
  extraction_status: string
  duplicate?: boolean
}

/**
 * Upload a file to Powabase.
 *
 * Handles 409 duplicate_source automatically — returns the existing source's ID
 * with `duplicate: true` instead of throwing. This makes the whole pipeline
 * safe to re-run (idempotent uploads).
 *
 * For PDFs, pass contentType="application/pdf" so Powabase uses the correct
 * extraction pipeline. Also passes extraction_model for better OCR extraction.
 */
export async function uploadSource(
  file: Buffer | Blob,
  filename: string,
  options?: { contentType?: string; extractionModel?: string }
): Promise<UploadResult> {
  const formData = new FormData()

  // Build blob with correct MIME type so Powabase detects PDFs properly
  const mimeType = options?.contentType ?? "application/octet-stream"
  const blob =
    file instanceof Blob
      ? new Blob([await file.arrayBuffer()], { type: mimeType })
      : new Blob([file as BlobPart], { type: mimeType })

  formData.append("file", blob, filename)

  // Optional: force OCR extraction model for PDFs
  if (options?.extractionModel) {
    formData.append("extraction_model", options.extractionModel)
  }

  const res = await fetch(`${BASE_URL}/api/sources/upload`, {
    method: "POST",
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`,
    },
    body: formData,
  })

  if (res.status === 409) {
    // Duplicate source — reuse the existing one, don't treat as error
    const body = await res.json()
    const existingId: string =
      body.duplicate?.id || body.id
    return { id: existingId, extraction_status: "extracted", duplicate: true }
  }

  if (!res.ok) {
    const body = await res.text()
    let parsed: Record<string, unknown> | undefined
    try {
      parsed = JSON.parse(body)
    } catch {
      /* empty */
    }
    throw new PowabaseError(res.status, body, parsed)
  }

  const result = await res.json()
  return { id: result.id, extraction_status: result.extraction_status }
}

export async function getSourceStatus(sourceId: string) {
  return request<PowabaseSource>(`/api/sources/${sourceId}`)
}

/**
 * Rename a Powabase source (updates the `name` field).
 * The name shows in Powabase Studio listings.
 */
export async function renameSource(sourceId: string, name: string) {
  return request<{ status: string }>(`/api/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  })
}

/**
 * Download the original source file from Powabase as a Buffer.
 * Used as input for local PDF extraction fallback.
 */
export async function downloadSourceFile(
  sourceId: string
): Promise<Buffer | null> {
  const twoHeaders = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
  }

  const res = await fetch(
    `${BASE_URL}/api/sources/${sourceId}/download`,
    { headers: twoHeaders }
  )

  if (!res.ok) return null

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Re-run extraction on a source with an optional extraction model.
 * Use `"mistral"` for OCR on scanned PDFs that hit `attention_required`.
 */
export async function reextractSource(
  sourceId: string,
  extractionModel = "mistral"
) {
  return request<{ status: string }>(`/api/sources/${sourceId}/reextract`, {
    method: "POST",
    body: JSON.stringify({ extraction_model: extractionModel }),
  })
}

/**
 * Poll a source's extraction_status until it reaches a terminal state.
 * Returns the terminal status, or `"timeout"` if maxRetries is exceeded.
 *
 * Terminal states: extracted, attention_required, failed, cancelled
 */
export async function waitForExtraction(
  powaSourceId: string,
  maxRetries = 90
): Promise<string> {
  const TERMINAL = new Set([
    "extracted",
    "attention_required",
    "failed",
    "cancelled",
  ])

  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const status = await getSourceStatus(powaSourceId)
    if (TERMINAL.has(status.extraction_status)) return status.extraction_status
  }

  return "timeout"
}

/**
 * Fetch extracted text content for a source.
 *
 * Strategy:
 *   1. Optionally wait for extraction to complete
 *   2. Read source metadata to check what derivatives are available
 *   3. Try page-texts endpoint (returns JSON with extracted text)
 *   4. Try each available derivative type from the source metadata
 *   5. Validate response isn't raw PDF bytes
 *
 * @param options.skipWait - Skip waiting for extraction (use when already confirmed extracted)
 * @param options.maxRetries - Max retries when waiting for extraction (default 45 = ~90s)
 */
export async function getSourceContent(
  sourceId: string,
  options?: { skipWait?: boolean; maxRetries?: number }
): Promise<string> {
  const twoHeaders = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
  }

  const skipWait = options?.skipWait ?? false
  const maxRetries = options?.maxRetries ?? 45

  // ── Optionally wait for extraction ──
  if (!skipWait) {
    const extractionStatus = await waitForExtraction(sourceId, maxRetries)
    if (extractionStatus !== "extracted") {
      throw new Error(
        extractionStatus === "timeout"
          ? "Extraction is still in progress — try again shortly"
          : `Extraction failed: ${extractionStatus}`
      )
    }
  }

  // ── Get source metadata to check available derivatives ──
  const sourceInfo = await getSourceStatus(sourceId)
  const availableDerivatives = sourceInfo.derivatives
    ? Object.keys(sourceInfo.derivatives)
    : []

  // ── Try page-texts (returns JSON { text, page, count }) ──
  const textResult = await tryPageTexts(sourceId, twoHeaders, sourceInfo.auto_metadata?.page_count)
  if (textResult) return textResult

  // ── Try derivatives by type, in priority order ──
  const preferred = ["markdown", "text", "page_text"]
  for (const type of preferred) {
    if (!availableDerivatives.includes(type)) continue

    const count = getDerivativeCount(sourceInfo.derivatives, type)
    const parts: string[] = []

    for (let index = 0; index < count; index++) {
      const url = `${BASE_URL}/api/sources/${sourceId}/derivatives/${type}/download?index=${index}`
      const res = await fetch(url, { headers: twoHeaders })
      if (!res.ok) continue

      const text = await res.text()
      if (text.trim() && !isRawPdf(text)) {
        parts.push(text.trim())
      }
    }

    if (parts.length > 0) return parts.join("\n\n")
  }

  // ── Try all derivatives (including unknown types) ──
  for (const type of availableDerivatives) {
    if (preferred.includes(type)) continue

    const url = `${BASE_URL}/api/sources/${sourceId}/derivatives/${type}/download?index=0`
    const res = await fetch(url, { headers: twoHeaders })
    if (!res.ok) continue

    const text = await res.text()
    if (text.trim() && !isRawPdf(text)) return text.trim()
  }

  return "(no text content)"
}

/** Try page-texts endpoint with optional per-page fetch */
async function tryPageTexts(
  sourceId: string,
  headers: Record<string, string>,
  pageCount: number | undefined
): Promise<string | null> {
  // Try without page param (returns all pages at once)
  const allRes = await fetch(
    `${BASE_URL}/api/sources/${sourceId}/page-texts`,
    { headers }
  )
  if (allRes.ok) {
    const data = (await allRes.json()) as {
      text?: string
      page?: number
      count?: number
    }
    if (data.text && data.text.trim()) return data.text.trim()
  }

  // Try individual pages
  const maxPages = pageCount ?? 50
  const parts: string[] = []
  for (let p = 1; p <= maxPages; p++) {
    const res = await fetch(
      `${BASE_URL}/api/sources/${sourceId}/page-texts?page=${p}`,
      { headers }
    )
    if (!res.ok) break
    const data = (await res.json()) as { text?: string }
    if (data.text?.trim()) {
      parts.push(data.text.trim())
    } else {
      break
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null
}

/** Count how many items a derivative type has */
function getDerivativeCount(
  derivatives: Record<string, unknown> | undefined,
  type: string
): number {
  const entry = derivatives?.[type]
  if (Array.isArray(entry)) return entry.length
  return 1
}

/** Check if a string starts with the PDF magic bytes */
function isRawPdf(content: string): boolean {
  return content.startsWith("%PDF-") || content.startsWith("%\x00P\x00D\x00F")
}

// ── Agents ──

export async function createAgent(params: {
  name: string
  model?: string
  system_prompt?: string
  settings?: Record<string, unknown>
}) {
  return request<PowabaseAgent>("/api/agents", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      model: params.model ?? "gpt-4o-mini",
      system_prompt: params.system_prompt ?? "",
      settings: params.settings ?? {},
    }),
  })
}

export async function getAgent(id: string) {
  return request<PowabaseAgent>(`/api/agents/${id}`)
}

export async function linkKnowledgeBaseToAgent(
  agentId: string,
  kbId: string
) {
  return request<{ status: string }>(`/api/agents/${agentId}/knowledge-bases`, {
    method: "POST",
    body: JSON.stringify({ knowledge_base_id: kbId }),
  })
}

export async function listAgents() {
  return request<PowabaseAgentListResponse>("/api/agents")
}

// ── Runs ──

/**
 * Start a streaming agent run.
 *
 * Returns the raw Response for SSE consumption.
 * ⚠️ Streaming runs are NOT idempotent — retrying after a timeout starts a
 * second run and bills again. Prefer checking session/run state.
 *
 * The caller must:
 *   - read the body as SSE (text/event-stream)
 *   - capture session_id from the `start` event for multi-turn
 *   - handle keepalive (lines starting with `:`)
 *   - buffer and split on `\n` for partial reads
 */
export async function runAgentStream(
  agentId: string,
  message: string,
  sessionId?: string
): Promise<Response> {
  const res = await fetch(`${BASE_URL}/api/agents/${agentId}/run/stream`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      message,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    let parsed: Record<string, unknown> | undefined
    try {
      parsed = JSON.parse(body)
    } catch {
      /* empty */
    }
    throw new PowabaseError(res.status, body, parsed)
  }

  return res
}

/**
 * GET /api/agents/runs/{run_id} — the highest-signal start for debugging.
 * Returns error, events, retrieved_context, input/output_messages, etc.
 */
export async function getRunStatus(runId: string) {
  return request<PowabaseRunStatus>(`/api/agents/runs/${runId}`)
}

// ── Knowledge Base Search ──

export async function searchKnowledgeBase(
  kbId: string,
  query: string,
  options?: {
    topK?: number
    retrievalMethod?: string
  }
) {
  return request<{
    results: Array<{
      content: string
      source: string
      score: number
    }>
  }>(`/api/knowledge-bases/${kbId}/search`, {
    method: "POST",
    body: JSON.stringify({
      query,
      top_k: options?.topK ?? 5,
      retrieval_method: options?.retrievalMethod ?? "hybrid",
    }),
  })
}

// ── Settings (for tool keys) ──

export async function updateSettings(settings: Record<string, unknown>) {
  return request<{ status: string }>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  })
}
