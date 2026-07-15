import type { RFSStatus } from "@/lib/types"

const statusStyles: Record<RFSStatus, string> = {
  open: "text-gray-600 ring-1 ring-gray-300",
  funded: "text-emerald-700 ring-1 ring-emerald-300 bg-emerald-50",
  fulfilled: "text-blue-700 ring-1 ring-blue-300 bg-blue-50",
  published: "text-gray-900 ring-1 ring-gray-400 bg-gray-100",
}

interface StatusBadgeProps {
  status: RFSStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex text-[10px] font-mono font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}
