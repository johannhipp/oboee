import { anyApi } from "convex/server";
import { ReasonAction } from "@/components/operator-controls";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Obligation = {
  _id: string;
  sourceType: string;
  sourceId: string;
  kind: string;
  amountBaseUnits: string;
  tokenAddress: string;
  network: string;
  state: string;
  decisionReference: string;
  resourceDigest: string;
};
type Data = { obligations: Obligation[] };
export default async function PaymentsPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Payment obligations"
        message="Sign in with a platform operator account."
        signInPath="/ops/payments"
      />
    );
  let data: Data;
  try {
    data = toJsonValue(
      await fetchAuthQuery(anyApi.operations.paymentQueue, {}),
    ) as Data;
  } catch {
    return (
      <WorkspaceState
        title="Payment obligations"
        message="The platform operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Payment obligations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Amounts and destinations are decision-derived snapshots. Operators may
        hold an unsettled obligation but cannot edit it.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {data.obligations.map((item) => (
          <article
            key={item._id}
            className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-medium">
                {item.kind.replaceAll("_", " ")} · {item.amountBaseUnits}
              </p>
              <p className="font-mono text-xs break-all">
                {item.network}:{item.tokenAddress}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {item.state} · {item.sourceType}:{item.sourceId} ·{" "}
                {item.decisionReference}
              </p>
            </div>
            {item.state === "pending" || item.state === "held" ? (
              <ReasonAction
                href={`/api/v2/ops/obligations/${item._id}/hold`}
                label={item.state === "held" ? "release hold" : "hold"}
                fields={{ held: item.state !== "held", expectedDigest: item.resourceDigest }}
                dangerous={item.state !== "held"}
              />
            ) : null}
          </article>
        ))}
      </div>
    </main>
  );
}
