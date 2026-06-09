import { NextResponse } from "next/server"
import { query } from "@/lib/db/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const bots = await query<{
    name: string
    widget_config: Record<string, unknown>
    embed_token: string
  }>(
    `SELECT name, widget_config, embed_token
     FROM client_bots
     WHERE slug = $1 AND status = 'active'`,
    [slug]
  )

  if (bots.length === 0) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  const bot = bots[0]

  return NextResponse.json({
    name: bot.name,
    config: bot.widget_config,
    token: bot.embed_token,
  })
}
