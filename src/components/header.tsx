"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { authClient } from "@/lib/auth-client"

const navLinks = [
  { href: "/browse", label: "browse" },
  { href: "/new", label: "new request" },
  { href: "/docs", label: "docs" },
  { href: "/me", label: "profile" },
]

const subscribeToHydration = () => () => {}
const getClientHydrationSnapshot = () => true
const getServerHydrationSnapshot = () => false

export function Header() {
  const pathname = usePathname()
  const { data: session } = authClient.useSession()
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  )
  const nextPath = pathname === "/sign-in" ? "/me" : pathname

  const handleSignOut = async () => {
    await authClient.signOut()
  }

  return (
    <header className="sticky top-0 z-50 overflow-x-auto bg-white/95 px-4 pt-4 backdrop-blur-sm">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-white"
      >
        skip to content
      </a>
      <nav className="mx-auto flex min-w-max max-w-5xl items-center gap-3 border-b border-border bg-white pb-3 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/" className="text-foreground hover:text-muted-foreground transition-colors duration-150" title="oboe">
            <svg width="12" height="30" viewBox="0 0 12 30" fill="currentColor" aria-label="oboe">
              <rect x="6" y="0" width="3" height="3" />
              <rect x="3" y="3" width="6" height="3" />
              <rect x="0" y="6" width="9" height="3" />
              <rect x="3" y="9" width="6" height="3" />
              <rect x="3" y="12" width="9" height="3" />
              <rect x="3" y="15" width="6" height="3" />
              <rect x="0" y="18" width="9" height="3" />
              <rect x="0" y="21" width="12" height="6" />
              <rect x="3" y="27" width="6" height="3" />
            </svg>
          </Link>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-xs font-mono transition-colors duration-150 sm:text-sm ${
                pathname.startsWith(href)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="border-l border-border pl-3 sm:pl-6">
          {hasHydrated && session?.user ? (
            <button
              type="button"
              onClick={handleSignOut}
              title={`Sign out ${session.user.name}`}
              className="whitespace-nowrap text-xs font-mono text-muted-foreground hover:text-foreground transition-colors duration-150 sm:text-sm"
            >
              <span className="hidden max-w-36 truncate sm:inline">
                {session.user.name} (sign out)
              </span>
              <span className="sm:hidden">sign out</span>
            </button>
          ) : (
            <Link
              href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors duration-150 sm:text-sm"
            >
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
