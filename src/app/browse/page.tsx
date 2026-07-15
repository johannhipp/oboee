import type { Metadata } from "next"
import Link from "next/link"
import { fetchQuery } from "convex/nextjs"
import { api } from "../../../convex/_generated/api"
import { MarketplaceRow } from "@/components/marketplace-row"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Browse | Oboe" }

const isStatus = (value: string | undefined) =>
  value === "open" || value === "funded" || value === "published"

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; cursor?: string }>
}) {
  const params = await searchParams
  const status = isStatus(params.status) ? params.status : undefined
  const marketplace = await fetchQuery(api.marketplace.list, {
    status,
    q: params.q,
    cursor: params.cursor,
    limit: 24,
  })

  const pills = [
    { label: "all", href: "/browse", active: !status },
    { label: "open", href: "/browse?status=open", active: status === "open" },
    { label: "funded", href: "/browse?status=funded", active: status === "funded" },
    {
      label: "published",
      href: "/browse?status=published",
      active: status === "published",
    },
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
        <span className="flex-1">title</span>
        <span className="w-20">status</span>
        <span className="hidden sm:block w-28 text-right">funded</span>
        <span className="hidden md:block w-24">author</span>
      </div>

      {marketplace.items.map((item) => (
        <MarketplaceRow key={item.itemId} item={item} />
      ))}
      {marketplace.nextCursor ? (
        <Link
          href={{
            pathname: "/browse",
            query: {
              ...(status ? { status } : {}),
              ...(params.q ? { q: params.q } : {}),
              cursor: marketplace.nextCursor,
            },
          }}
          className="mt-4 inline-block font-mono text-xs underline underline-offset-2"
        >
          next page
        </Link>
      ) : null}
    </section>
  )
}
