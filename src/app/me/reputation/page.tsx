import { anyApi } from "convex/server";

import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";

type Snapshot = {
  _id: string;
  tag?: string;
  score: number;
  confidence: string;
  independentCount: number;
  finalizedEventCount?: number;
  computedAt: number;
};

type ReputationData = { author: Snapshot[]; reviewer: Snapshot[] };

export const dynamic = "force-dynamic";

function SnapshotList({ items, empty }: { items: Snapshot[]; empty: string }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <article key={item._id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_7rem_9rem] sm:items-baseline">
          <div>
            <p className="font-medium">{item.tag ?? "Global"}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{item.finalizedEventCount ?? item.independentCount} finalized sources</p>
          </div>
          <div>
            <p className="font-mono text-lg">{item.score.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">score</p>
          </div>
          <div>
            <p className="font-mono text-lg capitalize">{item.confidence}</p>
            <p className="text-xs text-muted-foreground">{item.independentCount} independent</p>
          </div>
        </article>
      ))}
      {items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

export default async function ReputationPage() {
  if (await getAuthenticationStatus() !== "authenticated") {
    return <WorkspaceState title="Reputation" message="Sign in to inspect finalized reputation evidence." signInPath="/me/reputation" />;
  }

  let data: ReputationData | null = null;
  try {
    data = toJsonValue(await fetchAuthQuery(anyApi.workspace.myReputation, {})) as ReputationData;
  } catch {
    // Render the unavailable state below.
  }

  if (!data) return <WorkspaceState title="Reputation" message="Reputation data could not be loaded." />;

  return (
    <main>
      <h1 className="text-xl font-medium">Reputation</h1>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Reputation snapshots by role and topic. Scores change only after finalized events.</p>
      <section className="mt-6">
        <h2 className="mb-3 font-medium">Author quality</h2>
        <SnapshotList items={data.author} empty="No finalized author reputation." />
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-medium">Reviewer trust</h2>
        <SnapshotList items={data.reviewer} empty="No finalized reviewer trust." />
      </section>
    </main>
  );
}
