"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { buildTempoPaymentCommand } from "@/lib/payment-command"

type RfsStatus = "open" | "funded" | "published"
type PendingPayment = "fund" | "purchase"

interface RfsActionsProps {
  rfsId: string
  status: RfsStatus
  canFund: boolean
  canClaim: boolean
  canSubmit: boolean
  canBuy: boolean
  skillId?: string
  hasAccess: boolean
  signedIn: boolean
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

const parseError = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; code?: string; detail?: string }
    | null
  return payload?.message ?? payload?.detail ?? payload?.code ?? `Request failed (${response.status})`
}

export function RfsActions({
  rfsId,
  status,
  canFund,
  canClaim,
  canSubmit,
  canBuy,
  skillId,
  hasAccess,
  signedIn,
}: RfsActionsProps) {
  const router = useRouter()
  const [fundAmount, setFundAmount] = useState("0.003")
  const [content, setContent] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentCommand, setPaymentCommand] = useState<string | null>(null)
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null)

  const [summary, setSummary] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [tags, setTags] = useState("")
  const [price, setPrice] = useState("0.005")

  const showPaymentCommand = (
    response: Response,
    payment: PendingPayment,
    options: { method: "GET" | "POST"; url: string; jsonBody?: Record<string, string> },
  ) => {
    if (response.status !== 402) {
      return false
    }
    const challenge = response.headers.get("WWW-Authenticate")
    if (!challenge) {
      setStatusMessage("The payment service returned an invalid challenge.")
      return true
    }
    setPaymentCommand(
      buildTempoPaymentCommand({
        challenge,
        method: options.method,
        url: new URL(options.url, window.location.origin).toString(),
        ...(options.jsonBody ? { jsonBody: options.jsonBody } : {}),
      }),
    )
    setPendingPayment(payment)
    setStatusMessage(
      signedIn
        ? "Payment required. Run the Moderato command below, then check the result here."
        : "Payment required. The command returns the result in your terminal. Sign in before paying to save browser access.",
    )
    return true
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

      if (
        showPaymentCommand(response, "fund", {
          method: "POST",
          url: `/api/rfs/${rfsId}/fund`,
          jsonBody: { amount: fundAmount },
        })
      ) {
        return
      }
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      setPaymentCommand(null)
      setPendingPayment(null)
      setStatusMessage("Contribution accepted on Tempo Moderato.")
      router.refresh()
    } catch {
      setStatusMessage("Could not reach the payment endpoint.")
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/browse/${rfsId}`)}`)
      return
    }
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/claim`, { method: "POST" })
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }
      setStatusMessage("Request claimed successfully.")
      router.refresh()
    } catch {
      setStatusMessage("Could not claim this request.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitSkill = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
      router.refresh()
    } catch {
      setStatusMessage("Could not submit this skill.")
    } finally {
      setLoading(false)
    }
  }

  const handleGetContent = async () => {
    if (!skillId) {
      setStatusMessage("No skill is available yet.")
      return
    }

    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/skills/${skillId}/content`)
      if (
        showPaymentCommand(response, "purchase", {
          method: "GET",
          url: `/api/skills/${skillId}/content`,
        })
      ) {
        return
      }
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      const payload = (await response.json()) as { contentMarkdown?: string; accessGranted?: boolean }
      setContent(payload.contentMarkdown ?? null)
      setPaymentCommand(null)
      setPendingPayment(null)
      setStatusMessage(payload.accessGranted ? "Skill content unlocked." : "Skill content fetched.")
      router.refresh()
    } catch {
      setStatusMessage("Could not fetch the skill content.")
    } finally {
      setLoading(false)
    }
  }

  const copyPaymentCommand = async () => {
    if (!paymentCommand) {
      return
    }
    try {
      await navigator.clipboard.writeText(paymentCommand)
      setStatusMessage("Payment command copied.")
    } catch {
      setStatusMessage("Copy failed. Select the command manually.")
    }
  }

  const checkPaymentResult = () => {
    if (pendingPayment === "purchase") {
      void handleGetContent()
      return
    }
    setPaymentCommand(null)
    setPendingPayment(null)
    setStatusMessage("Request refreshed. Confirm the updated funding total above.")
    router.refresh()
  }

  return (
    <div className="space-y-4 mt-4">
      {canFund ? (
        <div className="space-y-2">
          <label htmlFor="fund-amount" className="text-xs font-mono text-muted-foreground">
            amount in pathUSD
          </label>
          <input
            id="fund-amount"
            value={fundAmount}
            onChange={(event) => setFundAmount(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            inputMode="decimal"
            placeholder="0.003"
          />
          <button
            type="button"
            onClick={handleFund}
            disabled={loading}
            className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
          >
            prepare testnet contribution
          </button>
        </div>
      ) : null}

      {canClaim ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={loading}
          className="w-full bg-emerald-700 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
        >
          {signedIn ? "claim & write this skill" : "sign in to claim"}
        </button>
      ) : null}

      {canSubmit ? (
        <form onSubmit={handleSubmitSkill} className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-mono uppercase text-muted-foreground">submit skill</p>
          <label htmlFor="skill-summary" className="sr-only">summary</label>
          <input
            id="skill-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="summary"
            required
          />
          <label htmlFor="skill-content" className="sr-only">markdown content</label>
          <textarea
            id="skill-content"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-28"
            placeholder="markdown content"
            required
          />
          <label htmlFor="skill-tags" className="sr-only">tags</label>
          <input
            id="skill-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="tags,comma,separated"
          />
          <label htmlFor="skill-price" className="text-xs font-mono text-muted-foreground">
            purchase price in pathUSD
          </label>
          <input
            id="skill-price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            inputMode="decimal"
            placeholder="0.005"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
          >
            submit & publish skill
          </button>
        </form>
      ) : null}

      {status === "published" && (canBuy || hasAccess) ? (
        <button
          type="button"
          onClick={handleGetContent}
          disabled={loading}
          className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
        >
          {canBuy ? "prepare testnet purchase" : "read skill"}
        </button>
      ) : null}

      {paymentCommand ? (
        <div className="space-y-2 border border-amber-300 bg-amber-50 rounded-md p-3">
          <p className="text-xs font-mono leading-relaxed">
            Tempo Moderato only. This command signs the exact challenge shown to your browser and transfers testnet pathUSD.
          </p>
          <pre className="text-[11px] whitespace-pre-wrap break-all overflow-x-auto rounded bg-white border border-amber-200 p-2" aria-label="Tempo payment command">
            {paymentCommand}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyPaymentCommand} className="border border-gray-300 bg-white font-mono text-xs px-3 py-1.5 rounded-md">
              copy command
            </button>
            <button type="button" onClick={checkPaymentResult} disabled={loading} className="bg-gray-900 text-white font-mono text-xs px-3 py-1.5 rounded-md disabled:opacity-60">
              {pendingPayment === "purchase" ? "check browser access" : "refresh funding total"}
            </button>
          </div>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="text-xs font-mono text-muted-foreground" aria-live="polite">
          {statusMessage}
        </p>
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
