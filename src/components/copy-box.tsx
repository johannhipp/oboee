"use client";

import { CopyButton } from "./copy-button";

export function CopyBox({ text }: { text: string }) {
  return (
    <CopyButton
      text={text}
      label="Copy agent setup instruction"
      className="w-full min-w-0 overflow-hidden bg-gray-50 rounded-md px-3 py-2.5 font-mono text-xs leading-relaxed text-left flex items-center justify-between gap-3 hover:bg-gray-100 transition-colors duration-150"
    >
      <span className="min-w-0 truncate text-gray-600">{text}</span>
    </CopyButton>
  );
}
