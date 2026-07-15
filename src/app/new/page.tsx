import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { NewRfsForm } from "@/components/new-rfs-form"
import { AsciiBox } from "@/components/ascii-box"
import { DataToast } from "@/components/data-fallback"
import { convexUnavailableMessage, getAuthenticationStatus } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "New request | Oboe" }

export default async function NewRequestPage() {
  const authStatus = await getAuthenticationStatus()

  if (authStatus === "unavailable") {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <DataToast message={convexUnavailableMessage()} />
        <AsciiBox title="new request">
          <div className="space-y-4">
            <div className="h-4 w-2/3 border-b border-border" />
            <div className="h-24 w-full border-y border-border" />
            <div className="h-10 w-full border-b border-border" />
            <p className="font-mono text-xs text-muted-foreground">
              Request creation needs auth and Convex writes, so the form is unavailable until the backend is configured.
            </p>
          </div>
        </AsciiBox>
      </main>
    )
  }

  if (authStatus === "unauthenticated") {
    redirect("/sign-in?next=%2Fnew")
  }

  return <NewRfsForm defaultTokenAddress={process.env.MPP_FUNDING_TOKEN_ADDRESS ?? ""} defaultNetwork={process.env.MPP_NETWORK ?? "tempo"} />
}
