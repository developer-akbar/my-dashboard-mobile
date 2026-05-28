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

  // Request permission to use push notifications
  // iOS will prompt, Android 13+ will prompt
  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    console.warn('Push notification permission denied');
    return;
  }

  // Register with Apple / Google to receive push via APNS/FCM
  await PushNotifications.register();

  // On success, we should be able to receive notifications
  await PushNotifications.addListener('registration', async (token) => {
    console.log('Push registration success, token:', token.value);
    await syncPushTokenWithServer(token.value);
  });

  // Some errors with registration may occur
  await PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
  });

  // Show us the notification payload if the app is open
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push notification received:', notification);
  });

  // Method called when tapping on a notification
  await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('Push notification action performed:', notification);
  });
}

export async function syncPushTokenWithServer(token) {
  try {
    const services = await db.getAll();
    const serviceNumbers = services.map(s => s.serviceNumber);
    
    if (serviceNumbers.length === 0 && !token) return;

    // Store token locally too
    if (token) {
      await db.setSetting('push_token', token);
    }

    const storedToken = token || await db.getSetting('push_token');
    if (!storedToken) return;

    // Check if we already synced this exact state
    const lastSynced = await db.getSetting('last_synced_push_state');
    const currentState = JSON.stringify({ token: storedToken, serviceNumbers });
    if (lastSynced === currentState) return;

    const baseUrl = getApiBase();
    const url = `${baseUrl}/notifications/register`;
    console.log('Syncing push token to:', url);

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
        console.log('Push token synced with server');
      } else {
        console.error('Server error syncing push token:', json.error);
      }
    } else {
      console.error('Failed to sync push token, server returned:', res.status);
    }
  } catch (err) {
    console.error('Failed to sync push token:', err);
  }
}
