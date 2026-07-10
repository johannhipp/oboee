import type { BaseUnits } from "./policy";
import { baseUnitValue, baseUnits } from "./policy";

export type FundingReceiptAllocation = {
  appliedAmountBaseUnits: BaseUnits;
  refundAmountBaseUnits: BaseUnits;
};

export const allocateFundingReceipt = (args: {
  fundingTargetBaseUnits: BaseUnits;
  currentAmountBaseUnits: BaseUnits;
  receiptAmountBaseUnits: BaseUnits;
}): FundingReceiptAllocation => {
  const target = baseUnitValue(args.fundingTargetBaseUnits);
  const current = baseUnitValue(args.currentAmountBaseUnits);
  const receipt = baseUnitValue(args.receiptAmountBaseUnits);
  const remaining = target > current ? target - current : BigInt(0);
  const applied = receipt < remaining ? receipt : remaining;
  return {
    appliedAmountBaseUnits: baseUnits(applied),
    refundAmountBaseUnits: baseUnits(receipt - applied),
  };
};
