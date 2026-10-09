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
import type * as batching from "../batching.js";
import type * as cash from "../cash.js";
import type * as catalog from "../catalog.js";
import type * as chat from "../chat.js";
import type * as checkout from "../checkout.js";
import type * as crons from "../crons.js";
import type * as delivery from "../delivery.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib_actionAuth from "../lib/actionAuth.js";
import type * as lib_alerts from "../lib/alerts.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cancel from "../lib/cancel.js";
import type * as lib_chat from "../lib/chat.js";
import type * as lib_complete from "../lib/complete.js";
import type * as lib_distance from "../lib/distance.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_paystack from "../lib/paystack.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_spend from "../lib/spend.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as lib_wallet from "../lib/wallet.js";
import type * as markets from "../markets.js";
import type * as notifications from "../notifications.js";
import type * as ops_cash from "../ops/cash.js";
import type * as ops_catalog from "../ops/catalog.js";
import type * as ops_dispatch from "../ops/dispatch.js";
import type * as ops_markets from "../ops/markets.js";
import type * as ops_orders from "../ops/orders.js";
import type * as ops_shoppers from "../ops/shoppers.js";
import type * as ops_slots from "../ops/slots.js";
import type * as ops_transfers from "../ops/transfers.js";
import type * as ops_users from "../ops/users.js";
import type * as orders from "../orders.js";
import type * as places from "../places.js";
import type * as priceChecks from "../priceChecks.js";
import type * as pricing from "../pricing.js";
import type * as rateLimits from "../rateLimits.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as shopper from "../shopper.js";
import type * as slots from "../slots.js";
import type * as traders from "../traders.js";
import type * as transfers from "../transfers.js";
import type * as users from "../users.js";
import type * as wallet from "../wallet.js";
import type * as withdrawals from "../withdrawals.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  admin: typeof admin;
  batching: typeof batching;
  cash: typeof cash;
  catalog: typeof catalog;
  chat: typeof chat;
  checkout: typeof checkout;
  crons: typeof crons;
  delivery: typeof delivery;
  http: typeof http;
  items: typeof items;
  "lib/actionAuth": typeof lib_actionAuth;
  "lib/alerts": typeof lib_alerts;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/cancel": typeof lib_cancel;
  "lib/chat": typeof lib_chat;
  "lib/complete": typeof lib_complete;
  "lib/distance": typeof lib_distance;
  "lib/errors": typeof lib_errors;
  "lib/notify": typeof lib_notify;
  "lib/paystack": typeof lib_paystack;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/settings": typeof lib_settings;
  "lib/spend": typeof lib_spend;
  "lib/stateMachine": typeof lib_stateMachine;
  "lib/wallet": typeof lib_wallet;
  markets: typeof markets;
  notifications: typeof notifications;
  "ops/cash": typeof ops_cash;
  "ops/catalog": typeof ops_catalog;
  "ops/dispatch": typeof ops_dispatch;
  "ops/markets": typeof ops_markets;
  "ops/orders": typeof ops_orders;
  "ops/shoppers": typeof ops_shoppers;
  "ops/slots": typeof ops_slots;
  "ops/transfers": typeof ops_transfers;
  "ops/users": typeof ops_users;
  orders: typeof orders;
  places: typeof places;
  priceChecks: typeof priceChecks;
  pricing: typeof pricing;
  rateLimits: typeof rateLimits;
  seed: typeof seed;
  settings: typeof settings;
  shopper: typeof shopper;
  slots: typeof slots;
  traders: typeof traders;
  transfers: typeof transfers;
  users: typeof users;
  wallet: typeof wallet;
  withdrawals: typeof withdrawals;
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
