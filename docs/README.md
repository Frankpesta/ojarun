# OjaRun — Planning Docs

**OjaRun** is a mobile app for people in **Akure, Ondo State** who want fresh, perishable foodstuff (vegetables, meat, fish, pepper, etc.) from the market without going to the market themselves. Customers choose a market, list items with a budget for each, and pay upfront via Paystack. An employed shopper is dispatched to buy the items, photograph each one, and deliver the same day.

> **OjaRun** — *oja* is Yoruba for "market". "Do my market run for me."

## Documents

| File | What it covers |
|---|---|
| [01-product-spec.md](./01-product-spec.md) | The product: how ordering, payment, shopping, delivery, wallet, cancellation and acceptance work, plus roles and screens |
| [02-technical-architecture.md](./02-technical-architecture.md) | The stack, system structure, integrations, draft Convex data model, order lifecycle, scheduled jobs and security |
| [03-brand-guidelines.md](./03-brand-guidelines.md) | Brand name, colours, typography direction and NativeWind config |
| [04-open-questions-and-roadmap.md](./04-open-questions-and-roadmap.md) | Numbers and decisions still to settle, risks, and a phased roadmap |
| [05-build-plan.md](./05-build-plan.md) | End-to-end execution plan: working defaults, long-lead tasks, repo layout, Convex schema, critical flows, milestones with demo scripts, testing, timeline |

## Decisions at a glance

**Product**
- Akure only, enforced server-side with a geofence
- All major markets listed; shoppers dispatched per order, batched by market and slot
- Customers set a **budget plus preferences per item**
- Upfront Paystack payment: item budgets + flat service fee + distance-based delivery fee + Paystack charge (shown separately)
- No minimum order; flat fee priced to cover small orders
- Employed shoppers using their own phones
- Over budget → shopper sends a price check; no reply in ~5 min → buy within budget
- Photo of every item before leaving the market, shown in a live item checklist
- Same-day delivery slots; the shopper delivers
- Door inspection; rejected items credited to wallet; acceptance is final
- Free cancellation until shopping starts (refund to wallet, minus the Paystack charge); none after
- Optional buffer at checkout (0/10/20%) funds approved price-check extras; unused buffer returns to the wallet
- Shoppers get a cash advance for cash-only traders, reconciled per batch
- Customer not home → ops resolves manually; no auto-accept
- Support via WhatsApp + phone; price guide collected silently, shown later
- In-app wallet for leftovers and credits, with withdrawal to bank

**Tech**
- Turborepo monorepo: Expo (React Native) app + Next.js ops dashboard + shared Convex backend
- Expo dev builds, Expo Router, NativeWind, Zustand (+ MMKV persistence)
- One app with role-based screens (customer / shopper); roles assigned server-side only
- Clerk email-code sign-in (phone collected in profile setup)
- Paystack: checkout, webhooks, Transfers (traders + withdrawals), account resolution
- Google Maps Platform: Places autocomplete, Routes API (cached), react-native-maps
- Status-only tracking (no live map); no background location
- In-app chat + native phone calls at launch; in-app voice calls later
- Trader transfers auto-approved within budget, with fraud safeguards
- Expo push, Termii SMS fallback, Resend email receipts, Sentry, PostHog
- Android first, iOS later

**Design**
- Every modal is a bottom sheet (`@gorhom/bottom-sheet` mobile, Vaul on ops web)
- Plus Jakarta Sans; light and dark themes at launch
- Figma-first, with a UI review gate and a "no AI slop" rejection list (05 §7)
