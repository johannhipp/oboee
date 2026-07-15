import { anyApi } from "convex/server";
import { notFound } from "next/navigation";
import { ReviewerWorkspace } from "@/components/reviewer-workspace";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
import { WorkspaceState } from "@/components/workspace-state";
export const dynamic = "force-dynamic";
type Detail = {
  assignment: {
    assignmentId: string;
    reason: string;
    tags: string[];
    dueAt: number;
    reserveFeeBaseUnits: string;
    state: string;
  };
  rfs: {
    rfsId: string;
    title: string;
    description: string;
    scope: string;
    targetEnvironments: string[];
    contractDigest: string;
  };
  criteria: Parameters<typeof ReviewerWorkspace>[0]["criteria"];
  skillVersion: {
    skillVersionId: string;
    version: number;
    contentHash: string;
    summary: string;
  } | null;
  evidence: Parameters<typeof ReviewerWorkspace>[0]["evidence"];
};
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Review assignment"
        message="Sign in with a trusted reviewer account."
        signInPath={`/review/${(await params).assignmentId}`}
      />
    );
  const { assignmentId } = await params;
  let detail: Detail | null;
  try {
    detail = toJsonValue(
      await fetchAuthQuery(anyApi.evaluationV2.getReviewAssignment, {
        assignmentId,
      }),
    ) as Detail | null;
  } catch {
    return (
      <WorkspaceState
        title="Review assignment"
        message="This assignment is outside your active reviewer role or tag scope."
      />
    );
  }
  if (!detail) notFound();
  return (
    <main>
      <p className="font-mono text-xs text-muted-foreground">
        {detail.assignment.reason.replaceAll("_", " ")} · due{" "}
        {new Date(detail.assignment.dueAt).toLocaleString()}
      </p>
      <h1 className="mt-2 text-xl font-medium">{detail.rfs.title}</h1>
      <p className="mt-3 text-sm">{detail.rfs.description}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail.rfs.scope}</p>
      <dl className="my-6 grid gap-3 border-y border-border py-4 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Contract digest</dt>
          <dd className="break-all font-mono text-xs">
            {detail.rfs.contractDigest}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skill version</dt>
          <dd>
            {detail.skillVersion
              ? `v${detail.skillVersion.version} · ${detail.skillVersion.contentHash}`
              : "unavailable"}
          </dd>
        </div>
      </dl>
      <aside className="mb-6 border-l-2 border-border pl-3 text-sm leading-6 text-muted-foreground">
        Settlement consequences: ordinary criterion failure changes the payout multiplier; confirmed abandonment can slash 50% of the author bond, and adjudicated harmful or fraudulent work can slash 100%. A reviewer records facts but does not settle or slash funds directly.
      </aside>
      <ReviewerWorkspace
        assignmentId={assignmentId}
        state={detail.assignment.state}
        rfsId={detail.rfs.rfsId}
        skillVersionId={detail.skillVersion?.skillVersionId}
        targetEnvironments={detail.rfs.targetEnvironments}
        criteria={detail.criteria}
        evidence={detail.evidence}
      />
    </main>
  );
}
