import 'dotenv/config'

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const demoPassword = 'MultiRolDemo!2026'
const prefix = 'CARGA-2026-'
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

async function createAccount(client, { email, firstName, lastName, roleIds, careerId, kind, code }) {
  const user = await client.query(
    `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [firstName, lastName, email, await bcrypt.hash(demoPassword, 10)],
  )
  for (const roleId of roleIds) {
    await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [user.rows[0].id, roleId])
  }
  const account = { id: user.rows[0].id, email, name: `${firstName} ${lastName}`, studentId: null, teacherId: null }
  if (kind === 'student') {
    const student = await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [account.id, careerId, code],
    )
    account.studentId = student.rows[0].id
  }
  if (kind === 'teacher') {
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

async function createProject(client, { code, title, description, objective, student, values, files, versionCount = 1 }) {
  const project = await client.query(
    `INSERT INTO titulacion.proyectos
      (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id, titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [code, values.management_id, values.modality_id, values.registration_phase_id, values.registered_state_id, title, description, objective, student.id],
  )
  const projectId = project.rows[0].id
  await client.query('INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal) VALUES ($1, $2, true)', [projectId, student.studentId])
  for (const [index, item] of ['Analizar las necesidades academicas.', 'Construir una solucion validable.', 'Documentar los resultados obtenidos.'].entries()) {
    await client.query('INSERT INTO titulacion.objetivos_especificos (proyecto_id, numero, descripcion) VALUES ($1, $2, $3)', [projectId, index + 1, item])
  }
  const document = await client.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1, $2, $3, 'PERFIL_PROYECTO', $4)
     RETURNING id`,
    [projectId, values.registration_phase_id, `Perfil de ${title}`, student.id],
  )
  const versions = []
  for (let number = 1; number <= versionCount; number += 1) {
    const filename = `perfil-${code.toLowerCase()}-v${number}.docx`
    const relativePath = path.posix.join('uploads', 'proyectos', projectId, filename)
    const content = profileDocx(`${title} - Version ${number}`)
    const version = await client.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, $2, $3, $4, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', $5, $6, $7, $8)
       RETURNING id`,
      [document.rows[0].id, number, filename, relativePath, content.length, crypto.createHash('sha256').update(content).digest('hex'), student.id, number === 1 ? 'Entrega inicial para la carga de demostracion.' : 'Version corregida para la carga de demostracion.'],
    )
    files.push({ relativePath, content })
    versions.push(version.rows[0].id)
  }
  return { id: projectId, documentId: document.rows[0].id, versionId: versions.at(-1) }
}

async function assign(client, { projectId, teacherId, type, adminId, active = true, answered = true, deadline = null, detail }) {
  const assignment = await client.query(
    `INSERT INTO titulacion.asignaciones_proyecto
      (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, fecha_limite, respondida_en, motivo_cambio)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN now() ELSE NULL END, $8)
     RETURNING id`,
    [projectId, teacherId, type, adminId, active, deadline, answered, detail],
  )
  return assignment.rows[0].id
}

async function createRound(client, { project, values, adminId, assignments, decisions = [], closed = false, deadline }) {
  const round = await client.query(
    `INSERT INTO titulacion.rondas_revision (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id, fecha_limite, cerrada_en)
     VALUES ($1, $2, 1, $3, $4, CASE WHEN $5 THEN now() - interval '1 day' ELSE NULL END)
     RETURNING id`,
    [project.versionId, values.review_phase_id, adminId, deadline, closed],
  )
  const reviews = []
  for (const assignmentId of assignments) {
    const item = decisions.find((decision) => decision.assignmentId === assignmentId)
    const review = item?.decision
      ? await client.query(
        `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id, decision, comentario_general, decidida_en)
         VALUES ($1, $2, $3, $4, now() - interval '2 days')
         RETURNING id`,
        [round.rows[0].id, assignmentId, item.decision, item.comment ?? null],
      )
      : await client.query(
        `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
         VALUES ($1, $2)
         RETURNING id`,
        [round.rows[0].id, assignmentId],
      )
    if (item?.observations?.length) {
      for (const [index, detail] of item.observations.entries()) {
        await client.query('INSERT INTO titulacion.observaciones (revision_id, numero, detalle) VALUES ($1, $2, $3)', [review.rows[0].id, index + 1, detail])
      }
    }
    reviews.push({ id: review.rows[0].id, assignmentId })
  }
  return { id: round.rows[0].id, reviews }
}

async function moveProject(client, { projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason }) {
  await client.query(
    `INSERT INTO titulacion.historial_estados
      (proyecto_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason],
  )
}

async function createNotification(client, { userId, projectId, type, title, message, link, queueEmail = false, email }) {
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

const client = await pool.connect()
const files = []
const directories = new Set()

try {
  const existing = await client.query('SELECT count(*)::int AS total FROM titulacion.proyectos WHERE codigo_seguimiento LIKE $1', [`${prefix}%`])
  if (existing.rows[0].total > 0) {
    console.log(JSON.stringify({ created: false, message: 'La carga CARGA-2026 ya existe; no se duplicaron datos.', projects: existing.rows[0].total }))
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
    if (!Object.values(values).every(Boolean)) throw new Error('Faltan catalogos activos necesarios para la carga de demostracion.')

    const existingAdmin = await client.query(
      `SELECT u.id, u.correo
       FROM titulacion.usuarios u
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.codigo = 'ADMINISTRADOR' AND r.activo
       WHERE u.activo
       ORDER BY u.creado_en
       LIMIT 1`,
    )
    const admin = existingAdmin.rows[0] ?? await createAccount(client, {
      email: 'administracion.carga@univalle.edu', firstName: 'Andrea', lastName: 'Gestion', roleIds: [values.admin_role_id], careerId: values.career_id, kind: 'none', code: 'CARGA-ADM-001',
    })
    const multiRoleTeacher = await createAccount(client, {
      email: 'docente.multirol.carga@univalle.edu', firstName: 'Daniela', lastName: 'Salvatierra', roleIds: [values.tutor_role_id, values.reviewer_role_id], careerId: values.career_id, kind: 'teacher', code: 'CARGA-DOC-001',
    })
    const supportingReviewer = await createAccount(client, {
      email: 'revisor.apoyo.carga@univalle.edu', firstName: 'Roberto', lastName: 'Arce', roleIds: [values.reviewer_role_id], careerId: values.career_id, kind: 'teacher', code: 'CARGA-DOC-002',
    })
    const backupTutor = await createAccount(client, {
      email: 'tutor.apoyo.carga@univalle.edu', firstName: 'Marcela', lastName: 'Rios', roleIds: [values.tutor_role_id], careerId: values.career_id, kind: 'teacher', code: 'CARGA-DOC-003',
    })
    const studentNames = [
      ['Alicia', 'Soto'], ['Bruno', 'Paredes'], ['Carla', 'Molina'], ['Diego', 'Rivera'], ['Elisa', 'Crespo'],
      ['Fabian', 'Lopez'], ['Gabriela', 'Vera'], ['Hector', 'Mendez'], ['Irene', 'Torrico'],
    ]
    const students = []
    for (const [index, [firstName, lastName]] of studentNames.entries()) {
      students.push(await createAccount(client, {
        email: `estudiante.carga.${String(index + 1).padStart(2, '0')}@univalle.edu`, firstName, lastName, roleIds: [values.student_role_id], careerId: values.career_id, kind: 'student', code: `CARGA-EST-${String(index + 1).padStart(3, '0')}`,
      }))
    }
    const definitions = [
      ['Plataforma de seguimiento de practicas profesionales', 'Centraliza el registro y seguimiento de practicas profesionales.', 'Construir una plataforma trazable para el seguimiento de practicas.'],
      ['Tablero de indicadores de rendimiento academico', 'Visualiza indicadores de rendimiento y permanencia estudiantil.', 'Implementar un tablero para apoyar decisiones academicas.'],
      ['Sistema de reservas de laboratorios', 'Gestiona reservas y disponibilidad de laboratorios de computacion.', 'Digitalizar la reserva de ambientes y equipamiento.'],
      ['Portal de orientacion vocacional', 'Apoya la orientacion vocacional con recursos y cuestionarios.', 'Ofrecer una plataforma de apoyo para la eleccion vocacional.'],
      ['Control de inventario para laboratorios', 'Registra activos, prestamos y mantenimiento de equipos.', 'Mejorar la trazabilidad del inventario tecnologico.'],
      ['Asistente de planificacion de materias', 'Ayuda a organizar horarios y prerequisitos academicos.', 'Facilitar la planificacion academica del estudiante.'],
      ['Gestor de solicitudes estudiantiles', 'Centraliza la recepcion y seguimiento de solicitudes.', 'Reducir los tiempos de respuesta administrativa.'],
      ['Repositorio de proyectos de grado', 'Publica proyectos de grado y permite su consulta institucional.', 'Preservar y facilitar la consulta de la produccion academica.'],
      ['Sistema de alertas de riesgo academico', 'Identifica indicadores tempranos de riesgo academico.', 'Apoyar el acompanamiento oportuno de estudiantes en riesgo.'],
    ]
    const projects = []
    for (const [index, [title, description, objective]] of definitions.entries()) {
      projects.push(await createProject(client, {
        code: `${prefix}${String(index + 1).padStart(3, '0')}`, title, description, objective, student: students[index], values, files, versionCount: [3, 4, 5].includes(index) ? 2 : 1,
      }))
    }

    const futureDeadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const closedRoundDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    const assignment = {}
    for (const projectIndex of [0, 1, 2, 3, 4, 5]) {
      assignment[`p${projectIndex + 1}Tutor`] = await assign(client, { projectId: projects[projectIndex].id, teacherId: multiRoleTeacher.teacherId, type: 'TUTOR', adminId: admin.id, detail: 'Tutoria de carga de demostracion confirmada.' })
    }
    assignment.p8TutorInvitation = await assign(client, { projectId: projects[7].id, teacherId: multiRoleTeacher.teacherId, type: 'TUTOR', adminId: admin.id, active: false, answered: false, detail: 'Invitacion de tutoria pendiente de respuesta.' })
    assignment.p9Tutor = await assign(client, { projectId: projects[8].id, teacherId: backupTutor.teacherId, type: 'TUTOR', adminId: admin.id, detail: 'Tutoria asignada a docente de apoyo.' })
    for (const projectIndex of [0, 1, 2, 3, 4, 6, 8]) {
      const reviewDeadline = projectIndex === 0 || projectIndex === 1 || projectIndex === 8 ? futureDeadline : closedRoundDeadline
      assignment[`p${projectIndex + 1}Reviewer1`] = await assign(client, { projectId: projects[projectIndex].id, teacherId: multiRoleTeacher.teacherId, type: 'REVISOR_1', adminId: admin.id, deadline: reviewDeadline, detail: 'Revision asignada a la cuenta multirol.' })
      assignment[`p${projectIndex + 1}Reviewer2`] = await assign(client, { projectId: projects[projectIndex].id, teacherId: supportingReviewer.teacherId, type: 'REVISOR_2', adminId: admin.id, deadline: reviewDeadline, detail: 'Segunda revision asignada para la carga.' })
    }

    await createRound(client, { project: projects[0], values, adminId: admin.id, assignments: [assignment.p1Reviewer1, assignment.p1Reviewer2], deadline: futureDeadline })
    await createRound(client, { project: projects[1], values, adminId: admin.id, assignments: [assignment.p2Reviewer1, assignment.p2Reviewer2], deadline: futureDeadline })
    await createRound(client, {
      project: projects[2], values, adminId: admin.id, assignments: [assignment.p3Reviewer1, assignment.p3Reviewer2], deadline: closedRoundDeadline, closed: true,
      decisions: [
        { assignmentId: assignment.p3Reviewer1, decision: 'APROBADO', comment: 'El perfil cumple los criterios academicos y tecnicos.' },
        { assignmentId: assignment.p3Reviewer2, decision: 'APROBADO', comment: 'Se aprueba la propuesta para la siguiente fase.' },
      ],
    })
    await createRound(client, {
      project: projects[3], values, adminId: admin.id, assignments: [assignment.p4Reviewer1, assignment.p4Reviewer2], deadline: closedRoundDeadline, closed: true,
      decisions: [
        { assignmentId: assignment.p4Reviewer1, decision: 'OBSERVADO', comment: 'No cumple aun con los criterios de delimitacion.', observations: ['Precisar el alcance del proyecto.', 'Completar la justificacion del problema.'] },
        { assignmentId: assignment.p4Reviewer2, decision: 'OBSERVADO', comment: 'Se requiere una nueva version del perfil.', observations: ['Ajustar los objetivos especificos.'] },
      ],
    })
    await createRound(client, {
      project: projects[4], values, adminId: admin.id, assignments: [assignment.p5Reviewer1, assignment.p5Reviewer2], deadline: closedRoundDeadline, closed: true,
      decisions: [
        { assignmentId: assignment.p5Reviewer1, decision: 'OBSERVADO', comment: 'La propuesta debe corregirse antes de continuar.', observations: ['Incluir el plan de validacion.'] },
        { assignmentId: assignment.p5Reviewer2, decision: 'APROBADO', comment: 'La solucion planteada es viable.' },
      ],
    })
    await createRound(client, {
      project: projects[6], values, adminId: admin.id, assignments: [assignment.p7Reviewer1, assignment.p7Reviewer2], deadline: closedRoundDeadline, closed: true,
      decisions: [
        { assignmentId: assignment.p7Reviewer1, decision: 'APROBADO', comment: 'Dictamen favorable emitido.' },
        { assignmentId: assignment.p7Reviewer2, decision: 'APROBADO', comment: 'Propuesta validada por el segundo revisor.' },
      ],
    })
    await createRound(client, { project: projects[8], values, adminId: admin.id, assignments: [assignment.p9Reviewer1, assignment.p9Reviewer2], deadline: futureDeadline })

    for (const projectIndex of [0, 1, 2, 3, 4, 6, 8]) {
      await moveProject(client, { projectId: projects[projectIndex].id, previousStateId: values.registered_state_id, nextStateId: values.review_state_id, previousPhaseId: values.registration_phase_id, nextPhaseId: values.review_phase_id, userId: admin.id, reason: 'Perfil enviado a revision durante la carga de demostracion.' })
    }
    for (const projectIndex of [2, 6]) {
      await moveProject(client, { projectId: projects[projectIndex].id, previousStateId: values.review_state_id, nextStateId: values.approval_state_id, previousPhaseId: values.review_phase_id, nextPhaseId: values.approval_phase_id, userId: multiRoleTeacher.id, reason: 'Perfil aprobado por los revisores.' })
    }
    for (const projectIndex of [3, 4]) {
      await moveProject(client, { projectId: projects[projectIndex].id, previousStateId: values.review_state_id, nextStateId: values.observed_state_id, previousPhaseId: values.review_phase_id, nextPhaseId: values.registration_phase_id, userId: multiRoleTeacher.id, reason: 'Perfil denegado temporalmente y devuelto con observaciones.' })
    }

    await createNotification(client, { userId: multiRoleTeacher.id, projectId: projects[7].id, type: 'SOLICITUD_TUTORIA', title: 'Nueva invitacion de tutoria', message: 'Tienes una invitacion pendiente para acompanhar el proyecto CARGA-2026-008.', link: '/tutor/invitaciones', queueEmail: true, email: multiRoleTeacher.email })
    for (const projectIndex of [0, 1, 8]) {
      await createNotification(client, { userId: multiRoleTeacher.id, projectId: projects[projectIndex].id, type: 'REVISION_ASIGNADA', title: 'Perfil pendiente de revision', message: `El perfil CARGA-2026-${String(projectIndex + 1).padStart(3, '0')} requiere tu dictamen como revisor.`, link: '/revisor' })
    }
    for (const projectIndex of [3, 4]) {
      await createNotification(client, { userId: students[projectIndex].id, projectId: projects[projectIndex].id, type: 'REVISION_DEVUELTA', title: 'Perfil devuelto con observaciones', message: 'Tu perfil fue devuelto con observaciones; revisa los dictamenes y adjunta una nueva version.', link: '/documentos', queueEmail: true, email: students[projectIndex].email })
    }
    for (const projectIndex of [2, 6]) {
      await createNotification(client, { userId: students[projectIndex].id, projectId: projects[projectIndex].id, type: 'PERFIL_APROBADO_REVISION', title: 'Perfil aprobado en revision', message: 'Tu perfil fue aprobado por los revisores y paso a la etapa de aprobacion.', link: '/student' })
    }

    for (const file of files) {
      const absolutePath = path.resolve(process.cwd(), ...file.relativePath.split('/'))
      directories.add(path.dirname(absolutePath))
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, file.content, { flag: 'wx' })
    }
    await client.query('COMMIT')
    console.log(JSON.stringify({
      created: true,
      projects: projects.length,
      students: students.length,
      multiRoleUser: { email: multiRoleTeacher.email, roles: ['TUTOR', 'REVISOR'] },
      scenarios: { pendingReview: 3, approved: 2, observedOrDenied: 2, registered: 2, tutorProjects: 7, reviewerProjects: 7 },
    }))
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  await Promise.all([...directories].map((directory) => rm(directory, { recursive: true, force: true })))
  throw error
} finally {
  client.release()
  await pool.end()
}
