import 'dotenv/config'

import assert from 'node:assert/strict'
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
const password = 'AdminOperationsQA-2026'
const accounts = {}
let projectId = ''
let profileDocumentId = ''
let profileVersionId = ''
let adminCookie = ''
let studentCookie = ''

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function createAccount(client, { key, firstName, lastName, roleCode, profile }) {
  const email = `qa.admin.operations.${key}.${suffix}@univalle.edu`
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [firstName, lastName, email, await bcrypt.hash(password, 10)],
  )
  const role = await client.query(`SELECT id FROM titulacion.roles WHERE codigo = $1 AND activo`, [roleCode])
  assert.ok(role.rows[0], `No existe el rol ${roleCode} para QA`)
  await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [user.rows[0].id, role.rows[0].id])
  accounts[key] = { userId: user.rows[0].id, email, roleCode, teacherId: '', studentId: '' }
  if (profile.kind === 'student') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-ADMIN-OPS-${suffix}`],
    )
    accounts[key].studentId = student.rows[0].id
  }
  if (profile.kind === 'teacher') {
    const teacher = await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad)
       VALUES ($1, $2, $3, 'Pruebas automatizadas')
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-AO-${key}-${suffix}`],
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
    assert.ok(Object.values(values).every(Boolean), 'Faltan catálogos para QA de operaciones administrativas')
    await createAccount(client, { key: 'admin', firstName: 'QA', lastName: 'Administración Operativa', roleCode: 'ADMINISTRADOR', profile: { kind: 'none' } })
    await createAccount(client, { key: 'student', firstName: 'QA', lastName: 'Estudiante Operativo', roleCode: 'ESTUDIANTE', profile: { kind: 'student', careerId: values.career_id } })
    await createAccount(client, { key: 'tutor', firstName: 'QA', lastName: 'Tutor Operativo', roleCode: 'TUTOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer1', firstName: 'QA', lastName: 'Revisor Uno', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer2', firstName: 'QA', lastName: 'Revisor Dos', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })

    const project = await client.query(
      `INSERT INTO titulacion.proyectos
        (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id, titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [`QA-ADMIN-OPS-${suffix}`, values.management_id, values.modality_id, values.registration_phase_id, values.registered_state_id, 'Proyecto temporal para QA de Administración', 'Proyecto temporal usado únicamente para validar asignaciones, rondas, estados y anulación.', 'Comprobar el flujo operativo completo de Administración.', accounts.student.userId],
    )
    projectId = project.rows[0].id
    await client.query('INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal) VALUES ($1, $2, true)', [projectId, accounts.student.studentId])
    const document = await client.query(
      `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
       VALUES ($1, $2, 'Perfil QA Operaciones', 'PERFIL_PROYECTO', $3)
       RETURNING id`,
      [projectId, values.registration_phase_id, accounts.student.userId],
    )
    profileDocumentId = document.rows[0].id
    const version = await client.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, 1, 'perfil-qa-operaciones.docx', $2, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 128, $3, $4, 'Versión temporal de QA.')
       RETURNING id`,
      [profileDocumentId, `uploads/proyectos/${projectId}/perfil-qa-operaciones.docx`, crypto.createHash('sha256').update(suffix).digest('hex'), accounts.student.userId],
    )
    profileVersionId = version.rows[0].id
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
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
      await client.query('DELETE FROM titulacion.anulaciones_proyecto WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.notificaciones WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    }
    if (userIds.length > 0) {
      await client.query('DELETE FROM titulacion.auditoria WHERE usuario_id = ANY($1::uuid[])', [userIds])
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
  await expect(await fetch(`${apiUrl}/api/admin/projects/not-a-uuid`), 401, 'Protección de detalle administrativo')
  await setup()

  const adminLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.admin.email, password }) }), 200, 'Inicio de Administración')
  adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  const studentLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.student.email, password }) }), 200, 'Inicio de estudiante de control')
  studentCookie = studentLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: studentCookie } }), 403, 'Bloqueo operativo para estudiante')

  const detailBefore = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Carga de detalle administrativo')
  const before = await detailBefore.json()
  assert.equal(before.profiles[0].versionId, profileVersionId, 'El perfil no se muestra para programar revisión')
  assert.ok(before.staff.some((item) => item.id === accounts.reviewer1.teacherId) && before.staff.some((item) => item.id === accounts.reviewer2.teacherId), 'No se cargaron los revisores temporales')

  const updatedTitle = 'Proyecto temporal actualizado por QA de Administración'
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ title: updatedTitle, description: 'Descripción actualizada por la prueba automatizada de gestión administrativa.', generalObjective: 'Verificar la actualización auditable de los datos del proyecto.' }) }), 200, 'Actualización de datos del proyecto')
  const updatedData = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Consulta posterior de datos actualizados')
  assert.equal((await updatedData.json()).project.title, updatedTitle, 'La actualización del título no llegó a PostgreSQL')

  const assignments = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ tutorId: accounts.tutor.teacherId, reviewer1Id: accounts.reviewer1.teacherId, reviewer2Id: accounts.reviewer2.teacherId }) }), 200, 'Asignación de tutor y revisores')
  assert.ok((await assignments.json()).changed >= 3, 'No se registraron los tres responsables')

  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const round = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/review-rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ versionId: profileVersionId, deadline }) }), 201, 'Programación de ronda de revisión')
  assert.ok((await round.json()).roundId, 'No se devolvió la ronda creada')
  const afterRound = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Seguimiento de ronda administrativa')
  const roundData = await afterRound.json()
  assert.equal(roundData.project.statusCode, 'EN_REVISION', 'El proyecto no pasó a EN_REVISION')
  assert.equal(roundData.project.phaseCode, 'REVISION_PERFIL', 'El proyecto no pasó a la fase de revisión de perfil')
  assert.equal(roundData.rounds[0].reviews.length, 2, 'La ronda no contiene las dos revisiones pendientes')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ statusCode: 'OBSERVADO', phaseCode: 'REVISION_PERFIL', reason: 'QA confirma el cambio trazable de estado.' }) }), 200, 'Cambio trazable de estado')
  const state = await pool.query(`SELECT ep.codigo FROM titulacion.proyectos p JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id WHERE p.id = $1`, [projectId])
  assert.equal(state.rows[0].codigo, 'OBSERVADO', 'El cambio de estado no llegó a PostgreSQL')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ reason: 'QA de anulación', detail: 'Prueba temporal de anulación y cierre de responsables y rondas.' }) }), 200, 'Anulación administrativa')
  const cancelled = await pool.query(
    `SELECT ep.codigo, (SELECT count(*)::int FROM titulacion.asignaciones_proyecto WHERE proyecto_id = p.id AND activo) AS active_assignments,
            (SELECT count(*)::int FROM titulacion.rondas_revision rr JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = p.id AND rr.cerrada_en IS NULL) AS open_rounds,
            (SELECT count(*)::int FROM titulacion.anulaciones_proyecto WHERE proyecto_id = p.id) AS cancellations
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     WHERE p.id = $1`,
    [projectId],
  )
  assert.deepEqual(cancelled.rows[0], { codigo: 'ANULADO', active_assignments: 0, open_rounds: 0, cancellations: 1 }, 'La anulación no cerró correctamente el flujo')
  console.log('QA operaciones administrativas aprobado: asignación, ronda, estado y anulación verificados.')
} finally {
  if (adminCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: adminCookie } }).catch(() => undefined)
  if (studentCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: studentCookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
