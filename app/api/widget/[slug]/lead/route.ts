import { NextResponse } from "next/server"
import { query } from "@/lib/db/client"

/**
 * Capture a lead from the widget.
 *
 * Called when the visitor submits the lead capture form.
 * The backend finds the bot by slug + embed_token, then creates a lead record
 * linked to the conversation (if available).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get("token")

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Validate bot
  const bots = await query<{ id: string; agency_id: string; name: string }>(
    `SELECT id, agency_id, name FROM client_bots
     WHERE slug = $1 AND embed_token = $2 AND status = 'active'`,
    [slug, token]
  )

  if (bots.length === 0) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  const bot = bots[0]
  const body = await request.json()

  // Create lead
  const leads = await query(
    `INSERT INTO bot_leads
     (bot_id, agency_id, visitor_email, visitor_name, lead_reason, notes, conversation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      bot.id,
      bot.agency_id,
      body.email || body.visitor_email,
      body.name || body.visitor_name || null,
      body.reason || "unanswered",
      body.notes || null,
      body.conversation_id || null,
    ]
  )

  // Update bot lead counter
  await query(
    `UPDATE client_bots SET total_leads = total_leads + 1 WHERE id = $1`,
    [bot.id]
  )

  // Update conversation lead flag
  if (body.conversation_id) {
    await query(
      `UPDATE bot_conversations SET lead_captured = true, lead_id = $1 WHERE id = $2`,
      [leads[0].id, body.conversation_id]
    )
  }

  return NextResponse.json({ lead: { id: leads[0].id } })
}
