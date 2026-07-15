import type { Id } from "../../convex/_generated/dataModel"
import type { RFS } from "./types"

const BASE_UNITS_SCALE = 1_000_000

export const baseUnitsToNumber = (value: bigint) => Number(value) / BASE_UNITS_SCALE

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
  status: "open" | "funded" | "fulfilled" | "published" | "cancelled"
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
  status: rfs.status === "cancelled" ? "fulfilled" : rfs.status,
  authorId: rfs.authorUserId,
  claimantId: rfs.claimantUserId ?? null,
  createdAt: new Date(rfs._creationTime).toISOString(),
  authorLabel: rfs.authorUserId.slice(0, 10),
})
