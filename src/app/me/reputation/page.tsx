import { anyApi } from "convex/server";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { WorkspaceState } from "@/components/workspace-state";
import { toJsonValue } from "@/lib/json";

type Snapshot = { _id: string; tag?: string; score: number; confidenceBps: number; independentCount: number; finalizedEventCount?: number; computedAt: number };
type ReputationData = { author: Snapshot[]; reviewer: Snapshot[] };

export const dynamic = "force-dynamic";
export default async function ReputationPage() {
  if (await getAuthenticationStatus() !== "authenticated") return <WorkspaceState title="Reputation" message="Sign in to inspect finalized reputation evidence." signInPath="/me/reputation" />;
  let data: ReputationData | null = null;
  try { data = toJsonValue(await fetchAuthQuery(anyApi.workspace.myReputation, {})) as ReputationData; } catch {}
  if (!data) return <WorkspaceState title="Unavailable" message="Reputation could not be loaded." />;
  const rows = (items: Snapshot[], empty: string) => <div className="divide-y divide-border border-y border-border">{items.map((item) => <article key={item._id} className="grid gap-2 py-4 sm:grid-cols-3"><div><p className="font-medium">{item.tag ?? "Global"}</p><p className="font-mono text-xs text-muted-foreground">{item.finalizedEventCount ?? item.independentCount} finalized sources</p></div><div><p className="font-mono text-lg">{item.score}</p><p className="text-xs text-muted-foreground">score</p></div><div><p className="font-mono text-lg">{item.confidenceBps / 100}%</p><p className="text-xs text-muted-foreground">confidence · {item.independentCount} independent</p></div></article>)}{items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : null}</div>;
  return <main><h1 className="text-xl font-medium">Reputation</h1><p className="mt-1 text-sm text-muted-foreground">Scores show confidence and independent count; unresolved work has no finalized effect.</p><section className="mt-6"><h2 className="mb-3 font-medium">Author quality</h2>{rows(data.author, "No finalized author reputation yet.")}</section><section className="mt-8"><h2 className="mb-3 font-medium">Reviewer trust</h2>{rows(data.reviewer, "No finalized reviewer trust yet.")}</section></main>;
}
