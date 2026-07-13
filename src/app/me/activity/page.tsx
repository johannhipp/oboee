import { anyApi } from "convex/server";

import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";

type Activity = {
  _id: string;
  eventType: string;
  publicSummary: string;
  resourceType: string;
  resourceId: string;
  role: string;
  sequence: number;
  occurredAt: number;
};

export const dynamic = "force-dynamic";

const humanize = (value: string) => value.replaceAll(".", " ").replaceAll("_", " ");

export default async function ActivityPage() {
  const auth = await getAuthenticationStatus();
  if (auth !== "authenticated") {
    return <WorkspaceState title="Activity" message="Sign in to read account events." signInPath="/me/activity" />;
  }

  let data: { items: Activity[]; nextCursor: number } | null = null;
  try {
    data = toJsonValue(await fetchAuthQuery(anyApi.workspace.myActivity, { afterSequence: 0, limit: 100 })) as { items: Activity[]; nextCursor: number };
  } catch {
    // Render the unavailable state below.
  }

  return (
    <main>
      <h1 className="text-xl font-medium">Activity</h1>
      <p className="mt-1 text-sm text-muted-foreground">Account events in sequence order.</p>
      {!data ? <WorkspaceState title="Unavailable" message="Activity could not be loaded." /> : (
        <div className="mt-5 divide-y divide-border border-y border-border">
          {data.items.map((item) => (
            <article key={item._id} className="py-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className="font-medium">{item.publicSummary}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{humanize(item.eventType)}</p>
                </div>
                <time className="text-xs text-muted-foreground sm:text-right" dateTime={new Date(item.occurredAt).toISOString()}>
                  {new Date(item.occurredAt).toLocaleString()}
                </time>
              </div>
              <details className="mt-3 border-t border-border pt-2">
                <summary className="w-fit cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">
                  Identifiers and sequence
                </summary>
                <dl className="mt-2 grid gap-2 border-y border-border py-3 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="font-mono text-muted-foreground">resource</dt>
                  <dd className="break-all font-mono">{item.resourceType}:{item.resourceId}</dd>
                  <dt className="font-mono text-muted-foreground">role</dt>
                  <dd className="font-mono">{item.role}</dd>
                  <dt className="font-mono text-muted-foreground">sequence</dt>
                  <dd className="font-mono">{item.sequence}</dd>
                </dl>
              </details>
            </article>
          ))}
          {data.items.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No activity.</p> : null}
        </div>
      )}
      {data ? (
        <details className="mt-4">
          <summary className="w-fit cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">Cursor for the next page</summary>
          <p className="mt-2 border-y border-border py-3 font-mono text-xs">{data.nextCursor}</p>
        </details>
      ) : null}
    </main>
  );
}
