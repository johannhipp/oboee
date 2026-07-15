import { anyApi } from "convex/server";
import Link from "next/link";
import { FeatureFlagForm } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Context = {
  roles: { role: string; tags: string[]; activeUntil: number }[];
};
type Overview = {
  activeRoleCount: number;
  pendingRecoveryCount: number;
  failedTransferCount: number;
  heldEvidenceCount: number;
  migrationFindingCount: number;
  openDisputeCount: number;
  featureFlags: { key: string; mode: string; resourceDigest: string }[];
  alerts: { kind: string; count: number }[];
  shadowComparison: { compared: number; diverged: number; recentDivergences: Array<{ rfsId: string; legacyFirstApplicationId: string; policyV2ApplicationId: string; policyV2ScoreBps?: number; comparedAt: number }> };
};
export default async function OpsPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Operations"
        message="Sign in with an operator account."
        signInPath="/ops"
      />
    );
  let context: Context;
  try {
    context = toJsonValue(
      await fetchAuthQuery(anyApi.operations.context, {}),
    ) as Context;
  } catch {
    return (
      <WorkspaceState
        title="Operations"
        message="Operator context is unavailable."
      />
    );
  }
  if (!context.roles.length)
    return (
      <WorkspaceState
        title="Operations"
        message="An active platform role is required."
      />
    );
  let overview: Overview | null = null;
  if (context.roles.some((item) => item.role === "platform_operator"))
    try {
      overview = toJsonValue(
        await fetchAuthQuery(anyApi.operations.overview, {}),
      ) as Overview;
    } catch {}
  return (
    <main>
      <h1 className="text-xl font-medium">Operations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Privileged commands require a recent passkey and are audit logged. API
        keys are rejected.
      </p>
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-y border-border py-3">
        {context.roles.map((item) => (
          <span
            key={item.role}
            className="font-mono text-xs"
          >
            {item.role}
            {item.tags.length ? `: ${item.tags.join(",")}` : ""}
          </span>
        ))}
      </div>
      {overview ? (
        <>
          <dl className="mt-8 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ["active roles", overview.activeRoleCount],
              ["pending recoveries", overview.pendingRecoveryCount],
              ["failed transfers", overview.failedTransferCount],
              ["evidence holds", overview.heldEvidenceCount],
              ["migration findings", overview.migrationFindingCount],
              ["open disputes", overview.openDisputeCount],
            ].map(([label, value]) => (
              <div key={label} className="py-4 sm:px-4">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {overview.alerts.length ? (
            <section className="mt-8 border-y border-red-700 py-4" role="alert">
              <h2 className="font-medium text-red-800">Operational alerts</h2>
              <div className="mt-2 divide-y divide-red-200">
                {overview.alerts.map((alert) => (
                  <p key={alert.kind} className="py-2 text-sm">
                    {alert.kind.replaceAll(/([A-Z])/g, " $1").toLowerCase()}:{" "}
                    {alert.count}
                  </p>
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-8 border-y border-border py-3 text-sm text-muted-foreground">
              No workflow, settlement, retention, hold, or projection alerts in
              the inspected window.
            </p>
          )}
          <section className="mt-8">
            <h2 className="font-medium">Rollout flags</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              General availability remains deployment-gated even for platform
              operators.
            </p>
            <div className="mt-3">
              {overview.featureFlags.map((flag) => (
                <FeatureFlagForm
                  key={flag.key}
                  flagKey={flag.key}
                  currentMode={flag.mode}
                  resourceDigest={flag.resourceDigest}
                />
              ))}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="font-medium">Assignment shadow comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">Compared {overview.shadowComparison.compared} completed selections; {overview.shadowComparison.diverged} differed from first-come assignment.</p>
            <div className="mt-3 divide-y divide-border border-y border-border">{overview.shadowComparison.recentDivergences.map((item) => <div key={item.rfsId} className="py-3 font-mono text-xs"><p className="break-all">RFS {item.rfsId}</p><p className="text-muted-foreground break-all">first {item.legacyFirstApplicationId} · ranked {item.policyV2ApplicationId} ({(item.policyV2ScoreBps ?? 0) / 100}%)</p></div>)}{overview.shadowComparison.recentDivergences.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No observed selection divergences.</p> : null}</div>
          </section>
        </>
      ) : (
        <p className="mt-8 text-sm">
          Use the role-specific queues above. Platform-wide metrics require the
          platform operator role.
        </p>
      )}
      <p className="mt-8 text-sm">
        <Link className="underline" href="/review">
          Open reviewer workspace
        </Link>
      </p>
    </main>
  );
}
