import { useEffect, useState } from 'react'
import { api } from './api'
import { devicePushState, serviceWorkerReady } from './pwa'
import { Modal } from './Modal'

type PushConfig = { configured: boolean; publicKey: string | null }
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export const pushPreferenceKey = (userId: string) => `stit:push-enabled:${userId}`
const keyBytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function PwaControls({ userId }: { userId: string }) {
  const [config, setConfig] = useState<PushConfig | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null)
  const [active, setActive] = useState(false)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const promptKey = `stit:mobile-push-prompt:v2:${userId}`
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const needsInstall = isIOS && !standalone

  useEffect(() => {
    let cancelled = false
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', capture)
    async function sync() {
      try {
        const next = await api<PushConfig>('/api/push/config')
        if (cancelled) return
        setConfig(next)
        if (!supported()) return
        const registration = await serviceWorkerReady()
        const subscription = await registration.pushManager.getSubscription()
        if (cancelled) return
        const optedIn = localStorage.getItem(pushPreferenceKey(userId)) === 'yes'
        if (optedIn && subscription && Notification.permission === 'granted' && next.configured) {
          const oldKey = subscription.options.applicationServerKey
          const expected = next.publicKey ? keyBytes(next.publicKey) : null
          const matches = oldKey && expected && new Uint8Array(oldKey).every((byte, index) => byte === expected[index]) && oldKey.byteLength === expected.length
          if (!matches) { setMessage('La configuración cambió. Desactiva y vuelve a activar los avisos.'); return }
          await api('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) })
          if (cancelled || localStorage.getItem(pushPreferenceKey(userId)) !== 'yes') return
          await devicePushState(userId, true)
          setActive(true)
        } else if (!optedIn || Notification.permission !== 'granted') {
          await devicePushState(userId, false)
          setActive(false)
        }
      } catch { if (!cancelled) setMessage('No pudimos comprobar los avisos. Revisa tu conexión y vuelve a intentarlo.') }
    }
    void sync()
    window.addEventListener('online', sync)
    if (window.matchMedia('(max-width: 860px)').matches && !localStorage.getItem(promptKey)) setOpen(true)
    return () => { cancelled = true; window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('online', sync) }
  }, [userId, promptKey])

  function close() { localStorage.setItem(promptKey, 'seen'); setOpen(false) }
  async function toggle() {
    if (!supported() || needsInstall) return
    setWorking(true)
    setMessage('')
    try {
      if (!active && (!config?.configured || !config.publicKey)) {
        setConfig(await api<PushConfig>('/api/push/config'))
        setMessage('El servidor todavía no tiene habilitados los avisos push. Tus notificaciones siguen disponibles en la campanita.')
        return
      }
      // Request directly on the click; iOS loses activation across network awaits.
      if (!active && Notification.permission !== 'granted') {
        if (Notification.permission === 'denied') { setMessage('Los avisos están bloqueados. Habilítalos en los permisos del navegador o de la aplicación.'); return }
        if (await Notification.requestPermission() !== 'granted') { setMessage('No se concedió permiso. Puedes intentarlo más adelante.'); return }
      }
      const registration = await serviceWorkerReady()
      let subscription = await registration.pushManager.getSubscription()
      if (active) {
        await devicePushState(userId, false)
        if (subscription) {
          await api('/api/push/subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) })
          await subscription.unsubscribe()
        }
        localStorage.removeItem(pushPreferenceKey(userId))
        setActive(false)
        setMessage('Avisos desactivados en este dispositivo.')
      } else {
        const expected = keyBytes(config!.publicKey!)
        if (subscription && (!subscription.options.applicationServerKey || !new Uint8Array(subscription.options.applicationServerKey).every((byte, index) => byte === expected[index]))) {
          await subscription.unsubscribe(); subscription = null
        }
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected })
        await api('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) })
        await devicePushState(userId, true)
        localStorage.setItem(pushPreferenceKey(userId), 'yes')
        setActive(true)
        setMessage('Dispositivo registrado. Puedes enviar una prueba y comprobar su recepción.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron configurar los avisos.') }
    finally { setWorking(false) }
  }

  async function testPush() {
    setWorking(true)
    try {
      const result = await api<{ message: string }>('/api/push/test', { method: 'POST' })
      setMessage(result.message)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo enviar la prueba.') }
    finally { setWorking(false) }
  }

  return <div className="pwa-controls">
    <button aria-label="Configurar notificaciones push" className="pwa-control-button pwa-settings-button" onClick={() => setOpen(true)} type="button">Avisos</button>
    {open && <Modal className="pwa-dialog" label="Notificaciones en este dispositivo" onClose={close}>
      <section className="mobile-push-dialog">
        <p className="eyebrow">AVISOS DEL PROCESO</p><h2>Mantente al tanto de tu proyecto</h2>
        <p>{needsInstall ? 'En iPhone o iPad, usa Compartir → Añadir a pantalla de inicio en Safari. Abre la aplicación desde ese icono para activar los avisos (iOS 16.4 o posterior).' : !supported() ? 'Este navegador no admite Web Push. Prueba en un navegador compatible y una conexión HTTPS. Tus avisos internos siguen disponibles.' : config?.configured ? 'Recibe avisos aunque la aplicación esté cerrada. El dispositivo debe tener conexión y permitir notificaciones.' : config ? 'Los avisos push aún no están habilitados en el servidor. Las notificaciones internas siguen disponibles.' : 'Comprobando la disponibilidad de los avisos…'}</p>
        {message && <p className="mobile-push-message" role="status">{message}</p>}
        <div className="mobile-push-actions">
          <button className="secondary-button" onClick={close} type="button">Cerrar</button>
          {installPrompt && <button className="secondary-button" onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null)) }} type="button">Instalar app</button>}
          {supported() && !needsInstall && <button className="primary-button" disabled={working || !config?.configured} onClick={() => void toggle()} type="button">{working ? 'Procesando…' : active ? 'Desactivar avisos' : 'Activar avisos'}</button>}
          {active && <button className="secondary-button" disabled={working} onClick={() => void testPush()} type="button">Enviar prueba</button>}
        </div>
      </section>
    </Modal>}
  </div>
}
