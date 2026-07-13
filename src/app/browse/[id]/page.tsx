import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { RfsFundingAction, SkillPurchaseAction } from "@/components/payment-action";
import { StatusBadge } from "@/components/status-badge";
import { TechnicalDetails } from "@/components/technical-details";
import { convexUnavailableMessage } from "@/lib/auth-server";
import { rfsCapabilities, skillCapabilities } from "@/lib/api-v2/capabilities";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicRfsReadModel, buildPublicSkillReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en-US");

const formatUnits = (value?: string | null) => {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? `${numberFormat.format(number)} units` : `${value} units`;
};

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : undefined;

const formatLabel = (value: string) => value.replaceAll("_", " ");
const formatEvidenceLabel = (value: string) => value === "public" ? "Public evidence" : value === "restricted" ? "Private evidence" : formatLabel(value);

const StateLabel = ({ value }: { value: string }) => (
  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
    {formatLabel(value)}
  </span>
);

const SectionHeading = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-4 border-b border-border pb-3">
    <h2 className="text-base font-medium">{title}</h2>
    {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
  </div>
);

const Metric = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="border-b border-border py-3 sm:border-b-0 sm:border-r sm:pr-4 last:border-0 last:pr-0">
    <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-sm">{value}</dd>
  </div>
);

const Definition = ({ label, value }: { label: string; value?: ReactNode }) => value === undefined || value === null ? null : (
  <div className="grid gap-1 border-b border-border py-2 last:border-b-0 sm:grid-cols-[11rem_1fr]">
    <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-sm">{value}</dd>
  </div>
);

const loadResource = async (id: string) => {
  try {
    const rfs = await fetchQuery(anyApi.rfsV2.get, { rfsId: id });
    if (rfs) return { kind: "rfs" as const, data: buildPublicRfsReadModel(rfs) };
  } catch {
    // The opaque ID may belong to the skill table.
  }
  try {
    const skill = await fetchQuery(anyApi.skills.getPublic, { skillId: id });
    if (skill) return { kind: "skill" as const, data: buildPublicSkillReadModel(skill) };
  } catch {
    // The caller receives one neutral unavailable/not-found state below.
  }
  return null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const resource = await loadResource(id);
  const title = resource ? (resource.kind === "rfs" ? resource.data.rfs.title : resource.data.title) : "Marketplace item";
  return { title: `${title} | Oboe`, alternates: { canonical: `/browse/${id}` } };
}

export default async function MarketplaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await loadResource(id);
  if (!resource) {
    return <main className="mx-auto max-w-5xl py-10"><DataToast message={convexUnavailableMessage()} /><p className="mt-8 text-sm text-muted-foreground">This marketplace item is unavailable or does not exist.</p></main>;
  }

  if (resource.kind === "skill") {
    const skill = resource.data;
    const purchase = skillCapabilities(skill.id, skill.versionId, skill.quarantineState === "clear").find((item) => item.action === "purchase");
    if (!purchase) return <main className="mx-auto max-w-5xl py-10 text-sm text-muted-foreground">Purchase details are unavailable.</main>;

    return (
      <main className="mx-auto max-w-5xl py-8 sm:py-10">
        <Link href="/browse" className="font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← Marketplace</Link>
        {skill.quarantineState !== "clear" ? <div role="alert" className="mt-6 border-y border-red-700 py-3 text-sm text-red-900"><strong className="mr-2 font-mono uppercase">{formatLabel(skill.quarantineState)}</strong>This version is not ready to purchase or execute until the hold is resolved.</div> : null}
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
          <article className="min-w-0">
            <header className="border-b border-border pb-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Published skill · v{skill.version}</span>
                <StatusBadge status={skill.status} />
              </div>
              <h1 className="mt-3 break-words text-2xl font-medium tracking-tight sm:text-3xl">{skill.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{skill.summary}</p>
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                {skill.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            </header>

            <dl className="grid gap-3 border-b border-border py-5 sm:grid-cols-3 sm:gap-4">
              <Metric label="Author" value={<Link href={`/authors/${skill.authorHandle}`} className="underline underline-offset-4">@{skill.authorHandle}</Link>} />
              <Metric label="Quality" value={skill.quality ? `${skill.quality.adjustedScore.toFixed(1)} / 5 · ${skill.quality.confidence}` : "No finalized signal yet"} />
              <Metric label="Verified installs" value={skill.uniqueVerifiedInstalls} />
            </dl>

            <section className="mt-8" aria-labelledby="reviews-heading">
              <SectionHeading title="Post-use reviews" description="Public reviews for this published version." />
              <div>
                {skill.reviews.map((review) => <article key={review.reviewId} className="border-b border-border py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/reviews/${review.reviewId}`} className="font-medium underline underline-offset-4">{review.rating}/5 · {review.outcome}</Link><StateLabel value={review.state} /></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.text}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">{review.tags.map((tag) => <span key={tag}>#{tag}</span>)}<time>{formatDate(review.createdAt)}</time></div></article>)}
                {skill.reviews.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No public reviews yet.</p> : null}
              </div>
            </section>

            <TechnicalDetails summary="Technical details" hint="Version, digest, and API data" className="mt-8">
              <dl>
                <Definition label="exact version ID" value={<code className="break-all">{skill.versionId}</code>} />
                <Definition label="content digest" value={<code className="break-all">{skill.digestAlgorithm ?? "sha256"}:{skill.contentHash}</code>} />
                <Definition label="purchase price" value={formatUnits(skill.purchasePriceBaseUnits)} />
                <Definition label="published" value={formatDate(skill.publishedAt) ?? "pending"} />
                <Definition label="resource ID" value={<code className="break-all">{skill.id}</code>} />
              </dl>
            </TechnicalDetails>
          </article>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="border-y border-border py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Published version</p>
              <h2 className="mt-2 text-base font-medium">Purchase this version</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The purchase refers to the exact published version identified below.</p>
              <p className="mt-4 font-mono text-xs text-muted-foreground">price · {formatUnits(skill.purchasePriceBaseUnits)}</p>
              <SkillPurchaseAction capability={purchase} skillVersionId={skill.versionId} />
              <Link href={`/browse/${skill.rfsId}`} className="mt-4 inline-block font-mono text-xs underline underline-offset-4">Open source request</Link>
            </div>
            <TechnicalDetails summary="Machine reference" hint="Version and capabilities" className="mt-6">
              <p className="mb-3 text-sm leading-6 text-muted-foreground">The reference includes the exact version and its available capabilities.</p>
              <CopyBox label="Copy skill handoff" text={resourceHandoff({ kind: "skill", id: skill.id, versionId: skill.versionId })} />
            </TechnicalDetails>
          </aside>
        </div>
      </main>
    );
  }

  const detail = resource.data;
  const rfs = detail.rfs;
  const fund = rfsCapabilities(rfs.id, rfs.status).find((item) => item.action === "fund");
  if (!fund) return <main className="mx-auto max-w-5xl py-10 text-sm text-muted-foreground">Funding details are unavailable.</main>;
  const target = Number(rfs.totalFundingTargetBaseUnits ?? "0");
  const funded = Number(rfs.fundedBaseUnits);
  const fundingPercent = target > 0 && Number.isFinite(funded) ? Math.min(100, Math.round((funded / target) * 100)) : 0;

  return (
    <main className="mx-auto max-w-5xl py-8 sm:py-10">
      <Link href="/browse" className="font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← Marketplace</Link>
      {detail.submission && detail.submission.quarantineState !== "clear" ? <div role="alert" className="mt-6 border-y border-red-700 py-3 text-sm text-red-900"><strong className="mr-2 font-mono uppercase">Submission {formatLabel(detail.submission.quarantineState)}</strong>Publication, purchase, and payout remain held pending independent resolution.</div> : null}
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
        <article className="min-w-0">
          <header className="border-b border-border pb-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Request for work</span>
              <StatusBadge status={rfs.status} />
            </div>
            <h1 className="mt-3 break-words text-2xl font-medium tracking-tight sm:text-3xl">{rfs.title}</h1>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{rfs.description}</p>
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              {rfs.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span>requested by <Link href={`/authors/${rfs.authorHandle}`} className="text-foreground underline underline-offset-4">@{rfs.authorHandle}</Link></span>
              {rfs.selectedAuthorHandle ? <span>working with <Link href={`/authors/${rfs.selectedAuthorHandle}`} className="text-foreground underline underline-offset-4">@{rfs.selectedAuthorHandle}</Link></span> : null}
            </div>
          </header>

          <section className="mt-8" aria-labelledby="funding-heading">
            <SectionHeading title="Funding" description="Current amount, target, and progress." />
            <dl className="grid gap-3 border-y border-border py-4 sm:grid-cols-3 sm:gap-4">
              <Metric label="Raised" value={formatUnits(rfs.fundedBaseUnits) ?? "0 units"} />
              <Metric label="Target" value={formatUnits(rfs.totalFundingTargetBaseUnits) ?? "Not set"} />
              <Metric label="Progress" value={`${fundingPercent}%`} />
            </dl>
            <div className="mt-3 h-1.5 w-full bg-gray-100" role="progressbar" aria-label="Funding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fundingPercent}>
              <div className="h-full bg-foreground" style={{ width: `${fundingPercent}%` }} />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="criteria-heading">
            <SectionHeading title="Acceptance criteria" description="Conditions used to determine whether the result is accepted." />
            <div className="divide-y divide-border border-y border-border">
              {detail.criteria.map((criterion) => <article key={criterion.criterionId} className="py-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-medium">{criterion.title}</h3>{criterion.requiredForPublication ? <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-red-700">required</span> : null}</div><p className="mt-2 text-sm leading-6">{criterion.passCondition}</p><TechnicalDetails summary="Verification detail" hint="Method and weight" className="mt-3"><dl><Definition label="method" value={criterion.verificationMethod} /><Definition label="weight" value={`${(criterion.weightBps / 100).toFixed(2)}%`} /><Definition label="fixture version" value={criterion.fixtureVersionId ? <code className="break-all">{criterion.fixtureVersionId}</code> : undefined} /></dl></TechnicalDetails></article>)}
              {detail.criteria.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No acceptance criteria have been published.</p> : null}
            </div>
          </section>

          {detail.assessment ? <section className="mt-8" aria-labelledby="assessment-heading"><SectionHeading title="Current assessment" description="Latest evaluation state and reason." /><div className="border-y border-border py-4"><div className="flex flex-wrap items-center justify-between gap-3"><StateLabel value={detail.assessment.decisionKind ?? detail.assessment.status} />{detail.assessment.passedWeightBps !== undefined ? <span className="font-mono text-xs text-muted-foreground">{(detail.assessment.passedWeightBps / 100).toFixed(0)}% criteria passed</span> : null}</div><p className="mt-3 text-sm leading-6">{detail.assessment.assessmentReason}</p></div><TechnicalDetails summary="Assessment details" hint="Workflow and timestamps" className="mt-4"><dl><Definition label="workflow" value={detail.assessment.workflowStatus ? formatLabel(detail.assessment.workflowStatus) : undefined} /><Definition label="decided" value={formatDate(detail.assessment.decidedAt)} /></dl></TechnicalDetails></section> : null}

          <section className="mt-8" aria-labelledby="evidence-heading">
            <SectionHeading title="Public evidence" description="Evidence available without authenticated access." />
            <div className="divide-y divide-border border-y border-border">
              {detail.publicEvidence.map((artifact) => <article key={artifact.artifactId} className="py-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{formatEvidenceLabel(artifact.classification)}</h3><StateLabel value={artifact.verificationState} /></div><p className="mt-2 text-sm leading-6">{artifact.publicRedaction ?? "No public narrative supplied."}</p><TechnicalDetails summary="Evidence metadata" hint="File and scan state" className="mt-3"><dl><Definition label="scan" value={formatLabel(artifact.scanState)} /><Definition label="file" value={`${artifact.mimeType} · ${numberFormat.format(artifact.sizeBytes)} bytes`} /><Definition label="artifact ID" value={<code className="break-all">{artifact.artifactId}</code>} /></dl></TechnicalDetails></article>)}
              {detail.publicEvidence.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No public evidence submitted.</p> : null}
            </div>
          </section>

          <TechnicalDetails summary="Technical details" hint="Policy, deadlines, and IDs" className="mt-8">
            <dl>
              <Definition label="policy version" value={rfs.policyVersion} />
              <Definition label="scope" value={rfs.scope} />
              <Definition label="target environments" value={detail.revision?.targetEnvironments.join(", ")} />
              <Definition label="work escrow" value={formatUnits(rfs.workEscrowBaseUnits)} />
              <Definition label="review reserve" value={formatUnits(rfs.reviewReserveBaseUnits)} />
              <Definition label="contract digest" value={rfs.contractDigest ? <code className="break-all">{rfs.contractDigest}</code> : "draft"} />
              <Definition label="funding deadline" value={formatDate(rfs.fundingDeadline)} />
              <Definition label="application deadline" value={formatDate(rfs.applicationDeadline)} />
              <Definition label="delivery deadline" value={formatDate(rfs.deliveryDeadline)} />
              <Definition label="request ID" value={<code className="break-all">{rfs.id}</code>} />
            </dl>
          </TechnicalDetails>
        </article>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="border-y border-border py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Funding</p>
            <h2 className="mt-2 text-base font-medium">{fund.allowed ? "Fund this request" : "Funding is closed"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{fund.allowed ? "Contribute in the request token and network." : "The funding window has closed."}</p>
            {fund.allowed ? <RfsFundingAction capability={fund} minimumBaseUnits="1" /> : null}
            {detail.submission ? <Link className="mt-4 inline-block font-mono text-xs underline underline-offset-4" href={`/browse/${detail.submission.skillId}`}>Open published skill</Link> : null}
          </div>
          <TechnicalDetails summary="Machine reference" hint="Resource and capabilities" className="mt-6">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">Copy the request locator when a client needs the full contract.</p>
            <CopyBox label="Copy request handoff" text={resourceHandoff({ kind: "rfs", id: rfs.id })} />
          </TechnicalDetails>
        </aside>
      </div>
    </main>
  );
}
