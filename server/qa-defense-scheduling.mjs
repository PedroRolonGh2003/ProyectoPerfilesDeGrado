import 'dotenv/config'

import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const apiUrl = `http://127.0.0.1:${port}`
const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: '-c search_path=titulacion,public',
    })

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const password = 'DefenseSchedulingQA-2026'
const accounts = {}
let projectId = ''
let adminCookie = ''
let studentCookie = ''
let tutorCookie = ''
let reviewer1Cookie = ''
let reviewer2Cookie = ''

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function createAccount(client, { key, role, careerId }) {
  const email = `qa.defenses.${key.toLowerCase()}.${suffix}@univalle.edu`
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash, activo, email_confirmado_en)
     VALUES ('QA', $1, $2, $3, true, now())
     RETURNING id`,
    [key, email, await bcrypt.hash(password, 10)],
  )
  const roleRow = await client.query(`SELECT id FROM titulacion.roles WHERE codigo = $1 AND activo`, [role])
  assert.ok(roleRow.rows[0], `No existe el rol ${role}`)
  await client.query(`INSERT INTO titulacion.usuario_roles (usuario_id, rol_id, activo) VALUES ($1, $2, true)`, [user.rows[0].id, roleRow.rows[0].id])
  accounts[key] = { userId: user.rows[0].id, email, teacherId: '', studentId: '' }
  if (role === 'ESTUDIANTE') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario, activo)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [user.rows[0].id, careerId, `QA-DEF-${suffix}`],
    )
    accounts[key].studentId = student.rows[0].id
  }
  if (role === 'TUTOR' || role === 'REVISOR') {
    const teacher = await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad, activo)
       VALUES ($1, $2, $3, 'Pruebas automatizadas', true) RETURNING id`,
      [user.rows[0].id, careerId, `QA-DEF-${key}-${suffix}`],
    )
    accounts[key].teacherId = teacher.rows[0].id
  }
}

async function setup() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const catalog = await client.query(`
      SELECT
        (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS career_id,
        (SELECT id FROM titulacion.gestiones WHERE activa ORDER BY fecha_inicio DESC NULLS LAST LIMIT 1) AS management_id,
        (SELECT id FROM titulacion.modalidades_titulacion WHERE activa ORDER BY codigo LIMIT 1) AS modality_id,
        (SELECT id FROM titulacion.fases WHERE codigo = 'REGISTRO') AS registration_phase_id,
        (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'REGISTRADO') AS registered_state_id,
        (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PRIVADO') AS private_phase_id,
        (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PRIVADO') AS private_state_id,
        (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PUBLICO') AS public_phase_id,
        (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PUBLICO') AS public_state_id`,
    )
    const values = catalog.rows[0]
    assert.ok(Object.values(values).every(Boolean), 'Faltan catálogos para QA de programación de defensas')
    await createAccount(client, { key: 'Admin', role: 'ADMINISTRADOR', careerId: values.career_id })
    await createAccount(client, { key: 'Student', role: 'ESTUDIANTE', careerId: values.career_id })
    await createAccount(client, { key: 'Tutor', role: 'TUTOR', careerId: values.career_id })
    await createAccount(client, { key: 'ReviewerOne', role: 'REVISOR', careerId: values.career_id })
    await createAccount(client, { key: 'ReviewerTwo', role: 'REVISOR', careerId: values.career_id })
    const project = await client.query(
      `INSERT INTO titulacion.proyectos
        (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id, titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
       VALUES ($1, $2, $3, $4, $5, 'Proyecto QA de defensas', 'Proyecto temporal para verificar convocatoria privada y pública.', 'Validar la programación de defensas y sus notificaciones.', $6)
       RETURNING id`,
      [`QA-DEF-${suffix}`, values.management_id, values.modality_id, values.registration_phase_id, values.registered_state_id, accounts.Student.userId],
    )
    projectId = project.rows[0].id
    await client.query(`INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal) VALUES ($1, $2, true)`, [projectId, accounts.Student.studentId])
    await client.query(
      `INSERT INTO titulacion.asignaciones_proyecto
        (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, respondida_en)
       VALUES ($1, $2, 'TUTOR', $3, true, now()),
              ($1, $4, 'REVISOR_1', $3, true, null),
              ($1, $5, 'REVISOR_2', $3, true, null)`,
      [projectId, accounts.Tutor.teacherId, accounts.Admin.userId, accounts.ReviewerOne.teacherId, accounts.ReviewerTwo.teacherId],
    )
    await client.query('COMMIT')
    return values
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function login(key) {
  const response = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts[key].email, password }),
  }), 200, `Inicio de sesión ${key}`)
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

async function moveTo(client, phaseId, stateId, reason) {
  await client.query(
    `INSERT INTO titulacion.historial_estados
      (proyecto_id, estado_nuevo_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, stateId, phaseId, accounts.Admin.userId, reason],
  )
}

async function cleanup() {
  const userIds = Object.values(accounts).map((account) => account.userId).filter(Boolean)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (projectId) {
      await client.query('DELETE FROM titulacion.auditoria WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.notificaciones WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.asignaciones_proyecto WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.historial_estados WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    }
    if (userIds.length > 0) {
      await client.query('DELETE FROM titulacion.notificaciones WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.sesiones_usuario WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.usuario_roles WHERE usuario_id = ANY($1::uuid[])', [userIds])
    }
    for (const account of Object.values(accounts)) {
      if (account.studentId) await client.query('DELETE FROM titulacion.estudiantes WHERE id = $1', [account.studentId])
      if (account.teacherId) await client.query('DELETE FROM titulacion.docentes WHERE id = $1', [account.teacherId])
    }
    if (userIds.length > 0) await client.query('DELETE FROM titulacion.usuarios WHERE id = ANY($1::uuid[])', [userIds])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

try {
  const catalog = await setup()
  adminCookie = await login('Admin')
  studentCookie = await login('Student')
  tutorCookie = await login('Tutor')
  reviewer1Cookie = await login('ReviewerOne')
  reviewer2Cookie = await login('ReviewerTwo')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/defense-schedules/PRIVATE`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ date: '2026-11-20', time: '09:30', location: 'Auditorio A' }),
  }), 409, 'Bloqueo de defensa privada antes de su fase')

  const client = await pool.connect()
  try { await moveTo(client, catalog.private_phase_id, catalog.private_state_id, 'QA: proyecto habilitado para defensa privada.') } finally { client.release() }
  const privateDetail = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Detalle administrativo de defensa privada')
  assert.equal((await privateDetail.json()).project.defenses.private.scheduledAt, null, 'El detalle administrativo no informa la convocatoria privada pendiente')

  const privateSchedule = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/defense-schedules/PRIVATE`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ date: '2026-11-20', time: '09:30', location: 'Auditorio A' }),
  }), 200, 'Programación de defensa privada')
  assert.match((await privateSchedule.json()).message, /notificó/i, 'La programación no informó las notificaciones')

  const storedPrivate = await pool.query(
    `SELECT to_char(fecha_hora AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') AS fecha_hora, lugar
     FROM titulacion.defensas_programadas WHERE proyecto_id = $1 AND tipo = 'PRIVADA'`,
    [projectId],
  )
  assert.deepEqual(storedPrivate.rows[0], { fecha_hora: '2026-11-20 09:30', lugar: 'Auditorio A' }, 'La convocatoria privada no guardó fecha, hora y lugar')
  const programmedDetail = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Detalle administrativo con convocatoria')
  assert.equal((await programmedDetail.json()).project.defenses.private.location, 'Auditorio A', 'Administración no ve la convocatoria programada')

  const student = await expect(await fetch(`${apiUrl}/api/student/bootstrap`, { headers: { Cookie: studentCookie } }), 200, 'Estado de defensa para estudiante')
  assert.equal((await student.json()).project.defenses.private.location, 'Auditorio A', 'El estudiante no ve el lugar de la defensa privada')
  const tutor = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Estado de defensa para tutor')
  assert.equal((await tutor.json()).projects.find((project) => project.projectId === projectId).defenses.private.location, 'Auditorio A', 'El tutor no ve la convocatoria privada')
  const reviewer = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: reviewer1Cookie } }), 200, 'Estado de defensa para revisor')
  assert.equal((await reviewer.json()).defenseProjects.find((project) => project.projectId === projectId).defenses.private.location, 'Auditorio A', 'El revisor no ve la convocatoria privada')
  const reviewerTwo = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: reviewer2Cookie } }), 200, 'Notificación para segundo revisor')
  assert.ok((await reviewerTwo.json()).notifications.some((item) => item.type === 'DEFENSA_PRIVADA_PROGRAMADA' && item.link === '/revisor/defensas-privada'), 'La notificación del segundo revisor no conduce a Defensas')

  const notificationLinks = await pool.query(
    `SELECT n.enlace
     FROM titulacion.notificaciones n
     WHERE n.proyecto_id = $1 AND n.tipo = 'DEFENSA_PRIVADA_PROGRAMADA'
     ORDER BY n.enlace`,
    [projectId],
  )
  assert.deepEqual(notificationLinks.rows.map((item) => item.enlace), ['/revisor/defensas-privada', '/revisor/defensas-privada', '/student', '/tutor/defensas-privada'], 'Las notificaciones privadas no alcanzaron a todos los participantes')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/defense-schedules/PUBLIC`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ date: '2026-12-05', time: '16:00', location: 'Sala Magna' }),
  }), 409, 'Bloqueo de defensa pública antes de su fase')
  const publicClient = await pool.connect()
  try { await moveTo(publicClient, catalog.public_phase_id, catalog.public_state_id, 'QA: proyecto habilitado para defensa pública.') } finally { publicClient.release() }
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/defense-schedules/PUBLIC`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ date: '2026-12-05', time: '16:00', location: 'Sala Magna' }),
  }), 200, 'Programación de defensa pública')
  const publicNotifications = await pool.query(`SELECT count(*)::int AS total FROM titulacion.notificaciones WHERE proyecto_id = $1 AND tipo = 'DEFENSA_PUBLICA_PROGRAMADA'`, [projectId])
  assert.equal(publicNotifications.rows[0].total, 4, 'La defensa pública no notificó a los cuatro participantes')
  console.log('QA defensas aprobado: validación de fase, fecha/hora/lugar, estados y notificaciones para estudiante, tutor y revisores.')
} finally {
  for (const cookie of [adminCookie, studentCookie, tutorCookie, reviewer1Cookie, reviewer2Cookie]) {
    if (cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined)
  }
  await cleanup()
  await pool.end()
}
