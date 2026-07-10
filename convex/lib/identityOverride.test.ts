import { describe, expect, it } from "vitest";

import { identityOverrideTarget } from "./identityOverride";

describe("identity override target", () => {
  it("canonicalizes source, membership, reason, and split ordering", () => {
    const target = identityOverrideTarget({
      mode: "merge",
      splitPrincipalIds: [" principal-b ", "principal-a", "principal-a"],
      clusters: [
        { clusterId: "cluster-b", status: "active", updatedAt: 2 },
        { clusterId: "cluster-a", status: "active", updatedAt: 1 },
      ],
      memberships: [
        { membershipId: "member-b", clusterId: "cluster-b", principalId: "principal-b", confidenceBps: 8_000, reasons: ["z", "a"] },
        { membershipId: "member-a", clusterId: "cluster-a", principalId: "principal-a", confidenceBps: 9_000, reasons: ["b", "a"] },
      ],
    });

    expect(target.splitPrincipalIds).toEqual(["principal-a", "principal-b"]);
    expect(target.clusters.map((cluster) => cluster.clusterId)).toEqual(["cluster-a", "cluster-b"]);
    expect(target.memberships.map((membership) => membership.membershipId)).toEqual(["member-a", "member-b"]);
    expect(target.memberships[0].reasons).toEqual(["a", "b"]);
  });

  it("changes when a carried membership fact changes", () => {
    const base = {
      mode: "split" as const,
      splitPrincipalIds: ["principal-a"],
      clusters: [{ clusterId: "cluster-a", status: "active", updatedAt: 1 }],
      memberships: [{ membershipId: "member-a", clusterId: "cluster-a", principalId: "principal-a", confidenceBps: 9_000, reasons: ["verified"] }],
    };

    expect(identityOverrideTarget(base)).not.toEqual(identityOverrideTarget({
      ...base,
      memberships: [{ ...base.memberships[0], confidenceBps: 8_000 }],
    }));
  });
});
