"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function NewBotPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create bot")
      }

      const { bot } = await res.json()
      router.push(`/dashboard/bots/${bot.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bot")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <div>
        <Link
          href="/dashboard/bots"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to bots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Create new bot
        </h1>
        <p className="text-sm text-muted-foreground">
          Give it a name — you can add content and configure it next.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Bot name
          </label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Acme Support"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">
            This is what your client will see in the dashboard and widget header.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create bot"}
          </Button>
          <Link
            href="/dashboard/bots"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
