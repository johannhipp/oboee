import { anyApi } from "convex/server";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Event = {
  _id: string;
  actorPrincipalId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  requestDigest: string;
  result: string;
  occurredAt: number;
};
export default async function AuditPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Operator audit"
        message="Sign in with a platform operator account."
        signInPath="/ops/audit"
      />
    );
  let rows: Event[];
  try {
    rows = toJsonValue(
      await fetchAuthQuery(anyApi.operations.auditLog, { limit: 100 }),
    ) as Event[];
  } catch {
    return (
      <WorkspaceState
        title="Operator audit"
        message="The platform operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Operator audit</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Append-only privileged command history with canonical request digests.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {rows.map((item) => (
          <article key={item._id} className="py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{item.action}</p>
              <p className="font-mono text-xs">
                {new Date(item.occurredAt).toLocaleString()}
              </p>
            </div>
            <p className="mt-1 text-sm">{item.reason}</p>
            <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
              {item.targetType}:{item.targetId} · actor {item.actorPrincipalId}{" "}
              · {item.result}
            </p>
            <p className="font-mono text-xs break-all text-muted-foreground">
              digest {item.requestDigest}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
