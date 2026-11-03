# HERBECO 🌿

A production-quality offline billing app for a small herbal product business,
built with **Expo (SDK 58) + TypeScript + Expo Router**, Zustand, expo-print,
expo-image-picker and direct WhatsApp sharing.

## Features

- **Products**: add with photo (camera or gallery, persisted to
  `documentDirectory`), name, Kg/Unit selling type and unit price; edit,
  delete (with confirm), search by name.
- **Home tab**: normal price sales flow with search, All/Kg/Unit chips,
  2-column product grid, "Add" → quantity stepper, floating View Cart bar.
- **Referral tab**: identical UX but every price is displayed and charged as
  `getReferralPrice(base) = round2(base × 1.10)`, with a "Referral +10%"
  badge and the original price struck through.
- **Two completely separate carts** with their own Zustand stores and their
  own AsyncStorage keys — items never mix between flows. Both carts persist
  across app restarts.
- **Professional GST bill (PDF)** via expo-print: brand header band (logo
  embedded as base64), TAX INVOICE title (+ referral label when applicable),
  auto-incrementing invoice number (HB-0001…), Billed To, zebra-striped items
  table, Subtotal / GST 5% / Grand Total, amount in words (Indian numbering),
  thank-you footer, signature line, computer-generated note.
- **WhatsApp sharing**: `wa.me/91<phone>?text=…` greeting (fallback
  `whatsapp://send?…`, with a "not installed" alert) + "Share PDF" button via
  expo-sharing, with the two-step hint (send message → attach PDF).
- Polished light UI: Poppins font, herbal green/gold palette, rounded cards,
  soft shadows, toasts, empty states, safe areas, splash screen and app icon.

## Requirements

- **Node.js ≥ 22.13** (Expo SDK 58 requirement — install Node 22/24 LTS from
  nodejs.org if your machine has an older version).
- Android Studio / Xcode with Exponent, or the Expo Go app on a phone.

## Install & run

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or Camera (iOS). For a device/simulator
build: `npm run android` / `npm run ios`.

## Replace the logo (placeholder → real logo)

`assets/logo.png` is a generated placeholder used for the app icon, splash,
header brand block, the Bills tab and the PDF letterhead (embedded as base64
and cached via expo-asset). Every screen reads the same file, so one
replacement updates the whole app.

1. Replace `assets/logo.png` with your real logo (the black HerbECO
   "Farm to Table" artwork).
   Prefer a square **1024×1024 PNG** for the file, because it is also used as
   the app icon. Export it without transparency for the icon (Expo advises
   opaque icons) — the artwork on a white background works well.
2. Restart the dev server (`npx expo start -c`) so Metro rebundles the asset.
3. You can delete `scripts/make-logo.js` after replacing the file — it only
   generated the placeholder.

## Bills tab — saved sales, status and 30-day retention

Every generated bill is automatically saved to a local SQLite database
(`expo-sqlite`, file `herbeco.db`) and appears in the **Bills** tab:

- **Pending** until you tap **Uploaded** — use this after you have uploaded
  the bill manually (e.g. to the GST portal). You can tap **Undo** any time.
- Each entry shows the bill number (HB-0001…), date/time, customer, item
  count, flow (Referral +10%) and grand total, with pending/uploaded chips
  and a header summary.
- Actions per bill: **WhatsApp** (PDF + copied greeting), **Share PDF**, and
  a dustbin to delete a single bill.
- **30-day auto-delete:** bills older than 30 days are deleted automatically
  whenever the Bills tab is opened; a toast tells you how many were cleaned
  up. This is device-local storage only.

## Sharing bills on WhatsApp (PDF + greeting in one tap)

WhatsApp cannot send a text message and a file attachment in a single
share (and wa.me links cannot carry files), so HERBECO's **Share on
WhatsApp** button does the next best thing in one tap:

1. The greeting message is copied to the clipboard automatically.
2. The PDF opens in the OS share sheet — pick the customer's chat.
3. Paste the greeting into the chat (long-press → Paste).

The generated PDF is cached on disk per bill number, so re-sharing an old
bill from the Bills tab is instant.

## PDF generation speed

Two caches remove the old wait:

- The logo data URI is read from disk **once per app session** (previously it
  was re-read for every PDF).
- The PDF itself is written to `documentDirectory/bills/<bill number>.pdf` and
  reused while it exists, so tapping Share on an already-generated bill skips
  generation entirely.

## How the Home and Referral carts stay separate

Both carts are built from one factory (`store/cartStoreFactory.ts`) that
creates an isolated Zustand store instance per call:

- `store/homeCartStore.ts` → `useHomeCart`, persisted as **herbeco-cart-home**
- `store/referralCartStore.ts` → `useReferralCart`, persisted as
  **herbeco-cart-referral**

Each store has its own state, own actions and own AsyncStorage bucket, and
prices are snapshotted at add time via `utils/pricing.getPriceForFlow` (home =
base, referral = +10%). The cart screen reads exactly one store based on its
`type` param; bill items are snapped into the invoice at generation time, so
later price changes never affect an issued bill. `Home` and `Referral` also
never read each other's stores — there is no shared writable state.

## Build an APK / AAB with EAS

```bash
npm i -g eas-cli
eas login
# one-time:creates eas.json and configures the project
eas build:configure

# Android APK (direct install):
eas build -p android --profile preview
# or add a "preview" profile in eas.json:
# "build": { "preview": { "distribution": "internal", "android": { "buildType": "apk" } } }

# Play Store AAB:
eas build -p android --profile production
# iOS (TestFlight):
eas build -p ios --profile production
```

Download the artifact from the printed expo.dev URL, or run
`eas build:status`. For store submission use `eas submit -p android` / `eas submit -p ios`.

## Configuration to personalise

- Business header details on the bill → `utils/billTemplate.ts` (`BUSINESS`).
- Colours / fonts / spacing → `constants/theme.ts` (single source of truth).
- GST rate & referral markup → `utils/pricing.ts`.

## Project structure

```
app/
  (tabs)/ index.tsx  referral.tsx  products.tsx  _layout.tsx
  add-product.tsx  cart.tsx  bill.tsx  _layout.tsx
components/  AppHeader  ProductCard  CartItem  QuantitySelector
             CategoryChip  SummaryCard  EmptyState  PrimaryButton
             Input  Toast  ProductImage  ProductListScreen
store/       productStore  cartStoreFactory  homeCartStore  referralCartStore  invoiceStore
utils/       pricing  format  billTemplate  whatsapp
constants/   theme.ts
types/       index.ts (Product, CartItem, Customer, Invoice …)
assets/      logo.png
```

## Type checking

```bash
npm run typecheck   # strict TypeScript, all-pass
```
