"use client"

import { useState } from "react"

type CopyBoxProps = {
  text: string
  label?: string
  className?: string
}

export function CopyBox({ text, label = "Copy handoff", className }: CopyBoxProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? `Copied ${label.replace(/^copy\s+/i, "").toLowerCase()}` : label}
      className={`group flex w-full min-w-0 items-start justify-between gap-4 border-y border-border py-3 text-left font-mono text-xs transition-colors duration-150 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${className ?? ""}`}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-semibold uppercase tracking-[0.12em] text-[10px] text-foreground">
            {copied ? "Copied" : label}
          </span>
          <span className="text-[10px] text-muted-foreground">{copied ? "" : "copy"}</span>
        </span>
        <code className="mt-1 block max-h-24 overflow-auto break-all leading-relaxed text-[11px] text-muted-foreground">
          {text}
        </code>
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground" aria-hidden="true">
        {copied ? "done" : "↗"}
      </span>
    </button>
  )
}
