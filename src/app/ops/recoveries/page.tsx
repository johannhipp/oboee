import { anyApi } from "convex/server";
import { OperatorAction } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Recovery = {
  _id: string;
  principalId: string;
  status: string;
  coolingOffUntil: number;
  firstOperatorPrincipalId?: string;
  secondOperatorPrincipalId?: string;
  resourceDigest: string;
};
export default async function RecoveriesPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Account recoveries"
        message="Sign in with a security operator account."
        signInPath="/ops/recoveries"
      />
    );
  let rows: Recovery[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.operations.recoveryQueue, {}),
    ) as Recovery[];
  } catch {
    return (
      <WorkspaceState
        title="Account recoveries"
        message="The security operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Account recoveries</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Completion requires wallet proof, cooling-off, and two independent
        operators.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {rows.map((item) => (
          <article
            key={item._id}
            className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-mono text-xs break-all">{item.principalId}</p>
              <p className="mt-1 text-sm">
                {item.status} · cooling until{" "}
                {new Date(item.coolingOffUntil).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                approvals:{" "}
                {
                  [
                    item.firstOperatorPrincipalId,
                    item.secondOperatorPrincipalId,
                  ].filter(Boolean).length
                }
                /2
              </p>
            </div>
            {item.status !== "completed" && item.status !== "rejected" ? (
              <OperatorAction
                href={`/api/v2/ops/recoveries/${item._id}/approve`}
                label="approve"
                body={{ expectedDigest: item.resourceDigest }}
                dangerous
              />
            ) : null}
          </article>
        ))}
      </div>
    </main>
  );
}
