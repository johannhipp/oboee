import { anyApi } from "convex/server";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
type Transfer = {
  _id: string;
  obligationId: string;
  state: string;
  amountBaseUnits: string;
  network: string;
  tokenAddress: string;
  transactionHash?: string;
  attempts: number;
  errorCode?: string;
  createdAt: number;
  confirmedAt?: number;
};
type Data = { transfers: Transfer[] };
export default async function SettlementsPage() {
  if ((await getAuthenticationStatus()) !== "authenticated")
    return (
      <WorkspaceState
        title="Settlement transfers"
        message="Sign in with a platform operator account."
        signInPath="/ops/settlements"
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
        title="Settlement transfers"
        message="The platform operator role is required."
      />
    );
  }
  return (
    <main>
      <h1 className="text-xl font-medium">Settlement transfers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Receipt confirmation remains custody-service owned; no browser command
        can mark a transfer settled.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {data.transfers.map((item) => (
          <article key={item._id} className="py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">
                {item.amountBaseUnits} · {item.state}
              </p>
              <p className="font-mono text-xs">attempts {item.attempts}</p>
            </div>
            <p className="mt-1 font-mono text-xs break-all">
              {item.transactionHash ?? item._id}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.network}:{item.tokenAddress}
              {item.errorCode ? ` · ${item.errorCode}` : ""}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
