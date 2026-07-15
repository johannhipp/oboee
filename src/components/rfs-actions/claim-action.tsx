"use client";

import { useRouter } from "next/navigation";

import type { AvailableAction } from "@/lib/actions";
import {
  responseErrorMessage,
  useApiAction,
} from "@/lib/client/use-api-action";
import { ActionStatus } from "./action-status";

type ClaimActionModel = Extract<AvailableAction, { kind: "claim" }>;

export function ClaimAction({
  action,
  signedIn,
}: {
  action: ClaimActionModel;
  signedIn: boolean;
}) {
  const router = useRouter();
  const apiAction = useApiAction<void>({
    successMessage: () => "Request claimed successfully.",
    onSuccess: () => router.refresh(),
  });

  const claim = () => {
    if (action.requiresSignIn || !signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/browse/${action.rfsId}`)}`);
      return;
    }
    void apiAction.run(async () => {
      const response = await fetch(`/api/rfs/${action.rfsId}/claim`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={claim}
        disabled={apiAction.isSubmitting}
        className="w-full bg-emerald-700 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
      >
        {signedIn && !action.requiresSignIn
          ? "claim & write this skill"
          : "sign in to claim"}
      </button>
      <ActionStatus
        message={apiAction.state.message}
        isError={apiAction.state.phase === "error"}
      />
    </div>
  );
}
