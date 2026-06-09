import { query } from "@/lib/db/client"
import { runAgentStream } from "@/lib/powabase/client"

/**
 * SSE streaming chat endpoint for the widget.
 *
 * This is the proxy between the end-user's browser and Powabase's agent.
 * It:
 *   1. Validates the bot token (embed_token)
 *   2. Checks lead capture keywords
 *   3. Calls Powabase's /api/agents/{id}/run/stream
 *   4. Buffers and forwards all SSE events to the browser
 *   5. Captures session_id from the `start` event for multi-turn
 *   6. Injects synthetic `lead_intent` events when keywords match
 *   7. Persists conversation to our DB
 *
 * ⚠️ Security: The widget runs on the client's website. The embed_token is the
 * only auth — it's stored server-side and sent from our widget script. The
 * Powabase Service Role key NEVER leaves this backend.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  const conversationId = url.searchParams.get("conversation_id")

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — missing embed token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }

  // Validate bot + token
  const bots = await query<{
    id: string
    powabase_agent_id: string | null
    lead_capture_enabled: boolean
    lead_capture_keywords: string[]
    name: string
  }>(
    `SELECT id, powabase_agent_id, lead_capture_enabled, lead_capture_keywords, name
     FROM client_bots
     WHERE slug = $1 AND embed_token = $2 AND status = 'active'`,
    [slug, token]
  )

  if (bots.length === 0) {
    return new Response(
      JSON.stringify({ error: "Bot not found or inactive" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    )
  }

  const bot = bots[0]

  if (!bot.powabase_agent_id) {
    return new Response(
      JSON.stringify({ error: "Bot not configured — missing agent" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const body = await request.json()
  const { message: userMessage } = body

  if (!userMessage || typeof userMessage !== "string") {
    return new Response(
      JSON.stringify({ error: "Message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  // Check for lead capture keywords
  const shouldCaptureLead =
    bot.lead_capture_enabled &&
    bot.lead_capture_keywords.some((kw) =>
      userMessage.toLowerCase().includes(kw.toLowerCase())
    )

  let matchedKeyword: string | undefined
  if (shouldCaptureLead) {
    matchedKeyword = bot.lead_capture_keywords.find((kw) =>
      userMessage.toLowerCase().includes(kw.toLowerCase())
    )
  }

  // Determine lead reason from matched keyword
  let leadReason = "unanswered"
  if (matchedKeyword) {
    if (["pricing", "price", "cost", "quote", "proposal"].some((k) => matchedKeyword?.includes(k))) {
      leadReason = "pricing_inquiry"
    } else if (["demo", "consultation"].some((k) => matchedKeyword?.includes(k))) {
      leadReason = "consultation_request"
    } else {
      leadReason = "service_inquiry"
    }
  }

  // Use a mutable copy of conversationId so we can update it for new conversations
  let effectiveConversationId = conversationId

  // Look up existing session_id for this conversation
  let sessionId: string | null = null
  if (effectiveConversationId) {
    const convs = await query<{ powabase_session_id: string | null }>(
      `SELECT powabase_session_id FROM bot_conversations WHERE id = $1`,
      [effectiveConversationId]
    )
    if (convs.length > 0) {
      sessionId = convs[0].powabase_session_id
    }
  }

  try {
    // Call Powabase's /run/stream — the ONLY endpoint with tools + ReAct loop
    // ⚠️ /api/agents/{id}/run has NO tools — always use /run/stream
    const powaStream = await runAgentStream(
      bot.powabase_agent_id,
      userMessage,
      sessionId ?? undefined
    )

    const encoder = new TextEncoder()
    const transformStream = new TransformStream()
    const writer = transformStream.writable.getWriter()

    // Process the SSE stream asynchronously
    ;(async () => {
      try {
        const reader = powaStream.body?.getReader()
        if (!reader) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ event: "error", message: "Stream unavailable" })}\n\n`
            )
          )
          await writer.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""
        let leadIntentSent = false
        let capturedSessionId: string | null = null
        let fullContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? "" // keep partial line for next read

          for (const line of lines) {
            // ── Skip keepalive (SSE comments start with ":") ──
            if (line.startsWith(":")) continue

            // ── Only process data: lines ──
            if (!line.startsWith("data: ")) continue

            const rawData = line.slice(6)

            let event: Record<string, unknown>
            try {
              event = JSON.parse(rawData)
            } catch {
              // Not JSON — forward raw
              await writer.write(encoder.encode(`${line}\n`))
              continue
            }

            const kind = event?.event as string | undefined

              // ── Capture session_id from start event ──
              if (kind === "start") {
                capturedSessionId = (event.session_id as string) || null
                // Save to conversation record
                if (effectiveConversationId && capturedSessionId) {
                  query(
                    `UPDATE bot_conversations SET powabase_session_id = $1 WHERE id = $2`,
                    [capturedSessionId, effectiveConversationId]
                  ).catch(() => {})
                }
              }

            // ── Track content for completion ──
            if (kind === "chunk" && typeof event.content === "string") {
              fullContent = event.content
            }

            // ── Inject lead_intent before first content ──
            if (!leadIntentSent && leadReason !== "unanswered") {
              // Send lead_intent after the start event, before content_delta
              if (kind === "content_delta" || kind === "chunk") {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      event: "lead_intent",
                      reason: leadReason,
                    })}\n\n`
                  )
                )
                leadIntentSent = true
              }
            }

            // ── Forward the event to the browser ──
            await writer.write(encoder.encode(`${line}\n`))
          }
        }

        // Send [DONE] marker
        await writer.write(encoder.encode("data: [DONE]\n\n"))

        // Persist to DB — create/update conversation + messages
        try {
          const visitorId = url.searchParams.get("visitor_id") || "anonymous"
          const pageUrl = url.searchParams.get("page_url") || ""

          if (effectiveConversationId) {
            // Update existing conversation (2 messages: user + assistant)
            await query(
              `UPDATE bot_conversations
               SET message_count = message_count + 2, updated_at = now()
               WHERE id = $1`,
              [effectiveConversationId]
            )
          } else {
            // Create new conversation
            const convs = await query(
              `INSERT INTO bot_conversations
               (bot_id, agency_id, powabase_session_id, visitor_id, visitor_page_url, message_count)
               VALUES ($1, (SELECT agency_id FROM client_bots WHERE id = $1), $2, $3, $4, 2)
               RETURNING id`,
              [bot.id, capturedSessionId, visitorId, pageUrl]
            )
            if (convs.length > 0) {
              effectiveConversationId = convs[0].id
              // Send conversation_id to widget for future turns
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    event: "conversation_created",
                    conversation_id: effectiveConversationId,
                  })}\n\n`
                )
              )
            }
          }

          // Save the user message (uses the now-correct effectiveConversationId)
          if (effectiveConversationId) {
            await query(
              `INSERT INTO bot_messages (conversation_id, role, content)
               VALUES ($1, 'user', $2)`,
              [effectiveConversationId, userMessage]
            )

            // Save the assistant message if we have content
            if (fullContent) {
              await query(
                `INSERT INTO bot_messages (conversation_id, role, content)
                 VALUES ($1, 'assistant', $2)`,
                [effectiveConversationId, fullContent]
              )
            }
          }
        } catch (dbErr) {
          console.error("Failed to persist conversation:", dbErr)
          // Non-fatal — don't break the stream
        }

        await writer.close()
      } catch (err) {
        console.error("Stream processing error:", err)
        try {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                event: "error",
                message: "Stream processing failed",
              })}\n\n`
            )
          )
          await writer.close()
        } catch {
          // writer may already be closed
        }
      }
    })()

    // Return SSE stream to the browser
    return new Response(transformStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable nginx buffering
      },
    })
  } catch (err) {
    console.error("Chat error:", err)
    return new Response(
      JSON.stringify({
        error: "Chat failed. Check credits and agent configuration.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
