import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { MarketplaceRow } from "@/components/marketplace-row";
import { convexUnavailableMessage } from "@/lib/auth-server";
import { searchHandoff } from "@/lib/handoff";
import { buildCatalogReadModel, buildPublicRfsListReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Browse | Oboe", alternates: { canonical: "/browse" } };

type Search = { q?: string; status?: string; tag?: string | string[]; author?: string; cursor?: string };

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const tags = Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : [];
  let unavailable = false;
  let skills: ReturnType<typeof buildCatalogReadModel> = { items: [], nextCursor: null };
  let requests: ReturnType<typeof buildPublicRfsListReadModel> = [];
  try {
    const [catalog, rfs] = await Promise.all([
      fetchQuery(anyApi.reputation.catalog, { authorHandle: params.author, tags, cursor: params.cursor, limit: 30 }),
      fetchQuery(anyApi.rfsV2.listPublic, { status: params.status || undefined, limit: 50 }),
    ]);
    skills = buildCatalogReadModel(catalog);
    requests = buildPublicRfsListReadModel(rfs);
  } catch {
    unavailable = true;
  }
  const query = params.q?.trim().toLowerCase();
  const visibleRequests = requests.filter((item) => !query || `${item.title} ${item.description} ${item.scope} ${item.tags.join(" ")}`.toLowerCase().includes(query));

  return (
    <section className="mx-auto max-w-4xl py-8">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-medium">Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ranked published skills and criteria-bound requests.</p>
        </div>
        <Link href="/new" className="font-mono text-sm underline underline-offset-4">new request</Link>
      </div>
      {unavailable ? <DataToast message={convexUnavailableMessage()} /> : null}
      <form action="/browse" className="grid gap-3 border-b border-border py-4 sm:grid-cols-[1fr_10rem_10rem_auto]">
        <label className="grid gap-1 text-xs font-mono text-muted-foreground">Search<input name="q" defaultValue={params.q} className="h-9 border border-border bg-white px-3 text-sm text-foreground" /></label>
        <label className="grid gap-1 text-xs font-mono text-muted-foreground">Status<select name="status" defaultValue={params.status ?? ""} className="h-9 border border-border bg-white px-2 text-sm text-foreground"><option value="">all requests</option><option value="open">open</option><option value="funded">funded</option><option value="evaluation_open">evaluating</option><option value="disputed">disputed</option></select></label>
        <label className="grid gap-1 text-xs font-mono text-muted-foreground">Tag<input name="tag" defaultValue={tags[0]} className="h-9 border border-border bg-white px-3 text-sm text-foreground" /></label>
        <button className="self-end h-9 border border-foreground px-4 font-mono text-sm">filter</button>
      </form>

      <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Open work</h2>
          {visibleRequests.map((item) => <MarketplaceRow key={item.id} item={{ id: item.id, kind: "rfs", title: item.title, status: item.status, tags: item.tags, amount: item.totalFundingTargetBaseUnits }} />)}
          {!unavailable && visibleRequests.length === 0 ? <p className="border-b border-border py-6 text-sm text-muted-foreground">No matching requests.</p> : null}

          <h2 className="mb-2 mt-8 font-mono text-xs uppercase text-muted-foreground">Published skills</h2>
          {skills.items.map((item) => <MarketplaceRow key={item.id} item={{ id: item.id, kind: "skill", title: item.category, status: item.quarantineState, tags: item.tags, authorHandle: item.authorHandle, scoreBps: item.totalBps, confidence: item.confidence }} />)}
          {!unavailable && skills.items.length === 0 ? <p className="border-b border-border py-6 text-sm text-muted-foreground">No matching published skills.</p> : null}
          {skills.nextCursor ? <Link className="mt-4 inline-block font-mono text-sm underline" href={{ pathname: "/browse", query: { ...params, cursor: skills.nextCursor } }}>next page</Link> : null}
        </div>
        <aside>
          <h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Send search to agent</h2>
          <CopyBox text={searchHandoff({ q: params.q, status: params.status, tags, author: params.author })} />
        </aside>
      </div>
    </section>
  );
}
