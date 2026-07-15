"use client"

import { useState } from "react"

export function CopyText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`max-w-full min-w-0 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 ${className ?? ""}`}
      title="copy"
    >
      <span className="truncate">{text}</span>
      <span className="shrink-0 text-xs">{copied ? "copied" : ""}</span>
    </button>
  )
}
