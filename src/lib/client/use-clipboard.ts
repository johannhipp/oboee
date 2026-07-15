"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ClipboardStatus = "idle" | "copied" | "failed" | "unavailable";

export const useClipboard = (resetAfterMs = 1_500) => {
  const [status, setStatus] = useState<ClipboardStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      if (!navigator.clipboard?.writeText) {
        setStatus("unavailable");
        return false;
      }
      if (timer.current) {
        clearTimeout(timer.current);
      }
      try {
        await navigator.clipboard.writeText(text);
        setStatus("copied");
        timer.current = setTimeout(() => setStatus("idle"), resetAfterMs);
        return true;
      } catch {
        setStatus("failed");
        return false;
      }
    },
    [resetAfterMs],
  );

  return { copy, status };
};
