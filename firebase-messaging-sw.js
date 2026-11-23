// Firebase Cloud Messaging Service Worker (Phase 5)
// Handles background push notifications, badge updates, and deep-link routing.

importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyA1hVX9-E8ENVX9quh5javjKqJuQsAUlgM",
  authDomain: "placement-management-e89c7.firebaseapp.com",
  projectId: "placement-management-e89c7",
  storageBucket: "placement-management-e89c7.firebasestorage.app",
  messagingSenderId: "213298048573",
  appId: "1:213298048573:web:f6b19622de7595c0714454"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || '⚡ Placement Intelligence Alert';
  const body = payload.notification?.body || payload.data?.body || 'New opportunity or learning update available.';
  const linkUrl = payload.fcmOptions?.link || payload.data?.link || payload.data?.action_url || '/student/jobs';

  const notificationOptions = {
    body: body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.data?.notification_id || payload.data?.job_id || 'placement-alert',
    renotify: true,
    data: {
      url: linkUrl,
      job_id: payload.data?.job_id,
      apply_url: payload.data?.apply_url,
    },
    actions: [
      {
        action: 'view',
        title: 'View Details',
      },
    ],
  };

  return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/student/jobs';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
