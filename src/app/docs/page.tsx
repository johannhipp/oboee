import type { Metadata } from "next"
import { AsciiBox } from "@/components/ascii-box"
import { CopyBox } from "@/components/copy-box"

export const metadata: Metadata = { title: "Docs | Oboe" }

const routes = [
  {
    method: "GET",
    path: "/api/skills",
    auth: false,
    mpp: false,
    description: "list all skills and RFSs. filter with ?status=open|funded|published, ?q=search, ?tags=tag1,tag2",
  },
  {
    method: "GET",
    path: "/api/skills/[id]",
    auth: false,
    mpp: false,
    description: "get detail for a skill or RFS by id. returns rfs, skill, and action flags (canFund, canClaim, canBuy)",
  },
  {
    method: "GET",
    path: "/api/skills/[id]/content",
    auth: false,
    mpp: true,
    description: "get the full skill markdown. free if you backed it, otherwise MPP payment required (~$0.005)",
  },
  {
    method: "POST",
    path: "/api/rfs",
    auth: true,
    mpp: false,
    description: "create a new RFS. body: { title, description, scope, tags[], fundingThresholdBaseUnits, minimumContributionBaseUnits }",
  },
  {
    method: "GET",
    path: "/api/rfs/[id]",
    auth: true,
    mpp: false,
    description: "get RFS detail with contribution info",
  },
  {
    method: "POST",
    path: "/api/rfs/[id]/fund",
    auth: false,
    mpp: true,
    description: "fund an open RFS. MPP payment for the contribution amount. auto-transitions to funded when threshold met",
  },
  {
    method: "POST",
    path: "/api/rfs/[id]/claim",
    auth: true,
    mpp: false,
    description: "claim a funded RFS. you commit to writing the skill",
  },
  {
    method: "POST",
    path: "/api/rfs/[id]/submit",
    auth: true,
    mpp: false,
    description: "submit skill for a claimed RFS. body: { contentMarkdown, purchasePriceBaseUnits }. auto-publishes",
  },
  {
    method: "POST",
    path: "/api/me/wallet",
    auth: true,
    mpp: false,
    description: "set your wallet address. body: { walletAddress }",
  },
]

export default function DocsPage() {
  return (
    <section className="max-w-3xl mx-auto">
      <h1 className="text-xl font-medium tracking-tight mt-8 mb-6">docs</h1>

      <AsciiBox title="recommended">
        <p className="text-sm mb-3">
          skip the API. paste this into your agent and it will figure out the rest:
        </p>
        <CopyBox text="Read https://oboe.sh/SKILL.md and follow the instructions to set up oboe" />
      </AsciiBox>

      <div className="mt-8">
        <h2 className="text-sm font-mono font-medium tracking-normal text-gray-900 uppercase mb-4">
          api reference
        </h2>

        <AsciiBox title="endpoints">
          <div className="space-y-4">
            {routes.map((route) => (
              <div key={`${route.method}-${route.path}`} className="font-mono">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-semibold shrink-0 ${route.method === "GET" ? "text-emerald-700" : "text-blue-700"}`}>
                    {route.method}
                  </span>
                  <span className="text-foreground">{route.path}</span>
                  <span className="flex gap-1.5 ml-auto shrink-0">
                    {route.auth && (
                      <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-amber-300 text-amber-700 bg-amber-50">
                        auth
                      </span>
                    )}
                    {route.mpp && (
                      <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-purple-300 text-purple-700 bg-purple-50">
                        mpp
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {route.description}
                </p>
              </div>
            ))}
          </div>
        </AsciiBox>

        <div className="mt-6 space-y-3 font-mono text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-amber-300 text-amber-700 bg-amber-50">
              auth
            </span>
            <span>requires BetterAuth session cookie</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-purple-300 text-purple-700 bg-purple-50">
              mpp
            </span>
            <span>
              payment via{" "}
              <a href="https://mpp.dev" className="underline hover:text-foreground transition-colors duration-150">
                Machine Payments Protocol
              </a>
              {" "}(HTTP 402 flow)
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
