import type { Metadata } from "next";
import Link from "next/link";
import { anyApi } from "convex/server";
import { fetchQuery } from "convex/nextjs";

import { CopyBox } from "@/components/copy-box";
import { DataToast } from "@/components/data-fallback";
import { RfsFundingAction, SkillPurchaseAction } from "@/components/payment-action";
import { StatusBadge } from "@/components/status-badge";
import { convexUnavailableMessage } from "@/lib/auth-server";
import { rfsCapabilities, skillCapabilities } from "@/lib/api-v2/capabilities";
import { resourceHandoff } from "@/lib/handoff";
import { buildPublicRfsReadModel, buildPublicSkillReadModel } from "@/lib/read-models/public";

export const dynamic = "force-dynamic";

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

const Definition = ({ label, value }: { label: string; value?: React.ReactNode }) => value === undefined || value === null ? null : (
  <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[11rem_1fr]">
    <dt className="font-mono text-xs text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-sm">{value}</dd>
  </div>
);

export default async function MarketplaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await loadResource(id);
  if (!resource) return <div className="mx-auto max-w-4xl py-10"><DataToast message={convexUnavailableMessage()} /><p className="mt-8 text-sm text-muted-foreground">This policy-v2 resource is unavailable or does not exist.</p></div>;

  if (resource.kind === "skill") {
    const skill = resource.data;
    const purchase = skillCapabilities(skill.id, skill.versionId, skill.quarantineState === "clear", !skill.legacyImported).find((item) => item.action === "purchase" && item.allowed);
    return (
      <article className="mx-auto max-w-4xl py-8">
        {skill.legacyImported ? <div role="status" className="mb-5 border border-amber-700 bg-amber-50 p-4 text-sm text-amber-950"><strong className="block font-mono uppercase">Imported policy-v1 content</strong>This historical record is read-only until a policy-v2 version is published.</div> : null}
        {skill.quarantineState !== "clear" ? <div role="alert" className="mb-5 border-2 border-red-700 bg-red-50 p-4 text-sm text-red-900"><strong className="block font-mono uppercase">{skill.quarantineState}</strong>This version must not be purchased or executed until the hold is resolved.</div> : null}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs uppercase text-muted-foreground">skill v{skill.version}</span><StatusBadge status={skill.status} /></div>
            <h1 className="mt-2 text-2xl font-medium">{skill.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{skill.summary}</p>
            <dl className="mt-6">
              <Definition label="author" value={<Link href={`/authors/${skill.authorHandle}`} className="underline">@{skill.authorHandle}</Link>} />
              <Definition label="policy" value={`v${skill.policyVersion}`} />
              <Definition label="content digest" value={<code>{skill.digestAlgorithm}:{skill.contentHash}</code>} />
              <Definition label="price" value={`${skill.purchasePriceBaseUnits} base units`} />
              <Definition label="verified installs" value={skill.uniqueVerifiedInstalls} />
              <Definition label="quality" value={skill.quality ? `${skill.quality.adjustedScore.toFixed(3)} · ${skill.quality.confidence} · ${skill.quality.independentCount} independent` : "provisional · no finalized evidence"} />
              <Definition label="published" value={skill.publishedAt ? new Date(skill.publishedAt).toLocaleString() : "pending"} />
            </dl>
            <h2 className="mt-8 border-b border-border pb-2 text-base font-medium">Public post-use reviews</h2>
            {skill.reviews.map((review) => <div key={review.reviewId} className="border-b border-border py-4"><div className="flex justify-between gap-3 font-mono text-xs"><Link href={`/reviews/${review.reviewId}`} className="underline">{review.rating}/5 · {review.outcome}</Link><span>{review.state}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.text}</p></div>)}
            {skill.reviews.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No public reviews yet.</p> : null}
          </div>
          <aside><h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Use with an agent</h2><CopyBox text={resourceHandoff({ kind: "skill", id: skill.id, versionId: skill.versionId })} />{purchase ? <SkillPurchaseAction capability={purchase} skillVersionId={skill.versionId} /> : <p className="mt-4 text-sm text-muted-foreground">Purchases are unavailable for imported policy-v1 content.</p>}<Link href={`/browse/${skill.rfsId}`} className="mt-4 inline-block font-mono text-xs underline">source RFS</Link></aside>
        </div>
      </article>
    );
  }

  const detail = resource.data;
  const rfs = detail.rfs;
  const fund = rfsCapabilities(rfs.id, rfs.status).find((item) => item.action === "fund")!;
  return (
    <article className="mx-auto max-w-4xl py-8">
      {detail.submission && detail.submission.quarantineState !== "clear" ? <div role="alert" className="mb-5 border-2 border-red-700 bg-red-50 p-4 text-sm text-red-900"><strong className="block font-mono uppercase">Submission {detail.submission.quarantineState}</strong>Publication, purchase, and payout remain held pending independent resolution.</div> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs uppercase text-muted-foreground">RFS · policy {rfs.policyVersion}</span><StatusBadge status={rfs.status} /></div>
          <h1 className="mt-2 text-2xl font-medium">{rfs.title}</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{rfs.description}</p>
          <h2 className="mt-8 border-b border-border pb-2 text-base font-medium">Contract</h2>
          <dl>
            <Definition label="requester" value={<Link href={`/authors/${rfs.authorHandle}`} className="underline">@{rfs.authorHandle}</Link>} />
            <Definition label="scope" value={rfs.scope} />
            <Definition label="environments" value={detail.revision?.targetEnvironments.join(", ")} />
            <Definition label="work escrow" value={`${rfs.workEscrowBaseUnits ?? "0"} base units`} />
            <Definition label="review reserve" value={`${rfs.reviewReserveBaseUnits ?? "0"} base units`} />
            <Definition label="funded / target" value={`${rfs.fundedBaseUnits} / ${rfs.totalFundingTargetBaseUnits ?? "0"} base units`} />
            <Definition label="contract digest" value={<code>{rfs.contractDigest ?? "draft"}</code>} />
            <Definition label="funding deadline" value={rfs.fundingDeadline ? new Date(rfs.fundingDeadline).toLocaleString() : undefined} />
            <Definition label="application deadline" value={rfs.applicationDeadline ? new Date(rfs.applicationDeadline).toLocaleString() : undefined} />
            <Definition label="delivery deadline" value={rfs.deliveryDeadline ? new Date(rfs.deliveryDeadline).toLocaleString() : undefined} />
          </dl>
          <h2 className="mt-8 border-b border-border pb-2 text-base font-medium">Acceptance criteria</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead className="font-mono text-xs text-muted-foreground"><tr><th className="py-2">criterion</th><th>pass condition</th><th>verification</th><th className="text-right">weight</th></tr></thead><tbody>{detail.criteria.map((criterion) => <tr key={criterion.criterionId} className="border-t border-border align-top"><td className="py-3 pr-4"><div className="font-medium">{criterion.title}</div>{criterion.requiredForPublication ? <span className="font-mono text-[10px] text-red-700">required</span> : null}</td><td className="py-3 pr-4">{criterion.passCondition}</td><td className="py-3 pr-4">{criterion.verificationMethod}</td><td className="py-3 text-right font-mono">{(criterion.weightBps / 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
          {detail.assessment ? <><h2 className="mt-8 border-b border-border pb-2 text-base font-medium">Assessment</h2><dl><Definition label="workflow" value={detail.assessment.workflowStatus} /><Definition label="decision" value={detail.assessment.decisionKind ?? detail.assessment.status} /><Definition label="passed weight" value={detail.assessment.passedWeightBps === undefined ? undefined : `${(detail.assessment.passedWeightBps / 100).toFixed(2)}%`} /><Definition label="reason" value={detail.assessment.assessmentReason} /></dl></> : null}
          <h2 className="mt-8 border-b border-border pb-2 text-base font-medium">Public evidence</h2>
          {detail.publicEvidence.map((artifact) => <div key={artifact.artifactId} className="border-b border-border py-3 text-sm"><div className="flex flex-wrap justify-between gap-2 font-mono text-xs"><span>{artifact.verificationState} · {artifact.scanState} · {artifact.classification}</span><span>{artifact.mimeType} · {artifact.sizeBytes} bytes</span></div><p className="mt-2">{artifact.publicRedaction ?? "No public narrative supplied."}</p></div>)}
          {detail.publicEvidence.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No public evidence submitted.</p> : null}
        </div>
        <aside><h2 className="mb-2 font-mono text-xs uppercase text-muted-foreground">Send to agent</h2><CopyBox text={resourceHandoff({ kind: "rfs", id: rfs.id })} /><RfsFundingAction capability={fund} minimumBaseUnits="1" />{detail.submission ? <Link className="mt-4 inline-block font-mono text-xs underline" href={`/browse/${detail.submission.skillId}`}>published skill</Link> : null}</aside>
      </div>
    </article>
  );
}
