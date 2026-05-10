# My Dashboard

A personal tracking dashboard built with **React 18 + Vite 5 + Capacitor 5**.

- **Android app** → data stored in **SQLite** via `@capacitor-community/sqlite`
- **Browser / Desktop** → data stored in **IndexedDB** via `idb`
- No backend server required — all data is local, APSPDCL API is called directly

---

## Features

- ⚡ **Electricity tracker** — APSPDCL bill monitoring with live refresh
- 💡 Correct bill calculation including advance payment (arrears) deduction
- 📱 Capacitor-ready for Android deployment
- 🌐 Works in browser via IndexedDB (no install needed)
- 🔌 Extensible — add more dashboards (water, broadband, etc.)

---

## Tech Stack

| Concern | Tech |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 5 |
| Android bridge | Capacitor 5 |
| Android storage | SQLite (`@capacitor-community/sqlite`) |
| Browser storage | IndexedDB (`idb`) |
| Fonts | Syne (headings) + DM Sans (body) |

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | LTS recommended |
| npm | ≥ 9 | comes with Node |
| Java | 17 | for Android builds only |
| Android Studio | latest | for Android builds only |

---

## Running on Localhost (Browser)

### 1. Install dependencies

```bash
npm install
```

### 2. Start dev server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

> The Vite dev server proxies APSPDCL API calls through `/api/apspdcl/*` to avoid
> CORS issues. This proxy is only active in dev mode — the production Android build
> calls APSPDCL directly via Capacitor's native HTTP.

### 3. Add a service

1. Click **Add service**
2. Enter a label (e.g. "Home") and your 13-digit APSPDCL service number
3. The app will fetch the current bill automatically

---

## Building for Android

### 1. Install Capacitor CLI (once)

```bash
npm install -g @capacitor/cli
```

### 2. Build the web assets

```bash
npm run build
```

### 3. Add Android platform (first time only)

```bash
npx cap add android
```

### 4. Sync web assets to Android

```bash
npx cap sync android
```

### 5. Open in Android Studio

```bash
npx cap open android
```

In Android Studio: **Run → Run 'app'** (connected device or emulator).

### All-in-one shortcut

```bash
npm run android
```

This runs `build → cap sync android → cap open android`.

---

## Project Structure

```
my-dashboard/
├── src/
│   ├── app/
│   │   └── App.jsx                  # Shell with sidebar navigation
│   ├── features/
│   │   └── electricity/
│   │       ├── api/
│   │       │   └── apspdclClient.js # APSPDCL API + billing logic
│   │       ├── components/
│   │       │   ├── ServiceCard.jsx
│   │       │   ├── ServiceDialog.jsx
│   │       │   ├── SummaryBar.jsx
│   │       │   ├── Toolbar.jsx
│   │       │   └── TrashView.jsx
│   │       ├── hooks/
│   │       │   └── useElectricityServices.js  # State + DB operations
│   │       ├── utils/
│   │       │   └── filters.js
│   │       └── ElectricityDashboard.jsx
│   ├── shared/
│   │   ├── db/
│   │   │   └── storage.js           # SQLite / IndexedDB abstraction
│   │   └── utils/
│   │       └── index.js             # formatInr, dates, validation
│   ├── styles/
│   │   └── global.css
│   └── main.jsx
├── capacitor.config.ts
├── vite.config.js
├── index.html
└── package.json
```

---

## Billing Calculation Logic

The APSPDCL bill total is computed as:

```
Gross Total = EC + Fixed Charges + Customer Charges + ED + FSA
            (APSPDCL provides this pre-rounded in billAmount field)
```

Advance payments ("arrears") are detected from the payment history API:
- Any payment whose date falls **between the bill's closing date and today**
- AND whose amount is **less than the full bill amount** (not a full payment)

```
Net Due = Gross Total − Sum of arrears
```

**Example (your bill):**
- Gross Total: ₹2,258 (EC 2040.75 + Fixed 30 + CC 55 + ED 20.52 + FSA 111.45)
- Advance payment on 23-Apr-26: ₹30
- Net Due shown: ₹2,228

The official site shows ₹2,193. The remaining ₹35 difference is likely an
additional adjustment/credit not yet identified. Once found, it can be added
to the arrears list.

---

## Adding More Dashboards

1. Create `src/features/<name>/` following the electricity pattern
2. Add a nav entry in `src/app/App.jsx`
3. Add the corresponding DB table in `src/shared/db/storage.js`

---

## Environment

No `.env` file needed. The APSPDCL API endpoints are public and require no API keys.

For Capacitor HTTP on Android to work (calling external URLs from native), ensure
your `AndroidManifest.xml` has internet permission (added automatically by Capacitor):

```xml
<uses-permission android:name="android.permission.INTERNET" />
```
