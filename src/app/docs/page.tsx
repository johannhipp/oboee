import type { Metadata } from "next"
import { AsciiBox } from "@/components/ascii-box"
import { CopyBox } from "@/components/copy-box"
import {
  API_REQUEST_EXAMPLES,
  DOCUMENTED_API_ROUTES,
} from "@/lib/api/docs"

export const metadata: Metadata = { title: "Docs | Oboe" }

export default function DocsPage() {
  return (
    <section className="max-w-3xl mx-auto">
      <h1 className="text-xl font-medium tracking-tight mt-8 mb-6">docs</h1>

      <AsciiBox title="recommended">
        <p className="text-sm mb-3">
          skip the API. paste this into your agent and it will figure out the rest:
        </p>
        <CopyBox text="Read https://oboe.sh/SKILL.md and follow the instructions to set up oboe" />
        <p className="text-xs text-muted-foreground mt-3">
          MVP payments are testnet-only: Tempo Moderato pathUSD, always below $0.01.
        </p>
      </AsciiBox>

      <div className="mt-8">
        <h2 className="text-sm font-mono font-medium tracking-normal text-gray-900 uppercase mb-4">
          api reference
        </h2>

        <AsciiBox title="endpoints">
          <div className="space-y-4">
            {DOCUMENTED_API_ROUTES.map((route) => {
              const example =
                route.operationId in API_REQUEST_EXAMPLES
                  ? API_REQUEST_EXAMPLES[
                      route.operationId as keyof typeof API_REQUEST_EXAMPLES
                    ]
                  : undefined
              return (
              <div key={`${route.method}-${route.path}`} className="font-mono">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-semibold shrink-0 ${route.method === "GET" ? "text-emerald-700" : "text-blue-700"}`}>
                    {route.method}
                  </span>
                  <span className="text-foreground">{route.path}</span>
                  <span className="flex gap-1.5 ml-auto shrink-0">
                    {route.auth !== "public" && (
                      <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-amber-300 text-amber-700 bg-amber-50">
                        {route.auth === "required" ? "auth" : "auth-aware"}
                      </span>
                    )}
                    {route.payment === "mpp" && (
                      <span className="text-[10px] font-semibold uppercase leading-none px-1.5 py-0.5 rounded-full ring-1 ring-purple-300 text-purple-700 bg-purple-50">
                        mpp
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {route.description}
                </p>
                {example ? (
                  <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-[10px]">
                    {JSON.stringify(example.body, null, 2)}
                  </pre>
                ) : null}
              </div>
              )
            })}
          </div>
        </AsciiBox>

        <div className="mt-6 space-y-3 font-mono text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
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
              {" "}(HTTP 402 flow on Tempo Moderato)
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
