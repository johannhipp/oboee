"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AvailableAction } from "@/lib/actions";
import {
  paymentInstructionFromResponse,
  type PaymentInstruction,
} from "@/lib/client/payment";
import {
  responseErrorMessage,
  useApiAction,
} from "@/lib/client/use-api-action";
import { ActionStatus } from "./action-status";
import { PaymentInstructionCard } from "./payment-instruction";

type ContentActionModel = Extract<
  AvailableAction,
  { kind: "purchase" | "read" }
>;
type ContentResult =
  | { kind: "content"; contentMarkdown: string }
  | { kind: "instruction"; instruction: PaymentInstruction };

const contentMessage = (result: ContentResult) =>
  result.kind === "content"
    ? "Skill content unlocked."
    : "Payment required. Run the Moderato command, then check browser access.";

export function PurchaseOrReadAction({ action }: { action: ContentActionModel }) {
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<PaymentInstruction | null>(null);
  const apiAction = useApiAction<ContentResult>({
    successMessage: contentMessage,
    onSuccess: (result) => {
      if (result.kind === "content") {
        router.refresh();
      }
    },
  });

  const read = () =>
    apiAction.run(async () => {
      const path = `/api/skills/${action.skillId}/content`;
      const response = await fetch(path);
      const paymentInstruction = paymentInstructionFromResponse(response, {
        intent: "purchase",
        method: "GET",
        url: new URL(path, window.location.origin).toString(),
      });
      if (paymentInstruction) {
        setInstruction(paymentInstruction);
        return { kind: "instruction" as const, instruction: paymentInstruction };
      }
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
      const payload = (await response.json()) as { contentMarkdown?: unknown };
      if (typeof payload.contentMarkdown !== "string") {
        throw new Error("The paid response did not contain skill content.");
      }
      setInstruction(null);
      setContent(payload.contentMarkdown);
      return { kind: "content" as const, contentMarkdown: payload.contentMarkdown };
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void read()}
        disabled={apiAction.isSubmitting}
        className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
      >
        {action.kind === "purchase" ? "prepare testnet purchase" : "read skill"}
      </button>
      {instruction ? (
        <PaymentInstructionCard
          instruction={instruction}
          isChecking={apiAction.isSubmitting}
          onCheck={() => void read()}
        />
      ) : null}
      <ActionStatus
        message={apiAction.state.message}
        isError={apiAction.state.phase === "error"}
      />
      {content ? (
        <div className="border border-border rounded-md p-3 bg-gray-50">
          <p className="text-xs font-mono uppercase text-muted-foreground mb-2">full skill</p>
          <pre className="text-xs whitespace-pre-wrap leading-relaxed">{content}</pre>
        </div>
      ) : null}
    </div>
  );
}
