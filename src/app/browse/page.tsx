import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { MarketplaceRow } from "@/components/marketplace-row";
import { TechnicalDetails } from "@/components/technical-details";
import { convexUnavailableMessage } from "@/lib/auth-server";
import { searchHandoff } from "@/lib/handoff";
import { buildCatalogReadModel, buildPublicRfsListReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Browse | Oboe", alternates: { canonical: "/browse" } };

type Search = { q?: string; status?: string; tag?: string | string[]; author?: string; cursor?: string };

const inputClass = "h-10 w-full border-0 border-b border-border bg-transparent px-0 text-sm text-foreground outline-none transition-colors focus:border-foreground";

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
  const matchesQuery = (value: string) => !query || value.toLowerCase().includes(query);
  const visibleRequests = requests.filter((item) =>
    matchesQuery(`${item.title} ${item.description} ${item.scope} ${item.tags.join(" ")}`) &&
    (tags.length === 0 || tags.every((tag) => item.tags.includes(tag))),
  );
  const visibleSkills = skills.items.filter((item) => matchesQuery(`${item.title ?? item.category} ${item.summary ?? ""} ${item.authorHandle} ${item.tags.join(" ")}`));

  return (
    <main className="mx-auto max-w-5xl py-10 sm:py-12">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Catalog</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight">Marketplace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Active requests and published skill versions with their current state.
          </p>
        </div>
        <Link href="/new" className="w-fit font-mono text-xs underline underline-offset-4 hover:no-underline">
          create a request
        </Link>
      </header>

      {unavailable ? <DataToast message={convexUnavailableMessage()} /> : null}

      <form action="/browse" className="grid gap-3 border-b border-border py-5 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto] lg:items-end">
        <label className="grid gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          Search the catalog
          <input name="q" defaultValue={params.q} className={inputClass} />
        </label>
        <label className="grid gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          Request stage
          <select name="status" defaultValue={params.status ?? ""} className={`${inputClass} px-2`}>
            <option value="">all requests</option>
            <option value="open">open</option>
            <option value="funded">funded</option>
            <option value="evaluation_open">in review</option>
            <option value="disputed">disputed</option>
          </select>
        </label>
        <label className="grid gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          Topic
          <input name="tag" defaultValue={tags[0]} className={inputClass} />
        </label>
          <button className="h-10 border-b border-foreground px-1 font-mono text-xs transition-colors hover:text-muted-foreground">
          Search
        </button>
      </form>

      <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12">
        <div className="min-w-0">
          <section aria-labelledby="requests-heading">
            <div className="mb-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="requests-heading" className="font-mono text-xs uppercase tracking-wide">Requests</h2>
                <span className="font-mono text-[10px] text-muted-foreground">{visibleRequests.length} shown</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Requests with a scope, acceptance criteria, and funding state.</p>
            </div>
            {visibleRequests.map((item) => <MarketplaceRow key={item.id} item={{ id: item.id, kind: "rfs", title: item.title, status: item.status, tags: item.tags, amount: item.totalFundingTargetBaseUnits }} />)}
            {!unavailable && visibleRequests.length === 0 ? <p className="border-y border-border py-6 text-sm text-muted-foreground">No matching requests.</p> : null}
          </section>

          <section aria-labelledby="skills-heading" className="mt-10">
            <div className="mb-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="skills-heading" className="font-mono text-xs uppercase tracking-wide">Published skills</h2>
                <span className="font-mono text-[10px] text-muted-foreground">{visibleSkills.length} shown</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Published versions with quality and adoption signals.</p>
            </div>
            {visibleSkills.map((item) => <MarketplaceRow key={item.id} item={{ id: item.id, kind: "skill", title: item.title ?? item.category, status: item.quarantineState, tags: item.tags, authorHandle: item.authorHandle, scoreBps: item.totalBps, confidence: item.confidence }} />)}
            {!unavailable && visibleSkills.length === 0 ? <p className="border-y border-border py-6 text-sm text-muted-foreground">No matching published skills.</p> : null}
            {skills.nextCursor ? <Link className="mt-4 inline-block font-mono text-xs underline underline-offset-4" href={{ pathname: "/browse", query: { ...params, cursor: skills.nextCursor } }}>next page</Link> : null}
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <TechnicalDetails summary="Machine reference" hint="For clients">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">
              Copy the machine-readable locator for this search when a client needs it.
            </p>
            <CopyBox label="Copy search handoff" text={searchHandoff({ q: params.q, status: params.status, tags, author: params.author })} />
          </TechnicalDetails>
        </aside>
      </div>
    </main>
  );
}
