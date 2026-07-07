import type { Metadata } from "next"
import Link from "next/link"
import { fetchQuery } from "convex/nextjs"
import { api } from "../../../convex/_generated/api"
import { RFSRow } from "@/components/rfs-row"
import { toRfsViewModel } from "@/lib/view-models"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Browse | Oboe" }

const statusOrder = [
  "open",
  "funded",
  "assigned",
  "evaluation_open",
  "disputed",
  "revision_requested",
  "published",
  "rejected",
  "cancelled",
] as const

const isStatus = (value: string | undefined): value is (typeof statusOrder)[number] =>
  statusOrder.some((status) => status === value)

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const status = isStatus(params.status) ? params.status : undefined
  const q = params.q?.trim().toLowerCase() ?? ""

  const rows = await fetchQuery(api.rfs.list, { status })
  const filtered = rows.filter((rfs) => {
    if (!q) {
      return true
    }
    return [rfs.title, rfs.description, rfs.scope, ...rfs.tags]
      .join(" ")
      .toLowerCase()
      .includes(q)
  })

  const sortedRfs = filtered
    .map(toRfsViewModel)
    .sort((a, b) => {
      const aIdx = statusOrder.indexOf(a.status as (typeof statusOrder)[number])
      const bIdx = statusOrder.indexOf(b.status as (typeof statusOrder)[number])
      if (aIdx !== bIdx) return (aIdx === -1 ? statusOrder.length : aIdx) - (bIdx === -1 ? statusOrder.length : bIdx)
      if (a.status === "open" && b.status === "open") {
        const aRatio = a.fundingThreshold > 0 ? a.currentAmount / a.fundingThreshold : 0
        const bRatio = b.fundingThreshold > 0 ? b.currentAmount / b.fundingThreshold : 0
        return bRatio - aRatio
      }
      return 0
    })

  const pills = [
    { label: "all", href: "/browse", active: !status },
    { label: "open", href: "/browse?status=open", active: status === "open" },
    { label: "funded", href: "/browse?status=funded", active: status === "funded" },
    { label: "in review", href: "/browse?status=evaluation_open", active: status === "evaluation_open" },
    { label: "disputed", href: "/browse?status=disputed", active: status === "disputed" },
    { label: "revision", href: "/browse?status=revision_requested", active: status === "revision_requested" },
    { label: "published", href: "/browse?status=published", active: status === "published" },
  ]

  return (
    <section>
      <h1 className="text-xl font-medium tracking-tight mb-6 mt-8">Browse</h1>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {pills.map((pill) => (
          <Link
            key={pill.label}
            href={pill.href}
            className={
              pill.active
                ? "font-mono text-xs px-2.5 py-1 rounded-full bg-gray-900 text-white"
                : "font-mono text-xs px-2.5 py-1 rounded-full text-muted-foreground ring-1 ring-gray-200 hover:ring-gray-300"
            }
          >
            {pill.label}
          </Link>
        ))}
        <form action="/browse" method="get" className="w-full max-w-sm">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            type="text"
            placeholder="search skills and requests..."
            className="bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 font-mono text-sm placeholder:text-gray-400 w-full"
          />
        </form>
      </div>

      <div className="flex items-center gap-4 px-3 py-2 text-xs font-mono uppercase text-muted-foreground border-b border-gray-200 mb-1">
        <span className="w-6 text-right">#</span>
        <span className="flex-1">title</span>
        <span className="w-28">status</span>
        <span className="w-28 text-right">funded</span>
        <span className="w-24">author</span>
      </div>

      {sortedRfs.map((rfs, i) => (
        <RFSRow key={rfs.id} rfs={rfs} rank={i + 1} />
      ))}
    </section>
  )
}
