import type { Id } from "../../convex/_generated/dataModel"
import type { RFS } from "./types"

const BASE_UNITS_SCALE = 1_000_000
const tokenAmountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: false,
})

export const baseUnitsToNumber = (value: bigint) => Number(value) / BASE_UNITS_SCALE

export const formatTokenAmount = (value: number) => tokenAmountFormatter.format(value)

export const numberToBaseUnitsString = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.round(value * BASE_UNITS_SCALE).toString()
}

type RfsDoc = {
  _id: Id<"rfs">
  _creationTime: number
  title: string
  description: string
  scope: string
  fundingThresholdBaseUnits: bigint
  currentAmountBaseUnits: bigint
  status: "open" | "funded" | "published"
  authorUserId: string
  claimantUserId?: string
}

export const toRfsViewModel = (rfs: RfsDoc): RFS => ({
  id: rfs._id,
  title: rfs.title,
  description: rfs.description,
  scope: rfs.scope,
  fundingThreshold: baseUnitsToNumber(rfs.fundingThresholdBaseUnits),
  currentAmount: baseUnitsToNumber(rfs.currentAmountBaseUnits),
  status: rfs.status,
  authorId: rfs.authorUserId,
  claimantId: rfs.claimantUserId ?? null,
  createdAt: new Date(rfs._creationTime).toISOString(),
  authorLabel: rfs.authorUserId.slice(0, 10),
})
