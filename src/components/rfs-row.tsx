import Link from "next/link"
import type { RFS } from "@/lib/types"
import { StatusBadge } from "./status-badge"
import { CopyId } from "./copy-id"

interface RFSRowProps {
  rfs: RFS
  rank?: number
}

export function RFSRow({ rfs, rank }: RFSRowProps) {
  return (
    <Link
      href={`/browse/${rfs.id}`}
      className="flex min-w-0 items-center gap-4 border-b border-border py-3 transition-colors duration-150 hover:text-muted-foreground"
    >
      {rank !== undefined && (
        <span className="w-6 text-right font-mono text-sm text-muted-foreground tabular-nums">
          {rank}
        </span>
      )}
      <span className="flex-1 font-medium text-sm truncate min-w-0">{rfs.title}</span>
      <span className="w-28 shrink-0">
        <StatusBadge status={rfs.status} />
      </span>
      <span className="w-28 text-right font-mono text-xs text-muted-foreground shrink-0">
        ${rfs.currentAmount} / ${rfs.fundingThreshold}
      </span>
      <span className="w-24 shrink-0">
        {rfs.authorLabel ? (
          <span className="text-xs text-muted-foreground">{rfs.authorLabel}</span>
        ) : (
          <CopyId id={rfs.authorId} className="text-xs" />
        )}
      </span>
    </Link>
  )
}
