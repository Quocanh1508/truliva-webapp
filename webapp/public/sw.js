// Cache-busting version - change this value to force iOS PWA to reload all assets
const SW_VERSION = '2026-10-21-v1';

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
  const data = event.notification.data || {};
  const orderId = data.orderId;
  const pancakeOrderId = data.pancakeOrderId;

  let targetPath = '/ktv/my-orders';
  if (orderId && pancakeOrderId) {
    targetPath = `/ktv/my-orders?orderId=${encodeURIComponent(orderId)}&search=${encodeURIComponent(pancakeOrderId)}`;
  } else if (orderId) {
    targetPath = `/ktv/my-orders?orderId=${encodeURIComponent(orderId)}&search=${encodeURIComponent(orderId)}`;
  } else if (pancakeOrderId) {
    targetPath = `/ktv/my-orders?search=${encodeURIComponent(pancakeOrderId)}`;
  }

  // Đảm bảo tạo URL tuyệt đối trên đúng origin để tránh lỗi phân giải trên Android/iOS
  const fullTargetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      // 1. Tìm client thuộc cùng origin (ưu tiên client đang mở)
      for (const client of windowClients) {
        let isSameOrigin = false;
        try {
          isSameOrigin = new URL(client.url).origin === self.location.origin;
        } catch (e) {
          isSameOrigin = false;
        }

        if (isSameOrigin && 'focus' in client) {
          // Gửi thông điệp REDIRECT để React Router điều hướng nội bộ tức thì trong RAM (0ms)
          client.postMessage({ type: 'REDIRECT', url: targetPath, fullUrl: fullTargetUrl });
          return client.focus();
        }
      }

      // 2. Nếu không tìm thấy cửa sổ nào đang mở, mở cửa sổ mới với URL tuyệt đối
      if (clients.openWindow) {
        return clients.openWindow(fullTargetUrl);
      }
    })
  );
});
