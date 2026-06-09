"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { X } from "lucide-react"

interface WidgetConfig {
  botId: string
  botName: string
  primaryColor: string
  welcomeMessage: string
  position: string
  showPoweredBy: boolean
  agentId: string | null
}

interface Message {
  role: "user" | "assistant"
  content: string
}

/**
 * Chat widget that consumes Powabase SSE events.
 *
 * Event format (Powabase standard):
 *   data: {"event": "start", "session_id": "..."}
 *   data: {"event": "content_delta", "delta": "Hello"}
 *   data: {"event": "chunk", "content": "Hello complete"}
 *   data: {"event": "tool_call", "tool_name": "knowledge_search", ...}
 *   data: {"event": "complete", "content": "...", "usage": {...}}
 *   data: {"event": "error", "message": "...", "code": "..."}
 *
 * Synthetic events from our proxy:
 *   data: {"event": "lead_intent", "reason": "pricing_inquiry"}
 *   data: {"event": "conversation_created", "conversation_id": "..."}
 *
 * Keepalive (SSE comment, must be dropped):
 *   : keepalive
 */
export function WidgetChat({ config }: { config: WidgetConfig }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: config.welcomeMessage },
  ])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadInfo, setLeadInfo] = useState({ name: "", email: "" })
  const [leadReason, setLeadReason] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const slug = typeof window !== "undefined"
    ? window.location.pathname.split("/embed/")[1]
    : ""

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Notify parent iframe of initial size
  useEffect(() => {
    window.parent.postMessage({ type: "sqx-resize", height: window.innerHeight }, "*")
  }, [])

  /**
   * Send message via SSE, processing Powabase events.
   *
   * SSE buffering rules (from Powabase docs):
   *   - Buffer and split on \n
   *   - Drop lines starting with ":" (keepalive)
   *   - Process only lines starting with "data: "
   *   - Capture session_id from "start" event for multi-turn
   */
  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return

      const userMsg: Message = { role: "user", content: text }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      setStreaming(true)

      // Add an empty assistant message that we'll fill via streaming
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])

      try {
        const params = new URLSearchParams({ token: token || "" })
        if (conversationIdRef.current) {
          params.set("conversation_id", conversationIdRef.current)
        }
        params.set("visitor_id", getVisitorId())
        params.set("page_url", window.location.href)

        const res = await fetch(
          `/api/widget/${slug}/chat?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          }
        )

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Request failed" }))
          throw new Error(errData.error || `Chat failed (${res.status})`)
        }

        // ── SSE stream parsing ──
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let currentContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Append new data and split on newlines
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          // Keep the last partial line in the buffer
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            // ── Drop keepalive comments ──
            if (line.startsWith(":")) continue

            // ── Only process data: lines ──
            if (!line.startsWith("data: ")) continue

            const rawData = line.slice(6)

            // ── [DONE] marker ──
            if (rawData === "[DONE]") continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(rawData)
            } catch {
              // Not JSON — skip
              continue
            }

            const kind = event?.event as string | undefined

            switch (kind) {
              case "start": {
                // Capture session_id for multi-turn
                sessionIdRef.current = (event.session_id as string) || null
                break
              }

              case "content_delta": {
                // Per-token delta (not persisted individually)
                const delta = (event.delta as string) || ""
                currentContent += delta
                updateAssistantMessage(currentContent)
                break
              }

              case "chunk": {
                // Final assembled text (sync-style, no tool generation)
                const content = (event.content as string) || ""
                if (content) {
                  currentContent = content
                  updateAssistantMessage(currentContent)
                }
                break
              }

              case "lead_intent": {
                // Synthetic event from our proxy
                const reason = (event.reason as string) || "unanswered"
                setLeadReason(reason)
                setShowLeadForm(true)
                break
              }

              case "conversation_created": {
                // Synthetic event from our proxy — save for multi-turn
                conversationIdRef.current = (event.conversation_id as string) || null
                break
              }

              case "tool_call": {
                // Agent is calling a tool — could show a "thinking" indicator
                break
              }

              case "tool_result": {
                // Tool finished — could update indicator
                break
              }

              case "complete": {
                // Run finished — finalize the message
                const finalContent = (event.content as string) || currentContent
                if (finalContent) {
                  currentContent = finalContent
                  updateAssistantMessage(currentContent)
                }
                break
              }

              case "error": {
                const errMsg = (event.message as string) || "An error occurred"
                const code = (event.code as string) || ""
                console.error("Agent error:", errMsg, code)
                updateAssistantMessage(
                  `I'm sorry, I encountered an error. ${code === "rate_limited" ? "Please try again in a moment." : ""}`
                )
                break
              }
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err)
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content:
              err instanceof Error
                ? `Sorry, something went wrong: ${err.message}`
                : "Sorry, I had trouble responding. Please try again.",
          }
          return updated
        })
      } finally {
        setStreaming(false)
        scrollToBottom()
      }
    },
    [slug, token, streaming]
  )

  /** Update the last assistant message with new content */
  function updateAssistantMessage(content: string) {
    setMessages((prev) => {
      const updated = [...prev]
      if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
        updated[updated.length - 1] = { role: "assistant", content }
      }
      return updated
    })
    scrollToBottom()
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    })
  }

  async function submitLead() {
    if (!leadInfo.email) return

    try {
      const params = new URLSearchParams({ token: token || "" })
      await fetch(`/api/widget/${slug}/lead?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadInfo.name,
          email: leadInfo.email,
          reason: leadReason,
          conversation_id: conversationIdRef.current,
          notes: messages
            .filter((m) => m.content)
            .slice(-4)
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n"),
        }),
      })
      setShowLeadForm(false)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Thanks! Someone from the team will reach out to you shortly.",
        },
      ])
    } catch (err) {
      console.error("Lead capture error:", err)
    }
  }

  return (
    <div
      style={{ "--primary": config.primaryColor } as React.CSSProperties}
      className="flex h-svh flex-col bg-white dark:bg-zinc-950"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 text-white"
        style={{ backgroundColor: config.primaryColor }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
          {config.botName[0]}
        </div>
        <div>
          <p className="text-sm font-medium">{config.botName}</p>
          <p className="text-xs opacity-80">Online</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() =>
              window.parent.postMessage({ type: "sqx-close" }, "*")
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:bg-white/20 hover:text-white"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  msg.role === "user"
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm bg-muted"
                }`}
                style={
                  msg.role === "user"
                    ? { backgroundColor: config.primaryColor }
                    : undefined
                }
              >
                {msg.content || (
                  <span className="inline-flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-60" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-40" style={{ animationDelay: "0.1s" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-20" style={{ animationDelay: "0.2s" }} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Lead capture form */}
      {showLeadForm && (
        <div className="border-t p-4">
          <p className="mb-2 text-sm font-medium">
            Leave your details and we&apos;ll follow up
          </p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Your name"
              value={leadInfo.name}
              onChange={(e) => setLeadInfo({ ...leadInfo, name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Your email *"
              required
              value={leadInfo.email}
              onChange={(e) => setLeadInfo({ ...leadInfo, email: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <button
              onClick={submitLead}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: config.primaryColor }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming || showLeadForm}
            className="flex-1 rounded-xl border bg-background px-4 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: config.primaryColor }}
          >
            Send
          </button>
        </form>
        {config.showPoweredBy && (
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            Powered by Squidex
          </p>
        )}
      </div>
    </div>
  )
}

/** Simple visitor ID from localStorage */
function getVisitorId(): string {
  if (typeof window === "undefined") return "anonymous"
  let id = localStorage.getItem("squidex_visitor_id")
  if (!id) {
    id = crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
    localStorage.setItem("squidex_visitor_id", id)
  }
  return id
}
