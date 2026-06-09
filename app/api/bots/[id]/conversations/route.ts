import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId } = await params

  // Include preview of the first user message for each conversation
  const conversations = await query(
    `SELECT
       c.id,
       c.message_count,
       c.lead_captured,
       c.lead_id,
       c.created_at,
       LEFT(m.content, 120) AS preview
     FROM bot_conversations c
     LEFT JOIN LATERAL (
       SELECT content FROM bot_messages
       WHERE conversation_id = c.id AND role = 'user'
       ORDER BY created_at ASC
       LIMIT 1
     ) m ON true
     WHERE c.bot_id = $1 AND c.agency_id = $2
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [botId, session.agencyId]
  )

  return NextResponse.json({ conversations })
}
