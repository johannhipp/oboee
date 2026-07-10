import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicAuthorReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

const load = async (handle: string) => {
  try { const result = await fetchQuery(anyApi.reputation.publicAuthor, { handle }); return result ? buildPublicAuthorReadModel(result) : null; } catch { return null; }
};

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const author = await load(handle);
  return { title: `${author?.displayName ?? handle} | Oboe`, alternates: { canonical: `/authors/${handle}` } };
}

export default async function AuthorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const author = await load(handle);
  if (!author) return <main className="mx-auto max-w-4xl py-10 text-sm text-muted-foreground">Public author profile not found.</main>;
  return <main className="mx-auto max-w-4xl py-8"><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]"><div><span className="font-mono text-xs text-muted-foreground">@{author.handle}</span><h1 className="mt-1 text-2xl font-medium">{author.displayName}</h1>{author.bio ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{author.bio}</p> : null}<h2 className="mt-8 border-b border-border pb-2 font-medium">Tag reputation</h2><div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="font-mono text-xs text-muted-foreground"><tr><th className="py-2">tag</th><th>score</th><th>confidence</th><th>independent outcomes</th><th>updated</th></tr></thead><tbody>{author.reputation.map((row) => <tr key={row.tag} className="border-t border-border"><td className="py-3">{row.tag}</td><td>{row.adjustedScore.toFixed(3)}</td><td>{row.confidence}</td><td>{row.independentCount}</td><td>{new Date(row.computedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>{author.reputation.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No finalized reputation evidence yet.</p> : null}<h2 className="mt-8 border-b border-border pb-2 font-medium">Finalized sources</h2><div className="divide-y divide-border">{author.sourceSummaries.map((source) => <article key={`${source.sourceType}:${source.sourceId}:${source.tag}`} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm">{source.sourceType.replaceAll("_", " ")} · #{source.tag}</p><p className="font-mono text-xs text-muted-foreground break-all">{source.sourceId}</p></div><p className="font-mono text-xs sm:text-right">score {source.score.toFixed(1)} · {source.signalStrengthClass}<br />{source.ageDays} days old</p></article>)}</div>{author.sourceSummaries.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No finalized sources yet.</p> : null}<h2 className="mt-8 border-b border-border pb-2 font-medium">Published skills</h2>{author.publishedSkills.map((skill) => <Link key={skill.skillId} href={`/browse/${skill.skillId}`} className="block border-b border-border py-3"><span className="text-sm font-medium underline-offset-4 hover:underline">{skill.summary}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{skill.tags.map((tag) => `#${tag}`).join(" ")}</span></Link>)}{author.publishedSkills.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No published skills.</p> : null}</div><aside><h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Send author to agent</h2><CopyBox text={resourceHandoff({ kind: "author", id: author.handle })} /></aside></div></main>;
}
