"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AvailableAction } from "@/lib/actions";
import {
  responseErrorMessage,
  useApiAction,
} from "@/lib/client/use-api-action";
import { parseTokenAmount } from "../../../shared/domain/money";
import { normalizeTags } from "../../../shared/domain/strings";
import { ActionStatus } from "./action-status";

type SubmitActionModel = Extract<AvailableAction, { kind: "submit" }>;

export function SubmitSkillForm({ action }: { action: SubmitActionModel }) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("0.005");
  const apiAction = useApiAction<void>({
    successMessage: () => "Skill submitted and published.",
    onSuccess: () => router.refresh(),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void apiAction.run(async () => {
      const purchasePriceBaseUnits = parseTokenAmount(price);
      if (!purchasePriceBaseUnits || purchasePriceBaseUnits <= BigInt(0)) {
        throw new Error("Purchase price must be a positive decimal amount.");
      }
      const response = await fetch(`/api/rfs/${action.rfsId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          contentMarkdown: markdown,
          tags: normalizeTags(tags.split(",")),
          purchasePriceBaseUnits: purchasePriceBaseUnits.toString(),
        }),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-mono uppercase text-muted-foreground">submit skill</p>
      <label htmlFor={`skill-summary-${action.rfsId}`} className="sr-only">summary</label>
      <input
        id={`skill-summary-${action.rfsId}`}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
        placeholder="summary"
        required
      />
      <label htmlFor={`skill-content-${action.rfsId}`} className="sr-only">markdown content</label>
      <textarea
        id={`skill-content-${action.rfsId}`}
        value={markdown}
        onChange={(event) => setMarkdown(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm min-h-28"
        placeholder="markdown content"
        required
      />
      <label htmlFor={`skill-tags-${action.rfsId}`} className="sr-only">tags</label>
      <input
        id={`skill-tags-${action.rfsId}`}
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
        placeholder="tags,comma,separated"
      />
      <label htmlFor={`skill-price-${action.rfsId}`} className="text-xs font-mono text-muted-foreground">
        purchase price in pathUSD
      </label>
      <input
        id={`skill-price-${action.rfsId}`}
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-sm"
        inputMode="decimal"
        placeholder="0.005"
        required
      />
      <button
        type="submit"
        disabled={apiAction.isSubmitting}
        className="w-full bg-gray-900 text-white font-mono text-sm px-4 py-2 rounded-md disabled:opacity-60"
      >
        submit & publish skill
      </button>
      <ActionStatus
        message={apiAction.state.message}
        isError={apiAction.state.phase === "error"}
      />
    </form>
  );
}
