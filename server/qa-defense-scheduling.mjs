import 'dotenv/config'

import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import pg from 'pg'
import { databaseConnectionOptions } from './database-config.mjs'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const apiUrl = `http://127.0.0.1:${port}`
const pool = new Pool(databaseConnectionOptions())

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
        (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PUBLICO') AS public_state_id,
        (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'APROBADO_INSTITUCIONAL') AS institutional_state_id`,
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
      await client.query(`DELETE FROM titulacion.revisiones WHERE ronda_revision_id IN (SELECT rr.id FROM titulacion.rondas_revision rr JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = $1)`, [projectId])
      await client.query(`DELETE FROM titulacion.rondas_revision WHERE version_documento_id IN (SELECT vd.id FROM titulacion.versiones_documento vd JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = $1)`, [projectId])
      await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
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
  const privateDocument = await pool.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1, $2, 'Documento privado QA', 'DOCUMENTO_PRIVADO', $3) RETURNING id`,
    [projectId, catalog.private_phase_id, accounts.Student.userId],
  )
  const privateDocumentId = privateDocument.rows[0].id
  const uploadPrivateVersion = () => {
    const body = new FormData()
    body.set('document', new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'privado-qa.docx')
    return fetch(`${apiUrl}/api/documents/${privateDocumentId}/versions`, { method: 'POST', headers: { Cookie: studentCookie }, body })
  }
  await expect(await uploadPrivateVersion(), 201, 'Primera entrega privada abre la ronda')
  const studentDocuments = await expect(await fetch(`${apiUrl}/api/documents`, { headers: { Cookie: studentCookie } }), 200, 'Documentos con ronda privada abierta')
  const privatePayload = (await studentDocuments.json()).documents.find((item) => item.id === privateDocumentId)
  assert.equal(privatePayload.reviewInProgress, true)
  assert.equal(privatePayload.canUploadVersion, false)
  const blockedVersion = await expect(await uploadPrivateVersion(), 409, 'Nueva versión bloqueada durante revisión privada')
  assert.match((await blockedVersion.json()).message, /revisión en curso/)
  const versionsAfterBlock = await pool.query('SELECT count(*)::int AS total FROM titulacion.versiones_documento WHERE documento_id = $1', [privateDocumentId])
  assert.equal(versionsAfterBlock.rows[0].total, 1, 'El rechazo no debe crear una segunda versión')

  const privateDetail = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Detalle administrativo de defensa privada')
  assert.equal((await privateDetail.json()).project.defenses.private.scheduledAt, null, 'El detalle administrativo no informa la convocatoria privada pendiente')
  const privateDefensesPending = await expect(await fetch(`${apiUrl}/api/admin/defenses/PRIVATE`, { headers: { Cookie: adminCookie } }), 200, 'Listado de defensas privadas pendientes')
  const privatePendingProject = (await privateDefensesPending.json()).projects.find((project) => project.projectId === projectId)
  assert.equal(privatePendingProject?.scheduledAt, null, 'El listado no identifica la defensa privada sin fecha')

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
  const privateDefensesScheduled = await expect(await fetch(`${apiUrl}/api/admin/defenses/PRIVATE`, { headers: { Cookie: adminCookie } }), 200, 'Listado de defensas privadas programadas')
  const privateScheduledProject = (await privateDefensesScheduled.json()).projects.find((project) => project.projectId === projectId)
  assert.equal(privateScheduledProject?.location, 'Auditorio A', 'El listado no conserva el lugar de la defensa privada')
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
  const publicDefensesPending = await expect(await fetch(`${apiUrl}/api/admin/defenses/PUBLIC`, { headers: { Cookie: adminCookie } }), 200, 'Listado de defensas públicas pendientes')
  const publicPendingProject = (await publicDefensesPending.json()).projects.find((project) => project.projectId === projectId)
  assert.equal(publicPendingProject?.scheduledAt, null, 'El listado no identifica la defensa pública sin fecha')
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/defense-schedules/PUBLIC`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ date: '2026-12-05', time: '16:00', location: 'Sala Magna' }),
  }), 200, 'Programación de defensa pública')
  const publicDefensesScheduled = await expect(await fetch(`${apiUrl}/api/admin/defenses/PUBLIC`, { headers: { Cookie: adminCookie } }), 200, 'Listado de defensas públicas programadas')
  const publicScheduledProject = (await publicDefensesScheduled.json()).projects.find((project) => project.projectId === projectId)
  assert.equal(publicScheduledProject?.location, 'Sala Magna', 'El listado no conserva el lugar de la defensa pública')
  const publicNotifications = await pool.query(`SELECT count(*)::int AS total FROM titulacion.notificaciones WHERE proyecto_id = $1 AND tipo = 'DEFENSA_PUBLICA_PROGRAMADA'`, [projectId])
  assert.equal(publicNotifications.rows[0].total, 4, 'La defensa pública no notificó a los cuatro participantes')
  const publicDocument = await pool.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1, $2, 'Documento final QA', 'DOCUMENTO_PUBLICO', $3)
     RETURNING id`,
    [projectId, catalog.public_phase_id, accounts.Student.userId],
  )
  const publicVersion = await pool.query(
    `INSERT INTO titulacion.versiones_documento
      (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
     VALUES ($1, 1, 'documento-final-qa.docx', $2, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 128, $3, $4, 'Version final de QA.')
     RETURNING id`,
    [publicDocument.rows[0].id, `uploads/proyectos/${projectId}/documento-final-qa.docx`, crypto.createHash('sha256').update(`public-${suffix}`).digest('hex'), accounts.Student.userId],
  )
  const publicRound = await pool.query(
    `INSERT INTO titulacion.rondas_revision (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id)
     VALUES ($1, $2, 1, $3)
     RETURNING id`,
    [publicVersion.rows[0].id, catalog.public_phase_id, accounts.Admin.userId],
  )
  await pool.query(
    `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
     SELECT $1, id
     FROM titulacion.asignaciones_proyecto
     WHERE proyecto_id = $2 AND tipo IN ('TUTOR', 'REVISOR_1', 'REVISOR_2')`,
    [publicRound.rows[0].id, projectId],
  )

  const closureBeforeApproval = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Detalle antes del cierre')
  assert.equal((await closureBeforeApproval.json()).closure.eligible, false, 'El cierre se habilito antes de aprobar la ronda publica')
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/close`, {
    method: 'POST', headers: { Cookie: adminCookie },
  }), 409, 'Bloqueo del cierre antes de la aprobacion publica')

  await pool.query(`UPDATE titulacion.revisiones SET decision = 'APROBADO', decidida_en = now() WHERE ronda_revision_id = $1`, [publicRound.rows[0].id])
  await pool.query(`UPDATE titulacion.rondas_revision SET cerrada_en = now() WHERE id = $1`, [publicRound.rows[0].id])
  const approvalClient = await pool.connect()
  try {
    await moveTo(approvalClient, catalog.public_phase_id, catalog.institutional_state_id, 'QA: public defense approved by the three participants.')
  } finally {
    approvalClient.release()
  }

  const closureReady = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Detalle listo para cierre')
  const closureDetail = await closureReady.json()
  assert.equal(closureDetail.closure.eligible, true, 'El cierre no se habilito tras los tres dictamenes aprobados')
  assert.equal(closureDetail.closure.roundNumber, 1, 'El detalle no informa la ronda publica aprobada')
  const closeResult = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/close`, {
    method: 'POST', headers: { Cookie: adminCookie },
  }), 200, 'Cierre del proyecto')
  assert.match((await closeResult.json()).message, /cerrado/i, 'El cierre no confirmo la finalizacion')

  const finalState = await pool.query(
    `SELECT ep.codigo AS estado_codigo, f.codigo AS fase_codigo
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     JOIN titulacion.fases f ON f.id = p.fase_actual_id
     WHERE p.id = $1`,
    [projectId],
  )
  assert.deepEqual(finalState.rows[0], { estado_codigo: 'FINALIZADO', fase_codigo: 'CIERRE' }, 'El proyecto no llego al estado final de cierre')
  const closingNotifications = await pool.query(
    `SELECT enlace FROM titulacion.notificaciones
     WHERE proyecto_id = $1 AND tipo = 'PROYECTO_FINALIZADO'
     ORDER BY enlace`,
    [projectId],
  )
  assert.deepEqual(closingNotifications.rows.map((item) => item.enlace), ['/revisor/completados', '/revisor/completados', '/student', '/tutor/proyectos'], 'Las notificaciones de cierre no conducen a las vistas de cada participante')
  const finalStudent = await expect(await fetch(`${apiUrl}/api/student/bootstrap`, { headers: { Cookie: studentCookie } }), 200, 'Proyecto final visible para estudiante')
  const finalStudentData = await finalStudent.json()
  assert.equal(finalStudentData.project.statusCode, 'FINALIZADO', 'El estudiante no ve el proyecto finalizado')
  assert.equal(finalStudentData.project.phaseCode, 'CIERRE', 'El estudiante no ve la fase de cierre')
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/close`, {
    method: 'POST', headers: { Cookie: adminCookie },
  }), 409, 'Bloqueo de un segundo cierre')

  console.log('QA defensas aprobado: convocatorias, cierre condicionado a tres dictamenes, estado FINALIZADO/CIERRE y notificaciones verificados.')
} finally {
  for (const cookie of [adminCookie, studentCookie, tutorCookie, reviewer1Cookie, reviewer2Cookie]) {
    if (cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined)
  }
  await cleanup()
  await pool.end()
}
