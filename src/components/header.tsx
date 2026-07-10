"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { authClient } from "@/lib/auth-client"

const navLinks = [
  { href: "/browse", label: "browse" },
  { href: "/new", label: "new rfs" },
  { href: "/docs", label: "docs" },
  { href: "/me", label: "profile" },
]

const pixelClip = `polygon(
  9px 0, calc(100% - 9px) 0,
  calc(100% - 6px) 3px,
  calc(100% - 3px) 6px,
  100% 9px,
  100% calc(100% - 9px),
  calc(100% - 3px) calc(100% - 6px),
  calc(100% - 6px) calc(100% - 3px),
  calc(100% - 9px) 100%,
  9px 100%,
  6px calc(100% - 3px),
  3px calc(100% - 6px),
  0 calc(100% - 9px),
  0 9px,
  3px 6px,
  6px 3px
)`

const pixelBorder = [
  "drop-shadow(2px 0 0 #c4c4c4)",
  "drop-shadow(-2px 0 0 #c4c4c4)",
  "drop-shadow(0 2px 0 #c4c4c4)",
  "drop-shadow(0 -2px 0 #c4c4c4)",
].join(" ")

export function Header() {
  const pathname = usePathname()
  const { data: session } = authClient.useSession()
  const nextPath = pathname === "/sign-in" ? "/me" : pathname

  const handleSignOut = async () => {
    await authClient.signOut()
  }

  return (
    <header className="sticky top-0 z-50 overflow-x-auto px-2 pt-4 sm:px-4">
      <div className="mx-auto w-max" style={{ filter: pixelBorder }}>
        <nav
          className="flex h-11 items-center gap-3 bg-white px-3 sm:gap-6 sm:px-6"
          style={{ clipPath: pixelClip }}
        >
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
              className={`text-sm font-mono transition-colors duration-150 ${
                pathname.startsWith(href)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="ml-1 border-l border-gray-200 pl-2 sm:ml-2 sm:pl-3">
            {session?.user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="max-w-36 truncate text-sm font-mono text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                {session.user.name} (sign out)
              </button>
            ) : (
              <Link
                href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                className="text-sm font-mono text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
