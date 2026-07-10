import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { AsciiBox } from "@/components/ascii-box"
import { ProgressBar } from "@/components/progress-bar"
import { StatusBadge } from "@/components/status-badge"
import { RfsActions } from "@/components/rfs-actions"
import { CopyId } from "@/components/copy-id"
import { DataToast, DetailSkeleton, SkeletonRows } from "@/components/data-fallback"
import { baseUnitsToNumber } from "@/lib/view-models"
import { convexUnavailableMessage } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

type SkillDetail = FunctionReturnType<typeof api.skills.get>
type Contributions = FunctionReturnType<typeof api.rfs.listContributions>

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const detail = await fetchQuery(api.skills.get, { rfsId: id as Id<"rfs"> })
    return { title: detail.rfs ? `${detail.rfs.title} | Oboe` : "Not found | Oboe" }
  } catch {
    return { title: "Oboe" }
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const rfsId = id as Id<"rfs">

  let contributionsUnavailable = false
  let detail: SkillDetail | null = null
  let contributions: Contributions = []

  try {
    detail = await fetchQuery(api.skills.get, { rfsId })
  } catch {
    // Detail stays null; render a page skeleton below instead of crashing.
  }

  if (!detail) {
    return (
      <div className="my-8">
        <DataToast message={convexUnavailableMessage()} />
        <DetailSkeleton />
      </div>
    )
  }

  try {
    contributions = await fetchQuery(api.rfs.listContributions, { rfsId })
  } catch {
    contributionsUnavailable = true
  }

  const rfs = detail.rfs

  if (!rfs) {
    return (
      <div className="py-16 text-center text-muted-foreground font-mono text-sm">
        rfs not found
      </div>
    )
  }

  const skill = detail.skill
  const currentAmount = baseUnitsToNumber(rfs.currentAmountBaseUnits)
  const fundingThreshold = baseUnitsToNumber(rfs.fundingThresholdBaseUnits)
  const latestSkillVersion = detail.latestSkillVersion
  const payoutAssessment = detail.payoutAssessment

  return (
    <div className="my-8">
      {contributionsUnavailable ? <DataToast message={convexUnavailableMessage()} /> : null}
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-medium tracking-tight break-words">{rfs.title}</h1>
          <div className="mt-2">
            <StatusBadge status={rfs.status} />
          </div>
          <div className="text-sm font-mono mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">by</span>
            <CopyId id={rfs.authorUserId} className="text-sm" />
          </div>

          <AsciiBox title="scope" className="mt-6">
            <p className="text-sm leading-relaxed break-words">{rfs.scope}</p>
            <p className="text-sm leading-relaxed mt-2 break-words">{rfs.description}</p>
          </AsciiBox>

          {latestSkillVersion ? (
            <AsciiBox title="evaluation" className="mt-6">
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="font-mono text-xs text-muted-foreground">
                  version {latestSkillVersion.version} · {latestSkillVersion.contentHash}
                </p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={latestSkillVersion.status} />
                  {payoutAssessment ? <StatusBadge status={payoutAssessment.status} /> : null}
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  {detail.evaluationCount} evaluation{detail.evaluationCount === 1 ? "" : "s"} submitted · window closes{" "}
                  {new Date(latestSkillVersion.evaluationDeadline).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {payoutAssessment ? (
                  <p className="text-xs text-muted-foreground">{payoutAssessment.assessmentReason}</p>
                ) : null}
              </div>
            </AsciiBox>
          ) : null}

          <AsciiBox title="evaluation policy" className="mt-6">
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>Evaluators must submit evidence from actually trying the skill. Star ratings alone do not affect payout.</p>
              <p>A single negative review can open a dispute or hold payout, but cannot reduce or block payout by itself.</p>
              <p>Reduced or blocked payout requires independent, evidence-backed corroboration. Reputation updates only after final resolution.</p>
            </div>
          </AsciiBox>
        </div>

        <div className="lg:w-72 lg:shrink-0 lg:sticky lg:top-20 lg:self-start">
          <AsciiBox title="funding">
            <ProgressBar current={currentAmount} goal={fundingThreshold} />

            <div className="mt-4 space-y-1 text-sm font-mono text-muted-foreground">
              <p>{contributions.length} backers</p>
              <p>
                created{" "}
                {new Date(rfs._creationTime).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <RfsActions
              rfsId={rfs._id}
              status={rfs.status}
              canFund={detail.canFund}
              canClaim={detail.canClaim}
              canBuy={detail.canBuy}
              canEvaluate={detail.canEvaluate}
              canRevise={detail.canRevise}
              canClaimPayout={detail.canClaimPayout}
              skillId={skill?._id}
              hasSkill={Boolean(skill)}
              latestSkillVersion={
                latestSkillVersion
                  ? {
                      id: latestSkillVersion._id,
                      version: latestSkillVersion.version,
                      contentHash: latestSkillVersion.contentHash,
                      status: latestSkillVersion.status,
                      evaluationDeadline: latestSkillVersion.evaluationDeadline,
                    }
                  : undefined
              }
              payoutAssessment={payoutAssessment}
            />

            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-xs font-mono uppercase text-muted-foreground mb-2">
                backers
              </h3>
              {contributionsUnavailable ? (
                <SkeletonRows count={3} />
              ) : (
                contributions.slice(0, 3).map((c) => {
                  return (
                    <div key={c.id} className="flex justify-between font-mono text-sm">
                      <CopyId id={c.backerUserId} className="text-sm" />
                      <span>${baseUnitsToNumber(c.amountBaseUnits).toFixed(2)}</span>
                    </div>
                  )
                })
              )}
              {!contributionsUnavailable && contributions.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">
                  no backers yet
                </p>
              ) : null}
            </div>
          </AsciiBox>
        </div>
      </div>
    </div>
  )
}
