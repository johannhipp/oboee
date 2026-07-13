"use client";

import { useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { Mppx, tempo } from "mppx/client";

type PaymentCapability = { action: string; allowed: boolean; href: string };

declare global {
  interface Window { ethereum?: EIP1193Provider }
}

const paidFetch = async (href: string, body: unknown) => {
  const provider = window.ethereum;
  if (!provider) throw new Error("An injected wallet is required for browser payment.");
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const account = accounts[0] as `0x${string}` | undefined;
  if (!account) throw new Error("No wallet account was selected.");
  const client = createWalletClient({ account, transport: custom(provider) });
  const payment = Mppx.create({ methods: [tempo({ account, getClient: () => client })], polyfill: false });
  const response = await payment.fetch(href, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string; code?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.code ?? `Payment failed with ${response.status}.`);
};

export function RfsFundingAction({ capability, minimumBaseUnits }: { capability: PaymentCapability; minimumBaseUnits: string }) {
  const [amount, setAmount] = useState(minimumBaseUnits);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!capability.allowed) return null;
  return <form className="mt-5 border-t border-border pt-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setMessage(null); try { await paidFetch(capability.href, { amountBaseUnits: amount }); setMessage("Funding receipt confirmed."); } catch (error) { setMessage(error instanceof Error ? error.message : "Funding failed."); } finally { setBusy(false); } }}>
    <label className="block font-mono text-xs">Amount in base units<input required inputMode="numeric" pattern="[0-9]+" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full border-0 border-b border-border bg-transparent px-0 py-2 text-sm outline-none focus:border-foreground" /></label>
    <button disabled={busy} className="mt-3 border-b border-foreground pb-1 font-mono text-xs disabled:opacity-50">{busy ? "Confirming…" : "Fund request"}</button>
    {message ? <p role="status" className="mt-2 text-xs break-words">{message}</p> : null}
  </form>;
}

export function SkillPurchaseAction({ capability, skillVersionId }: { capability: PaymentCapability; skillVersionId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!capability.allowed) return null;
  return <div className="mt-5 border-t border-border pt-4">
    <button type="button" disabled={busy} className="border-b border-foreground pb-1 font-mono text-xs disabled:opacity-50" onClick={async () => { setBusy(true); setMessage(null); try { await paidFetch(capability.href, { skillVersionId }); setMessage("Purchase receipt confirmed for this version."); } catch (error) { setMessage(error instanceof Error ? error.message : "Purchase failed."); } finally { setBusy(false); } }}>{busy ? "Confirming…" : "Purchase version"}</button>
    {message ? <p role="status" className="mt-2 text-xs break-words">{message}</p> : null}
  </div>;
}
