export type RFSStatus =
  | "open"
  | "funded"
  | "assigned"
  | "submitted"
  | "evaluation_open"
  | "accepted"
  | "revision_requested"
  | "disputed"
  | "rejected"
  | "published"
  | "cancelled"
  | "fulfilled"

export type SkillVersionStatus =
  | "draft"
  | "submitted"
  | "evaluation_open"
  | "accepted"
  | "revision_requested"
  | "disputed"
  | "rejected"
  | "published"

export type PayoutAssessmentStatus =
  | "pending"
  | "claimable"
  | "reduced"
  | "blocked"
  | "disputed"
  | "manually_resolved"
  | "claimed"

export interface User {
  id: string
  name: string
  walletAddress: string | null
}

export interface RFS {
  id: string
  title: string
  description: string
  scope: string
  fundingThreshold: number
  currentAmount: number
  status: RFSStatus
  authorId: string
  claimantId: string | null
  createdAt: string
  authorLabel?: string
}

export interface Contribution {
  id: string
  userId: string
  rfsId: string
  amount: number
  createdAt: string
}

export interface Skill {
  id: string
  rfsId: string
  title: string
  content: string
  createdAt: string
}

export interface Purchase {
  id: string
  userId: string
  skillId: string
  amount: number
  createdAt: string
}
