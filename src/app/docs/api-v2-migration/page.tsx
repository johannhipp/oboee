import Link from "next/link";
const replacements = [
  ["GET /api/skills", "GET /api/v2/catalog"],
  ["GET /api/skills/{id}", "GET /api/v2/skills/{skillId}"],
  [
    "GET /api/skills/{id}/content",
    "GET exact skill metadata, purchase, then GET /api/v2/skills/{skillId}/versions/{versionId}/content",
  ],
  [
    "POST /api/rfs",
    "POST /api/v2/rfs after validate and similar-resource preflight",
  ],
  ["GET /api/rfs/{id}", "GET /api/v2/rfs/{rfsId}"],
  ["POST /api/rfs/{id}/fund", "POST /api/v2/rfs/{rfsId}/funding-intents"],
  [
    "POST /api/rfs/{id}/claim",
    "GET application eligibility, then POST /api/v2/rfs/{rfsId}/applications",
  ],
  ["POST /api/rfs/{id}/submit", "POST /api/v2/rfs/{rfsId}/submissions"],
  [
    "GET /api/rfs/{id}/evaluation",
    "GET /api/v2/rfs/{rfsId}/evaluation-workspace",
  ],
  ["POST /api/rfs/{id}/evaluations", "POST /api/v2/rfs/{rfsId}/evaluations"],
  [
    "POST /api/rfs/{id}/evaluation/close",
    "No command; poll the RFS and events because closure is scheduled",
  ],
  [
    "POST /api/rfs/{id}/dispute",
    "POST /api/v2/rfs/{rfsId}/disputes with verified evidence",
  ],
  [
    "POST /api/rfs/{id}/payout/claim",
    "No command; inspect settlement or principal obligations",
  ],
  [
    "POST /api/me/wallet",
    "Create and confirm a signed wallet challenge under /api/v2/me",
  ],
] as const;
export const metadata = { title: "API v2 migration | Oboe" };
export default function MigrationPage() {
  return (
    <main className="mx-auto max-w-4xl py-8">
      <p className="font-mono text-xs">
        <Link className="underline" href="/docs">
          docs
        </Link>{" "}
        / migration
      </p>
      <h1 className="mt-3 text-xl font-medium">Migrate to API v2</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Retired writes are never redirected or proxied because authentication,
        idempotency, payment, and authority semantics changed.
      </p>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {replacements.map(([oldRoute, replacement]) => (
          <div key={oldRoute} className="grid gap-2 py-4 md:grid-cols-2">
            <code className="min-w-0 break-all text-sm text-red-700 line-through">
              {oldRoute}
            </code>
            <code className="min-w-0 break-all text-sm text-emerald-700">{replacement}</code>
          </div>
        ))}
      </div>
      <section className="mt-8">
        <h2 className="font-medium">Required client changes</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Authenticate with a scoped principal-bound API key and activate any
            spend delegation.
          </li>
          <li>
            Generate a unique <code>Idempotency-Key</code> for each logical
            write and reuse it only for retries of the identical body.
          </li>
          <li>
            Use decimal-string base units and the exact token/network returned
            by payment intents.
          </li>
          <li>
            Follow response capabilities and human-action links; a URL never
            grants authority.
          </li>
          <li>
            Resume from <code>/api/v2/me/work</code> and cursor-based activity
            after interruption.
          </li>
        </ol>
      </section>
    </main>
  );
}
