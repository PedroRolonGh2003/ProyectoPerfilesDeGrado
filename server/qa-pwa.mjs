import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import 'dotenv/config'

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001'
const { Pool } = pg
const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, options: '-c search_path=titulacion,public' }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: '-c search_path=titulacion,public',
    })

try {
  const [manifestSource, serviceWorkerSource] = await Promise.all([
    readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ])
  const manifest = JSON.parse(manifestSource)
  assert.equal(manifest.display, 'standalone', 'El manifiesto debe instalar la aplicación en modo independiente')
  assert.equal(manifest.start_url, '/', 'La PWA debe abrir en la plataforma existente')
  assert.ok(manifest.icons?.length > 0, 'El manifiesto necesita un ícono')
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\('\/api\/'\)/, 'El Service Worker debe excluir la API privada de la caché')
  assert.match(serviceWorkerSource, /PUSH_NOTIFICATION_CLICK/, 'El Service Worker debe redirigir al presionar una notificación')

  const denied = await fetch(`${apiUrl}/api/push/config`)
  assert.equal(denied.status, 401, 'La configuración push no puede exponerse sin sesión')

  const tables = await pool.query(
    `SELECT to_regclass('titulacion.suscripciones_push') AS subscriptions,
            to_regclass('titulacion.entregas_notificaciones_push') AS deliveries`,
  )
  assert.equal(tables.rows[0].subscriptions, 'suscripciones_push', 'Falta la tabla de suscripciones por dispositivo')
  assert.equal(tables.rows[0].deliveries, 'entregas_notificaciones_push', 'Falta la tabla de entregas push')
  console.log('QA PWA aprobado: manifiesto, caché pública, acceso protegido y tablas de Web Push verificados.')
} finally {
  await pool.end()
}
