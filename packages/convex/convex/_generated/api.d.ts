/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addresses from "../addresses.js";
import type * as admin from "../admin.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as lib_actionAuth from "../lib/actionAuth.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as lib_wallet from "../lib/wallet.js";
import type * as markets from "../markets.js";
import type * as ops_catalog from "../ops/catalog.js";
import type * as ops_markets from "../ops/markets.js";
import type * as ops_slots from "../ops/slots.js";
import type * as ops_users from "../ops/users.js";
import type * as places from "../places.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as slots from "../slots.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  admin: typeof admin;
  catalog: typeof catalog;
  crons: typeof crons;
  "lib/actionAuth": typeof lib_actionAuth;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/settings": typeof lib_settings;
  "lib/stateMachine": typeof lib_stateMachine;
  "lib/wallet": typeof lib_wallet;
  markets: typeof markets;
  "ops/catalog": typeof ops_catalog;
  "ops/markets": typeof ops_markets;
  "ops/slots": typeof ops_slots;
  "ops/users": typeof ops_users;
  places: typeof places;
  seed: typeof seed;
  settings: typeof settings;
  slots: typeof slots;
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

export declare const components: {};
