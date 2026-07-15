/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as contributions from "../contributions.js";
import type * as http from "../http.js";
import type * as lib_capabilities from "../lib/capabilities.js";
import type * as lib_paymentBoundary from "../lib/paymentBoundary.js";
import type * as lib_secretBoundary from "../lib/secretBoundary.js";
import type * as lib_skillMetadata from "../lib/skillMetadata.js";
import type * as payouts from "../payouts.js";
import type * as purchases from "../purchases.js";
import type * as rfs from "../rfs.js";
import type * as seeds from "../seeds.js";
import type * as skills from "../skills.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  contributions: typeof contributions;
  http: typeof http;
  "lib/capabilities": typeof lib_capabilities;
  "lib/paymentBoundary": typeof lib_paymentBoundary;
  "lib/secretBoundary": typeof lib_secretBoundary;
  "lib/skillMetadata": typeof lib_skillMetadata;
  payouts: typeof payouts;
  purchases: typeof purchases;
  rfs: typeof rfs;
  seeds: typeof seeds;
  skills: typeof skills;
  users: typeof users;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
