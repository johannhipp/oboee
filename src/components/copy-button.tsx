"use client";

import type { ReactNode } from "react";

import { useClipboard } from "@/lib/client/use-clipboard";
import { CopyIcon } from "./copy-icon";

type CopyButtonProps = {
  text: string;
  label: string;
  children?: ReactNode;
  className?: string;
  showIcon?: boolean;
};

export function CopyButton({
  text,
  label,
  children,
  className = "",
  showIcon = true,
}: CopyButtonProps) {
  const { copy, status } = useClipboard();
  const statusText =
    status === "copied"
      ? "copied"
      : status === "failed"
        ? "copy failed"
        : status === "unavailable"
          ? "clipboard unavailable"
          : "";

  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      className={className}
      aria-label={label}
      title={text}
      disabled={status === "unavailable"}
    >
      {showIcon ? <CopyIcon className="shrink-0 opacity-40" /> : null}
      {children}
      <span className="sr-only" aria-live="polite">
        {statusText}
      </span>
      {status === "copied" ? (
        <span className="shrink-0 text-xs" aria-hidden="true">
          copied
        </span>
      ) : null}
    </button>
  );
}
