/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from "@/lib/db/client"
import { notFound } from "next/navigation"
import { WidgetChat } from "./widget-chat"

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const bots = await query<{
    id: string
    name: string
    widget_config: Record<string, unknown>
    powabase_agent_id: string | null
  }>(
    `SELECT id, name, widget_config, powabase_agent_id
     FROM client_bots
     WHERE slug = $1 AND status = 'active'`,
    [slug]
  )

  if (bots.length === 0) {
    notFound()
  }

  const bot = bots[0]

  const config = {
    botId: bot.id,
    botName: (bot.widget_config as any)?.bot_name || bot.name,
    primaryColor: (bot.widget_config as any)?.primary_color || "#2563eb",
    welcomeMessage: (bot.widget_config as any)?.welcome_message || "Hi! How can I help you today?",
    position: (bot.widget_config as any)?.position || "right",
    showPoweredBy: (bot.widget_config as any)?.show_powered_by !== false,
    agentId: bot.powabase_agent_id,
  }

  return <WidgetChat config={config} />
}
