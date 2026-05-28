import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db } from '../../../shared/db/storage';

const getApiBase = () => {
  const env = import.meta.env?.VITE_API_URL;
  if (env && !env.includes('127.0.0.1:5173') && !env.includes('localhost:5173')) {
    return env.replace(/\/$/, '');
  }
  return '/api';
};

export async function setupPushNotifications() {
  if (Capacitor.getPlatform() === 'web') return;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    await PushNotifications.register();

    await PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token:', token.value);
      await syncPushTokenWithServer(token.value);
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });
  } catch (err) {
    console.error('Push setup failed:', err);
  }
}

/**
 * Syncs the device token and service numbers with the backend.
 * @param {string} [token] - Optional token if just received from registration
 * @param {boolean} [force] - If true, ignores the local cache and forces a sync
 */
export async function syncPushTokenWithServer(token, force = false) {
  try {
    const services = await db.getAll();
    const serviceNumbers = services.map(s => s.serviceNumber);
    
    // Get token from parameter or local storage
    if (token) {
      await db.setSetting('push_token', token);
    }
    const storedToken = token || await db.getSetting('push_token');
    
    if (!storedToken) {
      console.log('[notifications] No token available for sync');
      return;
    }

    // Check if state changed to avoid redundant network calls
    const currentState = JSON.stringify({ token: storedToken, serviceNumbers });
    const lastSynced = await db.getSetting('last_synced_push_state');
    
    if (!force && lastSynced === currentState) {
      console.log('[notifications] Push state already in sync');
      return;
    }

    const baseUrl = getApiBase();
    // Critical: Ensure no double /api/
    const url = `${baseUrl.replace(/\/api$/, '')}/api/notifications/register`;
    
    console.log('[notifications] Syncing to:', url);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: storedToken,
        serviceNumbers,
        platform: Capacitor.getPlatform()
      }),
    });
    
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        await db.setSetting('last_synced_push_state', currentState);
        console.log('[notifications] Sync successful');
        return true;
      }
    }
    
    console.error('[notifications] Sync failed with status:', res.status);
    return false;
  } catch (err) {
    console.error('[notifications] Sync error:', err);
    return false;
  }
}
