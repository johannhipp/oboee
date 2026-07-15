"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AsciiBox } from "@/components/ascii-box"
import { authClient } from "@/lib/auth-client"

type FormMode = "sign-in" | "create-account"

const inputStyle =
  "bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm w-full placeholder:text-gray-400 outline-none focus:border-gray-400"

const primaryButtonStyle =
  "bg-gray-900 text-white font-mono text-sm px-6 py-2 rounded-md disabled:opacity-60"

const secondaryButtonStyle =
  "border border-gray-300 text-gray-700 font-mono text-sm px-6 py-2 rounded-md disabled:opacity-60"

const resolveNextPath = (nextPath: string | null) => {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/me"
  }

  return nextPath
}

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<FormMode>("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false)
  const [isSubmittingPasskey, setIsSubmittingPasskey] = useState(false)

  const nextPath = resolveNextPath(searchParams.get("next"))

  const completeSignIn = () => {
    router.push(nextPath)
    router.refresh()
  }

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmittingEmail(true)

    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          setError(result.error.message ?? "Unable to sign in with email.")
          return
        }
      } else {
        if (!name.trim()) {
          setError("Name is required to create an account.")
          return
        }

        const result = await authClient.signUp.email({
          email,
          password,
          name: name.trim(),
        })

        if (result.error) {
          setError(result.error.message ?? "Unable to create account.")
          return
        }
      }

      completeSignIn()
    } finally {
      setIsSubmittingEmail(false)
    }
  }

  const handlePasskeySignIn = async () => {
    setError(null)
    setIsSubmittingPasskey(true)

    try {
      const result = await authClient.signIn.passkey({ autoFill: true })
      if (result.error) {
        setError(result.error.message ?? "Unable to sign in with passkey.")
        return
      }

      completeSignIn()
    } finally {
      setIsSubmittingPasskey(false)
    }
  }

  return (
    <AsciiBox title="authenticate">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-mono uppercase">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={mode === "sign-in" ? "text-foreground" : "text-muted-foreground"}
          >
            sign in
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => setMode("create-account")}
            className={mode === "create-account" ? "text-foreground" : "text-muted-foreground"}
          >
            create account
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="sign-in-email" className="text-xs font-mono uppercase text-muted-foreground">
              email
            </label>
            <input
              id="sign-in-email"
              type="email"
              autoComplete="email"
              className={inputStyle}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sign-in-password" className="text-xs font-mono uppercase text-muted-foreground">
              password
            </label>
            <input
              id="sign-in-password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              className={inputStyle}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {mode === "create-account" ? (
            <div className="space-y-1.5">
              <label htmlFor="sign-up-name" className="text-xs font-mono uppercase text-muted-foreground">
                display name
              </label>
              <input
                id="sign-up-name"
                type="text"
                autoComplete="name"
                className={inputStyle}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="your name"
                required
              />
            </div>
          ) : null}

          <button type="submit" className={primaryButtonStyle} disabled={isSubmittingEmail}>
            {isSubmittingEmail
              ? mode === "sign-in"
                ? "signing in..."
                : "creating..."
              : mode === "sign-in"
                ? "sign in with email"
                : "create account"}
          </button>
        </form>

        <div className="pt-1 border-t border-border/70">
          <button
            type="button"
            onClick={handlePasskeySignIn}
            className={secondaryButtonStyle}
            disabled={isSubmittingPasskey}
          >
            {isSubmittingPasskey ? "opening passkey..." : "sign in with passkey"}
          </button>
        </div>

        {error ? <p className="text-xs font-mono text-rose-700">{error}</p> : null}
      </div>
    </AsciiBox>
  )
}
