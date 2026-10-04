import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Integer kobo. Asserted in mutations with assertKobo. */
const kobo = v.number();

export const role = v.union(v.literal("customer"), v.literal("shopper"), v.literal("ops"));
export const userStatus = v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted"));

export const orderStatus = v.union(
  v.literal("pending_payment"),
  v.literal("paid"),
  v.literal("assigned"),
  v.literal("shopping"),
  v.literal("en_route"),
  v.literal("arrived"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const itemStatus = v.union(
  v.literal("pending"),
  v.literal("bought"),
  v.literal("adjusted"),
  v.literal("skipped"),
  v.literal("rejected"),
);

export const walletEntryType = v.union(
  v.literal("leftover_credit"),
  v.literal("rejection_credit"),
  v.literal("cancellation_refund"),
  v.literal("checkout_debit"),
  v.literal("price_check_debit"),
  v.literal("withdrawal_debit"),
  v.literal("withdrawal_reversal"),
  v.literal("adjustment"),
);

export const transferStatus = v.union(
  v.literal("queued"),
  v.literal("pending"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("reversed"),
  v.literal("blocked"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    /** E.164 Nigerian mobile. Collected in profile setup (sign-in is by email), so absent until then. */
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role,
    status: userStatus,
    /** Cache of sum(walletEntries.amount); only lib/wallet.ts writes it. */
    walletBalance: kobo,
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_phone", ["phone"]),

  shopperProfiles: defineTable({
    userId: v.id("users"),
    active: v.boolean(),
    onShift: v.boolean(),
    legalName: v.string(),
    /** Normalised name tokens for fraud matching against transfer recipients. */
    nameTokens: v.array(v.string()),
    bankAccounts: v.array(
      v.object({ accountNumber: v.string(), bankCode: v.string(), resolvedName: v.string() }),
    ),
    lastLocation: v.optional(v.object({ lat: v.number(), lng: v.number(), at: v.number() })),
  })
    .index("by_user", ["userId"])
    .index("by_onShift", ["onShift"]),

  addresses: defineTable({
    userId: v.id("users"),
    label: v.string(),
    lat: v.number(),
    lng: v.number(),
    formatted: v.string(),
    placeId: v.optional(v.string()),
    landmark: v.string(),
    insideGeofence: v.boolean(),
    archived: v.boolean(),
  }).index("by_user", ["userId"]),

  markets: defineTable({
    name: v.string(),
    slug: v.string(),
    lat: v.number(),
    lng: v.number(),
    opensAtMin: v.number(),
    closesAtMin: v.number(),
    active: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_slug", ["slug"]),

  catalogItems: defineTable({
    name: v.string(),
    aliases: v.array(v.string()),
    category: v.string(),
    presetPreferences: v.array(v.object({ group: v.string(), options: v.array(v.string()) })),
    unitHint: v.optional(v.string()),
    active: v.boolean(),
    /** name + aliases, lower-cased, for the search index. */
    searchText: v.string(),
  }).searchIndex("search_text", { searchField: "searchText", filterFields: ["active"] }),

  slotTemplates: defineTable({
    label: v.string(),
    cutoffMin: v.number(),
    windowStartMin: v.number(),
    windowEndMin: v.number(),
    capacityPerShopper: v.number(),
    daysOfWeek: v.array(v.number()),
    active: v.boolean(),
  }),

  slots: defineTable({
    templateId: v.id("slotTemplates"),
    /** Africa/Lagos calendar date, "2026-10-02". */
    date: v.string(),
    cutoffAt: v.number(),
    windowStart: v.number(),
    windowEnd: v.number(),
    capacity: v.number(),
    reserved: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
  })
    .index("by_date", ["date"])
    .index("by_template_date", ["templateId", "date"])
    .index("by_status_cutoff", ["status", "cutoffAt"]),

  distanceCache: defineTable({
    addressId: v.id("addresses"),
    marketId: v.id("markets"),
    distanceMeters: v.number(),
    durationSec: v.number(),
    calculatedAt: v.number(),
  }).index("by_address_market", ["addressId", "marketId"]),

  orders: defineTable({
    customerId: v.id("users"),
    marketId: v.id("markets"),
    addressId: v.id("addresses"),
    addressSnapshot: v.object({
      formatted: v.string(),
      landmark: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
    slotId: v.id("slots"),
    status: orderStatus,
    clientRequestId: v.string(),
    totals: v.object({
      budgets: kobo,
      buffer: kobo,
      serviceFee: kobo,
      deliveryFee: kobo,
      paystackCharge: kobo,
      walletApplied: kobo,
      chargeAmount: kobo,
    }),
    bufferPct: v.number(),
    /** Approved price-check extras funded from the buffer. */
    bufferUsed: kobo,
    paystackReference: v.optional(v.string()),
    paymentAttempts: v.number(),
    holdExpiresAt: v.number(),
    batchId: v.optional(v.id("batches")),
    shopperId: v.optional(v.id("users")),
    cancelReason: v.optional(v.string()),
    completedBy: v.optional(v.id("users")),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_slot_market_status", ["slotId", "marketId", "status"])
    .index("by_shopper_status", ["shopperId", "status"])
    .index("by_batch", ["batchId"])
    .index("by_reference", ["paystackReference"])
    .index("by_clientRequestId", ["clientRequestId"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    position: v.number(),
    name: v.string(),
    catalogItemId: v.optional(v.id("catalogItems")),
    budget: kobo,
    preferences: v.array(v.string()),
    note: v.optional(v.string()),
    status: itemStatus,
    approvedExtra: kobo,
    /** Derived: successful transfers + recorded cash spends. Never set from client input. */
    amountSpent: kobo,
    photoStorageId: v.optional(v.id("_storage")),
    photoThumbhash: v.optional(v.string()),
    shopperNote: v.optional(v.string()),
    quantityNote: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    rejectionOutcome: v.optional(
      v.union(v.literal("returned_to_trader"), v.literal("staff"), v.literal("discarded")),
    ),
  }).index("by_order", ["orderId"]),

  batches: defineTable({
    marketId: v.id("markets"),
    slotId: v.id("slots"),
    shopperId: v.optional(v.id("users")),
    status: v.union(
      v.literal("proposed"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
  })
    .index("by_slot", ["slotId"])
    .index("by_shopper_status", ["shopperId", "status"]),

  messages: defineTable({
    orderId: v.id("orders"),
    /** Undefined for system messages. */
    senderId: v.optional(v.id("users")),
    type: v.union(v.literal("text"), v.literal("image"), v.literal("price_check"), v.literal("system")),
    body: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    clientRequestId: v.string(),
    priceCheck: v.optional(
      v.object({
        itemId: v.id("orderItems"),
        budget: kobo,
        quoted: kobo,
        budgetGets: v.string(),
        extraRequested: kobo,
        state: v.union(
          v.literal("pending"),
          v.literal("approved"),
          v.literal("buy_within_budget"),
          v.literal("timed_out"),
        ),
        expiresAt: v.number(),
        respondedAt: v.optional(v.number()),
      }),
    ),
  })
    .index("by_order", ["orderId"])
    .index("by_clientRequestId", ["clientRequestId"]),

  payments: defineTable({
    orderId: v.id("orders"),
    reference: v.string(),
    amount: kobo,
    status: v.union(
      v.literal("initialized"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("abandoned"),
    ),
    paidAt: v.optional(v.number()),
    channel: v.optional(v.string()),
    raw: v.optional(v.any()),
  })
    .index("by_reference", ["reference"])
    .index("by_order", ["orderId"]),

  webhookEvents: defineTable({
    key: v.string(),
    event: v.string(),
    receivedAt: v.number(),
  }).index("by_key", ["key"]),

  traders: defineTable({
    accountNumber: v.string(),
    bankCode: v.string(),
    resolvedName: v.string(),
    recipientCode: v.optional(v.string()),
    marketId: v.optional(v.id("markets")),
    firstSeenAt: v.number(),
    transferCount: v.number(),
    flagged: v.boolean(),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_account", ["bankCode", "accountNumber"])
    .index("by_flagged", ["flagged"])
    .index("by_market", ["marketId"]),

  traderTransfers: defineTable({
    orderId: v.id("orders"),
    itemId: v.id("orderItems"),
    shopperId: v.id("users"),
    traderId: v.id("traders"),
    amount: kobo,
    clientRequestId: v.string(),
    reference: v.string(),
    transferCode: v.optional(v.string()),
    status: transferStatus,
    failureReason: v.optional(v.string()),
    newRecipient: v.boolean(),
  })
    .index("by_item", ["itemId"])
    .index("by_status", ["status"])
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_reference", ["reference"]),

  cashAdvances: defineTable({
    batchId: v.id("batches"),
    shopperId: v.id("users"),
    amount: kobo,
    issuedBy: v.id("users"),
    issuedAt: v.number(),
    receivedAt: v.optional(v.number()),
    returnedAmount: v.optional(kobo),
    variance: v.optional(kobo),
    status: v.union(v.literal("issued"), v.literal("reconciled"), v.literal("disputed")),
    reconciledBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
  })
    .index("by_batch", ["batchId"])
    .index("by_shopper_status", ["shopperId", "status"]),

  cashSpends: defineTable({
    advanceId: v.id("cashAdvances"),
    orderId: v.id("orders"),
    itemId: v.id("orderItems"),
    shopperId: v.id("users"),
    amount: kobo,
    traderPhotoId: v.id("_storage"),
    traderLabel: v.optional(v.string()),
    clientRequestId: v.string(),
    at: v.number(),
  })
    .index("by_item", ["itemId"])
    .index("by_advance", ["advanceId"])
    .index("by_clientRequestId", ["clientRequestId"]),

  walletEntries: defineTable({
    userId: v.id("users"),
    type: walletEntryType,
    /** Signed kobo: credits positive, debits negative. */
    amount: kobo,
    orderId: v.optional(v.id("orders")),
    withdrawalId: v.optional(v.id("withdrawals")),
    note: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    dedupeKey: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_dedupeKey", ["dedupeKey"]),

  withdrawals: defineTable({
    userId: v.id("users"),
    amount: kobo,
    accountNumber: v.string(),
    bankCode: v.string(),
    resolvedName: v.string(),
    recipientCode: v.optional(v.string()),
    reference: v.string(),
    transferCode: v.optional(v.string()),
    clientRequestId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("reversed"),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_reference", ["reference"])
    .index("by_clientRequestId", ["clientRequestId"]),

  priceGuide: defineTable({
    itemKey: v.string(),
    marketId: v.id("markets"),
    samples: v.array(
      v.object({ amount: kobo, quantityNote: v.optional(v.string()), at: v.number() }),
    ),
    updatedAt: v.number(),
  }).index("by_item_market", ["itemKey", "marketId"]),

  /** Single row keyed "global"; value validated by settingsSchema from @ojarun/shared. */
  settings: defineTable({
    key: v.literal("global"),
    value: v.any(),
  }).index("by_key", ["key"]),

  statusEvents: defineTable({
    orderId: v.id("orders"),
    status: v.string(),
    actorId: v.optional(v.id("users")),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    at: v.number(),
  }).index("by_order", ["orderId"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetTable: v.string(),
    targetId: v.string(),
    reason: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    at: v.number(),
  }).index("by_target", ["targetTable", "targetId"]),
});
