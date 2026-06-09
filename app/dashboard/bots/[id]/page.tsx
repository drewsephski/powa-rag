import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { BotSettings } from "./settings"
import { SourcesManager } from "@/components/bots/sources-manager"
import { SourcesList } from "@/components/bots/source-viewer"
import { EmbedCode } from "@/components/bots/embed-code"

export default async function BotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  const { id } = await params

  const bots = await query<{
    id: string
    name: string
    slug: string
    status: string
    widget_config: Record<string, unknown>
    embed_token: string
    powabase_kb_id: string | null
    total_conversations: number
    total_leads: number
    created_at: string
  }>(
    `SELECT id, name, slug, status, widget_config, embed_token,
            powabase_kb_id, total_conversations, total_leads, created_at
     FROM client_bots
     WHERE id = $1 AND agency_id = $2`,
    [id, session.agencyId]
  )

  if (bots.length === 0) {
    redirect("/dashboard/bots")
  }

  const bot = bots[0]

  const sources = await query<{
    id: string
    source_type: string
    filename: string | null
    website_url: string | null
    extraction_status: string
    created_at: string
  }>(
    `SELECT id, source_type, filename, website_url, extraction_status, created_at
     FROM bot_knowledge_sources
     WHERE bot_id = $1
     ORDER BY created_at DESC`,
    [id]
  )

  const leads = await query<{
    id: string
    visitor_email: string
    visitor_name: string | null
    lead_reason: string
    status: string
    created_at: string
  }>(
    `SELECT id, visitor_email, visitor_name, lead_reason, status, created_at
     FROM bot_leads
     WHERE bot_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [id]
  )

  const conversations = await query<{
    id: string
    message_count: number
    lead_captured: boolean
    created_at: string
  }>(
    `SELECT id, message_count, lead_captured, created_at
     FROM bot_conversations
     WHERE bot_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [id]
  )

  // The script endpoint is served by this Next.js app, not Powabase.
  // Use env var, Vercel URL, request host, or fall back to localhost.
  const headersList = await headers()
  const requestHost = headersList.get("host") || "localhost:3000"
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${protocol}://${requestHost}`)

  const embedScript = `<script src="${siteUrl}/api/widget/${bot.slug}/script?token=${bot.embed_token}"></script>`

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/bots"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Bots
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {bot.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            /widget/{bot.slug}
          </p>
        </div>
        <BotSettings
          botId={bot.id}
          currentStatus={bot.status}
          widgetConfig={bot.widget_config}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Leads</p>
          <p className="text-2xl font-bold">{bot.total_leads}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Conversations</p>
          <p className="text-2xl font-bold">{bot.total_conversations}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Created</p>
          <p className="text-2xl font-bold">
            {new Date(bot.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Embed Code */}
      <div>
        <h2 className="mb-3 text-lg font-medium">Embed</h2>
        <EmbedCode scriptTag={embedScript} />
      </div>

      {/* Knowledge Base */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Knowledge Base</h2>
          <SourcesManager
            botId={bot.id}
            botName={bot.name}
            initialSources={sources}
          />
        </div>

        <SourcesList botId={bot.id} sources={sources} />
      </div>

      {/* Leads */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent Leads</h2>
          {leads.length > 0 && (
            <Link
              href={`/dashboard/bots/${bot.id}/leads`}
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {leads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No leads yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Contact</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{lead.visitor_name || lead.visitor_email}</div>
                      <div className="text-xs text-muted-foreground">{lead.visitor_email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {lead.lead_reason.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Conversations */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent Conversations</h2>
          {conversations.length > 0 && (
            <Link
              href={`/dashboard/bots/${bot.id}/conversations`}
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {conversations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No conversations yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Messages</th>
                  <th className="px-3 py-2 text-left font-medium">Lead Captured</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{conv.message_count}</td>
                    <td className="px-3 py-2">
                      {conv.lead_captured ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    contacted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    closed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.new}`}
    >
      {status}
    </span>
  )
}
