import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SignInForm } from "@/components/sign-in-form"
import { DataToast } from "@/components/data-fallback"
import { convexUnavailableMessage, getAuthenticationStatus } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Sign In | Oboe" }

export default async function SignInPage() {
  const authStatus = await getAuthenticationStatus()

  if (authStatus === "authenticated") {
    redirect("/me")
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      {authStatus === "unavailable" ? <DataToast message={convexUnavailableMessage()} /> : null}
      <h1 className="text-xl font-medium tracking-tight mb-6">sign in</h1>
      <SignInForm />
    </main>
  )
}
