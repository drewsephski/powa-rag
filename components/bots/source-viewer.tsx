"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import {
  X,
  Loader2,
  FileText,
  Globe,
  AlertCircle,
  Trash2,
  Clock,
  Edit3,
  Save,
} from "lucide-react"

interface Source {
  id: string
  source_type: string
  filename: string | null
  website_url: string | null
  extraction_status: string
  created_at: string
}

export function SourcesList({
  botId,
  sources: initialSources,
}: {
  botId: string
  sources: Source[]
}) {
  const router = useRouter()
  const [sources, setSources] = useState(initialSources)
  const [selectedSource, setSelectedSource] = useState<Source | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)
  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSave = useCallback(async () => {
    if (!selectedSource) return
    setSaving(true)
    setError("")

    try {
      const body: Record<string, string> = {}
      if (editContent.trim()) body.content = editContent.trim()
      if (editName.trim()) body.name = editName.trim()

      const res = await fetch(
        `/api/bots/${botId}/sources/${selectedSource.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }))
        throw new Error(err.error || "Save failed")
      }

      setContent(editContent)
      setEditing(false)
      setEditName("")
      toast.success("Source saved")
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [selectedSource, editContent, editName, botId, router])

  const handleStartEdit = useCallback(() => {
    setEditContent(content ?? "")
    setEditName(
      selectedSource?.filename ||
        selectedSource?.website_url ||
        "Source"
    )
    setEditing(true)
    setError("")
  }, [content, selectedSource])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
    setEditContent("")
    setEditName("")
    setError("")
  }, [])

  const fetchContent = useCallback(
    async (source: Source, retryCount = 0) => {
      setLoading(true)
      setError("")
      setExtracting(false)

      try {
        const res = await fetch(
          `/api/bots/${botId}/sources/${source.id}/content`
        )

        if (res.status === 202) {
          // Extraction still in progress — poll after a delay
          setExtracting(true)
          setLoading(false)
          extractTimerRef.current = setTimeout(() => {
            fetchContent(source, retryCount + 1)
          }, 3000)
          return
        }

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Failed to load" }))
          throw new Error(err.error || "Failed to load content")
        }

        const data = await res.json()
        setContent(data.content)
        setExtracting(false)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load content"
        )
        setExtracting(false)
      } finally {
        setLoading(false)
      }
    },
    [botId]
  )

  const handleOpen = useCallback(
    (source: Source) => {
      // Clear any existing retry timer
      if (extractTimerRef.current) {
        clearTimeout(extractTimerRef.current)
        extractTimerRef.current = null
      }
      setSelectedSource(source)
      setContent(null)
      setError("")
      setEditing(false)
      setEditContent("")
      setEditName("")
      fetchContent(source)
    },
    [fetchContent]
  )

  // Refresh live status from Powabase on mount
  useEffect(() => {
    fetch(`/api/bots/${botId}/sources`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sources) setSources(data.sources)
      })
      .catch(() => {})
  }, [botId])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    if (extractTimerRef.current) {
      clearTimeout(extractTimerRef.current)
      extractTimerRef.current = null
    }
    setSelectedSource(null)
    setContent(null)
    setError("")
    setExtracting(false)
    setEditing(false)
    setEditContent("")
    setEditName("")
  }, [])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sourceId: string) => {
      e.stopPropagation()
      setDeletingId(sourceId)

      try {
        const res = await fetch(`/api/bots/${botId}/sources/${sourceId}`, {
          method: "DELETE",
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Delete failed" }))
          throw new Error(err.error || "Delete failed")
        }

        setSources((prev) => prev.filter((s) => s.id !== sourceId))
        router.refresh()
        toast.success("Source deleted")
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed"
        setError(msg)
        toast.error(msg)
      } finally {
        setDeletingId(null)
      }
    },
    [botId, router]
  )

  return (
    <>
      {initialSources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>No sources added yet.</p>
          <p className="mt-1 text-muted-foreground/70">
            Click &quot;Manage sources&quot; to upload documents, add a website
            URL, or paste text directly.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Added</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {initialSources.map((source) => (
                <tr
                  key={source.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  onClick={() => handleOpen(source)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleOpen(source)
                    }
                  }}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      {source.source_type === "website" ? (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">
                        {source.filename ||
                          source.website_url ||
                          "Unknown"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ExtractionBadge status={source.extraction_status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(source.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={(e) => handleDelete(e, source.id)}
                      disabled={deletingId === source.id}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 [tr:hover_&]:opacity-100 disabled:opacity-30"
                    >
                      {deletingId === source.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Content modal */}
      {selectedSource && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <div className="relative z-10 mx-4 flex w-full max-w-3xl flex-col rounded-2xl border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  {selectedSource.source_type === "website" ? (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  {editing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-lg font-semibold ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <h2 className="truncate text-lg font-semibold">
                      {selectedSource.filename ||
                        selectedSource.website_url ||
                        "Source"}
                    </h2>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selectedSource.source_type === "website"
                      ? "Web scraped"
                      : "Uploaded document"}
                    {" · "}
                    {new Date(
                      selectedSource.created_at
                    ).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editing && content && !loading && !extracting && (
                  <button
                    onClick={handleStartEdit}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Edit content"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving || !editContent.trim()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
                {!editing && (
                  <button
                    onClick={handleClose}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[65vh] overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : extracting ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Clock className="mb-3 h-8 w-8 animate-pulse" />
                  <p className="text-sm font-medium">
                    Extracting content...
                  </p>
                  <p className="mt-1 text-xs">
                    PDF is being processed — this may take a moment
                  </p>
                </div>
              ) : error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex min-h-[300px] w-full resize-y rounded-lg border border-input bg-background p-4 font-mono text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Edit source content..."
                />
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{content ?? ""}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ExtractionBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:
      "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    extracting:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    extracted:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    attention_required:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
        colors[status] || colors.pending
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  )
}
