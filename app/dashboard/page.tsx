import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import { Bot, Users, MessageSquare } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  // Load overview stats
  const leads = await query<{
    new: number
    contacted: number
    total: number
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'new')::int AS new,
       COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
       COUNT(*)::int AS total
     FROM bot_leads WHERE agency_id = $1`,
    [session.agencyId]
  )

  const bots = await query<{
    id: string
    name: string
    slug: string
    total_leads: number
    total_conversations: number
  }>(
    `SELECT id, name, slug, total_leads, total_conversations
     FROM client_bots
     WHERE agency_id = $1 AND status = 'active'
     ORDER BY total_leads DESC
     LIMIT 5`,
    [session.agencyId]
  )

  const recentLeads = await query<{
    id: string
    visitor_email: string
    visitor_name: string
    lead_reason: string
    created_at: string
    bot_name: string
  }>(
    `SELECT l.id, l.visitor_email, l.visitor_name, l.lead_reason, l.created_at, b.name AS bot_name
     FROM bot_leads l
     JOIN client_bots b ON b.id = l.bot_id
     WHERE l.agency_id = $1 AND l.status = 'new'
     ORDER BY l.created_at DESC
     LIMIT 10`,
    [session.agencyId]
  )

  const recentConversations = await query<{
    id: string
    message_count: number
    created_at: string
    lead_captured: boolean
    bot_name: string
  }>(
    `SELECT c.id, c.message_count, c.created_at, c.lead_captured, b.name AS bot_name
     FROM bot_conversations c
     JOIN client_bots b ON b.id = c.bot_id
     WHERE c.agency_id = $1
     ORDER BY c.created_at DESC
     LIMIT 10`,
    [session.agencyId]
  )

  const leadStats = leads[0] ?? { new: 0, contacted: 0, total: 0 }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 py-6">
      {/* Lead-focused header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {session.name}
        </h1>
        <p className="text-muted-foreground">{session.agencyName}</p>
      </div>

      {/* Lead stats — the core metric */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4" />
            New Leads
          </div>
          <p className="mt-1 text-3xl font-bold">{leadStats.new}</p>
        </div>

        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4" />
            Contacted
          </div>
          <p className="mt-1 text-3xl font-bold">{leadStats.contacted}</p>
        </div>

        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            Total Leads
          </div>
          <p className="mt-1 text-3xl font-bold">{leadStats.total}</p>
        </div>
      </div>

      {/* New leads table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Uncaptured Leads</h2>
          {leadStats.new > 0 && (
            <Link
              href="/dashboard/bots"
              className="text-sm text-primary hover:underline"
            >
              View all bots
            </Link>
          )}
        </div>

        {recentLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No leads yet. Create a bot and embed it on a website to start capturing leads.
            </p>
            <Link
              href="/dashboard/bots/new"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create your first bot
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Contact</th>
                  <th className="px-4 py-2 text-left font-medium">Bot</th>
                  <th className="px-4 py-2 text-left font-medium">Reason</th>
                  <th className="px-4 py-2 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{lead.visitor_name || lead.visitor_email}</div>
                      <div className="text-xs text-muted-foreground">{lead.visitor_email}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{lead.bot_name}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {lead.lead_reason.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bot performance + Recent conversations */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Bot performance */}
        <div>
          <h2 className="mb-3 text-lg font-medium">Bot Performance</h2>
          {bots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No bots yet.
            </div>
          ) : (
            <div className="space-y-2">
              {bots.map((bot) => (
                <Link
                  key={bot.id}
                  href={`/dashboard/bots/${bot.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div className="font-medium">{bot.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {bot.total_leads} leads · {bot.total_conversations} conversations
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent conversations */}
        <div>
          <h2 className="mb-3 text-lg font-medium">Recent Conversations</h2>
          {recentConversations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No conversations yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Bot</th>
                    <th className="px-3 py-2 text-left font-medium">Msgs</th>
                    <th className="px-3 py-2 text-left font-medium">Lead</th>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConversations.map((conv) => (
                    <tr key={conv.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{conv.bot_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{conv.message_count}</td>
                      <td className="px-3 py-2">
                        {conv.lead_captured ? (
                          <span className="text-green-600">✅</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
    </div>
  )
}
