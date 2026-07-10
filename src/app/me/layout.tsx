import Link from "next/link";

const links = [
  ["/me", "work"], ["/me/activity", "activity"], ["/me/actions", "actions"], ["/me/agents", "agents"],
  ["/me/wallets", "wallets"], ["/me/earnings", "earnings"], ["/me/reputation", "reputation"],
] as const;

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl py-8"><nav aria-label="Account workspace" className="mb-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-border pb-3">{links.map(([href, label]) => <Link key={href} href={href} className="font-mono text-xs underline-offset-4 hover:underline">{label}</Link>)}</nav>{children}</div>;
}
