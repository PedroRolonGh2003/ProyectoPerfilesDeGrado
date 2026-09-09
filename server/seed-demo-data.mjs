import 'dotenv/config'

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const demoPassword = 'DemoUnivalle!2026'
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: '-c search_path=titulacion,public',
})

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

function crc32(buffer) {
  let checksum = 0xffffffff
  for (const byte of buffer) {
    checksum ^= byte
    for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0)
  }
  return (checksum ^ 0xffffffff) >>> 0
}

function profileDocx(title) {
  const entries = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['word/document.xml', `<document><body><p>Perfil de grado - ${title}</p></body></document>`],
  ]
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

async function createNotification(client, { userId, email, projectId, type, title, message, link, queueEmail = false }) {
  const notification = await client.query(
    `INSERT INTO titulacion.notificaciones (usuario_id, proyecto_id, tipo, titulo, mensaje, enlace)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, projectId, type, title, message, link],
  )
  if (queueEmail) {
    await client.query(
      `INSERT INTO titulacion.cola_correos_notificacion (notificacion_id, destinatario, tipo, asunto, cuerpo)
       VALUES ($1, $2, $3, $4, $5)`,
      [notification.rows[0].id, email, type, title, message],
    )
  }
}

async function createAccount(client, { email, firstName, lastName, roleId, careerId, role, code }) {
  const alreadyExists = await client.query('SELECT id FROM titulacion.usuarios WHERE lower(correo) = lower($1)', [email])
  if (alreadyExists.rows[0]) throw new Error(`El usuario de demostracion ${email} ya existe. No se sobrescribio ningun dato.`)
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [firstName, lastName, email, await bcrypt.hash(demoPassword, 10)],
  )
  await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [user.rows[0].id, roleId])
  const account = { id: user.rows[0].id, email, studentId: null, teacherId: null, name: `${firstName} ${lastName}` }
  if (role === 'ESTUDIANTE') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [account.id, careerId, code],
    )
    account.studentId = student.rows[0].id
  }
  if (role === 'DOCENTE') {
    const teacher = await client.query(
      `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad)
       VALUES ($1, $2, $3, 'Seguimiento y evaluacion de perfiles de grado')
       RETURNING id`,
      [account.id, careerId, code],
    )
    account.teacherId = teacher.rows[0].id
  }
  return account
}

async function assign(client, { projectId, teacherId, type, adminId, active = true, deadline = null, answered = true, detail }) {
  const assignment = await client.query(
    `INSERT INTO titulacion.asignaciones_proyecto
      (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, fecha_limite, respondida_en, motivo_cambio)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN now() ELSE NULL END, $8)
     RETURNING id`,
    [projectId, teacherId, type, adminId, active, deadline, answered, detail],
  )
  return assignment.rows[0].id
}

async function createProject(client, { code, title, description, objective, student, phaseId, stateId, managementId, modalityId, files }) {
  const project = await client.query(
    `INSERT INTO titulacion.proyectos
      (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id, titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [code, managementId, modalityId, phaseId, stateId, title, description, objective, student.id],
  )
  const projectId = project.rows[0].id
  await client.query('INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal) VALUES ($1, $2, true)', [projectId, student.studentId])
  for (const [index, item] of ['Delimitar el alcance academico.', 'Validar los requisitos funcionales.', 'Documentar resultados y conclusiones.'].entries()) {
    await client.query('INSERT INTO titulacion.objetivos_especificos (proyecto_id, numero, descripcion) VALUES ($1, $2, $3)', [projectId, index + 1, item])
  }
  const document = await client.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1, $2, $3, 'PERFIL_PROYECTO', $4)
     RETURNING id`,
    [projectId, phaseId, `Perfil de ${title}`, student.id],
  )
  const documentId = document.rows[0].id
  const versions = []
  const totalVersions = code === 'DEMO-2026-002' ? 2 : 1
  for (let number = 1; number <= totalVersions; number += 1) {
    const filename = `perfil-${code.toLowerCase()}-v${number}.docx`
    const relativePath = path.posix.join('uploads', 'proyectos', projectId, filename)
    const content = profileDocx(`${title} - Version ${number}`)
    const version = await client.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, $2, $3, $4, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', $5, $6, $7, $8)
       RETURNING id`,
      [documentId, number, filename, relativePath, content.length, crypto.createHash('sha256').update(content).digest('hex'), student.id, number === 1 ? 'Perfil inicial de demostracion.' : 'Correcciones aplicadas despues de la revision.'],
    )
    files.push({ relativePath, content })
    versions.push(version.rows[0].id)
  }
  return { id: projectId, documentId, versions }
}

async function moveProject(client, { projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason }) {
  await client.query(
    `INSERT INTO titulacion.historial_estados
      (proyecto_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason],
  )
}

const client = await pool.connect()
const files = []
const demoDirectories = new Set()

try {
  const existing = await client.query(`SELECT count(*)::int AS total FROM titulacion.proyectos WHERE codigo_seguimiento LIKE 'DEMO-2026-%'`)
  if (existing.rows[0].total > 0) {
    console.log(JSON.stringify({ created: false, message: 'Los datos DEMO-2026 ya existen; no se duplicaron.' }))
  } else {
    await client.query('BEGIN')
    const catalog = await client.query(
      `SELECT
         (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS career_id,
         (SELECT id FROM titulacion.gestiones WHERE carrera_id = (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AND activa ORDER BY fecha_inicio DESC NULLS LAST LIMIT 1) AS management_id,
         (SELECT id FROM titulacion.modalidades_titulacion WHERE carrera_id = (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AND codigo = 'PROYECTO_GRADO' AND activa) AS modality_id,
         (SELECT id FROM titulacion.roles WHERE codigo = 'ADMINISTRADOR' AND activo) AS admin_role_id,
         (SELECT id FROM titulacion.roles WHERE codigo = 'ESTUDIANTE' AND activo) AS student_role_id,
         (SELECT id FROM titulacion.roles WHERE codigo = 'TUTOR' AND activo) AS tutor_role_id,
         (SELECT id FROM titulacion.roles WHERE codigo = 'REVISOR' AND activo) AS reviewer_role_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'REGISTRO' AND activa) AS registration_phase_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'REVISION_PERFIL' AND activa) AS review_phase_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'APROBACION_PERFIL' AND activa) AS approval_phase_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'REGISTRADO') AS registered_state_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_REVISION') AS review_state_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'OBSERVADO') AS observed_state_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'PENDIENTE_APROBACION') AS approval_state_id`,
    )
    const values = catalog.rows[0]
    if (!Object.values(values).every(Boolean)) throw new Error('Faltan catalogos activos necesarios para generar la demostracion.')

    const admin = await createAccount(client, { email: 'admin.demo@univalle.edu', firstName: 'Andrea', lastName: 'Administracion', roleId: values.admin_role_id, careerId: values.career_id, role: 'ADMINISTRADOR', code: 'ADM-DEMO-2026' })
    const student1 = await createAccount(client, { email: 'estudiante.demo.1@univalle.edu', firstName: 'Camila', lastName: 'Mendoza', roleId: values.student_role_id, careerId: values.career_id, role: 'ESTUDIANTE', code: 'DEMO-EST-001' })
    const student2 = await createAccount(client, { email: 'estudiante.demo.2@univalle.edu', firstName: 'Diego', lastName: 'Rojas', roleId: values.student_role_id, careerId: values.career_id, role: 'ESTUDIANTE', code: 'DEMO-EST-002' })
    const student3 = await createAccount(client, { email: 'estudiante.demo.3@univalle.edu', firstName: 'Elena', lastName: 'Vargas', roleId: values.student_role_id, careerId: values.career_id, role: 'ESTUDIANTE', code: 'DEMO-EST-003' })
    const student4 = await createAccount(client, { email: 'estudiante.demo.4@univalle.edu', firstName: 'Marco', lastName: 'Soria', roleId: values.student_role_id, careerId: values.career_id, role: 'ESTUDIANTE', code: 'DEMO-EST-004' })
    const tutor1 = await createAccount(client, { email: 'tutor.demo.ana@univalle.edu', firstName: 'Ana', lastName: 'Quiroga', roleId: values.tutor_role_id, careerId: values.career_id, role: 'DOCENTE', code: 'DEMO-TUT-001' })
    const tutor2 = await createAccount(client, { email: 'tutor.demo.luis@univalle.edu', firstName: 'Luis', lastName: 'Fernandez', roleId: values.tutor_role_id, careerId: values.career_id, role: 'DOCENTE', code: 'DEMO-TUT-002' })
    const reviewer1 = await client.query(
      `SELECT u.id AS user_id, u.correo AS email, d.id AS teacher_id, trim(concat(u.nombres, ' ', u.apellidos)) AS name
       FROM titulacion.usuarios u
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.codigo = 'REVISOR' AND r.activo
       JOIN titulacion.docentes d ON d.usuario_id = u.id AND d.activo
       WHERE lower(u.correo) = 'revisor.pruebas@univalle.edu' AND u.activo`,
    )
    if (!reviewer1.rows[0]) throw new Error('No se encontro el revisor.pruebas@univalle.edu creado para la demostracion.')
    const reviewer2 = await createAccount(client, { email: 'revisor.demo.2@univalle.edu', firstName: 'Sofia', lastName: 'Ledezma', roleId: values.reviewer_role_id, careerId: values.career_id, role: 'DOCENTE', code: 'DEMO-REV-002' })
    const reviewer3 = await createAccount(client, { email: 'revisor.demo.3@univalle.edu', firstName: 'Pablo', lastName: 'Cabrera', roleId: values.reviewer_role_id, careerId: values.career_id, role: 'DOCENTE', code: 'DEMO-REV-003' })
    const revisorPruebas = { id: reviewer1.rows[0].user_id, email: reviewer1.rows[0].email, teacherId: reviewer1.rows[0].teacher_id, name: reviewer1.rows[0].name }

    const project1 = await createProject(client, {
      code: 'DEMO-2026-001', title: 'Sistema de seguimiento para practicas profesionales', student: student1,
      description: 'Plataforma para centralizar el registro, seguimiento y evaluacion de practicas profesionales.', objective: 'Desarrollar un sistema web para gestionar practicas profesionales de manera trazable.',
      phaseId: values.registration_phase_id, stateId: values.registered_state_id, managementId: values.management_id, modalityId: values.modality_id, files,
    })
    const project2 = await createProject(client, {
      code: 'DEMO-2026-002', title: 'Analitica de indicadores academicos', student: student2,
      description: 'Tablero de indicadores para apoyar el analisis de rendimiento y permanencia estudiantil.', objective: 'Implementar analitica visual para indicadores academicos prioritarios.',
      phaseId: values.registration_phase_id, stateId: values.registered_state_id, managementId: values.management_id, modalityId: values.modality_id, files,
    })
    const project3 = await createProject(client, {
      code: 'DEMO-2026-003', title: 'Gestion de laboratorios de computacion', student: student3,
      description: 'Aplicacion para administrar reservas, equipos y disponibilidad de laboratorios.', objective: 'Digitalizar la planificacion de ambientes y equipos de laboratorio.',
      phaseId: values.registration_phase_id, stateId: values.registered_state_id, managementId: values.management_id, modalityId: values.modality_id, files,
    })
    const project4 = await createProject(client, {
      code: 'DEMO-2026-004', title: 'Portal de orientacion vocacional', student: student4,
      description: 'Portal para apoyar la orientacion vocacional de estudiantes de ultimo curso.', objective: 'Proveer recursos y resultados de orientacion vocacional mediante una plataforma web.',
      phaseId: values.registration_phase_id, stateId: values.registered_state_id, managementId: values.management_id, modalityId: values.modality_id, files,
    })

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const closedDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const p1Tutor = await assign(client, { projectId: project1.id, teacherId: tutor1.teacherId, type: 'TUTOR', adminId: admin.id, detail: 'Tutoria de demostracion confirmada.' })
    const p1Reviewer1 = await assign(client, { projectId: project1.id, teacherId: revisorPruebas.teacherId, type: 'REVISOR_1', adminId: admin.id, deadline, detail: 'Revision de demostracion asignada.' })
    const p1Reviewer2 = await assign(client, { projectId: project1.id, teacherId: reviewer2.teacherId, type: 'REVISOR_2', adminId: admin.id, deadline, detail: 'Revision de demostracion asignada.' })
    const p2Tutor = await assign(client, { projectId: project2.id, teacherId: tutor2.teacherId, type: 'TUTOR', adminId: admin.id, detail: 'Tutoria de demostracion confirmada.' })
    const p2Reviewer1 = await assign(client, { projectId: project2.id, teacherId: revisorPruebas.teacherId, type: 'REVISOR_1', adminId: admin.id, deadline: closedDeadline, detail: 'Revision de demostracion concluida.' })
    const p2Reviewer2 = await assign(client, { projectId: project2.id, teacherId: reviewer3.teacherId, type: 'REVISOR_2', adminId: admin.id, deadline: closedDeadline, detail: 'Revision de demostracion concluida.' })
    await assign(client, { projectId: project3.id, teacherId: tutor2.teacherId, type: 'TUTOR', adminId: admin.id, active: false, answered: false, detail: 'Invitacion de tutoria pendiente de respuesta.' })
    await assign(client, { projectId: project4.id, teacherId: tutor1.teacherId, type: 'TUTOR', adminId: admin.id, detail: 'Tutoria de demostracion confirmada.' })
    const p4Reviewer1 = await assign(client, { projectId: project4.id, teacherId: reviewer2.teacherId, type: 'REVISOR_1', adminId: admin.id, deadline: closedDeadline, detail: 'Revision de demostracion concluida.' })
    const p4Reviewer2 = await assign(client, { projectId: project4.id, teacherId: reviewer3.teacherId, type: 'REVISOR_2', adminId: admin.id, deadline: closedDeadline, detail: 'Revision de demostracion concluida.' })

    const round1 = await client.query(
      `INSERT INTO titulacion.rondas_revision (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id, fecha_limite)
       VALUES ($1, $2, 1, $3, $4)
       RETURNING id`,
      [project1.versions[0], values.review_phase_id, admin.id, deadline],
    )
    await client.query('INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id) VALUES ($1, $2), ($1, $3)', [round1.rows[0].id, p1Reviewer1, p1Reviewer2])
    const round2 = await client.query(
      `INSERT INTO titulacion.rondas_revision (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id, fecha_limite, cerrada_en)
       VALUES ($1, $2, 1, $3, $4, now() - interval '1 day')
       RETURNING id`,
      [project2.versions[0], values.review_phase_id, admin.id, closedDeadline],
    )
    const p2Reviews = await client.query(
      `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id, decision, comentario_general, decidida_en)
       VALUES ($1, $2, 'OBSERVADO', 'Se requiere precisar el alcance y la fuente de los indicadores.', now() - interval '2 days'),
               ($1, $3, 'APROBADO', 'El enfoque tecnico es viable tras aplicar las observaciones.', now() - interval '1 day')
       RETURNING id, asignacion_proyecto_id`,
      [round2.rows[0].id, p2Reviewer1, p2Reviewer2],
    )
    const observedReview = p2Reviews.rows.find((review) => review.asignacion_proyecto_id === p2Reviewer1)
    await client.query(
      `INSERT INTO titulacion.observaciones (revision_id, numero, detalle)
       VALUES ($1, 1, 'Precisar la delimitacion de los indicadores que seran analizados.'),
               ($1, 2, 'Incluir fuentes verificables para los datos academicos.')`,
      [observedReview.id],
    )
    const round4 = await client.query(
      `INSERT INTO titulacion.rondas_revision (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id, fecha_limite, cerrada_en)
       VALUES ($1, $2, 1, $3, $4, now() - interval '3 days')
       RETURNING id`,
      [project4.versions[0], values.review_phase_id, admin.id, closedDeadline],
    )
    await client.query(
      `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id, decision, comentario_general, decidida_en)
       VALUES ($1, $2, 'APROBADO', 'Perfil aprobado para la siguiente etapa.', now() - interval '4 days'),
               ($1, $3, 'APROBADO', 'Se valida la factibilidad de la propuesta.', now() - interval '3 days')`,
      [round4.rows[0].id, p4Reviewer1, p4Reviewer2],
    )

    await moveProject(client, { projectId: project1.id, previousStateId: values.registered_state_id, nextStateId: values.review_state_id, previousPhaseId: values.registration_phase_id, nextPhaseId: values.review_phase_id, userId: admin.id, reason: 'Perfil enviado a revision para demostracion.' })
    await moveProject(client, { projectId: project2.id, previousStateId: values.registered_state_id, nextStateId: values.review_state_id, previousPhaseId: values.registration_phase_id, nextPhaseId: values.review_phase_id, userId: admin.id, reason: 'Ronda inicial de revision programada.' })
    await moveProject(client, { projectId: project2.id, previousStateId: values.review_state_id, nextStateId: values.observed_state_id, previousPhaseId: values.review_phase_id, nextPhaseId: values.registration_phase_id, userId: revisorPruebas.id, reason: 'Perfil devuelto con observaciones de los revisores.' })
    await moveProject(client, { projectId: project4.id, previousStateId: values.registered_state_id, nextStateId: values.review_state_id, previousPhaseId: values.registration_phase_id, nextPhaseId: values.review_phase_id, userId: admin.id, reason: 'Ronda de revision cerrada satisfactoriamente.' })
    await moveProject(client, { projectId: project4.id, previousStateId: values.review_state_id, nextStateId: values.approval_state_id, previousPhaseId: values.review_phase_id, nextPhaseId: values.approval_phase_id, userId: reviewer2.id, reason: 'Perfil aprobado por ambos revisores.' })

    await createNotification(client, { userId: tutor2.id, email: tutor2.email, projectId: project3.id, type: 'SOLICITUD_TUTORIA', title: 'Nueva invitacion de tutoria', message: 'Tienes una invitacion pendiente para acompanar el proyecto DEMO-2026-003.', link: '/tutor/invitaciones', queueEmail: true })
    await createNotification(client, { userId: revisorPruebas.id, email: revisorPruebas.email, projectId: project1.id, type: 'REVISION_ASIGNADA', title: 'Perfil pendiente de revision', message: 'El perfil DEMO-2026-001 fue enviado a revision y requiere tu dictamen.', link: '/revisor' })
    await createNotification(client, { userId: reviewer2.id, email: reviewer2.email, projectId: project1.id, type: 'REVISION_ASIGNADA', title: 'Perfil pendiente de revision', message: 'El perfil DEMO-2026-001 fue enviado a revision y requiere tu dictamen.', link: '/revisor' })
    await createNotification(client, { userId: student2.id, email: student2.email, projectId: project2.id, type: 'REVISION_DEVUELTA', title: 'Perfil devuelto con observaciones', message: 'Tu perfil DEMO-2026-002 tiene observaciones. Revisa el documento y adjunta una nueva version.', link: '/documentos', queueEmail: true })
    await createNotification(client, { userId: student4.id, email: student4.email, projectId: project4.id, type: 'PERFIL_APROBADO_REVISION', title: 'Perfil aprobado en revision', message: 'Tu perfil DEMO-2026-004 fue aprobado por ambos revisores.', link: '/student' })
    await createNotification(client, { userId: student1.id, email: student1.email, projectId: project1.id, type: 'TUTORIA_ACEPTADA', title: 'Tutoria aceptada', message: 'La tutora Ana Quiroga acompana tu proyecto DEMO-2026-001.', link: '/student' })

    for (const file of files) {
      const absolutePath = path.resolve(process.cwd(), ...file.relativePath.split('/'))
      demoDirectories.add(path.dirname(absolutePath))
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, file.content, { flag: 'wx' })
    }
    await client.query('COMMIT')
    console.log(JSON.stringify({
      created: true,
      projects: 4,
      users: 10,
      credentials: {
        administrator: 'admin.demo@univalle.edu',
        students: ['estudiante.demo.1@univalle.edu', 'estudiante.demo.2@univalle.edu', 'estudiante.demo.3@univalle.edu', 'estudiante.demo.4@univalle.edu'],
        tutors: ['tutor.demo.ana@univalle.edu', 'tutor.demo.luis@univalle.edu'],
        reviewers: ['revisor.pruebas@univalle.edu', 'revisor.demo.2@univalle.edu', 'revisor.demo.3@univalle.edu'],
      },
    }))
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  await Promise.all([...demoDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  throw error
} finally {
  client.release()
  await pool.end()
}
