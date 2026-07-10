"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FixtureUploader } from "@/components/fixture-uploader";

type Criterion = {
  id: string;
  title: string;
  assertion: string;
  verificationMethod: string;
  weightBps: string;
  tags: string;
  requiredForPublication: boolean;
  kind: "boolean_assertion" | "fixture_assertion";
  fixtureVersion: string;
};
type Similar = { resourceType: string; resourceId: string; title: string; scoreBps: number; matchedTags: string[] };
type Preflight = {
  validation: {
    riskTier: string;
    reviewReserveBaseUnits: string;
    totalFundingTargetBaseUnits: string;
  };
  similar: Similar[];
  payloadDigest: string;
};
const input =
  "mt-1 w-full border border-border bg-background px-3 py-2 text-sm";
const tags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
const key = () => crypto.randomUUID();

const request = async (path: string, body: unknown) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key() },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    data?: unknown;
    code?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(result.message ?? result.code ?? "Request failed.");
  return result.data;
};

export function NewRfsForm({
  defaultTokenAddress,
  defaultNetwork,
}: {
  defaultTokenAddress: string;
  defaultNetwork: string;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<Criterion[]>([
    {
      id: "primary",
      title: "Mitigates the requested vulnerability",
      assertion:
        "The supplied verification procedure passes after applying the skill",
      verificationMethod:
        "Run the documented isolated fixture before and after applying the skill",
      weightBps: "10000",
      tags: "security",
      requiredForPublication: true,
      kind: "boolean_assertion",
      fixtureVersion: "",
    },
  ]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const totalWeight = useMemo(
    () =>
      criteria.reduce(
        (sum, criterion) => sum + Number(criterion.weightBps || 0),
        0,
      ),
    [criteria],
  );

  const payloadFrom = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      title: String(data.get("title")),
      description: String(data.get("description")),
      scope: String(data.get("scope")),
      tags: tags(String(data.get("tags"))),
      targetEnvironments: tags(String(data.get("targetEnvironments"))),
      criteria: criteria.map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        passCondition: criterion.kind === "fixture_assertion" ? { kind: "fixture_assertion" as const, fixtureVersion: criterion.fixtureVersion, assertion: criterion.assertion } : { kind: "boolean_assertion" as const, assertion: criterion.assertion },
        verificationMethod: criterion.verificationMethod,
        weightBps: Number(criterion.weightBps),
        tags: tags(criterion.tags),
        requiredForPublication: criterion.requiredForPublication,
      })),
      workEscrowBaseUnits: String(data.get("workEscrowBaseUnits")),
      minimumContributionBaseUnits: String(
        data.get("minimumContributionBaseUnits"),
      ),
      tokenAddress: String(data.get("tokenAddress")),
      network: String(data.get("network")),
      fundingDurationDays: Number(data.get("fundingDurationDays")),
      deliveryDurationDays: Number(data.get("deliveryDurationDays")),
      consideredResourceIds: tags(String(data.get("consideredResourceIds"))),
      unmetGapReason: String(data.get("unmetGapReason")),
    };
  };

  const preflightForm = async (form: HTMLFormElement) => {
    const payload = payloadFrom(form);
    const payloadDigest = JSON.stringify(payload);
    setBusy(true);
    setError(null);
    try {
      const validation = (await request(
        "/api/v2/rfs/validate",
        payload,
      )) as Preflight["validation"];
      const similar = (await request("/api/v2/rfs/similar", {
        title: payload.title,
        tags: payload.tags,
        limit: 10,
      })) as Similar[];
      setPreflight({ validation, similar, payloadDigest });
    } catch (cause) {
      setPreflight(null);
      setError(cause instanceof Error ? cause.message : "Preflight failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl py-8">
      <h1 className="text-xl font-medium">New request for skill</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Define observable criteria before funding. Criterion weights must total
        10,000 bps and required criteria at least 6,000 bps.
      </p>
      <div className="mt-6">
        <FixtureUploader onRegistered={(fixtureVersionId) => setCriteria((current) => current.map((item, index) => index === 0 ? { ...item, kind: "fixture_assertion", fixtureVersion: fixtureVersionId } : item))} />
      </div>
      <form
        className="mt-6 space-y-7"
        onChange={() => setPreflight(null)}
        onSubmit={async (event) => {
          event.preventDefault();
          const payload = payloadFrom(event.currentTarget);
          const digest = JSON.stringify(payload);
          if (!preflight || preflight.payloadDigest !== digest) {
            await preflightForm(event.currentTarget);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const result = (await request("/api/v2/rfs", payload)) as {
              rfsId: string;
            };
            router.push(`/browse/${result.rfsId}`);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Creation failed.",
            );
            setBusy(false);
          }
        }}
      >
        <section className="grid gap-4 border-y border-border py-5">
          <label className="text-sm">
            Title
            <input required name="title" className={input} />
          </label>
          <label className="text-sm">
            Description
            <textarea required name="description" rows={3} className={input} />
          </label>
          <label className="text-sm">
            Scope
            <textarea required name="scope" rows={4} className={input} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Tags
              <input
                required
                name="tags"
                placeholder="security,nextjs"
                className={input}
              />
            </label>
            <label className="text-sm">
              Target environments
              <input
                required
                name="targetEnvironments"
                placeholder="node-22,next-16"
                className={input}
              />
            </label>
          </div>
        </section>
        <section>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Acceptance criteria</h2>
              <p
                className={`text-xs ${totalWeight === 10_000 ? "text-muted-foreground" : "text-red-700"}`}
              >
                total weight: {totalWeight}/10,000 bps
              </p>
            </div>
            <button
              type="button"
              className="border border-border px-3 py-2 font-mono text-xs"
              onClick={() =>
                setCriteria((current) => [
                  ...current,
                  {
                    id: `criterion-${current.length + 1}`,
                    title: "",
                    assertion: "",
                    verificationMethod: "",
                    weightBps: "0",
                    tags: "",
                    requiredForPublication: false,
                    kind: "boolean_assertion",
                    fixtureVersion: "",
                  },
                ])
              }
            >
              add criterion
            </button>
          </div>
          <div className="mt-3 space-y-4">
            {criteria.map((criterion, index) => (
              <fieldset
                key={`${criterion.id}-${index}`}
                className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2"
              >
                <legend className="font-mono text-xs">
                  criterion {index + 1}
                </legend>
                <label className="text-sm">
                  Stable key
                  <input
                    required
                    value={criterion.id}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, id: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  Title
                  <input
                    required
                    value={criterion.title}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Pass condition type
                  <select value={criterion.kind} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as Criterion["kind"] } : item))} className={input}>
                    <option value="boolean_assertion">Boolean assertion</option>
                    <option value="fixture_assertion">Fixture assertion</option>
                  </select>
                </label>
                {criterion.kind === "fixture_assertion" ? <label className="text-sm sm:col-span-2">Fixture version ID<input required value={criterion.fixtureVersion} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fixtureVersion: event.target.value } : item))} className={input} /></label> : null}
                <label className="text-sm sm:col-span-2">
                  Observable pass assertion
                  <textarea
                    required
                    rows={2}
                    value={criterion.assertion}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, assertion: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Verification method
                  <input
                    required
                    value={criterion.verificationMethod}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                verificationMethod: event.target.value,
                              }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  Weight (bps)
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000"
                    value={criterion.weightBps}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, weightBps: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  Tags
                  <input
                    value={criterion.tags}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, tags: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={criterion.requiredForPublication}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                requiredForPublication: event.target.checked,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  Required for publication
                </label>
                {criteria.length > 1 ? (
                  <button
                    type="button"
                    className="w-fit font-mono text-xs text-red-700 underline"
                    onClick={() =>
                      setCriteria((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    remove
                  </button>
                ) : null}
              </fieldset>
            ))}
          </div>
        </section>
        <section className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
          <label className="text-sm">
            Work escrow (base units)
            <input
              required
              name="workEscrowBaseUnits"
              inputMode="numeric"
              defaultValue="100000000"
              className={input}
            />
          </label>
          <label className="text-sm">
            Minimum contribution (base units)
            <input
              required
              name="minimumContributionBaseUnits"
              inputMode="numeric"
              defaultValue="1000000"
              className={input}
            />
          </label>
          <label className="text-sm">
            Token address
            <input
              required
              name="tokenAddress"
              defaultValue={defaultTokenAddress}
              className={input}
            />
          </label>
          <label className="text-sm">
            Network
            <input
              required
              name="network"
              defaultValue={defaultNetwork}
              className={input}
            />
          </label>
          <label className="text-sm">
            Funding duration (days)
            <input
              required
              name="fundingDurationDays"
              type="number"
              min="1"
              max="30"
              defaultValue="14"
              className={input}
            />
          </label>
          <label className="text-sm">
            Delivery duration (days)
            <input
              required
              name="deliveryDurationDays"
              type="number"
              min="1"
              max="30"
              defaultValue="7"
              className={input}
            />
          </label>
        </section>
        <section className="grid gap-4">
          <label className="text-sm">
            Considered skill/RFS IDs
            <input
              name="consideredResourceIds"
              placeholder="opaque-id-1,opaque-id-2"
              className={input}
            />
          </label>
          <label className="text-sm">
            Why existing resources do not meet this need
            <textarea
              required
              name="unmetGapReason"
              rows={3}
              className={input}
            />
          </label>
        </section>
        {preflight ? (
          <section className="border border-border p-4" aria-live="polite">
            <h2 className="font-medium">Preflight passed</h2>
            <p className="mt-1 text-sm">
              Risk tier {preflight.validation.riskTier}; review reserve{" "}
              {preflight.validation.reviewReserveBaseUnits}; total funding
              target {preflight.validation.totalFundingTargetBaseUnits} base
              units.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Similar resources found: {preflight.similar.length}. Record the IDs above when considered.
            </p>
            <div className="mt-3 divide-y divide-border border-y border-border">{preflight.similar.map((item) => <div key={`${item.resourceType}:${item.resourceId}`} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-medium">{item.title}</p><p className="font-mono text-xs text-muted-foreground break-all">{item.resourceType} · {item.resourceId}</p></div><p className="font-mono text-xs sm:text-right">{item.scoreBps / 100}% match<br />{item.matchedTags.join(", ") || "title match"}</p></div>)}</div>
          </section>
        ) : null}
        <button
          disabled={busy || totalWeight !== 10_000}
          className="bg-foreground px-5 py-2 font-mono text-sm text-background disabled:opacity-50"
        >
          {busy ? "working..." : preflight ? "create request" : "run preflight"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
