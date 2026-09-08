import 'dotenv/config'

import assert from 'node:assert/strict'
import { access, rm } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const apiUrl = `http://127.0.0.1:${port}`
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: '-c search_path=titulacion,public',
})

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const studentEmail = `qa.tutor.student.${suffix}@univalle.edu`
const tutorEmail = `qa.tutor.docente.${suffix}@univalle.edu`
const studentPassword = 'TutorFlowStudent-2026'
const tutorPassword = 'TutorFlowTeacher-2026'
let studentUserId = ''
let tutorUserId = ''
let projectId = ''
let storedPath = ''
let studentCookie = ''
let tutorCookie = ''

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function word(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function dword(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

function minimalDocx() {
  const entries = [['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<document>QA tutor</document>']]
  const localRecords = []
  const centralRecords = []
  let offset = 0
  for (const [filename, contentText] of entries) {
    const name = Buffer.from(filename)
    const content = Buffer.from(contentText)
    const checksum = crc32(content)
    const local = Buffer.concat([dword(0x04034b50), word(20), word(0), word(0), word(0), word(0), dword(checksum), dword(content.length), dword(content.length), word(name.length), word(0), name, content])
    localRecords.push(local)
    centralRecords.push(Buffer.concat([dword(0x02014b50), word(20), word(20), word(0), word(0), word(0), word(0), dword(checksum), dword(content.length), dword(content.length), word(name.length), word(0), word(0), word(0), word(0), dword(0), dword(offset), name]))
    offset += local.length
  }
  const central = Buffer.concat(centralRecords)
  return Buffer.concat([...localRecords, central, dword(0x06054b50), word(0), word(0), word(entries.length), word(entries.length), dword(central.length), dword(offset), word(0)])
}

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function setupUsers() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const catalogs = await client.query(
      `SELECT
        (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS carrera_id,
        (SELECT id FROM titulacion.roles WHERE codigo = 'ESTUDIANTE' AND activo) AS estudiante_rol_id,
        (SELECT id FROM titulacion.roles WHERE codigo = 'TUTOR' AND activo) AS tutor_rol_id`,
    )
    const catalog = catalogs.rows[0]
    assert.ok(catalog.carrera_id && catalog.estudiante_rol_id && catalog.tutor_rol_id, 'No se encontraron catálogos para QA de tutor')
    const student = await client.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
       VALUES ('QA', 'Estudiante Tutor', $1, $2)
       RETURNING id`,
      [studentEmail, await bcrypt.hash(studentPassword, 10)],
    )
    studentUserId = student.rows[0].id
    await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)`,
      [studentUserId, catalog.carrera_id, `QA-TUTOR-S-${suffix}`],
    )
    await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [studentUserId, catalog.estudiante_rol_id])

    const tutor = await client.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
       VALUES ('QA', 'Tutor Temporal', $1, $2)
       RETURNING id`,
      [tutorEmail, await bcrypt.hash(tutorPassword, 10)],
    )
    tutorUserId = tutor.rows[0].id
    await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad)
       VALUES ($1, $2, $3, 'Pruebas automatizadas')`,
      [tutorUserId, catalog.carrera_id, `QA-TUTOR-${suffix}`],
    )
    await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [tutorUserId, catalog.tutor_rol_id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function cleanup() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (projectId) {
      await client.query('DELETE FROM titulacion.asignaciones_proyecto WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.historial_estados WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.objetivos_especificos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    }
    const userIds = [studentUserId, tutorUserId].filter(Boolean)
    if (userIds.length > 0) {
      await client.query('DELETE FROM titulacion.sesiones_usuario WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.notificaciones WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.usuario_roles WHERE usuario_id = ANY($1::uuid[])', [userIds])
    }
    if (studentUserId) await client.query('DELETE FROM titulacion.estudiantes WHERE usuario_id = $1', [studentUserId])
    if (tutorUserId) await client.query('DELETE FROM titulacion.docentes WHERE usuario_id = $1', [tutorUserId])
    if (userIds.length > 0) await client.query('DELETE FROM titulacion.usuarios WHERE id = ANY($1::uuid[])', [userIds])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  if (projectId && storedPath) {
    const uploadRoot = path.resolve(process.cwd(), 'uploads', 'proyectos')
    const absolutePath = path.resolve(process.cwd(), storedPath)
    if (storedPath.startsWith(`uploads/proyectos/${projectId}/`) && absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
      await rm(path.dirname(absolutePath), { recursive: true, force: true })
    }
  }
}

try {
  await expect(await fetch(`${apiUrl}/api/tutor/dashboard`), 401, 'Protección del portal tutor')
  await setupUsers()

  const studentLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: studentEmail, password: studentPassword }),
  }), 200, 'Inicio de sesión del estudiante de QA')
  studentCookie = studentLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(studentCookie.startsWith('stit_session='), 'No se creó sesión para el estudiante')
  const studentBootstrap = await expect(await fetch(`${apiUrl}/api/student/bootstrap`, { headers: { Cookie: studentCookie } }), 200, 'Carga del Formulario 1')
  const studentData = await studentBootstrap.json()
  const tutor = studentData.tutors.find((item) => item.name === 'QA Tutor Temporal')
  assert.ok(tutor, 'El tutor temporal no se muestra en el formulario')

  const form = new FormData()
  form.set('managementId', studentData.managements[0].id)
  form.set('modalityId', studentData.modalities[0].id)
  form.set('tutorId', tutor.id)
  form.set('title', 'Proyecto de tutoría temporal para QA')
  form.set('description', 'Proyecto temporal para validar invitaciones, avisos y aceptación de tutoría.')
  form.set('generalObjective', 'Validar el flujo de tutoría y notificaciones.')
  form.set('objectives', JSON.stringify(['Comprobar que el tutor reciba la invitación.', 'Verificar la aceptación y el acceso al perfil.']))
  form.set('profile', new Blob([minimalDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'perfil-tutor-qa.docx')
  const registration = await expect(await fetch(`${apiUrl}/api/projects`, { method: 'POST', headers: { Cookie: studentCookie }, body: form }), 201, 'Registro de proyecto con invitación')
  const registered = await registration.json()
  projectId = registered.project.id
  const stored = await pool.query(
    `SELECT vd.ruta_archivo
     FROM titulacion.versiones_documento vd
     JOIN titulacion.documentos d ON d.id = vd.documento_id
     WHERE d.proyecto_id = $1`,
    [projectId],
  )
  storedPath = stored.rows[0].ruta_archivo
  await access(path.resolve(process.cwd(), storedPath))

  const tutorLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: tutorEmail, password: tutorPassword }),
  }), 200, 'Inicio de sesión del tutor de QA')
  tutorCookie = tutorLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  const tutorSession = await expect(await fetch(`${apiUrl}/api/auth/session`, { headers: { Cookie: tutorCookie } }), 200, 'Identificación del rol tutor')
  assert.equal((await tutorSession.json()).user.role, 'TUTOR', 'La sesión no se identificó como tutor')
  const dashboardBefore = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Bandeja de invitaciones')
  const tutorData = await dashboardBefore.json()
  assert.equal(tutorData.invitations.length, 1, 'La invitación no llegó al tutor')
  assert.equal(tutorData.unreadCount, 1, 'La campanita no cuenta la invitación')
  const invitation = tutorData.invitations[0]
  assert.equal(invitation.code, registered.project.code, 'La invitación corresponde a otro proyecto')
  assert.equal(tutorData.notifications[0].type, 'SOLICITUD_TUTORIA', 'No se creó el aviso interno de tutoría')
  await expect(await fetch(`${apiUrl}/api/notifications/${tutorData.notifications[0].id}/read`, {
    method: 'POST', headers: { Cookie: tutorCookie },
  }), 200, 'Marcado de notificación como leída')
  const notificationsAfterRead = await expect(await fetch(`${apiUrl}/api/notifications`, { headers: { Cookie: tutorCookie } }), 200, 'Consulta posterior de campanita')
  assert.equal((await notificationsAfterRead.json()).unreadCount, 0, 'La notificación no se marcó como leída')
  await expect(await fetch(`${apiUrl}/api/tutor/documents/${invitation.profile.documentId}/download`, { headers: { Cookie: tutorCookie } }), 404, 'Bloqueo del documento antes de aceptar')
  const forbiddenResponse = await fetch(`${apiUrl}/api/tutor/invitations/${invitation.id}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: studentCookie }, body: JSON.stringify({ decision: 'ACEPTAR' }),
  })
  await expect(await forbiddenResponse, 403, 'Bloqueo de respuesta ajena')
  const accepted = await expect(await fetch(`${apiUrl}/api/tutor/invitations/${invitation.id}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: tutorCookie }, body: JSON.stringify({ decision: 'ACEPTAR' }),
  }), 200, 'Aceptación de tutoría')
  assert.equal((await accepted.json()).decision, 'ACEPTAR', 'La aceptación no fue confirmada')
  const dashboardAfter = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Portal luego de aceptar')
  const acceptedData = await dashboardAfter.json()
  assert.equal(acceptedData.invitations.length, 0, 'La invitación continúa pendiente después de aceptarla')
  assert.equal(acceptedData.projects.length, 1, 'El proyecto no se habilitó para el tutor')
  const file = await expect(await fetch(`${apiUrl}/api/tutor/documents/${invitation.profile.documentId}/download`, { headers: { Cookie: tutorCookie } }), 200, 'Descarga del perfil por tutor confirmado')
  assert.ok((await file.arrayBuffer()).byteLength > 50, 'El perfil descargado por el tutor está vacío')
  const declinedAssignment = await pool.query(
    `INSERT INTO titulacion.asignaciones_proyecto
      (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, motivo_cambio)
     SELECT $1, d.id, 'TUTOR', $2, false, 'Solicitud temporal para validar declinación.'
     FROM titulacion.docentes d
     WHERE d.usuario_id = $3
     RETURNING id`,
    [projectId, studentUserId, tutorUserId],
  )
  const declinedId = declinedAssignment.rows[0].id
  await expect(await fetch(`${apiUrl}/api/tutor/invitations/${declinedId}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: tutorCookie }, body: JSON.stringify({ decision: 'DECLINAR', reason: 'No' }),
  }), 422, 'Validación de motivo al declinar')
  await expect(await fetch(`${apiUrl}/api/tutor/invitations/${declinedId}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: tutorCookie }, body: JSON.stringify({ decision: 'DECLINAR', reason: 'No cuento con disponibilidad durante esta gestión.' }),
  }), 200, 'Declinación de tutoría')
  const declinedState = await pool.query(
    `SELECT activo, fecha_fin, respondida_en, motivo_cambio
     FROM titulacion.asignaciones_proyecto
     WHERE id = $1`,
    [declinedId],
  )
  assert.equal(declinedState.rows[0].activo, false, 'La tutoría declinada quedó activa')
  assert.ok(declinedState.rows[0].fecha_fin && declinedState.rows[0].respondida_en, 'No se registró la respuesta de declinación')
  assert.match(declinedState.rows[0].motivo_cambio, /disponibilidad/, 'No se guardó el motivo de declinación')
  const studentNotifications = await expect(await fetch(`${apiUrl}/api/notifications`, { headers: { Cookie: studentCookie } }), 200, 'Aviso al estudiante')
  const studentNotificationData = await studentNotifications.json()
  assert.ok(studentNotificationData.notifications.some((item) => item.type === 'TUTORIA_ACEPTADA'), 'No se notificó al estudiante la aceptación')
  assert.ok(studentNotificationData.notifications.some((item) => item.type === 'TUTORIA_DECLINADA'), 'No se notificó al estudiante la declinación')
  const emailQueue = await pool.query(
    `SELECT count(*)::int AS total
     FROM titulacion.cola_correos_notificacion q
     JOIN titulacion.notificaciones n ON n.id = q.notificacion_id
     WHERE n.proyecto_id = $1 AND q.tipo = 'SOLICITUD_TUTORIA' AND q.estado = 'PENDIENTE'`,
    [projectId],
  )
  assert.equal(emailQueue.rows[0].total, 1, 'No se registró el aviso de correo pendiente')
  console.log(`QA tutor aprobado: invitación, campanita, aceptación, acceso y cola de correo verificados (${registered.project.code}).`)
} finally {
  if (studentCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: studentCookie } }).catch(() => undefined)
  if (tutorCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: tutorCookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
