import { anyApi } from "convex/server";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
import { IdentityOverride } from "@/components/identity-override";
export const dynamic = "force-dynamic";
type Cluster = {
  cluster: {
    clusterId: string;
    confidenceBps: number;
    reasons: string[];
    manualOverride: boolean;
    overrideExpiresAt?: number;
  };
  memberCount: number;
  members: Array<{ principalId: string; confidenceBps: number; reasons: string[] }>;
  resourceDigest: string;
};
export default async function IdentityPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Identity clusters"
        message="Sign in with a security operator account."
        signInPath="/ops/identity"
      />
    );
  let rows: Cluster[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.operations.identityQueue, {}),
    ) as Cluster[];
  } catch {
    return (
      <WorkspaceState
        title="Identity clusters"
        message="The security operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Identity clusters</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Risk evidence is private. Cluster changes require a separately reviewed
        runbook operation.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {rows.map((item) => (
          <article key={item.cluster.clusterId} className="py-4">
            <p className="font-mono text-xs break-all">
              {item.cluster.clusterId}
            </p>
            <p className="mt-1 text-sm">
              {item.memberCount} member{item.memberCount === 1 ? "" : "s"} ·
              confidence {item.cluster.confidenceBps / 100}%
              {item.cluster.manualOverride ? " · manual override" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.cluster.reasons.join(", ")}
            </p>
            <p className="mt-2 font-mono text-xs break-all text-muted-foreground">{item.members.map((member) => member.principalId).join(", ")}</p>
          </article>
        ))}
      </div>
      <IdentityOverride />
    </main>
  );
}
