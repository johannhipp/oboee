"use client"

import { useState } from "react"
import type { PayoutAssessmentStatus, RFSStatus, SkillVersionStatus } from "@/lib/types"

interface SkillVersionSummary {
  id: string
  version: number
  contentHash: string
  status: SkillVersionStatus
  evaluationDeadline: number
}

interface PayoutAssessmentSummary {
  status: PayoutAssessmentStatus
  qualityMultiplierBps: number
  finalPayoutBaseUnits: bigint
  assessmentReason: string
}

interface RfsActionsProps {
  rfsId: string
  status: RFSStatus
  canFund: boolean
  canClaim: boolean
  canBuy: boolean
  canEvaluate: boolean
  canRevise: boolean
  canClaimPayout: boolean
  skillId?: string
  hasSkill: boolean
  latestSkillVersion?: SkillVersionSummary
  payoutAssessment?: PayoutAssessmentSummary
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
  canEvaluate,
  canRevise,
  canClaimPayout,
  skillId,
  hasSkill,
  latestSkillVersion,
  payoutAssessment,
}: RfsActionsProps) {
  const [fundAmount, setFundAmount] = useState("0.003")
  const [content, setContent] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [summary, setSummary] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [tags, setTags] = useState("")
  const [price, setPrice] = useState("0.005")

  const [rating, setRating] = useState("5")
  const [outcome, setOutcome] = useState("resolved")
  const [confidence, setConfidence] = useState("high")
  const [evidenceType, setEvidenceType] = useState("test_result")
  const [targetEnvironment, setTargetEnvironment] = useState("local test fixture")
  const [evidenceSummary, setEvidenceSummary] = useState("")
  const [reviewText, setReviewText] = useState("")
  const [evidenceReferences, setEvidenceReferences] = useState("")
  const [disputeReason, setDisputeReason] = useState("")
  const [claimGroupId, setClaimGroupId] = useState("")

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
      setStatusMessage("RFS assigned. You can now submit the skill for evaluation.")
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

      setStatusMessage(canRevise ? "Revision submitted for evaluation." : "Skill submitted for evaluation.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitEvaluation = async () => {
    if (!skillId || !latestSkillVersion) {
      setStatusMessage("No skill version is available for evaluation.")
      return
    }

    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId,
          skillVersionId: latestSkillVersion.id,
          skillVersion: latestSkillVersion.version,
          contentHash: latestSkillVersion.contentHash,
          reviewerType: "agent",
          targetEnvironment,
          vulnerabilityTags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          rating: Number(rating),
          outcome,
          confidence,
          evidenceType,
          evidenceSummary,
          evidenceReferences: evidenceReferences
            .split("\n")
            .map((reference) => reference.trim())
            .filter(Boolean),
          reviewText,
        }),
      })

      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }

      setStatusMessage("Evaluation submitted. One negative review can dispute, but cannot reduce or block payout alone.")
    } finally {
      setLoading(false)
    }
  }

  const handleCloseEvaluation = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/evaluation/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      })
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }
      const payload = (await response.json()) as { assessmentReason?: string }
      setStatusMessage(payload.assessmentReason ?? "Evaluation closed.")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDispute = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: disputeReason }),
      })
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }
      setStatusMessage("Dispute opened. Payout is held until resolved.")
    } finally {
      setLoading(false)
    }
  }

  const handleClaimPayout = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const response = await fetch(`/api/rfs/${rfsId}/payout/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimGroupId }),
      })
      if (!response.ok) {
        setStatusMessage(await parseError(response))
        return
      }
      const payload = (await response.json()) as { claimedAmountBaseUnits?: string }
      setStatusMessage(`Payout claimed: ${payload.claimedAmountBaseUnits ?? "0"} base units.`)
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

      const payload = (await response.json()) as {
        contentMarkdown?: string
        accessGranted?: boolean
        contentHash?: string
      }
      setContent(payload.contentMarkdown ?? null)
      setStatusMessage(
        payload.accessGranted
          ? `Skill content unlocked${payload.contentHash ? ` (${payload.contentHash})` : ""}.`
          : "Skill content fetched.",
      )
    } finally {
      setLoading(false)
    }
  }

  const canSubmitSkill = status === "assigned" || canRevise
  const canReadSkill = Boolean(skillId && (status === "published" || hasSkill))
  const canCloseEvaluation = status === "evaluation_open" || status === "disputed"

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

      {canSubmitSkill ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-mono uppercase text-muted-foreground">
            {canRevise ? "submit revision" : "submit skill"}
          </p>
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
            {canRevise ? "submit revision" : "submit for evaluation"}
          </button>
        </div>
      ) : null}

      {canEvaluate && latestSkillVersion ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-mono uppercase text-muted-foreground">submit evaluation</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={rating} onChange={(event) => setRating(event.target.value)} className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm">
              {["1", "2", "3", "4", "5"].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm">
              {[
                "resolved",
                "improved",
                "no_effect",
                "harmful",
                "unable_to_apply",
              ].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={confidence} onChange={(event) => setConfidence(event.target.value)} className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm">
              {["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm">
              {[
                "test_result",
                "scanner_result",
                "exploit_reproduction",
                "diff_attestation",
                "human_review",
                "freeform",
              ].map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <input
            value={targetEnvironment}
            onChange={(event) => setTargetEnvironment(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="target environment"
          />
          <textarea
            value={evidenceSummary}
            onChange={(event) => setEvidenceSummary(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-20"
            placeholder="evidence summary"
          />
          <textarea
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-20"
            placeholder="review text"
          />
          <textarea
            value={evidenceReferences}
            onChange={(event) => setEvidenceReferences(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-16"
            placeholder="evidence references, one per line"
          />
          <button
            type="button"
            onClick={handleSubmitEvaluation}
            disabled={loading}
            className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            submit evaluation
          </button>
        </div>
      ) : null}

      {canCloseEvaluation ? (
        <div className="space-y-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleCloseEvaluation}
            disabled={loading}
            className="w-full bg-blue-700 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            close evaluation window
          </button>
          <input
            value={disputeReason}
            onChange={(event) => setDisputeReason(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="dispute reason"
          />
          <button
            type="button"
            onClick={handleOpenDispute}
            disabled={loading}
            className="w-full bg-orange-700 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            open dispute
          </button>
        </div>
      ) : null}

      {canClaimPayout ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-mono uppercase text-muted-foreground">claim payout</p>
          <input
            value={claimGroupId}
            onChange={(event) => setClaimGroupId(event.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
            placeholder="claim group id"
          />
          <button
            type="button"
            onClick={handleClaimPayout}
            disabled={loading}
            className="w-full bg-emerald-700 text-white font-mono text-sm px-4 py-2 rounded-md"
          >
            claim assessed payout
          </button>
        </div>
      ) : null}

      {canReadSkill ? (
        <button
          type="button"
          onClick={handleGetContent}
          disabled={loading}
          className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md"
        >
          {canBuy ? "buy for listed price" : "read skill"}
        </button>
      ) : null}

      {payoutAssessment ? (
        <div className="border border-border rounded-md p-3 bg-gray-50 text-xs font-mono text-muted-foreground space-y-1">
          <p>assessment: {payoutAssessment.status}</p>
          <p>multiplier: {(payoutAssessment.qualityMultiplierBps / 100).toFixed(0)}%</p>
          <p>{payoutAssessment.assessmentReason}</p>
        </div>
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
