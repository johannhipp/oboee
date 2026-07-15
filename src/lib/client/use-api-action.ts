"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ApiActionState =
  | { phase: "idle"; message: null }
  | { phase: "submitting"; message: null }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

type UseApiActionOptions<TResult> = {
  successMessage: (result: TResult) => string;
  onSuccess?: (result: TResult) => void | Promise<void>;
};

export const responseErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as
    | { message?: unknown; code?: unknown; detail?: unknown }
    | null;
  if (payload) {
    for (const value of [payload.message, payload.detail, payload.code]) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }
  return `Request failed (${response.status}).`;
};

export function useApiAction<TResult>({
  successMessage,
  onSuccess,
}: UseApiActionOptions<TResult>) {
  const [state, setState] = useState<ApiActionState>({
    phase: "idle",
    message: null,
  });
  const mounted = useRef(true);
  const submitting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<TResult>) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      if (mounted.current) {
        setState({ phase: "submitting", message: null });
      }
      try {
        const result = await action();
        if (!mounted.current) {
          return;
        }
        setState({ phase: "success", message: successMessage(result) });
        await onSuccess?.(result);
      } catch (error) {
        if (!mounted.current) {
          return;
        }
        setState({
          phase: "error",
          message:
            error instanceof Error && error.message
              ? error.message
              : "The request could not be completed.",
        });
      } finally {
        submitting.current = false;
      }
    },
    [onSuccess, successMessage],
  );

  return {
    run,
    state,
    isSubmitting: state.phase === "submitting",
  };
}
