import { anyApi } from "convex/server";

import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { WorkspaceState } from "@/components/workspace-state";
import { toJsonValue } from "@/lib/json";

export const dynamic = "force-dynamic";

const rows = (value: unknown) => Array.isArray(value) ? value : [];

export default async function WorkPage() {
  const auth = await getAuthenticationStatus();
  if (auth !== "authenticated") return <WorkspaceState title="Account workspace" message={auth === "unavailable" ? "The account backend is unavailable." : "Sign in to resume active work."} signInPath={auth === "unauthenticated" ? "/me" : undefined} />;
  let work: Record<string, unknown> | null = null;
  try { work = toJsonValue(await fetchAuthQuery(anyApi.workspace.myWork, {})) as Record<string, unknown>; } catch { /* Render the explicit unavailable state below. */ }
  if (!work) return <WorkspaceState title="Active work" message="Active work could not be loaded." />;
  const sections = [
    ["humanActions", "Human decisions", "Waiting for your passkey-confirmed decision."],
    ["obligations", "Money and transfer risks", "Unsettled obligations and transfer state."],
    ["reviewAssignments", "Review assignments", "Trusted review work with deadlines."],
    ["assigned", "Assigned fulfillment", "Requests you are responsible for delivering."],
    ["applications", "Applications", "Active, selected, and waitlisted applications."],
    ["requested", "Requested work", "Requests you created that are still active."],
  ] as const;
  return <main><h1 className="text-xl font-medium">Active work</h1><p className="mt-1 text-sm text-muted-foreground">Risk and deadlines are ordered before archive history.</p><div className="mt-6 space-y-8">{sections.map(([key, title, description]) => { const items = rows(work?.[key]); return <section key={key}><div className="flex items-end justify-between border-b border-border pb-2"><div><h2 className="font-medium">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div><span className="font-mono text-xs">{items.length}</span></div>{items.map((item, index) => <pre key={index} className="overflow-x-auto border-b border-border py-3 font-mono text-xs leading-5">{JSON.stringify(item, null, 2)}</pre>)}{items.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nothing active.</p> : null}</section>; })}</div></main>;
}
