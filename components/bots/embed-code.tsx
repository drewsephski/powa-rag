"use client"

import { useState, useCallback } from "react"
import { Copy, Check, Terminal } from "lucide-react"
import { toast } from "sonner"

export function EmbedCode({ scriptTag }: { scriptTag: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(scriptTag)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }, [scriptTag])

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Embed script
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto bg-[#0d1117] p-4">
        <pre className="text-sm leading-relaxed">
          <code>
            <span className="text-[#85e89d]">&lt;script </span>
            <span className="text-[#79b8ff]">src</span>
            <span className="text-[#c9d1d9]">=</span>
            <span className="text-[#9ecbff]">&quot;{extractSrc(scriptTag)}&quot;</span>
            <span className="text-[#c9d1d9]">&gt;</span>
            <span className="text-[#c9d1d9]">&lt;</span>
            <span className="text-[#85e89d]">/script</span>
            <span className="text-[#c9d1d9]">&gt;</span>
          </code>
        </pre>
      </div>

      {/* Footer hint */}
      <div className="border-t bg-muted/30 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          Paste this script tag just before the closing{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
            &lt;/body&gt;
          </code>{" "}
          tag on your client&apos;s website.
        </p>
      </div>
    </div>
  )
}

function extractSrc(scriptTag: string): string {
  const match = scriptTag.match(/src="([^"]+)"/)
  return match?.[1] ?? "..."
}
