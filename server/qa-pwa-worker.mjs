import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const handlers = new Map()
const shown = []; const messages = []; const opened = []
let windows = []
let account = { userId: 'student-a', enabled: true }
const context = vm.createContext({ URL, Promise, Response, console, self: {
  location: { origin: 'https://example.com' },
  addEventListener: (name, handler) => handlers.set(name, handler),
  registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
  clients: { matchAll: async () => windows, openWindow: async (url) => opened.push(url) },
} })
vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context)
// Storage adapter is mocked; notification and click handlers run unchanged.
context.deviceState = async () => account
async function emit(type, event) {
  let work
  handlers.get(type)({ ...event, waitUntil: (promise) => { work = promise } })
  await work
}
const payload = { notificationId: 'n-1', userId: 'student-a', title: 'Perfil pendiente de revisión', body: 'El proyecto DEMO-2026-003 está listo para evaluar.' }
windows = [{ visibilityState: 'visible', postMessage: (message) => messages.push(message) }]
await emit('push', { data: { json: () => payload } })
assert.equal(shown.length, 1, 'También debe mostrar una notificación del sistema con la app visible (iOS userVisibleOnly)')
assert.equal(shown[0].title, payload.title)
assert.equal(shown[0].body, payload.body)
assert.equal(shown[0].icon, '/univalle-logo.png')
assert.equal(shown[0].badge, '/notification-badge.png')
assert.equal(messages.length, 1)
assert.equal(shown[0].tag, 'stit-n-1')
account.enabled = false
await emit('push', { data: { json: () => payload } })
account = { userId: 'other-account', enabled: true }
await emit('push', { data: { json: () => payload } })
await emit('push', { data: { json: () => { throw Error('invalid') } } })
assert.equal(shown.length, 1, 'No mostrar mensajes después de logout, de otra cuenta ni payload inválido')
account = { userId: 'student-a', enabled: true }
windows = []
await emit('notificationclick', { notification: { data: payload, close() {} } })
assert.equal(opened[0], 'https://example.com/?notification=n-1')
let focused = false; let navigated = ''
windows = [{ url: 'https://example.com/', navigate: async (url) => { navigated = url }, focus: async () => { focused = true } }]
await emit('notificationclick', { notification: { data: payload, close() {} } })
assert.ok(focused); assert.equal(navigated, opened[0]); assert.equal(opened.length, 1)
let intercepted = false
handlers.get('fetch')({ request: { method: 'GET', url: 'https://example.com/api/student/overview' }, respondWith: () => { intercepted = true } })
assert.equal(intercepted, false, 'Los datos privados nunca pasan por la caché')
console.log('PASS Service Worker: primer plano, descarte tras logout/cambio de cuenta, payload inválido, apertura/enfoque con destino y exclusión de caché privada. Almacenamiento y proveedor simulados; no prueba recepción física.')
