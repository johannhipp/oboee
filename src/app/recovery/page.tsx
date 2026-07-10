import { RecoveryWorkspace } from "@/components/recovery-workspace";

export default function RecoveryPage() { return <main className="mx-auto max-w-3xl py-10"><h1 className="text-xl font-medium">Account recovery</h1><p className="mt-1 text-sm text-muted-foreground">Recover an inaccessible account by proving control of a previously verified wallet.</p><div className="mt-7"><RecoveryWorkspace /></div></main>; }
