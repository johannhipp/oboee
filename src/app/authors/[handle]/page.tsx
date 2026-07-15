import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { TechnicalDetails } from "@/components/technical-details";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicAuthorReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
const formatSourceType = (value: string) => value.replaceAll("_", " ");

const SectionHeading = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-4 border-b border-border pb-3">
    <h2 className="text-base font-medium">{title}</h2>
    {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
  </div>
);

const load = async (handle: string) => {
  try {
    const result = await fetchQuery(anyApi.reputation.publicAuthor, { handle });
    return result ? buildPublicAuthorReadModel(result) : null;
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const author = await load(handle);
  return { title: `${author?.displayName ?? handle} | Oboe`, alternates: { canonical: `/authors/${handle}` } };
}

export default async function AuthorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const author = await load(handle);
  if (!author) return <main className="mx-auto max-w-5xl py-10 text-sm text-muted-foreground">Public author profile not found.</main>;

  return (
    <main className="mx-auto max-w-5xl py-8 sm:py-10">
      <Link href="/browse" className="font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← Marketplace</Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
        <article className="min-w-0">
          <header className="border-b border-border pb-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Author profile</p>
            <h1 className="mt-2 break-words text-2xl font-medium tracking-tight sm:text-3xl">{author.displayName}</h1>
            <p className="mt-2 font-mono text-xs text-muted-foreground">@{author.handle}</p>
            {author.bio ? <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6">{author.bio}</p> : null}
            {author.links.length > 0 ? <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs">{author.links.map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-4">{link.replace(/^https?:\/\//, "")}</a></li>)}</ul> : null}
          </header>

          <section className="mt-8" aria-labelledby="reputation-heading">
            <SectionHeading title="Reputation" description="Scores are grouped by topic and derived from finalized outcomes." />
            <div className="divide-y divide-border border-y border-border">
              {author.reputation.map((row) => <article key={row.tag} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"><div><h3 className="font-medium">#{row.tag}</h3><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground"><span>{row.confidence} confidence</span><span>{row.independentCount} independent outcomes</span></div></div><span className="font-mono text-sm tabular-nums">{row.adjustedScore.toFixed(1)} / 5</span></article>)}
            </div>
            {author.reputation.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No finalized reputation evidence yet.</p> : null}
          </section>

          <section className="mt-8" aria-labelledby="sources-heading">
            <SectionHeading title="Source events" description="Finalized events contributing to the public reputation signal." />
            <div className="divide-y divide-border border-y border-border">
              {author.sourceSummaries.map((source) => <article key={`${source.sourceType}:${source.sourceId}:${source.tag}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="text-sm">{formatSourceType(source.sourceType)} · #{source.tag}</p><p className="mt-1 text-xs text-muted-foreground">{source.signalStrengthClass} signal · {source.ageDays} days old</p></div><p className="font-mono text-xs tabular-nums sm:text-right">score {source.score.toFixed(1)}</p></article>)}
            </div>
            {author.sourceSummaries.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No finalized sources yet.</p> : null}
          </section>

          <section className="mt-8" aria-labelledby="skills-heading">
            <SectionHeading title="Published skills" description="Published resources associated with this author." />
            <div className="divide-y divide-border border-y border-border">
              {author.publishedSkills.map((skill) => <Link key={skill.skillId} href={`/browse/${skill.skillId}`} className="block py-4 transition-colors hover:text-muted-foreground"><span className="block text-sm font-medium underline-offset-4 hover:underline">{skill.summary}</span><span className="mt-2 block font-mono text-[11px] text-muted-foreground">{skill.tags.map((tag) => `#${tag}`).join(" ")}</span></Link>)}
            </div>
            {author.publishedSkills.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No published skills.</p> : null}
          </section>

          <TechnicalDetails summary="Evidence details" hint="IDs and timestamps" className="mt-8">
            <div className="divide-y divide-border">
              {author.sourceSummaries.map((source) => <div key={`${source.finalDecisionId}:${source.sourceId}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_1fr]"><span className="font-mono text-xs text-muted-foreground">{formatSourceType(source.sourceType)}</span><div><code className="block break-all text-xs">source · {source.sourceId}</code><code className="mt-1 block break-all text-xs">decision · {source.finalDecisionId}</code><p className="mt-1 text-xs text-muted-foreground">occurred {formatDate(source.occurredAt)}</p></div></div>)}
            </div>
          </TechnicalDetails>
        </article>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <TechnicalDetails summary="Machine reference" hint="Profile locator">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">Copy the profile locator for a client that needs the machine reference.</p>
            <CopyBox label="Copy author handoff" text={resourceHandoff({ kind: "author", id: author.handle })} />
          </TechnicalDetails>
        </aside>
      </div>
    </main>
  );
}
