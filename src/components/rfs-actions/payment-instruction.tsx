"use client";

import type { PaymentInstruction } from "@/lib/client/payment";
import { CopyButton } from "../copy-button";

type PaymentInstructionCardProps = {
  instruction: PaymentInstruction;
  isChecking: boolean;
  onCheck: () => void;
};

export function PaymentInstructionCard({
  instruction,
  isChecking,
  onCheck,
}: PaymentInstructionCardProps) {
  return (
    <div className="space-y-2 border border-amber-300 bg-amber-50 rounded-md p-3">
      <p className="text-xs font-mono leading-relaxed">
        Tempo Moderato only. This command signs the exact challenge and transfers testnet pathUSD.
      </p>
      <pre
        className="text-[11px] whitespace-pre-wrap break-all overflow-x-auto rounded bg-white border border-amber-200 p-2"
        aria-label="Tempo payment command"
      >
        {instruction.command}
      </pre>
      <div className="flex flex-wrap gap-2">
        <CopyButton
          text={instruction.command}
          label="Copy payment command"
          showIcon={false}
          className="border border-gray-300 bg-white font-mono text-xs px-3 py-1.5 rounded-md"
        >
          copy payment command
        </CopyButton>
        <button
          type="button"
          onClick={onCheck}
          disabled={isChecking}
          className="bg-gray-900 text-white font-mono text-xs px-3 py-1.5 rounded-md disabled:opacity-60"
        >
          {instruction.intent === "purchase"
            ? "check browser access"
            : "refresh funding total"}
        </button>
      </div>
    </div>
  );
}
