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

type FundActionModel = Extract<AvailableAction, { kind: "fund" }>;
type FundResult =
  | { kind: "accepted" }
  | { kind: "instruction"; instruction: PaymentInstruction };

const fundMessage = (result: FundResult) =>
  result.kind === "accepted"
    ? "Contribution accepted on Tempo Moderato."
    : "Payment required. Run the Moderato command, then refresh the total.";

export function FundAction({ action }: { action: FundActionModel }) {
  const router = useRouter();
  const [amount, setAmount] = useState("0.003");
  const [instruction, setInstruction] = useState<PaymentInstruction | null>(null);
  const apiAction = useApiAction<FundResult>({
    successMessage: fundMessage,
    onSuccess: (result) => {
      if (result.kind === "accepted") {
        router.refresh();
      }
    },
  });

  const submit = () =>
    apiAction.run(async () => {
      const path = `/api/rfs/${action.rfsId}/fund`;
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const paymentInstruction = paymentInstructionFromResponse(response, {
        intent: "fund",
        method: "POST",
        url: new URL(path, window.location.origin).toString(),
        jsonBody: { amount },
      });
      if (paymentInstruction) {
        setInstruction(paymentInstruction);
        return { kind: "instruction" as const, instruction: paymentInstruction };
      }
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
      setInstruction(null);
      return { kind: "accepted" as const };
    });

  return (
    <div className="space-y-2">
      <label htmlFor={`fund-amount-${action.rfsId}`} className="text-xs font-mono text-muted-foreground">
        amount in pathUSD
      </label>
      <input
        id={`fund-amount-${action.rfsId}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
        inputMode="decimal"
        placeholder="0.003"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={apiAction.isSubmitting}
        className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
      >
        prepare testnet contribution
      </button>
      {instruction ? (
        <PaymentInstructionCard
          instruction={instruction}
          isChecking={apiAction.isSubmitting}
          onCheck={() => {
            setInstruction(null);
            router.refresh();
          }}
        />
      ) : null}
      <ActionStatus
        message={apiAction.state.message}
        isError={apiAction.state.phase === "error"}
      />
    </div>
  );
}
