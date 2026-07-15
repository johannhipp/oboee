/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountRecovery from "../accountRecovery.js";
import type * as apiOperations from "../apiOperations.js";
import type * as apiProtocol from "../apiProtocol.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as contributions from "../contributions.js";
import type * as crons from "../crons.js";
import type * as delegations from "../delegations.js";
import type * as devFixtures from "../devFixtures.js";
import type * as evaluationV2 from "../evaluationV2.js";
import type * as evaluations from "../evaluations.js";
import type * as evidence from "../evidence.js";
import type * as fixtures from "../fixtures.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_apiOperationTransitions from "../lib/apiOperationTransitions.js";
import type * as lib_assignmentPolicy from "../lib/assignmentPolicy.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_contracts from "../lib/contracts.js";
import type * as lib_evaluationPolicy from "../lib/evaluationPolicy.js";
import type * as lib_evidencePolicy from "../lib/evidencePolicy.js";
import type * as lib_featureFlags from "../lib/featureFlags.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_identityOverride from "../lib/identityOverride.js";
import type * as lib_legacy from "../lib/legacy.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_operatorAudit from "../lib/operatorAudit.js";
import type * as lib_paymentPolicy from "../lib/paymentPolicy.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_principals from "../lib/principals.js";
import type * as lib_publicIdentity from "../lib/publicIdentity.js";
import type * as lib_reputationPolicy from "../lib/reputationPolicy.js";
import type * as lib_stateMachines from "../lib/stateMachines.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_walletProof from "../lib/walletProof.js";
import type * as lifecycle from "../lifecycle.js";
import type * as migrations from "../migrations.js";
import type * as operations from "../operations.js";
import type * as paymentIntents from "../paymentIntents.js";
import type * as payouts from "../payouts.js";
import type * as platform from "../platform.js";
import type * as postUseReviews from "../postUseReviews.js";
import type * as principals from "../principals.js";
import type * as purchases from "../purchases.js";
import type * as reputation from "../reputation.js";
import type * as rfs from "../rfs.js";
import type * as rfsV2 from "../rfsV2.js";
import type * as seeds from "../seeds.js";
import type * as settlements from "../settlements.js";
import type * as signingKeys from "../signingKeys.js";
import type * as skills from "../skills.js";
import type * as submissions from "../submissions.js";
import type * as users from "../users.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountRecovery: typeof accountRecovery;
  apiOperations: typeof apiOperations;
  apiProtocol: typeof apiProtocol;
  applications: typeof applications;
  auth: typeof auth;
  contributions: typeof contributions;
  crons: typeof crons;
  delegations: typeof delegations;
  devFixtures: typeof devFixtures;
  evaluationV2: typeof evaluationV2;
  evaluations: typeof evaluations;
  evidence: typeof evidence;
  fixtures: typeof fixtures;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/apiOperationTransitions": typeof lib_apiOperationTransitions;
  "lib/assignmentPolicy": typeof lib_assignmentPolicy;
  "lib/authorization": typeof lib_authorization;
  "lib/contracts": typeof lib_contracts;
  "lib/evaluationPolicy": typeof lib_evaluationPolicy;
  "lib/evidencePolicy": typeof lib_evidencePolicy;
  "lib/featureFlags": typeof lib_featureFlags;
  "lib/helpers": typeof lib_helpers;
  "lib/identityOverride": typeof lib_identityOverride;
  "lib/legacy": typeof lib_legacy;
  "lib/money": typeof lib_money;
  "lib/operatorAudit": typeof lib_operatorAudit;
  "lib/paymentPolicy": typeof lib_paymentPolicy;
  "lib/policy": typeof lib_policy;
  "lib/principals": typeof lib_principals;
  "lib/publicIdentity": typeof lib_publicIdentity;
  "lib/reputationPolicy": typeof lib_reputationPolicy;
  "lib/stateMachines": typeof lib_stateMachines;
  "lib/validators": typeof lib_validators;
  "lib/walletProof": typeof lib_walletProof;
  lifecycle: typeof lifecycle;
  migrations: typeof migrations;
  operations: typeof operations;
  paymentIntents: typeof paymentIntents;
  payouts: typeof payouts;
  platform: typeof platform;
  postUseReviews: typeof postUseReviews;
  principals: typeof principals;
  purchases: typeof purchases;
  reputation: typeof reputation;
  rfs: typeof rfs;
  rfsV2: typeof rfsV2;
  seeds: typeof seeds;
  settlements: typeof settlements;
  signingKeys: typeof signingKeys;
  skills: typeof skills;
  submissions: typeof submissions;
  users: typeof users;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
