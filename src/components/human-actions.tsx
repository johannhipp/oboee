"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

const humanize = (value: string) => value.replaceAll("_", " ");

export function HumanActions({ actions }: { actions: Record<string, unknown>[] }) {
  const [message, setMessage] = useState<string | null>(null);

  const reauthenticate = async () => {
    const result = await authClient.signIn.passkey();
    setMessage(result.error ? result.error.message ?? "Passkey verification failed." : "Passkey verified for ten minutes.");
  };

  const decide = async (actionId: string, decision: "approve" | "decline") => {
    const response = await fetch(`/api/v2/me/human-actions/${actionId}/${decision}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: "{}",
    });
    const payload = await response.json();
    setMessage(response.ok ? `Action ${decision}d.` : payload.message ?? "Decision failed.");
    if (response.ok) location.reload();
  };

  return (
    <div>
      <button type="button" onClick={() => void reauthenticate()} className="border-b border-foreground pb-1 font-mono text-sm">
        Verify passkey
      </button>
      <div className="mt-5 divide-y divide-border border-y border-border">
        {actions.map((action, index) => {
          const id = typeof action._id === "string" ? action._id : typeof action.id === "string" ? action.id : "";
          const actionType = humanize(String(action.actionType ?? "human decision"));
          const reason = String(action.reason ?? "A protected action is waiting for approval.");
          const expiresAt = typeof action.expiresAt === "number" ? new Date(action.expiresAt).toLocaleString() : "unknown";

          return (
            <article key={id || index} className="py-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Requires approval</p>
                  <h2 className="mt-1 font-medium capitalize">{actionType}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{reason}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground sm:text-right">expires {expiresAt}</p>
              </div>
              <details className="mt-3 border-t border-border pt-2">
                <summary className="w-fit cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground">Identifiers and digest</summary>
                <dl className="mt-2 grid gap-2 border-y border-border py-3 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="font-mono text-muted-foreground">resource</dt>
                  <dd className="break-all font-mono">{String(action.resourceType ?? "resource")}:{String(action.resourceId ?? "")}</dd>
                  <dt className="font-mono text-muted-foreground">payload digest</dt>
                  <dd className="break-all font-mono">{String(action.payloadDigest ?? "")}</dd>
                </dl>
              </details>
              <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs">
                <button type="button" onClick={() => void decide(id, "approve")} className="border-b border-foreground pb-1">Approve</button>
                <button type="button" onClick={() => void decide(id, "decline")} className="border-b border-border pb-1 hover:border-foreground">Decline</button>
              </div>
            </article>
          );
        })}
        {actions.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No pending actions.</p> : null}
      </div>
      {message ? <p role="status" className="mt-4 border-y border-border py-3 font-mono text-xs">{message}</p> : null}
    </div>
  );
}
