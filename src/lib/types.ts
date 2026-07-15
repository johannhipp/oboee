export type RFSStatus = "open" | "funded" | "fulfilled" | "published"

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
