import { OBOE_ASCII } from "@/lib/constants"
import { fetchQuery } from "convex/nextjs"
import { api } from "../../convex/_generated/api"
import { RFSRow } from "@/components/rfs-row"
import { AsciiBox } from "@/components/ascii-box"
import { CopyBox } from "@/components/copy-box"
import { DataToast, SkeletonRows } from "@/components/data-fallback"
import { toRfsViewModel } from "@/lib/view-models"
import { convexUnavailableMessage } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export default async function Home() {
  let dataUnavailable = false
  let openRows: Awaited<typeof api.rfs.list._returnType> = []
  let publishedRows: Awaited<typeof api.rfs.list._returnType> = []

  try {
    ;[openRows, publishedRows] = await Promise.all([
      fetchQuery(api.rfs.list, { status: "open" }),
      fetchQuery(api.rfs.list, { status: "published" }),
    ])
  } catch {
    dataUnavailable = true
  }

  const openRequests = openRows.map(toRfsViewModel)
  const recentlyPublished = publishedRows.map(toRfsViewModel).slice(0, 4)

  return (
    <main className="my-8 max-w-2xl mx-auto">
      {dataUnavailable ? <DataToast message={convexUnavailableMessage()} /> : null}

      <div className="flex flex-col items-center text-center">
        <pre className="text-[15px] tracking-[-1px] leading-[125%] text-gray-400 select-none whitespace-pre font-[family-name:var(--font-fira-mono)]">
          {OBOE_ASCII}
        </pre>
        <p className="text-[19px] tracking-tight text-gray-900 font-mono font-medium uppercase mt-6">
          Crowdfunded agent skills
        </p>
        <div className="mt-8 space-y-1.5">
          <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wide">
            paste this into your agent
          </p>
          <CopyBox text="Read https://oboe.sh/SKILL.md and follow the instructions to set up oboe" />
          <a href="https://mpp.dev" className="inline-block text-[10px] font-mono text-muted-foreground underline hover:text-foreground transition-colors duration-150 pt-0.5">
            learn more about MPP by Tempo
          </a>
        </div>
      </div>

      <div className="mt-16">
        <h2 className="text-sm font-mono font-medium tracking-normal text-gray-900 uppercase mb-4">
          open requests
        </h2>
        <AsciiBox title="open">
          {dataUnavailable ? (
            <SkeletonRows count={4} />
          ) : (
            openRequests.map((rfs, i) => <RFSRow key={rfs.id} rfs={rfs} rank={i + 1} />)
          )}
        </AsciiBox>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-mono font-medium tracking-normal text-gray-900 uppercase mb-4">
          recently published
        </h2>
        <AsciiBox title="published">
          {dataUnavailable ? (
            <SkeletonRows count={4} />
          ) : (
            recentlyPublished.map((rfs) => <RFSRow key={rfs.id} rfs={rfs} />)
          )}
        </AsciiBox>
      </div>
    </main>
  )
}
