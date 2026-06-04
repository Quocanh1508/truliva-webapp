self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const targetUrl = data && data.pancakeOrderId 
        ? `/ktv/my-orders?search=${data.pancakeOrderId}` 
        : '/ktv/my-orders';
        
      // Nếu có sẵn tab webapp đang mở, chuyển hướng nó
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('/ktv/my-orders') && 'focus' in client) {
          client.postMessage({ type: 'REDIRECT', url: targetUrl });
          return client.focus();
        }
      }
      
      // Nếu không, mở tab mới
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
