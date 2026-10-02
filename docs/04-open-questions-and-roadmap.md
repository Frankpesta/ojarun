# OjaRun — 04 Open Questions, Risks and Roadmap

## 1. Numbers to set

| Item | Notes |
|---|---|
| Flat service fee (₦) | Must cover a shopper's time on the smallest likely order, since there's no minimum order |
| Delivery fee formula | Base + per-km rate, with min/max caps |
| Slot times, cutoffs and capacity | Tied to market opening hours |
| Price-check timeout | ~5 minutes agreed; confirm the exact value |
| Minimum wallet withdrawal (₦) | Offsets Paystack transfer fees |
| Akure geofence boundary | Draw the polygon; decide which outskirts are included |
| List of launch markets | Names, coordinates, hours |

## 2. Decisions still open

- **Paystack charge on cancellation:** refund it in full, or deduct the charge Paystack doesn't return?
- **Approved extra when the wallet is empty:** collect it at the door, through a quick Paystack top-up charge, or not allow approvals above the wallet balance?
- **Cash-only traders:** is there a fallback (a small cash float with receipt photos), or are cash-only traders skipped?
- **Price guide at launch:** show it from day one, or start collecting data silently and show it later?
- **Rejected items:** what happens to them (return to the trader, staff use, discard), and how is the loss tracked?
- **Shopper compensation and transport:** salary structure, motorcycle (provided or allowance), cooler boxes, mobile data allowance.
- **Customer support channel:** in-app only, or a WhatsApp support line as well?
- **Legal and terms:** terms of service covering the no-refund-after-acceptance and cancellation policies; wallet terms (credits only).
- **iOS timeline.**

## 3. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Shopper sends order money to a personal account | Account-name resolution, block matches against shopper accounts, photo-before-transfer, trader registry, flags on new recipients |
| Customer disputes after acceptance / chargebacks | Photo of every item, door inspection, clear policy at checkout, free cancellation before shopping |
| Small orders lose money | Flat fee priced for the smallest order; watch average order value in PostHog |
| Shopper phone number exposure / customers taken off-platform | Accepted at launch; in-app voice calls in phase 2 |
| Weak network in markets | Offline upload queue, idempotent mutations, retrying transfers |
| Low-end Android devices | Light shopper flow, aggressive photo compression, test on cheap devices |
| Google Maps costs | Session tokens, distance cache per (address, market) |
| SMS costs (Clerk OTP) | Confirm Nigerian SMS pricing early; Termii as a fallback |
| Slot overbooking | Capacity caps per slot, matched to shopper availability |
| Long trips to distant markets | Distance-based fee; batching; slot cutoffs that leave travel time |

## 4. Roadmap (proposed)

### Phase 0 — Foundations
- Turborepo set up with Expo, Next.js, Convex and shared packages
- Clerk phone OTP; roles on the server
- Design tokens and NativeWind config from the brand guidelines
- Markets, slots, settings and geofence in the database and ops dashboard

### Phase 1 — MVP (Android)
- Customer: address (autocomplete, pin, landmark), market picker with delivery fee, list builder, slot picker, checkout with fee breakdown, Paystack payment and webhook
- Shopper: batches, item checklist with photo capture, trader transfers (auto-approve with safeguards), price checks with timeout, status actions
- Order chat; native calls
- Door inspection, item rejection, acceptance; leftover and rejection credits to wallet
- Wallet ledger and withdrawals
- Cancellation before shopping starts
- Ops: order board, batching and dispatch, shopper management, transfer review, wallet and withdrawals, settings
- Push notifications, SMS fallback, email receipts; Sentry and PostHog

### Phase 2 — Trust and efficiency
- In-app voice calls (number privacy)
- Price guide shown to customers
- Reorder from past orders / saved lists
- Smarter batching and routing

### Phase 3 — Growth
- iOS release
- Scheduled / recurring weekly orders
- Referral credits
- Expansion beyond Akure
