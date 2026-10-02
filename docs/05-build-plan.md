# OjaRun — 05 Build Plan (End to End)

This is the execution plan for building OjaRun from an empty repo to a public Android launch in Akure. It turns docs 01–04 into milestones, concrete tasks, file layouts, function lists and acceptance tests. Where the earlier docs leave a decision open, this plan picks a **working default** so engineering isn't blocked, and marks it so the business can overrule it.

Assumed team: **2 full-stack engineers** (one leaning mobile, one leaning backend/ops) plus a part-time designer and an ops lead. With one engineer, multiply durations by about 1.7.

---

## 1. Build invariants

These rules hold in every milestone. PR review should reject any change that breaks one.

1. **Money is integer kobo everywhere** (DB, function args, shared types). Format to naira only at the UI edge. Every money arg is checked with `Number.isInteger`.
2. **The server computes every amount.** The client sends intent (items, budgets, market, slot, address). It never sends totals or fees.
3. **Only webhooks and server re-verification change payment or transfer state.** Client callbacks are hints that trigger a refetch, nothing more.
4. **Every Convex function starts with an auth wrapper** (`customerQuery`, `shopperMutation`, `opsQuery`, ...). No raw `query`/`mutation` exports except internals.
5. **Every client-retriable mutation takes a `clientRequestId`** (UUID made on the device) and is idempotent on it.
6. **The wallet is an append-only ledger.** The cached balance is updated in the same mutation as the entry, never on its own.
7. **State machines are enforced on the server.** Order and item transitions go through one `transition()` helper per entity that rejects illegal moves and writes a `statusEvents` row.
8. **Secrets live only in Convex env vars** (Paystack, Google server key, Termii, Resend). The mobile app holds only publishable keys and a restricted Maps SDK key.

---

## 2. Working defaults for open questions

The engineering defaults below come from doc 04 §1–2. Each one sits in `settings` or behind a flag, so changing it later is a config edit, not a rebuild.

| Open question | Default used for the build | Where it lives | Owner / decide by |
|---|---|---|---|
| Service fee | ₦500 flat | `settings.serviceFeeKobo` | Business, before pilot |
| Delivery fee formula | `base ₦300 + ₦100/km`, min ₦500, max ₦2,000, rounded up to ₦50 | `settings.deliveryFee` | Business, before pilot |
| Slots | 10:00 cutoff → 13:00–15:00; 13:00 cutoff → 16:00–18:00; capacity 8 orders per shopper on shift | `slotTemplates` | Ops, before pilot |
| Price-check timeout | 300 s | `settings.priceCheckTimeoutSec` | Confirmed |
| Minimum withdrawal | ₦1,000 | `settings.minWithdrawalKobo` | Business |
| Paystack charge on cancellation | **✅ Decided: kept.** The refund to the wallet is everything except the Paystack charge. The checkout and cancel sheets both say so | `settings.refundPaystackChargeOnCancel = false` | Decided |
| Approved extra with an empty wallet | **✅ Decided: optional buffer at checkout.** The customer can add a buffer (presets 0 / 10% / 20% of budgets, default 10%), paid with the order. Approvals draw from the order's remaining buffer first, then from the wallet. Unused buffer returns as leftover credit | `orders.totals.buffer`, `settings.bufferPresets` | Decided |
| Cash-only traders | **✅ Decided: shoppers get cash when needed.** Ops issues a cash advance per batch; each cash spend needs a photo of the item and the trader; the advance is reconciled at the end of the batch (see §6.5) | `cashAdvances`, `cashSpends` | Decided |
| Price guide | **✅ Decided: collect silently from day one**, hidden from customers | `settings.showPriceGuide = false` | Decided |
| Rejected items | Shopper brings them back; ops records the outcome (`returned_to_trader` / `staff` / `discarded`) on the item | `orderItems.rejectionOutcome` | Ops |
| Support channel | **✅ Decided: WhatsApp + phone.** The "Contact support" sheet opens WhatsApp (`wa.me` link) or dials ops | `settings.supportWhatsapp`, `settings.supportPhone` | Decided |
| Theme | **✅ Decided: light and dark at launch**, following the system setting, with a manual override in Profile | §7 | Decided |
| Typeface | **✅ Decided: Plus Jakarta Sans** | §7 | Decided |

**Questions the docs don't answer yet.** The build needs a default for each:

| Gap | Default |
|---|---|
| Customer isn't home or never taps Accept | **✅ Decided:** shopper taps "Customer unavailable" → ops calls. Ops can **complete on the customer's behalf with a reason** (audited). No auto-accept. |
| A slot has paid orders but no shopper available | Ops cancels with reason → full refund to wallet, incl. Paystack charge, plus an apology push/SMS. |
| An item isn't in the market at all | Shopper marks `skipped` with a note; the full item budget goes back as leftover credit. |
| One trader sells several items | One transfer **per item** (clean audit trail; transfer fees of about ₦10–₦25 each are absorbed into the service fee). |
| Funding the Paystack balance for same-day transfers | See §3: transfers are paid from the Paystack balance, and today's card payments may not be available yet. |
| Customer email | Optional field on profile. Receipts are emailed only if it's set; otherwise they stay in-app. |
| Account deletion | Required by Google Play. Soft-delete the user, anonymise PII, keep ledger and payment rows for accounting. |

---

## 3. Start on day 1: long-lead, non-code items

These gate the launch more than the code does. The ops lead starts them in week 1.

| # | Item | Why it's on the critical path |
|---|---|---|
| L1 | **CAC business registration** (if not done) and a corporate bank account | Paystack needs it for a live account and for Transfers |
| L2 | **Paystack live account + Transfers enabled** | Compliance review can take weeks. Ask for: Transfers enabled, **transfer OTP disabled** (needed for API-initiated transfers), webhook URL set, and how settlement works with the balance (see L3) |
| L3 | **Paystack balance funding strategy** | Trader transfers come out of the Paystack balance. Card payments settle on a delay, so morning orders may not be in the balance by noon. Decide: keep a **daily float** topped up from the corporate account, and/or set settlement so funds stay in the balance. Confirm with Paystack support. |
| L4 | **Clerk SMS to Nigerian numbers**: deliverability on MTN/Airtel/Glo/9mobile, plus pricing | If it's poor, move to a custom OTP via Termii (Clerk custom SMS or Convex Auth). Test with real SIMs in week 1. |
| L5 | **Termii account + sender ID registration** | Sender ID approval in Nigeria takes time |
| L6 | **Google Cloud project**: billing, Places API (New), Routes API, Maps SDK for Android; budget alerts | Restricted keys per platform |
| L7 | **Google Play Console** developer account (organisation) | D-U-N-S number and verification for organisation accounts take time |
| L8 | **Domain + email** (`ojarun.ng` / `.com`), Resend domain verification (SPF/DKIM) | Receipts, Paystack callback page, privacy policy URL |
| L9 | **Legal**: terms of service, privacy policy (Nigeria Data Protection Act 2023), wallet terms (credits only, no deposits), shopper employment contracts | Needed for Play listing and checkout copy |
| L10 | **Launch market data**: names, GPS coordinates, opening hours for Oja Oba, Isinkan, Oba Adesida/NEPA, Shasha, etc. (ops to verify list) + **Akure geofence polygon** | Seed data for M1 |
| L11 | **Item catalogue v1**: about 80 common items with Yoruba/English aliases, unit hints and preset preferences | List builder in M2 |
| L12 | **Hardware**: two low-end Android test phones (2–3 GB RAM, Android 10–12), cooler boxes, shopper data plans | Real-device QA from M3 |

---

## 4. Repository and tooling

### 4.1 Layout

```
ojarun/
  apps/
    mobile/                      # Expo (dev builds), Expo Router
      app/
        _layout.tsx              # Providers: Clerk, Convex, theme, Sentry, PostHog
        index.tsx                # Role router → /(customer) | /(shopper) | /(auth)
        (auth)/
          phone.tsx  verify.tsx  profile.tsx
        (customer)/
          _layout.tsx            # Tabs: Home, Orders, Wallet, Profile
          index.tsx              # Home / start order
          order/new/
            address.tsx  market.tsx  list.tsx  slot.tsx  review.tsx
          order/[id]/
            index.tsx            # Timeline + live checklist
            chat.tsx  inspect.tsx  receipt.tsx
          addresses/  wallet/  profile/
        (shopper)/
          _layout.tsx            # Tabs: Today, Queue, Profile
          index.tsx              # Today's batches + on-shift toggle
          batch/[id].tsx
          order/[id]/
            index.tsx  item/[itemId].tsx  pay/[itemId].tsx  chat.tsx  handoff.tsx
          queue.tsx              # Upload/transfer queue status
      src/
        components/  features/  lib/ (convex.ts, money.ts, queue/, camera/, location/)
        stores/                  # Zustand stores (draftOrder, queue, prefs)
      app.config.ts  eas.json  tailwind.config.js  metro.config.js
    ops/                         # Next.js (App Router)
      app/(dashboard)/
        orders/  dispatch/  shoppers/  transfers/  wallet/  settings/  price-guide/  support/
      middleware.ts              # Clerk; ops role gate
  packages/
    convex/                      # Convex backend (the only `convex/` dir)
      convex/
        schema.ts  auth.config.ts  http.ts  crons.ts
        lib/   (auth.ts, money.ts, stateMachine.ts, geofence.ts, paystack.ts, audit.ts)
        users.ts addresses.ts markets.ts catalog.ts slots.ts pricing.ts
        orders.ts checkout.ts items.ts chat.ts priceChecks.ts
        transfers.ts traders.ts wallet.ts withdrawals.ts
        batching.ts notifications.ts priceGuide.ts
        ops/ (orders.ts, dispatch.ts, shoppers.ts, transfers.ts, wallet.ts, settings.ts)
      package.json              # exports "./api" → convex/_generated/api
    shared/                      # Zod schemas, constants, pure functions (fees, geofence, formatting)
      src/ fees.ts paystackFee.ts geofence.ts money.ts statuses.ts schemas/
    ui/                          # Brand tokens (colors, spacing) consumed by both Tailwind configs
    config/                      # tsconfig, eslint, prettier presets
  turbo.json  package.json  pnpm-workspace.yaml
```

Package manager: **pnpm** workspaces. Set `node-linker=hoisted` in `.npmrc` so Metro resolves cleanly.

### 4.2 Key libraries (pin to the latest stable when scaffolding)

| Concern | Library |
|---|---|
| Mobile core | `expo`, `expo-router`, `expo-dev-client`, New Architecture on |
| Styling | `nativewind` + `tailwindcss` (the version pairing NativeWind supports), tokens from `packages/ui` |
| State | `zustand`, `react-native-mmkv` (persist adapter via `createJSONStorage`) |
| Auth | `@clerk/clerk-expo` (+ `expo-secure-store` token cache), `@clerk/nextjs` |
| Backend client | `convex`, `convex/react-clerk` (`ConvexProviderWithClerk`), `convex-helpers` (custom functions, Zod validation) |
| Forms | `react-hook-form`, `zod`, `@hookform/resolvers` |
| Camera / images | `expo-camera` (or `expo-image-picker` with camera), `expo-image-manipulator`, `expo-image`, `expo-file-system` |
| Location / maps | `expo-location` (foreground only), `react-native-maps` (Google provider) |
| Network | `@react-native-community/netinfo` |
| Sheets, motion, feel | `@gorhom/bottom-sheet`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-keyboard-controller`, `expo-haptics` |
| Icons / fonts / images | `phosphor-react-native`, `@expo-google-fonts/plus-jakarta-sans`, `expo-image` (thumbhash placeholders) |
| Ops web UI | Radix primitives + Tailwind (same tokens as CSS variables), `vaul` for bottom drawers |
| Payments UI | `expo-web-browser` (`openAuthSessionAsync`) for Paystack checkout |
| Push | `expo-notifications` |
| Observability | `@sentry/react-native`, `posthog-react-native`, `@sentry/nextjs`, `posthog-js` |
| Testing | `vitest`, `convex-test`, `@testing-library/react-native`, Maestro (mobile E2E), Playwright (ops) |

### 4.3 Environments

| | Dev | Preview / staging | Production |
|---|---|---|---|
| Convex | Personal dev deployments | `staging` deployment | `prod` deployment |
| Clerk | Dev instance | Dev instance | Prod instance |
| Paystack | Test keys | Test keys | Live keys |
| EAS build profile | `development` (dev client) | `preview` (internal APK) | `production` (AAB) |
| EAS Update channel | — | `preview` | `production` |
| Ops dashboard | localhost | Vercel preview | Vercel prod (`ops.ojarun.…`) |

**Convex env vars:** `CLERK_JWT_ISSUER_DOMAIN`, `PAYSTACK_SECRET_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, `RESEND_API_KEY`, `APP_ENV`, `PAYSTACK_CALLBACK_URL`.
**Mobile (`EXPO_PUBLIC_*`):** `CONVEX_URL`, `CLERK_PUBLISHABLE_KEY`, `POSTHOG_KEY`, `SENTRY_DSN`. The Maps Android key goes in `app.config.ts`, restricted to the package name and SHA-1.

### 4.4 CI (GitHub Actions)
- On PR: `turbo run lint typecheck test` (shared + convex tests with `convex-test`), plus a Next.js build.
- On merge to `main`: `npx convex deploy` to staging, then an EAS Update to the `preview` channel, then a Vercel preview.
- On release tag: Convex deploy to prod → EAS Build `production` → manual Play Console promotion. Run schema changes as widen-then-narrow migrations (add the optional field, backfill, then make it required).

---

## 5. Backend foundation

### 5.1 Schema (`packages/convex/convex/schema.ts`)

This extends the draft in doc 02 §12. Additions: `catalogItems`, `slotTemplates`, `pushTokens`, `webhookEvents`, `auditLog`, `clientRequestId` fields, and a cached wallet balance. Batches don't store `orderIds` arrays; orders point to their batch through an index, which avoids write contention.

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const kobo = v.number(); // integer kobo; asserted in mutations
const role = v.union(v.literal("customer"), v.literal("shopper"), v.literal("ops"));
const orderStatus = v.union(
  v.literal("pending_payment"), v.literal("paid"), v.literal("assigned"),
  v.literal("shopping"), v.literal("en_route"), v.literal("arrived"),
  v.literal("completed"), v.literal("cancelled"), v.literal("expired"),
);
const itemStatus = v.union(
  v.literal("pending"), v.literal("bought"), v.literal("adjusted"),
  v.literal("skipped"), v.literal("rejected"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(), phone: v.string(), name: v.optional(v.string()),
    email: v.optional(v.string()), role, status: v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted")),
    walletBalance: kobo, // cache; ledger is the source of truth
  }).index("by_clerkId", ["clerkId"]).index("by_role", ["role"]).index("by_phone", ["phone"]),

  shopperProfiles: defineTable({
    userId: v.id("users"), active: v.boolean(), onShift: v.boolean(),
    legalName: v.string(), nameTokens: v.array(v.string()), // normalised, for fraud matching
    bankAccounts: v.array(v.object({ accountNumber: v.string(), bankCode: v.string(), resolvedName: v.string() })),
    lastLocation: v.optional(v.object({ lat: v.number(), lng: v.number(), at: v.number() })),
  }).index("by_user", ["userId"]).index("by_onShift", ["onShift"]),

  addresses: defineTable({
    userId: v.id("users"), label: v.string(), lat: v.number(), lng: v.number(),
    formatted: v.string(), placeId: v.optional(v.string()), landmark: v.string(),
    insideGeofence: v.boolean(), archived: v.boolean(),
  }).index("by_user", ["userId"]),

  markets: defineTable({
    name: v.string(), slug: v.string(), lat: v.number(), lng: v.number(),
    opensAtMin: v.number(), closesAtMin: v.number(), active: v.boolean(), sortOrder: v.number(),
  }).index("by_active", ["active"]),

  catalogItems: defineTable({
    name: v.string(), aliases: v.array(v.string()), category: v.string(),
    presetPreferences: v.array(v.object({ group: v.string(), options: v.array(v.string()) })),
    unitHint: v.optional(v.string()), active: v.boolean(),
  }).searchIndex("search_name", { searchField: "name" }),

  slotTemplates: defineTable({
    label: v.string(), cutoffMin: v.number(), windowStartMin: v.number(), windowEndMin: v.number(),
    capacityPerShopper: v.number(), daysOfWeek: v.array(v.number()), active: v.boolean(),
  }),

  slots: defineTable({
    templateId: v.id("slotTemplates"), date: v.string(), // "2026-10-02", Africa/Lagos
    cutoffAt: v.number(), windowStart: v.number(), windowEnd: v.number(),
    capacity: v.number(), reserved: v.number(), status: v.union(v.literal("open"), v.literal("closed")),
  }).index("by_date", ["date"]).index("by_status_cutoff", ["status", "cutoffAt"]),

  distanceCache: defineTable({
    addressId: v.id("addresses"), marketId: v.id("markets"),
    distanceMeters: v.number(), durationSec: v.number(), calculatedAt: v.number(),
  }).index("by_address_market", ["addressId", "marketId"]),

  orders: defineTable({
    customerId: v.id("users"), marketId: v.id("markets"), addressId: v.id("addresses"),
    addressSnapshot: v.object({ formatted: v.string(), landmark: v.string(), lat: v.number(), lng: v.number() }),
    slotId: v.id("slots"), status: orderStatus, clientRequestId: v.string(),
    totals: v.object({ budgets: kobo, buffer: kobo, serviceFee: kobo, deliveryFee: kobo,
                       paystackCharge: kobo, walletApplied: kobo, chargeAmount: kobo }),
    bufferUsed: kobo, // sum of approved extras funded from the buffer
    paystackReference: v.optional(v.string()), holdExpiresAt: v.number(),
    batchId: v.optional(v.id("batches")), shopperId: v.optional(v.id("users")),
    cancelReason: v.optional(v.string()), completedBy: v.optional(v.id("users")),
  }).index("by_customer", ["customerId"]).index("by_status", ["status"])
    .index("by_slot_market_status", ["slotId", "marketId", "status"])
    .index("by_shopper_status", ["shopperId", "status"]).index("by_batch", ["batchId"])
    .index("by_reference", ["paystackReference"]).index("by_clientRequestId", ["clientRequestId"]),

  orderItems: defineTable({
    orderId: v.id("orders"), position: v.number(), name: v.string(),
    catalogItemId: v.optional(v.id("catalogItems")), budget: kobo,
    preferences: v.array(v.string()), note: v.optional(v.string()), status: itemStatus,
    approvedExtra: kobo, amountSpent: kobo, // = successful transfers + recorded cash spends
    photoStorageId: v.optional(v.id("_storage")), shopperNote: v.optional(v.string()),
    quantityNote: v.optional(v.string()), // "2 paint rubbers"
    rejectionReason: v.optional(v.string()),
    rejectionOutcome: v.optional(v.union(v.literal("returned_to_trader"), v.literal("staff"), v.literal("discarded"))),
  }).index("by_order", ["orderId"]),

  batches: defineTable({
    marketId: v.id("markets"), slotId: v.id("slots"), shopperId: v.optional(v.id("users")),
    status: v.union(v.literal("proposed"), v.literal("assigned"), v.literal("in_progress"), v.literal("done")),
  }).index("by_slot", ["slotId"]).index("by_shopper_status", ["shopperId", "status"]),

  messages: defineTable({
    orderId: v.id("orders"), senderId: v.optional(v.id("users")), // undefined = system
    type: v.union(v.literal("text"), v.literal("image"), v.literal("price_check"), v.literal("system")),
    body: v.optional(v.string()), imageId: v.optional(v.id("_storage")), clientRequestId: v.string(),
    priceCheck: v.optional(v.object({
      itemId: v.id("orderItems"), budget: kobo, quoted: kobo, budgetGets: v.string(),
      extraRequested: kobo, state: v.union(v.literal("pending"), v.literal("approved"),
        v.literal("buy_within_budget"), v.literal("timed_out")),
      expiresAt: v.number(), respondedAt: v.optional(v.number()),
    })),
  }).index("by_order", ["orderId"]),

  payments: defineTable({
    orderId: v.id("orders"), reference: v.string(), amount: kobo,
    status: v.union(v.literal("initialized"), v.literal("success"), v.literal("failed"), v.literal("abandoned")),
    paidAt: v.optional(v.number()), channel: v.optional(v.string()), raw: v.optional(v.any()),
  }).index("by_reference", ["reference"]).index("by_order", ["orderId"]),

  webhookEvents: defineTable({ key: v.string(), event: v.string(), receivedAt: v.number() }).index("by_key", ["key"]),

  traders: defineTable({
    accountNumber: v.string(), bankCode: v.string(), resolvedName: v.string(),
    recipientCode: v.string(), marketId: v.optional(v.id("markets")),
    firstSeenAt: v.number(), transferCount: v.number(), flagged: v.boolean(),
    reviewedBy: v.optional(v.id("users")), reviewedAt: v.optional(v.number()),
  }).index("by_account", ["bankCode", "accountNumber"]).index("by_flagged", ["flagged"]),

  traderTransfers: defineTable({
    orderId: v.id("orders"), itemId: v.id("orderItems"), shopperId: v.id("users"),
    traderId: v.id("traders"), amount: kobo, clientRequestId: v.string(), reference: v.string(),
    transferCode: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("pending"), v.literal("success"),
      v.literal("failed"), v.literal("reversed"), v.literal("blocked")),
    failureReason: v.optional(v.string()), newRecipient: v.boolean(),
  }).index("by_item", ["itemId"]).index("by_status", ["status"])
    .index("by_clientRequestId", ["clientRequestId"]).index("by_reference", ["reference"]),

  cashAdvances: defineTable({
    batchId: v.id("batches"), shopperId: v.id("users"), amount: kobo, issuedBy: v.id("users"),
    issuedAt: v.number(), returnedAmount: v.optional(kobo), variance: v.optional(kobo),
    status: v.union(v.literal("issued"), v.literal("reconciled"), v.literal("disputed")),
    reconciledBy: v.optional(v.id("users")), note: v.optional(v.string()),
  }).index("by_batch", ["batchId"]).index("by_shopper_status", ["shopperId", "status"]),

  cashSpends: defineTable({
    advanceId: v.id("cashAdvances"), orderId: v.id("orders"), itemId: v.id("orderItems"),
    shopperId: v.id("users"), amount: kobo, traderPhotoId: v.id("_storage"),
    traderLabel: v.optional(v.string()), clientRequestId: v.string(), at: v.number(),
  }).index("by_item", ["itemId"]).index("by_advance", ["advanceId"])
    .index("by_clientRequestId", ["clientRequestId"]),

  walletEntries: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("leftover_credit"), v.literal("rejection_credit"), v.literal("cancellation_refund"),
      v.literal("checkout_debit"), v.literal("price_check_debit"), v.literal("withdrawal_debit"),
      v.literal("withdrawal_reversal"), v.literal("adjustment")),
    amount: kobo, // signed
    orderId: v.optional(v.id("orders")), withdrawalId: v.optional(v.id("withdrawals")),
    note: v.optional(v.string()), createdBy: v.optional(v.id("users")), dedupeKey: v.string(),
  }).index("by_user", ["userId"]).index("by_dedupeKey", ["dedupeKey"]),

  withdrawals: defineTable({
    userId: v.id("users"), amount: kobo, accountNumber: v.string(), bankCode: v.string(),
    resolvedName: v.string(), recipientCode: v.optional(v.string()), reference: v.string(),
    transferCode: v.optional(v.string()), clientRequestId: v.string(),
    status: v.union(v.literal("requested"), v.literal("pending"), v.literal("success"),
      v.literal("failed"), v.literal("reversed")),
  }).index("by_user", ["userId"]).index("by_status", ["status"]).index("by_reference", ["reference"]),

  priceGuide: defineTable({
    itemKey: v.string(), marketId: v.id("markets"),
    samples: v.array(v.object({ amount: kobo, quantityNote: v.optional(v.string()), at: v.number() })),
    updatedAt: v.number(),
  }).index("by_item_market", ["itemKey", "marketId"]),

  settings: defineTable({ key: v.literal("global"), value: v.any() }).index("by_key", ["key"]),
  statusEvents: defineTable({
    orderId: v.id("orders"), status: v.string(), actorId: v.optional(v.id("users")),
    lat: v.optional(v.number()), lng: v.optional(v.number()), at: v.number(),
  }).index("by_order", ["orderId"]),
  pushTokens: defineTable({ userId: v.id("users"), token: v.string(), platform: v.string(), updatedAt: v.number() })
    .index("by_user", ["userId"]).index("by_token", ["token"]),
  auditLog: defineTable({
    actorId: v.id("users"), action: v.string(), targetTable: v.string(), targetId: v.string(),
    reason: v.string(), before: v.optional(v.any()), after: v.optional(v.any()), at: v.number(),
  }).index("by_target", ["targetTable", "targetId"]),
});
```

`settings.value` is validated with a Zod schema from `packages/shared` on every read and write. That gives typed config without a migration each time a knob is added.

### 5.2 Auth and roles (`convex/lib/auth.ts`)

- `auth.config.ts` points at the Clerk issuer domain, using the Clerk JWT template named `convex`.
- `users.ensureUser` (mutation, called once after sign-in) upserts by `clerkId` with `role: "customer"`. **It never accepts a role argument.**
- Wrappers are built with `convex-helpers` `customQuery`/`customMutation`: `authedQuery` resolves `ctx.user`; `customerMutation`, `shopperQuery`, `opsMutation` and the rest also assert the role and `status === "active"`.
- Shopper-scoped helpers: `assertShopperOwnsOrder(ctx, orderId)` checks `order.shopperId === ctx.user._id`. Customers get the equivalent `assertCustomerOwnsOrder`.
- Promoting a user to shopper or ops happens only through `ops/shoppers.createShopper` / `ops/users.setRole`. Each call writes to `auditLog`. Ops role bootstrap: a one-off internal mutation run from the Convex dashboard for the first admin.
- Optional: mirror the role to Clerk `publicMetadata` for the Next.js middleware gate. Convex stays authoritative.

### 5.3 State machines (`convex/lib/stateMachine.ts`)

```ts
const ORDER_TRANSITIONS = {
  pending_payment: ["paid", "expired", "cancelled"],
  paid:            ["assigned", "cancelled"],
  assigned:        ["shopping", "cancelled"],
  shopping:        ["en_route"],
  en_route:        ["arrived"],
  arrived:         ["completed"],
} as const;
// transitionOrder(ctx, order, to, actor, {lat,lng}?) → throws on illegal move,
// patches status, inserts statusEvents, schedules notifications.
```
The item machine is `pending → bought | adjusted | skipped`, and `bought | adjusted → rejected` only while the order is `arrived`.

### 5.4 Pure money functions (`packages/shared`)

These are unit-tested exhaustively. The server and the client price preview both import them.

- `deliveryFee(distanceMeters, cfg)`: `clamp(base + ceil(km) × perKm, min, max)`, rounded up to the nearest ₦50.
- `paystackGrossUp(netKobo, cfg)` returns the customer charge so that the business **nets** `net` after Paystack's local-card fee. With the default config (1.5% + ₦100, ₦100 waived under ₦2,500, fee capped at ₦2,000; **verify current Paystack pricing and keep it in settings**):
  ```
  gross = ceil((net + 100_00) / 0.985)
  if gross < 2_500_00:          gross = ceil(net / 0.985)
  if gross - net > 2_000_00:    gross = net + 2_000_00
  paystackCharge = gross - net
  ```
- `bufferAmount(budgets, preset)`: `round up to ₦50 (budgets × preset%)`. The default preset is 10%, and the customer can choose 0.
- `orderTotals({budgets, buffer, serviceFee, deliveryFee, walletBalance, applyWallet})`: the wallet is applied against `budgets + buffer + serviceFee + deliveryFee` first, and the Paystack charge is calculated only on the remainder. If the wallet covers everything, **skip Paystack entirely**: the order goes straight to `paid` through an internal mutation, with the `checkout_debit` written in the same transaction.
- `completionCredits(items)`: for each item, `funded = budget + approvedExtra`. Kept items return `funded − amountSpent` as `leftover_credit`. Rejected items return `amountSpent` as `rejection_credit` plus `funded − amountSpent` as leftover. Skipped items return `funded` as leftover. The unused buffer (`buffer − bufferUsed`) is added to the leftover too. `approvedExtra` counts in `funded` no matter which source paid for it, because the money was already collected (buffer) or debited (wallet).
- `cancellationRefund(order)`: `chargeAmount − paystackCharge + walletApplied`. This keeps the Paystack charge, as decided in §2.
- `isInsideGeofence(point, polygon)`: ray casting, with tests on known Akure points and on outskirts.

### 5.5 Function inventory

| Module | Public functions (role) | Internal / scheduled |
|---|---|---|
| `users` | `ensureUser`, `me`, `updateProfile`, `registerPushToken`, `deleteAccount` (customer) | — |
| `addresses` | `list`, `create` (geofence check), `update`, `archive` (customer) | `precomputeDistances` (action) |
| `places` | `autocomplete(input, sessionToken)`, `placeDetails(placeId, sessionToken)` (action, customer) | — |
| `markets` / `catalog` | `listActive`, `searchItems`, `presetsFor` (authed) | — |
| `pricing` | `quoteMarkets(addressId)` → fee per market; `quoteOrder(draft)` (action: fills distance cache via the Routes API, then calls a query) | `getOrComputeDistance` |
| `slots` | `availableFor(date)` (open, before cutoff, `reserved < capacity`) | `generateDaily` (cron), `closeAtCutoff` (scheduled per slot) |
| `orders` | `create(clientRequestId, draft)` → `pending_payment` + slot hold; `get`, `listMine`, `cancel` (customer) | `expireStale`, `markPaid` |
| `checkout` | `initPayment(orderId)` (action → Paystack `/transaction/initialize`) | `verifyAndApply(reference)` (action → `/transaction/verify`) |
| `http` | `POST /paystack/webhook` | dispatches to `markPaid`, `applyTransferResult` |
| `batching` | — | `runForSlot(slotId)`, `proposeAssignments` |
| `items` (shopper) | `startShopping(orderId)`, `attachPhoto(itemId, storageId)`, `setOutcome(itemId, status, note, quantityNote)`, `generateUploadUrl` | — |
| `cash` | `recordCashSpend(clientRequestId, itemId, amount, traderPhotoId)` (shopper); `myAdvance(batchId)` (shopper) | ops: `issueAdvance`, `reconcileAdvance` |
| `traders` | `resolveAccount(accountNumber, bankCode)` (action, shopper), `listBanks` (cached), `recentForMarket` | `upsertFromResolution` |
| `transfers` | `requestTraderTransfer(clientRequestId, itemId, traderAccount, amount)` (shopper) | `initiate` (action → `/transferrecipient`, `/transfer`), `applyTransferResult`, `reconcilePending` |
| `chat` | `list(orderId)`, `send(clientRequestId, orderId, body/image)` (customer or shopper on the order) | `postSystem` |
| `priceChecks` | `send(itemId, quoted, budgetGets, extraRequested)` (shopper), `respond(messageId, "approve" \| "within_budget")` (customer) | `timeout(messageId)` (scheduled +300 s) |
| `delivery` | `enRoute(orderId, loc)`, `arrived(orderId, loc)`, `customerUnavailable` (shopper); `rejectItem(itemId, reason)`, `accept(orderId)` (customer) | `completeOrder` (credits, price guide, receipts) |
| `wallet` | `balance`, `ledger(paginated)` (customer) | `post(entry)` (the only writer; uses `dedupeKey`) |
| `withdrawals` | `resolveAccount`, `request(clientRequestId, amount, account)` (customer) | `initiate`, `applyResult`, `reconcile` |
| `notifications` | — | `notify(userId, eventKey, payload)` → push (Expo), SMS (Termii) for critical events, email (Resend) |
| `ops/*` | Order board, dispatch (assign/rebalance), shoppers CRUD + shifts, transfer review, trader registry, wallet adjustments (reason required), settings CRUD, price guide edits, support actions (cancel with reason, complete on behalf) | — |

### 5.6 Crons and scheduled jobs (`convex/crons.ts`)

Convex crons run in UTC, and Akure is UTC+1 with no DST.

| Job | Schedule | Notes |
|---|---|---|
| `slots.generateDaily` | daily 23:00 UTC (00:00 WAT) | Creates tomorrow's (and today's, if missing) slots from templates. Capacity = `capacityPerShopper × shoppers expected on shift`. Ops can edit. Each slot schedules its own `closeAtCutoff` with `scheduler.runAt(cutoffAt)`. |
| `orders.expireStale` | every 5 min | `pending_payment` past `holdExpiresAt` (30 min): **verify with Paystack first**, then mark `paid` or `expired` and release the slot hold. |
| `transfers.reconcilePending` | every 10 min | Transfers `pending` for more than 10 min are re-fetched from Paystack (`/transfer/verify/:reference`). |
| `withdrawals.reconcile` | every 15 min | Same as above, for withdrawals. |
| `priceChecks.timeout` | `runAfter(timeoutSec)` per check | No-op unless the check is still `pending`. |
| `ops.dailyDigest` | 19:00 WAT | Email to ops: orders, GMV, flagged traders, failed transfers, open rejections. |

---

## 6. Critical flows, step by step

### 6.1 Checkout and payment
1. The app calls `orders.create({clientRequestId, addressId, marketId, slotId, items[], applyWallet})`.
2. The mutation validates the geofence, that the slot is open and before cutoff, and that `reserved < capacity`. It increments `slot.reserved` (the hold), computes totals with `packages/shared`, inserts the order and items, and debits the wallet portion (`checkout_debit`, dedupeKey `checkout:<orderId>`). If `chargeAmount === 0`, it marks the order paid and stops there.
3. The app calls the `checkout.initPayment(orderId)` action, which POSTs to Paystack `/transaction/initialize` with `amount = chargeAmount`, `reference = "ojr_" + orderId + "_" + attempt`, `metadata.orderId`, `callback_url = https://ojarun…/pay/return`, and `channels: ["card","bank","ussd","bank_transfer"]`.
4. The app opens `authorization_url` with `WebBrowser.openAuthSessionAsync`. When the browser closes, it calls `checkout.verifyAndApply(reference)` as a fast path. Meanwhile the UI watches `orders.get` reactively.
5. The webhook `POST /paystack/webhook` reads the raw body with `await request.text()`, computes **HMAC-SHA512 with the secret key** (Web Crypto `crypto.subtle`), and compares it to `x-paystack-signature` in constant time. On a mismatch it returns 401. It then inserts `webhookEvents` (key = `event + data.reference`) and returns 200 early if the key already exists, then runs the internal action.
6. `verifyAndApply` → `GET /transaction/verify/:reference`. This runs only if `status === "success"`, `amount === order.totals.chargeAmount`, `currency === "NGN"`, and the order is `pending_payment`. The internal mutation `markPaid` then writes the payment row, transitions the order to `paid`, and schedules a push and an email receipt.
7. If the payment arrives after the order expired (a late webhook), it's still recorded, and the amount is credited to the wallet as `adjustment`, with a flag on the ops board. The slot isn't re-reserved.

### 6.2 Trader transfer
1. Shopper takes the photo. The queue uploads it and calls `items.attachPhoto`.
2. Shopper enters the account number and picks a bank (or picks a recent trader for this market). The `traders.resolveAccount` action calls `GET /bank/resolve`, and the **resolved name is shown in large text**.
3. Shopper confirms and enters the amount. The queue calls `transfers.requestTraderTransfer` with a `clientRequestId`. The mutation runs these checks in order:
   - the shopper is assigned to the order, and the order is `shopping`
   - the item has a `photoStorageId`
   - `sum(success|pending|queued transfers for the item) + sum(cash spends for the item) + amount ≤ budget + approvedExtra`
   - the resolved name tokens don't overlap with **any** shopper's `nameTokens` beyond a threshold, and the account isn't in any shopper's `bankAccounts`. A match → `blocked` + an ops alert.
   - the account isn't in `traders` → `newRecipient = true`, and the trader is flagged for after-the-fact review, without blocking the payment.
4. The insert happens as `queued`, then `scheduler.runAfter(0, transfers.initiate)`. That action creates the recipient if there's no `recipientCode` (`/transferrecipient`, type `nuban`), then calls `/transfer` with `source: "balance"` and `reference`. The status becomes `pending`.
5. Webhooks `transfer.success | transfer.failed | transfer.reversed` → `applyTransferResult`. On success, `item.amountSpent += amount` and `trader.transferCount++`. **`amountSpent` is derived only from successful transfers**, so a shopper can't misreport it.
6. Failures show up in the shopper's queue screen with a "Retry", which uses a new reference and the same request lineage. Insufficient Paystack balance raises a page to ops.

### 6.3 Price check
1. Shopper sends `priceChecks.send` → a `price_check` message (state `pending`, `expiresAt = now + 300 s`), a push, **and an SMS** to the customer, and schedules `timeout`.
2. The customer sees a price-check bottom sheet with "Approve extra ₦X" or "Buy within budget". The sheet also shows where the extra comes from: "From your buffer (₦1,200 left)" or "From wallet". Approve is enabled only if `(buffer − bufferUsed) + walletBalance ≥ extraRequested`.
3. `respond("approve")` → in one mutation: take `min(extra, bufferLeft)` from the buffer (`order.bufferUsed += …`), take any remainder from the wallet (a `price_check_debit` entry), and set `item.approvedExtra += extra`. `respond("within_budget")` or the timeout → state set, then a system message ("Tomatoes cost more today, so we bought ₦3,000 worth").
4. The shopper UI reacts live. The transfer cap updates automatically because it reads `approvedExtra`.

### 6.4 Door, acceptance and completion
1. `arrived` → the customer's inspect screen lists bought and adjusted items with photos.
2. `rejectItem(itemId, reason)` is allowed only while the order is `arrived`, and is reversible until accept.
3. `accept(orderId)` → `completeOrder` (internal, a single mutation): transitions to `completed`, writes the `leftover_credit` and `rejection_credit` entries (dedupeKeys `leftover:<orderId>`, `reject:<itemId>`), appends price-guide samples for kept items, marks the batch done when all its orders are done, and schedules notifications and the final receipt email.
4. Cancellation: `orders.cancel` is allowed in `pending_payment | paid | assigned`. It writes a `cancellation_refund` for `cancellationRefund(order)` (everything except the Paystack charge, per §2), releases the slot hold, and posts a system message. The cancel sheet shows the exact refund amount before the customer confirms. When ops cancels because no shopper is available, the Paystack charge **is** refunded too (it's the business's fault). This is a separate `adjustment` entry with a reason.

### 6.5 Cash advances (cash-only traders)
1. During dispatch, ops can issue a cash advance to a batch's shopper (`ops.issueAdvance(batchId, amount)`). The amount suggested is the batch's total budgets × `settings.cashAdvanceSuggestPct` (default 30%). The shopper confirms receipt in the app, and the confirmation is timestamped.
2. On the item's pay sheet, the shopper picks **Bank transfer** or **Cash**. For cash: the item photo is required (as for transfers), plus a **photo of the trader and their stall**, and the amount. Then the queue calls `cash.recordCashSpend`. The same budget-cap check as transfers applies, along with `sum(cash spends on the advance) + amount ≤ advance.amount`.
3. `amountSpent` goes up immediately for cash. The customer's checklist shows "Paid in cash" with the trader photo available to ops only.
4. After the batch: shopper hands back the leftover cash. Ops runs `reconcileAdvance(returnedAmount)` and the system computes `variance = amount − spends − returned`. A non-zero variance is flagged on the shopper's performance page and needs an ops note.
5. Fraud signals on the ops dashboard: cash share of a shopper's spend vs. their peers, and repeated identical cash amounts.

---

## 7. UI and UX system

The bar is a calm, confident app that feels made for Akure, not a generic template. Trust is the product (doc 01 §1), so the UI's job is to make money and produce feel **clear, honest and in control**. This section is binding on every screen, and each milestone demo includes a UI review against it.

### 7.1 Every modal is a bottom sheet

**Rule:** all modal UI on mobile rises from the bottom. That means no centred dialogs, no `Alert.alert`, and no full-screen modal routes. The only exceptions are the **camera** and the **photo lightbox** (pinch-zoom), and both are full-bleed screens, not modals.

**Implementation:** a single `<Sheet>` primitive in `src/components/sheet/`, built on `@gorhom/bottom-sheet` (`BottomSheetModal` + `BottomSheetModalProvider` at the root), `react-native-reanimated` and `react-native-gesture-handler`. Keyboard handling uses `react-native-keyboard-controller`. Screens never import the library directly. They use `<Sheet>` or the `useSheet()` hook, which keeps behaviour identical everywhere.

| Variant | Sizing | Dismiss | Used for |
|---|---|---|---|
| `action` | Fits its content (dynamic sizing) | Swipe down, backdrop tap, Android back | Choices, info, contact support |
| `form` | Fits its content and rises with the keyboard; the footer stays above the keyboard | Swipe or back. If there's unsaved input, the first dismiss attempt nudges the sheet back with a "Discard changes?" row rather than a second modal | Add/edit item, landmark, withdraw amount |
| `list` | Snap points `50%` and `92%`, with a `BottomSheetFlatList` | Swipe, backdrop tap | Market picker, bank picker, recent traders |
| `critical` | Fits its content | **No backdrop dismiss.** Swipe and back still work, but the primary action needs an explicit tap. Anything that moves money uses **hold-to-confirm** (700 ms, with a progress fill and a heavy haptic at the end) | Accept order, cancel order, send transfer, record cash, withdraw |

**Anatomy, the same in every sheet:**
- Top radius 24. Grabber 36×4, centred, 8 px from the top, `ink-muted` at 40%.
- 20 px side padding. The title is left-aligned (Heading, 18/24 SemiBold), with an optional muted subtitle under it. There's no close "×" on swipeable sheets; the grabber and swipe do that job.
- Content area, then a **sticky footer**: one full-width primary button (52 px tall, radius 14), with an optional secondary text button above it. Bottom padding = safe-area inset + 12.
- Backdrop: `rgba(12,26,18,0.40)` in light and `0.60` in dark, fading in over 200 ms.
- Motion: spring (`damping 22, stiffness 220, mass 1`), settling in under 320 ms. With **Reduce Motion** on, it's a 180 ms fade-and-rise instead.

**Behaviour rules:**
- **Flows stay inside one sheet.** Multi-step tasks (pay trader: account → name confirm → amount → hold to send) are steps *inside* one sheet, with an animated height change and a back chevron in the header. Never stack more than **two** sheets.
- Android back closes the top sheet first (a `BackHandler` hook in `<Sheet>`). Edge-to-edge is on, and the nav bar is transparent under the sheet.
- Accessibility: `accessibilityViewIsModal`, focus moves to the sheet title when it opens, and swipe-dismiss has an accessible "Close" action.
- Push notifications can open sheets directly: a price-check push deep-links to the order screen with the price-check sheet already open.
- **Toasts also come from the bottom.** They're snackbars that sit 12 px above the tab bar or footer and auto-dismiss after 4 s. They offer **Undo** for reversible actions, such as rejecting an item.
- **Ops web uses the same rule.** Create, edit and confirm dialogs are bottom drawers built with **Vaul**, using the same anatomy and tokens. Record details (an order, a shopper) open in a right-hand split pane, which isn't a modal.

**Sheet inventory (build them all on the primitive):**

| Customer | Shopper |
|---|---|
| Add / edit item (search → budget with ₦ chips → preference chips → note) | Start shopping confirm ("Customers can no longer cancel") |
| Market details (distance, delivery fee, hours) | Item outcome (bought / adjusted / skipped, quantity note) |
| Buffer explainer + preset picker | Pay trader: transfer (multi-step, hold to send) |
| Fee breakdown | Pay trader: cash (item + trader photo, amount, hold to record) |
| Payment pending / failed / retry | Price-check composer |
| **Price check** (approve extra / buy within budget, with a 5-min countdown ring) | Cash advance receipt confirm |
| Cancel order (shows the exact refund, `critical`) | Customer unavailable |
| Reject item (reason chips + note) | Queue job detail / retry |
| **Accept delivery** (`critical`, "Accepting is final") | En route / arrived confirm |
| Withdraw (amount → bank → name confirm → hold) | Contact ops |
| Contact support (WhatsApp / call) | |
| Theme (System / Light / Dark) | |

### 7.2 Visual language

**Type: Plus Jakarta Sans** via `@expo-google-fonts/plus-jakarta-sans`. Load only the weights used: 400, 500, 600 and 700.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 32/40 | 700 | Wallet balance, order total on the review screen |
| `title` | 22/28 | 600 | Screen titles |
| `heading` | 18/24 | 600 | Sheet titles, section headers |
| `body` | 16/24 | 400 | Default |
| `body-strong` | 16/24 | 600 | Item names, amounts in lists |
| `small` | 14/20 | 400 / 500 | Secondary info, preferences |
| `caption` | 12/16 | 500 | Timestamps, labels. Never the only carrier of key info |

- Every amount uses `fontVariant: ["tabular-nums"]` (check that the loaded font files include the `tnum` feature; if not, use the font's lining figures and align amounts right). Format money with `formatNaira()` from `packages/shared` everywhere: `₦3,000`, never `N3000` or `3000 NGN`. Kobo is shown only where non-zero.
- **Spacing:** a 4-pt grid (4, 8, 12, 16, 20, 24, 32, 40), with 20 px screen gutters.
- **Radius:** 10 for chips, 12 for inputs and photos, 16 for cards, 24 for sheets, full for pills and avatars. No other values.
- **Elevation:** borders, not shadows. In light mode, cards are `surface` with a 1 px `line` border. In dark mode, depth comes from stepped surface tones. Sheets are the only thing that casts a shadow, and only in light mode.
- **Colour discipline** (from doc 03): neutral screens, green for the single primary action, pepper orange only for things that need the customer's attention (price checks, the countdown). Item statuses: bought = green, adjusted = palm, skipped = muted, rejected = error. **One primary button per screen.**
- **Iconography:** one family only, **Phosphor** (`phosphor-react-native`). Regular weight at 24 px, with the Fill weight for active tabs. No emoji anywhere in the UI.
- **Photos are the hero.** 4:3 crops, radius 12, shown with `expo-image`. A tiny placeholder (a thumbhash generated at capture time and stored with the photo) prevents grey boxes on slow networks. Tap to open the lightbox.
- **Illustration:** commission a small, consistent set of 6 spot illustrations (empty basket, market stall, bike en route, wallet, offline, all done). Flat and two-tone, in brand colours. No stock 3D renders and no AI-generated art.

### 7.3 Light and dark themes (both at launch)

- Tokens live in `packages/ui/tokens.ts` as semantic names (`bg`, `surface`, `surfaceRaised`, `ink`, `inkMuted`, `line`, `brand`, `brandPressed`, `accent`, `warning`, `error`, `info`, `onBrand`, …). NativeWind maps them to **CSS variables** (`vars()`), so components use `bg-surface text-ink` and the theme swaps underneath. Don't scatter `dark:` classes through the code.
- Theme follows the system by default. Profile → Theme has a sheet with System / Light / Dark, persisted in MMKV and applied before the first paint, so there's no flash.
- Doc 03 defines only part of the dark palette. Proposed additions, to be **run through a contrast checker before M0 closes**: `surface #13241A`, `surfaceRaised #1A2E22`, `line #24392C`, `error #F97066`, `info #60A5FA`, `brandPressed #22C55E`. Palm yellow keeps dark text in both themes. In dark mode, primary buttons use `green-dark #4ADE80` with dark text `#0C1A12`.
- Photos stay untouched in dark mode. They get a 1 px `line` border so they don't float.
- Ops web uses the same tokens through Tailwind CSS variables and the same theme toggle.

### 7.4 Interaction and feel

- **Press feedback:** every pressable scales to 0.98 with an opacity drop over 100 ms (Reanimated). There are no default ripple-only buttons.
- **Haptics** (`expo-haptics`): a selection tick on chips, steppers and tab changes; a success notification on payment confirmed, item bought and order accepted; a warning when a price check arrives; a heavy impact when a hold-to-confirm completes.
- **Live, not spinning:** checklist items, chat messages and timeline steps animate in with Reanimated layout animations (`FadeInDown.springify()`, `LinearTransition`). Loading states use skeletons shaped like the real layout, shown only after 150 ms, so fast Convex loads never flash. A full-screen spinner is never used.
- **Optimistic UI:** Convex `withOptimisticUpdate` for chat send, item outcomes, reject/unreject and draft edits. On a rollback, an inline error and retry appear where the action happened.
- **Money input:** the `MoneyInput` has a ₦ prefix, live thousands separators and a numeric keyboard, plus quick chips (₦1,000 · ₦2,000 · ₦3,000 · ₦5,000). The value is held as kobo internally.
- **Forms:** validation runs on blur and on submit, never per keystroke. Errors sit under the field in plain words.
- **Status timeline:** a vertical stepper. The current step pulses gently once, then rests; completed steps show their time. "Shopping started" carries a small lock icon and the line "Cancellation closed", which makes the cut-off obvious.
- **Price-check countdown:** a ring in pepper orange shows the time left, on both the chat card and the sheet. At zero it settles to "Bought within budget" without a jarring jump.
- **Every screen has designed empty, loading, error and offline states.** Offline shows a slim bottom banner ("You're offline. We'll send this when you're back"), never a blocking screen.
- **Shopper ergonomics:** the app is used one-handed, in sunlight and in crowds. Primary targets are at least 56 dp and sit in the bottom third. There's a high-contrast mode toggle, typing is kept to a minimum (recent traders, amount chips, preference shortcuts), and nothing important is ever behind a long press.

### 7.5 Voice and copy

- Plain, warm Nigerian English, written the way a trusted market person talks: "We bought ₦3,000 worth of tomatoes, about 1.5 paint rubbers", not "Your order item has been updated".
- Errors say what happened and what to do next: "Payment didn't go through. You haven't been charged. Try again or use another card." Never "Oops!" or "Something went wrong".
- Use local units and times: paint rubber, derica, mudu, heap; "1–3pm today".
- Wherever the customer commits money, show the money rules at that point: refund amounts on cancel, "Accepting is final" on accept, buffer return on the review screen.

### 7.6 Process that keeps the quality bar

1. **Figma first.** Tokens are Figma variables (light and dark modes), and components mirror the code primitives one-to-one. Each milestone's screens are designed with **all their states** before they're built.
2. **Dev-only kitchen sink** route `/(dev)/ui` renders every primitive and sheet variant in both themes, at font scales 1.0 and 1.3. Use it for visual QA, and as a screenshot baseline with Maestro.
3. **UI review gate** in every milestone demo: screenshots of each new screen on the reference phone, in light and dark, compared with Figma, and checked against the rejection list below.
4. **Rejection list (no AI slop).** A PR fails review if it adds any of these:
   - decorative gradients, glassmorphism or blur
   - stacked or soft drop shadows
   - centred modals or alerts
   - toasts at the top
   - more than one primary button on a screen
   - emoji used as icons
   - mixed icon families
   - off-scale radius or spacing values
   - generic hero illustrations or stock 3D art
   - rainbow status colours
   - full-screen spinners
   - placeholder or lorem copy
   - centre-aligned body text
   - colour as the only signal of state

---

## 8. Offline queue (shopper app)

- Store: `useQueueStore` (Zustand + MMKV persist), holding `jobs: {id, type, payload, attempts, nextAttemptAt, status, lastError}[]`. The job types are `uploadPhoto`, `attachPhoto`, `setOutcome`, `requestTransfer`, `statusChange` and `sendMessage`.
- Photos: capture, then resize with `expo-image-manipulator` (long edge 1280 px, JPEG quality 0.6, so about 150–250 KB), then **copy into `FileSystem.documentDirectory`** (the cache directory can be purged) and store the path in the job.
- Runner: one serial worker per order, so jobs run in dependency order (photo before transfer). It's triggered by NetInfo reconnect, app foreground, and a 15 s interval while jobs are pending. Retries back off exponentially (2 s → 5 min cap).
- Idempotency: every job carries the `clientRequestId` it was created with, and the server returns the existing record for a duplicate.
- UI: a badge on the Queue tab. Each job shows its state, and failed jobs offer retry or discard. Discard isn't offered for transfers. The shopper can't tap **En route** while photo or transfer jobs for that order are still pending.
- Customer app: only the draft order is persisted (`useDraftOrderStore`), so a half-built list survives an app kill.

---

## 9. Milestones

Each milestone ends with a **demo script**. The milestone is done when the demo passes on a low-end Android phone against the staging deployment.

### M0 — Foundations (weeks 1–2)
**Tasks**
- Turborepo + pnpm. Scaffold `apps/mobile` (Expo Router template, dev client, New Architecture), `apps/ops` (Next.js App Router), `packages/convex`, `packages/shared`, `packages/ui`, `packages/config`.
- NativeWind wired to **semantic tokens as CSS variables** for light and dark (§7.3), moved into `packages/ui/tokens.ts`. The brand scale is named `brand` so Tailwind's default greens stay available (doc 03 §4 note). Theme preference is persisted in MMKV and applied before first paint. The dark-palette additions are contrast-checked.
- Plus Jakarta Sans (400/500/600/700) loaded behind the splash screen. Type tokens from §7.2; `tnum` verified.
- Figma file: variables (light/dark), core components, and M1–M2 screens with all states.
- Clerk phone OTP (mobile) + Clerk (ops). `ConvexProviderWithClerk` in both apps. `ensureUser`. Role router at `app/index.tsx`.
- Auth wrappers, `stateMachine`, money helpers, shared Zod schemas, `convex-test` harness, CI pipeline.
- Sentry + PostHog initialised. EAS project with `development` and `preview` profiles.
- **`<Sheet>` primitive** with all four variants, step navigation, hold-to-confirm, Android back handling and keyboard handling (§7.1), plus a bottom snackbar `Toast` with Undo.
- Primitives in `src/components`: `Button` (pressed scale + haptic), `Input`, `MoneyInput` (₦, kobo-safe, quick chips), `Chip`, `ListItem`, `StatusPill`, `Skeleton`, `EmptyState`, `OfflineBanner`, `Photo` (expo-image + thumbhash).
- Dev-only `/(dev)/ui` kitchen sink route covering every primitive in both themes.

**Demo:** kitchen sink reviewed in light and dark against Figma; every sheet variant opens, steps, dismisses and responds to the back button on the reference phone. Sign up with a real Nigerian number → lands on the customer home. Ops sets a user to shopper in the Convex dashboard → that user relaunches the app and lands on shopper home. A shopper calling a customer-only mutation is rejected (shown by a test).

### M1 — Reference data and ops settings (weeks 2–3)
**Tasks**
- Ops pages: Markets CRUD (map pin), Slot templates, Settings (typed form over the Zod schema), Geofence editor (draw a polygon on a Google map, or paste GeoJSON), Catalogue import (CSV).
- Seed script (`packages/convex/convex/seed.ts`, internal) for markets, catalogue, templates and settings.
- `slots.generateDaily` + `closeAtCutoff`.
- Addresses: Places Autocomplete (New) through a Convex action with **session tokens**, place details, a draggable pin on `react-native-maps`, a landmark field, a server-side geofence check with a friendly rejection message, and an address book.

**Demo:** ops adds a market and edits a slot. A customer saves an address in Akure (accepted) and one in Ondo town (rejected with a message). Tomorrow's slots appear after the cron runs.

### M2 — Ordering and checkout (weeks 3–5)
**Tasks**
- Market picker with a delivery fee per market (`pricing.quoteMarkets`, Routes API `computeRouteMatrix` for one origin and many markets, cached per (address, market)).
- List builder: catalogue search with aliases, free-text items, a budget per item (`MoneyInput`), preset preference chips plus a note, reorder and delete, and a persisted draft.
- Slot picker (live capacity), review screen with the full fee breakdown, **buffer picker (0 / 10% / 20%, default 10%) with an explainer sheet**, wallet toggle, and the policy copy (cancellation keeps the Paystack charge; no refunds after acceptance).
- `orders.create`, `checkout.initPayment`, the webhook, `verifyAndApply`, `expireStale`.
- Order detail: status timeline (reactive) and a read-only checklist. Order history.

**Demo:** build a 5-item list → pay with a Paystack test card → the order flips to **Paid** within seconds with the app in the background (webhook path). Replaying the same webhook changes nothing. Tampering with the amount in a test webhook is rejected. An abandoned payment expires after 30 min and frees its slot.

### M3 — Dispatch and the shopper core (weeks 5–7)
**Tasks**
- `batching.runForSlot` at cutoff: group `paid` orders by market, split into batches of ≤ `settings.maxOrdersPerBatch` (default 4) by sorting on the compass bearing from market to address (a cheap area cluster), then propose round-robin assignment to on-shift shoppers with the fewest batches.
- Ops dispatch board: slot → market → batches, drag orders between batches, assign or reassign shoppers, then "Confirm" → orders go to `assigned`.
- Shopper app: on-shift toggle, Today's batches, batch detail, **Start shopping** (captures foreground location and locks cancellation), item screen (camera → compress → queue, outcome bought/adjusted/skipped, quantity note, shopper note), queue screen.
- Customer checklist goes live: photos (signed URLs only via a query that checks ownership), statuses, and amounts.

**Demo:** at cutoff, three test orders become one proposed batch. Ops confirms. The shopper starts shopping in **airplane mode**, photographs items, reconnects, and everything syncs. The customer sees photos appear live, and the Cancel button is gone.

### M4 — Trader transfers (weeks 7–8)
**Tasks**
- Bank list (Paystack `/bank?country=nigeria`, cached daily), account resolution, recent traders per market, the multi-step pay sheet with a big confirmation of the resolved name, and hold-to-send.
- **Cash path (§6.5):** ops issues an advance at dispatch; the shopper confirms receipt; a Cash option on the pay sheet (item photo + trader photo + amount, hold to record); end-of-batch reconciliation and variance flags on ops.
- `requestTraderTransfer` with all the safeguards in §6.2, `initiate`, webhook handling, `reconcilePending`.
- Ops: transfer history, flagged new recipients queue (approve into the registry, or mark suspicious), blocked attempts, shopper bank details editor (feeds the fraud match).
- Alert: Paystack balance below a threshold (`/balance` checked every 30 min) → ops email and SMS.

**Demo:** pay a test trader within budget → success, and the item's spent amount updates. Try to exceed the budget → refused. Try to pay a shopper's own account → blocked and flagged on ops. Pay before a photo exists → refused. A transfer created offline sends once on reconnect, never twice. Record a cash spend against a ₦10,000 advance → the item updates; exceeding the advance is refused; reconcile with ₦500 missing → variance flagged on ops.

### M5 — Chat and price checks (weeks 8–9)
**Tasks**
- Order chat (customer ↔ shopper, plus system messages): text, image, and a call button (`tel:`).
- Price-check composer (item, today's price, what the budget gets, extra requested) and the customer action card in pepper orange, with the buffer-then-wallet funding and gating from §6.3, and the countdown ring.
- `priceChecks.timeout` and the system messages.

**Demo:** the shopper sends a price check. The customer approves → the wallet is debited, the transfer cap rises, and the shopper can pay the higher amount. On a second check the customer does nothing → after 5 min it shows "Bought within budget" on both sides.

### M6 — Delivery, inspection, wallet, cancellation, withdrawals (weeks 9–11)
**Tasks**
- Shopper: En route (blocked while queue jobs are pending), Arrived, Handoff screen, Customer unavailable.
- Customer: inspect screen, reject with a reason, accept with a confirmation sheet ("Accepting is final").
- `completeOrder` with credits and price-guide samples. Receipt screen.
- Wallet screen (balance, paginated ledger with human labels), withdrawal flow (minimum, resolve, confirm, request), transfer webhook handling + reversal entries.
- Cancellation flow + refunds (Paystack charge kept for customer cancels, refunded for ops cancels). Ops: cancel with reason, complete on behalf, wallet adjustments (reason required, audited), withdrawal queue and failures, rejected-items outcomes.
- Account deletion (Play requirement).

**Demo:** full happy path from order to accept, with one item rejected and one skipped. The wallet shows the correct leftover and rejection credits, matching a hand calculation in the test fixture. Withdraw ₦1,000 → success. A forced failure in the Paystack test environment → a reversal entry, and the balance is restored.

### M7 — Notifications, receipts, hardening (weeks 11–12)
**Tasks**
- Expo push tokens (`registerPushToken` on login and on token change), `notifications.notify` with the event matrix from doc 02 §13, Termii SMS for the critical events (price check, en route/arrived), Resend receipts (React Email templates). Deep links from a notification to the right screen.
- Rate limits (convex-helpers or a table-based limiter) on OTP-adjacent calls, autocomplete, account resolution and chat.
- Error states everywhere: payment pending/failed, slot full at submit, geofence failure, offline banners.
- Performance pass on the reference phone: cold start < 4 s, item screen to camera < 1 s, list virtualisation, image caching via `expo-image`.
- Accessibility: tap targets ≥ 44 dp, contrast per doc 03, font scaling.
- Analytics events (PostHog): `order_started`, `order_paid`, `price_check_sent/responded`, `item_rejected`, `order_completed`, `withdrawal_requested`. Funnel dashboards for AOV, fee coverage and time-to-deliver.

**Demo:** the end-to-end run triggers each notification on a real device, with the app killed. SMS arrives on MTN and Airtel test SIMs. The Sentry release has source maps.

### M8 — QA, pilot, launch (weeks 12–14+)
- **Internal dogfood (1 week):** staff place real orders at one market, paid with live keys and small amounts.
- **Closed pilot (2 weeks):** about 20–30 invited customers, 2 shoppers, 1–2 markets, one slot per day. Daily ops review of flagged transfers, rejections and timings. Tune the fees and slot capacity.
- Play Store: internal testing → closed testing (Google requires a testing period with testers before production for new personal accounts; organisation accounts are faster, so confirm the current rule) → production. Prepare the listing, screenshots, privacy policy URL, data-safety form (location: foreground only; photos; phone number; financial info), and the account-deletion URL.
- Runbooks (store them in `docs/runbooks/`): failed webhook, Paystack balance low, shopper phone dies mid-shop, customer not home, wrong item delivered, refund request after acceptance.

---

## 10. Testing strategy

| Layer | Tooling | Must cover |
|---|---|---|
| Pure functions | Vitest | Fee calc boundaries (₦2,500 waiver, ₦2,000 cap), delivery-fee clamps, completion credits (every item-status mix, with and without buffer use), cancellation refund (Paystack charge kept), buffer rounding, geofence points, kobo formatting |
| Backend | `convex-test` + Vitest | Every role wrapper denial; illegal state transitions; idempotency (duplicate `clientRequestId`, replayed webhook); transfer + cash cap with concurrent requests; cash advance overspend; reconciliation variance; slot over-reservation; ledger sum equals the cached balance after every scenario |
| Webhooks | Fixture payloads signed with the test secret | Bad signature → 401; amount mismatch; late payment after expiry; `transfer.reversed` after success |
| Mobile components | React Native Testing Library | `MoneyInput`, checklist item, price-check card states |
| Mobile E2E | Maestro flows on an emulator + the reference phone | Sign up → order → pay (test card) → shopper flow → accept; offline photo + transfer sync |
| Ops E2E | Playwright | Dispatch confirm, wallet adjustment requires a reason, settings change audited |
| Manual / field | Checklist at a real market | Network dead zones, sunlight readability, one-handed use, real trader account resolution |

**Ledger invariant job:** a nightly internal function asserts `users.walletBalance === sum(walletEntries)` for every user and alerts on any drift.

---

## 11. Observability and operations

- **Sentry:** mobile + ops + Convex (wrap actions to report errors). Tag events with `orderId` and `role`.
- **Convex logs:** structured `console.log({evt, orderId, ...})` in webhooks and transfer actions. Stream to a log sink if the Convex plan supports it.
- **Ops alerts** (email + SMS to the on-call ops phone): Paystack balance low, transfer failed, blocked transfer, webhook signature failures over 3 in 10 min, an order stuck in `paid` 30 min before its slot window with no shopper assigned, and a withdrawal failed.
- **Business dashboard (PostHog):** orders per day, AOV, fee revenue vs. shopper cost, % of items over budget, price-check approval rate, rejection rate, on-time delivery %.

---

## 12. Timeline and critical path

```
Week:        1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
M0 Found.   ████████
M1 RefData      ██████
M2 Order/Pay        ██████████
M3 Shopper                  ██████████
M4 Transfers                        ██████
M5 Chat/PC                              ██████
M6 Door/Wallet                              ██████████
M7 Hardening                                        ██████
M8 Pilot                                                ████████████████
Long-lead   L1–L12 ─────────────────────────────────────▶ (Paystack live + Transfers by wk 10)
```

**Critical path:** Paystack live account with Transfers (L1–L3) → M4 tested against live → pilot. If Paystack Transfers aren't approved by week 10, the pilot slips one-for-one, because the cash fallback is out of scope.

**Parallel tracks:** engineer A takes the mobile customer flows (M2, M5 customer side, M6 customer side). Engineer B takes the backend, ops and shopper flows (M1, M3, M4, the money engine). Both swarm M7 and M8.

---

## 13. Build risks (beyond doc 04)

| Risk | Mitigation in this plan |
|---|---|
| Clerk OTP fails on some Nigerian networks | Tested with real SIMs in week 1 (L4). Auth sits behind `ensureUser`, so the provider can change without schema changes |
| Paystack balance can't fund same-day transfers | Daily float + low-balance alert (M4). Confirm the settlement setup in L3 |
| Concurrent transfer requests beat the budget cap | The cap check and the insert happen in one Convex mutation, and Convex's serializable transactions make this safe. A test is in place anyway |
| Expo / NativeWind / MMKV version friction | Pin versions at scaffold time. Upgrade only between milestones, with a dev-client rebuild |
| Low-end phones choke on the camera or maps | No maps in the shopper app at all. Camera screen is minimal. Photos are compressed before they enter the queue |
| Google Maps bill surprises | Session tokens, distance cache, a Routes matrix call per address (not per market), budget alerts at ₦ thresholds |
| Disputes from misreported spending | `amountSpent` is derived from successful transfers only. Photo required before transfer |

---

## 14. Definition of done for launch

- [ ] All M0–M7 demo scripts pass on the reference phone against production config
- [ ] Ledger invariant job is green for 7 consecutive pilot days
- [ ] Zero unresolved Sentry crashes affecting more than 1% of sessions
- [ ] Every ops runbook in `docs/runbooks/` has been rehearsed once
- [ ] UI review gate passed for every screen in light and dark; zero items from the §7.6 rejection list
- [ ] Fees, slots and the geofence are set to business-approved values (not the §2 defaults)
- [ ] Terms, privacy policy and wallet terms are live and linked from checkout and the Play listing
- [ ] Play data-safety form and account-deletion URL submitted, and the production track approved
