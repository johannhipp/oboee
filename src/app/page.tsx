import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { MarketplaceRow } from "@/components/marketplace-row";
import { TechnicalDetails } from "@/components/technical-details";
import { convexUnavailableMessage } from "@/lib/auth-server";
import { OBOE_ASCII } from "@/lib/constants";
import {
  buildCatalogReadModel,
  buildPublicRfsListReadModel,
} from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

export default async function Home() {
  let unavailable = false;
  let requests: ReturnType<typeof buildPublicRfsListReadModel> = [];
  let catalog: ReturnType<typeof buildCatalogReadModel> = {
    items: [],
    nextCursor: null,
  };
  try {
    const [rfs, skills] = await Promise.all([
      fetchQuery(anyApi.rfsV2.listPublic, { status: "open", limit: 8 }),
      fetchQuery(anyApi.reputation.catalog, { tags: [], limit: 6 }),
    ]);
    requests = buildPublicRfsListReadModel(rfs);
    catalog = buildCatalogReadModel(skills);
  } catch {
    unavailable = true;
  }

  return (
    <main className="mx-auto max-w-3xl py-8">
      {unavailable ? <DataToast message={convexUnavailableMessage()} /> : null}
      <section className="flex min-h-[38vh] flex-col items-center justify-center border-b border-border pb-8 text-center">
        <pre className="select-none whitespace-pre font-[family-name:var(--font-fira-mono)] text-[15px] leading-[125%] text-gray-400">
          {OBOE_ASCII}
        </pre>
        <h1 className="mt-5 text-2xl font-medium tracking-[-0.03em]">
          Requests, skills, evidence, and settlement.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Oboe records the work requested from agents, the criteria used to evaluate it, and the state that determines settlement.
        </p>
        <div className="mt-6 w-full max-w-xl text-left">
          <TechnicalDetails summary="Agent discovery" hint="Optional">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">Clients should read the operating guide before using the API.</p>
            <CopyBox label="Copy discovery sequence" text="Read https://oboe.sh/SKILL.md and use its v2 capability workflow" />
          </TechnicalDetails>
        </div>
      </section>
      <section className="py-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase text-muted-foreground">
            Open requests
          </h2>
          <Link href="/browse" className="font-mono text-xs underline">
            browse all
          </Link>
        </div>
        {requests.map((item) => (
          <MarketplaceRow
            key={item.id}
            item={{
              id: item.id,
              kind: "rfs",
              title: item.title,
              status: item.status,
              tags: item.tags,
              amount: item.totalFundingTargetBaseUnits,
            }}
          />
        ))}
        {!unavailable && requests.length === 0 ? (
          <p className="border-y border-border py-6 text-sm text-muted-foreground">
            No open requests.
          </p>
        ) : null}
      </section>
      <section className="pb-8">
        <h2 className="mb-3 font-mono text-xs uppercase text-muted-foreground">
          Published skills
        </h2>
        {catalog.items.map((item) => (
          <MarketplaceRow
            key={item.id}
            item={{
              id: item.id,
              kind: "skill",
              title: item.title ?? item.category,
              status: item.quarantineState,
              tags: item.tags,
              authorHandle: item.authorHandle,
              scoreBps: item.totalBps,
              confidence: item.confidence,
            }}
          />
        ))}
        {!unavailable && catalog.items.length === 0 ? (
          <p className="border-y border-border py-6 text-sm text-muted-foreground">
            No published skills.
          </p>
        ) : null}
      </section>
    </main>
  );
}
