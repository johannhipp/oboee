import Link from "next/link"
import type { RFS } from "@/lib/types"
import { StatusBadge } from "./status-badge"
import { CopyId } from "./copy-id"
import { formatTokenAmount } from "@/lib/view-models"

interface RFSRowProps {
  rfs: RFS
}

export function RFSRow({ rfs }: RFSRowProps) {
  return (
    <Link
      href={`/browse/${rfs.id}`}
      className="flex items-center gap-4 px-3 py-2.5 hover:bg-gray-50 transition-colors duration-150 rounded-md overflow-hidden min-w-0"
    >
      <span className="flex-1 font-medium text-sm truncate min-w-0">{rfs.title}</span>
      <StatusBadge status={rfs.status} />
      <span className="hidden sm:block w-28 text-right font-mono text-xs text-muted-foreground shrink-0">
        ${formatTokenAmount(rfs.currentAmount)} / ${formatTokenAmount(rfs.fundingThreshold)}
      </span>
      <span className="hidden md:block w-24 shrink-0">
        {rfs.authorLabel ? (
          <span className="text-xs text-muted-foreground">{rfs.authorLabel}</span>
        ) : (
          <CopyId id={rfs.authorId} className="text-xs" />
        )}
      </span>
    </Link>
  )
}
