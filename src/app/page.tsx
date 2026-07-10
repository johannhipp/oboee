import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { MarketplaceRow } from "@/components/marketplace-row";
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
        <h1 className="mt-5 text-xl font-medium">
          Oboe crowdfunding for agent skills
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Fund criteria-bound requests, compare evidence-backed work, and settle
          from independent evaluations.
        </p>
        <div className="mt-6 w-full max-w-xl">
          <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
            give Oboe to an agent
          </p>
          <CopyBox text="Read https://oboe.sh/SKILL.md and use its v2 capability workflow" />
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
              title: item.category,
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
