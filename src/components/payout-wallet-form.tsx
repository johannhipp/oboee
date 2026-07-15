"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

interface PayoutWalletFormProps {
  initialAddress: string | null
}

export function PayoutWalletForm({ initialAddress }: PayoutWalletFormProps) {
  const router = useRouter()
  const [walletAddress, setWalletAddress] = useState(initialAddress ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const saveWallet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = walletAddress.trim()
    if (!ADDRESS_PATTERN.test(normalized)) {
      setMessage("Enter a 0x-prefixed 40-hex wallet address.")
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/me/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: normalized }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { code?: string; message?: string }
        | null
      if (!response.ok) {
        setMessage(payload?.message ?? payload?.code ?? "Could not save the payout wallet.")
        return
      }
      setWalletAddress(normalized.toLowerCase())
      setMessage("Payout wallet saved.")
      router.refresh()
    } catch {
      setMessage("Could not reach the wallet endpoint.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={saveWallet} className="space-y-2">
      <label htmlFor="payout-wallet" className="text-xs font-mono uppercase text-muted-foreground">
        payout wallet
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="payout-wallet"
          value={walletAddress}
          onChange={(event) => setWalletAddress(event.target.value)}
          className="min-w-0 flex-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={saving}
          className="bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
        >
          {saving ? "saving…" : "save wallet"}
        </button>
      </div>
      <p className="text-xs font-mono text-muted-foreground">
        One address per account. Automated payout settlement is intentionally outside this testnet MVP.
      </p>
      {message ? <p className="text-xs font-mono" aria-live="polite">{message}</p> : null}
    </form>
  )
}
