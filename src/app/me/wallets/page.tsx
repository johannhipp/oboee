import { anyApi } from "convex/server";
import { WalletManager } from "@/components/wallet-manager";
import { WorkspaceState } from "@/components/workspace-state";
import { fetchAuthQuery, getAuthenticationStatus } from "@/lib/auth-server";
import { toJsonValue } from "@/lib/json";
export const dynamic = "force-dynamic";
export default async function WalletsPage() { if (await getAuthenticationStatus() !== "authenticated") return <WorkspaceState title="Wallets" message="Sign in to manage verified wallets." signInPath="/me/wallets" />; let wallets: Record<string, unknown>[] = []; try { wallets = toJsonValue(await fetchAuthQuery(anyApi.principals.listMyWallets, {})) as Record<string, unknown>[]; } catch {} return <main><h1 className="text-xl font-medium">Wallets</h1><div className="mt-6"><WalletManager wallets={wallets} /></div></main>; }
