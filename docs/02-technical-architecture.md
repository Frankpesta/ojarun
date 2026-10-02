# OjaRun — 02 Technical Architecture

## 1. Stack

| Layer | Choice |
|---|---|
| Mobile app | React Native with **Expo** (dev builds), **Expo Router** |
| Styling | **NativeWind** |
| Client state | **Zustand**, with persist middleware on **MMKV** |
| Backend / DB / realtime | **Convex** (queries, mutations, actions, HTTP actions, scheduled functions, crons, file storage) |
| Ops dashboard | **Next.js** web app on the same Convex backend |
| Monorepo | **Turborepo** |
| Auth | **Clerk**, phone OTP |
| Payments | **Paystack** — checkout, webhooks, Transfers, account resolution |
| Maps | **Google Maps Platform** — Places autocomplete, Routes API, react-native-maps |
| Push | Expo push notifications |
| SMS | Clerk for OTP; **Termii** for transactional SMS fallback |
| Email | **Resend**, for receipts |
| Forms / validation | React Hook Form + **Zod** (schemas shared across apps) |
| Monitoring | **Sentry** (crashes), **PostHog** (analytics) |
| Builds / updates | EAS Build, EAS Update (over-the-air fixes) |
| Platform order | Android first, iOS later (same codebase) |

## 2. Repository structure (proposed)

```
apps/
  mobile/            # Expo app (customer + shopper)
    app/
      (auth)/
      (customer)/
      (shopper)/
  ops/               # Next.js dashboard
packages/
  convex/            # Convex functions + schema (shared backend)
  shared/            # Zod schemas, types, constants (fees, statuses)
  ui/                # optional shared design tokens
```

## 3. One app, role-based screens

- Expo Router route groups `(customer)` and `(shopper)`. After login, the user's role decides which group they see.
- **Roles are set only on the server**, in Convex and/or Clerk metadata. Shoppers are created or approved from the ops dashboard; sign-up always creates a customer.
- Every Convex function checks the caller's role. Hiding screens in the UI is not access control.
- **No background location.** Tracking is status-based. Foreground location is captured only when a shopper taps a status change. This keeps Play Store and App Store review simple.

## 4. Auth

- Clerk with phone OTP, integrated with Convex through Clerk's JWT template.
- **Before committing:** confirm Clerk's SMS deliverability and pricing for Nigerian numbers. Termii stays available for transactional SMS either way.

## 5. Payments (Paystack)

### Checkout
1. The client calls a Convex mutation that creates the order (`pending_payment`) and calculates all amounts **on the server**.
2. A Convex action initialises the Paystack transaction and returns the authorization URL / access code.
3. The app opens Paystack checkout (WebView or browser).
4. Paystack sends `charge.success` to a **Convex HTTP action webhook**. The webhook verifies the signature, re-verifies the transaction, checks the amount, then marks the order `paid` and records the payment.
5. **The client never marks an order as paid.** Webhook handling is idempotent, keyed on the Paystack reference.

### Transfers (trader payments and wallet withdrawals)
- **Account resolution** runs before every transfer, and the resolved name is shown to the user.
- A transfer recipient is created, then the transfer is initiated through a Convex action.
- Results come back as `transfer.success`, `transfer.failed` or `transfer.reversed` webhooks, which update the transfer record and the ledger.
- Trader transfers are auto-approved within the order's budget (product spec §9), with these checks on the server:
  - the cumulative amount for the order and item stays ≤ the item's budget, plus any amount the customer approved
  - an item photo exists before payment
  - the recipient name doesn't match any shopper's own name or saved bank details
  - recipients not yet in the trader registry are flagged for ops review

### Wallet ledger
- **Append-only ledger.** The balance is calculated as the sum of a user's entries and never edited directly. A cached balance is allowed if it's updated in the same mutation.
- Entry types: `leftover_credit`, `rejection_credit`, `cancellation_refund`, `checkout_debit`, `price_check_debit`, `withdrawal_debit`, `withdrawal_reversal`, `adjustment` (ops, with a reason).
- Withdrawals: there's a minimum amount, the account name is verified, the debit is written when the withdrawal is requested, and a reversal entry is added if the transfer fails.
- The wallet is credits only: there is no top-up flow.

## 6. Maps and location

- **Places Autocomplete** with **session tokens**, so a search is billed as one session, not per keystroke.
- A **draggable pin** stores exact coordinates, alongside a **landmark / directions** notes field.
- **Geofence:** an Akure polygon is checked on the server whenever an address is saved or an order is placed.
- **Delivery fee:** the Routes API calculates distance from market to address. Results are **cached per (address, market)** in Convex and reused, so each pair is calculated only once.
- react-native-maps displays the map when picking an address. Orders have no tracking map.

## 7. Realtime, chat and tracking

- Convex reactive queries power the status timeline, the live item checklist and chat.
- Chat message types: `text`, `image`, `price_check`, `system`. A price-check message carries its item, budget, quoted price and state (`pending`, `approved`, `buy_within_budget`, `timed_out`).
- Calls use the native dialler (`tel:`) at launch. In-app voice calls (e.g. Agora, Twilio Voice, LiveKit) come later to stop exposing phone numbers.

## 8. Ops dashboard (Next.js)

- **Orders:** live board by status, market and slot; order detail with checklist, photos, chat and payments.
- **Dispatch:** batch orders by market and slot, assign shoppers, rebalance batches.
- **Shoppers:** create or approve shoppers, check availability, see last known location (from status taps), review performance.
- **Trader transfers:** history, flagged new recipients, trader registry management.
- **Wallet:** customer ledgers, withdrawal queue and failures, manual adjustments with a reason.
- **Settings:** markets (name, location, hours), slots (times, cutoffs, capacity), service fee, delivery fee formula, geofence, minimum withdrawal.
- **Price guide:** view and adjust the prices captured from shoppers' purchases.
- **Support:** rejected items, cancellations, customer lookup.
- Access: Clerk, with internal ops roles.

## 9. Photos and offline resilience

- Photos are compressed on the device with `expo-image-manipulator` (resized, quality reduced), since shoppers use low-end phones and limited data.
- Uploads go through a **persisted queue** (Zustand + MMKV): each upload gets a Convex upload URL, uploads, attaches the photo to the item, and retries on failure. Shoppers can see the queue's status.
- Trader transfer requests and status changes are queued and retried the same way. Server mutations are idempotent, keyed on client-generated IDs.

## 10. Scheduled functions and crons (Convex)

| Job | Trigger | Action |
|---|---|---|
| Price check timeout | Scheduled ~5 min after a price check is sent | If still pending, set to `timed_out` → buy within budget, notify customer |
| Slot cutoff | Cron at each slot cutoff | Close the slot to new orders; trigger batching |
| Batching / dispatch | After cutoff (and on demand from ops) | Group paid orders by market + slot, propose shopper assignment |
| Payment reconciliation | Cron | Re-verify `pending_payment` orders with Paystack; expire stale ones |
| Transfer reconciliation | Cron | Re-check transfers stuck in `pending` |
| Leftover credit | On order completion | Credit (total budgets − total spent − rejected) to wallet |
| Distance cache | On address save | Pre-calculate distances to nearby markets (optional) |

## 11. Order and item lifecycle

### Order status
```
draft → pending_payment → paid → assigned → shopping → en_route → arrived → completed
                            ↘ cancelled (customer, before `shopping`) → refund to wallet
pending_payment → expired (payment never completed)
```
- `shopping` is set when the shopper taps **Start shopping**. Cancellation is blocked from this point on.
- `completed` is set when the customer **accepts** at the door. No refunds after this point.

### Item status
```
pending → bought | adjusted | skipped
bought/adjusted → rejected (at door inspection, before acceptance)
```
- `adjusted` means a different quantity was bought because of price, either within budget or with approved extra.

## 12. Data model (draft Convex schema outline)

| Table | Key fields |
|---|---|
| `users` | clerkId, phone, name, role (`customer` / `shopper` / `ops`), status |
| `shopperProfiles` | userId, active, bank details (for fraud checks), assigned batches |
| `addresses` | userId, label, lat, lng, formatted address, landmark notes, insideGeofence |
| `markets` | name, lat, lng, hours, active |
| `slots` | marketId? / global, date, window start/end, cutoff, capacity, booked |
| `distanceCache` | addressId, marketId, distanceMeters, durationSec, calculatedAt |
| `orders` | customerId, marketId, addressId, slotId, status, totals (budgets, serviceFee, deliveryFee, paystackCharge, walletApplied), batchId, shopperId, timestamps per status |
| `orderItems` | orderId, name, budget, preferences, note, status, amountSpent, photoStorageId, shopperNote, approvedExtra |
| `batches` | marketId, slotId, shopperId, orderIds, status |
| `messages` | orderId, senderId, type, body, imageId, priceCheck {itemId, quoted, state, expiresAt} |
| `payments` | orderId, paystackReference, amount, status, rawEvent |
| `traders` | accountNumber, bankCode, resolvedName, marketId?, firstSeenAt, flagged |
| `traderTransfers` | orderId, itemId, shopperId, traderId, amount, paystackTransferCode, status |
| `walletEntries` | userId, type, amount (+/−), orderId?, withdrawalId?, note, createdBy |
| `withdrawals` | userId, amount, bank details, resolvedName, transferCode, status |
| `priceGuide` | itemName, marketId, unit, recentPrices, updatedAt |
| `settings` | serviceFee, deliveryFeeFormula, minWithdrawal, priceCheckTimeoutSec, geofence polygon |
| `statusEvents` | orderId, status, actorId, lat?, lng?, at |

All money is stored as **integer kobo**.

## 13. Notifications

| Event | Push | SMS fallback | Email |
|---|---|---|---|
| Payment confirmed | ✓ | | ✓ receipt |
| Shopper assigned / shopping started | ✓ | | |
| Price check waiting | ✓ | ✓ | |
| En route / arrived | ✓ | ✓ | |
| Order completed + wallet credit | ✓ | | ✓ final receipt |
| Withdrawal sent / failed | ✓ | | ✓ |

## 14. Security checklist

- All amounts are calculated on the server; client-sent totals are ignored.
- The Paystack webhook signature is verified; payment status is re-verified through the API; webhook handling is idempotent.
- A role check runs in every Convex function; shoppers can only access orders assigned to them.
- Transfers are limited to item budgets plus approved extra; recipients matching shopper accounts are blocked; new recipients are flagged.
- Paystack secret keys live only in Convex environment variables, never in the app.
- Photo storage URLs are served only to the order's customer, its shopper and ops.
- Every ops ledger adjustment requires a reason and records who made it.
