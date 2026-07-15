"use client"

import { useState } from "react"

type RfsStatus = "open" | "funded" | "fulfilled" | "published"

interface RfsActionsProps {
  rfsId: string
  status: RfsStatus
  canFund: boolean
  canClaim: boolean
  canBuy: boolean
  skillId?: string
  hasSkill: boolean
}

const toBaseUnitsString = (value: string) => {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null
  }
  const [whole, fractionRaw = ""] = normalized.split(".")
  if (fractionRaw.length > 6) {
    return null
  }
  return `${whole}${fractionRaw.padEnd(6, "0")}`
}

export function RfsActions({
  rfsId,
  status,
  canFund,
  canClaim,
  canBuy,
  skillId,
  hasSkill,
}: RfsActionsProps) {
  const [fundAmount, setFundAmount] = useState("0.003")
  const [content, setContent] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [summary, setSummary] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [tags, setTags] = useState("")
  const [price, setPrice] = useState("0.005")

  const parseError = async (response: Response) => {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null
    return payload?.message ?? payload?.code ?? `Request failed (${response.status})`
  }

  const handleFund = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fundAmount }),
      })

      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      setStatusMessage("Contribution accepted.")
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/claim`, { method: "POST" })
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }
      setStatusMessage("RFS claimed successfully.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitSkill = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const purchasePriceBaseUnits = toBaseUnitsString(price)
      if (!purchasePriceBaseUnits) {
        setStatusMessage("Invalid purchase price format.")
        return
      }

      const response = await fetch(`/api/rfs/${rfsId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          contentMarkdown: markdown,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          purchasePriceBaseUnits,
        }),
      })

      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      setStatusMessage("Skill submitted and published.")
    } finally {
      setLoading(false)
    }
  }

  const handleGetContent = async () => {
    if (!skillId) {
      setStatusMessage("No skill available yet.")
      return
    }

    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/skills/${skillId}/content`)
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      const payload = (await response.json()) as { contentMarkdown?: string; accessGranted?: boolean }
      setContent(payload.contentMarkdown ?? null)
      setStatusMessage(payload.accessGranted ? "Skill content unlocked." : "Skill content fetched.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 mt-4">
      {canFund ? (
        <div className="space-y-2">
          <input
            value={fundAmount}
            onChange={(event) => setFundAmount(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="0.10"
          />
          <button
            type="button"
            onClick={handleFund}
            disabled={loading}
            className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            fund this request
          </button>
        </div>
      ) : null}

      {canClaim ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={loading}
          className="w-full bg-emerald-700 text-white font-mono text-sm px-4 py-2 rounded-md"
        >
          claim & write this skill
        </button>
      ) : null}

      {(status === "funded" || status === "fulfilled") ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-mono uppercase text-muted-foreground">submit skill</p>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="summary"
          />
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-28"
            placeholder="markdown content"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="tags,comma,separated"
          />
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="0.005"
          />
          <button
            type="button"
            onClick={handleSubmitSkill}
            disabled={loading}
            className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            submit skill
          </button>
        </div>
      ) : null}

      {status === "published" && (canBuy || hasSkill) ? (
        <button
          type="button"
          onClick={handleGetContent}
          disabled={loading}
          className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md"
        >
          {canBuy ? "buy for listed price" : "read skill"}
        </button>
      ) : null}

      {statusMessage ? (
        <p className="text-xs font-mono text-muted-foreground">{statusMessage}</p>
      ) : null}

      {content ? (
        <div className="border border-border rounded-md p-3 bg-gray-50">
          <p className="text-xs font-mono uppercase text-muted-foreground mb-2">full skill</p>
          <pre className="text-xs whitespace-pre-wrap leading-relaxed">{content}</pre>
        </div>
      ) : null}
    </div>
  )
}
