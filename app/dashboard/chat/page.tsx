"use client"

import { useState, useRef, useEffect } from "react"
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  MessageSquare,
  Plus,
  Search,
  CheckCircle2,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotOption {
  id: string
  name: string
}

interface Conversation {
  id: string
  message_count: number
  lead_captured: boolean
  lead_id: string | null
  created_at: string
  preview: string | null
}

interface Message {
  id?: string
  role: "user" | "assistant"
  content: string
  created_at?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 365) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DashboardChatPage() {
  // ── Bot state ──
  const [bots, setBots] = useState<BotOption[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>("")
  const [botsLoading, setBotsLoading] = useState(true)

  // ── Conversations state ──
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // ── Active conversation state ──
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // ── Chat state ──
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState("")

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Load bots on mount ──
  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetch("/api/bots")
        if (res.ok) {
          const data = await res.json()
          const botList: BotOption[] = (data.bots || []).map(
            (b: { id: string; name: string }) => ({ id: b.id, name: b.name })
          )
          setBots(botList)
          if (botList.length > 0) {
            setSelectedBotId(botList[0].id)
          }
        }
      } catch {
        setError("Failed to load bots")
      } finally {
        setBotsLoading(false)
      }
    }
    loadBots()
  }, [])

  // ── Load conversations when bot changes ──
  useEffect(() => {
    if (!selectedBotId) return
    setConversations([])
    setActiveConversationId(null)
    setMessages([])
    setError("")
    loadConversations(selectedBotId)
  }, [selectedBotId])

  async function loadConversations(botId: string) {
    setConversationsLoading(true)
    try {
      const res = await fetch(`/api/bots/${botId}/conversations`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch {
      // silent
    } finally {
      setConversationsLoading(false)
    }
  }

  // ── Load messages when a conversation is selected ──
  useEffect(() => {
    if (!activeConversationId || !selectedBotId) {
      setMessages([])
      return
    }

    async function loadMessages() {
      setMessagesLoading(true)
      try {
        const res = await fetch(
          `/api/bots/${selectedBotId}/conversations/${activeConversationId}`
        )
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch {
        setError("Failed to load messages")
      } finally {
        setMessagesLoading(false)
      }
    }

    loadMessages()
  }, [activeConversationId, selectedBotId])

  // ── Select a conversation ──
  function handleSelectConversation(convId: string) {
    if (streaming) return // don't switch during streaming
    setActiveConversationId(convId)
    setError("")
  }

  // ── Start a new chat ──
  function handleNewChat() {
    if (streaming) return
    setActiveConversationId(null)
    setMessages([])
    setError("")
    sessionIdRef.current = null
  }

  // ── Send message ──
  async function handleSend() {
    const text = input.trim()
    if (!text || !selectedBotId || streaming) return

    setInput("")
    setError("")

    // Add user message to UI
    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])

    // Add placeholder assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])
    setStreaming(true)

    try {
      const abortController = new AbortController()
      abortRef.current = abortController

      const res = await fetch(`/api/bots/${selectedBotId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: activeConversationId,
          session_id: sessionIdRef.current,
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat failed" }))
        throw new Error(err.error || "Chat failed")
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("Stream unavailable")

      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (line.startsWith(":")) continue
          if (line === "data: [DONE]") continue
          if (!line.startsWith("data: ")) continue

          const raw = line.slice(6)
          let event: Record<string, unknown>
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          const kind = event?.event as string | undefined

          switch (kind) {
            case "start":
              sessionIdRef.current =
                (event.session_id as string) || null
              break

            case "content_delta":
              fullContent += (event.delta as string) || ""
              updateAssistantContent(fullContent)
              break

            case "chunk":
              if (typeof event.content === "string") {
                fullContent = event.content
                updateAssistantContent(fullContent)
              }
              break

            case "complete":
              if (typeof event.content === "string") {
                fullContent = event.content
                updateAssistantContent(fullContent)
              }
              break

            case "conversation_created": {
              const newConvId = (event.conversation_id as string) || null
              if (newConvId) {
                setActiveConversationId(newConvId)
                // Refresh conversation list
                loadConversations(selectedBotId)
              }
              break
            }

            case "error":
              setError(
                String(event.message || "An error occurred")
              )
              break
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message)
        // Show error in the assistant message
        setMessages((prev) => {
          const updated = [...prev]
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: "assistant",
              content: `❌ ${err.message}`,
            }
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Refresh conversations list to get updated counts
      if (selectedBotId) loadConversations(selectedBotId)
    }
  }

  function updateAssistantContent(content: string) {
    setMessages((prev) => {
      const updated = [...prev]
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          role: "assistant",
          content,
        }
      }
      return updated
    })
  }

  // ── Keyboard handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Filter conversations by search ──
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      (c.preview || "").toLowerCase().includes(query) ||
      formatRelativeTime(c.created_at).toLowerCase().includes(query)
    )
  })

  // ── Render ──
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Chat</h1>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {botsLoading
              ? "Loading..."
              : `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {botsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Select
              value={selectedBotId}
              onValueChange={(v) => {
                setSelectedBotId(v)
                setMessages([])
                setError("")
                sessionIdRef.current = null
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue
                  placeholder={bots.length === 0 ? "No bots" : "Select a bot"}
                />
              </SelectTrigger>
              <SelectContent>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Subtle grain texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.012] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Split layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Chat Area ── */}
        <div className="flex flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!selectedBotId ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <h2 className="text-lg font-medium text-muted-foreground">
                    Select a bot
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground/60">
                    Choose a bot from the selector above to start chatting
                  </p>
                </div>
              </div>
            ) : messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${i % 2 === 0 ? "" : "flex-row-reverse"}`}
                    >
                      <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                      <div
                        className={`h-16 animate-pulse rounded-2xl bg-muted ${
                          i % 2 === 0 ? "w-72" : "w-48"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : messages.length === 0 && activeConversationId ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground/60">
                    This conversation has no messages yet
                  </p>
                </div>
              </div>
            ) : messages.length === 0 && !activeConversationId ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <h2 className="text-lg font-medium text-muted-foreground">
                    Test your bot
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground/60">
                    Send a message below to start a conversation
                    {selectedBotId && bots.find((b) => b.id === selectedBotId)
                      ? ` with ${bots.find((b) => b.id === selectedBotId)!.name}`
                      : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={msg.id || i}
                    className={`flex items-start gap-3 ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        msg.role === "user"
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-amber-500 text-white"
                          : "border bg-card text-card-foreground"
                      }`}
                    >
                      {msg.content || (
                        <span className="inline-flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-amber-400" />
                          <span
                            className="h-2 w-2 animate-bounce rounded-full bg-amber-400"
                            style={{ animationDelay: "0.1s" }}
                          />
                          <span
                            className="h-2 w-2 animate-bounce rounded-full bg-amber-400"
                            style={{ animationDelay: "0.2s" }}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="mx-auto mt-4 flex max-w-3xl items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t px-6 py-4">
            <div className="mx-auto flex max-w-3xl items-end gap-3">
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedBotId
                      ? "Type a message..."
                      : "Select a bot to start chatting"
                  }
                  disabled={!selectedBotId || streaming}
                  rows={1}
                  className="flex max-h-32 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || !selectedBotId || streaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white transition-all hover:bg-amber-600 disabled:opacity-30"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── History Sidebar ── */}
        <aside className="flex w-72 shrink-0 flex-col border-l bg-muted/20">
          {/* New Chat button */}
          <div className="border-b p-3">
            <button
              onClick={handleNewChat}
              disabled={!selectedBotId || streaming}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-amber-500/50 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-amber-950/20 dark:hover:text-amber-400"
            >
              <Plus className="h-4 w-4" />
              New conversation
            </button>
          </div>

          {/* Search */}
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-xs outline-none ring-0 placeholder:text-muted-foreground/60 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading && conversations.length === 0 ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-muted"
                    style={{ animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground/60">
                  {searchQuery
                    ? "No conversations match your search"
                    : "No conversations yet"}
                </p>
                {!searchQuery && (
                  <p className="mt-1 text-xs text-muted-foreground/40">
                    Start a new conversation above
                  </p>
                )}
              </div>
            ) : (
              <div className="py-1">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`group relative w-full border-b px-3 py-3 text-left transition-all last:border-b-0 hover:bg-muted/60 ${
                      activeConversationId === conv.id
                        ? "bg-amber-50 before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 before:bg-amber-500 dark:bg-amber-950/15"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`line-clamp-1 text-sm ${
                          activeConversationId === conv.id
                            ? "font-medium text-amber-800 dark:text-amber-300"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {conv.preview || "New conversation"}
                      </p>
                      <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(conv.created_at)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground/70">
                        {conv.message_count} msg{conv.message_count !== 1 ? "s" : ""}
                      </span>
                      {conv.lead_captured && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Lead
                        </span>
                      )}
                      {activeConversationId === conv.id && (
                        <span className="ml-auto text-[11px] font-medium text-amber-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-amber-400">
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
