const STATIC_CACHE = 'stit-public-v1'
const PUBLIC_ASSETS = ['/univalle-logo.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/assets/') || PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(async (cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) void caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })
      return cached ?? network
    }))
  }
})

async function notifyOpenClients(payload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach((client) => client.postMessage({ type: 'PUSH_NOTIFICATION', notificationId: payload.notificationId }))
  return clients.some((client) => client.visibilityState === 'visible')
}

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {}
  if (!payload.notificationId) return
  event.waitUntil(notifyOpenClients(payload).then((hasVisibleClient) => {
    if (hasVisibleClient) return undefined
    return self.registration.showNotification('Seguimiento de Titulación', {
      body: 'Tienes una nueva actualización. Ingresa para revisarla.',
      data: { notificationId: payload.notificationId },
      icon: '/univalle-logo.png',
      badge: '/univalle-logo.png',
      tag: `stit-${payload.notificationId}`,
      renotify: false,
    })
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const notificationId = event.notification.data?.notificationId
  if (!notificationId) return
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients[0]
    if (existing) {
      await existing.focus()
      existing.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', notificationId })
      return
    }
    const target = new URL('/', self.location.origin)
    target.searchParams.set('notification', notificationId)
    await self.clients.openWindow(target.href)
  }))
})
