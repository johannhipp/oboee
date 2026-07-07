import type { PayoutAssessmentStatus, RFSStatus, SkillVersionStatus } from "@/lib/types"

type Status = RFSStatus | SkillVersionStatus | PayoutAssessmentStatus

const statusStyles: Record<Status, string> = {
  open: "text-gray-600 ring-1 ring-gray-300",
  funded: "text-emerald-700 ring-1 ring-emerald-300 bg-emerald-50",
  assigned: "text-cyan-700 ring-1 ring-cyan-300 bg-cyan-50",
  submitted: "text-blue-700 ring-1 ring-blue-300 bg-blue-50",
  evaluation_open: "text-blue-700 ring-1 ring-blue-300 bg-blue-50",
  accepted: "text-emerald-700 ring-1 ring-emerald-300 bg-emerald-50",
  revision_requested: "text-amber-700 ring-1 ring-amber-300 bg-amber-50",
  disputed: "text-orange-700 ring-1 ring-orange-300 bg-orange-50",
  rejected: "text-red-700 ring-1 ring-red-300 bg-red-50",
  published: "text-gray-900 ring-1 ring-gray-400 bg-gray-100",
  cancelled: "text-gray-500 ring-1 ring-gray-300 bg-gray-50",
  fulfilled: "text-blue-700 ring-1 ring-blue-300 bg-blue-50",
  draft: "text-gray-500 ring-1 ring-gray-300 bg-gray-50",
  pending: "text-blue-700 ring-1 ring-blue-300 bg-blue-50",
  claimable: "text-emerald-700 ring-1 ring-emerald-300 bg-emerald-50",
  reduced: "text-amber-700 ring-1 ring-amber-300 bg-amber-50",
  blocked: "text-red-700 ring-1 ring-red-300 bg-red-50",
  manually_resolved: "text-purple-700 ring-1 ring-purple-300 bg-purple-50",
  claimed: "text-gray-900 ring-1 ring-gray-400 bg-gray-100",
}

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
    <span
      className={`inline-flex text-[10px] font-mono font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  )
}
