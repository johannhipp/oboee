import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recordOperatorAudit } from "./lib/operatorAudit";
import { sha256Digest } from "./lib/contracts";
import { identityOverrideTarget, type IdentityOverrideMode } from "./lib/identityOverride";
import { requireActiveRole, requirePrincipal, requireRecentPasskey } from "./lib/principals";

const nonemptyReason = (reason: string) => {
  const value = reason.trim();
  if (!value) throw new ConvexError({ code: "RATIONALE_REQUIRED", message: "A reason is required." });
  return value;
};
const requireDigest = (expected: string, value: unknown) => {
  const actual = sha256Digest(value);
  if (expected !== actual) throw new ConvexError({ code: "STALE_RESOURCE", message: "The privileged target changed; refresh and confirm its current digest." });
  return actual;
};
const canonicalSourceClusterIds = <T extends string>(mode: IdentityOverrideMode, sourceClusterIds: T[]) => {
  const unique = new Set(sourceClusterIds.map(String));
  if (unique.size !== sourceClusterIds.length) throw new ConvexError({ code: "DUPLICATE_CLUSTER", message: "Source cluster IDs must be unique." });
  const sorted = [...sourceClusterIds].sort((left, right) => String(left).localeCompare(String(right)));
  if ((mode === "merge" && sorted.length < 2) || (mode === "split" && sorted.length !== 1)) throw new ConvexError({ code: "INVALID_CLUSTER_OVERRIDE", message: "Merge requires at least two sources; split requires exactly one." });
  return sorted;
};
const overrideTarget = (
  mode: IdentityOverrideMode,
  splitPrincipalIds: string[],
  clusters: Doc<"identityClusters">[],
  members: Doc<"identityClusterMemberships">[],
) => identityOverrideTarget({
  mode,
  splitPrincipalIds,
  clusters: clusters.map((cluster) => ({ clusterId: String(cluster._id), status: cluster.status, updatedAt: cluster.updatedAt })),
  memberships: members.map((member) => ({ membershipId: String(member._id), clusterId: String(member.clusterId), principalId: member.principalId, confidenceBps: member.confidenceBps, reasons: member.reasons })),
});

export const context = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const now = Date.now();
    const roles = await ctx.db.query("platformRoles").filter((query) => query.eq(query.field("principalId"), principal.principalId)).collect();
    return { roles: roles.filter((role) => role.activeFrom <= now && role.activeUntil > now && !role.revokedAt).map((role) => ({ roleId: role._id, role: role.role, tags: role.tags, activeUntil: role.activeUntil })) };
  },
});

export const overview = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "platform_operator" });
    const [roles, recoveries, transfers, obligations, evidence, migrations, disputes, flags, rfsRows, versions, skills, projections, shadowComparisons] = await Promise.all([
      ctx.db.query("platformRoles").take(500),
      ctx.db.query("accountRecoveryRequests").take(500),
      ctx.db.query("settlementTransfers").take(500),
      ctx.db.query("settlementObligations").take(500),
      ctx.db.query("evidenceArtifacts").take(500),
      ctx.db.query("migrationReviewItems").take(500),
      ctx.db.query("disputes").take(500),
      ctx.db.query("featureFlags").take(50),
      ctx.db.query("rfs").take(500),
      ctx.db.query("skillVersions").take(500),
      ctx.db.query("skills").take(500),
      ctx.db.query("discoveryProjection").take(500),
      ctx.db.query("policyShadowComparisons").take(500),
    ]);
    const now = Date.now();
    const transferByObligation = new Map(transfers.map((transfer) => [String(transfer.obligationId), transfer]));
    const projectionSkillIds = new Set(projections.map((projection) => String(projection.skillId)));
    const alertCounts = {
      overdueApplications: rfsRows.filter((item) => item.policyVersion === 2 && item.status === "funded" && item.applicationDeadline && item.applicationDeadline < now).length,
      overdueEvaluations: versions.filter((item) => item.policyVersion === 2 && (item.status === "evaluation_open" || item.status === "disputed") && item.evaluationDeadline < now).length,
      overdueRevisions: rfsRows.filter((item) => item.policyVersion === 2 && item.status === "revision_requested" && item.revisionDeadline && item.revisionDeadline < now).length,
      overdueDisputes: disputes.filter((item) => item.state !== "resolved" && item.dueAt < now).length,
      staleBroadcasts: transfers.filter((item) => item.state === "broadcast" && item.createdAt < now - 60 * 60 * 1_000).length,
      failedReceipts: transfers.filter((item) => item.state === "failed").length,
      obligationImbalances: obligations.filter((item) => (item.state === "settled") !== (transferByObligation.get(String(item._id))?.state === "confirmed")).length,
      missingWalletSnapshots: obligations.filter((item) => !item.recipientAddressSnapshot || !item.walletId).length,
      retentionFailures: evidence.filter((item) => item.classification === "restricted" && !item.legalHold && !item.deletedAt && item.retentionDeleteAt < now).length,
      scannerBacklog: evidence.filter((item) => item.scanState === "pending" && item.createdAt < now - 10 * 60 * 1_000).length,
      scannerFailures: evidence.filter((item) => item.scanState === "failed" || item.scanState === "quarantined").length,
      unresolvedHarmfulHolds: skills.filter((item) => item.quarantineState === "held").length,
      projectionLag: skills.filter((item) => item.status === "published" && !projectionSkillIds.has(String(item._id))).length,
    };
    return {
      activeRoleCount: roles.filter((role) => !role.revokedAt && role.activeUntil > now).length,
      pendingRecoveryCount: recoveries.filter((item) => item.status !== "completed" && item.status !== "rejected").length,
      failedTransferCount: transfers.filter((item) => item.state === "failed").length,
      heldEvidenceCount: evidence.filter((item) => item.legalHold).length,
      migrationFindingCount: migrations.filter((item) => item.status === "open").length,
      openDisputeCount: disputes.filter((item) => item.state !== "resolved").length,
      featureFlags: flags.map((flag) => ({ key: flag.key, mode: flag.mode, cohortIds: flag.cohortIds, updatedAt: flag.updatedAt, reason: flag.reason, resourceDigest: sha256Digest({ key: flag.key, mode: flag.mode, cohortIds: flag.cohortIds, updatedAt: flag.updatedAt }) })),
      shadowComparison: { compared: shadowComparisons.length, diverged: shadowComparisons.filter((item) => item.diverged).length, recentDivergences: shadowComparisons.filter((item) => item.diverged).sort((left, right) => right.comparedAt - left.comparedAt).slice(0, 20).map((item) => ({ rfsId: item.rfsId, legacyFirstApplicationId: item.legacyFirstApplicationId, policyV2ApplicationId: item.policyV2ApplicationId, policyV2ScoreBps: item.policyV2ScoreBps, comparedAt: item.comparedAt })) },
      alerts: Object.entries(alertCounts).filter(([, count]) => count > 0).map(([kind, count]) => ({ kind, count })),
    };
  },
});

export const paymentQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "platform_operator" });
    const [obligations, transfers] = await Promise.all([
      ctx.db.query("settlementObligations").take(250),
      ctx.db.query("settlementTransfers").take(250),
    ]);
    return { obligations: obligations.map((item) => ({ ...item, resourceDigest: sha256Digest({ id: String(item._id), state: item.state, amountBaseUnits: item.amountBaseUnits.toString(), walletId: String(item.walletId), recipientAddressSnapshot: item.recipientAddressSnapshot, decisionReference: item.decisionReference }) })), transfers };
  },
});

export const evidenceQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_operator" });
    const rows = await ctx.db.query("evidenceArtifacts").withIndex("by_retentionDeleteAt").order("asc").take(250);
    return rows.map((artifact) => ({ artifactId: artifact._id, rfsId: artifact.rfsId, classification: artifact.classification, verificationState: artifact.verificationState, scanState: artifact.scanState, legalHold: artifact.legalHold, retentionDeleteAt: artifact.retentionDeleteAt, deletedAt: artifact.deletedAt, resourceDigest: sha256Digest({ id: String(artifact._id), legalHold: artifact.legalHold, retentionDeleteAt: artifact.retentionDeleteAt, deletedAt: artifact.deletedAt ?? null }) }));
  },
});

export const recoveryQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_operator" });
    const rows = await ctx.db.query("accountRecoveryRequests").withIndex("by_status_and_coolingOffUntil").order("asc").take(250);
    return rows.map((item) => ({ ...item, resourceDigest: sha256Digest({ id: String(item._id), status: item.status, coolingOffUntil: item.coolingOffUntil, firstOperatorPrincipalId: item.firstOperatorPrincipalId ?? null, secondOperatorPrincipalId: item.secondOperatorPrincipalId ?? null }) }));
  },
});

export const identityQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_operator" });
    const clusters = await ctx.db.query("identityClusters").withIndex("by_status", (query) => query.eq("status", "active")).take(250);
    return await Promise.all(clusters.map(async (cluster) => {
      const members = (await ctx.db.query("identityClusterMemberships").withIndex("by_cluster", (query) => query.eq("clusterId", cluster._id)).collect()).filter((membership) => !membership.activeUntil);
      const digestValue = { clusterIds: [String(cluster._id)], members: members.map((item) => item.principalId).sort(), statuses: [cluster.status], updatedAt: [cluster.updatedAt] };
      return { cluster: { clusterId: cluster._id, confidenceBps: cluster.confidenceBps, reasons: cluster.reasons, manualOverride: cluster.manualOverride, overrideExpiresAt: cluster.overrideExpiresAt }, memberCount: members.length, members: members.map((item) => ({ principalId: item.principalId, confidenceBps: item.confidenceBps, reasons: item.reasons })), resourceDigest: sha256Digest(digestValue) };
    }));
  },
});

export const identityOverridePreview = query({
  args: { mode: v.union(v.literal("merge"), v.literal("split")), sourceClusterIds: v.array(v.id("identityClusters")), splitPrincipalIds: v.array(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_operator" });
    const sourceClusterIds = canonicalSourceClusterIds(args.mode, args.sourceClusterIds);
    const clusters = await Promise.all(sourceClusterIds.map((id) => ctx.db.get(id)));
    if (clusters.some((cluster) => !cluster || cluster.status !== "active")) throw new ConvexError({ code: "INVALID_STATE", message: "Every source cluster must be active." });
    const groups = await Promise.all(sourceClusterIds.map(async (id) => (await ctx.db.query("identityClusterMemberships").withIndex("by_cluster", (query) => query.eq("clusterId", id)).collect()).filter((item) => !item.activeUntil)));
    const members = groups.flat();
    if (new Set(members.map((member) => member.principalId)).size !== members.length) throw new ConvexError({ code: "DUPLICATE_PRINCIPAL", message: "A principal has multiple active source memberships; repair that inconsistency before overriding clusters." });
    const target = overrideTarget(args.mode, args.splitPrincipalIds, clusters as Doc<"identityClusters">[], members);
    return { sourceClusterIds, members: target.memberships, expectedDigest: sha256Digest(target) };
  },
});

export const overrideIdentityClusters = mutation({
  args: { mode: v.union(v.literal("merge"), v.literal("split")), sourceClusterIds: v.array(v.id("identityClusters")), splitPrincipalIds: v.array(v.string()), overrideExpiresAt: v.number(), reason: v.string(), expectedDigest: v.string() },
  returns: v.object({ resultingClusterIds: v.array(v.id("identityClusters")) }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "security_operator" });
    const reason = nonemptyReason(args.reason);
    if (args.overrideExpiresAt <= Date.now() || args.overrideExpiresAt > Date.now() + 365 * 24 * 60 * 60 * 1_000) throw new ConvexError({ code: "INVALID_EXPIRY", message: "Identity overrides must expire within one year." });
    const sourceClusterIds = canonicalSourceClusterIds(args.mode, args.sourceClusterIds);
    const sourceIds = sourceClusterIds.map(String);
    const clusters = await Promise.all(sourceClusterIds.map((id) => ctx.db.get(id)));
    if (clusters.some((cluster) => !cluster || cluster.status !== "active")) throw new ConvexError({ code: "INVALID_STATE", message: "Every source cluster must still be active." });
    const membershipGroups = await Promise.all(sourceClusterIds.map(async (id) => (await ctx.db.query("identityClusterMemberships").withIndex("by_cluster", (query) => query.eq("clusterId", id)).collect()).filter((item) => !item.activeUntil)));
    const members = membershipGroups.flat();
    if (new Set(members.map((member) => member.principalId)).size !== members.length) throw new ConvexError({ code: "DUPLICATE_PRINCIPAL", message: "A principal has multiple active source memberships; repair that inconsistency before overriding clusters." });
    const splitSet = new Set(args.splitPrincipalIds.map((id) => id.trim()).filter(Boolean));
    requireDigest(args.expectedDigest, overrideTarget(args.mode, [...splitSet], clusters as Doc<"identityClusters">[], members));
    if (args.mode === "split" && (splitSet.size === 0 || splitSet.size >= members.length || members.some((item) => splitSet.has(item.principalId)) === false)) throw new ConvexError({ code: "INVALID_CLUSTER_OVERRIDE", message: "Split requires a non-empty strict subset of current members." });
    if (args.mode === "split" && [...splitSet].some((id) => !members.some((member) => member.principalId === id))) throw new ConvexError({ code: "INVALID_CLUSTER_OVERRIDE", message: "Split principals must belong to the source cluster." });
    const now = Date.now();
    const groups = args.mode === "merge" ? [members] : [members.filter((item) => splitSet.has(item.principalId)), members.filter((item) => !splitSet.has(item.principalId))];
    const resultingClusterIds = [];
    for (const group of groups) {
      const clusterId = await ctx.db.insert("identityClusters", { status: "active", confidenceBps: Math.min(...group.map((item) => item.confidenceBps)), reasons: [reason], manualOverride: true, overrideExpiresAt: args.overrideExpiresAt, createdAt: now, updatedAt: now });
      resultingClusterIds.push(clusterId);
      for (const member of group) await ctx.db.insert("identityClusterMemberships", { clusterId, principalId: member.principalId, confidenceBps: member.confidenceBps, reasons: [...member.reasons, `manual_${args.mode}`], activeFrom: now, manuallyOverriddenBy: operator.principalId });
    }
    for (const member of members) await ctx.db.patch(member._id, { activeUntil: now, manuallyOverriddenBy: operator.principalId });
    for (const cluster of clusters) await ctx.db.patch(cluster!._id, { status: args.mode === "merge" ? "merged" : "split", updatedAt: now, manualOverride: true, overrideExpiresAt: args.overrideExpiresAt });
    await ctx.db.insert("identityClusterEvents", { actorPrincipalId: operator.principalId, eventType: args.mode, sourceClusterIds, resultingClusterIds, affectedPrincipalIds: members.map((item) => item.principalId), reason, overrideExpiresAt: args.overrideExpiresAt, occurredAt: now });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: `identity_cluster.${args.mode}`, targetType: "identityCluster", targetId: sourceIds.join(","), reason, metadata: { resultingClusterIds: resultingClusterIds.map(String), affectedCount: members.length, overrideExpiresAt: args.overrideExpiresAt } });
    return { resultingClusterIds };
  },
});

export const migrationQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "platform_operator" });
    const [progress, findings] = await Promise.all([ctx.db.query("migrationProgress").take(250), ctx.db.query("migrationReviewItems").take(250)]);
    return { progress, findings: findings.map((item) => ({ ...item, resourceDigest: sha256Digest({ id: String(item._id), status: item.status, findingType: item.findingType, resourceType: item.resourceType, resourceId: item.resourceId, details: item.details }) })) };
  },
});

export const auditLog = query({
  args: { limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "platform_operator" });
    return await ctx.db.query("operatorAuditEvents").order("desc").take(Math.min(250, args.limit ?? 100));
  },
});

export const setFeatureFlag = mutation({
  args: { key: v.string(), mode: v.union(v.literal("off"), v.literal("shadow"), v.literal("cohort"), v.literal("on")), cohortIds: v.array(v.string()), reason: v.string(), expectedDigest: v.string() },
  returns: v.object({ mode: v.string() }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    const reason = nonemptyReason(args.reason);
    if (args.mode === "cohort" && args.cohortIds.length === 0) throw new ConvexError({ code: "INVALID_COHORT", message: "Cohort mode requires at least one cohort ID." });
    if (args.mode === "on" && process.env.OBOE_V2_GENERAL_AVAILABILITY_APPROVED !== "true") throw new ConvexError({ code: "ROLLOUT_GATE_CLOSED", message: "General availability requires the explicit deployment approval gate." });
    const existing = await ctx.db.query("featureFlags").withIndex("by_key", (query) => query.eq("key", args.key)).unique();
    requireDigest(args.expectedDigest, existing ? { key: existing.key, mode: existing.mode, cohortIds: existing.cohortIds, updatedAt: existing.updatedAt } : { key: args.key, state: "absent" });
    const value = { mode: args.mode, cohortIds: [...new Set(args.cohortIds.map((id) => id.trim()).filter(Boolean))], updatedByPrincipalId: operator.principalId, reason, updatedAt: Date.now() };
    const id = existing ? (await ctx.db.patch(existing._id, value), existing._id) : await ctx.db.insert("featureFlags", { key: args.key, ...value });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: "feature_flag.set", targetType: "featureFlag", targetId: String(id), reason, metadata: { key: args.key, mode: args.mode, cohortIds: value.cohortIds } });
    return { mode: args.mode };
  },
});

export const setEvidenceLegalHold = mutation({
  args: { artifactId: v.id("evidenceArtifacts"), held: v.boolean(), reason: v.string(), expectedDigest: v.string() },
  returns: v.object({ legalHold: v.boolean() }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "security_operator" });
    const reason = nonemptyReason(args.reason);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.deletedAt) throw new ConvexError({ code: "NOT_FOUND", message: "Retained evidence artifact not found." });
    requireDigest(args.expectedDigest, { id: String(artifact._id), legalHold: artifact.legalHold, retentionDeleteAt: artifact.retentionDeleteAt, deletedAt: artifact.deletedAt ?? null });
    await ctx.db.patch(artifact._id, { legalHold: args.held });
    await ctx.db.insert("evidenceAccessEvents", { artifactId: artifact._id, actorPrincipalId: operator.principalId, action: "legal_hold", reason, result: "completed", occurredAt: Date.now() });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: args.held ? "evidence.hold" : "evidence.release_hold", targetType: "evidenceArtifact", targetId: String(artifact._id), reason, metadata: { held: args.held } });
    return { legalHold: args.held };
  },
});

export const setObligationHold = mutation({
  args: { obligationId: v.id("settlementObligations"), held: v.boolean(), reason: v.string(), expectedDigest: v.string() },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    const reason = nonemptyReason(args.reason);
    const obligation = await ctx.db.get(args.obligationId);
    const allowed = args.held ? obligation?.state === "pending" : obligation?.state === "held";
    if (!obligation || !allowed) throw new ConvexError({ code: "INVALID_STATE", message: "Only pending obligations may be held and only held obligations may be released." });
    requireDigest(args.expectedDigest, { id: String(obligation._id), state: obligation.state, amountBaseUnits: obligation.amountBaseUnits.toString(), walletId: String(obligation.walletId), recipientAddressSnapshot: obligation.recipientAddressSnapshot, decisionReference: obligation.decisionReference });
    const state = args.held ? "held" as const : "pending" as const;
    await ctx.db.patch(obligation._id, { state });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: args.held ? "obligation.hold" : "obligation.release_hold", targetType: "settlementObligation", targetId: String(obligation._id), reason, metadata: { priorState: obligation.state, nextState: state, amountBaseUnits: obligation.amountBaseUnits.toString() } });
    return { state };
  },
});

export const resolveMigrationFinding = mutation({
  args: { findingId: v.id("migrationReviewItems"), resolution: v.union(v.literal("resolved"), v.literal("ignored")), reason: v.string(), expectedDigest: v.string() },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    const reason = nonemptyReason(args.reason);
    const finding = await ctx.db.get(args.findingId);
    if (!finding || finding.status !== "open") throw new ConvexError({ code: "INVALID_STATE", message: "Open migration finding not found." });
    requireDigest(args.expectedDigest, { id: String(finding._id), status: finding.status, findingType: finding.findingType, resourceType: finding.resourceType, resourceId: finding.resourceId, details: finding.details });
    await ctx.db.patch(finding._id, { status: args.resolution, resolvedAt: Date.now() });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: "migration_finding.resolve", targetType: "migrationReviewItem", targetId: String(finding._id), reason, metadata: { resolution: args.resolution, findingType: finding.findingType } });
    return { status: args.resolution };
  },
});
