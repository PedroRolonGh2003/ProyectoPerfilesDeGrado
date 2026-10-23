import 'dotenv/config'

import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import pg from 'pg'
import { runPendingReviewReminders } from './index.js'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const apiUrl = `http://127.0.0.1:${port}`
const pool = new Pool(process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    }
  : {
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
let tutorCookie = ''
let replacementTutorCookie = ''
let reviewer1Cookie = ''
let reviewer2Cookie = ''
let replacementReviewerCookie = ''

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function createAccount(client, { key, firstName, lastName, roleCode, profile }) {
  const email = `qa.admin.operations.${key.toLowerCase()}.${suffix}@univalle.edu`
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash, activo, email_confirmado_en)
     VALUES ($1, $2, $3, $4, true, now())
     RETURNING id`,
    [firstName, lastName, email, await bcrypt.hash(password, 10)],
  )
  const role = await client.query(`SELECT id FROM titulacion.roles WHERE codigo = $1 AND activo`, [roleCode])
  assert.ok(role.rows[0], `No existe el rol ${roleCode} para QA`)
  await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id, activo) VALUES ($1, $2, true)', [user.rows[0].id, role.rows[0].id])
  accounts[key] = { userId: user.rows[0].id, email, roleCode, teacherId: '', studentId: '' }
  if (profile.kind === 'student') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario, activo)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-ADMIN-OPS-${suffix}`],
    )
    accounts[key].studentId = student.rows[0].id
  }
  if (profile.kind === 'teacher') {
    const teacher = await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad, activo)
       VALUES ($1, $2, $3, 'Pruebas automatizadas', true)
       RETURNING id`,
      [user.rows[0].id, profile.careerId, `QA-AO-${key.toLowerCase().slice(0, 12)}-${suffix}`],
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
    await createAccount(client, { key: 'replacementTutor', firstName: 'QA', lastName: 'Tutor Reemplazo', roleCode: 'TUTOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer1', firstName: 'QA', lastName: 'Revisor Uno', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'reviewer2', firstName: 'QA', lastName: 'Revisor Dos', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })
    await createAccount(client, { key: 'replacementReviewer', firstName: 'QA', lastName: 'Revisor Reemplazo', roleCode: 'REVISOR', profile: { kind: 'teacher', careerId: values.career_id } })

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
  const tutorLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.tutor.email, password }) }), 200, 'Inicio de tutor de control')
  tutorCookie = tutorLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  const replacementTutorLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.replacementTutor.email, password }) }), 200, 'Inicio de tutor de reemplazo')
  replacementTutorCookie = replacementTutorLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  const reviewer1Login = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.reviewer1.email, password }) }), 200, 'Inicio del primer revisor')
  reviewer1Cookie = reviewer1Login.headers.get('set-cookie')?.split(';')[0] ?? ''
  const reviewer2Login = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.reviewer2.email, password }) }), 200, 'Inicio del segundo revisor')
  reviewer2Cookie = reviewer2Login.headers.get('set-cookie')?.split(';')[0] ?? ''
  const replacementReviewerLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: accounts.replacementReviewer.email, password }) }), 200, 'Inicio del revisor de reemplazo')
  replacementReviewerCookie = replacementReviewerLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: studentCookie } }), 403, 'Bloqueo operativo para estudiante')

  const detailBefore = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Carga de detalle administrativo')
  const before = await detailBefore.json()
  assert.equal(before.profiles[0].versionId, profileVersionId, 'El perfil no se muestra para programar revisión')
  assert.ok(before.staff.some((item) => item.id === accounts.reviewer1.teacherId) && before.staff.some((item) => item.id === accounts.reviewer2.teacherId), 'No se cargaron los revisores temporales')
  const dashboardBeforeAssignment = await expect(await fetch(`${apiUrl}/api/admin/dashboard`, { headers: { Cookie: adminCookie } }), 200, 'Bandeja de revisiones por iniciar antes de asignar revisores')
  assert.ok((await dashboardBeforeAssignment.json()).pendingReviewStarts.some((item) => item.id === projectId), 'El proyecto sin ronda no aparece en Revisiones por iniciar')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ title: 'Cambio no autorizado', description: 'Este cambio no debe poder aplicarse desde Administración.', generalObjective: 'Comprobar la protección de los datos del estudiante.' }) }), 403, 'Bloqueo de edición de datos del estudiante')

  const tutorAssignment = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/assignments`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ tutorId: accounts.tutor.teacherId }) }), 200, 'Invitación administrativa al tutor')
  assert.equal((await tutorAssignment.json()).changed, 1, 'No se registró la invitación al tutor')
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/reviewers`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ reviewer1Id: accounts.reviewer1.teacherId, reviewer2Id: accounts.reviewer2.teacherId }) }), 409, 'Bloqueo de revisores antes de aceptar tutoría')
  const tutorDashboard = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Bandeja de invitaciones del tutor')
  const invitation = (await tutorDashboard.json()).invitations.find((item) => item.projectId === projectId)
  assert.ok(invitation, 'La invitación no llegó al tutor')
  await expect(await fetch(`${apiUrl}/api/tutor/invitations/${invitation.id}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: tutorCookie }, body: JSON.stringify({ decision: 'ACEPTAR' }) }), 200, 'Aceptación de tutoría')
  const reviewersAssignment = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/reviewers`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ reviewer1Id: accounts.reviewer1.teacherId, reviewer2Id: accounts.reviewer2.teacherId }) }), 200, 'Asignación de los dos revisores')
  assert.equal((await reviewersAssignment.json()).changed, 2, 'No se registraron los dos revisores')
  const tutorAfterReviewerAssignment = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Notificación al tutor sobre los revisores asignados')
  assert.ok((await tutorAfterReviewerAssignment.json()).notifications.some((item) => item.type === 'REVISORES_ASIGNADOS_TUTOR' && item.link === '/tutor/proyectos'), 'El tutor no fue notificado sobre la asignación de revisores')
  const dashboardAfterAssignment = await expect(await fetch(`${apiUrl}/api/admin/dashboard`, { headers: { Cookie: adminCookie } }), 200, 'Actualización de Revisiones por iniciar tras asignar revisores')
  const projectReadyToStart = (await dashboardAfterAssignment.json()).pendingReviewStarts.find((item) => item.id === projectId)
  assert.ok(projectReadyToStart, 'El proyecto desapareció antes de crear la primera ronda')
  assert.equal(projectReadyToStart.canStartInitialReview, true, 'El proyecto con el equipo completo no quedó listo para programar la primera ronda')

  const round = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/review-rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ versionId: profileVersionId }) }), 201, 'Habilitación de ronda de revisión sin fecha límite')
  const roundPayload = await round.json()
  assert.ok(roundPayload.roundId, 'No se devolvió la ronda creada')
  const createdRound = await pool.query('SELECT fecha_limite FROM titulacion.rondas_revision WHERE id = $1', [roundPayload.roundId])
  assert.equal(createdRound.rows[0].fecha_limite, null, 'La ronda registró una fecha límite')
  const dashboardAfterRound = await expect(await fetch(`${apiUrl}/api/admin/dashboard`, { headers: { Cookie: adminCookie } }), 200, 'Actualización de Revisiones por iniciar tras crear la ronda')
  assert.ok(!(await dashboardAfterRound.json()).pendingReviewStarts.some((item) => item.id === projectId), 'El proyecto continúa en Revisiones por iniciar después de crear la primera ronda')
  const afterRound = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}`, { headers: { Cookie: adminCookie } }), 200, 'Seguimiento de ronda administrativa')
  const roundData = await afterRound.json()
  assert.equal(roundData.project.statusCode, 'EN_REVISION', 'El proyecto no pasó a EN_REVISION')
  assert.equal(roundData.project.phaseCode, 'REVISION_PERFIL', 'El proyecto no pasó a la fase de revisión de perfil')
  assert.equal(roundData.rounds[0].reviews.length, 3, 'La ronda no contiene las revisiones pendientes de tutor y revisores')
  const duplicateRound = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/review-rounds`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ versionId: profileVersionId }),
  }), 409, 'Bloqueo de habilitación duplicada de la primera revisión')
  assert.match((await duplicateRound.json()).message, /primera revisión/i, 'El bloqueo no explica que la primera revisión ya fue habilitada')

  await pool.query(`UPDATE titulacion.rondas_revision SET fecha_solicitud = now() - interval '49 hours' WHERE id = $1`, [roundPayload.roundId])
  await pool.query(`UPDATE titulacion.asignaciones_proyecto SET fecha_asignacion = now() - interval '49 hours', respondida_en = CASE WHEN tipo = 'TUTOR' THEN now() - interval '49 hours' ELSE respondida_en END WHERE proyecto_id = $1 AND activo`, [projectId])
  const reminderClient = await pool.connect()
  let remindersSent = 0
  let repeatedReminders = 0
  try {
    remindersSent = await runPendingReviewReminders({ databaseClient: reminderClient })
    repeatedReminders = await runPendingReviewReminders({ databaseClient: reminderClient })
  } finally {
    reminderClient.release()
  }
  assert.equal(remindersSent, 3, 'No se enviaron recordatorios a los tres dictámenes pendientes después de dos días')
  assert.equal(repeatedReminders, 0, 'Se repitieron recordatorios el mismo día')
  const reminders = await pool.query(
    `SELECT n.tipo, n.enlace
     FROM titulacion.notificaciones n
     WHERE n.proyecto_id = $1 AND n.tipo = 'RECORDATORIO_REVISION_PENDIENTE'`,
    [projectId],
  )
  assert.equal(reminders.rowCount, 3, 'Los recordatorios no quedaron registrados')
  assert.equal(reminders.rows.filter((item) => item.enlace === '/tutor/proyectos').length, 1, 'El recordatorio del tutor no dirige a Mis proyectos')
  assert.equal(reminders.rows.filter((item) => item.enlace === '/revisor/pendientes').length, 2, 'Los recordatorios de revisores no dirigen a Por revisar')

  const reviewer2Dashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: reviewer2Cookie } }), 200, 'Bandeja del segundo revisor antes de reasignar')
  const reviewer2Review = (await reviewer2Dashboard.json()).pendingReviews.find((item) => item.projectId === projectId)
  assert.ok(reviewer2Review, 'El segundo revisor no recibió su evaluación inicial')
  const approvedFormat = ['TITULO', 'INDICE', 'ORDEN_GUIA', 'FORMATO', 'NUMERO_HOJAS', 'ETAPAS_INVESTIGACION', 'CRONOGRAMA', 'CITAS', 'REFERENCIAS', 'REDACCION'].map((code) => ({ code, value: 'SI' }))
  const approvedBackground = ['PROBLEMA', 'JUSTIFICACION', 'FUENTES', 'ANALISIS_LITERATURA', 'PERSPECTIVA_TEORICA', 'VINCULO_TEORIA', 'VIABILIDAD_OBJETIVOS', 'COHERENCIA_OBJETIVOS', 'METODOLOGIA_PERTINENTE', 'METODOLOGIA_RESPONDE'].map((code) => ({ code, value: 'BUENO' }))
  await expect(await fetch(`${apiUrl}/api/reviewer/reviews/${reviewer2Review.id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: reviewer2Cookie },
    body: JSON.stringify({ decision: 'APROBADO', generalComment: 'La revisión de control cumple los criterios establecidos.', observations: [], formatCriteria: approvedFormat, backgroundCriteria: approvedBackground }),
  }), 200, 'Dictamen del segundo revisor antes de reasignar')

  const replacePendingReviewer = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/reviewers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ reviewer1Id: accounts.replacementReviewer.teacherId, reviewer2Id: accounts.reviewer2.teacherId }),
  }), 200, 'Reasignación de revisor pendiente durante una ronda')
  assert.equal((await replacePendingReviewer.json()).changed, 1, 'La reasignación pendiente no cambió al primer revisor')
  const formerReviewerDashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: reviewer1Cookie } }), 200, 'Bandeja del revisor reemplazado')
  assert.equal((await formerReviewerDashboard.json()).pendingReviews.filter((item) => item.projectId === projectId).length, 0, 'El revisor anterior todavía puede emitir el dictamen transferido')
  const replacementReviewerDashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: replacementReviewerCookie } }), 200, 'Bandeja del nuevo revisor')
  const replacementReviewerPayload = await replacementReviewerDashboard.json()
  assert.ok(replacementReviewerPayload.pendingReviews.some((item) => item.projectId === projectId && item.assignmentType === 'REVISOR_1'), 'El nuevo revisor no recibió la evaluación pendiente')
  assert.ok(replacementReviewerPayload.notifications.some((item) => item.type === 'REVISION_REASIGNADA' && item.link === '/revisor/pendientes'), 'La notificación no dirige al nuevo revisor a Pendientes')

  const replaceCompletedReviewer = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/reviewers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ reviewer1Id: accounts.replacementReviewer.teacherId, reviewer2Id: accounts.reviewer1.teacherId }),
  }), 200, 'Reasignación de revisor con dictamen emitido')
  assert.equal((await replaceCompletedReviewer.json()).changed, 1, 'La reasignación para rondas posteriores no cambió al segundo revisor')
  const completedReviewerDashboard = await expect(await fetch(`${apiUrl}/api/reviewer/dashboard`, { headers: { Cookie: reviewer2Cookie } }), 200, 'Historial del revisor reemplazado después de dictaminar')
  assert.ok((await completedReviewerDashboard.json()).completedReviews.some((item) => item.projectId === projectId && item.decision === 'APROBADO'), 'El dictamen ya emitido no se conservó para trazabilidad')

  const replacementTutor = await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/assignments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ tutorId: accounts.replacementTutor.teacherId }),
  }), 200, 'Propuesta de reemplazo de tutor durante una ronda')
  assert.equal((await replacementTutor.json()).changed, 1, 'No se creó la invitación al tutor de reemplazo')
  const originalTutorBeforeAcceptance = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Conservación de la evaluación para el tutor actual')
  assert.ok((await originalTutorBeforeAcceptance.json()).projects.some((item) => item.projectId === projectId && item.canReviewProfile), 'El tutor actual perdió la evaluación antes de que el reemplazo aceptara')
  const replacementTutorDashboard = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: replacementTutorCookie } }), 200, 'Invitación del tutor de reemplazo')
  const tutorInvitation = (await replacementTutorDashboard.json()).invitations.find((item) => item.projectId === projectId)
  assert.ok(tutorInvitation, 'El tutor de reemplazo no recibió la invitación')
  await expect(await fetch(`${apiUrl}/api/tutor/invitations/${tutorInvitation.id}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: replacementTutorCookie },
    body: JSON.stringify({ decision: 'ACEPTAR' }),
  }), 200, 'Aceptación del tutor de reemplazo')
  const originalTutorAfterAcceptance = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: tutorCookie } }), 200, 'Retiro de la evaluación del tutor anterior')
  assert.ok(!(await originalTutorAfterAcceptance.json()).projects.some((item) => item.projectId === projectId), 'El tutor anterior conserva acceso después de la reasignación')
  const acceptedReplacementTutor = await expect(await fetch(`${apiUrl}/api/tutor/dashboard`, { headers: { Cookie: replacementTutorCookie } }), 200, 'Evaluación para el tutor de reemplazo')
  const acceptedReplacementTutorPayload = await acceptedReplacementTutor.json()
  assert.ok(acceptedReplacementTutorPayload.projects.some((item) => item.projectId === projectId && item.canReviewProfile), 'El tutor de reemplazo no recibió la evaluación pendiente')
  assert.ok(acceptedReplacementTutorPayload.notifications.some((item) => item.type === 'REVISION_TUTOR_REASIGNADA' && item.link === '/tutor/proyectos'), 'La notificación no dirige al tutor a Mis proyectos')
  const transferState = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE decision = 'PENDIENTE')::int AS pending,
            count(*) FILTER (WHERE decision = 'APROBADO')::int AS approved
     FROM titulacion.revisiones r
     JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     JOIN titulacion.documentos d ON d.id = vd.documento_id
     WHERE d.proyecto_id = $1 AND rr.cerrada_en IS NULL`,
    [projectId],
  )
  assert.deepEqual(transferState.rows[0], { total: 3, pending: 2, approved: 1 }, 'La ronda cambió su cantidad de dictámenes al reasignar responsables')
  console.log('QA reasignación aprobado: revisión pendiente transferida, dictamen emitido conservado y tutor reemplazado sin bloquear la ronda.')

  const stateBeforeManualChange = await pool.query(
    `SELECT ep.codigo AS status_code, f.codigo AS phase_code
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     JOIN titulacion.fases f ON f.id = p.fase_actual_id
     WHERE p.id = $1`,
    [projectId],
  )
  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ statusCode: 'OBSERVADO', phaseCode: 'REVISION_PERFIL', reason: 'QA intenta cambiar manualmente el estado.' }) }), 403, 'Bloqueo del cambio manual de fase y estado')
  const stateAfterManualChange = await pool.query(
    `SELECT ep.codigo AS status_code, f.codigo AS phase_code
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     JOIN titulacion.fases f ON f.id = p.fase_actual_id
     WHERE p.id = $1`,
    [projectId],
  )
  assert.deepEqual(stateAfterManualChange.rows[0], stateBeforeManualChange.rows[0], 'El cambio manual alteró la fase o el estado del proyecto')

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
  console.log('QA operaciones administrativas aprobado: asignación, aviso al tutor, ronda sin fecha límite, recordatorios, bloqueo del cambio manual y anulación verificados.')
} finally {
  if (adminCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: adminCookie } }).catch(() => undefined)
  if (studentCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: studentCookie } }).catch(() => undefined)
  if (tutorCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: tutorCookie } }).catch(() => undefined)
  if (replacementTutorCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: replacementTutorCookie } }).catch(() => undefined)
  if (reviewer1Cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: reviewer1Cookie } }).catch(() => undefined)
  if (reviewer2Cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: reviewer2Cookie } }).catch(() => undefined)
  if (replacementReviewerCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: replacementReviewerCookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
