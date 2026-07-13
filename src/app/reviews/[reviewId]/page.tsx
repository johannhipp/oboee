import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { TechnicalDetails } from "@/components/technical-details";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicReviewReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatLabel = (value: string) => value.replaceAll("_", " ");

const load = async (reviewId: string) => {
  try {
    const result = await fetchQuery(anyApi.postUseReviews.publicReview, { reviewId });
    return result ? buildPublicReviewReadModel(result) : null;
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }: { params: Promise<{ reviewId: string }> }): Promise<Metadata> {
  const { reviewId } = await params;
  return { title: `Review ${reviewId} | Oboe`, alternates: { canonical: `/reviews/${reviewId}` } };
}

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const review = await load(reviewId);
  if (!review) return <main className="mx-auto max-w-5xl py-10 text-sm text-muted-foreground">Public review not found.</main>;

  return (
    <main className="mx-auto max-w-5xl py-8 sm:py-10">
      <Link href="/browse" className="font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← Marketplace</Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
        <article className="min-w-0">
          <header className="border-b border-border pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Post-use review</span>
                  <span>· {formatLabel(review.state)}</span>
                </div>
                <h1 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">{review.rating}/5 · {review.outcome}</h1>
              </div>
              <time className="font-mono text-xs text-muted-foreground">{formatDate(review.createdAt)}</time>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Reviewed by</dt><dd className="mt-1"><Link href={`/authors/${review.reviewerHandle}`} className="underline underline-offset-4">@{review.reviewerHandle}</Link></dd></div>
              <div><dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Skill version</dt><dd className="mt-1"><Link href={`/browse/${review.skillId}`} className="underline underline-offset-4">Open the published skill</Link></dd></div>
            </dl>
          </header>

          <p className="mt-8 whitespace-pre-wrap text-sm leading-7">{review.text}</p>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">{review.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>

          {review.response ? <section className="mt-8 border-l-2 border-border pl-4" aria-labelledby="response-heading"><h2 id="response-heading" className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Author response</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.response.text}</p><time className="mt-3 block font-mono text-xs text-muted-foreground">{formatDate(review.response.createdAt)}</time></section> : null}

          <Link href={`/browse/${review.skillId}`} className="mt-8 inline-flex border-b border-foreground pb-1 font-mono text-xs hover:text-muted-foreground">Open the published skill ↗</Link>

          <TechnicalDetails summary="Technical details" hint="Exact version ID" className="mt-8">
            <dl>
              <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[11rem_1fr]"><dt className="font-mono text-xs text-muted-foreground">exact version ID</dt><dd className="min-w-0 break-all text-sm"><code>{review.skillVersionId}</code></dd></div>
              <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]"><dt className="font-mono text-xs text-muted-foreground">review ID</dt><dd className="min-w-0 break-all text-sm"><code>{review.reviewId}</code></dd></div>
            </dl>
          </TechnicalDetails>
        </article>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <TechnicalDetails summary="Machine reference" hint="Review and version IDs">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">Use the exact version when a client needs to associate this review with a resource.</p>
            <CopyBox label="Copy review handoff" text={resourceHandoff({ kind: "review", id: review.reviewId, versionId: review.skillVersionId })} />
          </TechnicalDetails>
        </aside>
      </div>
    </main>
  );
}
