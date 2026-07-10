export type IdentityOverrideMode = "merge" | "split";

export type IdentityClusterSnapshot = {
  clusterId: string;
  status: string;
  updatedAt: number;
};

export type IdentityMembershipSnapshot = {
  membershipId: string;
  clusterId: string;
  principalId: string;
  confidenceBps: number;
  reasons: string[];
};

export const identityOverrideTarget = (args: {
  mode: IdentityOverrideMode;
  splitPrincipalIds: string[];
  clusters: IdentityClusterSnapshot[];
  memberships: IdentityMembershipSnapshot[];
}) => ({
  mode: args.mode,
  splitPrincipalIds: [...new Set(args.splitPrincipalIds.map((id) => id.trim()).filter(Boolean))].sort(),
  clusters: [...args.clusters].sort((left, right) => left.clusterId.localeCompare(right.clusterId)),
  memberships: [...args.memberships]
    .map((membership) => ({ ...membership, reasons: [...membership.reasons].sort() }))
    .sort((left, right) => left.clusterId.localeCompare(right.clusterId) || left.principalId.localeCompare(right.principalId) || left.membershipId.localeCompare(right.membershipId)),
});
