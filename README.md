# OjaRun

Fresh market produce in Akure, bought and delivered the same day. Planning docs live in [`docs/`](./docs/README.md); the build plan is [`docs/05-build-plan.md`](./docs/05-build-plan.md).

## Repo

```
apps/mobile        Expo app (customer + shopper), Expo Router, NativeWind
apps/ops           Next.js ops dashboard (M0: scaffold)
packages/convex    Convex backend: schema, functions, tests
packages/shared    Pure TS shared by everything: money, fees, statuses, geofence, settings schema
packages/ui        Design tokens (light/dark), Tailwind preset, contrast tests
packages/config    Shared tsconfig
```

## Prerequisites

- Node 22+ and pnpm 11 (`corepack enable`)
- For phone testing: a free [Expo](https://expo.dev) account. Builds run on EAS, so no Android Studio is needed.

```sh
pnpm install
pnpm test        # shared, ui and convex test suites
```

## Backend (Convex)

Without an account, run a local anonymous deployment:

```sh
cd packages/convex
CONVEX_AGENT_MODE=anonymous npx convex dev
```

With an account: `npx convex dev` and follow the prompts. Then set the deployment's environment variables (see `packages/convex/.env.example`):

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
npx convex run admin:seedSettings
```

After the first ops person has signed in on the app once, make them an admin:

```sh
npx convex run admin:bootstrapOps '{"phone":"0803 123 4567"}'
```

## Auth (Clerk)

1. Create a Clerk application. Under **User & authentication**, enable **Phone number** with **SMS verification code** and make phone the only required sign-up field (we collect the name in-app).
2. Under **JWT templates**, create one named `convex`, and add the claim `"phone_number": "{{user.primary_phone_number}}"`.
3. Copy the template's issuer URL into `CLERK_JWT_ISSUER_DOMAIN` on Convex, and the publishable key into the mobile app's env.
4. Before launch, test SMS delivery on MTN, Airtel, Glo and 9mobile SIMs (build plan L4).

## Mobile app

```sh
cp apps/mobile/.env.example apps/mobile/.env.local   # fill in Convex URL + Clerk key
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # install the APK it produces
npx expo start --dev-client
```

Without env values the app opens a setup screen with a link to the **UI kit** (`/ui-kit`), which renders every component and sheet in both themes.

The app needs a development build, not Expo Go, because it uses native modules (MMKV, Reanimated, keyboard controller).

## Conventions

- Money is always integer kobo. Format with `formatNaira()` from `@ojarun/shared`.
- Every Convex function uses a role wrapper from `convex/lib/auth.ts`.
- Every modal is a bottom sheet built on `<Sheet>` (build plan §7.1). No `Alert.alert`.
- Colours come from semantic tokens (`bg-surface`, `text-ink-muted`, …). Don't use `dark:` classes.
