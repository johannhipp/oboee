import { basisPoints, type BasisPoints, POLICY_V2 } from "./policy";

export interface EvaluationSignal {
  clusterId: string;
  relevantTagTrustBps: number;
  eligible: boolean;
  freeform: boolean;
  machineVerifiedProof: boolean;
  harmful: boolean;
  criterionResults: Readonly<Record<string, "passed" | "failed" | "not_run">>;
}

const clusterRepresentatives = (signals: readonly EvaluationSignal[]) => {
  const byCluster = new Map<string, EvaluationSignal>();
  for (const signal of signals) {
    if (!signal.eligible || signal.freeform) {
      continue;
    }
    const existing = byCluster.get(signal.clusterId);
    if (!existing || signal.relevantTagTrustBps > existing.relevantTagTrustBps) {
      byCluster.set(signal.clusterId, signal);
    }
  }
  return [...byCluster.values()];
};

export interface QuorumResult {
  clusterCount: number;
  combinedTrustBps: number;
  hasMachineVerifiedProof: boolean;
  reductionSatisfied: boolean;
}

export const reductionQuorum = (signals: readonly EvaluationSignal[]): QuorumResult => {
  const representatives = clusterRepresentatives(signals);
  const combinedTrustBps = representatives.reduce(
    (sum, signal) => sum + signal.relevantTagTrustBps,
    0,
  );
  const hasMachineVerifiedProof = representatives.some((signal) => signal.machineVerifiedProof);
  return {
    clusterCount: representatives.length,
    combinedTrustBps,
    hasMachineVerifiedProof,
    reductionSatisfied:
      representatives.length >= POLICY_V2.reductionClusterCount &&
      combinedTrustBps >= POLICY_V2.reductionTrustBps &&
      hasMachineVerifiedProof,
  };
};

export const acceptanceQuorum = (args: {
  signals: readonly EvaluationSignal[];
  requiredCriterionIds: readonly string[];
}): { satisfied: boolean; combinedTrustBps: number; missingProofCriterionIds: readonly string[] } => {
  const representatives = clusterRepresentatives(args.signals);
  const combinedTrustBps = representatives.reduce(
    (sum, signal) => sum + signal.relevantTagTrustBps,
    0,
  );
  const missingProofCriterionIds = args.requiredCriterionIds.filter(
    (criterionId) =>
      !representatives.some(
        (signal) =>
          signal.machineVerifiedProof && signal.criterionResults[criterionId] === "passed",
      ),
  );
  return {
    satisfied:
      missingProofCriterionIds.length === 0 &&
      combinedTrustBps >= POLICY_V2.acceptanceTrustBps,
    combinedTrustBps,
    missingProofCriterionIds,
  };
};

export const harmfulHold = (
  signals: readonly EvaluationSignal[],
): { hold: true; clusterId: string; trustBps: BasisPoints } | { hold: false } => {
  const qualifying = signals
    .filter(
      (signal) =>
        signal.eligible &&
        !signal.freeform &&
        signal.harmful &&
        signal.machineVerifiedProof &&
        signal.relevantTagTrustBps >= POLICY_V2.harmfulHoldTrustBps,
    )
    .sort((left, right) => right.relevantTagTrustBps - left.relevantTagTrustBps)[0];

  return qualifying
    ? {
        hold: true,
        clusterId: qualifying.clusterId,
        trustBps: basisPoints(Math.min(10_000, qualifying.relevantTagTrustBps)),
      }
    : { hold: false };
};
