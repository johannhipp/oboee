import Link from "next/link";
const links = [
  ["/ops", "overview"],
  ["/ops/roles", "roles"],
  ["/ops/identity", "identity"],
  ["/ops/payments", "payments"],
  ["/ops/settlements", "settlements"],
  ["/ops/evidence", "evidence"],
  ["/ops/recoveries", "recoveries"],
  ["/ops/migrations", "migrations"],
  ["/ops/audit", "audit"],
] as const;
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl py-8">
      <nav
        aria-label="Operator workspace"
        className="mb-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-border pb-3"
      >
        {links.map(([href, label]) => (
          <Link key={href} className="font-mono text-xs" href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
