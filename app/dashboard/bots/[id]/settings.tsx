"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface BotSettingsProps {
  botId: string
  currentStatus: string
  widgetConfig: Record<string, unknown>
}

export function BotSettings({ botId, currentStatus }: BotSettingsProps) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)

  async function toggleStatus() {
    setLoading(true)
    const newStatus = status === "active" ? "paused" : "active"

    try {
      const res = await fetch(`/api/bots/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        setStatus(newStatus)
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={status === "active" ? "secondary" : "outline"}
        size="sm"
        onClick={toggleStatus}
        disabled={loading}
      >
        {loading ? "..." : status === "active" ? "Pause" : "Activate"}
      </Button>
    </div>
  )
}
