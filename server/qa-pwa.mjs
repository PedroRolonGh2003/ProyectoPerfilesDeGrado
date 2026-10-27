import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import 'dotenv/config'
import { databaseConnectionOptions } from './database-config.mjs'

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001'
const { Pool } = pg
const pool = new Pool(databaseConnectionOptions())

try {
  const [manifestSource, serviceWorkerSource, appSource, stylesSource] = await Promise.all([
    readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/PwaControls.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ])
  const manifest = JSON.parse(manifestSource)
  assert.equal(manifest.display, 'standalone', 'El manifiesto debe instalar la aplicación en modo independiente')
  assert.equal(manifest.start_url, '/', 'La PWA debe abrir en la plataforma existente')
  assert.ok(manifest.icons?.length > 0, 'El manifiesto necesita un ícono')
  assert.match(serviceWorkerSource, /stit-public-v5/, 'El Service Worker debe renovar la caché pública al publicar una nueva interfaz')
  assert.match(serviceWorkerSource, /fetch\(request\)\.then/, 'Los recursos de interfaz deben consultar primero la red para evitar una versión móvil antigua')
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\('\/api\/'\)/, 'El Service Worker debe excluir la API privada de la caché')
  assert.match(serviceWorkerSource, /notificationclick/, 'El Service Worker debe redirigir al presionar una notificación')
  assert.match(appSource, /pwa-dialog/, 'El acceso móvil inicial debe mostrar la solicitud de avisos en un modal')
  assert.match(stylesSource, /\.student-sidebar, \.tutor-page \.student-sidebar, \.reviewer-page \.student-sidebar, \.admin-page \.student-sidebar/, 'La navegación de todos los roles debe fijarse en la parte inferior en móvil')

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
