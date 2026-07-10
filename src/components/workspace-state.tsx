import Link from "next/link";

export function WorkspaceState({ title, message, signInPath }: { title: string; message: string; signInPath?: string }) {
  return <section className="border border-border p-5"><h1 className="font-medium">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p>{signInPath ? <Link href={`/sign-in?next=${encodeURIComponent(signInPath)}`} className="mt-3 inline-block font-mono text-sm underline">sign in</Link> : null}</section>;
}
