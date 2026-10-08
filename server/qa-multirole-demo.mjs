import 'dotenv/config'

import assert from 'node:assert/strict'
import pg from 'pg'

const { Pool } = pg
const email = 'docente.multirol.carga@univalle.edu'
const password = 'MultiRolDemo!2026'
const apiUrl = `http://127.0.0.1:${Number(process.env.PORT ?? 3001)}`
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: '-c search_path=titulacion,public',
})

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibio ${response.status}`)
  return response
}

let cookie = ''
try {
  const projects = await pool.query(
    `SELECT ep.codigo, count(*)::int AS total
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     WHERE p.codigo_seguimiento LIKE 'CARGA-2026-%'
     GROUP BY ep.codigo`,
  )
  const totalsByStatus = Object.fromEntries(projects.rows.map((row) => [row.codigo, row.total]))
  assert.equal(Object.values(totalsByStatus).reduce((sum, total) => sum + total, 0), 9, 'La carga debe contener nueve proyectos')
  assert.equal(totalsByStatus.EN_REVISION, 3, 'Deben existir tres proyectos pendientes de revision')
  assert.equal(totalsByStatus.PENDIENTE_APROBACION, 2, 'Deben existir dos proyectos aprobados en revision')
  assert.equal(totalsByStatus.OBSERVADO, 2, 'Deben existir dos proyectos devueltos/denegados con observaciones')
  assert.equal(totalsByStatus.REGISTRADO, 2, 'Deben existir dos proyectos en registro')

  const assignments = await pool.query(
    `SELECT a.tipo, count(*)::int AS total
     FROM titulacion.asignaciones_proyecto a
     JOIN titulacion.docentes d ON d.id = a.docente_id
     JOIN titulacion.usuarios u ON u.id = d.usuario_id
     JOIN titulacion.proyectos p ON p.id = a.proyecto_id
     WHERE lower(u.correo) = lower($1)
       AND p.codigo_seguimiento LIKE 'CARGA-2026-%'
       AND a.fecha_fin IS NULL
     GROUP BY a.tipo`,
    [email],
  )
  const totalsByAssignment = Object.fromEntries(assignments.rows.map((row) => [row.tipo, row.total]))
  assert.equal(totalsByAssignment.TUTOR, 7, 'La cuenta multirol debe tener siete tutorias, incluida una invitacion')
  assert.equal(totalsByAssignment.REVISOR_1, 7, 'La cuenta multirol debe tener siete revisiones asignadas')

  const login = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  }), 200, 'Inicio de sesion de la cuenta multirol')
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(cookie.startsWith('stit_session='), 'No se creo la sesion para la cuenta multirol')
  const loginPayload = await login.json()
  assert.deepEqual(loginPayload.user.roles, ['TUTOR', 'REVISOR'], 'La cuenta no expone ambos roles')
  assert.equal(loginPayload.user.role, 'TUTOR', 'La sesion debe iniciar en la vista Tutor')

  const tutor = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: cookie } }), 200, 'Carga de la vista Tutor')
  const tutorPayload = await tutor.json()
  assert.equal(tutorPayload.projects.length, 6, 'La vista Tutor debe mostrar seis proyectos activos')
  assert.equal(tutorPayload.invitations.length, 1, 'La vista Tutor debe mostrar una invitacion pendiente')
  assert.ok(tutorPayload.notifications.some((notification) => notification.role === 'TUTOR'), 'La notificacion de tutoria debe conservar su indicador de rol')

  const roleChange = await expect(await fetch(`${apiUrl}/api/auth/active-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ role: 'REVISOR' }),
  }), 200, 'Cambio a vista Revisor')
  assert.equal((await roleChange.json()).user.role, 'REVISOR', 'El cambio de rol no activo la vista Revisor')

  const reviewer = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: cookie } }), 200, 'Carga de la vista Revisor')
  const reviewerPayload = await reviewer.json()
  assert.equal(reviewerPayload.pendingReviews.length, 3, 'La vista Revisor debe mostrar tres dictamenes pendientes')
  assert.equal(reviewerPayload.completedReviews.length, 4, 'La vista Revisor debe conservar cuatro dictamenes emitidos')
  assert.ok(reviewerPayload.notifications.some((notification) => notification.role === 'REVISOR'), 'Las notificaciones de revision deben conservar su indicador de rol')

  console.log('QA carga multirol aprobado: estados, proyectos, roles Tutor/Revisor, bandejas y notificaciones verificados.')
} finally {
  if (cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined)
  await pool.end()
}
