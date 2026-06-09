"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, Globe, FileText, X, Trash2, Plus, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Source {
  id: string
  source_type: string
  filename: string | null
  website_url: string | null
  extraction_status: string
  created_at: string
}

interface SourcesManagerProps {
  botId: string
  botName: string
  initialSources: Source[]
}

type Tab = "upload" | "website" | "paste"

export function SourcesManager({ botId, botName, initialSources }: SourcesManagerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<Source[]>(initialSources)
  const [tab, setTab] = useState<Tab>("upload")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [statusLog, setStatusLog] = useState<Array<{ id: string; status: string; name: string }>>([])

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Website state
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [crawlDepth, setCrawlDepth] = useState(2)

  // Paste state
  const [pasteTitle, setPasteTitle] = useState("")
  const [pasteContent, setPasteContent] = useState("")

  const refreshSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/bots/${botId}/sources`)
      if (res.ok) {
        const data = await res.json()
        setSources(data.sources || [])
      }
    } catch {}
  }, [botId])

  // ── File Upload ──

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true)
    setError("")

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch(`/api/bots/${botId}/sources/upload`, {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }))
          throw new Error(err.error || err.message || "Upload failed")
        }

        const data = await res.json()
        setStatusLog((prev) => [
          ...prev,
          { id: data.source?.id || "", status: "uploaded", name: file.name },
        ])
        toast.success(`Uploaded ${file.name}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        setError(`${file.name}: ${msg}`)
        toast.error(msg)
      }
    }

    setUploading(false)
    refreshSources()
    router.refresh()
  }, [botId, refreshSources, router])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length) {
        handleFileUpload(e.dataTransfer.files)
      }
    },
    [handleFileUpload]
  )

  // ── Website ──

  const handleWebsiteSubmit = useCallback(async () => {
    if (!websiteUrl.trim()) return
    setUploading(true)
    setError("")

    try {
      const res = await fetch(`/api/bots/${botId}/sources/website`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl, depth: crawlDepth }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to add website" }))
        throw new Error(err.error || "Failed to add website")
      }

      setWebsiteUrl("")
      setStatusLog((prev) => [...prev, { id: "", status: "added", name: websiteUrl }])
      toast.success("Website added — scraping in progress")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add website"
      setError(msg)
      toast.error(msg)
    }

    setUploading(false)
    refreshSources()
    router.refresh()
  }, [websiteUrl, crawlDepth, botId, refreshSources, router])

  // ── Paste Text ──

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteContent.trim()) return
    setUploading(true)
    setError("")

    const filename = pasteTitle.trim() ? `${pasteTitle}.txt` : "pasted-text.txt"

    // Create a file from the pasted content and upload it
    const blob = new Blob([pasteContent], { type: "text/plain" })
    const file = new File([blob], filename, { type: "text/plain" })

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/bots/${botId}/sources/upload`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }))
        throw new Error(err.error || "Upload failed")
      }

      setPasteTitle("")
      setPasteContent("")
      setStatusLog((prev) => [...prev, { id: "", status: "uploaded", name: filename }])
      toast.success("Text added to knowledge base")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save pasted text"
      setError(msg)
      toast.error(msg)
    }

    setUploading(false)
    refreshSources()
    router.refresh()
  }, [pasteContent, pasteTitle, botId, refreshSources, router])

  // ── Delete Source ──

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      try {
        const res = await fetch(`/api/bots/${botId}/sources/${sourceId}`, {
          method: "DELETE",
        })

        if (res.ok) {
          setSources((prev) => prev.filter((s) => s.id !== sourceId))
          router.refresh()
          toast.success("Source deleted")
        } else {
          const err = await res.json().catch(() => ({ error: "Delete failed" }))
          toast.error(err.error || "Delete failed")
        }
      } catch (err) {
        toast.error("Failed to delete source")
        console.error("Delete error:", err)
      }
    },
    [botId, router]
  )

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        Manage sources
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-24">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative z-10 mx-4 flex w-full max-w-2xl flex-col rounded-2xl border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Knowledge Base</h2>
                <p className="text-sm text-muted-foreground">
                  Add content to train <span className="font-medium">{botName}</span>
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-0 sm:flex-row">
              {/* Sidebar tabs */}
              <div className="flex shrink-0 flex-row border-b sm:w-44 sm:flex-col sm:border-b-0 sm:border-r">
                {[
                  { id: "upload" as Tab, label: "Upload files", icon: Upload },
                  { id: "website" as Tab, label: "Website URL", icon: Globe },
                  { id: "paste" as Tab, label: "Paste text", icon: FileText },
                ].map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`flex flex-1 items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
                        tab === t.id
                          ? "border-primary bg-primary/5 text-primary sm:border-r-2 sm:border-l-0 sm:border-b-0 sm:border-t-0"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {/* Tab content */}
              <div className="flex-1 p-6">
                {tab === "upload" && (
                  <div className="space-y-4">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                        dragOver
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-muted-foreground/50"
                      }`}
                    >
                      <Upload className={`mb-3 h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="text-sm font-medium">
                        {dragOver ? "Drop files here" : "Drag files here or click to browse"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PDF, DOCX, TXT, Markdown — up to 50 MB each
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md,.csv"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                      />
                    </div>
                  </div>
                )}

                {tab === "website" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Website URL</label>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Crawl depth</label>
                      <Select
                        value={String(crawlDepth)}
                        onValueChange={(v) => setCrawlDepth(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select depth" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 page (URL only)</SelectItem>
                          <SelectItem value="2">2 pages (URL + linked pages)</SelectItem>
                          <SelectItem value="3">3 pages (deeper crawl)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <button
                      onClick={handleWebsiteSubmit}
                      disabled={!websiteUrl.trim() || uploading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                      Add website
                    </button>
                  </div>
                )}

                {tab === "paste" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Title (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Product FAQ"
                        value={pasteTitle}
                        onChange={(e) => setPasteTitle(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content</label>
                      <textarea
                        placeholder="Paste or type your content here..."
                        value={pasteContent}
                        onChange={(e) => setPasteContent(e.target.value)}
                        rows={10}
                        className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <button
                      onClick={handlePasteSubmit}
                      disabled={!pasteContent.trim() || uploading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Add text
                    </button>
                  </div>
                )}

                {/* Error display */}
                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Recent additions */}
                {statusLog.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {statusLog.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span>{entry.name}</span>
                        <span className="text-muted-foreground/50">— {entry.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sources list footer */}
            <div className="border-t">
              {sources.length === 0 ? (
                <div className="px-6 py-4 text-center text-sm text-muted-foreground">
                  No sources yet. Upload a file, add a website, or paste text above.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground">Source</th>
                        <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground">Status</th>
                        <th className="w-10 px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((source) => (
                        <tr key={source.id} className="border-b last:border-0">
                          <td className="max-w-48 truncate px-4 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              {source.source_type === "website" ? (
                                <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">
                                {source.filename || source.website_url || "Unknown"}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={source.extraction_status} />
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleDeleteSource(source.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
      )}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    extracting: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    extracted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    attention_required: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    indexing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    indexed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        colors[status] || colors.pending
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  )
}
