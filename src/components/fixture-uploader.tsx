"use client";

import { useState } from "react";

const post = async (path: string, body: unknown) => {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message ?? "Fixture request failed.");
  return payload.data as Record<string, unknown>;
};

const sha256 = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export function FixtureUploader({ onRegistered }: { onRegistered: (fixtureVersionId: string) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return <form className="grid gap-3 border-y border-border py-5 sm:grid-cols-2" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const fields = new FormData(event.currentTarget); const file = fields.get("bundle");
      if (!(file instanceof File) || file.size === 0) throw new Error("Select a fixture bundle.");
      const bytes = await file.arrayBuffer(); const manifest = String(fields.get("manifest"));
      const metadata = { visibility: fields.get("visibility"), manifestSha256: await sha256(new TextEncoder().encode(manifest).buffer), bundleSha256: await sha256(bytes), environmentContract: String(fields.get("environmentContract")) };
      const intent = await post("/api/v2/fixtures/upload-intents", metadata);
      const upload = await fetch(String(intent.uploadUrl), { method: "POST", headers: { "content-type": file.type || "application/zip" }, body: file });
      if (!upload.ok) throw new Error("Fixture bundle upload failed.");
      const uploaded = await upload.json() as { storageId: string };
      const result = await post("/api/v2/fixtures", { uploadIntentId: intent.uploadIntentId, storageId: uploaded.storageId });
      const id = String(result.fixtureVersionId); onRegistered(id); setMessage(`Registered fixture ${id}.`); event.currentTarget.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Fixture registration failed."); }
    finally { setBusy(false); }
  }}><div className="sm:col-span-2"><h2 className="font-medium">Standard fixture</h2><p className="text-xs text-muted-foreground">Upload an inert test bundle. Oboe stores immutable hashes; agents execute it only in isolation.</p></div><label className="text-sm">Bundle<input required type="file" name="bundle" accept=".zip,application/zip,application/json" className="mt-1 block w-full text-sm" /></label><label className="text-sm">Visibility<select name="visibility" className="mt-1 h-10 w-full border border-border bg-background px-3"><option value="restricted">restricted</option><option value="public">public</option></select></label><label className="text-sm sm:col-span-2">Manifest JSON<textarea required name="manifest" rows={3} className="mt-1 w-full border border-border bg-background p-3 font-mono text-xs" /></label><label className="text-sm sm:col-span-2">Environment contract<input required name="environmentContract" placeholder="node-22, no network, disposable workspace" className="mt-1 w-full border border-border bg-background px-3 py-2" /></label><button disabled={busy} className="w-fit border border-foreground px-4 py-2 font-mono text-sm disabled:opacity-50">{busy ? "uploading..." : "register fixture"}</button>{message ? <p role="status" className="self-center text-sm break-all">{message}</p> : null}</form>;
}
