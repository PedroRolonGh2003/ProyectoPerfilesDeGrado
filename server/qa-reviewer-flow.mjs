import 'dotenv/config'

import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
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
const password = 'ReviewerFlowQA-2026'
const accounts = {}
let projectId = ''
let documentId = ''
let versionId = ''
let storedPath = ''
let cookies = {}

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function createAccount(client, { key, roleCode, profile }) {
  const email = `qa.reviewer.${key}.${suffix}@univalle.edu`
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
     VALUES ('QA', $1, $2, $3)
     RETURNING id`,
    [`Revisión ${key}`, email, await bcrypt.hash(password, 10)],
  )
  const role = await client.query(`SELECT id FROM titulacion.roles WHERE codigo = $1 AND activo`, [roleCode])
  assert.ok(role.rows[0], `No existe el rol ${roleCode} para QA`)
  await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [user.rows[0].id, role.rows[0].id])
  accounts[key] = { userId: user.rows[0].id, email, studentId: '', teacherId: '' }
  if (profile.kind === 'student') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-REV-S-${suffix}`],
    )
    accounts[key].studentId = student.rows[0].id
  }
  if (profile.kind === 'teacher') {
    const teacher = await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad)
       VALUES ($1, $2, $3, 'Pruebas automatizadas')
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-REV-${key}-${suffix}`],
    )
    accounts[key].teacherId = teacher.rows[0].id
  }
}

async function setup() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const catalog = await client.query(
      `SELECT
         (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS career_id,
         (SELECT g.id FROM titulacion.gestiones g JOIN titulacion.carreras c ON c.id = g.carrera_id WHERE c.codigo = 'SIS' AND g.activa ORDER BY g.fecha_inicio DESC LIMIT 1) AS management_id,
         (SELECT m.id FROM titulacion.modalidades_titulacion m JOIN titulacion.carreras c ON c.id = m.carrera_id WHERE c.codigo = 'SIS' AND m.activa ORDER BY m.codigo LIMIT 1) AS modality_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'REGISTRO') AS registration_phase_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'REGISTRADO') AS registered_state_id`,
    )
    const values = catalog.rows[0]
    assert.ok(Object.values(values).every(Boolean), 'Faltan catálogos para QA del revisor')
    await createAccount(client, { key: 'admin', roleCode: 'ADMINISTRADOR', profile: { kind: 'none' } })
    await createAccount(client, { key: 'student', roleCode: 'ESTUDIANTE', profile: { kind: 'student', careerId: values.career_id } })
    await createAccount(client, { key: 'tutor', roleCode: 'TUTOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer1', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer2', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })

    const project = await client.query(
      `INSERT INTO titulacion.proyectos
        (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id, titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [`QA-REVIEW-${suffix}`, values.management_id, values.modality_id, values.registration_phase_id, values.registered_state_id, 'Proyecto temporal para QA de Revisor', 'Proyecto temporal que valida la bandeja y el dictamen de revisión.', 'Comprobar que los dictámenes cierran correctamente la ronda.', accounts.student.userId],
    )
    projectId = project.rows[0].id
    await client.query('INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal) VALUES ($1, $2, true)', [projectId, accounts.student.studentId])
    const document = await client.query(
      `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
       VALUES ($1, $2, 'Perfil QA Revisor', 'PERFIL_PROYECTO', $3)
       RETURNING id`,
      [projectId, values.registration_phase_id, accounts.student.userId],
    )
    documentId = document.rows[0].id
    storedPath = `uploads/proyectos/${projectId}/perfil-qa-revisor.docx`
    const version = await client.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, 1, 'perfil-qa-revisor.docx', $2, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 96, $3, $4, 'Perfil temporal de QA.')
       RETURNING id`,
      [documentId, storedPath, crypto.createHash('sha256').update(suffix).digest('hex'), accounts.student.userId],
    )
    versionId = version.rows[0].id
    await client.query('COMMIT')
    const absolutePath = path.resolve(process.cwd(), storedPath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, Buffer.from('Perfil temporal de QA para validar descarga segura.'))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function login(key) {
  const response = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: accounts[key].email, password }),
  }), 200, `Inicio de sesión ${key}`)
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(cookie.startsWith('stit_session='), `No se creó la sesión de ${key}`)
  cookies[key] = cookie
}

async function cleanup() {
  const userIds = Object.values(accounts).map((account) => account.userId).filter(Boolean)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (projectId) {
      await client.query('DELETE FROM titulacion.auditoria WHERE proyecto_id = $1', [projectId])
      await client.query(`DELETE FROM titulacion.observaciones WHERE revision_id IN (SELECT r.id FROM titulacion.revisiones r JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = $1)`, [projectId])
      await client.query(`DELETE FROM titulacion.revisiones WHERE ronda_revision_id IN (SELECT rr.id FROM titulacion.rondas_revision rr JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = $1)`, [projectId])
      await client.query(`DELETE FROM titulacion.rondas_revision WHERE version_documento_id IN (SELECT vd.id FROM titulacion.versiones_documento vd JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = $1)`, [projectId])
      await client.query('DELETE FROM titulacion.asignaciones_proyecto WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.historial_estados WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.cola_correos_notificacion WHERE notificacion_id IN (SELECT id FROM titulacion.notificaciones WHERE proyecto_id = $1)', [projectId])
      await client.query('DELETE FROM titulacion.notificaciones WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    }
    if (userIds.length > 0) {
      await client.query('DELETE FROM titulacion.auditoria WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.cola_correos_notificacion WHERE notificacion_id IN (SELECT id FROM titulacion.notificaciones WHERE usuario_id = ANY($1::uuid[]))', [userIds])
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
  if (storedPath && projectId) {
    const uploadRoot = path.resolve(process.cwd(), 'uploads', 'proyectos')
    const absolutePath = path.resolve(process.cwd(), storedPath)
    if (storedPath.startsWith(`uploads/proyectos/${projectId}/`) && absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
      await rm(path.dirname(absolutePath), { recursive: true, force: true })
    }
  }
}

try {
  await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`), 401, 'Protección del portal de revisor')
  await setup()
  for (const key of ['admin', 'student', 'reviewer1', 'reviewer2']) await login(key)
  await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: cookies.student } }), 403, 'Bloqueo del portal para estudiante')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/assignments`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookies.admin },
    body: JSON.stringify({ tutorId: accounts.tutor.teacherId, reviewer1Id: accounts.reviewer1.teacherId, reviewer2Id: accounts.reviewer2.teacherId }),
  }), 200, 'Asignación administrativa de responsables')
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/review-rounds`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.admin },
    body: JSON.stringify({ versionId, deadline }),
  }), 201, 'Creación de ronda de revisión')

  const dashboardResponse = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: cookies.reviewer1 } }), 200, 'Carga de bandeja de revisor')
  const dashboard = await dashboardResponse.json()
  assert.equal(dashboard.user.role, 'REVISOR', 'La sesión no se identificó como revisor')
  assert.equal(dashboard.pendingReviews.length, 1, 'La revisión asignada no aparece en la bandeja')
  assert.equal(dashboard.pendingReviews[0].profile.versionId, versionId, 'La bandeja muestra una versión de perfil incorrecta')
  assert.ok(dashboard.unreadCount >= 1 && dashboard.notifications.some((item) => item.type === 'REVISION_ASIGNADA'), 'La notificación de asignación no aparece en la campanita')
  await expect(await fetch(`${apiUrl}/api/reviewer/documents/${documentId}/download?version=${versionId}`, { headers: { Cookie: cookies.reviewer1 } }), 200, 'Descarga segura por revisor asignado')
  await expect(await fetch(`${apiUrl}/api/reviewer/documents/${documentId}/download?version=${versionId}`, { headers: { Cookie: cookies.student } }), 403, 'Bloqueo de documento para estudiante')

  const review1 = dashboard.pendingReviews[0]
  await expect(await fetch(`${apiUrl}/api/reviewer/reviews/${review1.id}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.reviewer1 },
    body: JSON.stringify({ decision: 'OBSERVADO', generalComment: 'El perfil requiere correcciones de forma y alcance.', observations: ['Precisar el objetivo general.', 'Completar la justificación del problema.'] }),
  }), 200, 'Registro de observaciones del primer revisor')
  const afterFirst = await pool.query(
    `SELECT ep.codigo AS status, rr.cerrada_en, (SELECT count(*)::int FROM titulacion.observaciones o JOIN titulacion.revisiones r ON r.id = o.revision_id WHERE r.id = $2) AS observations
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     JOIN titulacion.documentos d ON d.proyecto_id = p.id
     JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
     JOIN titulacion.rondas_revision rr ON rr.version_documento_id = vd.id
     WHERE p.id = $1`,
    [projectId, review1.id],
  )
  assert.equal(afterFirst.rows[0].status, 'EN_REVISION', 'La ronda se cerró antes del dictamen del segundo revisor')
  assert.equal(afterFirst.rows[0].cerrada_en, null, 'La ronda no debe cerrarse con un solo dictamen')
  assert.equal(afterFirst.rows[0].observations, 2, 'No se guardaron las observaciones del revisor')
  await expect(await fetch(`${apiUrl}/api/reviewer/reviews/${review1.id}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.reviewer1 },
    body: JSON.stringify({ decision: 'OBSERVADO', observations: ['No debe duplicarse.'] }),
  }), 409, 'Bloqueo de segundo dictamen')

  const reviewer2Dashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: cookies.reviewer2 } }), 200, 'Bandeja del segundo revisor')
  const review2 = (await reviewer2Dashboard.json()).pendingReviews[0]
  await expect(await fetch(`${apiUrl}/api/reviewer/reviews/${review2.id}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.reviewer2 },
    body: JSON.stringify({ decision: 'APROBADO', generalComment: 'El perfil cumple con los criterios revisados.', observations: [] }),
  }), 200, 'Aprobación del segundo revisor')
  const finalState = await pool.query(
    `SELECT ep.codigo AS status, f.codigo AS phase, rr.cerrada_en,
            (SELECT count(*)::int FROM titulacion.cola_correos_notificacion q JOIN titulacion.notificaciones n ON n.id = q.notificacion_id WHERE n.proyecto_id = p.id AND n.tipo = 'REVISION_DEVUELTA') AS email_queue
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     JOIN titulacion.fases f ON f.id = p.fase_actual_id
     JOIN titulacion.documentos d ON d.proyecto_id = p.id
     JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
     JOIN titulacion.rondas_revision rr ON rr.version_documento_id = vd.id
     WHERE p.id = $1`,
    [projectId],
  )
  assert.equal(finalState.rows[0].status, 'OBSERVADO', 'El perfil observado no se devolvió al estudiante')
  assert.equal(finalState.rows[0].phase, 'REGISTRO', 'El perfil devuelto no habilitó la fase de corrección')
  assert.ok(finalState.rows[0].cerrada_en, 'La ronda no se cerró al recibir ambos dictámenes')
  assert.equal(finalState.rows[0].email_queue, 1, 'No se encoló el aviso por correo al devolver el perfil')
  const completedDashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: cookies.reviewer1 } }), 200, 'Historial del primer revisor')
  assert.equal((await completedDashboard.json()).completedReviews.length, 1, 'El dictamen no pasó al historial del revisor')
  console.log('QA revisor aprobado: bandeja, descarga, dictamen, cierre de ronda y correo en cola verificados.')
} finally {
  for (const cookie of Object.values(cookies)) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
