const STATIC_CACHE = 'stit-public-v4'
const PUBLIC_ASSETS = ['/univalle-logo.png', '/manifest.webmanifest', '/index.html']

function deviceState(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('stit-push-device', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('settings')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('settings', value === undefined ? 'readonly' : 'readwrite')
      const store = tx.objectStore('settings')
      const request = value === undefined ? store.get('account') : store.put(value, 'account')
      let result
      request.onsuccess = () => { result = request.result }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('stit-public-') && key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())))
  } else if (url.pathname.startsWith('/assets/') || PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(() => caches.match(request).then((cached) => cached ?? Response.error())))
  }
})
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PUSH_ACCOUNT' || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return
  event.waitUntil((async () => {
    const previous = await deviceState()
    const next = { userId: event.data.userId, enabled: Boolean(event.data.enabled) }
    await deviceState(next)
    if (!next.enabled || next.userId !== previous?.userId) {
      const notifications = await self.registration.getNotifications()
      notifications.forEach((notification) => notification.close())
    }
    event.ports[0]?.postMessage({ ok: true })
  })().catch(() => event.ports[0]?.postMessage({ ok: false })))
})
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload
    try { payload = event.data?.json() } catch { return }
    if (!payload?.notificationId || !payload.userId) return
    const state = await deviceState()
    if (!state?.enabled || state.userId !== payload.userId) return
    // userVisibleOnly requires a system notification, also in iOS foreground.
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Seguimiento de Titulación'
    const body = typeof payload.body === 'string' && payload.body.trim() ? payload.body : 'Tienes una nueva actualización. Ingresa para revisarla.'
    await self.registration.showNotification(title, {
      body,
      data: { notificationId: payload.notificationId, userId: payload.userId },
      icon: '/univalle-logo.png', badge: '/univalle-logo.png',
      tag: `stit-${payload.notificationId}`, renotify: false,
    })
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    clients.forEach((client) => client.postMessage({ type: 'PUSH_NOTIFICATION', notificationId: payload.notificationId, userId: payload.userId }))
  })())
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const { notificationId, userId } = event.notification.data ?? {}
    const state = await deviceState()
    if (!notificationId || !state?.enabled || state.userId !== userId) return
    const target = new URL('/', self.location.origin)
    target.searchParams.set('notification', notificationId)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate(target.href)
      await existing.focus()
    } else await self.clients.openWindow(target.href)
  })())
})
