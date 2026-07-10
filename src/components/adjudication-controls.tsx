"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Criterion = { criterionId: string; title: string; weightBps: number; passCondition: string };

const send = async (path: string, body: unknown = {}) => {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
  const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "Command failed.");
};

export function AdjudicationControls({ disputeId, state, criteria }: { disputeId: string; state: string; criteria: Criterion[] }) {
  const router = useRouter(); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, "passed" | "failed" | "not_run">>(() => Object.fromEntries(criteria.map((item) => [item.criterionId, "not_run"])));
  if (state === "open") return <div><button className="border border-foreground px-3 py-2 font-mono text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await send(`/api/v2/adjudications/${disputeId}/claim`); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Claim failed."); } finally { setBusy(false); } }}>claim with recent passkey</button>{message ? <p role="status" className="mt-2 text-sm">{message}</p> : null}</div>;
  return <form className="mt-4 space-y-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const fields = new FormData(event.currentTarget); try { await send(`/api/v2/adjudications/${disputeId}/resolve`, { resolution: fields.get("resolution"), criterionResults: criteria.map((criterion) => ({ criterionId: criterion.criterionId, result: results[criterion.criterionId] })), rationale: fields.get("rationale"), publicRedaction: fields.get("publicRedaction"), conflictDeclared: false }); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Resolution failed."); } finally { setBusy(false); } }}>
    <div className="divide-y divide-border border-y border-border">{criteria.map((criterion) => <label key={criterion.criterionId} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]"><span><span className="block text-sm font-medium">{criterion.title}</span><span className="block text-xs text-muted-foreground">{criterion.weightBps / 100}% · {criterion.passCondition}</span></span><select value={results[criterion.criterionId]} onChange={(event) => setResults((current) => ({ ...current, [criterion.criterionId]: event.target.value as typeof results[string] }))} className="border border-border bg-background px-3 py-2 text-sm"><option value="not_run">not run</option><option value="passed">passed</option><option value="failed">failed</option></select></label>)}</div>
    <label className="block text-sm">Fixed resolution<select required name="resolution" className="mt-1 w-full border border-border bg-background px-3 py-2"><option value="insufficient_evidence">insufficient evidence</option><option value="clear_hold">clear hold</option><option value="request_revision">request revision</option><option value="accept_partial">accept partial</option><option value="block_harmful">block harmful</option><option value="reject_fraud">reject fraud</option><option value="confirm_abandonment">confirm abandonment</option></select></label>
    <label className="block text-sm">Private adjudicator rationale<textarea required name="rationale" rows={3} className="mt-1 w-full border border-border bg-background p-3" /></label>
    <label className="block text-sm">Public redaction<textarea required name="publicRedaction" rows={2} className="mt-1 w-full border border-border bg-background p-3" /></label>
    <label className="flex items-center gap-2 text-sm"><input required type="checkbox" />I have no conflict with the requester, fulfiller, reporter, or evidence owners.</label>
    <button disabled={busy} className="border border-foreground px-4 py-2 font-mono text-xs">resolve with recent passkey</button>{message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
