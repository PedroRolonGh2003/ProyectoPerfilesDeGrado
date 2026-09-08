import 'dotenv/config'

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const sessionHours = Number(process.env.SESSION_HOURS ?? 12)
const rememberSessionDays = Number(process.env.REMEMBER_SESSION_DAYS ?? 30)

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: '-c search_path=titulacion,public',
})

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

function cookieValue(request, name) {
  const cookie = request.headers.cookie
  if (!cookie) return null

  const prefix = `${name}=`
  const match = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix))
  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function setSessionCookie(response, token, maxAge) {
  response.cookie('stit_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    path: '/',
  })
}

function sanitizeUser(row) {
  return {
    id: row.usuario_id,
    fullName: `${row.nombres} ${row.apellidos}`.trim(),
    email: row.correo,
    role: row.rol_codigo,
    studentId: row.estudiante_id,
    teacherId: row.docente_id,
    registration: row.registro_universitario,
    career: row.carrera_nombre ?? 'Sin carrera asignada',
  }
}

async function sessionFromRequest(request) {
  const token = cookieValue(request, 'stit_session')
  if (!token) return null

  const result = await pool.query(
    `SELECT
       s.id AS sesion_id,
       u.id AS usuario_id,
       u.nombres,
       u.apellidos,
       u.correo,
       r.id AS rol_id,
       r.codigo AS rol_codigo,
       e.id AS estudiante_id,
       e.registro_universitario,
       d.id AS docente_id,
       COALESCE(e.carrera_id, d.carrera_id) AS carrera_id,
       c.nombre AS carrera_nombre
     FROM titulacion.sesiones_usuario s
     JOIN titulacion.usuarios u ON u.id = s.usuario_id AND u.activo
     JOIN titulacion.roles r ON r.id = s.rol_activo_id AND r.activo
     JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.rol_id = r.id AND ur.activo
     LEFT JOIN titulacion.estudiantes e ON e.usuario_id = u.id AND e.activo
     LEFT JOIN titulacion.docentes d ON d.usuario_id = u.id AND d.activo
     LEFT JOIN titulacion.carreras c ON c.id = COALESCE(e.carrera_id, d.carrera_id) AND c.activa
     WHERE s.token_hash = $1
       AND s.cerrada_en IS NULL
       AND s.expira_en > now()`,
    [hashToken(token)],
  )

  return result.rows[0] ?? null
}

async function requireSession(request, response, next) {
  try {
    const session = await sessionFromRequest(request)
    if (!session) return response.status(401).json({ message: 'Tu sesión no está activa. Inicia sesión nuevamente.' })
    request.session = session
    return next()
  } catch (error) {
    return next(error)
  }
}

async function requireStudent(request, response, next) {
  try {
    const session = await sessionFromRequest(request)
    if (!session) {
      return response.status(401).json({ message: 'Tu sesión no está activa. Inicia sesión nuevamente.' })
    }

    if (session.rol_codigo !== 'ESTUDIANTE' || !session.estudiante_id) {
      return response.status(403).json({ message: 'Esta vista está disponible únicamente para estudiantes.' })
    }

    request.session = session
    return next()
  } catch (error) {
    return next(error)
  }
}

async function requireTutor(request, response, next) {
  try {
    const session = await sessionFromRequest(request)
    if (!session) return response.status(401).json({ message: 'Tu sesión no está activa. Inicia sesión nuevamente.' })
    if (session.rol_codigo !== 'TUTOR' || !session.docente_id) {
      return response.status(403).json({ message: 'Esta vista está disponible únicamente para tutores.' })
    }
    request.session = session
    return next()
  } catch (error) {
    return next(error)
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isWordDocument(file) {
  if (!file) return false
  const extension = path.extname(file.originalname).toLowerCase()
  const signature = file.buffer?.subarray(0, 8)
  if (extension === '.docx') {
    return signature?.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ?? false
  }
  if (extension === '.doc') {
    return signature?.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) ?? false
  }
  return false
}

function projectPayload(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.codigo_seguimiento,
    title: row.titulo_tentativo,
    description: row.descripcion,
    generalObjective: row.objetivo_general,
    management: row.gestion_nombre,
    modality: row.modalidad_nombre,
    phase: row.fase_nombre,
    status: row.estado_nombre,
    registeredAt: row.registrado_en,
  }
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function storedFilePath(relativePath, projectId) {
  const expectedPrefix = `uploads/proyectos/${projectId}/`
  if (typeof relativePath !== 'string' || !relativePath.startsWith(expectedPrefix)) return null

  const uploadsRoot = path.resolve(process.cwd(), 'uploads')
  const absolutePath = path.resolve(process.cwd(), ...relativePath.split('/'))
  return absolutePath.startsWith(`${uploadsRoot}${path.sep}`) ? absolutePath : null
}

function versionPayload(row) {
  return {
    id: row.version_id,
    number: row.numero_version,
    filename: row.nombre_archivo,
    mimeType: row.mime_type,
    size: Number(row.tamano_bytes),
    uploadedAt: row.subida_en,
    comment: row.comentario_entrega,
  }
}

async function createNotification(databaseClient, { userId, recipientEmail, projectId = null, type, title, message, link = null, queueEmail = false }) {
  const notification = await databaseClient.query(
    `INSERT INTO titulacion.notificaciones (usuario_id, proyecto_id, tipo, titulo, mensaje, enlace)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, projectId, type, title, message, link],
  )

  if (queueEmail && recipientEmail) {
    await databaseClient.query(
      `INSERT INTO titulacion.cola_correos_notificacion
        (notificacion_id, destinatario, tipo, asunto, cuerpo)
       VALUES ($1, $2, $3, $4, $5)`,
      [notification.rows[0].id, recipientEmail, type, title, message],
    )
  }
  return notification.rows[0].id
}

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const identifier = text(request.body?.identifier).toLowerCase()
    const password = request.body?.password
    const remember = Boolean(request.body?.remember)

    if (!identifier || typeof password !== 'string' || !password) {
      return response.status(422).json({ message: 'Ingresa tu correo institucional y tu contraseña.' })
    }

    const result = await pool.query(
      `SELECT
         u.id AS usuario_id,
         u.nombres,
         u.apellidos,
         u.correo,
         u.password_hash,
         r.id AS rol_id,
         r.codigo AS rol_codigo,
         e.id AS estudiante_id,
         e.registro_universitario,
         d.id AS docente_id,
         c.nombre AS carrera_nombre
       FROM titulacion.usuarios u
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo
       LEFT JOIN titulacion.estudiantes e ON e.usuario_id = u.id AND e.activo
       LEFT JOIN titulacion.docentes d ON d.usuario_id = u.id AND d.activo
       LEFT JOIN titulacion.carreras c ON c.id = COALESCE(e.carrera_id, d.carrera_id) AND c.activa
       WHERE lower(u.correo) = $1
         AND u.activo
         AND (
           (r.codigo = 'ESTUDIANTE' AND e.id IS NOT NULL)
           OR (r.codigo = 'TUTOR' AND d.id IS NOT NULL)
         )
       ORDER BY CASE r.codigo WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 ELSE 3 END
       LIMIT 1`,
      [identifier],
    )

    const account = result.rows[0]
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return response.status(401).json({ message: 'Correo o contraseña incorrectos.' })
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const durationMs = remember
      ? rememberSessionDays * 24 * 60 * 60 * 1000
      : sessionHours * 60 * 60 * 1000
    const expiration = new Date(Date.now() + durationMs)

    await pool.query(
      `INSERT INTO titulacion.sesiones_usuario
        (usuario_id, rol_activo_id, token_hash, ip_origen, agente_usuario, expira_en)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        account.usuario_id,
        account.rol_id,
        hashToken(token),
        request.socket.remoteAddress ?? null,
        text(request.get('user-agent')).slice(0, 1000) || null,
        expiration,
      ],
    )

    setSessionCookie(response, token, durationMs)
    return response.json({ user: sanitizeUser(account) })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/session', requireSession, (request, response) => {
  response.json({ user: sanitizeUser(request.session) })
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    const token = cookieValue(request, 'stit_session')
    if (token) {
      await pool.query(
        `UPDATE titulacion.sesiones_usuario
         SET cerrada_en = now()
         WHERE token_hash = $1 AND cerrada_en IS NULL`,
        [hashToken(token)],
      )
    }
    response.clearCookie('stit_session', { httpOnly: true, sameSite: 'lax', path: '/' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/notifications', requireSession, async (request, response, next) => {
  try {
    const [notifications, unread] = await Promise.all([
      pool.query(
        `SELECT id, proyecto_id, tipo, titulo, mensaje, enlace, leida_en, creada_en
         FROM titulacion.notificaciones
         WHERE usuario_id = $1
         ORDER BY creada_en DESC
         LIMIT 20`,
        [request.session.usuario_id],
      ),
      pool.query(
        `SELECT count(*)::int AS total
         FROM titulacion.notificaciones
         WHERE usuario_id = $1 AND leida_en IS NULL`,
        [request.session.usuario_id],
      ),
    ])
    return response.json({ notifications: notifications.rows.map((item) => ({
      id: item.id,
      projectId: item.proyecto_id,
      type: item.tipo,
      title: item.titulo,
      message: item.mensaje,
      link: item.enlace,
      readAt: item.leida_en,
      createdAt: item.creada_en,
    })), unreadCount: unread.rows[0].total })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/notifications/:notificationId/read', requireSession, async (request, response, next) => {
  try {
    const notificationId = request.params.notificationId
    if (!isUuid(notificationId)) return response.status(400).json({ message: 'La notificación no es válida.' })
    const result = await pool.query(
      `UPDATE titulacion.notificaciones
       SET leida_en = COALESCE(leida_en, now())
       WHERE id = $1 AND usuario_id = $2
       RETURNING id, leida_en`,
      [notificationId, request.session.usuario_id],
    )
    if (!result.rows[0]) return response.status(404).json({ message: 'La notificación no está disponible.' })
    return response.json({ id: result.rows[0].id, readAt: result.rows[0].leida_en })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/tutor/dashboard', requireTutor, async (request, response, next) => {
  try {
    const { session } = request
    const assignmentQuery = `
      SELECT a.id AS assignment_id, a.proyecto_id, a.fecha_asignacion, a.fecha_limite,
             a.respondida_en, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
             p.objetivo_general, g.nombre AS gestion_nombre, m.nombre AS modalidad_nombre,
             f.nombre AS fase_nombre, ep.nombre AS estado_nombre,
             students.nombres_estudiantes, students.registros_estudiantes,
             profile.documento_id, profile.version_id, profile.nombre_archivo,
             profile.numero_version, profile.subida_en
      FROM titulacion.asignaciones_proyecto a
      JOIN titulacion.proyectos p ON p.id = a.proyecto_id
      JOIN titulacion.gestiones g ON g.id = p.gestion_id
      JOIN titulacion.modalidades_titulacion m ON m.id = p.modalidad_id
      JOIN titulacion.fases f ON f.id = p.fase_actual_id
      JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
      JOIN LATERAL (
        SELECT string_agg(trim(concat(u.nombres, ' ', u.apellidos)), ', ' ORDER BY u.apellidos, u.nombres) AS nombres_estudiantes,
               string_agg(e.registro_universitario, ', ' ORDER BY e.registro_universitario) AS registros_estudiantes
        FROM titulacion.proyecto_estudiantes pe
        JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
        JOIN titulacion.usuarios u ON u.id = e.usuario_id
        WHERE pe.proyecto_id = p.id AND pe.activo
      ) students ON true
      LEFT JOIN LATERAL (
        SELECT d.id AS documento_id, vd.id AS version_id, vd.nombre_archivo,
               vd.numero_version, vd.subida_en
        FROM titulacion.documentos d
        LEFT JOIN LATERAL (
          SELECT id, nombre_archivo, numero_version, subida_en
          FROM titulacion.versiones_documento
          WHERE documento_id = d.id
          ORDER BY numero_version DESC
          LIMIT 1
        ) vd ON true
        WHERE d.proyecto_id = p.id AND d.activo AND d.tipo_documento = 'PERFIL_PROYECTO'
        ORDER BY d.creado_en DESC
        LIMIT 1
      ) profile ON true
      WHERE a.docente_id = $1 AND a.tipo = 'TUTOR'`

    const [invitations, projects, notifications, unread] = await Promise.all([
      pool.query(`${assignmentQuery} AND NOT a.activo AND a.fecha_fin IS NULL ORDER BY a.fecha_asignacion DESC`, [session.docente_id]),
      pool.query(`${assignmentQuery} AND a.activo AND a.fecha_fin IS NULL ORDER BY p.actualizado_en DESC`, [session.docente_id]),
      pool.query(
        `SELECT id, proyecto_id, tipo, titulo, mensaje, enlace, leida_en, creada_en
         FROM titulacion.notificaciones
         WHERE usuario_id = $1
         ORDER BY creada_en DESC
         LIMIT 15`,
        [session.usuario_id],
      ),
      pool.query(
        `SELECT count(*)::int AS total
         FROM titulacion.notificaciones
         WHERE usuario_id = $1 AND leida_en IS NULL`,
        [session.usuario_id],
      ),
    ])

    const assignmentPayload = (assignment) => ({
      id: assignment.assignment_id,
      projectId: assignment.proyecto_id,
      code: assignment.codigo_seguimiento,
      title: assignment.titulo_tentativo,
      description: assignment.descripcion,
      generalObjective: assignment.objetivo_general,
      management: assignment.gestion_nombre,
      modality: assignment.modalidad_nombre,
      phase: assignment.fase_nombre,
      status: assignment.estado_nombre,
      students: assignment.nombres_estudiantes ?? 'Estudiante no disponible',
      registrations: assignment.registros_estudiantes ?? '',
      requestedAt: assignment.fecha_asignacion,
      respondedAt: assignment.respondida_en,
      deadline: assignment.fecha_limite,
      profile: assignment.documento_id ? {
        documentId: assignment.documento_id,
        versionId: assignment.version_id,
        filename: assignment.nombre_archivo,
        version: assignment.numero_version,
        uploadedAt: assignment.subida_en,
      } : null,
    })

    return response.json({
      user: sanitizeUser(session),
      invitations: invitations.rows.map(assignmentPayload),
      projects: projects.rows.map(assignmentPayload),
      notifications: notifications.rows.map((item) => ({
        id: item.id,
        projectId: item.proyecto_id,
        type: item.tipo,
        title: item.titulo,
        message: item.mensaje,
        link: item.enlace,
        readAt: item.leida_en,
        createdAt: item.creada_en,
      })),
      unreadCount: unread.rows[0].total,
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/tutor/invitations/:assignmentId/respond', requireTutor, async (request, response, next) => {
  let databaseClient = null
  try {
    const assignmentId = request.params.assignmentId
    const decision = text(request.body?.decision).toUpperCase()
    const reason = text(request.body?.reason)
    if (!isUuid(assignmentId) || !['ACEPTAR', 'DECLINAR'].includes(decision)) {
      return response.status(422).json({ message: 'Indica si aceptas o declinas la invitación.' })
    }
    if (decision === 'DECLINAR' && reason.length < 5) {
      return response.status(422).json({ message: 'Explica brevemente el motivo para declinar la tutoría.' })
    }

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const invitation = await databaseClient.query(
      `SELECT a.id, a.proyecto_id, p.codigo_seguimiento, p.titulo_tentativo,
              student.usuario_id AS estudiante_usuario_id, student.correo AS estudiante_correo,
              student.nombre AS estudiante_nombre
       FROM titulacion.asignaciones_proyecto a
       JOIN titulacion.proyectos p ON p.id = a.proyecto_id
       JOIN LATERAL (
         SELECT u.id AS usuario_id, u.correo, trim(concat(u.nombres, ' ', u.apellidos)) AS nombre
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id
         WHERE pe.proyecto_id = p.id AND pe.activo AND pe.es_responsable_principal
         LIMIT 1
       ) student ON true
       WHERE a.id = $1
         AND a.docente_id = $2
         AND a.tipo = 'TUTOR'
         AND NOT a.activo
         AND a.fecha_fin IS NULL
       FOR UPDATE OF a`,
      [assignmentId, request.session.docente_id],
    )
    const selected = invitation.rows[0]
    if (!selected) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'La invitación ya fue respondida o no te pertenece.' })
    }

    const accepted = decision === 'ACEPTAR'
    const detail = accepted
      ? 'Tutoría aceptada por el docente.'
      : `Tutoría declinada por el docente. Motivo: ${reason}`
    await databaseClient.query(
      `UPDATE titulacion.asignaciones_proyecto
       SET activo = $2,
           fecha_fin = CASE WHEN $2 THEN NULL ELSE now() END,
           respondida_en = now(),
           motivo_cambio = $3
       WHERE id = $1`,
      [selected.id, accepted, detail],
    )
    await databaseClient.query(
      `UPDATE titulacion.notificaciones
       SET leida_en = COALESCE(leida_en, now())
       WHERE usuario_id = $1
         AND proyecto_id = $2
         AND tipo = 'SOLICITUD_TUTORIA'
         AND leida_en IS NULL`,
      [request.session.usuario_id, selected.proyecto_id],
    )
    await createNotification(databaseClient, {
      userId: selected.estudiante_usuario_id,
      recipientEmail: selected.estudiante_correo,
      projectId: selected.proyecto_id,
      type: accepted ? 'TUTORIA_ACEPTADA' : 'TUTORIA_DECLINADA',
      title: accepted ? 'Tutoría aceptada' : 'Tutoría declinada',
      message: accepted
        ? `El tutor aceptó acompañar tu proyecto ${selected.codigo_seguimiento}.`
        : `El tutor declinó la tutoría de tu proyecto ${selected.codigo_seguimiento}. Motivo: ${reason}`,
      link: '/student',
    })
    await databaseClient.query('COMMIT')
    return response.json({
      message: accepted ? 'Aceptaste la tutoría. El proyecto ya está disponible en Mis proyectos.' : 'Declinaste la tutoría. Administración podrá reasignar el proyecto.',
      decision,
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.get('/api/tutor/documents/:documentId/download', requireTutor, async (request, response, next) => {
  try {
    const documentId = request.params.documentId
    const versionId = text(request.query.version)
    if (!isUuid(documentId) || (versionId && !isUuid(versionId))) {
      return response.status(400).json({ message: 'El documento solicitado no es válido.' })
    }
    const result = await pool.query(
      `SELECT d.proyecto_id, vd.nombre_archivo, vd.ruta_archivo
       FROM titulacion.documentos d
       JOIN titulacion.asignaciones_proyecto a ON a.proyecto_id = d.proyecto_id
         AND a.docente_id = $1 AND a.tipo = 'TUTOR' AND a.activo AND a.fecha_fin IS NULL
       JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
       WHERE d.id = $2 AND d.activo
         AND ($3::uuid IS NULL OR vd.id = $3::uuid)
       ORDER BY vd.numero_version DESC
       LIMIT 1`,
      [request.session.docente_id, documentId, versionId || null],
    )
    const version = result.rows[0]
    if (!version) return response.status(404).json({ message: 'El archivo no está disponible para tus proyectos asignados.' })
    const filePath = storedFilePath(version.ruta_archivo, version.proyecto_id)
    if (!filePath) return response.status(404).json({ message: 'La ruta del archivo no es válida.' })
    try {
      await access(filePath)
    } catch {
      return response.status(404).json({ message: 'El archivo ya no se encuentra en el almacenamiento local.' })
    }
    return response.download(filePath, path.basename(version.nombre_archivo), (error) => {
      if (error && !response.headersSent) next(error)
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/student/bootstrap', requireStudent, async (request, response, next) => {
  try {
    const { session } = request
    const [managements, modalities, tutors, project] = await Promise.all([
      pool.query(
        `SELECT id, codigo, nombre
         FROM titulacion.gestiones
         WHERE activa
         ORDER BY fecha_inicio DESC NULLS LAST, codigo DESC`,
      ),
      pool.query(
        `SELECT id, codigo, nombre
         FROM titulacion.modalidades_titulacion
         WHERE activa AND carrera_id = $1
         ORDER BY nombre`,
        [session.carrera_id],
      ),
      pool.query(
        `SELECT DISTINCT d.id, u.nombres, u.apellidos
         FROM titulacion.docentes d
         JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
         JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
         JOIN titulacion.roles r ON r.id = ur.rol_id AND r.codigo = 'TUTOR' AND r.activo
         WHERE d.activo AND d.carrera_id = $1
         ORDER BY u.apellidos, u.nombres`,
        [session.carrera_id],
      ),
      pool.query(
        `SELECT p.id, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
                p.objetivo_general, p.registrado_en, g.nombre AS gestion_nombre,
                m.nombre AS modalidad_nombre, f.nombre AS fase_nombre,
                ep.nombre AS estado_nombre
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
         JOIN titulacion.gestiones g ON g.id = p.gestion_id
         JOIN titulacion.modalidades_titulacion m ON m.id = p.modalidad_id
         JOIN titulacion.fases f ON f.id = p.fase_actual_id
         JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
         WHERE pe.estudiante_id = $1 AND pe.activo
         ORDER BY p.registrado_en DESC
         LIMIT 1`,
        [session.estudiante_id],
      ),
    ])

    return response.json({
      user: sanitizeUser(session),
      managements: managements.rows,
      modalities: modalities.rows,
      tutors: tutors.rows.map((tutor) => ({ id: tutor.id, name: `${tutor.nombres} ${tutor.apellidos}`.trim() })),
      project: projectPayload(project.rows[0]),
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/student/overview', requireStudent, async (request, response, next) => {
  try {
    const { session } = request
    const projectResult = await pool.query(
      `SELECT p.id, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
              p.objetivo_general, p.registrado_en, g.nombre AS gestion_nombre,
              m.nombre AS modalidad_nombre, f.nombre AS fase_nombre,
              ep.nombre AS estado_nombre
       FROM titulacion.proyecto_estudiantes pe
       JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
       JOIN titulacion.gestiones g ON g.id = p.gestion_id
       JOIN titulacion.modalidades_titulacion m ON m.id = p.modalidad_id
       JOIN titulacion.fases f ON f.id = p.fase_actual_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE pe.estudiante_id = $1 AND pe.activo
       ORDER BY p.registrado_en DESC
       LIMIT 1`,
      [session.estudiante_id],
    )

    const project = projectResult.rows[0]
    if (!project) return response.json({ project: null, tutor: null, objectives: [], profile: null, history: [] })

    const [objectives, tutor, profile, history] = await Promise.all([
      pool.query(
        `SELECT numero, descripcion
         FROM titulacion.objetivos_especificos
         WHERE proyecto_id = $1
         ORDER BY numero`,
        [project.id],
      ),
      pool.query(
        `SELECT a.activo, a.fecha_asignacion, u.nombres, u.apellidos
         FROM titulacion.asignaciones_proyecto a
         JOIN titulacion.docentes d ON d.id = a.docente_id
         JOIN titulacion.usuarios u ON u.id = d.usuario_id
         WHERE a.proyecto_id = $1
           AND a.tipo = 'TUTOR'
           AND a.fecha_fin IS NULL
         ORDER BY a.activo DESC, a.fecha_asignacion DESC
         LIMIT 1`,
        [project.id],
      ),
      pool.query(
        `SELECT d.id AS documento_id, d.nombre,
                latest.id AS version_id, latest.numero_version, latest.nombre_archivo,
                latest.tamano_bytes, latest.subida_en
         FROM titulacion.documentos d
         LEFT JOIN LATERAL (
           SELECT id, numero_version, nombre_archivo, tamano_bytes, subida_en
           FROM titulacion.versiones_documento
           WHERE documento_id = d.id
           ORDER BY numero_version DESC
           LIMIT 1
         ) latest ON true
         WHERE d.proyecto_id = $1
           AND d.activo
           AND d.tipo_documento = 'PERFIL_PROYECTO'
         ORDER BY d.creado_en DESC
         LIMIT 1`,
        [project.id],
      ),
      pool.query(
        `SELECT h.cambiado_en, h.motivo,
                estado.nombre AS estado_nombre,
                fase.nombre AS fase_nombre
         FROM titulacion.historial_estados h
         LEFT JOIN titulacion.estados_proyecto estado ON estado.id = h.estado_nuevo_id
         LEFT JOIN titulacion.fases fase ON fase.id = h.fase_nueva_id
         WHERE h.proyecto_id = $1
         ORDER BY h.cambiado_en DESC
         LIMIT 5`,
        [project.id],
      ),
    ])

    const tutorRow = tutor.rows[0]
    const profileRow = profile.rows[0]
    return response.json({
      project: projectPayload(project),
      tutor: tutorRow ? {
        name: `${tutorRow.nombres} ${tutorRow.apellidos}`.trim(),
        status: tutorRow.activo ? 'CONFIRMADO' : 'PROPUESTO',
        assignedAt: tutorRow.fecha_asignacion,
      } : null,
      objectives: objectives.rows.map((objective) => ({ number: objective.numero, description: objective.descripcion })),
      profile: profileRow ? {
        documentId: profileRow.documento_id,
        name: profileRow.nombre,
        versionId: profileRow.version_id,
        version: profileRow.numero_version,
        filename: profileRow.nombre_archivo,
        size: profileRow.tamano_bytes === null ? null : Number(profileRow.tamano_bytes),
        uploadedAt: profileRow.subida_en,
      } : null,
      history: history.rows.map((entry) => ({
        changedAt: entry.cambiado_en,
        status: entry.estado_nombre,
        phase: entry.fase_nombre,
        reason: entry.motivo,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/documents', requireStudent, async (request, response, next) => {
  try {
    const { session } = request
    const [documents, versions] = await Promise.all([
      pool.query(
        `SELECT d.id, d.proyecto_id, d.nombre, d.tipo_documento, d.creado_en,
                p.codigo_seguimiento, f.codigo AS fase_codigo, f.nombre AS fase_nombre,
                ep.nombre AS estado_nombre, ep.permite_edicion_estudiante,
                latest.id AS latest_version_id, latest.numero_version AS latest_numero_version,
                latest.nombre_archivo AS latest_nombre_archivo, latest.mime_type AS latest_mime_type,
                latest.tamano_bytes AS latest_tamano_bytes, latest.subida_en AS latest_subida_en,
                version_count.total AS total_versiones
         FROM titulacion.documentos d
         JOIN titulacion.proyectos p ON p.id = d.proyecto_id
         JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = p.id AND pe.estudiante_id = $1 AND pe.activo
         JOIN titulacion.fases f ON f.id = d.fase_id
         JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
         LEFT JOIN LATERAL (
           SELECT id, numero_version, nombre_archivo, mime_type, tamano_bytes, subida_en
           FROM titulacion.versiones_documento
           WHERE documento_id = d.id
           ORDER BY numero_version DESC
           LIMIT 1
         ) latest ON true
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS total
           FROM titulacion.versiones_documento
           WHERE documento_id = d.id
         ) version_count ON true
         WHERE d.activo
         ORDER BY d.creado_en DESC`,
        [session.estudiante_id],
      ),
      pool.query(
        `SELECT d.id AS documento_id, vd.id AS version_id, vd.numero_version,
                vd.nombre_archivo, vd.mime_type, vd.tamano_bytes, vd.subida_en,
                vd.comentario_entrega
         FROM titulacion.documentos d
         JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = d.proyecto_id AND pe.estudiante_id = $1 AND pe.activo
         JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
         WHERE d.activo
         ORDER BY d.id, vd.numero_version DESC`,
        [session.estudiante_id],
      ),
    ])

    const versionsByDocument = new Map()
    for (const version of versions.rows) {
      const current = versionsByDocument.get(version.documento_id) ?? []
      current.push(versionPayload(version))
      versionsByDocument.set(version.documento_id, current)
    }

    return response.json({
      documents: documents.rows.map((document) => ({
        id: document.id,
        projectId: document.proyecto_id,
        projectCode: document.codigo_seguimiento,
        name: document.nombre,
        type: document.tipo_documento,
        phase: document.fase_nombre,
        status: document.estado_nombre,
        canUploadVersion: document.permite_edicion_estudiante && document.tipo_documento === 'PERFIL_PROYECTO' && document.fase_codigo === 'REGISTRO',
        createdAt: document.creado_en,
        totalVersions: document.total_versiones,
        latest: document.latest_version_id ? versionPayload({
          version_id: document.latest_version_id,
          numero_version: document.latest_numero_version,
          nombre_archivo: document.latest_nombre_archivo,
          mime_type: document.latest_mime_type,
          tamano_bytes: document.latest_tamano_bytes,
          subida_en: document.latest_subida_en,
          comentario_entrega: null,
        }) : null,
        versions: versionsByDocument.get(document.id) ?? [],
      })),
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/documents/:documentId/download', requireStudent, async (request, response, next) => {
  try {
    const documentId = request.params.documentId
    const versionId = text(request.query.version)
    if (!isUuid(documentId) || (versionId && !isUuid(versionId))) {
      return response.status(400).json({ message: 'El documento solicitado no es válido.' })
    }

    const result = await pool.query(
      `SELECT d.proyecto_id, vd.nombre_archivo, vd.ruta_archivo
       FROM titulacion.documentos d
       JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = d.proyecto_id AND pe.estudiante_id = $1 AND pe.activo
       JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
       WHERE d.id = $2 AND d.activo
         AND ($3::uuid IS NULL OR vd.id = $3::uuid)
       ORDER BY vd.numero_version DESC
       LIMIT 1`,
      [request.session.estudiante_id, documentId, versionId || null],
    )
    const version = result.rows[0]
    if (!version) return response.status(404).json({ message: 'El archivo no está disponible para tu proyecto.' })

    const filePath = storedFilePath(version.ruta_archivo, version.proyecto_id)
    if (!filePath) return response.status(404).json({ message: 'La ruta del archivo no es válida.' })
    try {
      await access(filePath)
    } catch {
      return response.status(404).json({ message: 'El archivo ya no se encuentra en el almacenamiento local.' })
    }

    return response.download(filePath, path.basename(version.nombre_archivo), (error) => {
      if (error && !response.headersSent) next(error)
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/documents/:documentId/versions', requireStudent, upload.single('document'), async (request, response, next) => {
  let savedFilePath = null
  let databaseClient = null

  try {
    const documentId = request.params.documentId
    if (!isUuid(documentId)) return response.status(400).json({ message: 'El documento solicitado no es válido.' })
    if (!isWordDocument(request.file)) {
      return response.status(422).json({ message: 'Adjunta una nueva versión en formato Word (.doc o .docx).' })
    }

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const document = await databaseClient.query(
      `SELECT d.id, d.proyecto_id, d.tipo_documento, f.codigo AS fase_codigo,
              ep.permite_edicion_estudiante
       FROM titulacion.documentos d
       JOIN titulacion.proyectos p ON p.id = d.proyecto_id
       JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = p.id AND pe.estudiante_id = $1 AND pe.activo
       JOIN titulacion.fases f ON f.id = d.fase_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE d.id = $2 AND d.activo
       FOR UPDATE OF d`,
      [request.session.estudiante_id, documentId],
    )
    const selected = document.rows[0]
    if (!selected) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El documento no pertenece a tu proyecto.' })
    }
    if (!selected.permite_edicion_estudiante) {
      await databaseClient.query('ROLLBACK')
      return response.status(403).json({ message: 'El estado actual del proyecto no permite subir una nueva versión.' })
    }
    if (selected.tipo_documento !== 'PERFIL_PROYECTO' || selected.fase_codigo !== 'REGISTRO') {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Por ahora solo puedes versionar el perfil del proyecto en esta fase.' })
    }

    const number = await databaseClient.query(
      `SELECT COALESCE(max(numero_version), 0)::int + 1 AS siguiente
       FROM titulacion.versiones_documento
       WHERE documento_id = $1`,
      [selected.id],
    )
    const extension = path.extname(request.file.originalname).toLowerCase()
    const filename = `${crypto.randomUUID()}${extension}`
    const relativePath = path.posix.join('uploads', 'proyectos', selected.proyecto_id, selected.id, filename)
    savedFilePath = storedFilePath(relativePath, selected.proyecto_id)
    await mkdir(path.dirname(savedFilePath), { recursive: true })
    await writeFile(savedFilePath, request.file.buffer, { flag: 'wx' })

    const inserted = await databaseClient.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id AS version_id, numero_version, nombre_archivo, mime_type, tamano_bytes, subida_en, comentario_entrega`,
      [
        selected.id,
        number.rows[0].siguiente,
        path.basename(request.file.originalname),
        relativePath,
        request.file.mimetype || 'application/octet-stream',
        request.file.size,
        crypto.createHash('sha256').update(request.file.buffer).digest('hex'),
        request.session.usuario_id,
        text(request.body?.comment) || null,
      ],
    )
    await databaseClient.query('COMMIT')
    return response.status(201).json({
      message: `Se registró la versión ${inserted.rows[0].numero_version} del perfil.`,
      version: versionPayload(inserted.rows[0]),
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    if (savedFilePath) await rm(savedFilePath, { force: true }).catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/projects', requireStudent, upload.single('profile'), async (request, response, next) => {
  let savedFilePath = null
  let databaseClient = null

  try {
    const managementId = text(request.body?.managementId)
    const modalityId = text(request.body?.modalityId)
    const tutorId = text(request.body?.tutorId)
    const title = text(request.body?.title)
    const description = text(request.body?.description)
    const generalObjective = text(request.body?.generalObjective)
    let objectives = []

    try {
      objectives = JSON.parse(request.body?.objectives ?? '[]')
    } catch {
      return response.status(422).json({ message: 'Los objetivos específicos no tienen un formato válido.' })
    }

    const cleanObjectives = Array.isArray(objectives)
      ? objectives.map(text).filter(Boolean)
      : []

    if (title.length < 10 || description.length < 20 || generalObjective.length < 10 || !managementId || !modalityId || !tutorId || cleanObjectives.length === 0 || cleanObjectives.some((item) => item.length < 10)) {
      return response.status(422).json({ message: 'Revisa los campos: título (10), descripción (20) y cada objetivo (10) requieren la longitud mínima indicada.' })
    }

    if (!isWordDocument(request.file)) {
      return response.status(422).json({ message: 'Adjunta el perfil del proyecto en formato Word (.doc o .docx).' })
    }

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')

    const student = await databaseClient.query(
      `SELECT id, carrera_id
       FROM titulacion.estudiantes
       WHERE id = $1 AND usuario_id = $2 AND activo
       FOR UPDATE`,
      [request.session.estudiante_id, request.session.usuario_id],
    )
    if (!student.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(403).json({ message: 'No fue posible validar el perfil de estudiante.' })
    }

    const existing = await databaseClient.query(
      `SELECT p.codigo_seguimiento
       FROM titulacion.proyecto_estudiantes pe
       JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
       WHERE pe.estudiante_id = $1 AND pe.activo
       LIMIT 1`,
      [student.rows[0].id],
    )
    if (existing.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: `Ya tienes un proyecto activo (${existing.rows[0].codigo_seguimiento}).` })
    }

    const catalog = await databaseClient.query(
      `SELECT
         (SELECT id FROM titulacion.gestiones WHERE id = $1 AND activa) AS gestion_id,
         (SELECT id FROM titulacion.modalidades_titulacion WHERE id = $2 AND carrera_id = $3 AND activa) AS modalidad_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'REGISTRO' AND activa) AS fase_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'REGISTRADO') AS estado_id`,
      [managementId, modalityId, student.rows[0].carrera_id],
    )
    const values = catalog.rows[0]
    if (!values?.gestion_id || !values?.modalidad_id || !values?.fase_id || !values?.estado_id) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'La gestión o modalidad elegida ya no está disponible.' })
    }

    const tutor = await databaseClient.query(
      `SELECT d.id, u.id AS usuario_id, u.correo
       FROM titulacion.docentes d
       JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.codigo = 'TUTOR' AND r.activo
       WHERE d.id = $1 AND d.carrera_id = $2 AND d.activo
       LIMIT 1`,
      [tutorId, student.rows[0].carrera_id],
    )
    if (!tutor.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Selecciona un tutor disponible de la lista.' })
    }

    const project = await databaseClient.query(
      `INSERT INTO titulacion.proyectos
         (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id,
          titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, codigo_seguimiento`,
      [
        values.gestion_id,
        values.modalidad_id,
        values.fase_id,
        values.estado_id,
        title,
        description,
        generalObjective,
        request.session.usuario_id,
      ],
    )
    const createdProject = project.rows[0]

    await databaseClient.query(
      `INSERT INTO titulacion.proyecto_estudiantes
        (proyecto_id, estudiante_id, es_responsable_principal)
       VALUES ($1, $2, true)`,
      [createdProject.id, student.rows[0].id],
    )

    for (const [index, objective] of cleanObjectives.entries()) {
      await databaseClient.query(
        `INSERT INTO titulacion.objetivos_especificos (proyecto_id, numero, descripcion)
         VALUES ($1, $2, $3)`,
        [createdProject.id, index + 1, objective],
      )
    }

    await databaseClient.query(
      `INSERT INTO titulacion.asignaciones_proyecto
        (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, motivo_cambio)
       VALUES ($1, $2, 'TUTOR', $3, false, $4)`,
      [
        createdProject.id,
        tutor.rows[0].id,
        request.session.usuario_id,
        'Tutor propuesto por el estudiante en el Formulario 1; pendiente de respuesta del tutor.',
      ],
    )

    await createNotification(databaseClient, {
      userId: tutor.rows[0].usuario_id,
      recipientEmail: tutor.rows[0].correo,
      projectId: createdProject.id,
      type: 'SOLICITUD_TUTORIA',
      title: 'Nueva invitación de tutoría',
      message: `Tienes una invitación para acompañar el proyecto ${createdProject.codigo_seguimiento}. Responde desde el Portal del Tutor.`,
      link: '/tutor/invitaciones',
      queueEmail: true,
    })

    const extension = path.extname(request.file.originalname).toLowerCase()
    const filename = `${crypto.randomUUID()}${extension}`
    const relativePath = path.posix.join('uploads', 'proyectos', createdProject.id, filename)
    savedFilePath = path.join(process.cwd(), ...relativePath.split('/'))
    await mkdir(path.dirname(savedFilePath), { recursive: true })
    await writeFile(savedFilePath, request.file.buffer, { flag: 'wx' })

    const document = await databaseClient.query(
      `INSERT INTO titulacion.documentos
        (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
       VALUES ($1, $2, $3, 'PERFIL_PROYECTO', $4)
       RETURNING id`,
      [createdProject.id, values.fase_id, title, request.session.usuario_id],
    )
    await databaseClient.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        document.rows[0].id,
        path.basename(request.file.originalname),
        relativePath,
        request.file.mimetype || 'application/octet-stream',
        request.file.size,
        crypto.createHash('sha256').update(request.file.buffer).digest('hex'),
        request.session.usuario_id,
        'Perfil adjunto durante el registro del Formulario 1.',
      ],
    )

    await databaseClient.query(
      `INSERT INTO titulacion.historial_estados
        (proyecto_id, estado_nuevo_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
       VALUES ($1, $2, $3, $4, 'Registro inicial del Formulario 1 por el estudiante.')`,
      [createdProject.id, values.estado_id, values.fase_id, request.session.usuario_id],
    )

    await databaseClient.query('COMMIT')
    return response.status(201).json({
      message: `Proyecto registrado correctamente con el código ${createdProject.codigo_seguimiento}.`,
      project: { id: createdProject.id, code: createdProject.codigo_seguimiento },
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    if (savedFilePath) await rm(savedFilePath, { force: true }).catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(422).json({ message: 'El archivo Word no puede superar los 10 MB.' })
  }
  if (error instanceof multer.MulterError) {
    return response.status(422).json({ message: 'No fue posible procesar el archivo adjunto.' })
  }

  console.error(error)
  if (error?.code === '23505') {
    return response.status(409).json({ message: 'El registro ya existe o fue enviado anteriormente.' })
  }
  return response.status(500).json({ message: 'Ocurrió un error al comunicarse con el sistema. Intenta nuevamente.' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`API de Seguimiento de Titulación disponible en http://127.0.0.1:${port}`)
})
