"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Criterion = {
  criterionId: string;
  title: string;
  passConditionKind: string;
  passCondition: string;
  verificationMethod: string;
  weightBps: number;
  requiredForPublication: boolean;
};
type Artifact = {
  artifactId: string;
  criterionId?: string;
  classification: string;
  publicRedaction?: string;
  plaintextSha256: string;
  verificationState: string;
  scanState: string;
  mimeType: string;
  sizeBytes: number;
  downloadHref: string;
};

const command = async (href: string, body: unknown) => {
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

export function ReviewerWorkspace({
  assignmentId,
  state,
  rfsId,
  skillVersionId,
  targetEnvironments,
  criteria,
  evidence,
}: {
  assignmentId: string;
  state: string;
  rfsId: string;
  skillVersionId?: string;
  targetEnvironments: string[];
  criteria: Criterion[];
  evidence: Artifact[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, "passed" | "failed" | "not_run">
  >(() =>
    Object.fromEntries(criteria.map((item) => [item.criterionId, "not_run"])),
  );
  const [reviewText, setReviewText] = useState("");
  const [harmful, setHarmful] = useState(false);
  const targetEnvironment = targetEnvironments[0] ?? "unspecified";
  const artifactsByCriterion = useMemo(
    () => Object.groupBy(evidence, (item) => item.criterionId ?? "unbound"),
    [evidence],
  );

  const run = async (key: string, href: string, body: unknown = {}) => {
    setBusy(key);
    setMessage(null);
    try {
      await command(href, body);
      setMessage("Command completed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setBusy(null);
    }
  };

  if (state === "open")
    return (
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button
          className="border border-border px-3 py-2 text-sm font-mono"
          disabled={Boolean(busy)}
          onClick={() =>
            run("accept", `/api/v2/review-assignments/${assignmentId}/accept`)
          }
        >
          accept assignment
        </button>
        <button
          className="border border-border px-3 py-2 text-sm font-mono text-red-700"
          disabled={Boolean(busy)}
          onClick={() =>
            run("decline", `/api/v2/review-assignments/${assignmentId}/decline`)
          }
        >
          declare conflict and decline
        </button>
        {message ? (
          <p role="status" className="w-full text-sm">
            {message}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-8">
      <section aria-labelledby="proofs-heading">
        <h2 id="proofs-heading" className="text-base font-medium">
          Proofs
        </h2>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {evidence.map((artifact) => (
            <div
              key={artifact.artifactId}
              className="grid gap-3 py-4 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-mono text-xs break-all">
                  {artifact.plaintextSha256}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {artifact.classification} · {artifact.mimeType} ·{" "}
                  {artifact.sizeBytes} bytes · {artifact.verificationState}/
                  {artifact.scanState}
                </p>
                {artifact.publicRedaction ? (
                  <p className="mt-2 text-sm">{artifact.publicRedaction}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <a
                  className="border border-border px-3 py-2 text-xs font-mono"
                  href={artifact.downloadHref}
                >
                  inspect
                </a>
                <button
                  className="border border-border px-3 py-2 text-xs font-mono"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(
                      `verify-${artifact.artifactId}`,
                      `/api/v2/review-assignments/${assignmentId}/evidence/${artifact.artifactId}/verify`,
                      {
                        outcome: "verified",
                        reason:
                          "Independent proof and artifact inspection completed",
                      },
                    )
                  }
                >
                  verify
                </button>
                <button
                  className="border border-border px-3 py-2 text-xs font-mono text-red-700"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(
                      `fail-${artifact.artifactId}`,
                      `/api/v2/review-assignments/${assignmentId}/evidence/${artifact.artifactId}/verify`,
                      {
                        outcome: "failed",
                        reason: "Independent proof inspection failed",
                      },
                    )
                  }
                >
                  fail
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run("evaluation", `/api/v2/rfs/${rfsId}/evaluations`, {
            skillVersionId,
            targetEnvironment,
            criterionResults: criteria.map((criterion) => ({
              criterionId: criterion.criterionId,
              result: results[criterion.criterionId],
              artifactIds: (artifactsByCriterion[criterion.criterionId] ?? [])
                .filter((artifact) => artifact.verificationState === "verified")
                .map((artifact) => artifact.artifactId),
            })),
            reviewText,
            harmful,
          });
        }}
        className="space-y-5"
        aria-labelledby="decision-heading"
      >
        <h2 id="decision-heading" className="text-base font-medium">
          Criterion decision
        </h2>
        {criteria.map((criterion) => (
          <fieldset
            key={criterion.criterionId}
            className="border-t border-border pt-4"
          >
            <legend className="font-medium">{criterion.title}</legend>
            <p className="mt-1 text-sm text-muted-foreground">
              {criterion.passConditionKind}: {criterion.passCondition}
            </p>
            <p className="text-sm text-muted-foreground">
              Verify with {criterion.verificationMethod}; weight{" "}
              {criterion.weightBps / 100}%
              {criterion.requiredForPublication
                ? "; required for publication"
                : ""}
              .
            </p>
            <select
              className="mt-3 border border-border bg-background px-3 py-2 text-sm"
              value={results[criterion.criterionId]}
              onChange={(event) =>
                setResults((current) => ({
                  ...current,
                  [criterion.criterionId]: event.target
                    .value as (typeof results)[string],
                }))
              }
            >
              <option value="not_run">not run</option>
              <option value="passed">passed</option>
              <option value="failed">failed</option>
            </select>
          </fieldset>
        ))}
        <label className="block text-sm">
          Review rationale
          <textarea
            required
            rows={4}
            className="mt-2 w-full border border-border bg-background p-3"
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={harmful}
            onChange={(event) => setHarmful(event.target.checked)}
          />
          Observed a harmful outcome
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={Boolean(busy) || !skillVersionId}
            className="bg-foreground px-4 py-2 text-sm font-mono text-background"
          >
            submit evaluation
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            className="border border-border px-4 py-2 text-sm font-mono"
            onClick={() =>
              run(
                "complete",
                `/api/v2/review-assignments/${assignmentId}/complete`,
              )
            }
          >
            complete assignment
          </button>
        </div>
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
