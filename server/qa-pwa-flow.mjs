import 'dotenv/config'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import webpush from 'web-push'
import { deliverPendingPush, PUSH_TTL } from './push-delivery.mjs'

// Real database and HTTP sessions, isolated accounts. No actual push is sent by QA.
const pair = webpush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = pair.publicKey
process.env.VAPID_PRIVATE_KEY = pair.privateKey
process.env.VAPID_SUBJECT = 'https://example.com'
const { default: app, initializeServerless } = await import('./index.js')
app.locals.dispatchPush = async () => 0
await initializeServerless()
const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: '-c search_path=titulacion,public' })
const ids = []
const suffix = crypto.randomBytes(6).toString('hex')
const password = crypto.randomBytes(18).toString('base64url')
const schema = `qa_push_${suffix}`
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex')
const request = (path, cookie, method = 'GET', body) => fetch(base + path, { method, headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const subscription = (name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/qa-${suffix}-${name}`, keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } })
async function login(index, remember = true) {
  const response = await request('/api/auth/login', '', 'POST', { identifier: `qa.pwa.${suffix}.${index}@univalle.edu`, password, remember })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Max-Age=/i)
  return cookie.split(';')[0]
}
async function sessionRow(cookie) { return (await pool.query('SELECT * FROM sesiones_usuario WHERE token_hash=$1', [hash(cookie.split('=')[1])])).rows[0] }
try {
  for (let i = 0; i < 2; i++) {
    const row = (await pool.query(`INSERT INTO usuarios (nombres, apellidos, correo, password_hash) VALUES ('QA', 'PWA aislada', $1, $2) RETURNING id`, [`qa.pwa.${suffix}.${i}@univalle.edu`, await bcrypt.hash(password, 10)])).rows[0]
    ids.push(row.id)
    await pool.query(`INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles WHERE codigo='ADMINISTRADOR'`, [row.id])
  }
  assert.equal((await request('/api/push/config')).status, 401)
  const a = await login(0); const secondDevice = await login(0); const b = await login(1)
  assert.equal((await sessionRow(a)).persistente, true)
  await pool.query(`UPDATE sesiones_usuario SET expira_en=now()+interval '2 hours' WHERE id=$1`, [(await sessionRow(a)).id])
  const renewed = await request('/api/auth/session', a)
  assert.equal(renewed.status, 200); assert.ok(renewed.headers.get('set-cookie'))
  assert.ok(new Date((await sessionRow(a)).expira_en).getTime() > Date.now() + 7 * 86400000)
  const short = await login(0, false)
  assert.equal((await sessionRow(short)).persistente, false)
  assert.equal((await request('/api/auth/session', short)).headers.get('set-cookie'), null)
  const device1 = subscription('one'); const device2 = subscription('two')
  assert.equal((await request('/api/push/subscriptions', a, 'POST', { subscription: device1 })).status, 201)
  assert.equal((await request('/api/push/subscriptions', a, 'POST', { subscription: device1 })).status, 201)
  assert.equal((await request('/api/push/subscriptions', secondDevice, 'POST', { subscription: device2 })).status, 201)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM suscripciones_push WHERE usuario_id=$1', [ids[0]])).rows[0].n, 2)
  assert.equal((await request('/api/push/subscriptions', a, 'POST', { subscription: { ...device1, endpoint: 'https://127.0.0.1/private' } })).status, 422)
  const test = await request('/api/push/test', a, 'POST')
  assert.equal(test.status, 201)
  const notificationId = (await test.json()).id
  assert.equal((await request('/api/push/test', a, 'POST')).status, 429)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM entregas_notificaciones_push WHERE notificacion_id=$1', [notificationId])).rows[0].n, 2)
  // Academic notifications share the same transactional outbox as the test button.
  const academicTypes = ['SOLICITUD_TUTORIA', 'REVISION_ASIGNADA', 'RECORDATORIO_REVISION_PENDIENTE', 'DEFENSA_PRIVADA_PROGRAMADA', 'DEFENSA_PUBLICA_PROGRAMADA']
  const academic = await pool.query(`INSERT INTO notificaciones (usuario_id,tipo,titulo,mensaje,enlace)
    SELECT $1, tipo, 'Aviso QA', 'Evento académico QA', '/admin' FROM unnest($2::text[]) AS tipo RETURNING id`, [ids[0], academicTypes])
  const queued = await pool.query('SELECT count(*)::int AS n FROM entregas_notificaciones_push WHERE notificacion_id=ANY($1::uuid[])', [academic.rows.map((row) => row.id)])
  assert.equal(queued.rows[0].n, academicTypes.length * 2)
  await pool.query('DELETE FROM notificaciones WHERE id=ANY($1::uuid[])', [academic.rows.map((row) => row.id)])
  assert.equal((await request(`/api/notifications/${notificationId}`, b)).status, 404)
  // Move only this endpoint to the second account; the old queued delivery is cancelled.
  assert.equal((await request('/api/push/subscriptions', b, 'POST', { subscription: device1 })).status, 201)
  assert.equal((await pool.query(`SELECT estado FROM entregas_notificaciones_push d JOIN suscripciones_push s ON s.id=d.suscripcion_id WHERE d.notificacion_id=$1 AND s.endpoint=$2`, [notificationId, device1.endpoint])).rows[0].estado, 'CANCELADO')
  // Logging out an old session must not unlink the new owner of that endpoint.
  assert.equal((await request('/api/auth/logout', a, 'POST')).status, 204)
  assert.equal((await request('/api/auth/session', a)).status, 401)
  assert.equal((await pool.query('SELECT activa FROM suscripciones_push WHERE endpoint=$1', [device1.endpoint])).rows[0].activa, true)
  assert.equal((await request('/api/auth/logout', secondDevice, 'POST')).status, 204)
  assert.equal((await pool.query('SELECT activa FROM suscripciones_push WHERE endpoint=$1', [device2.endpoint])).rows[0].activa, false)
  assert.equal((await request('/api/auth/session', b)).status, 200)
  assert.equal((await request('/api/auth/logout', b, 'POST')).status, 204)
  const c = await login(0)
  await pool.query(`INSERT INTO notificaciones (usuario_id,tipo,titulo,mensaje,enlace) SELECT $1,'QA_PWA','Historial QA','Aviso de prueba','/admin' FROM generate_series(1,25)`, [ids[0]])
  const first = await (await request('/api/notifications', c)).json()
  const next = await (await request('/api/notifications?before=' + first.nextCursor, c)).json()
  assert.equal(first.notifications.length, 20); assert.equal(next.notifications.length, 6)
  assert.equal(new Set([...first.notifications, ...next.notifications].map((n) => n.id)).size, 26)
  assert.equal(first.unreadCount, 26)
  await request(`/api/notifications/${notificationId}/read`, c, 'POST')
  assert.equal((await (await request('/api/notifications', c)).json()).unreadCount, 25)
  await pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [ids[0]])
  assert.equal((await request('/api/auth/session', c)).status, 401)
  console.log('PASS API: cookie persistente, renovación, sesión corta, revocación, dos dispositivos, transferencia, logout, autorización, historial y estado de lectura.')

  // Exercise the actual dispatcher against separate tables, with a fake provider.
  await pool.query(`CREATE SCHEMA ${schema}`)
  for (const table of ['usuarios', 'suscripciones_push', 'notificaciones', 'entregas_notificaciones_push']) await pool.query(`CREATE TABLE ${schema}.${table} (LIKE titulacion.${table} INCLUDING ALL)`)
  const rewrite = (sql) => sql.replaceAll('titulacion.', schema + '.')
  const scoped = { query: (sql, args) => pool.query(rewrite(sql), args), connect: async () => { const client = await pool.connect(); return { query: (sql, args) => client.query(rewrite(sql), args), release: () => client.release() } } }
  const uid = (await scoped.query(`INSERT INTO titulacion.usuarios (nombres,apellidos,correo,password_hash) VALUES ('QA','Worker','worker@example.com','unused') RETURNING id`)).rows[0].id
  const sid = (await scoped.query(`INSERT INTO titulacion.suscripciones_push (usuario_id,endpoint,clave_p256dh,clave_auth) VALUES ($1,'https://push.example.com/qa','unused','unused') RETURNING id`, [uid])).rows[0].id
  async function queue() {
    const nid = (await scoped.query(`INSERT INTO titulacion.notificaciones (usuario_id,tipo,titulo,mensaje) VALUES ($1,'QA','QA','QA') RETURNING id`, [uid])).rows[0].id
    const did = (await scoped.query(`INSERT INTO titulacion.entregas_notificaciones_push (notificacion_id,suscripcion_id) VALUES ($1,$2) RETURNING id`, [nid, sid])).rows[0].id
    return { nid, did }
  }
  let calls = 0
  const send = async (_sub, body, options) => { calls++; assert.equal(JSON.parse(body).userId, uid); assert.ok(options.TTL > 86400 && options.TTL <= PUSH_TTL); assert.equal(options.topic.length, 32) }
  await queue()
  await Promise.all([deliverPendingPush({ pool: scoped, send }), deliverPendingPush({ pool: scoped, send })])
  assert.equal(calls, 1)
  assert.equal((await scoped.query('SELECT leida_en FROM titulacion.notificaciones')).rows[0].leida_en, null)
  const retry = await queue()
  await deliverPendingPush({ pool: scoped, send: async () => { throw { statusCode: 503 } } })
  let job = (await scoped.query('SELECT * FROM titulacion.entregas_notificaciones_push WHERE id=$1', [retry.did])).rows[0]
  assert.equal(job.estado, 'PENDIENTE'); assert.ok(new Date(job.disponible_desde) > new Date())
  await scoped.query(`UPDATE titulacion.entregas_notificaciones_push SET estado='PROCESANDO', actualizada_en=now()-interval '6 minutes' WHERE id=$1`, [retry.did])
  await deliverPendingPush({ pool: scoped, send })
  assert.equal((await scoped.query('SELECT estado FROM titulacion.entregas_notificaciones_push WHERE id=$1', [retry.did])).rows[0].estado, 'ENVIADO')
  const gone = await queue()
  await deliverPendingPush({ pool: scoped, send: async () => { throw { statusCode: 410 } } })
  assert.equal((await scoped.query('SELECT activa FROM titulacion.suscripciones_push WHERE id=$1', [sid])).rows[0].activa, false)
  assert.equal((await scoped.query('SELECT estado FROM titulacion.entregas_notificaciones_push WHERE id=$1', [gone.did])).rows[0].estado, 'CANCELADO')
  console.log('PASS worker: envío simulado, TTL, concurrencia sin duplicados, reintento 503, recuperación de trabajos interrumpidos, baja 410 y no marcar leído.')
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await pool.query('DELETE FROM titulacion.notificaciones WHERE usuario_id=ANY($1::uuid[])', [ids])
  await pool.query('DELETE FROM titulacion.suscripciones_push WHERE usuario_id=ANY($1::uuid[])', [ids])
  await pool.query('DELETE FROM titulacion.sesiones_usuario WHERE usuario_id=ANY($1::uuid[])', [ids])
  await pool.query('DELETE FROM titulacion.usuario_roles WHERE usuario_id=ANY($1::uuid[])', [ids])
  await pool.query('DELETE FROM titulacion.usuarios WHERE id=ANY($1::uuid[])', [ids])
  await pool.end()
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve))
}
process.exit(0)
