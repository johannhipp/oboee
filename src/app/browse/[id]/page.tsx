import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { AsciiBox } from "@/components/ascii-box"
import { ProgressBar } from "@/components/progress-bar"
import { StatusBadge } from "@/components/status-badge"
import { RfsActions } from "@/components/rfs-actions"
import { CopyId } from "@/components/copy-id"
import { baseUnitsToNumber } from "@/lib/view-models"

export const dynamic = "force-dynamic"

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
    return { title: "Not found | Oboe" }
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const rfsId = id as Id<"rfs">

  let detail: Awaited<ReturnType<typeof fetchQuery<typeof api.skills.get>>>

  try {
    detail = await fetchQuery(api.skills.get, { rfsId })
  } catch {
    return (
      <div className="py-16 text-center text-muted-foreground font-mono text-sm">
        rfs not found
      </div>
    )
  }

  const contributions = await fetchQuery(api.rfs.listContributions, { rfsId })
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
  const displayStatus = rfs.status === "cancelled" ? "fulfilled" : rfs.status

  return (
    <div className="flex flex-col lg:flex-row gap-8 my-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-medium tracking-tight break-words">{rfs.title}</h1>
        <div className="mt-2">
          <StatusBadge status={displayStatus} />
        </div>
        <div className="text-sm font-mono mt-1 flex items-center gap-1">
          <span className="text-muted-foreground">by</span>
          <CopyId id={rfs.authorUserId} className="text-sm" />
        </div>

        <AsciiBox title="scope" className="mt-6">
          <p className="text-sm leading-relaxed break-words">{rfs.scope}</p>
          <p className="text-sm leading-relaxed mt-2 break-words">{rfs.description}</p>
        </AsciiBox>

        {(rfs.status === "published" || rfs.status === "fulfilled") &&
          skill && (
            <AsciiBox title="skill preview" className="mt-6">
              <p className="text-sm leading-relaxed break-words">
                {skill.contentMarkdown.slice(0, 200)}...
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                buy to read full skill
              </p>
            </AsciiBox>
          )}
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
            status={displayStatus}
            canFund={detail.canFund}
            canClaim={detail.canClaim}
            canBuy={detail.canBuy}
            skillId={skill?._id}
            hasSkill={Boolean(skill)}
          />

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-xs font-mono uppercase text-muted-foreground mb-2">
              backers
            </h3>
            {contributions.slice(0, 3).map((c) => {
              return (
                <div
                  key={c.id}
                  className="flex justify-between font-mono text-sm"
                >
                  <CopyId id={c.backerUserId} className="text-sm" />
                  <span>${baseUnitsToNumber(c.amountBaseUnits).toFixed(2)}</span>
                </div>
              )
            })}
            {contributions.length === 0 && (
              <p className="text-xs text-muted-foreground font-mono">
                no backers yet
              </p>
            )}
          </div>
        </AsciiBox>
      </div>
    </div>
  )
}
