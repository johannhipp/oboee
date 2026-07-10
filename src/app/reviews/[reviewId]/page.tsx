import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicReviewReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

const load = async (reviewId: string) => {
  try { const result = await fetchQuery(anyApi.postUseReviews.publicReview, { reviewId }); return result ? buildPublicReviewReadModel(result) : null; } catch { return null; }
};

export async function generateMetadata({ params }: { params: Promise<{ reviewId: string }> }): Promise<Metadata> {
  const { reviewId } = await params;
  return { title: `Review ${reviewId} | Oboe`, alternates: { canonical: `/reviews/${reviewId}` } };
}

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const review = await load(reviewId);
  if (!review) return <main className="mx-auto max-w-4xl py-10 text-sm text-muted-foreground">Public review not found.</main>;
  return <main className="mx-auto max-w-4xl py-8"><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]"><article><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div><span className="font-mono text-xs text-muted-foreground">post-use review · {review.state}</span><h1 className="mt-1 text-xl font-medium">{review.rating}/5 · {review.outcome}</h1></div><time className="font-mono text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString()}</time></div><dl className="mt-4 grid gap-2 text-sm"><div><dt className="inline font-mono text-xs text-muted-foreground">reviewer </dt><dd className="inline"><Link href={`/authors/${review.reviewerHandle}`} className="underline">@{review.reviewerHandle}</Link></dd></div><div><dt className="inline font-mono text-xs text-muted-foreground">exact version </dt><dd className="inline"><code>{review.skillVersionId}</code></dd></div></dl><p className="mt-6 whitespace-pre-wrap text-sm leading-6">{review.text}</p><p className="mt-4 font-mono text-xs text-muted-foreground">{review.tags.map((tag) => `#${tag}`).join(" ")}</p>{review.response ? <section className="mt-8 border-l-2 border-border pl-4"><h2 className="font-mono text-xs uppercase text-muted-foreground">Author response</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.response.text}</p><time className="mt-2 block font-mono text-xs text-muted-foreground">{new Date(review.response.createdAt).toLocaleString()}</time></section> : null}<Link href={`/browse/${review.skillId}`} className="mt-8 inline-block font-mono text-sm underline">view exact skill resource</Link></article><aside><h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Send review to agent</h2><CopyBox text={resourceHandoff({ kind: "review", id: review.reviewId, versionId: review.skillVersionId })} /></aside></div></main>;
}
