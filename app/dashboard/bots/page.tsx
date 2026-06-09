import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import Link from "next/link"
import { Plus } from "lucide-react"
import { redirect } from "next/navigation"

export default async function BotsPage() {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  const bots = await query<{
    id: string
    name: string
    slug: string
    status: string
    total_conversations: number
    total_leads: number
    created_at: string
  }>(
    `SELECT id, name, slug, status, total_conversations, total_leads, created_at
     FROM client_bots
     WHERE agency_id = $1
     ORDER BY created_at DESC`,
    [session.agencyId]
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bots</h1>
          <p className="text-sm text-muted-foreground">
            Manage your client chatbots
          </p>
        </div>
        <Link
          href="/dashboard/bots/new"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New bot
        </Link>
      </div>

      {bots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No bots yet. Create your first client chatbot.
          </p>
          <Link
            href="/dashboard/bots/new"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create bot
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Leads</th>
                <th className="px-4 py-3 text-left font-medium">Conversations</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((bot) => (
                <tr
                  key={bot.id}
                  className="border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/bots/${bot.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {bot.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        bot.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : bot.status === "paused"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                      }`}
                    >
                      {bot.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {bot.total_leads}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {bot.total_conversations}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(bot.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
