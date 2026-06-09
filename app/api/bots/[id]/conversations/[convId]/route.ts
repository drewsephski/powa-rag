import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; convId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId, convId } = await params

  const messages = await query(
    `SELECT m.id, m.role, m.content, m.sources, m.created_at
     FROM bot_messages m
     JOIN bot_conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND c.bot_id = $2 AND c.agency_id = $3
     ORDER BY m.created_at ASC`,
    [convId, botId, session.agencyId]
  )

  return NextResponse.json({ messages })
}
