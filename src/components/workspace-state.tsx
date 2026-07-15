import Link from "next/link";

export function WorkspaceState({ title, message, signInPath }: { title: string; message: string; signInPath?: string }) {
  return <section className="border-t-2 border-foreground border-b border-border py-5"><h1 className="font-medium">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{message}</p>{signInPath ? <Link href={`/sign-in?next=${encodeURIComponent(signInPath)}`} className="mt-3 inline-block font-mono text-sm underline underline-offset-4">Sign in</Link> : null}</section>;
}
