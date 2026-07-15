"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const nextPath = pathname === "/sign-in" ? "/me" : pathname

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 flex justify-center pt-4 px-2 sm:px-4">
      <div className="max-w-full" style={{ filter: pixelBorder }}>
        <nav
          className="h-11 max-w-full px-3 sm:px-6 flex items-center gap-3 sm:gap-6 bg-white"
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
          <div className="ml-0 sm:ml-2 pl-2 sm:pl-3 border-l border-gray-200 min-w-0">
            {session?.user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="block whitespace-nowrap text-sm font-mono text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                <span className="sm:hidden">sign out</span>
                <span className="hidden max-w-28 truncate sm:block">
                  {session.user.name} (sign out)
                </span>
              </button>
            ) : (
              <Link
                href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                className="whitespace-nowrap text-sm font-mono text-muted-foreground hover:text-foreground transition-colors duration-150"
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
