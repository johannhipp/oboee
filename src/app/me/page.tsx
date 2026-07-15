import type { Metadata } from "next"
import Link from "next/link"
import { api } from "../../../convex/_generated/api"
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server"
import { CopyText } from "@/components/copy-text"
import { AsciiBox } from "@/components/ascii-box"
import { MarketplaceRow } from "@/components/marketplace-row"
import { MoneyText } from "@/components/money-text"
import { PayoutWalletForm } from "@/components/payout-wallet-form"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Profile | Oboe" }

export default async function ProfilePage() {
  if (!(await isAuthenticated())) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <AsciiBox title="auth required">
          <p className="text-sm text-muted-foreground font-mono">
            <Link href="/sign-in?next=%2Fme" className="underline underline-offset-2 text-foreground">
              sign in
            </Link>{" "}
            to view your profile, requests, contributions, and purchases.
          </p>
        </AsciiBox>
      </div>
    )
  }

  const dashboard = await fetchAuthQuery(api.users.getDashboard, {})

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="mt-8 mb-6">
        <h1 className="text-xl font-medium tracking-tight">{dashboard.user.name}</h1>
        {dashboard.user.walletAddress ? (
          <CopyText text={dashboard.user.walletAddress} className="mt-1" />
        ) : (
          <p className="font-mono text-sm text-muted-foreground mt-1">no wallet linked yet</p>
        )}
      </div>

      <AsciiBox title="unsettled testnet earnings">
        <p className="font-mono text-lg">
          <MoneyText
            baseUnits={dashboard.unsettledTestnetEarningsBaseUnits}
            currency="pathUSD"
          />
        </p>
        <p className="text-xs font-mono text-muted-foreground mt-1 mb-4">
          Accounting only; this MVP does not claim an on-chain payout has occurred.
        </p>
        <PayoutWalletForm initialAddress={dashboard.user.walletAddress} />
      </AsciiBox>

      <div className="mt-6">
        <AsciiBox title="my requests">
          {dashboard.requests.length > 0 ? (
            dashboard.requests.map((item) => (
              <MarketplaceRow key={item.itemId} item={item} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground font-mono italic">
              no requests yet
            </p>
          )}
        </AsciiBox>
      </div>

      <div className="mt-6">
        <AsciiBox title="contributions">
          {dashboard.contributions.length > 0 ? (
            dashboard.contributions.map((contrib) => {
              return (
                <div
                  key={contrib.id}
                  className="flex items-center justify-between py-1.5 font-mono text-sm gap-4 min-w-0"
                >
                  <span className="truncate min-w-0">{contrib.rfsTitle}</span>
                  <span className="text-muted-foreground ml-4 shrink-0">
                    <MoneyText baseUnits={contrib.amountBaseUnits} />
                  </span>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground font-mono italic">
              no contributions yet
            </p>
          )}
        </AsciiBox>
      </div>

      <div className="mt-6">
        <AsciiBox title="purchased">
          {dashboard.purchases.length > 0 ? (
            dashboard.purchases.map((purchase) => {
              return (
                <div
                  key={purchase.id}
                  className="flex items-center justify-between py-1.5 font-mono text-sm gap-4 min-w-0"
                >
                  <span className="truncate min-w-0">{purchase.skillTitle}</span>
                  <span className="text-muted-foreground ml-4 shrink-0">
                    <MoneyText baseUnits={purchase.amountBaseUnits} />
                  </span>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground font-mono italic">
              no purchases yet
            </p>
          )}
        </AsciiBox>
      </div>
    </div>
  )
}
