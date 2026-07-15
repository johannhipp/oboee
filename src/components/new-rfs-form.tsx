"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AsciiBox } from "@/components/ascii-box"
import { RFSRow } from "@/components/rfs-row"
import { numberToBaseUnitsString } from "@/lib/view-models"

const inputStyle =
  "bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm w-full placeholder:text-gray-400 outline-none focus:border-gray-400"

export function NewRfsForm() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [scope, setScope] = useState("")
  const [fundingGoal, setFundingGoal] = useState("0.009")
  const [tags, setTags] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const fundingThresholdBaseUnits = numberToBaseUnitsString(Number(fundingGoal))
    if (!fundingThresholdBaseUnits) {
      setError("Funding goal must be a positive number.")
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch("/api/rfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          scope,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          fundingThresholdBaseUnits,
          minimumContributionBaseUnits: "1",
        }),
      })

      const payload = (await response.json()) as {
        status: string
        code?: string
        message?: string
        resourceId?: string
      }

      if (response.status === 401) {
        router.push("/sign-in?next=%2Fnew")
        return
      }

      if (!response.ok || payload.status !== "ok" || !payload.resourceId) {
        setError(payload.message ?? payload.code ?? "Failed to create request.")
        return
      }

      router.push(`/browse/${payload.resourceId}`)
    } catch {
      setError("Failed to create request.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="max-w-3xl mx-auto">
      <h1 className="text-xl font-medium tracking-tight mt-8 mb-6">new request for skill</h1>

      <AsciiBox title="create">
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="rfs-title" className="text-xs font-mono uppercase text-muted-foreground">
                title
              </label>
              <input
                id="rfs-title"
                type="text"
                placeholder="e.g. Next.js middleware CSRF hardening"
                className={inputStyle}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="rfs-description"
                className="text-xs font-mono uppercase text-muted-foreground"
              >
                description
              </label>
              <textarea
                id="rfs-description"
                placeholder="Describe the security expertise needed..."
                rows={4}
                className={inputStyle}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rfs-scope" className="text-xs font-mono uppercase text-muted-foreground">
                scope
              </label>
              <textarea
                id="rfs-scope"
                placeholder="What should the skill file cover? Be specific about frameworks, versions, and attack vectors..."
                rows={4}
                className={inputStyle}
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rfs-tags" className="text-xs font-mono uppercase text-muted-foreground">
                tags
              </label>
              <input
                id="rfs-tags"
                type="text"
                placeholder="nextjs,security,csrf"
                className={inputStyle}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rfs-funding" className="text-xs font-mono uppercase text-muted-foreground">
                funding goal
              </label>
              <input
                id="rfs-funding"
                type="text"
                placeholder="0.009"
                className={`${inputStyle} max-w-xs`}
                value={fundingGoal}
                onChange={(event) => setFundingGoal(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              type="submit"
              className="bg-gray-900 text-white font-mono text-sm px-6 py-2 rounded-md disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "publishing..." : "publish request"}
            </button>
            {error ? <p className="text-xs font-mono text-rose-700 mt-2">{error}</p> : null}
          </div>
        </form>
      </AsciiBox>

      <div className="mt-8">
        <h2 className="text-sm font-mono font-medium tracking-normal text-gray-900 uppercase mb-4">
          preview
        </h2>
        <AsciiBox title="preview">
          <RFSRow
            rfs={{
              id: "preview",
              title: title || "new request",
              description,
              scope,
              fundingThreshold: Number(fundingGoal) || 0,
              currentAmount: 0,
              status: "open",
              authorId: "you",
              claimantId: null,
              createdAt: new Date().toISOString(),
              authorLabel: "you",
            }}
          />
        </AsciiBox>
      </div>
    </section>
  )
}
