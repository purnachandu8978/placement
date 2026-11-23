/**
 * Firebase Cloud Messaging Client Service (Phase 5)
 * Handles browser push permission flows, service worker registration,
 * FCM device token lifecycle, and foreground message reception.
 */

import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { getFirebaseApp } from './firebase';
import { apiClient } from './apiClient';

let messagingInstance: Messaging | null = null;

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function getMessagingClient(): Messaging | null {
  if (messagingInstance) return messagingInstance;
  const app = getFirebaseApp();
  if (app && isPushNotificationSupported()) {
    try {
      messagingInstance = getMessaging(app);
    } catch (err) {
      console.warn('Firebase Messaging could not be initialized:', err);
    }
  }
  return messagingInstance;
}

/**
 * Contextual permission request: only triggered by explicit user action
 * (e.g. clicking "Enable Alerts" banner or preferences toggle), NEVER auto-requested on load.
 */
export async function requestPushNotificationPermission(): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
  token?: string | null;
}> {
  if (!isPushNotificationSupported()) {
    return { granted: false, permission: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getAndRegisterFCMToken();
      return { granted: true, permission, token };
    }
    return { granted: false, permission };
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return { granted: false, permission: Notification.permission };
  }
}

/**
 * Registers service worker and obtains an FCM device token,
 * then securely registers it with the FastAPI backend.
 */
export async function getAndRegisterFCMToken(): Promise<string | null> {
  if (!isPushNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`;
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: import.meta.env.BASE_URL,
    });
    await navigator.serviceWorker.ready;

    const messaging = getMessagingClient();
    if (!messaging) return null;

    // Optional VAPID key from environment, or use project default
    const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;

    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: vapidKey || undefined,
    });

    if (token) {
      localStorage.setItem('fcm_device_token', token);

      // Register securely in backend MongoDB
      await apiClient.post('/notifications/device-token', {
        token,
        device_type: 'browser',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
      });

      console.info('FCM device token registered successfully with backend.');
      return token;
    }
    return null;
  } catch (err) {
    console.warn('Could not register FCM device token:', err);
    return null;
  }
}

/**
 * Removes device token from backend and local storage upon logout.
 */
export async function unregisterFCMToken(): Promise<void> {
  const token = localStorage.getItem('fcm_device_token');
  if (!token) return;

  try {
    await apiClient.delete(`/notifications/device-token?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.warn('Backend token unregistration note:', err);
  } finally {
    localStorage.removeItem('fcm_device_token');
  }
}

/**
 * Sets up foreground FCM push listener to display in-app notifications/toasts
 * while the tab is active.
 */
export function setupForegroundMessageHandler(callback: (payload: any) => void): () => void {
  const messaging = getMessagingClient();
  if (!messaging) return () => {};

  try {
    return onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground notification received:', payload);
      callback(payload);
    });
  } catch (err) {
    console.warn('Failed to attach foreground message listener:', err);
    return () => {};
  }
}
