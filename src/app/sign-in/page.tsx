import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SignInForm } from "@/components/sign-in-form"
import { isAuthenticated } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Sign In | Oboe" }

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/me")
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-medium tracking-tight mb-6">sign in</h1>
      <SignInForm />
    </div>
  )
}
