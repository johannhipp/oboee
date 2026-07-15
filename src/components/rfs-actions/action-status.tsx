type ActionStatusProps = {
  message: string | null;
  isError: boolean;
};

export function ActionStatus({ message, isError }: ActionStatusProps) {
  return message ? (
    <p
      className={`text-xs font-mono ${isError ? "text-rose-700" : "text-muted-foreground"}`}
      aria-live="polite"
    >
      {message}
    </p>
  ) : null;
}
