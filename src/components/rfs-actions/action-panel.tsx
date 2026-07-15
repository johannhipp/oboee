import type { AvailableAction } from "@/lib/actions";
import { ClaimAction } from "./claim-action";
import { FundAction } from "./fund-action";
import { PurchaseOrReadAction } from "./purchase-or-read-action";
import { SubmitSkillForm } from "./submit-skill-form";

const assertNever = (value: never): never => {
  throw new Error(`Unsupported marketplace action: ${JSON.stringify(value)}`);
};

export function ActionPanel({
  actions,
  signedIn,
}: {
  actions: AvailableAction[];
  signedIn: boolean;
}) {
  return (
    <div className="space-y-4 mt-4">
      {actions.map((action) => {
        switch (action.kind) {
          case "fund":
            return <FundAction key={action.kind} action={action} />;
          case "claim":
            return (
              <ClaimAction key={action.kind} action={action} signedIn={signedIn} />
            );
          case "submit":
            return <SubmitSkillForm key={action.kind} action={action} />;
          case "purchase":
          case "read":
            return <PurchaseOrReadAction key={action.kind} action={action} />;
          default:
            return assertNever(action);
        }
      })}
    </div>
  );
}
