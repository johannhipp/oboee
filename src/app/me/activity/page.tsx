import { anyApi } from "convex/server";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { WorkspaceState } from "@/components/workspace-state";
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
export default async function ActivityPage() {
  const auth = await getAuthenticationStatus();
  if (auth !== "authenticated") return <WorkspaceState title="Activity" message="Sign in to read your resumable event cursor." signInPath="/me/activity" />;
  let data: { items: Activity[]; nextCursor: number } | null = null;
  try { data = toJsonValue(await fetchAuthQuery(anyApi.workspace.myActivity, { afterSequence: 0, limit: 100 })) as { items: Activity[]; nextCursor: number }; } catch {}
  return <main><h1 className="text-xl font-medium">Activity</h1><p className="mt-1 font-mono text-xs text-muted-foreground">resume cursor {data?.nextCursor ?? 0}</p><div className="mt-5 divide-y divide-border border-y border-border">{data?.items.map((item) => <article key={item._id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]"><div><p className="font-medium">{item.publicSummary}</p><p className="mt-1 font-mono text-xs text-muted-foreground break-all">{item.resourceType} · {item.resourceId} · {item.role}</p></div><div className="md:text-right"><p className="font-mono text-xs">{item.eventType}</p><time className="text-xs text-muted-foreground" dateTime={new Date(item.occurredAt).toISOString()}>{new Date(item.occurredAt).toLocaleString()}</time></div></article>)}{data?.items.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No activity yet.</p> : null}</div>{!data ? <WorkspaceState title="Unavailable" message="Activity could not be loaded." /> : null}</main>;
}
