"use client";

import { useCallback, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

type PasskeyView = {
  id: string;
  name?: string | null;
  createdAt: Date;
};

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<PasskeyView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await authClient.passkey.listUserPasskeys();
    if (result.error) {
      setMessage(result.error.message ?? "Passkeys could not be loaded.");
      return;
    }
    setPasskeys(result.data);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await authClient.passkey.addPasskey({ name: "Oboe passkey" });
      if (result.error) {
        setMessage(result.error.message ?? "Passkey registration failed.");
        return;
      }
      setMessage("Passkey registered.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) {
        setMessage(result.error.message ?? "Passkey removal failed.");
        return;
      }
      setMessage("Passkey removed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-7">
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-medium">Registered passkeys</h2>
        <button type="button" disabled={busy} onClick={() => void add()} className="border-b border-foreground pb-1 font-mono text-xs">add passkey</button>
      </div>
      {passkeys.map((passkey) => <article key={passkey.id} className="grid gap-2 border-b border-border py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-mono text-sm">{passkey.name || "Unnamed passkey"}</p>
          <p className="mt-1 text-xs text-muted-foreground">registered {new Date(passkey.createdAt).toLocaleString()}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void remove(passkey.id)} className="w-fit font-mono text-xs underline">remove</button>
      </article>)}
      {passkeys.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No passkeys registered.</p> : null}
    </section>
    <p className="border-l-2 border-foreground pl-3 text-sm text-muted-foreground">A recent passkey verification is required for human approvals, adjudication, account recovery, role changes, and operator overrides.</p>
    {message ? <p role="status" className="border-y border-border py-3 font-mono text-xs">{message}</p> : null}
  </div>;
}
