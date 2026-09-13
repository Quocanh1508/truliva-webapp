// Cache-busting version - change this value to force iOS PWA to reload all assets
const SW_VERSION = '2026-09-13-v1';

self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating - purging all caches...`);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass-through: No caching to avoid update delays
});

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.notification?.title || 'Thông báo mới';
    const options = {
      body: data.notification?.body || 'Bạn có thông báo mới từ hệ thống.',
      icon: '/logo.png',
      badge: '/favicon.svg',
      data: data.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error in push event: ', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  const searchId = data && (data.pancakeOrderId || data.orderId);
  const targetUrl = searchId 
    ? `/ktv/my-orders?search=${searchId}` 
    : '/ktv/my-orders';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Tìm bất kỳ tab webapp nào đang mở (bất kể đang ở trang nào)
      const existingClient = windowClients.find(c => 'focus' in c);
      if (existingClient) {
        existingClient.postMessage({ type: 'REDIRECT', url: targetUrl });
        return existingClient.focus();
      }
      
      // Nếu không có tab nào mở, mở tab mới
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
