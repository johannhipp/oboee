import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { NewRfsForm } from "@/components/new-rfs-form"
import { isAuthenticated } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "New request | Oboe" }

export default async function NewRequestPage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in?next=%2Fnew")
  }

  return (
    <NewRfsForm />
  )
}
