import type { PayoutAssessmentStatus, RFSStatus, SkillVersionStatus } from "@/lib/types"

type Status = RFSStatus | SkillVersionStatus | PayoutAssessmentStatus

const statusLabels: Record<Status, string> = {
  open: "open",
  funded: "funded",
  assigned: "assigned",
  submitted: "submitted",
  evaluation_open: "in review",
  accepted: "accepted",
  revision_requested: "revision",
  disputed: "disputed",
  rejected: "rejected",
  published: "published",
  cancelled: "cancelled",
  fulfilled: "fulfilled",
  draft: "draft",
  pending: "pending",
  claimable: "claimable",
  reduced: "reduced",
  blocked: "blocked",
  manually_resolved: "resolved",
  claimed: "claimed",
}

interface StatusBadgeProps {
  status: Status
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      {statusLabels[status]}
    </span>
  )
}
