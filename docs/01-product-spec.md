# OjaRun — 01 Product Specification

## 1. Summary

With **OjaRun**, customers in Akure order fresh market produce from a market of their choice without going there. They describe what they want as **a budget per item plus preferences** ("₦3,000 of tomatoes, firm, for stew"), pay everything upfront with Paystack, and an employed shopper buys, photographs and delivers the items the same day.

Trust is the product. Every rule below exists either to make the customer confident they got fair value, or to protect the business from disputes and fraud.

## 2. Why budget-per-item

Akure markets don't have fixed prices. Prices change daily, depend on bargaining, and are quoted in local units (heaps, paint rubbers, derica, mudu) rather than kilograms. Asking customers for a budget instead of a quantity:

- matches how people already shop in the market
- lets the shopper get the best value for that amount
- avoids maintaining a fixed-price catalogue

A **price guide** (built from what shoppers actually pay) can show customers roughly what a budget buys this week, e.g. "₦3,000 ≈ 2 paint rubbers of tomatoes". *Proposed — see open questions.*

## 3. Scope

- **Location:** Akure, Ondo State only. Every delivery address is checked server-side against an Akure geofence; addresses outside it are rejected.
- **Markets:** all major Akure markets are listed and selectable. Customers choose their preferred market for each order.
- **Platform:** Android first, iOS later.

## 4. Roles

| Role | Who | How they get access |
|---|---|---|
| Customer | Members of the public in Akure | Self sign-up with email code; phone number added in profile setup |
| Shopper | Employed staff, using their own phones | Created or approved by ops in the dashboard — never self-selected |
| Ops / Admin | Internal staff | Web dashboard, role assigned internally |

## 5. Customer journey

1. **Sign up / log in** with email and a one-time code, then add name and phone number.
2. **Set delivery address**: Places autocomplete, a draggable map pin, and a "landmark / directions" notes field (Akure addresses often rely on landmarks).
3. **Choose a market.** The delivery fee depends on the distance from that market to the address, so closer markets are visibly cheaper.
4. **Build the list.** For each item:
   - item name (from a list, or free text)
   - budget in naira
   - preferences — presets where possible, plus a free-text note. Examples: ripe / unripe (plantain), cut and part (beef, shaki, orishirishi, with or without bone), fresh / dried (pepper), cleaned or not (fish).
5. **Choose a same-day delivery slot.** Only slots whose cutoff hasn't passed and that still have capacity are shown.
6. **Review and pay** via Paystack. Checkout shows separate lines:
   - Item budgets total
   - Service fee (flat)
   - Delivery fee (distance-based)
   - Paystack charge
   - Optionally, wallet credit applied
7. **Track the order** through a status timeline (no live map) and a **live item checklist** that fills in as the shopper buys.
8. **Respond to price checks** in chat when an item costs more than its budget.
9. **Inspect at the door**, reject specific items if needed, then **accept** the delivery.
10. **Leftover money and credits** land in the wallet automatically. The customer can spend the balance on future orders or withdraw it to a bank account.

## 6. Shopper journey

1. Log in (email code); the shopper role routes to shopper screens.
2. Receive assigned orders, batched by **market + slot**.
3. Travel to the market and tap **Start shopping** for each order. This locks cancellation for those orders.
4. For each item:
   - Buy within budget, respecting preferences.
   - **Photograph the item** (required).
   - Record the amount actually spent and any note.
   - **Pay the trader by bank transfer** from the app. Enter or select the trader's account, confirm the resolved account name, and send. See section 9.
5. If an item costs more than its budget, send a **price check** in chat (section 8).
6. Mark items as bought, adjusted or skipped.
7. Tap **En route**, deliver, then tap **Arrived**.
8. Wait while the customer inspects at the door and accepts; take back any rejected items.

The shopper's location is captured in the foreground at each status tap so ops know where shoppers are. There's no continuous or background tracking.

## 7. Payment model

All money is collected upfront through Paystack before any shopping happens.

| Component | Rule |
|---|---|
| Item budgets | Sum of the customer's budgets |
| Service fee | Flat per order, priced high enough that small orders still cover shopper time |
| Delivery fee | Based on the distance from the chosen market to the delivery address |
| Paystack charge | Passed to the customer and shown as its own line |
| Minimum order | None |

Only the **Paystack webhook** marks an order as paid. The client app never does.

## 8. Over-budget rule (price check)

When an item costs more than its budget:

1. The shopper sends a structured **price check** message in the order chat: item, budget, today's price, and what the budget gets.
2. The customer taps **Approve extra** or **Buy within budget**. The shopper can also call using the phone's native dialler.
3. **If there's no response within ~5 minutes, the shopper buys within budget only.**
4. The customer is told what happened, e.g. "Tomatoes cost more today, so we bought ₦3,000 worth — about 1.5 paint rubbers instead of 2."

Any extra amount the customer approves is charged from their wallet balance. *How it's charged when the wallet is empty is an open question.*

## 9. Paying market traders

- Shoppers pay traders by **bank transfer from the company account**, using in-app payment requests processed through the Paystack Transfers API. Shoppers never have access to the company bank login.
- Requests within the order's budget are **auto-approved**.
- Fraud safeguards:
  - The account name is resolved (Paystack account resolution) and shown to the shopper before sending.
  - Transfers to accounts matching any shopper's own name or saved bank details are blocked.
  - An item photo is required before the transfer for that item can be sent.
  - A **trader registry** is built up from past transfers. Known traders go through smoothly; first-time accounts are flagged on the ops dashboard for review after the fact, without blocking the payment.
- Bad market network: transfer requests are queued and retried. *A fallback for traders who only take cash is an open question.*

## 10. Photos and the item checklist

- Every item is photographed before the shopper leaves the market.
- The customer sees a live checklist. Each item shows its budget, preferences, status (pending → bought / adjusted / skipped), the amount actually spent, the photo and the shopper's note.
- The same records drive the receipt, wallet credits for leftover money, the price guide, and the door inspection screen.

## 11. Delivery

- **Same-day slots** with cutoffs tied to market hours. Example: order by 10am for a 1–3pm delivery, by 1pm for a 4–6pm delivery. *Exact slots are to be set.*
- Each slot has a **capacity cap** matched to the number of available shoppers.
- **The shopper delivers the order.** Orders for the same market and slot are grouped and delivered in one run by area.
- Meat and fish travel in a cooler box.

## 12. Acceptance and quality

- At the door, the customer inspects the items on the checklist screen and can **reject specific items**.
- Rejected items are **credited to the wallet**, and the shopper takes them back.
- Once the customer taps **Accept**, the order is final. **There are no refunds after acceptance.**
- The policy is stated clearly at checkout and on the inspection screen.

## 13. Cancellation

- **Free cancellation until the shopper taps Start shopping.** The refund goes to the wallet.
- No cancellation after shopping starts.
- The "Shopping started" status is shown to the customer in real time, so the cutoff is never ambiguous.
- *Whether the Paystack charge is deducted from cancellation refunds is an open question.*

## 14. Wallet

- Holds leftover budget money, rejected-item credits, cancellation refunds and other credits.
- Can be applied at checkout or **withdrawn to a bank account** (account name verified, sent via Paystack Transfers).
- It's a **refunds and credits balance only**. Customers can't deposit money into it, which keeps it from looking like a stored-value product under CBN rules.
- A minimum withdrawal amount is recommended to offset transfer fees. *The amount is to be set.*

## 15. Communication

- **In-app order chat** between customer and shopper, including structured price-check messages.
- **Native phone calls** at launch. This exposes both parties' phone numbers, which is accepted for now; **in-app voice calls** are planned to fix it.
- Notifications: push first, SMS fallback for critical events, email receipts.

## 16. Screens by role

**Customer**
- Onboarding, email code sign-in
- Address book with pin and landmark notes
- Market picker, showing a delivery fee estimate for each market
- List builder (items, budgets, preferences), plus a price guide hint
- Slot picker
- Checkout with fee breakdown, then Paystack
- Order tracking: status timeline and live item checklist
- Order chat with price-check actions
- Door inspection and acceptance
- Order history and receipts
- Wallet: balance, ledger history, withdraw to bank
- Profile and support

**Shopper**
- Login
- Today's batches (by market and slot)
- Batch / order detail
- Item checklist: photo capture, amount spent, status, note
- Trader payment: account entry or registry pick, name confirmation, send
- Order chat with price-check composer
- Status actions: start shopping, en route, arrived
- Delivery handoff and inspection view
- Upload queue status, for weak networks

**Ops dashboard (web)** — see 02-technical-architecture.md §8.
