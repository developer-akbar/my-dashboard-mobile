# My Dashboard

A modern, privacy-first personal tracking dashboard built with **React 18 + Vite + Capacitor**. Currently focused on comprehensive electricity bill tracking (specifically APSPDCL and BillDesk integrations), it is designed to run seamlessly in modern web browsers and as a native Android app.

---

## ⚡ Key Features

- **Multi-Service Tracking:** Monitor multiple APSPDCL electricity connections from a single, unified view.
- **Multi-Language Support:** Full internationalization (i18n) support with dynamically toggleable English and Telugu options available directly from the Settings menu.
- **Rich Visualizations:**
  - 18-month historical trend charts.
  - Granular bill breakups (Energy Charges, Fixed Charges, Fuel Surcharge, Initial Security Deposits, Arrears).
  - Monthly usage predictions and spike detection.
- **Automated Captcha Solving:** Includes a custom Node.js proxy server utilizing `sharp` and `tesseract.js` (OCR) to automatically read and solve the BillDesk Captcha, fetching the latest live demand without user interaction.
- **Hybrid Fallback:** If the automated OCR fails, the UI gracefully degrades to a secure manual Captcha entry modal so you are never locked out of your data.
- **Light / Dark Mode:** A toggleable, clean SaaS aesthetic designed for high readability across devices.
- **Quick Payments:** "Pay Now" and "Pay More" shortcuts directly open the relevant gateways.
- **Privacy-First Storage:** No cloud database. All historical and service data is stored locally on your device (IndexedDB for Web, SQLite for Android).

---

## 🛠️ Architecture & Tech Stack

| Domain | Technology |
|---|---|
| **Frontend UI** | React 18, Recharts (visuals), Vanilla CSS (variables-driven theming) |
| **Mobile Bridge** | Capacitor 5 |
| **Local Storage** | IndexedDB (`idb`) for Web, SQLite for Android |
| **Backend Proxy** | Node.js + Express (handles scraping, CORS bypass, and OCR) |
| **Image Processing** | `sharp` (noise reduction), `tesseract.js` (OCR) |

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (≥ 18 LTS)
- npm (≥ 9)
- Android Studio & Java 17 (Required *only* if building the Android App)

### 1. Web / Local Development

Since the architecture uses a backend proxy to safely scrape BillDesk and bypass browser CORS limitations, you must run both the backend server and the frontend dev server.

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the Proxy Server:**
   This runs the Node server (default `http://localhost:4100`) which handles the heavy lifting (APSPDCL APIs, BillDesk Captcha OCR).
   ```bash
   node server/index.js
   ```

3. **Start the Frontend Dev Server:**
   In a new terminal tab, start Vite:
   ```bash
   npm run dev
   ```
   *Open **http://localhost:5173** in your browser. Vite automatically proxies `/api/*` requests to the local Node server.*

### 2. Building for Android (Capacitor)

The Capacitor app requires your backend proxy server to be hosted and accessible from the mobile device. During local testing on a physical device, ensure your phone and computer are on the same Wi-Fi network.

1. **Configure API URL (if needed):**
   Update your API base path in the frontend source code (`src/features/electricity/api/servicesApi.js`) to point to your computer's local IP address (e.g., `http://192.168.x.x:4100`) instead of localhost.

2. **Build the Web Assets:**
   ```bash
   npm run build
   ```

3. **Sync to Android:**
   ```bash
   npx cap sync android
   ```

4. **Run via Android Studio:**
   ```bash
   npx cap open android
   ```
   *In Android Studio: Run → Run 'app' on your connected device or emulator.*

---

## 🔧 Extensibility

The codebase is structured modularly. While it currently tracks Electricity, the `src/features` folder is designed so you can easily plug in new tracking domains (Water, Broadband, Subscriptions) and link them to the shared local storage wrapper in `src/shared/db`.