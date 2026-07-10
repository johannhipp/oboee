"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const post = async (href: string, body: unknown) => {
  const response = await fetch(href, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    code?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(payload.message ?? payload.code ?? "Command failed.");
};

export function OperatorAction({
  href,
  label,
  body = {},
  dangerous = false,
}: {
  href: string;
  label: string;
  body?: Record<string, unknown>;
  dangerous?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const expectedDigest = typeof body.expectedDigest === "string" ? body.expectedDigest : null;
  return (
    <div>
      {expectedDigest ? <label className="mb-2 flex max-w-sm items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />Confirm target digest <code className="break-all">{expectedDigest}</code></label> : null}
      <button
        type="button"
        disabled={busy || Boolean(expectedDigest && !confirmed)}
        className={`border border-border px-3 py-2 font-mono text-xs ${dangerous ? "text-red-700" : ""}`}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await post(href, body);
            setMessage("completed");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "working..." : label}
      </button>
      {message ? (
        <p
          role="status"
          className="mt-1 max-w-sm text-xs text-muted-foreground"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function ReasonAction({
  href,
  label,
  fields = {},
  dangerous = false,
}: {
  href: string;
  label: string;
  fields?: Record<string, unknown>;
  dangerous?: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expectedDigest = typeof fields.expectedDigest === "string" ? fields.expectedDigest : null;
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          await post(href, { ...fields, reason });
          setReason("");
          setMessage("completed");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {expectedDigest ? <label className="flex max-w-sm items-start gap-2 text-xs"><input required type="checkbox" className="mt-0.5" />Confirm target digest <code className="break-all">{expectedDigest}</code></label> : null}
      <label className="sr-only" htmlFor={`${href}-reason`}>
        Reason
      </label>
      <input
        id={`${href}-reason`}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="reason"
        className="min-w-52 border border-border bg-background px-3 py-2 text-xs"
      />
      <button
        disabled={busy}
        className={`border border-border px-3 py-2 font-mono text-xs ${dangerous ? "text-red-700" : ""}`}
      >
        {busy ? "working..." : label}
      </button>
      {message ? (
        <p role="status" className="w-full text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function RoleGrantForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 border-y border-border py-4 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await post("/api/v2/ops/roles", {
            principalId: form.get("principalId"),
            role: form.get("role"),
            tags: String(form.get("tags") ?? "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            activeUntil: new Date(String(form.get("activeUntil"))).getTime(),
            reason: form.get("reason"),
          });
          setMessage("Role granted.");
          event.currentTarget.reset();
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Command failed.",
          );
        }
      }}
    >
      <label className="text-sm">
        Principal ID
        <input
          required
          name="principalId"
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Role
        <select
          name="role"
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        >
          <option value="trusted_reviewer">trusted reviewer</option>
          <option value="security_adjudicator">security adjudicator</option>
          <option value="security_operator">security operator</option>
          <option value="platform_operator">platform operator</option>
        </select>
      </label>
      <label className="text-sm">
        Tag scope
        <input
          name="tags"
          placeholder="security,nextjs"
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Expires
        <input
          required
          name="activeUntil"
          type="datetime-local"
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="text-sm md:col-span-2">
        Reason
        <input
          required
          name="reason"
          className="mt-1 w-full border border-border bg-background px-3 py-2"
        />
      </label>
      <button className="w-fit bg-foreground px-4 py-2 font-mono text-sm text-background">
        grant role
      </button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function FeatureFlagForm({
  flagKey,
  currentMode,
  resourceDigest,
}: {
  flagKey: string;
  currentMode: string;
  resourceDigest: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 border-t border-border py-3 md:grid-cols-[1fr_1fr_2fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await post(
            `/api/v2/ops/feature-flags/${encodeURIComponent(flagKey)}`,
            {
              mode: form.get("mode"),
              cohortIds: String(form.get("cohorts") ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              reason: form.get("reason"),
              expectedDigest: resourceDigest,
            },
          );
          setMessage("updated");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "failed");
        }
      }}
    >
      <div>
        <p className="font-mono text-xs">{flagKey}</p>
        <p className="text-xs text-muted-foreground">current: {currentMode}</p>
        <p
          className="max-w-44 truncate font-mono text-[10px] text-muted-foreground"
          title={resourceDigest}
        >
          {resourceDigest}
        </p>
      </div>
      <select
        name="mode"
        defaultValue={currentMode}
        className="border border-border bg-background px-2 py-1 text-sm"
      >
        <option>off</option>
        <option>shadow</option>
        <option>cohort</option>
        <option>on</option>
      </select>
      <div className="grid gap-2">
        <input
          name="cohorts"
          placeholder="cohort IDs, comma separated"
          className="border border-border bg-background px-2 py-1 text-sm"
        />
        <input
          required
          name="reason"
          placeholder="reason"
          className="border border-border bg-background px-2 py-1 text-sm"
        />
      </div>
      <button className="border border-border px-3 py-2 font-mono text-xs">
        update
      </button>
      {message ? (
        <p role="status" className="md:col-span-4 text-xs">
          {message}
        </p>
      ) : null}
    </form>
  );
}
