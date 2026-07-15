"use client";

import { CopyButton } from "./copy-button";

const truncateId = (id: string) => {
  const parts = id.split(":");
  if (parts.length === 2) {
    return `${parts[0]}:${parts[1].slice(0, 4)}…`;
  }
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
};

export function CopyId({ id, className }: { id: string; className?: string }) {
  return (
    <CopyButton
      text={id}
      label={`Copy identifier ${id}`}
      className={`font-mono text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1 ${className ?? ""}`}
    >
      <span>{truncateId(id)}</span>
    </CopyButton>
  );
}
