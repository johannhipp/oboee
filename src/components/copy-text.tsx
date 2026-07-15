"use client";

import { CopyButton } from "./copy-button";

export function CopyText({ text, className }: { text: string; className?: string }) {
  return (
    <CopyButton
      text={text}
      label={`Copy ${text}`}
      showIcon={false}
      className={`max-w-full min-w-0 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <span className="truncate">{text}</span>
    </CopyButton>
  );
}
