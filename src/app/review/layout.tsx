import Link from "next/link";
export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl py-8">
      <nav
        aria-label="Review workspace"
        className="mb-6 flex gap-4 border-b border-border pb-3"
      >
        <Link className="font-mono text-xs" href="/review">
          assignments
        </Link>
        <Link className="font-mono text-xs" href="/review/adjudications">
          adjudications
        </Link>
        <Link className="font-mono text-xs" href="/review/moderation">
          moderation
        </Link>
      </nav>
      {children}
    </div>
  );
}
