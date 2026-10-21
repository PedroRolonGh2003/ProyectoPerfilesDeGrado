import 'dotenv/config'

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import nodemailer from 'nodemailer'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const sessionHours = Number(process.env.SESSION_HOURS ?? 12)
const rememberSessionDays = Number(process.env.REMEMBER_SESSION_DAYS ?? 30)
const confirmationHours = Number(process.env.EMAIL_CONFIRMATION_HOURS ?? 24)
const passwordResetHours = Number(process.env.PASSWORD_RESET_HOURS ?? 1)
const appBaseUrl = (process.env.APP_BASE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:5173')).replace(/\/$/, '')
const smtpHost = process.env.SMTP_HOST?.trim()
const smtpPort = Number(process.env.SMTP_PORT ?? 587)
const smtpUser = process.env.SMTP_USER?.trim()
const smtpPassword = process.env.SMTP_PASSWORD
const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465
const supportedRoles = ['ESTUDIANTE', 'TUTOR', 'REVISOR', 'ADMINISTRADOR']
const reviewFormatCriteria = ['TITULO', 'INDICE', 'ORDEN_GUIA', 'FORMATO', 'NUMERO_HOJAS', 'ETAPAS_INVESTIGACION', 'CRONOGRAMA', 'CITAS', 'REFERENCIAS', 'REDACCION']
const reviewBackgroundCriteria = ['PROBLEMA', 'JUSTIFICACION', 'FUENTES', 'ANALISIS_LITERATURA', 'PERSPECTIVA_TEORICA', 'VINCULO_TEORIA', 'VIABILIDAD_OBJETIVOS', 'COHERENCIA_OBJETIVOS', 'METODOLOGIA_PERTINENTE', 'METODOLOGIA_RESPONDE']
const privateDefenseCriteria = ['FUENTES_ACTUALIZADAS', 'ANALISIS_LITERATURA', 'METODOLOGIA', 'RESULTADOS_OBJETIVOS', 'CONCLUSIONES_OBJETIVOS']
const publicDefenseRatifications = ['SI', 'NO', 'PARCIALMENTE']
const databaseUrl = process.env.DATABASE_URL?.trim()
const initialization = { promise: null }
const reviewReminderIntervalMs = 60 * 60 * 1000

const mailTransport = smtpHost && smtpUser && smtpPassword && smtpFrom
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    })
  : null

const pool = new Pool(databaseUrl
  ? { connectionString: databaseUrl, options: '-c search_path=titulacion,public' }
  : {
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
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
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

async function createSession(response, request, account, { remember = false, databaseClient = pool } = {}) {
  const token = crypto.randomBytes(32).toString('base64url')
  const durationMs = remember
    ? rememberSessionDays * 24 * 60 * 60 * 1000
    : sessionHours * 60 * 60 * 1000
  const expiration = new Date(Date.now() + durationMs)

  await databaseClient.query(
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
}

function sanitizeUser(row) {
  const roles = Array.isArray(row.roles)
    ? row.roles.filter((role) => supportedRoles.includes(role))
    : []
  return {
    id: row.usuario_id,
    fullName: `${row.nombres} ${row.apellidos}`.trim(),
    email: row.correo,
    role: row.rol_codigo,
    roles: roles.length > 0 ? roles : [row.rol_codigo],
    studentId: row.estudiante_id,
    teacherId: row.docente_id,
    registration: row.registro_universitario,
    career: row.carrera_nombre ?? 'Sin carrera asignada',
  }
}

function notificationRole(row) {
  const link = row.enlace ?? ''
  if (link.startsWith('/tutor')) return 'TUTOR'
  if (link.startsWith('/revisor')) return 'REVISOR'
  if (link.startsWith('/admin')) return 'ADMINISTRADOR'
  return 'ESTUDIANTE'
}

function notificationPayload(row) {
  return {
    id: row.id,
    projectId: row.proyecto_id,
    type: row.tipo,
    title: row.titulo,
    message: row.mensaje,
    link: row.enlace,
    role: notificationRole(row),
    readAt: row.leida_en,
    createdAt: row.creada_en,
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
       c.nombre AS carrera_nombre,
       COALESCE((
         SELECT array_agg(available_role.codigo ORDER BY CASE available_role.codigo
           WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 WHEN 'REVISOR' THEN 3 WHEN 'ADMINISTRADOR' THEN 4 ELSE 5 END)
         FROM titulacion.usuario_roles available_user_role
         JOIN titulacion.roles available_role ON available_role.id = available_user_role.rol_id AND available_role.activo
         WHERE available_user_role.usuario_id = u.id
           AND available_user_role.activo
           AND available_role.codigo IN ('ESTUDIANTE', 'TUTOR', 'REVISOR', 'ADMINISTRADOR')
       ), ARRAY[r.codigo]) AS roles
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

async function requireReviewer(request, response, next) {
  try {
    const session = await sessionFromRequest(request)
    if (!session) return response.status(401).json({ message: 'Tu sesión no está activa. Inicia sesión nuevamente.' })
    if (session.rol_codigo !== 'REVISOR' || !session.docente_id) {
      return response.status(403).json({ message: 'Esta vista está disponible únicamente para revisores.' })
    }
    request.session = session
    return next()
  } catch (error) {
    return next(error)
  }
}

async function requireAdministrator(request, response, next) {
  try {
    const session = await sessionFromRequest(request)
    if (!session) return response.status(401).json({ message: 'Tu sesión no está activa. Inicia sesión nuevamente.' })
    if (session.rol_codigo !== 'ADMINISTRADOR') {
      return response.status(403).json({ message: 'Esta vista está disponible únicamente para Administración.' })
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

function reviewMatrix(value, expectedCodes, allowedValues) {
  if (!Array.isArray(value) || value.length !== expectedCodes.length) return null
  const rows = value.map((item) => ({ code: text(item?.code), value: text(item?.value).toUpperCase() }))
  if (new Set(rows.map((item) => item.code)).size !== expectedCodes.length || rows.some((item) => !expectedCodes.includes(item.code) || !allowedValues.includes(item.value))) return null
  return expectedCodes.map((code) => rows.find((item) => item.code === code))
}

function normalizedRoles(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((role) => typeof role === 'string')
    .map((role) => role.trim().toUpperCase())
    .filter((role) => supportedRoles.includes(role)))]
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function accountKind(email) {
  if (/^[^\s@]+@est\.univalle\.edu$/i.test(email)) return 'ESTUDIANTE'
  if (/^[^\s@]+@univalle\.edu$/i.test(email)) return 'DOCENTE'
  return null
}

export function initializeServerless() {
  initialization.promise ??= ensureRegistrationSchema()
  return initialization.promise
}

async function ensureRegistrationSchema() {
  await pool.query(`
    ALTER TABLE titulacion.rondas_revision
      ALTER COLUMN fecha_limite DROP NOT NULL;
  `)
  await pool.query(`
    UPDATE titulacion.rondas_revision
    SET fecha_limite = NULL
    WHERE cerrada_en IS NULL AND fecha_limite IS NOT NULL;
  `)
  await pool.query(`
    UPDATE titulacion.asignaciones_proyecto
    SET fecha_limite = NULL
    WHERE activo AND fecha_fin IS NULL AND fecha_limite IS NOT NULL;
  `)
  await pool.query(`
    ALTER TABLE titulacion.usuarios
      ADD COLUMN IF NOT EXISTS email_confirmado_en timestamptz;
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS titulacion.email_confirmation_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
      token_hash varchar(128) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      usado_en timestamptz,
      creado_en timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_email_confirmation_tokens_usuario
      ON titulacion.email_confirmation_tokens (usuario_id, creado_en DESC);
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_email_confirmation_tokens_expiracion
      ON titulacion.email_confirmation_tokens (expires_at);
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS titulacion.password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
      token_hash varchar(128) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      usado_en timestamptz,
      creado_en timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_usuario
      ON titulacion.password_reset_tokens (usuario_id, creado_en DESC);
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expiracion
      ON titulacion.password_reset_tokens (expires_at);
  `)
}

async function issueEmailConfirmation(databaseClient, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + confirmationHours * 60 * 60 * 1000)

  await databaseClient.query(
    `UPDATE titulacion.email_confirmation_tokens
     SET usado_en = now()
     WHERE usuario_id = $1 AND usado_en IS NULL AND expires_at > now()`,
    [userId],
  )
  await databaseClient.query(
    `INSERT INTO titulacion.email_confirmation_tokens (usuario_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  )
  return `${appBaseUrl}/?confirmToken=${encodeURIComponent(token)}`
}

async function sendEmailConfirmation({ email, name, confirmationUrl, kind }) {
  if (!mailTransport) {
    throw new Error('El envío de correo no está configurado. Configura SMTP antes de habilitar el registro público.')
  }

  const pendingRoleNote = kind === 'DOCENTE'
    ? 'Cuando confirmes tu correo, Administración deberá asignarte los roles correspondientes antes de que puedas ingresar.'
    : 'Cuando confirmes tu correo, podrás ingresar al Portal del Estudiante.'
  await mailTransport.sendMail({
    from: smtpFrom,
    to: email,
    subject: 'Confirma tu cuenta de Seguimiento de Titulación',
    text: `Hola ${name}. Confirma tu correo institucional abriendo este enlace:\n\n${confirmationUrl}\n\n${pendingRoleNote}\n\nEl enlace vence en ${confirmationHours} horas.`,
    html: `<p>Hola ${name}.</p><p>Confirma tu correo institucional para activar tu cuenta.</p><p><a href="${confirmationUrl}">Confirmar mi correo</a></p><p>${pendingRoleNote}</p><p>El enlace vence en ${confirmationHours} horas.</p>`,
  })
}

async function issuePasswordReset(databaseClient, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + passwordResetHours * 60 * 60 * 1000)

  await databaseClient.query(
    `UPDATE titulacion.password_reset_tokens
     SET usado_en = now()
     WHERE usuario_id = $1 AND usado_en IS NULL AND expires_at > now()`,
    [userId],
  )
  await databaseClient.query(
    `INSERT INTO titulacion.password_reset_tokens (usuario_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  )
  return `${appBaseUrl}/?resetToken=${encodeURIComponent(token)}`
}

async function sendPasswordResetEmail({ email, name, resetUrl }) {
  if (!mailTransport) {
    throw new Error('El envío de correo no está configurado. Configura SMTP antes de habilitar la recuperación de contraseñas.')
  }

  await mailTransport.sendMail({
    from: smtpFrom,
    to: email,
    subject: 'Restablece tu contraseña de Seguimiento de Titulación',
    text: `Hola ${name}. Recibimos una solicitud para cambiar tu contraseña. Abre este enlace para definir una nueva:\n\n${resetUrl}\n\nEl enlace vence en ${passwordResetHours} hora${passwordResetHours === 1 ? '' : 's'} y solo puede utilizarse una vez. Si no solicitaste este cambio, ignora este correo.`,
    html: `<p>Hola ${name}.</p><p>Recibimos una solicitud para cambiar tu contraseña.</p><p><a href="${resetUrl}">Crear una nueva contraseña</a></p><p>El enlace vence en ${passwordResetHours} hora${passwordResetHours === 1 ? '' : 's'} y solo puede utilizarse una vez.</p><p>Si no solicitaste este cambio, ignora este correo.</p>`,
  })
}

function administratorUserPayload(row) {
  return {
    id: row.id,
    firstName: row.nombres,
    lastName: row.apellidos,
    fullName: `${row.nombres} ${row.apellidos}`.trim(),
    email: row.correo,
    phone: row.telefono ?? '',
    active: row.activo,
    createdAt: row.creado_en,
    lastAccessAt: row.ultimo_acceso_en,
    roles: Array.isArray(row.roles) ? row.roles : [],
    careerId: row.carrera_id ?? null,
    career: row.carrera_nombre ?? 'Sin carrera asignada',
    studentId: row.estudiante_id ?? null,
    registration: row.registro_universitario ?? null,
    teacherId: row.docente_id ?? null,
    teacherCode: row.codigo_docente ?? null,
    specialty: row.especialidad ?? null,
    relatedProjects: Number(row.proyectos_estudiante ?? 0) + Number(row.proyectos_docente ?? 0),
  }
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

function isSupportingDocument(file) {
  if (!file?.buffer?.length) return false
  return new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.avi', '.mp3', '.wav', '.m4a'])
    .has(path.extname(file.originalname).toLowerCase())
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
    phaseCode: row.fase_codigo ?? null,
    status: row.estado_nombre,
    statusCode: row.estado_codigo,
    registeredAt: row.registrado_en,
    needsTutorProposal: Boolean(row.requiere_proponer_tutor),
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

async function saveLocalDocumentCopy(relativePath, projectId, content) {
  if (process.env.VERCEL) return null
  const filePath = storedFilePath(relativePath, projectId)
  if (!filePath) throw new Error('No fue posible preparar la ruta local del documento.')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, { flag: 'wx' })
  return filePath
}

async function sendStoredDocument(response, version) {
  if (version.contenido_archivo !== null && version.contenido_archivo !== undefined) {
    response.type(version.mime_type || 'application/octet-stream')
    response.attachment(path.basename(version.nombre_archivo))
    response.send(version.contenido_archivo)
    return true
  }

  const filePath = storedFilePath(version.ruta_archivo, version.proyecto_id)
  if (!filePath) return false
  try {
    await access(filePath)
  } catch {
    return false
  }
  response.download(filePath, path.basename(version.nombre_archivo))
  return true
}

function versionedDocumentFilename(documentName, versionNumber, originalFilename) {
  const extension = path.extname(originalFilename).toLowerCase()
  const baseName = text(documentName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'documento'
  const safeExtension = extension === '.doc' || extension === '.docx' ? extension : '.docx'
  return `${baseName}_v${versionNumber}${safeExtension}`
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

export async function runPendingReviewReminders({ databaseClient = null } = {}) {
  if (!databaseClient) await initializeServerless()
  const client = databaseClient ?? await pool.connect()
  const ownsClient = !databaseClient
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('titulacion.recordatorios_revision_pendiente'))`)
    const pendingReviews = await client.query(
      `SELECT r.id AS review_id, a.tipo AS assignment_type, u.id AS user_id,
              p.id AS project_id, p.codigo_seguimiento, rr.numero_ronda
       FROM titulacion.revisiones r
       JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id AND rr.cerrada_en IS NULL
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id AND a.activo AND a.fecha_fin IS NULL
       JOIN titulacion.docentes d ON d.id = a.docente_id
       JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
       JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
       JOIN titulacion.documentos document ON document.id = vd.documento_id
       JOIN titulacion.proyectos p ON p.id = document.proyecto_id
       WHERE r.decision = 'PENDIENTE'
         AND GREATEST(rr.fecha_solicitud, a.fecha_asignacion, COALESCE(a.respondida_en, a.fecha_asignacion)) <= now() - interval '2 days'
         AND NOT EXISTS (
           SELECT 1
           FROM titulacion.notificaciones notification
           WHERE notification.usuario_id = u.id
             AND notification.proyecto_id = p.id
             AND notification.tipo = 'RECORDATORIO_REVISION_PENDIENTE'
             AND notification.creada_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'
         )
       FOR UPDATE OF r`,
    )
    for (const review of pendingReviews.rows) {
      const isTutor = review.assignment_type === 'TUTOR'
      await createNotification(client, {
        userId: review.user_id,
        projectId: review.project_id,
        type: 'RECORDATORIO_REVISION_PENDIENTE',
        title: 'Recordatorio de revisión pendiente',
        message: `Han pasado más de dos días desde que se habilitó la ronda ${review.numero_ronda} del proyecto ${review.codigo_seguimiento}. Ingresa y registra tu dictamen.`,
        link: isTutor ? '/tutor/proyectos' : '/revisor/pendientes',
      })
    }
    await client.query('COMMIT')
    return pendingReviews.rows.length
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    if (ownsClient) client.release()
  }
}

async function recordAudit(databaseClient, session, { projectId = null, action, entity, entityId = null, detail = {} }) {
  await databaseClient.query(
    `INSERT INTO titulacion.auditoria
      (usuario_id, rol_activo_id, sesion_id, proyecto_id, accion, entidad, entidad_id, detalle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [session.usuario_id, session.rol_id, session.sesion_id, projectId, action, entity, entityId, JSON.stringify(detail)],
  )
}

async function recordProjectStatus(databaseClient, { projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason }) {
  if (previousStateId === nextStateId && previousPhaseId === nextPhaseId) return
  await databaseClient.query(
    `INSERT INTO titulacion.historial_estados
      (proyecto_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [projectId, previousStateId, nextStateId, previousPhaseId, nextPhaseId, userId, reason],
  )
}

async function ensurePrivateDefenseDocument(databaseClient, { projectId, title, createdByUserId }) {
  const phase = await databaseClient.query(`SELECT id FROM titulacion.fases WHERE codigo='DOCUMENTO_PRIVADO' AND activa`)
  if (!phase.rows[0]) throw new Error('Falta la fase DOCUMENTO_PRIVADO.')
  const existing = await databaseClient.query(
    `SELECT id FROM titulacion.documentos
     WHERE proyecto_id=$1 AND tipo_documento='DOCUMENTO_PRIVADO' AND activo
     ORDER BY creado_en DESC LIMIT 1`,
    [projectId],
  )
  if (existing.rows[0]) return existing.rows[0]
  const created = await databaseClient.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1,$2,$3,'DOCUMENTO_PRIVADO',$4) RETURNING id`,
    [projectId, phase.rows[0].id, `Documento para defensa privada - ${title}`, createdByUserId],
  )
  return created.rows[0]
}

async function ensurePublicDefenseDocument(databaseClient, { projectId, title, createdByUserId }) {
  const phase = await databaseClient.query(`SELECT id FROM titulacion.fases WHERE codigo='DOCUMENTO_PUBLICO' AND activa`)
  if (!phase.rows[0]) throw new Error('Falta la fase DOCUMENTO_PUBLICO.')
  const existing = await databaseClient.query(
    `SELECT id FROM titulacion.documentos
     WHERE proyecto_id=$1 AND tipo_documento='DOCUMENTO_PUBLICO' AND activo
     ORDER BY creado_en DESC LIMIT 1`,
    [projectId],
  )
  if (existing.rows[0]) return existing.rows[0]
  const created = await databaseClient.query(
    `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
     VALUES ($1,$2,$3,'DOCUMENTO_PUBLICO',$4) RETURNING id`,
    [projectId, phase.rows[0].id, `Documento final para defensa pública - ${title}`, createdByUserId],
  )
  return created.rows[0]
}

async function schedulePrivateDefenseReview(databaseClient, { project, documentId, versionId, versionNumber, session }) {
  const assignments = await databaseClient.query(
    `SELECT a.id AS assignment_id, a.tipo, teacher.usuario_id, user_account.correo
     FROM titulacion.asignaciones_proyecto a
     JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
     JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id AND user_account.activo
     WHERE a.proyecto_id = $1
       AND a.tipo IN ('TUTOR', 'REVISOR_1', 'REVISOR_2')
       AND a.activo AND a.fecha_fin IS NULL
     ORDER BY a.tipo
     FOR UPDATE OF a`,
    [project.id],
  )
  const participants = assignments.rows
  const requiredTypes = new Set(['TUTOR', 'REVISOR_1', 'REVISOR_2'])
  if (participants.length !== 3 || participants.some((item) => !requiredTypes.has(item.tipo)) || new Set(participants.map((item) => item.tipo)).size !== 3) {
    throw new Error('El proyecto necesita un tutor confirmado y dos revisores activos antes de enviar el documento a defensa privada.')
  }
  const openRound = await databaseClient.query(
    `SELECT rr.id FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     WHERE vd.documento_id = $1 AND rr.cerrada_en IS NULL
     FOR UPDATE OF rr`,
    [documentId],
  )
  if (openRound.rows[0]) throw new Error('Ya existe una ronda de revisión abierta para este documento.')
  const catalog = await databaseClient.query(
    `SELECT
       (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PRIVADO' AND activa) AS phase_id,
       (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PRIVADO') AS state_id`,
  )
  if (!catalog.rows[0].phase_id || !catalog.rows[0].state_id) throw new Error('Faltan catálogos para la revisión de defensa privada.')
  const previous = await databaseClient.query(
    `SELECT COALESCE(max(rr.numero_ronda), 0)::int AS round_number
     FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     WHERE vd.documento_id = $1`,
    [documentId],
  )
  const round = await databaseClient.query(
    `INSERT INTO titulacion.rondas_revision
       (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [versionId, catalog.rows[0].phase_id, previous.rows[0].round_number + 1, session.usuario_id],
  )
  await databaseClient.query(
    `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
     SELECT $1, unnest($2::uuid[])`,
    [round.rows[0].id, participants.map((item) => item.assignment_id)],
  )
  for (const participant of participants) {
    await createNotification(databaseClient, {
      userId: participant.usuario_id,
      recipientEmail: participant.correo,
      projectId: project.id,
      type: 'DEFENSA_PRIVADA_ASIGNADA',
      title: 'Documento para defensa privada pendiente de revisión',
      message: `El estudiante envió la versión V${versionNumber} del documento ${project.codigo_seguimiento}. Ingresa para registrar tu dictamen.`,
      link: participant.tipo === 'TUTOR' ? '/tutor/proyectos' : '/revisor/pendientes',
    })
  }
  await recordProjectStatus(databaseClient, {
    projectId: project.id,
    previousStateId: project.estado_actual_id,
    nextStateId: catalog.rows[0].state_id,
    previousPhaseId: project.fase_actual_id,
    nextPhaseId: catalog.rows[0].phase_id,
    userId: session.usuario_id,
    reason: `Documento para defensa privada V${versionNumber} enviado al tutor y a los dos revisores.`,
  })
  await recordAudit(databaseClient, session, {
    projectId: project.id,
    action: 'ENVIAR_DOCUMENTO_DEFENSA_PRIVADA_A_REVISION',
    entity: 'rondas_revision',
    entityId: round.rows[0].id,
    detail: { documentId, versionId, reviewAssignments: participants.map((item) => item.assignment_id) },
  })
  return { scheduled: true, roundId: round.rows[0].id }
}

async function schedulePublicDefenseReview(databaseClient, { project, documentId, versionId, versionNumber, session }) {
  const assignments = await databaseClient.query(
    `SELECT a.id AS assignment_id, a.tipo, teacher.usuario_id, user_account.correo
     FROM titulacion.asignaciones_proyecto a
     JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
     JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id AND user_account.activo
     WHERE a.proyecto_id = $1
       AND a.tipo IN ('TUTOR', 'REVISOR_1', 'REVISOR_2')
       AND a.activo AND a.fecha_fin IS NULL
     ORDER BY a.tipo
     FOR UPDATE OF a`,
    [project.id],
  )
  const participants = assignments.rows
  const requiredTypes = new Set(['TUTOR', 'REVISOR_1', 'REVISOR_2'])
  if (participants.length !== 3 || participants.some((item) => !requiredTypes.has(item.tipo)) || new Set(participants.map((item) => item.tipo)).size !== 3) {
    throw new Error('El proyecto necesita un tutor confirmado y dos revisores activos antes de enviar el documento a defensa pública.')
  }
  const openRound = await databaseClient.query(
    `SELECT rr.id FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     WHERE vd.documento_id = $1 AND rr.cerrada_en IS NULL
     FOR UPDATE OF rr`,
    [documentId],
  )
  if (openRound.rows[0]) throw new Error('Ya existe una ronda de revisión abierta para este documento.')
  const catalog = await databaseClient.query(
    `SELECT
       (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PUBLICO' AND activa) AS phase_id,
       (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PUBLICO') AS state_id`,
  )
  if (!catalog.rows[0].phase_id || !catalog.rows[0].state_id) throw new Error('Faltan catálogos para la revisión de defensa pública.')
  const previous = await databaseClient.query(
    `SELECT COALESCE(max(rr.numero_ronda), 0)::int AS round_number
     FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     WHERE vd.documento_id = $1`,
    [documentId],
  )
  const round = await databaseClient.query(
    `INSERT INTO titulacion.rondas_revision
       (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [versionId, catalog.rows[0].phase_id, previous.rows[0].round_number + 1, session.usuario_id],
  )
  await databaseClient.query(
    `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
     SELECT $1, unnest($2::uuid[])`,
    [round.rows[0].id, participants.map((item) => item.assignment_id)],
  )
  for (const participant of participants) {
    await createNotification(databaseClient, {
      userId: participant.usuario_id,
      recipientEmail: participant.correo,
      projectId: project.id,
      type: 'DEFENSA_PUBLICA_ASIGNADA',
      title: 'Documento para defensa pública pendiente de revisión',
      message: `El estudiante envió la versión V${versionNumber} del documento final ${project.codigo_seguimiento}. Ingresa para registrar tu dictamen.`,
      link: participant.tipo === 'TUTOR' ? '/tutor/proyectos' : '/revisor/pendientes',
    })
  }
  await recordProjectStatus(databaseClient, {
    projectId: project.id,
    previousStateId: project.estado_actual_id,
    nextStateId: catalog.rows[0].state_id,
    previousPhaseId: project.fase_actual_id,
    nextPhaseId: catalog.rows[0].phase_id,
    userId: session.usuario_id,
    reason: `Documento final V${versionNumber} enviado al tutor y a los dos revisores para defensa pública.`,
  })
  await recordAudit(databaseClient, session, {
    projectId: project.id,
    action: 'ENVIAR_DOCUMENTO_DEFENSA_PUBLICA_A_REVISION',
    entity: 'rondas_revision',
    entityId: round.rows[0].id,
    detail: { documentId, versionId, reviewAssignments: participants.map((item) => item.assignment_id) },
  })
  return { scheduled: true, roundId: round.rows[0].id }
}

async function scheduleCorrectionReview(databaseClient, { project, documentId, versionId, versionNumber, session }) {
  const previousRoundResult = await databaseClient.query(
    `SELECT rr.id, rr.numero_ronda
     FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento source_version ON source_version.id = rr.version_documento_id
     WHERE source_version.documento_id = $1
       AND rr.cerrada_en IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM titulacion.revisiones r
         WHERE r.ronda_revision_id = rr.id AND r.decision IN ('OBSERVADO', 'RECHAZADO')
       )
     ORDER BY rr.numero_ronda DESC
     LIMIT 1
     FOR UPDATE OF rr`,
    [documentId],
  )
  const previousRound = previousRoundResult.rows[0]
  if (!previousRound) return { scheduled: false, reason: null }

  const observations = await databaseClient.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE o.version_documento_respuesta_id = $2)::int AS linked_to_version
     FROM titulacion.observaciones o
     JOIN titulacion.revisiones r ON r.id = o.revision_id
     WHERE r.ronda_revision_id = $1`,
    [previousRound.id, versionId],
  )
  const observationStatus = observations.rows[0]
  if (observationStatus.total === 0 || observationStatus.total !== observationStatus.linked_to_version) {
    return { scheduled: false, reason: 'pending-observations' }
  }

  const reviewers = await databaseClient.query(
    `SELECT a.id AS asignacion_proyecto_id, a.tipo,
            teacher.usuario_id, user_account.correo
     FROM titulacion.asignaciones_proyecto a
     JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
     JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id AND user_account.activo
     WHERE a.proyecto_id = $1
       AND a.tipo IN ('REVISOR_1', 'REVISOR_2')
       AND a.activo AND a.fecha_fin IS NULL
     ORDER BY a.tipo
     FOR UPDATE OF a`,
    [project.id],
  )
  const activeReviewers = reviewers.rows
  if (activeReviewers.length !== 2 || new Set(activeReviewers.map((reviewer) => reviewer.tipo)).size !== 2) {
    return { scheduled: false, reason: 'reviewers-unavailable' }
  }
  const tutorResult = await databaseClient.query(
    `SELECT a.id AS asignacion_proyecto_id, a.tipo, teacher.usuario_id, user_account.correo
     FROM titulacion.asignaciones_proyecto a
     JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
     JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id AND user_account.activo
     WHERE a.proyecto_id = $1 AND a.tipo = 'TUTOR' AND a.activo AND a.fecha_fin IS NULL
     ORDER BY a.fecha_asignacion DESC
     LIMIT 1
     FOR UPDATE OF a`,
    [project.id],
  )
  const activeTutor = tutorResult.rows[0]
  if (!activeTutor) return { scheduled: false, reason: 'tutor-unavailable' }
  const reviewParticipants = [...activeReviewers, activeTutor]

  const openRound = await databaseClient.query(
    `SELECT rr.id
     FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     WHERE vd.documento_id = $1 AND rr.cerrada_en IS NULL
     FOR UPDATE OF rr`,
    [documentId],
  )
  if (openRound.rows[0]) return { scheduled: false, reason: 'open-round' }

  const catalog = await databaseClient.query(
    `SELECT
       (SELECT id FROM titulacion.fases WHERE codigo = 'REVISION_PERFIL' AND activa) AS phase_id,
       (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_REVISION') AS state_id`,
  )
  if (!catalog.rows[0].phase_id || !catalog.rows[0].state_id) throw new Error('Faltan catálogos para reenviar la corrección a revisión.')

  const round = await databaseClient.query(
    `INSERT INTO titulacion.rondas_revision
      (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [versionId, catalog.rows[0].phase_id, previousRound.numero_ronda + 1, session.usuario_id],
  )
  await databaseClient.query(
    `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
     SELECT $1, unnest($2::uuid[])`,
    [round.rows[0].id, reviewParticipants.map((reviewer) => reviewer.asignacion_proyecto_id)],
  )
  for (const reviewer of reviewParticipants) {
    await createNotification(databaseClient, {
      userId: reviewer.usuario_id,
      projectId: project.id,
      type: 'CORRECCION_PENDIENTE_REVISION',
      title: 'Corrección pendiente de revisión',
      message: `El estudiante adjuntó la versión V${versionNumber} corregida del perfil ${project.codigo_seguimiento}. Ingresa para registrar tu dictamen.`,
      link: reviewer.tipo === 'TUTOR' ? '/tutor/proyectos' : '/revisor/pendientes',
    })
  }
  await recordProjectStatus(databaseClient, {
    projectId: project.id,
    previousStateId: project.estado_actual_id,
    nextStateId: catalog.rows[0].state_id,
    previousPhaseId: project.fase_actual_id,
    nextPhaseId: catalog.rows[0].phase_id,
    userId: session.usuario_id,
    reason: `Ronda ${previousRound.numero_ronda + 1} iniciada con la versión V${versionNumber} corregida por el estudiante.`,
  })
  await recordAudit(databaseClient, session, {
    projectId: project.id,
    action: 'REENVIAR_CORRECCION_A_REVISION',
    entity: 'rondas_revision',
    entityId: round.rows[0].id,
    detail: { previousRoundId: previousRound.id, versionId, reviewAssignments: reviewParticipants.map((reviewer) => reviewer.asignacion_proyecto_id) },
  })
  return { scheduled: true, roundId: round.rows[0].id }
}

async function lockedProject(databaseClient, projectId) {
  const project = await databaseClient.query(
    `SELECT p.id, p.codigo_seguimiento, p.titulo_tentativo, p.estado_actual_id, p.fase_actual_id,
            ep.codigo AS estado_codigo, g.carrera_id
     FROM titulacion.proyectos p
     JOIN titulacion.gestiones g ON g.id = p.gestion_id
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     WHERE p.id = $1
     FOR UPDATE`,
    [projectId],
  )
  return project.rows[0] ?? null
}

async function staffWithRole(databaseClient, { teacherId, careerId, roleCode }) {
  const staff = await databaseClient.query(
    `SELECT d.id, d.usuario_id, trim(concat(u.nombres, ' ', u.apellidos)) AS name, u.correo
     FROM titulacion.docentes d
     JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
     JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
     JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = $3
     WHERE d.id = $1 AND d.carrera_id = $2 AND d.activo`,
    [teacherId, careerId, roleCode],
  )
  return staff.rows[0] ?? null
}

async function openReviewRoundForProject(databaseClient, projectId) {
  const result = await databaseClient.query(
    `SELECT rr.id
     FROM titulacion.rondas_revision rr
     JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
     JOIN titulacion.documentos d ON d.id = vd.documento_id
     WHERE d.proyecto_id = $1 AND rr.cerrada_en IS NULL
     ORDER BY rr.fecha_solicitud DESC
     LIMIT 1
     FOR UPDATE OF rr`,
    [projectId],
  )
  return result.rows[0] ?? null
}

async function transferPendingReview(databaseClient, { round, previousAssignmentId, replacementAssignmentId }) {
  if (!round || !previousAssignmentId) return { transferred: false, reviewId: null }
  const pending = await databaseClient.query(
    `SELECT id
     FROM titulacion.revisiones
     WHERE ronda_revision_id = $1
       AND asignacion_proyecto_id = $2
       AND decision = 'PENDIENTE'
     FOR UPDATE`,
    [round.id, previousAssignmentId],
  )
  const review = pending.rows[0]
  if (!review) return { transferred: false, reviewId: null }
  await databaseClient.query(
    `UPDATE titulacion.revisiones
     SET asignacion_proyecto_id = $2
     WHERE id = $1`,
    [review.id, replacementAssignmentId],
  )
  return { transferred: true, reviewId: review.id }
}

async function replaceProjectAssignment(databaseClient, { project, type, staff, assignedByUserId }) {
  const current = await databaseClient.query(
    `SELECT id, docente_id, activo, fecha_fin
     FROM titulacion.asignaciones_proyecto
     WHERE proyecto_id = $1 AND tipo = $2
       AND (activo OR ($2 = 'TUTOR' AND NOT activo AND fecha_fin IS NULL))
     ORDER BY activo DESC, fecha_asignacion DESC
     FOR UPDATE`,
    [project.id, type],
  )
  const activeAssignment = current.rows.find((item) => item.activo) ?? null
  const pendingTutorAssignment = type === 'TUTOR'
    ? current.rows.find((item) => !item.activo && !item.fecha_fin) ?? null
    : null
  if (activeAssignment?.docente_id === staff.id || (!activeAssignment && pendingTutorAssignment?.docente_id === staff.id)) {
    return { changed: false, assignmentId: activeAssignment?.id ?? pendingTutorAssignment?.id ?? null, pendingReviewTransferred: false, pendingTutorHandoff: false }
  }

  const openRound = await openReviewRoundForProject(databaseClient, project.id)
  const pendingTutorHandoff = type === 'TUTOR' && Boolean(activeAssignment && openRound)
  const assignmentsToFinish = pendingTutorHandoff
    ? current.rows.filter((item) => !item.activo)
    : current.rows

  if (assignmentsToFinish.length > 0) {
    await databaseClient.query(
      `UPDATE titulacion.asignaciones_proyecto
       SET activo = false,
           fecha_fin = now(),
           motivo_cambio = $2
       WHERE id = ANY($1::uuid[])`,
      [
        assignmentsToFinish.map((item) => item.id),
        `${type === 'TUTOR' ? 'Tutoría' : 'Revisión'} reasignada por Administración.`,
      ],
    )
  }

  const assignment = await databaseClient.query(
    `INSERT INTO titulacion.asignaciones_proyecto
      (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, motivo_cambio)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      project.id,
      staff.id,
      type,
      assignedByUserId,
      type !== 'TUTOR',
      type === 'TUTOR'
        ? pendingTutorHandoff
          ? 'Tutor propuesto para reemplazar la tutoría durante una ronda abierta; pendiente de aceptación.'
          : 'Tutor asignado por Administración; pendiente de aceptación.'
        : 'Revisor asignado por Administración.',
    ],
  )

  const pendingReview = type === 'TUTOR'
    ? { transferred: false, reviewId: null }
    : await transferPendingReview(databaseClient, {
        round: openRound,
        previousAssignmentId: activeAssignment?.id ?? null,
        replacementAssignmentId: assignment.rows[0].id,
      })

  if (type === 'TUTOR') {
    await createNotification(databaseClient, {
      userId: staff.usuario_id,
      recipientEmail: staff.correo,
      projectId: project.id,
      type: 'SOLICITUD_TUTORIA',
      title: 'Nueva invitación de tutoría',
      message: pendingTutorHandoff
        ? `Administración te propone reemplazar la tutoría del proyecto ${project.codigo_seguimiento}. El tutor actual mantiene la evaluación pendiente hasta que respondas.`
        : `Administración te invita a acompañar el proyecto ${project.codigo_seguimiento}. Responde desde el Portal del Tutor.`,
      link: '/tutor/invitaciones',
      queueEmail: true,
    })
  } else {
    await createNotification(databaseClient, {
      userId: staff.usuario_id,
      projectId: project.id,
      type: pendingReview.transferred ? 'REVISION_REASIGNADA' : 'ASIGNACION_REVISION',
      title: pendingReview.transferred ? 'Revisión pendiente reasignada' : 'Designación como revisor',
      message: pendingReview.transferred
        ? `Administración te asignó la evaluación pendiente del proyecto ${project.codigo_seguimiento}. Ingresa para registrar tu dictamen.`
        : `Administración te designó como ${type === 'REVISOR_1' ? 'Revisor 1' : 'Revisor 2'} del proyecto ${project.codigo_seguimiento}. Recibirás otro aviso cuando el perfil esté disponible para evaluación.`,
      link: pendingReview.transferred ? '/revisor/pendientes' : '/revisor',
    })
  }
  return {
    changed: true,
    assignmentId: assignment.rows[0].id,
    previousAssignmentId: activeAssignment?.id ?? null,
    pendingReviewTransferred: pendingReview.transferred,
    pendingTutorHandoff,
    roundId: openRound?.id ?? null,
  }
}

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/cron/review-reminders', async (request, response, next) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.get('authorization') !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ message: 'No autorizado.' })
  }
  try {
    const sent = await runPendingReviewReminders()
    return response.json({ sent })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/register-options', async (_request, response, next) => {
  try {
    const careers = await pool.query(
      `SELECT id, codigo, nombre
       FROM titulacion.carreras
       WHERE activa
       ORDER BY nombre`,
    )
    return response.json({ careers: careers.rows.map((career) => ({ id: career.id, code: career.codigo, name: career.nombre })) })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/register', async (request, response, next) => {
  let databaseClient = null
  try {
    await initializeServerless()
    const firstName = text(request.body?.firstName)
    const lastName = text(request.body?.lastName)
    const email = text(request.body?.email).toLowerCase()
    const password = request.body?.password
    const confirmPassword = request.body?.confirmPassword
    const careerId = text(request.body?.careerId)
    const kind = accountKind(email)

    if (firstName.length < 2 || lastName.length < 2) {
      return response.status(422).json({ message: 'Ingresa nombres y apellidos de al menos 2 caracteres.' })
    }
    if (!kind) {
      return response.status(422).json({ message: 'Usa @est.univalle.edu para estudiantes o @univalle.edu para docentes.' })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return response.status(422).json({ message: 'La contraseña debe tener al menos 8 caracteres.' })
    }
    if (password !== confirmPassword) {
      return response.status(422).json({ message: 'Las contraseñas no coinciden.' })
    }
    if (kind === 'ESTUDIANTE' && !isUuid(careerId)) {
      return response.status(422).json({ message: 'Selecciona tu carrera para crear tu perfil de estudiante.' })
    }

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const existing = await databaseClient.query(
      `SELECT id, nombres, correo, activo
       FROM titulacion.usuarios
       WHERE lower(correo) = $1
       FOR UPDATE`,
      [email],
    )
    if (existing.rows[0]) {
      if (!existing.rows[0].activo) {
        const confirmationUrl = await issueEmailConfirmation(databaseClient, existing.rows[0].id)
        await databaseClient.query('COMMIT')
        try {
          await sendEmailConfirmation({ email, name: existing.rows[0].nombres, confirmationUrl, kind })
          return response.status(202).json({ message: 'Esta cuenta aún no fue confirmada. Enviamos un nuevo enlace a tu correo institucional.' })
        } catch (error) {
          console.error('[registration] No fue posible reenviar la confirmación:', error instanceof Error ? error.message : error)
          return response.status(503).json({ message: 'La cuenta está pendiente de confirmación, pero no pudimos enviar el correo. Intenta nuevamente más tarde.' })
        }
      }
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Ya existe una cuenta registrada con ese correo institucional.' })
    }

    let studentRoleId = null
    if (kind === 'ESTUDIANTE') {
      const [career, studentRole] = await Promise.all([
        databaseClient.query(`SELECT id FROM titulacion.carreras WHERE id = $1 AND activa`, [careerId]),
        databaseClient.query(`SELECT id FROM titulacion.roles WHERE codigo = 'ESTUDIANTE' AND activo`),
      ])
      if (!career.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(422).json({ message: 'La carrera seleccionada no está disponible.' })
      }
      if (!studentRole.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(500).json({ message: 'El rol de estudiante no está disponible.' })
      }
      studentRoleId = studentRole.rows[0].id
    }

    const user = await databaseClient.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash, activo)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id`,
      [firstName, lastName, email, await bcrypt.hash(password, 12)],
    )
    const userId = user.rows[0].id

    if (kind === 'ESTUDIANTE') {
      const internalRegistration = `EST-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      await databaseClient.query(
        `INSERT INTO titulacion.usuario_roles (usuario_id, rol_id, activo, asignado_por_usuario_id)
         VALUES ($1, $2, true, $1)`,
        [userId, studentRoleId],
      )
      await databaseClient.query(
        `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario, activo)
         VALUES ($1, $2, $3, true)`,
        [userId, careerId, internalRegistration],
      )
    }

    const confirmationUrl = await issueEmailConfirmation(databaseClient, userId)
    await databaseClient.query('COMMIT')

    try {
      await sendEmailConfirmation({ email, name: firstName, confirmationUrl, kind })
    } catch (error) {
      console.error('[registration] No fue posible enviar la confirmación:', error instanceof Error ? error.message : error)
      return response.status(503).json({ message: 'La cuenta fue creada, pero no pudimos enviar el correo de confirmación. Intenta reenviarlo más tarde.' })
    }

    const message = kind === 'ESTUDIANTE'
      ? 'Revisa tu correo institucional para confirmar tu cuenta. Luego podrás iniciar sesión como estudiante.'
      : 'Revisa tu correo institucional para confirmar tu cuenta. Después, Administración deberá asignarte los roles correspondientes.'
    return response.status(201).json({ message })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/auth/resend-confirmation', async (request, response, next) => {
  let databaseClient = null
  const genericMessage = 'Si existe una cuenta pendiente para ese correo, recibirás un nuevo enlace de confirmación.'
  try {
    await initializeServerless()
    const email = text(request.body?.email).toLowerCase()
    if (!accountKind(email)) return response.json({ message: genericMessage })

    const account = await pool.query(
      `SELECT id, nombres, correo
       FROM titulacion.usuarios
       WHERE lower(correo) = $1 AND activo = false
       LIMIT 1`,
      [email],
    )
    if (!account.rows[0]) return response.json({ message: genericMessage })

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const confirmationUrl = await issueEmailConfirmation(databaseClient, account.rows[0].id)
    await databaseClient.query('COMMIT')
    await sendEmailConfirmation({
      email: account.rows[0].correo,
      name: account.rows[0].nombres,
      confirmationUrl,
      kind: accountKind(account.rows[0].correo),
    })
    return response.json({ message: genericMessage })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/auth/request-password-reset', async (request, response, next) => {
  let databaseClient = null
  const genericMessage = 'Si existe una cuenta activa para ese correo, recibirás un enlace para cambiar tu contraseña.'
  try {
    await initializeServerless()
    const email = text(request.body?.email).toLowerCase()
    if (!accountKind(email)) return response.json({ message: genericMessage })

    const account = await pool.query(
      `SELECT id, nombres, correo
       FROM titulacion.usuarios
       WHERE lower(correo) = $1 AND activo
       LIMIT 1`,
      [email],
    )
    if (!account.rows[0]) return response.json({ message: genericMessage })

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const resetUrl = await issuePasswordReset(databaseClient, account.rows[0].id)
    await databaseClient.query('COMMIT')
    await sendPasswordResetEmail({
      email: account.rows[0].correo,
      name: account.rows[0].nombres,
      resetUrl,
    })
    return response.json({ message: genericMessage })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/auth/reset-password', async (request, response, next) => {
  let databaseClient = null
  try {
    await initializeServerless()
    const token = text(request.body?.token)
    const password = request.body?.password
    const confirmPassword = request.body?.confirmPassword
    if (!token) return response.status(400).json({ message: 'El enlace para cambiar la contraseña no es válido.' })
    if (typeof password !== 'string' || password.length < 8) {
      return response.status(422).json({ message: 'La contraseña debe tener al menos 8 caracteres.' })
    }
    if (password !== confirmPassword) {
      return response.status(422).json({ message: 'Las contraseñas no coinciden.' })
    }

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const reset = await databaseClient.query(
      `SELECT prt.id, prt.usuario_id
       FROM titulacion.password_reset_tokens prt
       JOIN titulacion.usuarios u ON u.id = prt.usuario_id AND u.activo
       WHERE prt.token_hash = $1 AND prt.usado_en IS NULL AND prt.expires_at > now()
       FOR UPDATE OF prt, u`,
      [hashToken(token)],
    )
    if (!reset.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(410).json({ message: 'El enlace para cambiar la contraseña venció, ya fue utilizado o no es válido.' })
    }

    await databaseClient.query(
      `UPDATE titulacion.usuarios
       SET password_hash = $1, actualizado_en = now()
       WHERE id = $2`,
      [await bcrypt.hash(password, 12), reset.rows[0].usuario_id],
    )
    await databaseClient.query(
      `UPDATE titulacion.password_reset_tokens
       SET usado_en = now()
       WHERE id = $1`,
      [reset.rows[0].id],
    )
    await databaseClient.query(
      `UPDATE titulacion.sesiones_usuario
       SET cerrada_en = COALESCE(cerrada_en, now())
       WHERE usuario_id = $1 AND cerrada_en IS NULL`,
      [reset.rows[0].usuario_id],
    )
    await databaseClient.query('COMMIT')
    return response.json({ message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.' })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/auth/confirm-email', async (request, response, next) => {
  let databaseClient = null
  try {
    await initializeServerless()
    const token = text(request.body?.token)
    if (!token) return response.status(400).json({ message: 'El enlace de confirmación no es válido.' })

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const confirmation = await databaseClient.query(
      `SELECT ect.id, ect.usuario_id, u.correo, u.nombres, u.apellidos
       FROM titulacion.email_confirmation_tokens ect
       JOIN titulacion.usuarios u ON u.id = ect.usuario_id AND u.activo = false
       WHERE ect.token_hash = $1 AND ect.usado_en IS NULL AND ect.expires_at > now()
       FOR UPDATE OF ect, u`,
      [hashToken(token)],
    )
    if (!confirmation.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(410).json({ message: 'El enlace de confirmación venció, ya fue utilizado o no es válido.' })
    }

    const kind = accountKind(confirmation.rows[0].correo)
    await databaseClient.query(
      `UPDATE titulacion.usuarios
       SET activo = true, email_confirmado_en = now(), actualizado_en = now()
       WHERE id = $1`,
      [confirmation.rows[0].usuario_id],
    )
    await databaseClient.query(
      `UPDATE titulacion.email_confirmation_tokens
       SET usado_en = now()
       WHERE id = $1`,
      [confirmation.rows[0].id],
    )
    if (kind === 'DOCENTE') {
      const administrators = await databaseClient.query(
        `SELECT u.id AS usuario_id, u.correo
         FROM titulacion.usuarios u
         JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
         JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = 'ADMINISTRADOR'
         WHERE u.activo`,
      )
      const teacherName = `${confirmation.rows[0].nombres} ${confirmation.rows[0].apellidos}`.trim()
      for (const administrator of administrators.rows) {
        await createNotification(databaseClient, {
          userId: administrator.usuario_id,
          recipientEmail: administrator.correo,
          type: 'DOCENTE_CONFIRMADO_SIN_ROL',
          title: 'Nuevo docente confirmado',
          message: `${teacherName} confirmó su correo institucional y espera la asignación de roles.`,
          link: '/admin/nuevos-docentes',
          queueEmail: true,
        })
      }
    }
    await databaseClient.query('COMMIT')
    if (kind === 'ESTUDIANTE') {
      const student = await databaseClient.query(
        `SELECT
           u.id AS usuario_id,
           u.nombres,
           u.apellidos,
           u.correo,
           r.id AS rol_id,
           r.codigo AS rol_codigo,
           e.id AS estudiante_id,
           e.registro_universitario,
           NULL::uuid AS docente_id,
           c.nombre AS carrera_nombre,
           ARRAY['ESTUDIANTE']::text[] AS roles
         FROM titulacion.usuarios u
         JOIN titulacion.estudiantes e ON e.usuario_id = u.id AND e.activo
         JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
         JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = 'ESTUDIANTE'
         LEFT JOIN titulacion.carreras c ON c.id = e.carrera_id AND c.activa
         WHERE u.id = $1 AND u.activo
         LIMIT 1`,
        [confirmation.rows[0].usuario_id],
      )

      if (!student.rows[0]) {
        return response.status(500).json({ message: 'El correo fue confirmado, pero no se pudo iniciar tu sesión. Intenta ingresar normalmente.' })
      }

      await createSession(response, request, student.rows[0], { databaseClient })
      return response.json({
        message: 'Correo confirmado. Iniciamos tu sesión como estudiante.',
        autoLogin: true,
        user: sanitizeUser(student.rows[0]),
      })
    }

    return response.json({
      message: 'Correo confirmado. Administración debe asignarte uno o más roles antes de que puedas iniciar sesión.',
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
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
         c.nombre AS carrera_nombre,
         COALESCE((
           SELECT array_agg(available_role.codigo ORDER BY CASE available_role.codigo
             WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 WHEN 'REVISOR' THEN 3 WHEN 'ADMINISTRADOR' THEN 4 ELSE 5 END)
           FROM titulacion.usuario_roles available_user_role
           JOIN titulacion.roles available_role ON available_role.id = available_user_role.rol_id AND available_role.activo
           WHERE available_user_role.usuario_id = u.id
             AND available_user_role.activo
             AND available_role.codigo IN ('ESTUDIANTE', 'TUTOR', 'REVISOR', 'ADMINISTRADOR')
         ), ARRAY[r.codigo]) AS roles
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
           OR (r.codigo = 'REVISOR' AND d.id IS NOT NULL)
           OR r.codigo = 'ADMINISTRADOR'
         )
       ORDER BY CASE r.codigo WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 WHEN 'REVISOR' THEN 3 WHEN 'ADMINISTRADOR' THEN 4 ELSE 5 END
       LIMIT 1`,
      [identifier],
    )

    const account = result.rows[0]
    if (!account) {
      const restricted = await pool.query(
        `SELECT password_hash, activo
         FROM titulacion.usuarios
         WHERE lower(correo) = $1
         LIMIT 1`,
        [identifier],
      )
      if (restricted.rows[0] && await bcrypt.compare(password, restricted.rows[0].password_hash)) {
        const message = restricted.rows[0].activo
          ? 'Tu correo fue confirmado. Administración debe asignarte un rol antes de que puedas ingresar.'
          : 'Confirma el enlace enviado a tu correo institucional antes de iniciar sesión.'
        return response.status(403).json({ message })
      }
      return response.status(401).json({ message: 'Correo o contraseña incorrectos.' })
    }
    if (!(await bcrypt.compare(password, account.password_hash))) {
      return response.status(401).json({ message: 'Correo o contraseña incorrectos.' })
    }

    await createSession(response, request, account, { remember })
    return response.json({ user: sanitizeUser(account) })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/session', requireSession, (request, response) => {
  response.json({ user: sanitizeUser(request.session) })
})

app.post('/api/auth/active-role', requireSession, async (request, response, next) => {
  try {
    const roleCode = text(request.body?.role).toUpperCase()
    if (!supportedRoles.includes(roleCode)) {
      return response.status(422).json({ message: 'El rol seleccionado no es válido.' })
    }

    const availableRole = await pool.query(
      `SELECT r.id, r.codigo
       FROM titulacion.usuario_roles ur
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo
       LEFT JOIN titulacion.estudiantes e ON e.usuario_id = ur.usuario_id AND e.activo
       LEFT JOIN titulacion.docentes d ON d.usuario_id = ur.usuario_id AND d.activo
       WHERE ur.usuario_id = $1
         AND ur.activo
         AND r.codigo = $2
         AND (
           (r.codigo = 'ESTUDIANTE' AND e.id IS NOT NULL)
           OR (r.codigo IN ('TUTOR', 'REVISOR') AND d.id IS NOT NULL)
           OR r.codigo = 'ADMINISTRADOR'
         )
       LIMIT 1`,
      [request.session.usuario_id, roleCode],
    )
    if (!availableRole.rows[0]) {
      return response.status(403).json({ message: 'No tienes acceso a la vista seleccionada.' })
    }

    await pool.query(
      `UPDATE titulacion.sesiones_usuario
       SET rol_activo_id = $1
       WHERE id = $2 AND usuario_id = $3 AND cerrada_en IS NULL`,
      [availableRole.rows[0].id, request.session.sesion_id, request.session.usuario_id],
    )
    const updatedSession = await sessionFromRequest(request)
    return response.json({ user: sanitizeUser(updatedSession) })
  } catch (error) {
    return next(error)
  }
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
    return response.json({ notifications: notifications.rows.map(notificationPayload), unreadCount: unread.rows[0].total })
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

app.get('/api/admin/users', requireAdministrator, async (request, response, next) => {
  try {
    const search = text(request.query?.search).slice(0, 100)
    const role = text(request.query?.role).toUpperCase()
    const active = text(request.query?.active).toLowerCase()
    const filters = []
    const values = []

    if (search) {
      values.push(`%${search}%`)
      filters.push(`(
        u.nombres ILIKE $${values.length}
        OR u.apellidos ILIKE $${values.length}
        OR u.correo ILIKE $${values.length}
        OR COALESCE(e.registro_universitario, '') ILIKE $${values.length}
        OR COALESCE(d.codigo_docente, '') ILIKE $${values.length}
      )`)
    }
    if (supportedRoles.includes(role)) {
      values.push(role)
      filters.push(`EXISTS (
        SELECT 1
        FROM titulacion.usuario_roles filtered_user_role
        JOIN titulacion.roles filtered_role ON filtered_role.id = filtered_user_role.rol_id
        WHERE filtered_user_role.usuario_id = u.id
          AND filtered_user_role.activo
          AND filtered_role.activo
          AND filtered_role.codigo = $${values.length}
      )`)
    }
    if (active === 'true' || active === 'false') {
      values.push(active === 'true')
      filters.push(`u.activo = $${values.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const [users, roles, careers] = await Promise.all([
      pool.query(
        `SELECT u.id, u.nombres, u.apellidos, u.correo, u.telefono, u.activo, u.creado_en, u.ultimo_acceso_en,
                e.id AS estudiante_id, e.registro_universitario,
                d.id AS docente_id, d.codigo_docente, d.especialidad,
                COALESCE(ec.id, dc.id) AS carrera_id,
                COALESCE(ec.nombre, dc.nombre) AS carrera_nombre,
                COALESCE(user_roles.roles, ARRAY[]::text[]) AS roles,
                COALESCE(student_projects.total, 0)::int AS proyectos_estudiante,
                COALESCE(teacher_projects.total, 0)::int AS proyectos_docente
         FROM titulacion.usuarios u
         LEFT JOIN titulacion.estudiantes e ON e.usuario_id = u.id
         LEFT JOIN titulacion.docentes d ON d.usuario_id = u.id
         LEFT JOIN titulacion.carreras ec ON ec.id = e.carrera_id
         LEFT JOIN titulacion.carreras dc ON dc.id = d.carrera_id
         LEFT JOIN LATERAL (
           SELECT array_agg(r.codigo ORDER BY CASE r.codigo
             WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 WHEN 'REVISOR' THEN 3 WHEN 'ADMINISTRADOR' THEN 4 ELSE 5 END) AS roles
           FROM titulacion.usuario_roles ur
           JOIN titulacion.roles r ON r.id = ur.rol_id
           WHERE ur.usuario_id = u.id AND ur.activo AND r.activo
         ) user_roles ON true
         LEFT JOIN LATERAL (
           SELECT count(DISTINCT pe.proyecto_id)::int AS total
           FROM titulacion.proyecto_estudiantes pe
           WHERE pe.estudiante_id = e.id AND pe.activo
         ) student_projects ON true
         LEFT JOIN LATERAL (
           SELECT count(DISTINCT a.proyecto_id)::int AS total
           FROM titulacion.asignaciones_proyecto a
           WHERE a.docente_id = d.id AND (a.activo OR (a.tipo = 'TUTOR' AND a.fecha_fin IS NULL))
         ) teacher_projects ON true
         ${where}
         ORDER BY u.activo DESC, u.apellidos, u.nombres
         LIMIT 250`,
        values,
      ),
      pool.query(
        `SELECT codigo, nombre
         FROM titulacion.roles
         WHERE activo AND codigo = ANY($1::text[])
         ORDER BY CASE codigo
           WHEN 'ESTUDIANTE' THEN 1 WHEN 'TUTOR' THEN 2 WHEN 'REVISOR' THEN 3 WHEN 'ADMINISTRADOR' THEN 4 ELSE 5 END`,
        [supportedRoles],
      ),
      pool.query(`SELECT id, codigo, nombre FROM titulacion.carreras WHERE activa ORDER BY nombre`),
    ])

    const userRows = users.rows.map(administratorUserPayload)
    const summary = userRows.reduce((total, user) => ({
      total: total.total + 1,
      active: total.active + (user.active ? 1 : 0),
      students: total.students + (user.roles.includes('ESTUDIANTE') ? 1 : 0),
      staff: total.staff + (user.roles.some((item) => item === 'TUTOR' || item === 'REVISOR') ? 1 : 0),
    }), { total: 0, active: 0, students: 0, staff: 0 })

    return response.json({
      users: userRows,
      summary,
      roles: roles.rows.map((item) => ({ code: item.codigo, name: item.nombre })),
      careers: careers.rows.map((item) => ({ id: item.id, code: item.codigo, name: item.nombre })),
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/admin/users', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const firstName = text(request.body?.firstName)
    const lastName = text(request.body?.lastName)
    const email = text(request.body?.email).toLowerCase()
    const phone = text(request.body?.phone)
    const password = request.body?.password
    const roles = normalizedRoles(request.body?.roles)
    const careerId = text(request.body?.careerId)
    const registration = text(request.body?.registration)
    const teacherCode = text(request.body?.teacherCode)
    const specialty = text(request.body?.specialty)
    const needsStudent = roles.includes('ESTUDIANTE')
    const needsTeacher = roles.some((role) => role === 'TUTOR' || role === 'REVISOR')

    if (firstName.length < 2 || lastName.length < 2 || !isEmail(email) || typeof password !== 'string' || password.length < 8 || roles.length === 0) {
      return response.status(422).json({ message: 'Completa nombres, apellidos, correo válido, contraseña de al menos 8 caracteres y al menos un rol.' })
    }
    if ((needsStudent || needsTeacher) && !isUuid(careerId)) {
      return response.status(422).json({ message: 'Selecciona la carrera para el perfil de estudiante o docente.' })
    }
    if (needsStudent && registration.length < 4) return response.status(422).json({ message: 'Registra el número de matrícula del estudiante.' })
    if (needsTeacher && teacherCode.length < 4) return response.status(422).json({ message: 'Registra el código docente.' })

    await databaseClient.query('BEGIN')
    const existing = await databaseClient.query(`SELECT id FROM titulacion.usuarios WHERE lower(correo) = lower($1) FOR UPDATE`, [email])
    if (existing.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Ya existe un usuario con ese correo.' })
    }
    if (needsStudent || needsTeacher) {
      const career = await databaseClient.query(`SELECT id FROM titulacion.carreras WHERE id = $1 AND activa`, [careerId])
      if (!career.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(422).json({ message: 'La carrera seleccionada no está disponible.' })
      }
    }
    if (needsStudent) {
      const existingRegistration = await databaseClient.query(`SELECT id FROM titulacion.estudiantes WHERE registro_universitario = $1`, [registration])
      if (existingRegistration.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'La matrícula ya pertenece a otro estudiante.' })
      }
    }
    if (needsTeacher) {
      const existingTeacherCode = await databaseClient.query(`SELECT id FROM titulacion.docentes WHERE codigo_docente = $1`, [teacherCode])
      if (existingTeacherCode.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'El código docente ya pertenece a otra persona.' })
      }
    }

    const user = await databaseClient.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash, telefono)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [firstName, lastName, email, await bcrypt.hash(password, 10), phone || null],
    )
    const roleRows = await databaseClient.query(`SELECT id, codigo FROM titulacion.roles WHERE activo AND codigo = ANY($1::text[])`, [roles])
    if (roleRows.rows.length !== roles.length) throw new Error('No fue posible validar todos los roles seleccionados.')
    await Promise.all(roleRows.rows.map((role) => databaseClient.query(
      `INSERT INTO titulacion.usuario_roles (usuario_id, rol_id, asignado_por_usuario_id)
       VALUES ($1, $2, $3)`,
      [user.rows[0].id, role.id, request.session.usuario_id],
    )))
    if (needsStudent) {
      await databaseClient.query(
        `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
         VALUES ($1, $2, $3)`,
        [user.rows[0].id, careerId, registration],
      )
    }
    if (needsTeacher) {
      await databaseClient.query(
        `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad)
         VALUES ($1, $2, $3, $4)`,
        [user.rows[0].id, careerId, teacherCode, specialty || null],
      )
    }
    await recordAudit(databaseClient, request.session, {
      action: 'CREAR_USUARIO',
      entity: 'usuarios',
      entityId: user.rows[0].id,
      detail: { email, roles },
    })
    await databaseClient.query('COMMIT')
    return response.status(201).json({ message: 'El usuario fue creado correctamente.', userId: user.rows[0].id })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.patch('/api/admin/users/:userId', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const userId = request.params.userId
    const firstName = text(request.body?.firstName)
    const lastName = text(request.body?.lastName)
    const email = text(request.body?.email).toLowerCase()
    const phone = text(request.body?.phone)
    const password = request.body?.password
    const roles = normalizedRoles(request.body?.roles)
    const careerId = text(request.body?.careerId)
    const registration = text(request.body?.registration)
    const teacherCode = text(request.body?.teacherCode)
    const specialty = text(request.body?.specialty)
    const active = typeof request.body?.active === 'boolean' ? request.body.active : null
    const needsStudent = roles.includes('ESTUDIANTE')
    const needsTeacher = roles.some((role) => role === 'TUTOR' || role === 'REVISOR')

    if (!isUuid(userId) || firstName.length < 2 || lastName.length < 2 || !isEmail(email) || roles.length === 0 || active === null) {
      return response.status(422).json({ message: 'Completa los datos básicos, selecciona al menos un rol y define el estado del usuario.' })
    }
    if (typeof password !== 'undefined' && typeof password !== 'string') return response.status(422).json({ message: 'La contraseña no es válida.' })
    if (typeof password === 'string' && password.length > 0 && password.length < 8) return response.status(422).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres.' })
    if ((needsStudent || needsTeacher) && !isUuid(careerId)) return response.status(422).json({ message: 'Selecciona la carrera para el perfil de estudiante o docente.' })
    if (needsStudent && registration.length < 4) return response.status(422).json({ message: 'Registra el número de matrícula del estudiante.' })
    if (needsTeacher && teacherCode.length < 4) return response.status(422).json({ message: 'Registra el código docente.' })
    if (userId === request.session.usuario_id && (!active || !roles.includes('ADMINISTRADOR'))) {
      return response.status(422).json({ message: 'No puedes quitar tu propio acceso administrativo ni desactivar tu cuenta desde esta sesión.' })
    }

    await databaseClient.query('BEGIN')
    const user = await databaseClient.query(`SELECT id FROM titulacion.usuarios WHERE id = $1 FOR UPDATE`, [userId])
    if (!user.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El usuario no existe.' })
    }
    if (needsStudent || needsTeacher) {
      const career = await databaseClient.query(`SELECT id FROM titulacion.carreras WHERE id = $1 AND activa`, [careerId])
      if (!career.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(422).json({ message: 'La carrera seleccionada no está disponible.' })
      }
    }
    const duplicateEmail = await databaseClient.query(`SELECT id FROM titulacion.usuarios WHERE lower(correo) = lower($1) AND id <> $2`, [email, userId])
    if (duplicateEmail.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Ya existe otro usuario con ese correo.' })
    }
    const [student, teacher] = await Promise.all([
      databaseClient.query(`SELECT id FROM titulacion.estudiantes WHERE usuario_id = $1 FOR UPDATE`, [userId]),
      databaseClient.query(`SELECT id FROM titulacion.docentes WHERE usuario_id = $1 FOR UPDATE`, [userId]),
    ])
    if (student.rows[0] && (!active || !needsStudent)) {
      const activeProject = await databaseClient.query(
        `SELECT 1
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
         JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
         WHERE pe.estudiante_id = $1 AND pe.activo AND ep.codigo NOT IN ('ANULADO', 'FINALIZADO')
         LIMIT 1`,
        [student.rows[0].id],
      )
      if (activeProject.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'No puedes desactivar el perfil de estudiante mientras tenga un proyecto activo.' })
      }
    }
    if (teacher.rows[0] && (!active || !needsTeacher)) {
      const activeAssignment = await databaseClient.query(
        `SELECT 1 FROM titulacion.asignaciones_proyecto
         WHERE docente_id = $1 AND (activo OR (tipo = 'TUTOR' AND fecha_fin IS NULL))
         LIMIT 1`,
        [teacher.rows[0].id],
      )
      if (activeAssignment.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'No puedes desactivar el perfil docente mientras tenga asignaciones activas o invitaciones pendientes.' })
      }
    }
    if (needsStudent) {
      const duplicateRegistration = await databaseClient.query(`SELECT id FROM titulacion.estudiantes WHERE registro_universitario = $1 AND usuario_id <> $2`, [registration, userId])
      if (duplicateRegistration.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'La matrícula ya pertenece a otro estudiante.' })
      }
    }
    if (needsTeacher) {
      const duplicateTeacherCode = await databaseClient.query(`SELECT id FROM titulacion.docentes WHERE codigo_docente = $1 AND usuario_id <> $2`, [teacherCode, userId])
      if (duplicateTeacherCode.rows[0]) {
        await databaseClient.query('ROLLBACK')
        return response.status(409).json({ message: 'El código docente ya pertenece a otra persona.' })
      }
    }

    await databaseClient.query(
      `UPDATE titulacion.usuarios
       SET nombres = $2, apellidos = $3, correo = $4, telefono = $5, activo = $6,
           password_hash = CASE WHEN $7::text = '' THEN password_hash ELSE $8 END,
           actualizado_en = now()
       WHERE id = $1`,
      [userId, firstName, lastName, email, phone || null, active, typeof password === 'string' ? password : '', typeof password === 'string' && password ? await bcrypt.hash(password, 10) : null],
    )
    const [allRoleRows, targetRoleRows] = await Promise.all([
      databaseClient.query(
        `SELECT ur.id, ur.activo, r.codigo
         FROM titulacion.usuario_roles ur
         JOIN titulacion.roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         FOR UPDATE`,
        [userId],
      ),
      databaseClient.query(`SELECT id, codigo FROM titulacion.roles WHERE activo AND codigo = ANY($1::text[])`, [roles]),
    ])
    if (targetRoleRows.rows.length !== roles.length) throw new Error('No fue posible validar todos los roles seleccionados.')
    const wasPendingTeacher = needsTeacher && !allRoleRows.rows.some((item) => item.activo && ['TUTOR', 'REVISOR'].includes(item.codigo))
    for (const existingRole of allRoleRows.rows) {
      if (!roles.includes(existingRole.codigo)) {
        await databaseClient.query(
          `UPDATE titulacion.usuario_roles
           SET activo = false, retirado_en = COALESCE(retirado_en, now())
           WHERE id = $1`,
          [existingRole.id],
        )
      }
    }
    for (const role of targetRoleRows.rows) {
      const existingRole = allRoleRows.rows.find((item) => item.codigo === role.codigo)
      if (existingRole) {
        await databaseClient.query(
          `UPDATE titulacion.usuario_roles
           SET activo = true, retirado_en = NULL, asignado_por_usuario_id = $2
           WHERE id = $1`,
          [existingRole.id, request.session.usuario_id],
        )
      } else {
        await databaseClient.query(
          `INSERT INTO titulacion.usuario_roles (usuario_id, rol_id, activo, asignado_por_usuario_id)
           VALUES ($1, $2, true, $3)`,
          [userId, role.id, request.session.usuario_id],
        )
      }
    }
    if (needsStudent) {
      if (student.rows[0]) {
        await databaseClient.query(
          `UPDATE titulacion.estudiantes
           SET carrera_id = $2, registro_universitario = $3, activo = $4
           WHERE id = $1`,
          [student.rows[0].id, careerId, registration, active],
        )
      } else {
        await databaseClient.query(
          `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario, activo)
           VALUES ($1, $2, $3, $4)`,
          [userId, careerId, registration, active],
        )
      }
    } else if (student.rows[0]) {
      await databaseClient.query(`UPDATE titulacion.estudiantes SET activo = false WHERE id = $1`, [student.rows[0].id])
    }
    if (needsTeacher) {
      if (teacher.rows[0]) {
        await databaseClient.query(
          `UPDATE titulacion.docentes
           SET carrera_id = $2, codigo_docente = $3, especialidad = $4, activo = $5
           WHERE id = $1`,
          [teacher.rows[0].id, careerId, teacherCode, specialty || null, active],
        )
      } else {
        await databaseClient.query(
          `INSERT INTO titulacion.docentes (usuario_id, carrera_id, codigo_docente, especialidad, activo)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, careerId, teacherCode, specialty || null, active],
        )
      }
    } else if (teacher.rows[0]) {
      await databaseClient.query(`UPDATE titulacion.docentes SET activo = false WHERE id = $1`, [teacher.rows[0].id])
    }
    if (!active) {
      await databaseClient.query(`UPDATE titulacion.sesiones_usuario SET cerrada_en = COALESCE(cerrada_en, now()) WHERE usuario_id = $1`, [userId])
    }
    if (active && wasPendingTeacher) {
      await createNotification(databaseClient, {
        userId,
        recipientEmail: email,
        type: 'ROLES_DOCENTE_ASIGNADOS',
        title: 'Roles docentes asignados',
        message: 'Administración asignó tus roles docentes. Ya puedes iniciar sesión en el sistema.',
        queueEmail: true,
      })
    }
    await recordAudit(databaseClient, request.session, {
      action: active ? 'ACTUALIZAR_USUARIO' : 'DESACTIVAR_USUARIO',
      entity: 'usuarios',
      entityId: userId,
      detail: { email, roles, active },
    })
    await databaseClient.query('COMMIT')
    return response.json({ message: active ? 'El usuario fue actualizado correctamente.' : 'El usuario fue desactivado sin eliminar su historial.' })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.get('/api/admin/project-catalog', requireAdministrator, async (_request, response, next) => {
  try {
    const [managements, modalities, students] = await Promise.all([
      pool.query(
        `SELECT g.id, g.codigo, g.nombre, g.carrera_id
         FROM titulacion.gestiones g
         WHERE g.activa
         ORDER BY g.fecha_inicio DESC, g.nombre`,
      ),
      pool.query(
        `SELECT m.id, m.codigo, m.nombre, m.carrera_id
         FROM titulacion.modalidades_titulacion m
         WHERE m.activa
         ORDER BY m.nombre`,
      ),
      pool.query(
        `SELECT e.id, e.carrera_id, e.registro_universitario,
                trim(concat(u.nombres, ' ', u.apellidos)) AS nombre,
                c.nombre AS carrera_nombre
         FROM titulacion.estudiantes e
         JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
         JOIN titulacion.carreras c ON c.id = e.carrera_id AND c.activa
         WHERE e.activo
           AND NOT EXISTS (
             SELECT 1
             FROM titulacion.proyecto_estudiantes pe
             JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
             JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
             WHERE pe.estudiante_id = e.id AND pe.activo AND ep.codigo NOT IN ('ANULADO', 'FINALIZADO')
           )
         ORDER BY u.apellidos, u.nombres`,
      ),
    ])
    return response.json({
      managements: managements.rows.map((item) => ({ id: item.id, code: item.codigo, name: item.nombre, careerId: item.carrera_id })),
      modalities: modalities.rows.map((item) => ({ id: item.id, code: item.codigo, name: item.nombre, careerId: item.carrera_id })),
      students: students.rows.map((item) => ({ id: item.id, name: item.nombre, registration: item.registro_universitario, careerId: item.carrera_id, career: item.carrera_nombre })),
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/admin/projects', requireAdministrator, upload.single('profile'), async (request, response, next) => {
  let savedFilePath = null
  let databaseClient = null
  try {
    const studentId = text(request.body?.studentId)
    const managementId = text(request.body?.managementId)
    const modalityId = text(request.body?.modalityId)
    const title = text(request.body?.title)
    const description = text(request.body?.description)
    const generalObjective = text(request.body?.generalObjective)
    let objectives = []

    try {
      objectives = JSON.parse(request.body?.objectives ?? '[]')
    } catch {
      return response.status(422).json({ message: 'Los objetivos específicos no tienen un formato válido.' })
    }
    const cleanObjectives = Array.isArray(objectives) ? objectives.map(text).filter(Boolean) : []
    if (!isUuid(studentId) || !isUuid(managementId) || !isUuid(modalityId) || title.length < 10 || description.length < 20 || generalObjective.length < 10 || cleanObjectives.length === 0 || cleanObjectives.some((item) => item.length < 10)) {
      return response.status(422).json({ message: 'Completa estudiante, gestión, modalidad, título, descripción, objetivo general y al menos un objetivo específico válido.' })
    }
    if (!isWordDocument(request.file)) return response.status(422).json({ message: 'Adjunta el perfil inicial en formato Word (.doc o .docx).' })

    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const student = await databaseClient.query(
      `SELECT e.id, e.carrera_id, u.id AS usuario_id
       FROM titulacion.estudiantes e
       JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
       WHERE e.id = $1 AND e.activo
       FOR UPDATE`,
      [studentId],
    )
    if (!student.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'El estudiante seleccionado no está disponible.' })
    }
    const existingProject = await databaseClient.query(
      `SELECT 1
       FROM titulacion.proyecto_estudiantes pe
       JOIN titulacion.proyectos p ON p.id = pe.proyecto_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE pe.estudiante_id = $1 AND pe.activo AND ep.codigo NOT IN ('ANULADO', 'FINALIZADO')
       LIMIT 1`,
      [studentId],
    )
    if (existingProject.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'El estudiante ya participa en un proyecto activo.' })
    }
    const catalog = await databaseClient.query(
      `SELECT
         (SELECT id FROM titulacion.gestiones WHERE id = $1 AND carrera_id = $3 AND activa) AS gestion_id,
         (SELECT id FROM titulacion.modalidades_titulacion WHERE id = $2 AND carrera_id = $3 AND activa) AS modalidad_id,
         (SELECT id FROM titulacion.fases WHERE codigo = 'REGISTRO' AND activa) AS fase_id,
         (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'REGISTRADO') AS estado_id`,
      [managementId, modalityId, student.rows[0].carrera_id],
    )
    const values = catalog.rows[0]
    if (!values?.gestion_id || !values?.modalidad_id || !values?.fase_id || !values?.estado_id) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'La gestión o modalidad no corresponde a la carrera del estudiante.' })
    }
    const project = await databaseClient.query(
      `INSERT INTO titulacion.proyectos
        (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id,
         titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, codigo_seguimiento`,
      [values.gestion_id, values.modalidad_id, values.fase_id, values.estado_id, title, description, generalObjective, request.session.usuario_id],
    )
    const createdProject = project.rows[0]
    await databaseClient.query(
      `INSERT INTO titulacion.proyecto_estudiantes (proyecto_id, estudiante_id, es_responsable_principal)
       VALUES ($1, $2, true)`,
      [createdProject.id, studentId],
    )
    for (const [index, objective] of cleanObjectives.entries()) {
      await databaseClient.query(
        `INSERT INTO titulacion.objetivos_especificos (proyecto_id, numero, descripcion)
         VALUES ($1, $2, $3)`,
        [createdProject.id, index + 1, objective],
      )
    }
    const extension = path.extname(request.file.originalname).toLowerCase()
    const filename = `${crypto.randomUUID()}${extension}`
    const relativePath = path.posix.join('uploads', 'proyectos', createdProject.id, filename)
    savedFilePath = path.join(process.cwd(), ...relativePath.split('/'))
    await mkdir(path.dirname(savedFilePath), { recursive: true })
    await writeFile(savedFilePath, request.file.buffer, { flag: 'wx' })
    const document = await databaseClient.query(
      `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
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
        versionedDocumentFilename(title, 1, request.file.originalname),
        relativePath,
        request.file.mimetype || 'application/octet-stream',
        request.file.size,
        crypto.createHash('sha256').update(request.file.buffer).digest('hex'),
        request.session.usuario_id,
        'Perfil inicial registrado por Administración.',
      ],
    )
    await databaseClient.query(
      `INSERT INTO titulacion.historial_estados
        (proyecto_id, estado_nuevo_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
       VALUES ($1, $2, $3, $4, 'Registro inicial creado por Administración.')`,
      [createdProject.id, values.estado_id, values.fase_id, request.session.usuario_id],
    )
    await recordAudit(databaseClient, request.session, {
      projectId: createdProject.id,
      action: 'CREAR_PROYECTO_ADMINISTRACION',
      entity: 'proyectos',
      entityId: createdProject.id,
      detail: { studentId, title },
    })
    await databaseClient.query('COMMIT')
    return response.status(201).json({
      message: `El proyecto fue registrado con el código ${createdProject.codigo_seguimiento}.`,
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

app.get('/api/admin/dashboard', requireAdministrator, async (request, response, next) => {
  try {
    const search = text(request.query?.search).slice(0, 100)
    const status = text(request.query?.status).toUpperCase().slice(0, 80)
    const filters = []
    const values = []

    if (search) {
      values.push(`%${search}%`)
      filters.push(`(
        vp.codigo_seguimiento ILIKE $${values.length}
        OR vp.titulo_tentativo ILIKE $${values.length}
        OR vp.estudiantes ILIKE $${values.length}
        OR vp.tutor ILIKE $${values.length}
      )`)
    }
    if (status) {
      values.push(status)
      filters.push(`vp.estado_codigo = $${values.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const [projects, statuses, pendingTeachers] = await Promise.all([
      pool.query(
        `WITH vista_proyectos AS (
           SELECT p.id,
                  p.codigo_seguimiento,
                  p.titulo_tentativo,
                  p.registrado_en,
                  g.nombre AS gestion_nombre,
                  m.nombre AS modalidad_nombre,
                  f.codigo AS fase_codigo,
                  f.nombre AS fase_nombre,
                  ep.codigo AS estado_codigo,
                  ep.nombre AS estado_nombre,
                  ep.es_final,
                  students.estudiantes,
                  tutor.nombre AS tutor,
                  tutor.pendiente AS tutoria_pendiente,
                  tutor.confirmada AS tutoria_confirmada,
                  reviewers.asignados AS revisores_asignados,
                  reviews.revisiones_pendientes,
                  reviews.rondas_creadas
           FROM titulacion.proyectos p
           JOIN titulacion.gestiones g ON g.id = p.gestion_id
           JOIN titulacion.modalidades_titulacion m ON m.id = p.modalidad_id
           JOIN titulacion.fases f ON f.id = p.fase_actual_id
           JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
           LEFT JOIN LATERAL (
             SELECT string_agg(trim(concat(u.nombres, ' ', u.apellidos)), ', ' ORDER BY u.apellidos, u.nombres) AS estudiantes
             FROM titulacion.proyecto_estudiantes pe
             JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
             JOIN titulacion.usuarios u ON u.id = e.usuario_id
             WHERE pe.proyecto_id = p.id AND pe.activo
           ) students ON true
           LEFT JOIN LATERAL (
             SELECT string_agg(trim(concat(u.nombres, ' ', u.apellidos)), ', ' ORDER BY a.fecha_asignacion DESC) FILTER (
                      WHERE a.tipo = 'TUTOR' AND a.fecha_fin IS NULL
                    ) AS nombre,
                    COALESCE(bool_or(a.tipo = 'TUTOR' AND NOT a.activo AND a.fecha_fin IS NULL), false) AS pendiente,
                    COALESCE(bool_or(a.tipo = 'TUTOR' AND a.activo), false) AS confirmada
             FROM titulacion.asignaciones_proyecto a
             JOIN titulacion.docentes d ON d.id = a.docente_id
             JOIN titulacion.usuarios u ON u.id = d.usuario_id
             WHERE a.proyecto_id = p.id
           ) tutor ON true
           LEFT JOIN LATERAL (
             SELECT count(*) FILTER (
                      WHERE a.tipo IN ('REVISOR_1', 'REVISOR_2')
                        AND a.activo
                        AND a.fecha_fin IS NULL
                    )::int AS asignados
             FROM titulacion.asignaciones_proyecto a
             WHERE a.proyecto_id = p.id
           ) reviewers ON true
           LEFT JOIN LATERAL (
             SELECT count(r.id) FILTER (WHERE r.decidida_en IS NULL)::int AS revisiones_pendientes,
                    count(DISTINCT rr.id)::int AS rondas_creadas
             FROM titulacion.rondas_revision rr
             JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
             JOIN titulacion.documentos d ON d.id = vd.documento_id
             LEFT JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
             WHERE d.proyecto_id = p.id
           ) reviews ON true
         )
         SELECT *
         FROM vista_proyectos vp
         ${where}
         ORDER BY vp.registrado_en DESC
         LIMIT 100`,
        values,
      ),
      pool.query(
        `SELECT codigo, nombre
         FROM titulacion.estados_proyecto
         ORDER BY nombre`,
      ),
      pool.query(
        `SELECT u.id, u.nombres, u.apellidos, u.correo, u.creado_en, u.email_confirmado_en
         FROM titulacion.usuarios u
         WHERE u.activo
           AND u.email_confirmado_en IS NOT NULL
           AND lower(u.correo) ~ '^[^@]+@univalle\\.edu$'
           AND NOT EXISTS (
             SELECT 1
             FROM titulacion.usuario_roles ur
             JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo
             WHERE ur.usuario_id = u.id
               AND ur.activo
               AND r.codigo IN ('ESTUDIANTE', 'TUTOR', 'REVISOR', 'ADMINISTRADOR')
           )
         ORDER BY u.email_confirmado_en DESC, u.apellidos, u.nombres`,
      ),
    ])

    const projectRows = projects.rows.map((project) => ({
      id: project.id,
      code: project.codigo_seguimiento,
      title: project.titulo_tentativo,
      students: project.estudiantes ?? 'Sin estudiante asignado',
      tutor: project.tutor ?? 'Sin tutor asignado',
      tutorStatus: project.tutoria_confirmada ? 'CONFIRMADA' : project.tutoria_pendiente ? 'PENDIENTE' : 'SIN_ASIGNAR',
      management: project.gestion_nombre,
      modality: project.modalidad_nombre,
      phaseCode: project.fase_codigo,
      phase: project.fase_nombre,
      statusCode: project.estado_codigo,
      status: project.estado_nombre,
      isFinal: project.es_final,
      registeredAt: project.registrado_en,
      pendingReviews: Number(project.revisiones_pendientes ?? 0),
      reviewerCount: Number(project.revisores_asignados ?? 0),
      reviewRoundCount: Number(project.rondas_creadas ?? 0),
      canStartInitialReview: !project.es_final
        && project.tutoria_confirmada
        && Number(project.revisores_asignados ?? 0) === 2
        && Number(project.rondas_creadas ?? 0) === 0,
    }))

    const pendingReviewStarts = projectRows.filter((project) => !project.isFinal && project.reviewRoundCount === 0)

    const summary = projectRows.reduce((total, project) => ({
      total: total.total + 1,
      registered: total.registered + (project.statusCode === 'REGISTRADO' ? 1 : 0),
      inReview: total.inReview + (project.statusCode === 'EN_REVISION' ? 1 : 0),
      observed: total.observed + (project.statusCode === 'OBSERVADO' ? 1 : 0),
      pendingReviewStarts: total.pendingReviewStarts + (project.reviewRoundCount === 0 && !project.isFinal ? 1 : 0),
    }), { total: 0, registered: 0, inReview: 0, observed: 0, pendingReviewStarts: 0 })
    summary.newTeachers = pendingTeachers.rows.length

    return response.json({
      user: sanitizeUser(request.session),
      summary,
      statuses: statuses.rows.map((item) => ({ code: item.codigo, name: item.nombre })),
      projects: projectRows,
      pendingReviewStarts,
      newTeachers: pendingTeachers.rows.map((teacher) => ({
        id: teacher.id,
        firstName: teacher.nombres,
        lastName: teacher.apellidos,
        fullName: `${teacher.nombres} ${teacher.apellidos}`.trim(),
        email: teacher.correo,
        createdAt: teacher.creado_en,
        confirmedAt: teacher.email_confirmado_en,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/admin/projects/:projectId', requireAdministrator, async (request, response, next) => {
  try {
    const { projectId } = request.params
    if (!isUuid(projectId)) return response.status(400).json({ message: 'El proyecto no es válido.' })

    const projectResult = await pool.query(
      `SELECT p.id, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion, p.objetivo_general,
              p.fase_actual_id, p.estado_actual_id, p.registrado_en,
              g.nombre AS gestion_nombre, g.carrera_id,
              m.nombre AS modalidad_nombre,
              f.codigo AS fase_codigo, f.nombre AS fase_nombre,
              ep.codigo AS estado_codigo, ep.nombre AS estado_nombre
       FROM titulacion.proyectos p
       JOIN titulacion.gestiones g ON g.id = p.gestion_id
       JOIN titulacion.modalidades_titulacion m ON m.id = p.modalidad_id
       JOIN titulacion.fases f ON f.id = p.fase_actual_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE p.id = $1`,
      [projectId],
    )
    const project = projectResult.rows[0]
    if (!project) return response.status(404).json({ message: 'El proyecto no existe.' })

    const [students, staff, assignments, profiles, rounds, statuses, phases, cancellation] = await Promise.all([
      pool.query(
        `SELECT trim(concat(u.nombres, ' ', u.apellidos)) AS name, e.registro_universitario AS registration
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id
         WHERE pe.proyecto_id = $1 AND pe.activo
         ORDER BY pe.es_responsable_principal DESC, u.apellidos, u.nombres`,
        [projectId],
      ),
      pool.query(
        `SELECT d.id, trim(concat(u.nombres, ' ', u.apellidos)) AS name, u.correo,
                array_agg(r.codigo ORDER BY r.codigo) AS roles
         FROM titulacion.docentes d
         JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
         JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
         JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo
         WHERE d.carrera_id = $1 AND d.activo AND r.codigo IN ('TUTOR', 'REVISOR')
         GROUP BY d.id, u.id
         ORDER BY u.apellidos, u.nombres`,
        [project.carrera_id],
      ),
      pool.query(
        `SELECT a.id, a.tipo, a.activo, a.fecha_asignacion, a.fecha_fin, a.respondida_en, a.motivo_cambio,
                d.id AS docente_id, trim(concat(u.nombres, ' ', u.apellidos)) AS docente_nombre, u.correo
         FROM titulacion.asignaciones_proyecto a
         JOIN titulacion.docentes d ON d.id = a.docente_id
         JOIN titulacion.usuarios u ON u.id = d.usuario_id
         WHERE a.proyecto_id = $1
           AND (a.activo OR (a.tipo = 'TUTOR' AND NOT a.activo AND a.fecha_fin IS NULL))
         ORDER BY CASE a.tipo WHEN 'TUTOR' THEN 1 WHEN 'REVISOR_1' THEN 2 ELSE 3 END,
                  a.activo DESC, a.fecha_asignacion DESC`,
        [projectId],
      ),
      pool.query(
        `SELECT d.id AS document_id, d.nombre, vd.id AS version_id, vd.numero_version, vd.nombre_archivo,
                vd.subida_en, vd.tamano_bytes
         FROM titulacion.documentos d
         JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
         WHERE d.proyecto_id = $1 AND d.activo AND d.tipo_documento = 'PERFIL_PROYECTO'
         ORDER BY vd.numero_version DESC`,
        [projectId],
      ),
      pool.query(
        `SELECT rr.id, rr.numero_ronda, rr.fecha_solicitud, rr.cerrada_en,
                vd.numero_version,
                COALESCE(json_agg(json_build_object(
                  'id', r.id,
                  'decision', r.decision,
                  'decidedAt', r.decidida_en,
                  'comment', r.comentario_general,
                  'assignmentType', a.tipo,
                  'reviewer', trim(concat(u.nombres, ' ', u.apellidos)),
                  'openObservations', (SELECT count(*)::int FROM titulacion.observaciones o WHERE o.revision_id = r.id AND o.estado = 'ABIERTA')
                ) ORDER BY a.tipo) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS revisiones
         FROM titulacion.rondas_revision rr
         JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
         JOIN titulacion.documentos d ON d.id = vd.documento_id
         LEFT JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
         LEFT JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
         LEFT JOIN titulacion.docentes reviewer_docente ON reviewer_docente.id = a.docente_id
         LEFT JOIN titulacion.usuarios u ON u.id = reviewer_docente.usuario_id
         WHERE d.proyecto_id = $1
         GROUP BY rr.id, vd.numero_version
         ORDER BY rr.fecha_solicitud DESC`,
        [projectId],
      ),
      pool.query(`SELECT codigo, nombre FROM titulacion.estados_proyecto ORDER BY nombre`),
      pool.query(`SELECT codigo, nombre FROM titulacion.fases WHERE activa ORDER BY orden`),
      pool.query(
        `SELECT motivo, detalle, anulado_en
         FROM titulacion.anulaciones_proyecto
         WHERE proyecto_id = $1`,
        [projectId],
      ),
    ])

    return response.json({
      project: {
        id: project.id,
        code: project.codigo_seguimiento,
        title: project.titulo_tentativo,
        description: project.descripcion,
        generalObjective: project.objetivo_general,
        management: project.gestion_nombre,
        modality: project.modalidad_nombre,
        phaseCode: project.fase_codigo,
        phase: project.fase_nombre,
        statusCode: project.estado_codigo,
        status: project.estado_nombre,
        registeredAt: project.registrado_en,
      },
      students: students.rows.map((item) => ({ name: item.name, registration: item.registration })),
      staff: staff.rows.map((item) => ({ id: item.id, name: item.name, email: item.correo, roles: item.roles })),
      assignments: assignments.rows.map((item) => ({
        id: item.id,
        type: item.tipo,
        active: item.activo,
        teacherId: item.docente_id,
        teacher: item.docente_nombre,
        email: item.correo,
        assignedAt: item.fecha_asignacion,
        finishedAt: item.fecha_fin,
        respondedAt: item.respondida_en,
        reason: item.motivo_cambio,
      })),
      profiles: profiles.rows.map((item) => ({
        documentId: item.document_id,
        versionId: item.version_id,
        version: item.numero_version,
        filename: item.nombre_archivo,
        uploadedAt: item.subida_en,
        size: Number(item.tamano_bytes),
      })),
      rounds: rounds.rows.map((item) => ({
        id: item.id,
        number: item.numero_ronda,
        version: item.numero_version,
        requestedAt: item.fecha_solicitud,
        closedAt: item.cerrada_en,
        reviews: item.revisiones ?? [],
      })),
      statuses: statuses.rows.map((item) => ({ code: item.codigo, name: item.nombre })),
      phases: phases.rows.map((item) => ({ code: item.codigo, name: item.nombre })),
      cancellation: cancellation.rows[0] ? {
        reason: cancellation.rows[0].motivo,
        detail: cancellation.rows[0].detalle,
        cancelledAt: cancellation.rows[0].anulado_en,
      } : null,
    })
  } catch (error) {
    return next(error)
  }
})

app.patch('/api/admin/projects/:projectId', requireAdministrator, (_request, response) => {
  return response.status(403).json({ message: 'Administración no puede modificar los datos registrados por el estudiante en el Formulario 1.' })
})

app.put('/api/admin/projects/:projectId/assignments', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const { projectId } = request.params
    const tutorId = text(request.body?.tutorId)
    if (!isUuid(projectId) || !isUuid(tutorId)) {
      return response.status(422).json({ message: 'Selecciona un tutor válido para el proyecto.' })
    }

    await databaseClient.query('BEGIN')
    const project = await lockedProject(databaseClient, projectId)
    if (!project) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El proyecto no existe.' })
    }
    if (project.estado_codigo === 'ANULADO' || project.estado_codigo === 'FINALIZADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'No puedes cambiar responsables en un proyecto cerrado.' })
    }

    const tutor = await staffWithRole(databaseClient, { teacherId: tutorId, careerId: project.carrera_id, roleCode: 'TUTOR' })
    if (!tutor) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'El tutor debe estar activo y habilitado en la carrera del proyecto.' })
    }

    const change = await replaceProjectAssignment(databaseClient, { project, type: 'TUTOR', staff: tutor, assignedByUserId: request.session.usuario_id })
    await recordAudit(databaseClient, request.session, {
      projectId,
      action: 'ASIGNAR_TUTOR',
      entity: 'asignaciones_proyecto',
      detail: {
        tutorId,
        changed: change.changed,
        pendingTutorHandoff: change.pendingTutorHandoff,
        previousAssignmentId: change.previousAssignmentId,
        roundId: change.roundId,
      },
    })
    await databaseClient.query('COMMIT')
    return response.json({
      message: change.changed
        ? change.pendingTutorHandoff
          ? 'Se envió la invitación al nuevo tutor. El tutor actual conservará la evaluación pendiente hasta que la acepte.'
          : 'Se envió la invitación al tutor. Podrás asignar revisores cuando la acepte.'
        : 'El tutor ya tiene una invitación o tutoría activa para este proyecto.',
      changed: Number(change.changed),
    })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.put('/api/admin/projects/:projectId/reviewers', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const { projectId } = request.params
    const reviewer1Id = text(request.body?.reviewer1Id)
    const reviewer2Id = text(request.body?.reviewer2Id)
    if (!isUuid(projectId) || !isUuid(reviewer1Id) || !isUuid(reviewer2Id)) {
      return response.status(422).json({ message: 'Selecciona los dos revisores del proyecto.' })
    }
    if (reviewer1Id === reviewer2Id) return response.status(422).json({ message: 'Revisor 1 y Revisor 2 deben ser docentes diferentes.' })

    await databaseClient.query('BEGIN')
    const project = await lockedProject(databaseClient, projectId)
    if (!project) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El proyecto no existe.' })
    }
    if (project.estado_codigo === 'ANULADO' || project.estado_codigo === 'FINALIZADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'No puedes asignar revisores en un proyecto cerrado.' })
    }

    const tutorAssignment = await databaseClient.query(
      `SELECT a.docente_id, d.usuario_id, u.correo
       FROM titulacion.asignaciones_proyecto a
       JOIN titulacion.docentes d ON d.id = a.docente_id
       JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
       WHERE proyecto_id = $1
         AND a.tipo = 'TUTOR'
         AND a.activo
         AND a.respondida_en IS NOT NULL
         AND a.fecha_fin IS NULL
       FOR UPDATE OF a`,
      [projectId],
    )
    if (!tutorAssignment.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Espera a que el tutor propuesto acepte la invitación antes de asignar revisores.' })
    }
    if ([reviewer1Id, reviewer2Id].includes(tutorAssignment.rows[0].docente_id)) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'El tutor confirmado no puede ocupar una de las dos plazas de revisor.' })
    }

    const [reviewer1, reviewer2] = await Promise.all([
      staffWithRole(databaseClient, { teacherId: reviewer1Id, careerId: project.carrera_id, roleCode: 'REVISOR' }),
      staffWithRole(databaseClient, { teacherId: reviewer2Id, careerId: project.carrera_id, roleCode: 'REVISOR' }),
    ])
    if (!reviewer1 || !reviewer2) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Los revisores deben estar activos y habilitados en la carrera del proyecto.' })
    }

    const changes = await Promise.all([
      replaceProjectAssignment(databaseClient, { project, type: 'REVISOR_1', staff: reviewer1, assignedByUserId: request.session.usuario_id }),
      replaceProjectAssignment(databaseClient, { project, type: 'REVISOR_2', staff: reviewer2, assignedByUserId: request.session.usuario_id }),
    ])
    const changedAssignments = changes.filter((item) => item.changed)
    const hasOpenRound = changes.some((item) => item.roundId)
    if (changedAssignments.length > 0 && !hasOpenRound) {
      await createNotification(databaseClient, {
        userId: tutorAssignment.rows[0].usuario_id,
        recipientEmail: tutorAssignment.rows[0].correo,
        projectId,
        type: 'REVISORES_ASIGNADOS_TUTOR',
        title: 'Revisores asignados al proyecto',
        message: `Administración asignó los dos revisores del proyecto ${project.codigo_seguimiento}. Recibirás un aviso cuando la revisión del perfil sea habilitada.`,
        link: '/tutor/proyectos',
      })
    }
    await recordAudit(databaseClient, request.session, {
      projectId,
      action: 'ASIGNAR_REVISORES',
      entity: 'asignaciones_proyecto',
      detail: {
        reviewer1Id,
        reviewer2Id,
        changed: changedAssignments.length,
        pendingReviewsTransferred: changes.filter((item) => item.pendingReviewTransferred).map((item) => item.assignmentId),
        roundId: changes.find((item) => item.roundId)?.roundId ?? null,
      },
    })
    await databaseClient.query('COMMIT')
    const transferred = changes.filter((item) => item.pendingReviewTransferred).length
    return response.json({
      message: transferred > 0
        ? `${transferred === 1 ? 'La evaluación pendiente fue transferida al nuevo revisor.' : 'Las evaluaciones pendientes fueron transferidas a los nuevos revisores.'}`
        : 'El equipo evaluador fue asignado y el tutor fue notificado. Ya puedes habilitar la revisión del perfil.',
      changed: changedAssignments.length,
    })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.post('/api/admin/projects/:projectId/review-rounds', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const { projectId } = request.params
    const versionId = text(request.body?.versionId)
    if (!isUuid(projectId) || !isUuid(versionId)) {
      return response.status(422).json({ message: 'Selecciona una versión válida del perfil.' })
    }

    await databaseClient.query('BEGIN')
    const project = await lockedProject(databaseClient, projectId)
    if (!project) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El proyecto no existe.' })
    }
    if (project.estado_codigo === 'ANULADO' || project.estado_codigo === 'FINALIZADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'No puedes iniciar una revisión en un proyecto cerrado.' })
    }

    const profile = await databaseClient.query(
      `SELECT vd.id, vd.numero_version
       FROM titulacion.versiones_documento vd
       JOIN titulacion.documentos d ON d.id = vd.documento_id
       WHERE vd.id = $1 AND d.proyecto_id = $2 AND d.activo AND d.tipo_documento = 'PERFIL_PROYECTO'`,
      [versionId, projectId],
    )
    if (!profile.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'La versión seleccionada no pertenece al perfil de este proyecto.' })
    }

    const reviewers = await databaseClient.query(
      `SELECT a.id, a.tipo, d.usuario_id, u.correo
       FROM titulacion.asignaciones_proyecto a
       JOIN titulacion.docentes d ON d.id = a.docente_id
       JOIN titulacion.usuarios u ON u.id = d.usuario_id
       WHERE a.proyecto_id = $1 AND a.activo AND a.tipo IN ('TUTOR', 'REVISOR_1', 'REVISOR_2')
       ORDER BY a.tipo
       FOR UPDATE`,
      [projectId],
    )
    if (reviewers.rows.length !== 3 || new Set(reviewers.rows.map((item) => item.tipo)).size !== 3) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Asigna y confirma un tutor, Revisor 1 y Revisor 2 antes de enviar el perfil a revisión.' })
    }

    const openRound = await databaseClient.query(
      `SELECT rr.id
       FROM titulacion.rondas_revision rr
       JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
       JOIN titulacion.documentos d ON d.id = vd.documento_id
       WHERE d.proyecto_id = $1 AND rr.cerrada_en IS NULL
       FOR UPDATE`,
      [projectId],
    )
    if (openRound.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'El proyecto ya tiene una ronda de revisión abierta.' })
    }

    const roundNumber = await databaseClient.query(
      `SELECT COALESCE(max(rr.numero_ronda), 0)::int + 1 AS next_number
       FROM titulacion.rondas_revision rr
       JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
       JOIN titulacion.documentos d ON d.id = vd.documento_id
       WHERE d.proyecto_id = $1`,
      [projectId],
    )
    const phase = await databaseClient.query(`SELECT id FROM titulacion.fases WHERE codigo = 'REVISION_PERFIL' AND activa`)
    const reviewState = await databaseClient.query(`SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_REVISION'`)
    if (!phase.rows[0] || !reviewState.rows[0]) throw new Error('Faltan catálogos para iniciar la revisión.')

    const round = await databaseClient.query(
      `INSERT INTO titulacion.rondas_revision
        (version_documento_id, fase_id, numero_ronda, solicitada_por_usuario_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [versionId, phase.rows[0].id, roundNumber.rows[0].next_number, request.session.usuario_id],
    )
    await databaseClient.query(
      `INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
       SELECT $1, unnest($2::uuid[])`,
      [round.rows[0].id, reviewers.rows.map((item) => item.id)],
    )
    for (const reviewer of reviewers.rows) {
      await createNotification(databaseClient, {
        userId: reviewer.usuario_id,
        projectId,
        type: reviewer.tipo === 'TUTOR' ? 'REVISION_TUTOR_ASIGNADA' : 'REVISION_ASIGNADA',
        title: 'Perfil pendiente de revisión',
        message: `El perfil ${project.codigo_seguimiento} fue habilitado para revisión. Ingresa para registrar tu dictamen.`,
        link: reviewer.tipo === 'TUTOR' ? '/tutor/proyectos' : '/revisor/pendientes',
      })
    }
    await recordProjectStatus(databaseClient, {
      projectId,
      previousStateId: project.estado_actual_id,
      nextStateId: reviewState.rows[0].id,
      previousPhaseId: project.fase_actual_id,
      nextPhaseId: phase.rows[0].id,
      userId: request.session.usuario_id,
      reason: `Ronda ${roundNumber.rows[0].next_number} de revisión del perfil programada por Administración.`,
    })
    await recordAudit(databaseClient, request.session, {
      projectId,
      action: 'INICIAR_RONDA_REVISION',
      entity: 'rondas_revision',
      entityId: round.rows[0].id,
      detail: { versionId, reviewers: reviewers.rows.map((item) => item.id) },
    })
    await databaseClient.query('COMMIT')
    return response.status(201).json({ message: 'La revisión fue habilitada y notificada al tutor y a los dos revisores.', roundId: round.rows[0].id })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.patch('/api/admin/projects/:projectId/status', requireAdministrator, (_request, response) => {
  return response.status(403).json({
    message: 'La fase y el estado se actualizan automáticamente mediante el flujo académico. Administración puede programar las revisiones o anular el proyecto cuando corresponda.',
  })
})

app.post('/api/admin/projects/:projectId/cancel', requireAdministrator, async (request, response, next) => {
  const databaseClient = await pool.connect()
  try {
    const { projectId } = request.params
    const reason = text(request.body?.reason)
    const detail = text(request.body?.detail)
    if (!isUuid(projectId) || reason.length < 5 || detail.length < 10) {
      return response.status(422).json({ message: 'Indica el motivo y un detalle de al menos 10 caracteres para anular el proyecto.' })
    }

    await databaseClient.query('BEGIN')
    const project = await lockedProject(databaseClient, projectId)
    if (!project) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El proyecto no existe.' })
    }
    if (project.estado_codigo === 'ANULADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'El proyecto ya fue anulado.' })
    }
    if (project.estado_codigo === 'FINALIZADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'No puedes anular un proyecto finalizado.' })
    }
    const cancelledState = await databaseClient.query(`SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'ANULADO'`)
    if (!cancelledState.rows[0]) throw new Error('No existe el estado ANULADO.')
    const cancellation = await databaseClient.query(
      `INSERT INTO titulacion.anulaciones_proyecto
        (proyecto_id, solicitado_por_usuario_id, autorizado_por_usuario_id, motivo, detalle)
       VALUES ($1, $2, $2, $3, $4)
       RETURNING id`,
      [projectId, request.session.usuario_id, reason, detail],
    )
    await databaseClient.query(
      `UPDATE titulacion.asignaciones_proyecto
       SET activo = false,
           fecha_fin = COALESCE(fecha_fin, now()),
           motivo_cambio = COALESCE(motivo_cambio, 'Asignación finalizada por anulación del proyecto.')
       WHERE proyecto_id = $1 AND (activo OR fecha_fin IS NULL)`,
      [projectId],
    )
    await databaseClient.query(
      `UPDATE titulacion.rondas_revision rr
       SET cerrada_en = COALESCE(rr.cerrada_en, now())
       FROM titulacion.versiones_documento vd
       JOIN titulacion.documentos d ON d.id = vd.documento_id
       WHERE rr.version_documento_id = vd.id AND d.proyecto_id = $1 AND rr.cerrada_en IS NULL`,
      [projectId],
    )
    await recordProjectStatus(databaseClient, {
      projectId,
      previousStateId: project.estado_actual_id,
      nextStateId: cancelledState.rows[0].id,
      previousPhaseId: project.fase_actual_id,
      nextPhaseId: project.fase_actual_id,
      userId: request.session.usuario_id,
      reason: `Proyecto anulado. ${reason}: ${detail}`,
    })
    await recordAudit(databaseClient, request.session, {
      projectId,
      action: 'ANULAR_PROYECTO',
      entity: 'anulaciones_proyecto',
      entityId: cancellation.rows[0].id,
      detail: { reason, detail },
    })
    await databaseClient.query('COMMIT')
    return response.json({ message: 'El proyecto fue anulado y sus asignaciones y revisiones abiertas fueron cerradas.' })
  } catch (error) {
    await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient.release()
  }
})

app.get('/api/admin/documents/:documentId/download', requireAdministrator, async (request, response, next) => {
  try {
    const { documentId } = request.params
    const versionId = text(request.query?.versionId)
    if (!isUuid(documentId) || (versionId && !isUuid(versionId))) return response.status(400).json({ message: 'El documento no es válido.' })
    const result = await pool.query(
      `SELECT d.proyecto_id, vd.nombre_archivo, vd.ruta_archivo, vd.mime_type, vd.contenido_archivo
       FROM titulacion.documentos d
       JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
       WHERE d.id = $1 AND d.activo AND ($2::uuid IS NULL OR vd.id = $2)
       ORDER BY vd.numero_version DESC
       LIMIT 1`,
      [documentId, versionId || null],
    )
    const version = result.rows[0]
    if (!version) return response.status(404).json({ message: 'El archivo no está disponible.' })
    if (!await sendStoredDocument(response, version)) return response.status(404).json({ message: 'El archivo no está disponible en el almacenamiento.' })
    return undefined
  } catch (error) {
    return next(error)
  }
})

app.get('/api/tutor/dashboard', requireTutor, async (request, response, next) => {
  try {
    const { session } = request
    const assignmentQuery = `
      SELECT a.id AS assignment_id, a.proyecto_id, a.fecha_asignacion,
             a.respondida_en, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
             p.objetivo_general, g.nombre AS gestion_nombre, m.nombre AS modalidad_nombre,
             f.nombre AS fase_nombre, ep.nombre AS estado_nombre, ep.codigo AS estado_codigo,
             students.nombres_estudiantes, students.registros_estudiantes,
             profile.documento_id, profile.tipo_documento AS profile_document_type, profile.version_id, profile.nombre_archivo,
             profile.numero_version, profile.subida_en,
             current_review.revision_id, current_review.decision AS review_decision,
             COALESCE(review_summary.items, '[]'::json) AS team_reviews
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
        SELECT d.id AS documento_id, d.tipo_documento, vd.id AS version_id, vd.nombre_archivo,
               vd.numero_version, vd.subida_en
        FROM titulacion.documentos d
        LEFT JOIN LATERAL (
          SELECT id, nombre_archivo, numero_version, subida_en
          FROM titulacion.versiones_documento
          WHERE documento_id = d.id
          ORDER BY numero_version DESC
          LIMIT 1
        ) vd ON true
        WHERE d.proyecto_id = p.id AND d.activo AND d.tipo_documento IN ('PERFIL_PROYECTO', 'DOCUMENTO_PRIVADO', 'DOCUMENTO_PUBLICO')
        ORDER BY CASE d.tipo_documento WHEN 'DOCUMENTO_PUBLICO' THEN 0 WHEN 'DOCUMENTO_PRIVADO' THEN 1 ELSE 2 END, d.creado_en DESC
        LIMIT 1
      ) profile ON true
      LEFT JOIN LATERAL (
        SELECT r.id AS revision_id, r.decision, d.tipo_documento AS document_type
        FROM titulacion.rondas_revision rr
        JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
        JOIN titulacion.documentos d ON d.id = vd.documento_id AND d.tipo_documento IN ('PERFIL_PROYECTO', 'DOCUMENTO_PRIVADO', 'DOCUMENTO_PUBLICO')
        JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id AND r.asignacion_proyecto_id = a.id
        WHERE d.proyecto_id = p.id AND rr.cerrada_en IS NULL
        ORDER BY rr.numero_ronda DESC
        LIMIT 1
      ) current_review ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'assignmentType', teammate_assignment.tipo,
          'reviewer', trim(concat(teammate_user.nombres, ' ', teammate_user.apellidos)),
          'decision', teammate_review.decision,
          'decidedAt', teammate_review.decidida_en
        ) ORDER BY teammate_assignment.tipo) AS items
        FROM titulacion.rondas_revision summary_round
        JOIN titulacion.versiones_documento summary_version ON summary_version.id = summary_round.version_documento_id
        JOIN titulacion.documentos summary_document ON summary_document.id = summary_version.documento_id
        JOIN titulacion.revisiones teammate_review ON teammate_review.ronda_revision_id = summary_round.id
        JOIN titulacion.asignaciones_proyecto teammate_assignment ON teammate_assignment.id = teammate_review.asignacion_proyecto_id
        JOIN titulacion.docentes teammate_teacher ON teammate_teacher.id = teammate_assignment.docente_id
        JOIN titulacion.usuarios teammate_user ON teammate_user.id = teammate_teacher.usuario_id
        WHERE summary_document.proyecto_id = p.id
          AND summary_document.tipo_documento IN ('PERFIL_PROYECTO', 'DOCUMENTO_PRIVADO', 'DOCUMENTO_PUBLICO')
          AND summary_round.id = (
            SELECT latest_round.id
            FROM titulacion.rondas_revision latest_round
            JOIN titulacion.versiones_documento latest_version ON latest_version.id = latest_round.version_documento_id
            JOIN titulacion.documentos latest_document ON latest_document.id = latest_version.documento_id
            WHERE latest_document.proyecto_id = p.id
              AND latest_document.tipo_documento IN ('PERFIL_PROYECTO', 'DOCUMENTO_PRIVADO', 'DOCUMENTO_PUBLICO')
            ORDER BY (latest_round.cerrada_en IS NULL) DESC, latest_round.fecha_solicitud DESC
            LIMIT 1
          )
      ) review_summary ON true
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
      statusCode: assignment.estado_codigo,
      students: assignment.nombres_estudiantes ?? 'Estudiante no disponible',
      registrations: assignment.registros_estudiantes ?? '',
      requestedAt: assignment.fecha_asignacion,
      respondedAt: assignment.respondida_en,
      profile: assignment.documento_id ? {
        documentId: assignment.documento_id,
        type: assignment.profile_document_type,
        versionId: assignment.version_id,
        filename: assignment.nombre_archivo,
        version: assignment.numero_version,
        uploadedAt: assignment.subida_en,
      } : null,
      reviewId: assignment.revision_id,
      reviewDecision: assignment.review_decision,
      reviewDocumentType: assignment.document_type ?? assignment.profile_document_type,
      canReviewProfile: assignment.review_decision === 'PENDIENTE',
      teamReviews: assignment.team_reviews,
    })

    return response.json({
      user: sanitizeUser(session),
      invitations: invitations.rows.map(assignmentPayload),
      projects: projects.rows.map(assignmentPayload),
      notifications: notifications.rows.map(notificationPayload),
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
    let priorTutor = null
    let handoff = { transferred: false, reviewId: null }
    if (accepted) {
      const project = await lockedProject(databaseClient, selected.proyecto_id)
      if (!project) throw new Error('No fue posible obtener el proyecto de la tutoría.')
      const openRound = await openReviewRoundForProject(databaseClient, selected.proyecto_id)
      const activeTutor = await databaseClient.query(
        `SELECT a.id, teacher.usuario_id, user_account.correo
         FROM titulacion.asignaciones_proyecto a
         JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
         JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id
         WHERE a.proyecto_id = $1
           AND a.tipo = 'TUTOR'
           AND a.activo
           AND a.fecha_fin IS NULL
           AND a.id <> $2
         ORDER BY a.fecha_asignacion DESC
         LIMIT 1
         FOR UPDATE OF a`,
        [selected.proyecto_id, selected.id],
      )
      priorTutor = activeTutor.rows[0] ?? null
      if (priorTutor) {
        handoff = await transferPendingReview(databaseClient, {
          round: openRound,
          previousAssignmentId: priorTutor.id,
          replacementAssignmentId: selected.id,
        })
        await databaseClient.query(
          `UPDATE titulacion.asignaciones_proyecto
           SET activo = false,
               fecha_fin = now(),
               motivo_cambio = 'Tutoría reasignada después de aceptar la invitación.'
           WHERE id = $1`,
          [priorTutor.id],
        )
      }
    }
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
        : `El tutor declinó la tutoría de tu proyecto ${selected.codigo_seguimiento}. Motivo: ${reason}. Debes proponer un nuevo docente para continuar.`,
      link: accepted ? '/student' : '/student/proponer-tutor',
    })
    if (accepted) {
      if (handoff.transferred) {
        await createNotification(databaseClient, {
          userId: request.session.usuario_id,
          projectId: selected.proyecto_id,
          type: 'REVISION_TUTOR_REASIGNADA',
          title: 'Evaluación de tutoría reasignada',
          message: `La evaluación pendiente del proyecto ${selected.codigo_seguimiento} fue transferida a tu cuenta.`,
          link: '/tutor/proyectos',
        })
      }
      if (priorTutor) {
        await createNotification(databaseClient, {
          userId: priorTutor.usuario_id,
          recipientEmail: priorTutor.correo,
          projectId: selected.proyecto_id,
          type: 'TUTORIA_REASIGNADA',
          title: 'Tutoría reasignada',
          message: handoff.transferred
            ? `La evaluación pendiente del proyecto ${selected.codigo_seguimiento} fue transferida al nuevo tutor.`
            : `La tutoría del proyecto ${selected.codigo_seguimiento} fue reasignada para las próximas etapas.`,
          link: '/tutor',
        })
      }
      const administrators = await databaseClient.query(
        `SELECT DISTINCT u.id AS usuario_id, u.correo
         FROM titulacion.usuarios u
         JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
         JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = 'ADMINISTRADOR'
         WHERE u.activo`,
      )
      for (const administrator of administrators.rows) {
        await createNotification(databaseClient, {
          userId: administrator.usuario_id,
          recipientEmail: administrator.correo,
          projectId: selected.proyecto_id,
          type: priorTutor ? 'TUTOR_REASIGNADO_EN_REVISION' : 'TUTOR_CONFIRMADO_PENDIENTE_REVISORES',
          title: priorTutor ? 'Tutor reasignado durante la revisión' : 'Tutor confirmado: asigna los revisores',
          message: priorTutor
            ? handoff.transferred
              ? `El nuevo tutor aceptó y recibió la evaluación pendiente del proyecto ${selected.codigo_seguimiento}.`
              : `El nuevo tutor aceptó el proyecto ${selected.codigo_seguimiento}; los dictámenes ya emitidos se conservan.`
            : `El tutor aceptó el proyecto ${selected.codigo_seguimiento}. Ya puedes asignar Revisor 1 y Revisor 2.`,
          link: priorTutor ? '/admin' : '/admin/revisiones-por-iniciar',
          queueEmail: true,
        })
      }
    }
    await databaseClient.query('COMMIT')
    return response.json({
      message: accepted
        ? handoff.transferred
          ? 'Aceptaste la tutoría. La evaluación pendiente ya está disponible en Mis proyectos.'
          : 'Aceptaste la tutoría. El proyecto ya está disponible en Mis proyectos.'
        : 'Declinaste la tutoría. Administración podrá reasignar el proyecto.',
      decision,
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/tutor/projects/:projectId/formulario2', requireTutor, async (request, response, next) => {
  let databaseClient = null
  try {
    const projectId = request.params.projectId
    const decision = text(request.body?.decision).toUpperCase()
    const generalComment = text(request.body?.generalComment)
    const observations = Array.isArray(request.body?.observations) ? request.body.observations.map(text).filter(Boolean).slice(0, 20) : []
    const profileFormatCriteria = reviewMatrix(request.body?.formatCriteria, reviewFormatCriteria, ['SI', 'NO'])
    const profileBackgroundCriteria = reviewMatrix(request.body?.backgroundCriteria, reviewBackgroundCriteria, ['MALO', 'REGULAR', 'BUENO'])
    const privateBackgroundCriteria = reviewMatrix(request.body?.backgroundCriteria, privateDefenseCriteria, ['MALO', 'REGULAR', 'BUENO'])
    const publicRatification = text(request.body?.publicRatification).toUpperCase()
    if (!isUuid(projectId) || !['APROBADO', 'OBSERVADO'].includes(decision)) return response.status(422).json({ message: 'Completa las matrices y selecciona un dictamen válido.' })
    if (decision === 'OBSERVADO' && observations.length === 0) return response.status(422).json({ message: 'Registra al menos una observación para devolver el perfil.' })
    if (decision === 'APROBADO' && observations.length > 0) return response.status(422).json({ message: 'Elimina las observaciones para aprobar el perfil.' })
    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const selected = await databaseClient.query(
      `SELECT a.id AS assignment_id, p.id AS project_id, p.codigo_seguimiento, p.titulo_tentativo, p.estado_actual_id, p.fase_actual_id,
              (SELECT rr.id FROM titulacion.rondas_revision rr JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = p.id ORDER BY rr.fecha_solicitud DESC LIMIT 1) AS round_id,
              (SELECT d.tipo_documento FROM titulacion.rondas_revision rr JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id JOIN titulacion.documentos d ON d.id = vd.documento_id WHERE d.proyecto_id = p.id ORDER BY rr.fecha_solicitud DESC LIMIT 1) AS document_type
       FROM titulacion.asignaciones_proyecto a JOIN titulacion.proyectos p ON p.id = a.proyecto_id JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE a.proyecto_id = $1 AND a.docente_id = $2 AND a.tipo = 'TUTOR' AND a.activo AND a.fecha_fin IS NULL AND ep.codigo IN ('EN_REVISION', 'PENDIENTE_APROBACION', 'EN_DOCUMENTO_PRIVADO', 'EN_DOCUMENTO_PUBLICO')
       FOR UPDATE OF a, p`, [projectId, request.session.docente_id])
    const project = selected.rows[0]
    const isPrivateDefense = project?.document_type === 'DOCUMENTO_PRIVADO'
    const isPublicDefense = project?.document_type === 'DOCUMENTO_PUBLICO'
    const activeFormatCriteria = isPrivateDefense || isPublicDefense ? [] : profileFormatCriteria
    const activeBackgroundCriteria = isPublicDefense
      ? [{ code: 'RATIFICACION_DEFENSA_PUBLICA', value: publicRatification }]
      : isPrivateDefense ? privateBackgroundCriteria : profileBackgroundCriteria
    if (!project?.round_id) { await databaseClient.query('ROLLBACK'); return response.status(409).json({ message: 'Este proyecto aún no está listo para la aprobación final del tutor.' }) }
    const prior = await databaseClient.query(`SELECT id, decision FROM titulacion.revisiones WHERE ronda_revision_id = $1 AND asignacion_proyecto_id = $2 FOR UPDATE`, [project.round_id, project.assignment_id])
    const pendingTutorReviewId = prior.rows[0]?.decision === 'PENDIENTE' ? prior.rows[0].id : null
    if (pendingTutorReviewId) prior.rows.length = 0
    if (prior.rows[0]) { await databaseClient.query('ROLLBACK'); return response.status(409).json({ message: 'Ya registraste tu evaluación final para este proyecto.' }) }
    if (!activeFormatCriteria || !activeBackgroundCriteria) { await databaseClient.query('ROLLBACK'); return response.status(422).json({ message: 'Completa todos los criterios requeridos.' }) }
    if (isPublicDefense && !publicDefenseRatifications.includes(publicRatification)) { await databaseClient.query('ROLLBACK'); return response.status(422).json({ message: 'Selecciona la ratificación para la defensa pública.' }) }
    if (isPublicDefense && ((decision === 'APROBADO') !== (publicRatification === 'SI'))) { await databaseClient.query('ROLLBACK'); return response.status(422).json({ message: 'La ratificación Sí aprueba; No o Parcialmente requieren devolver el documento con observaciones.' }) }
    if (!isPublicDefense && decision === 'APROBADO' && (activeFormatCriteria.some((item) => item.value !== 'SI') || activeBackgroundCriteria.some((item) => item.value !== 'BUENO'))) { await databaseClient.query('ROLLBACK'); return response.status(422).json({ message: 'Para aprobar, todos los criterios deben cumplir la guia.' }) }
    const review = pendingTutorReviewId
      ? await databaseClient.query(`UPDATE titulacion.revisiones SET decision=$2, comentario_general=$3, criterios_formato=$4::jsonb, criterios_fondo=$5::jsonb, decidida_en=now() WHERE id=$1 RETURNING id`, [pendingTutorReviewId, decision, generalComment || null, JSON.stringify(activeFormatCriteria), JSON.stringify(activeBackgroundCriteria)])
      : await databaseClient.query(`INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id, decision, comentario_general, criterios_formato, criterios_fondo, decidida_en) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now()) RETURNING id`, [project.round_id, project.assignment_id, decision, generalComment || null, JSON.stringify(activeFormatCriteria), JSON.stringify(activeBackgroundCriteria)])
    if (decision === 'OBSERVADO') for (const [index, detail] of observations.entries()) await databaseClient.query(`INSERT INTO titulacion.observaciones (revision_id, numero, detalle) VALUES ($1, $2, $3)`, [review.rows[0].id, index + 1, detail])
    const pending = await databaseClient.query(`SELECT count(*)::int AS total FROM titulacion.revisiones WHERE ronda_revision_id=$1 AND decision='PENDIENTE'`, [project.round_id])
    if (pending.rows[0].total > 0) {
      await databaseClient.query('COMMIT')
      return response.json({ message: 'Revision del tutor registrada. Aun faltan dictamenes de los revisores.', roundCompleted: false })
    }
    const roundDecisions = await databaseClient.query(`SELECT decision FROM titulacion.revisiones WHERE ronda_revision_id=$1`, [project.round_id])
    const hasObservations = roundDecisions.rows.some((item) => item.decision === 'OBSERVADO' || item.decision === 'RECHAZADO')
    const catalog = await databaseClient.query(`SELECT (SELECT id FROM titulacion.estados_proyecto WHERE codigo = $1) AS state_id, (SELECT id FROM titulacion.fases WHERE codigo = $2 AND activa) AS phase_id`, [hasObservations ? 'OBSERVADO' : isPublicDefense ? 'APROBADO_INSTITUCIONAL' : isPrivateDefense ? 'EN_DOCUMENTO_PUBLICO' : 'EN_DOCUMENTO_PRIVADO', hasObservations ? (isPublicDefense ? 'DOCUMENTO_PUBLICO' : isPrivateDefense ? 'DOCUMENTO_PRIVADO' : 'REGISTRO') : isPublicDefense ? 'DOCUMENTO_PUBLICO' : isPrivateDefense ? 'DOCUMENTO_PUBLICO' : 'DOCUMENTO_PRIVADO'])
    await databaseClient.query(`UPDATE titulacion.rondas_revision SET cerrada_en=now() WHERE id=$1`, [project.round_id])
    if (!hasObservations) {
      await databaseClient.query(
        `UPDATE titulacion.observaciones o
         SET estado = 'CERRADA', cerrada_por_usuario_id = $1, cerrada_en = now()
         WHERE o.version_documento_respuesta_id = (
           SELECT version_documento_id FROM titulacion.rondas_revision WHERE id = $2
         )
           AND o.estado = 'RESPONDIDA'`,
        [request.session.usuario_id, project.round_id],
      )
    }
    await recordProjectStatus(databaseClient, { projectId, previousStateId: project.estado_actual_id, nextStateId: catalog.rows[0].state_id, previousPhaseId: project.fase_actual_id, nextPhaseId: catalog.rows[0].phase_id, userId: request.session.usuario_id, reason: hasObservations ? 'Perfil devuelto con observaciones del tutor o de los revisores.' : 'Perfil aprobado sin observaciones por tutor y revisores.' })
    if (hasObservations) {
      const students = await databaseClient.query(
        `SELECT u.id AS usuario_id, u.correo
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
         WHERE pe.proyecto_id = $1 AND pe.activo`,
        [projectId],
      )
      for (const student of students.rows) await createNotification(databaseClient, {
        userId: student.usuario_id,
        recipientEmail: student.correo,
        projectId,
        type: 'REVISION_DEVUELTA',
        title: 'Documento devuelto con observaciones',
        message: `El documento ${project.codigo_seguimiento} recibió observaciones. Revísalas y adjunta una nueva versión.`,
        link: '/documentos',
        queueEmail: true,
      })
    }
    if (!hasObservations && !isPrivateDefense && !isPublicDefense) {
      await ensurePrivateDefenseDocument(databaseClient, { projectId, title: project.titulo_tentativo, createdByUserId: request.session.usuario_id })
      const students = await databaseClient.query(
        `SELECT u.id AS usuario_id, u.correo
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
         WHERE pe.proyecto_id = $1 AND pe.activo`,
        [projectId],
      )
      for (const student of students.rows) await createNotification(databaseClient, {
        userId: student.usuario_id,
        recipientEmail: student.correo,
        projectId,
        type: 'DOCUMENTO_PRIVADO_HABILITADO',
        title: 'Documento para defensa privada habilitado',
        message: `El perfil ${project.codigo_seguimiento} fue aprobado. Ya puedes adjuntar el documento para defensa privada.`,
        link: '/documentos',
        queueEmail: true,
      })
    }
    if (!hasObservations && isPrivateDefense) {
      await ensurePublicDefenseDocument(databaseClient, { projectId, title: project.titulo_tentativo, createdByUserId: request.session.usuario_id })
      const students = await databaseClient.query(
        `SELECT u.id AS usuario_id, u.correo
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
         WHERE pe.proyecto_id = $1 AND pe.activo`,
        [projectId],
      )
      for (const student of students.rows) await createNotification(databaseClient, {
        userId: student.usuario_id,
        recipientEmail: student.correo,
        projectId,
        type: 'DOCUMENTO_PUBLICO_HABILITADO',
        title: 'Documento para defensa pública habilitado',
        message: `El documento para defensa privada de ${project.codigo_seguimiento} fue aprobado. Ya puedes adjuntar el documento final para defensa pública.`,
        link: '/documentos',
        queueEmail: true,
      })
    }
    await databaseClient.query('COMMIT')
    return response.json({ message: decision === 'APROBADO' ? (isPublicDefense ? 'Documento aprobado para defensa pública.' : isPrivateDefense ? 'Documento aprobado para defensa privada; se habilitó el documento final.' : 'Perfil aprobado; se habilitó el documento para defensa privada.') : 'Documento devuelto al estudiante con observaciones.' })
  } catch (error) { if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined); return next(error) } finally { databaseClient?.release() }
})

app.get('/api/tutor/documents/:documentId/download', requireTutor, async (request, response, next) => {
  try {
    const documentId = request.params.documentId
    const versionId = text(request.query.version)
    if (!isUuid(documentId) || (versionId && !isUuid(versionId))) {
      return response.status(400).json({ message: 'El documento solicitado no es válido.' })
    }
    const result = await pool.query(
      `SELECT d.proyecto_id, vd.nombre_archivo, vd.ruta_archivo, vd.mime_type, vd.contenido_archivo
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
    if (!await sendStoredDocument(response, version)) return response.status(404).json({ message: 'El archivo no está disponible en el almacenamiento.' })
    return undefined
  } catch (error) {
    return next(error)
  }
})

app.get('/api/reviewer/dashboard', requireReviewer, async (request, response, next) => {
  try {
    const { session } = request
    const reviews = await pool.query(
      `SELECT r.id AS review_id, r.decision, r.comentario_general, r.decidida_en,
              a.id AS assignment_id, a.tipo AS assignment_type, a.activo AS assignment_active,
              a.fecha_fin AS assignment_finished_at,
              rr.id AS round_id, rr.numero_ronda, rr.fecha_solicitud, rr.cerrada_en,
              p.id AS project_id, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
              p.objetivo_general, g.nombre AS gestion_nombre, m.nombre AS modalidad_nombre,
              f.nombre AS fase_nombre, ep.nombre AS estado_nombre,
              document.id AS document_id, document.tipo_documento AS document_type, version.id AS version_id, version.numero_version,
              version.nombre_archivo, version.subida_en,
              students.nombres_estudiantes, students.registros_estudiantes,
              COALESCE(observations.items, '[]'::json) AS observations,
              COALESCE(team.items, '[]'::json) AS team_reviews
       FROM titulacion.revisiones r
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
       JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id
       JOIN titulacion.versiones_documento version ON version.id = rr.version_documento_id
       JOIN titulacion.documentos document ON document.id = version.documento_id AND document.activo
       JOIN titulacion.proyectos p ON p.id = document.proyecto_id
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
       JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'id', o.id,
           'number', o.numero,
           'detail', o.detalle,
           'status', o.estado
         ) ORDER BY o.numero) AS items
         FROM titulacion.observaciones o
         WHERE o.revision_id = r.id
       ) observations ON true
       JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'assignmentType', teammate_assignment.tipo,
           'reviewer', trim(concat(teammate_user.nombres, ' ', teammate_user.apellidos)),
           'decision', teammate_review.decision,
           'decidedAt', teammate_review.decidida_en
         ) ORDER BY teammate_assignment.tipo) AS items
         FROM titulacion.revisiones teammate_review
         JOIN titulacion.asignaciones_proyecto teammate_assignment ON teammate_assignment.id = teammate_review.asignacion_proyecto_id
         JOIN titulacion.docentes teammate_teacher ON teammate_teacher.id = teammate_assignment.docente_id
         JOIN titulacion.usuarios teammate_user ON teammate_user.id = teammate_teacher.usuario_id
         WHERE teammate_review.ronda_revision_id = rr.id
       ) team ON true
       WHERE a.docente_id = $1 AND a.tipo IN ('REVISOR_1', 'REVISOR_2')
       ORDER BY (r.decision = 'PENDIENTE') DESC, rr.fecha_solicitud DESC`,
      [session.docente_id],
    )
    const [notifications, unread] = await Promise.all([
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

    const reviewPayload = (review) => ({
      id: review.review_id,
      roundId: review.round_id,
      assignmentId: review.assignment_id,
      assignmentType: review.assignment_type,
      projectId: review.project_id,
      code: review.codigo_seguimiento,
      title: review.titulo_tentativo,
      description: review.descripcion,
      generalObjective: review.objetivo_general,
      management: review.gestion_nombre,
      modality: review.modalidad_nombre,
      phase: review.fase_nombre,
      status: review.estado_nombre,
      students: review.nombres_estudiantes ?? 'Estudiante no disponible',
      registrations: review.registros_estudiantes ?? '',
      roundNumber: review.numero_ronda,
      requestedAt: review.fecha_solicitud,
      closedAt: review.cerrada_en,
      decision: review.decision,
      generalComment: review.comentario_general,
      decidedAt: review.decidida_en,
      canSubmit: review.decision === 'PENDIENTE' && !review.cerrada_en && review.assignment_active && !review.assignment_finished_at,
      profile: {
        documentId: review.document_id,
        type: review.document_type,
        versionId: review.version_id,
        filename: review.nombre_archivo,
        version: review.numero_version,
        uploadedAt: review.subida_en,
      },
      observations: review.observations,
      teamReviews: review.team_reviews,
    })
    const payload = reviews.rows.map(reviewPayload)
    const pendingReviews = payload.filter((review) => review.canSubmit)
    const completedReviews = payload.filter((review) => review.decision !== 'PENDIENTE')
    return response.json({
      user: sanitizeUser(session),
      summary: { pending: pendingReviews.length, completed: completedReviews.length },
      pendingReviews,
      completedReviews,
      notifications: notifications.rows.map(notificationPayload),
      unreadCount: unread.rows[0].total,
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/reviewer/reviews/:reviewId/decision', requireReviewer, async (request, response, next) => {
  let databaseClient = null
  try {
    const reviewId = request.params.reviewId
    const decision = text(request.body?.decision).toUpperCase()
    const generalComment = text(request.body?.generalComment)
    const observations = Array.isArray(request.body?.observations)
      ? request.body.observations.map(text).filter(Boolean).slice(0, 20)
      : []
    const profileFormatCriteria = reviewMatrix(request.body?.formatCriteria, reviewFormatCriteria, ['SI', 'NO'])
    const profileBackgroundCriteria = reviewMatrix(request.body?.backgroundCriteria, reviewBackgroundCriteria, ['MALO', 'REGULAR', 'BUENO'])
    const privateBackgroundCriteria = reviewMatrix(request.body?.backgroundCriteria, privateDefenseCriteria, ['MALO', 'REGULAR', 'BUENO'])
    const publicRatification = text(request.body?.publicRatification).toUpperCase()
    if (!isUuid(reviewId) || !['APROBADO', 'OBSERVADO'].includes(decision)) {
      return response.status(422).json({ message: 'Selecciona un dictamen válido para la revisión.' })
    }
    if (decision === 'OBSERVADO' && observations.length === 0) {
      return response.status(422).json({ message: 'Registra al menos una observación antes de devolver el perfil.' })
    }
    if (decision === 'APROBADO' && observations.length > 0) {
      return response.status(422).json({ message: 'Para aprobar el perfil elimina las observaciones o selecciona devolver con observaciones.' })
    }
    databaseClient = await pool.connect()
    await databaseClient.query('BEGIN')
    const selected = await databaseClient.query(
      `SELECT r.id AS review_id, r.decision AS current_decision,
              rr.id AS round_id, rr.numero_ronda, rr.cerrada_en,
              a.id AS assignment_id,
              p.id AS project_id, p.codigo_seguimiento, p.estado_actual_id, p.fase_actual_id,
              ep.codigo AS estado_codigo, document.tipo_documento AS document_type
       FROM titulacion.revisiones r
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
       JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id
       JOIN titulacion.versiones_documento version ON version.id = rr.version_documento_id
       JOIN titulacion.documentos document ON document.id = version.documento_id
       JOIN titulacion.proyectos p ON p.id = document.proyecto_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE r.id = $1
         AND a.docente_id = $2
         AND a.tipo IN ('REVISOR_1', 'REVISOR_2')
         AND a.activo AND a.fecha_fin IS NULL
       FOR UPDATE OF r, rr, a, p`,
      [reviewId, request.session.docente_id],
    )
    const review = selected.rows[0]
    if (!review) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'La revisión no está disponible para tu cuenta.' })
    }
    if (review.cerrada_en || review.estado_codigo === 'ANULADO' || review.estado_codigo === 'FINALIZADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'La ronda de revisión ya está cerrada.' })
    }
    if (review.current_decision !== 'PENDIENTE') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Ya emitiste un dictamen para esta revisión.' })
    }
    const isPrivateDefense = review.document_type === 'DOCUMENTO_PRIVADO'
    const isPublicDefense = review.document_type === 'DOCUMENTO_PUBLICO'
    const formatCriteria = isPrivateDefense || isPublicDefense ? [] : profileFormatCriteria
    const backgroundCriteria = isPublicDefense
      ? [{ code: 'RATIFICACION_DEFENSA_PUBLICA', value: publicRatification }]
      : isPrivateDefense ? privateBackgroundCriteria : profileBackgroundCriteria
    if (!formatCriteria || !backgroundCriteria) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Completa todos los criterios requeridos antes de emitir el dictamen.' })
    }
    if (isPublicDefense && !publicDefenseRatifications.includes(publicRatification)) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Selecciona la ratificación para la defensa pública.' })
    }
    if (isPublicDefense && ((decision === 'APROBADO') !== (publicRatification === 'SI'))) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'La ratificación Sí aprueba; No o Parcialmente requieren devolver el documento con observaciones.' })
    }
    if (!isPublicDefense && decision === 'APROBADO' && (formatCriteria.some((item) => item.value !== 'SI') || backgroundCriteria.some((item) => item.value !== 'BUENO'))) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Para aprobar sin observaciones, todos los criterios deben cumplir la guía.' })
    }

    await databaseClient.query(
      `UPDATE titulacion.revisiones
       SET decision = $2, comentario_general = $3, criterios_formato = $4::jsonb,
           criterios_fondo = $5::jsonb, decidida_en = now()
       WHERE id = $1`,
      [review.review_id, decision, generalComment || null, JSON.stringify(formatCriteria), JSON.stringify(backgroundCriteria)],
    )
    if (decision === 'OBSERVADO') {
      for (const [index, detail] of observations.entries()) {
        await databaseClient.query(
          `INSERT INTO titulacion.observaciones (revision_id, numero, detalle)
           VALUES ($1, $2, $3)`,
          [review.review_id, index + 1, detail],
        )
      }
    }
    await databaseClient.query(
      `UPDATE titulacion.notificaciones
       SET leida_en = COALESCE(leida_en, now())
       WHERE usuario_id = $1
         AND proyecto_id = $2
         AND tipo IN ('REVISION_ASIGNADA', 'DEFENSA_PRIVADA_ASIGNADA', 'DEFENSA_PUBLICA_ASIGNADA')
         AND leida_en IS NULL`,
      [request.session.usuario_id, review.project_id],
    )

    const roundReviews = await databaseClient.query(
      `SELECT decision FROM titulacion.revisiones WHERE ronda_revision_id = $1 FOR UPDATE`,
      [review.round_id],
    )
    const roundCompleted = roundReviews.rows.length > 0 && roundReviews.rows.every((item) => item.decision !== 'PENDIENTE')
    let roundResult = null
    let closedObservations = 0
    if (roundCompleted) {
      const hasObservations = roundReviews.rows.some((item) => item.decision === 'OBSERVADO' || item.decision === 'RECHAZADO')
      const catalog = await databaseClient.query(
        `SELECT
           (SELECT id FROM titulacion.estados_proyecto WHERE codigo = $1) AS state_id,
           (SELECT id FROM titulacion.fases WHERE codigo = $2 AND activa) AS phase_id`,
         [hasObservations ? 'OBSERVADO' : isPublicDefense ? 'APROBADO_INSTITUCIONAL' : isPrivateDefense ? 'EN_DOCUMENTO_PUBLICO' : 'EN_DOCUMENTO_PRIVADO', hasObservations ? (isPublicDefense ? 'DOCUMENTO_PUBLICO' : isPrivateDefense ? 'DOCUMENTO_PRIVADO' : 'REGISTRO') : isPublicDefense ? 'DOCUMENTO_PUBLICO' : isPrivateDefense ? 'DOCUMENTO_PUBLICO' : 'DOCUMENTO_PRIVADO'],
      )
      if (!catalog.rows[0].state_id || !catalog.rows[0].phase_id) throw new Error('Faltan catálogos para cerrar la ronda de revisión.')
      await databaseClient.query(
        `UPDATE titulacion.rondas_revision SET cerrada_en = now() WHERE id = $1`,
        [review.round_id],
      )
      if (!hasObservations) {
        const closed = await databaseClient.query(
          `UPDATE titulacion.observaciones o
           SET estado = 'CERRADA',
               cerrada_por_usuario_id = $1,
               cerrada_en = now()
           WHERE o.version_documento_respuesta_id = (
             SELECT version_documento_id FROM titulacion.rondas_revision WHERE id = $2
           )
             AND o.estado = 'RESPONDIDA'
           RETURNING o.id`,
          [request.session.usuario_id, review.round_id],
        )
        closedObservations = closed.rowCount
      }
      await recordProjectStatus(databaseClient, {
        projectId: review.project_id,
        previousStateId: review.estado_actual_id,
        nextStateId: catalog.rows[0].state_id,
        previousPhaseId: review.fase_actual_id,
        nextPhaseId: catalog.rows[0].phase_id,
        userId: request.session.usuario_id,
        reason: hasObservations
          ? `Ronda ${review.numero_ronda} cerrada con observaciones de los revisores.`
           : isPublicDefense
             ? `Documento final ratificado para defensa pública por tutor y revisores.`
             : isPrivateDefense
            ? `Documento para defensa privada aprobado por tutor y revisores.`
            : `Perfil aprobado por tutor y revisores; se habilitó el documento para defensa privada.`,
      })
      if (!hasObservations && !isPrivateDefense && !isPublicDefense) {
        await ensurePrivateDefenseDocument(databaseClient, {
          projectId: review.project_id,
          title: review.codigo_seguimiento,
          createdByUserId: request.session.usuario_id,
        })
      }
      if (!hasObservations && isPrivateDefense) {
        await ensurePublicDefenseDocument(databaseClient, {
          projectId: review.project_id,
          title: review.codigo_seguimiento,
          createdByUserId: request.session.usuario_id,
        })
      }
      const students = await databaseClient.query(
        `SELECT u.id AS usuario_id, u.correo
         FROM titulacion.proyecto_estudiantes pe
         JOIN titulacion.estudiantes e ON e.id = pe.estudiante_id
         JOIN titulacion.usuarios u ON u.id = e.usuario_id AND u.activo
         WHERE pe.proyecto_id = $1 AND pe.activo`,
        [review.project_id],
      )
      for (const student of students.rows) {
        await createNotification(databaseClient, {
          userId: student.usuario_id,
          recipientEmail: student.correo,
          projectId: review.project_id,
          type: hasObservations ? 'REVISION_DEVUELTA' : isPublicDefense ? 'DEFENSA_PUBLICA_APROBADA' : isPrivateDefense ? 'DOCUMENTO_PUBLICO_HABILITADO' : 'DOCUMENTO_PRIVADO_HABILITADO',
          title: hasObservations ? 'Documento devuelto con observaciones' : isPublicDefense ? 'Documento aprobado para defensa pública' : isPrivateDefense ? 'Documento para defensa pública habilitado' : 'Documento para defensa privada habilitado',
          message: hasObservations
            ? `El documento ${review.codigo_seguimiento} recibió observaciones. Revísalas y adjunta una nueva versión.`
            : isPublicDefense
              ? `El documento final ${review.codigo_seguimiento} fue ratificado para defensa pública por tutor y revisores.`
              : isPrivateDefense
              ? `El documento ${review.codigo_seguimiento} fue aprobado por tutor y revisores para la defensa privada.`
              : `El perfil ${review.codigo_seguimiento} fue aprobado. Ya puedes adjuntar el documento para defensa privada.`,
          link: hasObservations || isPrivateDefense || !isPublicDefense ? '/documentos' : '/student',
          queueEmail: hasObservations || isPrivateDefense || isPublicDefense,
        })
      }
      roundResult = hasObservations ? 'observed' : isPublicDefense ? 'public-defense-approved' : isPrivateDefense ? 'private-defense-approved' : 'profile-approved'
    }
    await recordAudit(databaseClient, request.session, {
      projectId: review.project_id,
      action: 'EMITIR_DICTAMEN_REVISION',
      entity: 'revisiones',
      entityId: review.review_id,
      detail: { decision, observationCount: observations.length, roundCompleted, roundResult, closedObservations },
    })
    await databaseClient.query('COMMIT')
    return response.json({
      message: roundCompleted
        ? roundResult === 'observed'
          ? 'Dictamen registrado. La ronda se cerró y el perfil fue devuelto al estudiante con observaciones.'
          : 'Dictamen registrado. La ronda se cerró y el perfil pasa a aprobación institucional.'
        : 'Dictamen registrado. La ronda se cerrará cuando el segundo revisor emita su dictamen.',
      roundCompleted,
      roundResult,
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.get('/api/reviewer/documents/:documentId/download', requireReviewer, async (request, response, next) => {
  try {
    const documentId = request.params.documentId
    const versionId = text(request.query.version)
    if (!isUuid(documentId) || (versionId && !isUuid(versionId))) {
      return response.status(400).json({ message: 'El documento solicitado no es válido.' })
    }
    const result = await pool.query(
      `SELECT document.proyecto_id, version.nombre_archivo, version.ruta_archivo, version.mime_type, version.contenido_archivo
       FROM titulacion.documentos document
       JOIN titulacion.versiones_documento version ON version.documento_id = document.id
       JOIN titulacion.rondas_revision rr ON rr.version_documento_id = version.id
       JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
       WHERE document.id = $2 AND document.activo
         AND a.docente_id = $1 AND a.tipo IN ('REVISOR_1', 'REVISOR_2')
         AND a.activo AND a.fecha_fin IS NULL
         AND ($3::uuid IS NULL OR version.id = $3::uuid)
       ORDER BY version.numero_version DESC
       LIMIT 1`,
      [request.session.docente_id, documentId, versionId || null],
    )
    const version = result.rows[0]
    if (!version) return response.status(404).json({ message: 'El archivo no está disponible para tus revisiones asignadas.' })
    if (!await sendStoredDocument(response, version)) return response.status(404).json({ message: 'El archivo no está disponible en el almacenamiento.' })
    return undefined
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
           AND NOT EXISTS (
             SELECT 1
             FROM titulacion.proyecto_estudiantes student_project
             JOIN titulacion.asignaciones_proyecto declined_tutor ON declined_tutor.proyecto_id = student_project.proyecto_id
             WHERE student_project.estudiante_id = $2
               AND student_project.activo
               AND declined_tutor.docente_id = d.id
               AND declined_tutor.tipo = 'TUTOR'
               AND NOT declined_tutor.activo
               AND declined_tutor.fecha_fin IS NOT NULL
               AND declined_tutor.motivo_cambio ILIKE '%declin%'
           )
         ORDER BY u.apellidos, u.nombres`,
        [session.carrera_id, session.estudiante_id],
      ),
      pool.query(
        `SELECT p.id, p.codigo_seguimiento, p.titulo_tentativo, p.descripcion,
                p.objetivo_general, p.registrado_en, g.nombre AS gestion_nombre,
                m.nombre AS modalidad_nombre, f.nombre AS fase_nombre, f.codigo AS fase_codigo,
                ep.nombre AS estado_nombre, ep.codigo AS estado_codigo,
                (
                  f.codigo = 'REGISTRO'
                  AND ep.codigo = 'REGISTRADO'
                  AND EXISTS (
                    SELECT 1
                    FROM titulacion.asignaciones_proyecto declined_tutor
                    WHERE declined_tutor.proyecto_id = p.id
                      AND declined_tutor.tipo = 'TUTOR'
                      AND NOT declined_tutor.activo
                      AND declined_tutor.fecha_fin IS NOT NULL
                      AND declined_tutor.motivo_cambio ILIKE '%declin%'
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM titulacion.asignaciones_proyecto current_tutor
                    WHERE current_tutor.proyecto_id = p.id
                      AND current_tutor.tipo = 'TUTOR'
                      AND current_tutor.fecha_fin IS NULL
                  )
                ) AS requiere_proponer_tutor
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

    const projectRow = project.rows[0]
    const feedback = projectRow ? await pool.query(
      `SELECT r.id AS revision_id, rr.numero_ronda, source_version.numero_version,
              trim(concat(reviewer.nombres, ' ', reviewer.apellidos)) AS revisor,
              a.tipo AS assignment_type,
              r.comentario_general, o.numero AS observacion_numero, o.detalle AS observacion_detalle
       FROM titulacion.rondas_revision rr
       JOIN titulacion.versiones_documento source_version ON source_version.id = rr.version_documento_id
       JOIN titulacion.documentos d ON d.id = source_version.documento_id
       JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
       JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
       JOIN titulacion.usuarios reviewer ON reviewer.id = teacher.usuario_id
       LEFT JOIN titulacion.observaciones o ON o.revision_id = r.id
       WHERE d.proyecto_id = $1
         AND r.decision IN ('OBSERVADO', 'RECHAZADO')
       ORDER BY rr.numero_ronda DESC, a.tipo, o.numero`,
      [projectRow.id],
    ) : { rows: [] }
    const feedbackByReview = new Map()
    for (const row of feedback.rows) {
      const current = feedbackByReview.get(row.revision_id) ?? {
        reviewer: row.assignment_type === 'TUTOR' ? `Revision del tutor: ${row.revisor}` : `${row.assignment_type === 'REVISOR_1' ? 'Revision del Revisor 1' : 'Revision del Revisor 2'}: ${row.revisor}`,
        roundNumber: row.numero_ronda,
        sourceVersion: row.numero_version,
        comment: row.comentario_general,
        observations: [],
      }
      if (row.observacion_detalle) current.observations.push({ number: row.observacion_numero, detail: row.observacion_detalle })
      feedbackByReview.set(row.revision_id, current)
    }
    const reviewProgress = projectRow ? await pool.query(
      `SELECT a.tipo, r.decision
       FROM titulacion.rondas_revision rr
       JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
       JOIN titulacion.documentos d ON d.id = vd.documento_id
       JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
       JOIN titulacion.asignaciones_proyecto a ON a.id = r.asignacion_proyecto_id
       WHERE d.proyecto_id = $1
         AND rr.id = (
           SELECT latest.id
           FROM titulacion.rondas_revision latest
           JOIN titulacion.versiones_documento latest_version ON latest_version.id = latest.version_documento_id
           JOIN titulacion.documentos latest_document ON latest_document.id = latest_version.documento_id
           WHERE latest_document.proyecto_id = $1
           ORDER BY latest.numero_ronda DESC
           LIMIT 1
         )
       ORDER BY a.tipo`,
      [projectRow.id],
    ) : { rows: [] }

    return response.json({
      user: sanitizeUser(session),
      managements: managements.rows,
      modalities: modalities.rows,
      tutors: tutors.rows.map((tutor) => ({ id: tutor.id, name: `${tutor.nombres} ${tutor.apellidos}`.trim() })),
      project: projectPayload(projectRow),
      rejectionReasons: [...feedbackByReview.values()],
      reviewProgress: reviewProgress.rows.map((item) => ({ type: item.tipo, decision: item.decision })),
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
              m.nombre AS modalidad_nombre, f.nombre AS fase_nombre, f.codigo AS fase_codigo,
              ep.nombre AS estado_nombre, ep.codigo AS estado_codigo,
              (
                f.codigo = 'REGISTRO'
                AND ep.codigo = 'REGISTRADO'
                AND EXISTS (
                  SELECT 1
                  FROM titulacion.asignaciones_proyecto declined_tutor
                  WHERE declined_tutor.proyecto_id = p.id
                    AND declined_tutor.tipo = 'TUTOR'
                    AND NOT declined_tutor.activo
                    AND declined_tutor.fecha_fin IS NOT NULL
                    AND declined_tutor.motivo_cambio ILIKE '%declin%'
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM titulacion.asignaciones_proyecto current_tutor
                  WHERE current_tutor.proyecto_id = p.id
                    AND current_tutor.tipo = 'TUTOR'
                    AND current_tutor.fecha_fin IS NULL
                )
              ) AS requiere_proponer_tutor
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

app.post('/api/student/projects/:projectId/tutor-proposal', requireStudent, async (request, response, next) => {
  let databaseClient = null
  try {
    const projectId = request.params.projectId
    const tutorId = text(request.body?.tutorId)
    if (!isUuid(projectId) || !isUuid(tutorId)) {
      return response.status(422).json({ message: 'Selecciona un tutor disponible para enviar la invitación.' })
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
      return response.status(403).json({ message: 'No fue posible validar tu perfil de estudiante.' })
    }

    const project = await databaseClient.query(
      `SELECT p.id, p.codigo_seguimiento, f.codigo AS fase_codigo, ep.codigo AS estado_codigo
       FROM titulacion.proyectos p
       JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = p.id AND pe.activo
       JOIN titulacion.fases f ON f.id = p.fase_actual_id
       JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
       WHERE p.id = $1 AND pe.estudiante_id = $2
       FOR UPDATE OF p`,
      [projectId, student.rows[0].id],
    )
    const selectedProject = project.rows[0]
    if (!selectedProject) {
      await databaseClient.query('ROLLBACK')
      return response.status(404).json({ message: 'El proyecto no está disponible para proponer un tutor.' })
    }
    if (selectedProject.fase_codigo !== 'REGISTRO' || selectedProject.estado_codigo !== 'REGISTRADO') {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'La propuesta de tutor solo está disponible antes de iniciar la revisión del proyecto.' })
    }

    const [declinedTutor, currentTutor] = await Promise.all([
      databaseClient.query(
        `SELECT 1
         FROM titulacion.asignaciones_proyecto
         WHERE proyecto_id = $1
           AND tipo = 'TUTOR'
           AND NOT activo
           AND fecha_fin IS NOT NULL
           AND motivo_cambio ILIKE '%declin%'
         LIMIT 1`,
        [projectId],
      ),
      databaseClient.query(
        `SELECT 1
         FROM titulacion.asignaciones_proyecto
         WHERE proyecto_id = $1
           AND tipo = 'TUTOR'
           AND fecha_fin IS NULL
         LIMIT 1`,
        [projectId],
      ),
    ])
    if (!declinedTutor.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Aún no tienes una tutoría declinada para reemplazar.' })
    }
    if (currentTutor.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(409).json({ message: 'Tu proyecto ya tiene una tutoría activa o una invitación pendiente.' })
    }

    const tutor = await staffWithRole(databaseClient, {
      teacherId: tutorId,
      careerId: student.rows[0].carrera_id,
      roleCode: 'TUTOR',
    })
    if (!tutor) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Selecciona un tutor disponible de la lista.' })
    }
    const previouslyDeclined = await databaseClient.query(
      `SELECT 1
       FROM titulacion.asignaciones_proyecto
       WHERE proyecto_id = $1
         AND docente_id = $2
         AND tipo = 'TUTOR'
         AND NOT activo
         AND fecha_fin IS NOT NULL
         AND motivo_cambio ILIKE '%declin%'
       LIMIT 1`,
      [projectId, tutor.id],
    )
    if (previouslyDeclined.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Selecciona un docente distinto al que declinó la tutoría.' })
    }

    await databaseClient.query(
      `INSERT INTO titulacion.asignaciones_proyecto
        (proyecto_id, docente_id, tipo, asignado_por_usuario_id, activo, motivo_cambio)
       VALUES ($1, $2, 'TUTOR', $3, false, $4)`,
      [
        projectId,
        tutor.id,
        request.session.usuario_id,
        'Tutor propuesto nuevamente por el estudiante después de una declinación; pendiente de respuesta del tutor.',
      ],
    )
    await databaseClient.query(
      `UPDATE titulacion.proyectos
       SET tiene_tutor = true,
           tutor_nombre_declarado = $2,
           tutor_correo_declarado = $3
       WHERE id = $1`,
      [projectId, tutor.name, tutor.correo],
    )
    await createNotification(databaseClient, {
      userId: tutor.usuario_id,
      recipientEmail: tutor.correo,
      projectId,
      type: 'SOLICITUD_TUTORIA',
      title: 'Nueva invitación de tutoría',
      message: `El estudiante te propone como tutor del proyecto ${selectedProject.codigo_seguimiento}. Responde desde el Portal del Tutor.`,
      link: '/tutor/invitaciones',
      queueEmail: true,
    })
    const administrators = await databaseClient.query(
      `SELECT DISTINCT u.id AS usuario_id, u.correo
       FROM titulacion.usuarios u
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = 'ADMINISTRADOR'
       WHERE u.activo`,
    )
    for (const administrator of administrators.rows) {
      await createNotification(databaseClient, {
        userId: administrator.usuario_id,
        recipientEmail: administrator.correo,
        projectId,
        type: 'TUTOR_PROPUESTO_POR_ESTUDIANTE',
        title: 'Nuevo tutor propuesto por el estudiante',
        message: `El estudiante propuso un nuevo tutor para el proyecto ${selectedProject.codigo_seguimiento}. Espera su respuesta antes de asignar revisores.`,
        link: '/admin/revisiones-por-iniciar',
        queueEmail: true,
      })
    }
    await recordAudit(databaseClient, request.session, {
      projectId,
      action: 'PROPONER_NUEVO_TUTOR_POR_DECLINACION',
      entity: 'asignaciones_proyecto',
      detail: { tutorId: tutor.id, previousTutorDeclined: true },
    })
    await databaseClient.query('COMMIT')
    return response.status(201).json({ message: `La invitación fue enviada a ${tutor.name}. Recibirás un aviso cuando responda.` })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.get('/api/documents', requireStudent, async (request, response, next) => {
  try {
    const { session } = request
    const [documents, versions, observations] = await Promise.all([
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
      pool.query(
        `SELECT d.id AS documento_id, o.id AS observacion_id, o.numero, o.detalle,
                o.estado, o.respuesta_estudiante, o.respondida_en,
                rr.numero_ronda, source_version.numero_version AS version_origen,
                response_version.numero_version AS version_respuesta,
                trim(concat(reviewer.nombres, ' ', reviewer.apellidos)) AS revisor
         FROM titulacion.documentos d
         JOIN titulacion.proyecto_estudiantes pe ON pe.proyecto_id = d.proyecto_id AND pe.estudiante_id = $1 AND pe.activo
         JOIN titulacion.versiones_documento source_version ON source_version.documento_id = d.id
         JOIN titulacion.rondas_revision rr ON rr.version_documento_id = source_version.id
         JOIN titulacion.revisiones r ON r.ronda_revision_id = rr.id
         JOIN titulacion.observaciones o ON o.revision_id = r.id
         JOIN titulacion.asignaciones_proyecto assignment ON assignment.id = r.asignacion_proyecto_id
         JOIN titulacion.docentes teacher ON teacher.id = assignment.docente_id
         JOIN titulacion.usuarios reviewer ON reviewer.id = teacher.usuario_id
         LEFT JOIN titulacion.versiones_documento response_version ON response_version.id = o.version_documento_respuesta_id
         WHERE d.activo
         ORDER BY d.id, rr.numero_ronda DESC, assignment.tipo, o.numero`,
        [session.estudiante_id],
      ),
    ])

    const versionsByDocument = new Map()
    for (const version of versions.rows) {
      const current = versionsByDocument.get(version.documento_id) ?? []
      current.push(versionPayload(version))
      versionsByDocument.set(version.documento_id, current)
    }
    const observationsByDocument = new Map()
    for (const observation of observations.rows) {
      const current = observationsByDocument.get(observation.documento_id) ?? []
      current.push({
        id: observation.observacion_id,
        number: observation.numero,
        detail: observation.detalle,
        status: observation.estado,
        response: observation.respuesta_estudiante,
        respondedAt: observation.respondida_en,
        roundNumber: observation.numero_ronda,
        sourceVersion: observation.version_origen,
        responseVersion: observation.version_respuesta,
        reviewer: observation.revisor,
      })
      observationsByDocument.set(observation.documento_id, current)
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
        canUploadVersion: document.permite_edicion_estudiante && (
          (document.tipo_documento === 'PERFIL_PROYECTO' && document.fase_codigo === 'REGISTRO')
          || (document.tipo_documento === 'DOCUMENTO_PRIVADO' && document.fase_codigo === 'DOCUMENTO_PRIVADO')
          || (document.tipo_documento === 'DOCUMENTO_PUBLICO' && document.fase_codigo === 'DOCUMENTO_PUBLICO')
        ),
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
        observations: observationsByDocument.get(document.id) ?? [],
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
      `SELECT d.proyecto_id, vd.nombre_archivo, vd.ruta_archivo, vd.mime_type, vd.contenido_archivo
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

    if (!await sendStoredDocument(response, version)) return response.status(404).json({ message: 'El archivo no está disponible en el almacenamiento.' })
    return undefined
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
      `SELECT d.id, d.proyecto_id, d.nombre, d.tipo_documento, f.codigo AS fase_codigo,
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
    const canUploadSelectedDocument = (selected.tipo_documento === 'PERFIL_PROYECTO' && selected.fase_codigo === 'REGISTRO')
      || (selected.tipo_documento === 'DOCUMENTO_PRIVADO' && selected.fase_codigo === 'DOCUMENTO_PRIVADO')
      || (selected.tipo_documento === 'DOCUMENTO_PUBLICO' && selected.fase_codigo === 'DOCUMENTO_PUBLICO')
    if (!canUploadSelectedDocument) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Este documento no puede recibir una nueva versión en la fase actual.' })
    }

    let submittedResponses
    try {
      submittedResponses = text(request.body?.observationResponses)
        ? JSON.parse(request.body.observationResponses)
        : []
    } catch {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Las respuestas a las observaciones no tienen un formato válido.' })
    }
    const pendingObservations = await databaseClient.query(
      `SELECT o.id
       FROM titulacion.observaciones o
       JOIN titulacion.revisiones r ON r.id = o.revision_id
       JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id
       JOIN titulacion.versiones_documento source_version ON source_version.id = rr.version_documento_id
       WHERE source_version.documento_id = $1
         AND o.estado = 'ABIERTA'
       ORDER BY o.id
       FOR UPDATE OF o`,
      [selected.id],
    )
    if (pendingObservations.rows.length > 0) {
      if (!Array.isArray(submittedResponses)) {
        await databaseClient.query('ROLLBACK')
        return response.status(422).json({ message: 'Debes responder todas las observaciones junto con la versión corregida.' })
      }
      const responsesByObservation = new Map()
      for (const item of submittedResponses) {
        const observationId = typeof item?.id === 'string' ? item.id : ''
        const studentResponse = text(item?.response)
        if (!isUuid(observationId) || studentResponse.length < 5 || studentResponse.length > 2000 || responsesByObservation.has(observationId)) {
          await databaseClient.query('ROLLBACK')
          return response.status(422).json({ message: 'Cada respuesta debe tener entre 5 y 2000 caracteres y corresponder a una observación pendiente.' })
        }
        responsesByObservation.set(observationId, studentResponse)
      }
      if (responsesByObservation.size !== pendingObservations.rows.length || pendingObservations.rows.some((observation) => !responsesByObservation.has(observation.id))) {
        await databaseClient.query('ROLLBACK')
        return response.status(422).json({ message: 'Responde todas las observaciones pendientes antes de adjuntar la versión corregida.' })
      }
      for (const observation of pendingObservations.rows) {
        await databaseClient.query(
          `UPDATE titulacion.observaciones
           SET estado = 'RESPONDIDA', respuesta_estudiante = $1,
               respondida_por_usuario_id = $2, respondida_en = now()
           WHERE id = $3`,
          [responsesByObservation.get(observation.id), request.session.usuario_id, observation.id],
        )
      }
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
    savedFilePath = await saveLocalDocumentCopy(relativePath, selected.proyecto_id, request.file.buffer)

    const inserted = await databaseClient.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega, contenido_archivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id AS version_id, numero_version, nombre_archivo, mime_type, tamano_bytes, subida_en, comentario_entrega`,
      [
        selected.id,
        number.rows[0].siguiente,
        versionedDocumentFilename(selected.nombre, number.rows[0].siguiente, request.file.originalname),
        relativePath,
        request.file.mimetype || 'application/octet-stream',
        request.file.size,
        crypto.createHash('sha256').update(request.file.buffer).digest('hex'),
        request.session.usuario_id,
        text(request.body?.comment) || null,
        request.file.buffer,
      ],
    )
    const linkedObservations = await databaseClient.query(
      `UPDATE titulacion.observaciones o
       SET version_documento_respuesta_id = $1
       FROM titulacion.revisiones r
       JOIN titulacion.rondas_revision rr ON rr.id = r.ronda_revision_id
       JOIN titulacion.versiones_documento source_version ON source_version.id = rr.version_documento_id
       WHERE o.revision_id = r.id
         AND source_version.documento_id = $2
         AND o.estado = 'RESPONDIDA'
         AND o.version_documento_respuesta_id IS NULL
       RETURNING o.id`,
      [inserted.rows[0].version_id, selected.id],
    )
    const project = await lockedProject(databaseClient, selected.proyecto_id)
    if (!project) throw new Error('No fue posible obtener el proyecto de la nueva versión.')
    const tutors = await databaseClient.query(
      `SELECT teacher.usuario_id
       FROM titulacion.asignaciones_proyecto a
       JOIN titulacion.docentes teacher ON teacher.id = a.docente_id
       JOIN titulacion.usuarios user_account ON user_account.id = teacher.usuario_id AND user_account.activo
       WHERE a.proyecto_id = $1
         AND a.tipo = 'TUTOR'
         AND a.activo
         AND a.fecha_fin IS NULL
         AND a.respondida_en IS NOT NULL`,
      [selected.proyecto_id],
    )
    for (const tutor of tutors.rows) {
      // La ronda de defensa pública ya avisa al tutor y a ambos revisores.
      // Evitamos duplicar ese aviso con el mensaje genérico de actualización.
      if (selected.tipo_documento === 'DOCUMENTO_PUBLICO') continue
      await createNotification(databaseClient, {
        userId: tutor.usuario_id,
        projectId: selected.proyecto_id,
        type: 'DOCUMENTO_ACTUALIZADO_TUTOR',
        title: selected.tipo_documento === 'DOCUMENTO_PRIVADO' ? 'Nuevo documento para defensa privada' : 'Nueva versión del perfil',
        message: selected.tipo_documento === 'DOCUMENTO_PRIVADO'
          ? `El estudiante adjuntó la versión V${inserted.rows[0].numero_version} del documento para defensa privada ${project.codigo_seguimiento}.`
          : `El estudiante adjuntó la versión V${inserted.rows[0].numero_version} del perfil ${project.codigo_seguimiento}.`,
        link: '/tutor/projects',
      })
    }
    const correctionReview = selected.tipo_documento === 'DOCUMENTO_PUBLICO'
      ? await schedulePublicDefenseReview(databaseClient, {
        project,
        documentId: selected.id,
        versionId: inserted.rows[0].version_id,
        versionNumber: inserted.rows[0].numero_version,
        session: request.session,
      })
      : selected.tipo_documento === 'DOCUMENTO_PRIVADO'
      ? await schedulePrivateDefenseReview(databaseClient, {
        project,
        documentId: selected.id,
        versionId: inserted.rows[0].version_id,
        versionNumber: inserted.rows[0].numero_version,
        session: request.session,
      })
      : await scheduleCorrectionReview(databaseClient, {
        project,
        documentId: selected.id,
        versionId: inserted.rows[0].version_id,
        versionNumber: inserted.rows[0].numero_version,
        session: request.session,
      })
    await databaseClient.query('COMMIT')
    return response.status(201).json({
      message: correctionReview.scheduled
        ? selected.tipo_documento === 'DOCUMENTO_PUBLICO'
          ? `Documento final V${inserted.rows[0].numero_version} enviado al tutor y a los dos revisores para defensa pública.`
          : selected.tipo_documento === 'DOCUMENTO_PRIVADO'
          ? `Se registró la versión ${inserted.rows[0].numero_version} y se envió al tutor y a los dos revisores para defensa privada.`
          : `Se registró la versión ${inserted.rows[0].numero_version} y se reenviaron las correcciones a los mismos revisores.`
        : linkedObservations.rowCount > 0
          ? `Se registró la versión ${inserted.rows[0].numero_version} y se asociaron ${linkedObservations.rowCount} observación(es) respondida(s). Responde todas las observaciones de la última ronda para reenviar la corrección.`
          : `Se registró la versión ${inserted.rows[0].numero_version} del documento.`,
      version: versionPayload(inserted.rows[0]),
      linkedObservations: linkedObservations.rowCount,
      correctionReview: { scheduled: correctionReview.scheduled, roundId: correctionReview.roundId ?? null },
    })
  } catch (error) {
    if (databaseClient) await databaseClient.query('ROLLBACK').catch(() => undefined)
    if (savedFilePath) await rm(savedFilePath, { force: true }).catch(() => undefined)
    return next(error)
  } finally {
    databaseClient?.release()
  }
})

app.post('/api/projects', requireStudent, upload.fields([{ name: 'profile', maxCount: 1 }, { name: 'supportingDocuments', maxCount: 5 }]), async (request, response, next) => {
  const savedFilePaths = []
  let databaseClient = null

  try {
    const profileFile = request.files?.profile?.[0]
    const supportingFiles = request.files?.supportingDocuments ?? []
    const managementId = text(request.body?.managementId)
    const modalityId = text(request.body?.modalityId)
    const tutorId = text(request.body?.tutorId)
    const program = text(request.body?.program)
    const participants = text(request.body?.participants).split('\n').map(text).filter(Boolean)
    const address = text(request.body?.address)
    const landline = text(request.body?.landline)
    const contactEmail = text(request.body?.contactEmail).toLowerCase()
    const mobile = text(request.body?.mobile)
    const scope = text(request.body?.scope)
    const hasTutor = request.body?.hasTutor === 'true'
    const tutorName = text(request.body?.tutorName)
    const tutorWorkplace = text(request.body?.tutorWorkplace)
    const tutorEmail = text(request.body?.tutorEmail).toLowerCase()
    const tutorMobile = text(request.body?.tutorMobile)
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

    const validPrograms = ['Ingenieria de Sistemas Informaticos', 'Tecnico Superior en Desarrollo de Video Juegos']
    if (participants.length === 0 || !validPrograms.includes(program) || address.length < 5 || !contactEmail.includes('@') || title.length < 10 || description.length < 20 || scope.length < 20 || generalObjective.length < 10 || !managementId || !modalityId || (hasTutor && (!isUuid(tutorId) || tutorName.length < 3 || tutorWorkplace.length < 3)) || cleanObjectives.some((item) => item.length < 10)) {
      return response.status(422).json({ message: 'Revisa los campos: título (10), descripción (20) y cada objetivo (10) requieren la longitud mínima indicada.' })
    }

    if (!isWordDocument(profileFile)) {
      return response.status(422).json({ message: 'Adjunta el perfil del proyecto en formato Word (.doc o .docx).' })
    }
    if (supportingFiles.some((file) => !isSupportingDocument(file))) {
      return response.status(422).json({ message: 'Los documentos complementarios deben tener un formato permitido.' })
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

    const tutor = hasTutor ? await databaseClient.query(
      `SELECT d.id, u.id AS usuario_id, u.correo
       FROM titulacion.docentes d
       JOIN titulacion.usuarios u ON u.id = d.usuario_id AND u.activo
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.codigo = 'TUTOR' AND r.activo
       WHERE d.id = $1 AND d.carrera_id = $2 AND d.activo
       LIMIT 1`,
      [tutorId, student.rows[0].carrera_id],
    ) : { rows: [] }
    if (hasTutor && !tutor.rows[0]) {
      await databaseClient.query('ROLLBACK')
      return response.status(422).json({ message: 'Selecciona un tutor disponible de la lista.' })
    }

    const project = await databaseClient.query(
      `INSERT INTO titulacion.proyectos
         (codigo_seguimiento, gestion_id, modalidad_id, fase_actual_id, estado_actual_id,
          titulo_tentativo, descripcion, objetivo_general, creado_por_usuario_id,
          programa_academico, integrantes_declarados, direccion_contacto, telefono_fijo,
          correo_contacto, celular_contacto, alcance_trabajo, tiene_tutor,
          tutor_nombre_declarado, tutor_lugar_trabajo, tutor_correo_declarado, tutor_celular_declarado)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        program,
        JSON.stringify(participants),
        address,
        landline || null,
        contactEmail,
        mobile || null,
        scope,
        hasTutor,
        tutorName || null,
        tutorWorkplace || null,
        tutorEmail || null,
        tutorMobile || null,
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

    if (hasTutor) await databaseClient.query(
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

    if (hasTutor) await createNotification(databaseClient, {
      userId: tutor.rows[0].usuario_id,
      recipientEmail: tutor.rows[0].correo,
      projectId: createdProject.id,
      type: 'SOLICITUD_TUTORIA',
      title: 'Nueva invitación de tutoría',
      message: `Tienes una invitación para acompañar el proyecto ${createdProject.codigo_seguimiento}. Responde desde el Portal del Tutor.`,
      link: '/tutor/invitaciones',
      queueEmail: true,
    })

    const administrators = await databaseClient.query(
      `SELECT DISTINCT u.id AS usuario_id, u.correo
       FROM titulacion.usuarios u
       JOIN titulacion.usuario_roles ur ON ur.usuario_id = u.id AND ur.activo
       JOIN titulacion.roles r ON r.id = ur.rol_id AND r.activo AND r.codigo = 'ADMINISTRADOR'
       WHERE u.activo`,
    )
    for (const administrator of administrators.rows) await createNotification(databaseClient, {
      userId: administrator.usuario_id,
      recipientEmail: administrator.correo,
      projectId: createdProject.id,
      type: 'NUEVO_PROYECTO_REGISTRADO',
      title: 'Nuevo proyecto registrado',
      message: `El estudiante registró el proyecto ${createdProject.codigo_seguimiento}. Completa el equipo evaluador y habilita la primera revisión cuando el tutor acepte.`,
      link: '/admin/revisiones-por-iniciar',
      queueEmail: true,
    })

    const extension = path.extname(profileFile.originalname).toLowerCase()
    const filename = `${crypto.randomUUID()}${extension}`
    const relativePath = path.posix.join('uploads', 'proyectos', createdProject.id, filename)
    const savedFilePath = await saveLocalDocumentCopy(relativePath, createdProject.id, profileFile.buffer)
    if (savedFilePath) savedFilePaths.push(savedFilePath)

    const document = await databaseClient.query(
      `INSERT INTO titulacion.documentos
        (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
       VALUES ($1, $2, $3, 'PERFIL_PROYECTO', $4)
       RETURNING id`,
      [createdProject.id, values.fase_id, title, request.session.usuario_id],
    )
    await databaseClient.query(
      `INSERT INTO titulacion.versiones_documento
        (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega, contenido_archivo)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        document.rows[0].id,
        versionedDocumentFilename(title, 1, profileFile.originalname),
        relativePath,
        profileFile.mimetype || 'application/octet-stream',
        profileFile.size,
        crypto.createHash('sha256').update(profileFile.buffer).digest('hex'),
        request.session.usuario_id,
        'Perfil adjunto durante el registro del Formulario 1.',
        profileFile.buffer,
      ],
    )

    for (const [index, file] of supportingFiles.entries()) {
      const attachmentPath = path.posix.join('uploads', 'proyectos', createdProject.id, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
      const attachmentAbsolutePath = await saveLocalDocumentCopy(attachmentPath, createdProject.id, file.buffer)
      if (attachmentAbsolutePath) savedFilePaths.push(attachmentAbsolutePath)
      const attachment = await databaseClient.query(
        `INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
         VALUES ($1, $2, $3, 'ANEXO_FORMULARIO_1', $4) RETURNING id`,
        [createdProject.id, values.fase_id, `Documento complementario ${index + 1}`, request.session.usuario_id],
      )
      await databaseClient.query(
        `INSERT INTO titulacion.versiones_documento
          (documento_id, numero_version, nombre_archivo, ruta_archivo, mime_type, tamano_bytes, hash_archivo, subido_por_usuario_id, comentario_entrega, contenido_archivo)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, 'Documento complementario adjunto en el Formulario 1.', $8)`,
        [attachment.rows[0].id, file.originalname, attachmentPath, file.mimetype || 'application/octet-stream', file.size, crypto.createHash('sha256').update(file.buffer).digest('hex'), request.session.usuario_id, file.buffer],
      )
    }

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
    await Promise.all(savedFilePaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)))
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

// Vercel carga la aplicación mediante api/[...path].js. En desarrollo local
// mantenemos el servidor HTTP independiente para que npm run dev siga igual.
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (!process.env.VERCEL && isMainModule) {
  void initializeServerless().then(() => {
    app.listen(port, '127.0.0.1', () => {
      console.log(`API de Seguimiento de Titulación disponible en http://127.0.0.1:${port}`)
    })
    void runPendingReviewReminders().catch((error) => console.error('No fue posible enviar los recordatorios de revisión:', error))
    setInterval(() => {
      void runPendingReviewReminders().catch((error) => console.error('No fue posible enviar los recordatorios de revisión:', error))
    }, reviewReminderIntervalMs).unref()
  }).catch((error) => {
    console.error('No fue posible inicializar el registro de cuentas:', error)
    process.exitCode = 1
  })
}

export default app
