import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import { runAgentStream } from "@/lib/powabase/client"

/**
 * Dashboard chat endpoint — SSE streaming chat for authenticated users.
 *
 * Now with full persistence: creates/updates bot_conversations and saves
 * bot_messages after each stream completes.
 *
 * Accepts optional conversation_id (for multi-turn) and session_id from client.
 * Emits synthetic `conversation_created` event for new conversations so the
 * client can update its conversation list.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { id: botId } = await params
  const body = await request.json()
  const {
    message: userMessage,
    conversation_id,
    session_id,
  } = body

  if (!userMessage || typeof userMessage !== "string") {
    return new Response(
      JSON.stringify({ error: "Message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  // Verify bot ownership + get agent ID
  const bots = await query<{
    id: string
    powabase_agent_id: string | null
    name: string
    agency_id: string
  }>(
    `SELECT id, powabase_agent_id, name, agency_id
     FROM client_bots
     WHERE id = $1 AND agency_id = $2 AND status = 'active'`,
    [botId, session.agencyId]
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

  // Resolve session_id for multi-turn
  let effectiveConversationId: string | null = conversation_id || null
  let powaSessionId: string | undefined = session_id || undefined

  if (effectiveConversationId) {
    const convs = await query<{ powabase_session_id: string | null }>(
      `SELECT powabase_session_id
       FROM bot_conversations
       WHERE id = $1 AND bot_id = $2 AND agency_id = $3`,
      [effectiveConversationId, botId, session.agencyId]
    )
    if (convs.length > 0) {
      powaSessionId = convs[0].powabase_session_id || powaSessionId
    } else {
      // Conversation doesn't belong to this agency — create a new one
      effectiveConversationId = null
    }
  }

  try {
    const powaStream = await runAgentStream(
      bot.powabase_agent_id,
      userMessage,
      powaSessionId
    )

    const encoder = new TextEncoder()
    const transformStream = new TransformStream()
    const writer = transformStream.writable.getWriter()

    // Process the SSE stream asynchronously
    ;(async () => {
      let streamError: string | null = null

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
        let capturedSessionId: string | null = null
        let fullContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith(":")) continue
            if (!line.startsWith("data: ")) continue

            const rawData = line.slice(6)

            let event: Record<string, unknown>
            try {
              event = JSON.parse(rawData)
            } catch {
              await writer.write(encoder.encode(`${line}\n`))
              continue
            }

            const kind = event?.event as string | undefined

            // Capture session_id from start event for multi-turn
            if (kind === "start") {
              capturedSessionId = (event.session_id as string) || null
              if (effectiveConversationId && capturedSessionId) {
                query(
                  `UPDATE bot_conversations SET powabase_session_id = $1 WHERE id = $2`,
                  [capturedSessionId, effectiveConversationId]
                ).catch(() => {})
              }
            }

            // Track content for persistence
            if (kind === "chunk" && typeof event.content === "string") {
              fullContent = event.content
            }
            if (kind === "complete" && typeof event.content === "string") {
              fullContent = event.content
            }

            // Track errors
            if (kind === "error") {
              streamError = (event.message as string) || "Stream error"
            }

            // Forward the event to the client
            await writer.write(encoder.encode(`${line}\n`))
          }
        }

        // Send [DONE] marker
        await writer.write(encoder.encode("data: [DONE]\n\n"))

        // Persist to DB — only on success
        if (!streamError) {
          try {
            if (effectiveConversationId) {
              // Update existing conversation
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
                 (bot_id, agency_id, powabase_session_id, message_count)
                 VALUES ($1, $2, $3, 2)
                 RETURNING id`,
                [botId, session.agencyId, capturedSessionId]
              )
              if (convs.length > 0) {
                effectiveConversationId = convs[0].id
                // Send conversation_id to client for multi-turn + history
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

            // Save the user message
            if (effectiveConversationId) {
              await query(
                `INSERT INTO bot_messages (conversation_id, role, content)
                 VALUES ($1, 'user', $2)`,
                [effectiveConversationId, userMessage]
              )

              // Save the assistant message
              if (fullContent) {
                await query(
                  `INSERT INTO bot_messages (conversation_id, role, content)
                   VALUES ($1, 'assistant', $2)`,
                  [effectiveConversationId, fullContent]
                )
              }
            }
          } catch (dbErr) {
            console.error("Failed to persist dashboard chat:", dbErr)
            // Non-fatal — stream is already complete
          }
        }

        await writer.close()
      } catch (err) {
        console.error("Dashboard chat stream error:", err)
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

    return new Response(transformStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    console.error("Dashboard chat error:", err)
    return new Response(
      JSON.stringify({
        error: "Chat failed. Check credits and agent configuration.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
