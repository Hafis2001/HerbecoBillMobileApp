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

## Bills tab — saved sales, status, date filter and Excel export

Every generated bill is automatically saved to a local SQLite database
(`expo-sqlite`, file `herbeco.db`) and appears in the **Bills** tab:

- **Pending** until you tap **Uploaded** — use this after you have uploaded
  the bill manually (e.g. to the GST portal). You can tap **Undo** any time.
- **Compact rows.** Each bill is a short card (bill number, pending/uploaded
  chip, grand total; then customer, item count, time and any discount) with
  all five actions on one row of small buttons. Bills are grouped under the
  day they were billed — **Today**, **Yesterday**, then the date — and each
  day heading carries its bill count and total.
- Actions per bill: **WhatsApp** (opens that customer's chat with the
  greeting typed in), **PDF** (document only), **Edit**, **Upload**/**Undo**
  and **Delete**.
- **Nothing is auto-deleted.** Bills stay until you delete them by hand, so
  yearly reports and exports keep their full history.
- **Date filter:** quick chips (All / Today / 7 days / 30 days / This month /
  This year) plus a **Date** chip that opens a calendar for either **one
  specific date** or a **From – To** range (both ends included, no future
  days). The active date shows on the chip and can be cleared with its ×, and
  tapping a quick chip drops the custom date again. Every total on screen
  uses the filtered set.
- **Edit any bill:** the Edit button opens the bill where the customer, the
  items, any quantity, any rate and the discount can be changed — or another
  product added from the catalogue. Saving recomputes the discount and GST,
  updates the saved row in place (number, date and upload status stay) and
  clears the cached PDF so the next share shows the edited bill.
- **Download Excel:** writes a `.csv` (UTF-8 with BOM, opens natively in
  Excel / Google Sheets / WPS) and opens the share sheet. Columns are exactly
  **Customer Name, Phone Number, Total Amount** — and only the bills matching
  the active date filter are included.

## Sharing bills on WhatsApp

**Send on WhatsApp** opens the customer's own chat directly — `whatsapp://send`
with the bill's number, falling back to `wa.me`. There is no contact list to
search and the greeting is typed into the message box, ready to press send.

WhatsApp links cannot attach a file, so **Share PDF** stays separate: it hands
just the document to the OS share sheet, with no message, no greeting and
nothing copied to the clipboard. The greeting never appears inside the PDF
either — it exists only in the WhatsApp message.

The generated PDF is cached on disk per bill number (template version `v4`),
so re-sharing an old bill from the Bills tab is instant.

## PDF generation speed

Two caches remove the old wait:

- The logo data URI is read from disk **once per app session** (previously it
  was re-read for every PDF).
- The PDF itself is written to `documentDirectory/bills/<bill number>.pdf` and
  reused while it exists, so tapping Share on an already-generated bill skips
  generation entirely.

## Settings, referral partners and the 10% commission

The tab bar reads **Dashboard, Home, Referral, Bills, Settings**.

The Settings tab is a short menu of two separate cards — **Products** and
**Referral partners** — each opening its own page:

- **Settings → Products** (`app/settings/products.tsx`): add a product from the
  **Add** button, search the catalogue, and edit or delete any item.
- **Settings → Referral partners** (`app/settings/referrals.tsx`): one row per
  partner with just the **name, referral ID and commission earned**, a search
  box that matches name or ID, and an **All partners / Top earner** filter.
  Tapping a row opens the partner's ledger
  (`app/settings/referral-detail.tsx`): bills, sales, earned/paid/pending, and
  one card per referral bill with its **purchase date**, bill amount, the 10%
  commission on it and a **Paid / Not paid** toggle. Edit and delete live on
  that page. IDs are case-insensitive and unique — adding an existing ID is
  refused instead of silently overwriting that partner.

Each bill's commission is tracked separately in the `invoices` table
(`commission_paid`, `commission_paid_ms`), so marking one bill paid never
changes the others and the paid + pending totals always add up to the earned
total.

Billing with a partner works like this:

1. Open the **Referral** tab. Until a partner is chosen it shows the referral
   ID screen, with an X (and "Cancel and go back") to leave it.
2. Type the ID — it is checked against the saved partners. A match shows the
   partner's name and unlocks the products at the usual +10% referral prices;
   an unknown ID explains that it must be added in Settings first. "Change"
   (on the products banner or in the cart) locks the flow so another ID can be
   typed.
3. The cart behaves exactly like a home cart: the **customer's own name and
   phone are still entered there**. The partner is attached to the bill as a
   referral tag (shown as "Referral: name (ID)" on screen and in the PDF) —
   the customer on the invoice is the person buying, not the partner.
4. **10% of each bill** is credited to that partner. Settings shows each
   partner's bills, sales and "Earned 10%", and the dashboard shows the
   commission for the selected period.

Every other part of the flow (items, grams/₹ entry, discount, GST, PDF,
WhatsApp) is identical to a home sale. The bill itself is the customer's copy,
so it never prints the referral badge, the "Referred by" line or the +10%
markup — the partner and their commission only appear in Settings.

Once a bill is saved the cart is emptied straight away, and a referral sale
also clears the active partner — opening the Referral tab again asks for a
referral ID instead of reopening the previous partner's cart.

## Cart discount

The cart has a **Discount (₹)** box. The amount is taken off the subtotal
*before* GST, so `total = (subtotal − discount) + 5% of (subtotal − discount)`.
It is capped at the subtotal, shows in the bill summary, on the in-app bill,
in the PDF and in the saved bill record. Each cart keeps its own discount and
it resets when the cart is cleared.

## Dashboard tab

Every number comes from the bills saved in SQLite — there is no sample data.
The filter picks the **period being reported**, so the four options never show
the same figures:

- **Daily** — today
- **Weekly** — this week (Monday to Sunday)
- **Monthly** — this calendar month
- **Yearly** — this calendar year

The KPI cards (sales, bills, average bill, discounts), the home-vs-referral
split with the partner commission and **Top moving items** (top 5 by revenue,
with quantity sold) all use that period. The bar chart below them shows the
recent **trend** — last 14 days, 8 weeks, 12 months or 5 years — and is drawn
with plain Views (no chart library), so it works inside Expo Go at any screen
width. The date maths lives in `utils/analytics.ts`.

## Keyboard handling

The product grid (Home/Referral) and the Settings → Products list add the live keyboard
height to their scroll padding, hide the floating cart bar while typing, close
on drag, and offer a clear (×) button in the search box — so the last rows are
never trapped behind the keyboard. The referral ID screen and the partner
sheet offset themselves by the keyboard height too.

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
#   H e r b e c o B i l l M o b i l e A p p  
 