# Push notifications: Firebase setup

The app and backend are ready for push. Expo delivers push to Android phones through Firebase Cloud Messaging (FCM), so one Firebase project is needed. This takes about 15 minutes and is done once.

Until it's done, the app builds and runs normally. Push stays off, and everything else works: in-app banners, chat, and SMS and email once their keys are set.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and choose **Add project**. Call it `OjaRun`. Google Analytics isn't needed.
2. In the project, choose **Add app → Android** three times, once per build:

   | Build | Android package name |
   |---|---|
   | Development (the dev client you test with) | `ng.ojarun.app.development` |
   | Preview | `ng.ojarun.app.preview` |
   | Production (Play Store) | `ng.ojarun.app` |

   Skip the SHA-1 and SDK steps; Expo handles them.
3. After the third app, download **google-services.json** from **Project settings → General**. One file covers all three apps.

## 2. Give the build the Firebase file

From `apps/mobile`:

```sh
npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
  --visibility secret --environment development --environment preview --environment production
```

Then delete your local copy of `google-services.json` (don't commit it). `app.config.ts` picks the file up from this variable.

## 3. Let Expo send through Firebase (FCM V1 key)

1. In Firebase: **Project settings → Service accounts → Generate new private key**. A JSON file downloads.
2. From `apps/mobile`, run `npx eas-cli@latest credentials`, choose **Android**, then the **development** profile.
3. Open **Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1) → Upload a new service account key**, and pick that JSON.
4. Repeat for the **preview** and **production** profiles (each has its own package name). The same key works for all three.
5. Delete the downloaded key file afterwards. It's a secret.

## 4. Build and check

1. Start a new dev build:
   `EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest build --platform android --profile development --non-interactive --no-wait`
   It's needed anyway, because `expo-notifications` is a new native module.
2. Install it, sign in and allow notifications.
3. In the Convex dashboard, the `pushTokens` table should now have a row for you.
4. Place a wallet-paid order. "Order confirmed" should arrive within seconds. The `notifications` table shows what was sent on each channel; "sent 1/1" means push worked.

## SMS and email

These need no Firebase. Set the keys in Convex (from `packages/convex`) and they start sending:

```sh
npx convex env set TERMII_API_KEY <key>        # SMS for price checks, en route, arrived, ops alerts
npx convex env set RESEND_API_KEY <key>        # receipts and withdrawal emails
npx convex env set RESEND_FROM "OjaRun <receipts@ojarun.ng>"   # once ojarun.ng is verified in Resend
```

Until `ojarun.ng` is verified, Resend only delivers to your own Resend account email, from `onboarding@resend.dev`. Set the on-call phone and email for ops alerts in the dashboard under **Settings → Ops alerts**.
