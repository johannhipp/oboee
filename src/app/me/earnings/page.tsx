import { anyApi } from "convex/server";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { WorkspaceState } from "@/components/workspace-state";
import { toJsonValue } from "@/lib/json";

type Obligation = { _id: string; kind: string; amountBaseUnits: string | number; state: string; tokenAddress: string; rfsId?: string; failureCode?: string };
type Batch = { _id: string; amountBaseUnits: string | number; state: string; tokenAddress: string; periodStartedAt: number; periodEndedAt: number };
type EarningsData = { obligations: Obligation[]; purchaseBatches: Batch[] };

export const dynamic = "force-dynamic";
export default async function EarningsPage() {
  if (await getAuthenticationStatus() !== "authenticated") return <WorkspaceState title="Earnings and obligations" message="Sign in to inspect settlement state." signInPath="/me/earnings" />;
  let data: EarningsData | null = null;
  try { const [obligations, batches] = await Promise.all([fetchAuthQuery(anyApi.settlements.myObligations, {}), fetchAuthQuery(anyApi.workspace.myEarnings, {})]); data = toJsonValue({ obligations, purchaseBatches: batches }) as EarningsData; } catch {}
  if (!data) return <WorkspaceState title="Unavailable" message="Settlement data could not be loaded." />;
  const table = (rows: Array<Obligation | Batch>, empty: string) => <div className="divide-y divide-border border-y border-border">{rows.map((row) => <article key={row._id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]"><div><p className="font-medium">{"kind" in row ? row.kind.replaceAll("_", " ") : "Purchase earnings batch"}</p><p className="font-mono text-xs text-muted-foreground break-all">{row._id}{"rfsId" in row && row.rfsId ? ` · RFS ${row.rfsId}` : ""}</p>{"failureCode" in row && row.failureCode ? <p className="mt-1 text-sm text-red-700">{row.failureCode}</p> : null}</div><div className="md:text-right"><p className="font-mono text-sm">{String(row.amountBaseUnits)} base units</p><p className="font-mono text-xs text-muted-foreground">{row.state} · {row.tokenAddress}</p></div></article>)}{rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : null}</div>;
  return <main><h1 className="text-xl font-medium">Earnings and obligations</h1><p className="mt-1 text-sm text-muted-foreground">Decisions, amounts, and transfer states remain separate. There is no client payout-claim action.</p><section className="mt-6"><h2 className="mb-3 font-medium">Settlement obligations</h2>{table(data.obligations, "No settlement obligations.")}</section><section className="mt-8"><h2 className="mb-3 font-medium">Purchase earnings</h2>{table(data.purchaseBatches, "No purchase earnings batches.")}</section></main>;
}
