"use client"

import { useState } from "react"

export function CopyBox({ text }: { text: string }) {
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
      className="w-full bg-gray-50 rounded-md px-3 py-2.5 font-mono text-xs leading-relaxed text-left flex items-center justify-between gap-3 hover:bg-gray-100 transition-colors duration-150 cursor-pointer relative"
    >
      <span className="text-gray-600 invisible" aria-hidden="true">{text}</span>
      <span className={`absolute left-3 right-8 ${copied ? "text-gray-900" : "text-gray-600"}`}>
        {copied ? "Copied!" : text}
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 relative z-10 transition-opacity duration-150 ${copied ? "opacity-0" : "text-gray-400"}`}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
  )
}
