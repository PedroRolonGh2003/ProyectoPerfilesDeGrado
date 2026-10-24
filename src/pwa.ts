export async function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite notificaciones push.')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('No se pudo iniciar el servicio de avisos. Comprueba tu conexión e intenta de nuevo.')), 10000) }),
    ])
  } finally { clearTimeout(timer) }
}

export async function devicePushState(userId: string | null, enabled: boolean) {
  const registration = await serviceWorkerReady()
  const worker = registration.active
  if (!worker) throw new Error('El servicio de avisos todavía no está activo.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('No se pudo guardar la configuración de avisos.')) }, 5000)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      channel.port1.close()
      if (event.data?.ok) resolve()
      else reject(new Error('No se pudo guardar la configuración de avisos.'))
    }
    worker.postMessage({ type: 'PUSH_ACCOUNT', userId, enabled }, [channel.port2])
  })
}
