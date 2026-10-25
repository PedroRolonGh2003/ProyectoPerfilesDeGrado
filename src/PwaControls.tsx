import { useEffect, useState } from 'react'
import { api } from './api'
import { devicePushState, serviceWorkerReady } from './pwa'
import { Modal } from './Modal'

type PushConfig = { configured: boolean; publicKey: string | null }
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export const pushPreferenceKey = (userId: string) => `stit:push-enabled:${userId}`
export const pushPromptKey = (userId: string) => `stit:mobile-push-prompt:${userId}`
const keyBytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function PwaControls({ userId }: { userId: string }) {
  const [config, setConfig] = useState<PushConfig | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null)
  const [active, setActive] = useState(false)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const promptKey = pushPromptKey(userId)
  const isMobile = window.matchMedia('(max-width: 860px)').matches
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const needsInstall = isIOS && !standalone

  useEffect(() => {
    let cancelled = false
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', capture)
    if (isMobile && localStorage.getItem(pushPreferenceKey(userId)) !== 'yes' && !sessionStorage.getItem(promptKey)) setOpen(true)

    async function sync() {
      try {
        const next = await api<PushConfig>('/api/push/config')
        if (cancelled) return
        setConfig(next)
        if (!supported()) return
        const optedIn = localStorage.getItem(pushPreferenceKey(userId)) === 'yes'
        if (!optedIn || Notification.permission !== 'granted' || !next.configured || !next.publicKey) {
          await devicePushState(userId, false)
          if (cancelled) return
          setActive(false)
          if (optedIn && Notification.permission !== 'granted') {
            localStorage.removeItem(pushPreferenceKey(userId))
            if (isMobile) setOpen(true)
          }
          return
        }

        const registration = await serviceWorkerReady()
        let subscription = await registration.pushManager.getSubscription()
        const expected = keyBytes(next.publicKey)
        const oldKey = subscription?.options.applicationServerKey
        const matches = oldKey?.byteLength === expected.length && new Uint8Array(oldKey).every((byte, index) => byte === expected[index])
        if (subscription && !matches) {
          await subscription.unsubscribe()
          subscription = null
        }
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected })
        await api('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) })
        if (cancelled || localStorage.getItem(pushPreferenceKey(userId)) !== 'yes') return
        await devicePushState(userId, true)
        setActive(true)
        setOpen(false)
      } catch {
        if (!cancelled) {
          setMessage('No pudimos activar los avisos. Revisa tu conexión e inténtalo de nuevo.')
          if (isMobile && localStorage.getItem(pushPreferenceKey(userId)) === 'yes') setOpen(true)
        }
      }
    }
    void sync()
    window.addEventListener('online', sync)
    return () => { cancelled = true; window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('online', sync) }
  }, [userId, promptKey, isMobile])

  function close() { sessionStorage.setItem(promptKey, 'seen'); setOpen(false) }

  async function activate() {
    if (!supported() || needsInstall || active) return
    setWorking(true)
    setMessage('')
    try {
      // Permission must be requested on this tap; iOS loses activation across awaits.
      if (Notification.permission !== 'granted') {
        if (Notification.permission === 'denied') { setMessage('Los avisos están bloqueados. Habilítalos en los permisos del navegador o de la aplicación.'); return }
        if (await Notification.requestPermission() !== 'granted') { setMessage('No se concedió permiso. Puedes intentarlo en tu próximo inicio de sesión.'); return }
      }
      const next = config?.configured && config.publicKey ? config : await api<PushConfig>('/api/push/config')
      setConfig(next)
      if (!next.configured || !next.publicKey) { setMessage('Los avisos push todavía no están habilitados en el servidor.'); return }
      const registration = await serviceWorkerReady()
      let subscription = await registration.pushManager.getSubscription()
      const expected = keyBytes(next.publicKey)
      const oldKey = subscription?.options.applicationServerKey
      const matches = oldKey?.byteLength === expected.length && new Uint8Array(oldKey).every((byte, index) => byte === expected[index])
      if (subscription && !matches) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected })
      await api('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) })
      await devicePushState(userId, true)
      localStorage.setItem(pushPreferenceKey(userId), 'yes')
      setActive(true)
      close()
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(/permission|denied|notallowed/i.test(detail) ? 'El navegador bloqueó los avisos. Revisa los permisos de notificación del dispositivo.' : detail || 'No se pudieron activar los avisos.')
    }
    finally { setWorking(false) }
  }

  if (!open) return null
  return <Modal className="pwa-dialog" label="Notificaciones en este dispositivo" onClose={close}>
    <section className="mobile-push-dialog">
      <p className="eyebrow">AVISOS DEL PROCESO</p><h2>Mantente al tanto de tu proyecto</h2>
      <p>{needsInstall ? 'En iPhone o iPad, usa Compartir → Añadir a pantalla de inicio en Safari. Abre la aplicación desde ese icono para activar los avisos (iOS 16.4 o posterior).' : !supported() ? 'Este navegador no admite Web Push. Prueba en un navegador compatible y una conexión HTTPS. Tus avisos internos siguen disponibles.' : config?.configured ? 'Recibe avisos aunque la aplicación esté cerrada. El dispositivo debe tener conexión y permitir notificaciones.' : config ? 'Los avisos push aún no están habilitados en el servidor. Las notificaciones internas siguen disponibles.' : 'Comprobando la disponibilidad de los avisos…'}</p>
      {message && <p className="mobile-push-message" role="status">{message}</p>}
      <div className="mobile-push-actions">
        <button className="secondary-button" onClick={close} type="button">Ahora no</button>
        {installPrompt && <button className="secondary-button" onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null)) }} type="button">Instalar app</button>}
        {supported() && !needsInstall && !active && <button className="primary-button" disabled={working || !config?.configured} onClick={() => void activate()} type="button">{working ? 'Activando…' : 'Permitir notificaciones'}</button>}
      </div>
    </section>
  </Modal>
}
