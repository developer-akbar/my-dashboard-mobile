# APSPDCL Bill Dashboard

A modern mobile-first dashboard to track APSPDCL electricity bills and usage trends.

## Setup Instructions

### 1. Environment Variables
Create a `.env` file in the root directory based on `.env.example`:
```env
VITE_API_URL=http://<YOUR_LAN_IP>:4201/api
```
For local development on the same network as your PC, use your LAN IP. For production (Vercel), use your public Vercel URL.

### 2. Backend Deployment (Public Access)
To access the app from anywhere (without needing to be on the same WiFi as your laptop):
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel --prod` in the project root.
3. Once deployed, you will get a production URL (e.g., `https://my-dashboard.vercel.app`).
4. Update your `.env` file:
   ```env
   VITE_API_URL=https://my-dashboard.vercel.app/api
   ```
5. Rebuild and sync your mobile app:
   ```bash
   npm run build
   npx cap sync android
   ```

### 3. Local Development
- **Install Dependencies**: `npm install`
- **Run Dev Server**: `npm run dev` (Starts both UI and local API proxy)

## Key Features
- **Auto-Refresh**: Fetches latest bill and payment status.
- **Bill Insights**: Predicts next bill based on historical trends.
- **Service Migration**: Automatically handles the shift from old service numbers to the new unique numbering system (e.g., `23233` -> `55513`).
- **Offline First**: All data is stored locally on your device for instant access.
- **About Info**: Quick access to service metadata like Circle, Division, and Section.
