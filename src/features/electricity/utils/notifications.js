import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db } from '../../../shared/db/storage';
import { saveNotificationToHistory } from '../components/NotificationInbox.jsx';

const getApiBase = () => {
  const env = import.meta.env?.VITE_API_URL;
  if (env && !env.includes('127.0.0.1:5173') && !env.includes('localhost:5173')) {
    return env.replace(/\/$/, '');
  }
  return '/api';
};

let listenersRegistered = false;

export async function setupPushNotifications() {
  if (Capacitor.getPlatform() === 'web') return;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[notifications] Permission denied');
      return;
    }

    if (listenersRegistered) return;
    listenersRegistered = true;

    await PushNotifications.addListener('registration', async (token) => {
      console.log('[notifications] Token received:', token.value);
      await syncPushTokenWithServer(token.value);
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[notifications] Registration error:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[notifications] Received:', notification);
      await saveNotificationToHistory({
        title: notification.title || 'Notification',
        body: notification.body || '',
        serviceNumber: notification.data?.serviceNumber,
        type: notification.data?.type
      });

      // Refresh the dashboard - pass serviceNumber for targeted refresh
      const refreshEvent = new CustomEvent('notification-received', {
        detail: { serviceNumber: notification.data?.serviceNumber }
      });
      window.dispatchEvent(refreshEvent);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      console.log('[notifications] Action:', action);
      const notification = action.notification;
      
      await saveNotificationToHistory({
        title: notification.title || 'Notification',
        body: notification.body || '',
        serviceNumber: notification.data?.serviceNumber,
        type: notification.data?.type,
        read: false
      });

      // Crucial: Fire the event so the bell icon updates instantly upon app foregrounding
      const refreshEvent = new CustomEvent('notification-received');
      window.dispatchEvent(refreshEvent);

      if (notification.data?.serviceNumber) {
        // Trigger deep link event
        setTimeout(() => {
          const deepLinkEvent = new CustomEvent('notification-deep-link', { 
            detail: { serviceNumber: notification.data.serviceNumber } 
          });
          window.dispatchEvent(deepLinkEvent);
        }, 500); // Small delay to ensure UI is ready after cold start
      }
    });

    // Now register
    await PushNotifications.register();
  } catch (err) {
    console.error('[notifications] Setup failed:', err);
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
    
    if (token) {
      await db.setSetting('push_token', token);
    }
    
    const storedToken = token || await db.getSetting('push_token');
    
    if (!storedToken) {
      throw new Error('Device not yet registered for push notifications. Please wait a moment and try again.');
    }

    const currentState = JSON.stringify({ token: storedToken, serviceNumbers });
    const lastSynced = await db.getSetting('last_synced_push_state');
    
    if (!force && lastSynced === currentState) {
      console.log('[notifications] Already in sync');
      return true;
    }

    const baseUrl = getApiBase();
    // Use URL constructor for safety if it's a full URL, otherwise fallback to string concat
    let url;
    if (baseUrl.startsWith('http')) {
      url = `${baseUrl.replace(/\/api$/, '')}/api/notifications/register`;
    } else {
      url = '/api/notifications/register';
    }
    
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
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errorText || 'Unknown error'}`);
    }

    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error || 'Server rejected registration');
    }

    await db.setSetting('last_synced_push_state', currentState);
    console.log('[notifications] Sync successful');
    return true;
  } catch (err) {
    console.error('[notifications] Sync error:', err.message);
    throw err; // Re-throw so the UI can show the specific error
  }
}
