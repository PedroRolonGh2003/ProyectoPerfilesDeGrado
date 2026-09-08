import 'dotenv/config'

import assert from 'node:assert/strict'
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
const adminEmail = `qa.admin.${suffix}@univalle.edu`
const studentEmail = `qa.admin.student.${suffix}@univalle.edu`
const password = 'AdminDashboardQA-2026'
let adminId = ''
let studentId = ''
let adminCookie = ''
let studentCookie = ''

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function setupUsers() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const catalog = await client.query(
      `SELECT
         (SELECT id FROM titulacion.roles WHERE codigo = 'ADMINISTRADOR' AND activo) AS admin_role_id,
         (SELECT id FROM titulacion.roles WHERE codigo = 'ESTUDIANTE' AND activo) AS student_role_id,
         (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS career_id`,
    )
    const { admin_role_id: adminRoleId, student_role_id: studentRoleId, career_id: careerId } = catalog.rows[0]
    assert.ok(adminRoleId && studentRoleId && careerId, 'Faltan catálogos para QA del portal administrativo')

    const admin = await client.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
       VALUES ('QA', 'Administración Temporal', $1, $2)
       RETURNING id`,
      [adminEmail, await bcrypt.hash(password, 10)],
    )
    adminId = admin.rows[0].id
    await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [adminId, adminRoleId])

    const student = await client.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
       VALUES ('QA', 'Estudiante Administración', $1, $2)
       RETURNING id`,
      [studentEmail, await bcrypt.hash(password, 10)],
    )
    studentId = student.rows[0].id
    await client.query(
      `INSERT INTO titulacion.estudiantes (usuario_id, carrera_id, registro_universitario)
       VALUES ($1, $2, $3)`,
      [studentId, careerId, `QA-ADMIN-${suffix}`],
    )
    await client.query('INSERT INTO titulacion.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [studentId, studentRoleId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function cleanup() {
  const userIds = [adminId, studentId].filter(Boolean)
  if (userIds.length === 0) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM titulacion.sesiones_usuario WHERE usuario_id = ANY($1::uuid[])', [userIds])
    await client.query('DELETE FROM titulacion.notificaciones WHERE usuario_id = ANY($1::uuid[])', [userIds])
    await client.query('DELETE FROM titulacion.usuario_roles WHERE usuario_id = ANY($1::uuid[])', [userIds])
    if (studentId) await client.query('DELETE FROM titulacion.estudiantes WHERE usuario_id = $1', [studentId])
    await client.query('DELETE FROM titulacion.usuarios WHERE id = ANY($1::uuid[])', [userIds])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

try {
  await expect(await fetch(`${apiUrl}/api/admin/dashboard`), 401, 'Protección del portal administrativo')
  await setupUsers()

  const adminLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: adminEmail, password }),
  }), 200, 'Inicio de sesión de Administración')
  adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(adminCookie.startsWith('stit_session='), 'No se creó la sesión administrativa')

  const session = await expect(await fetch(`${apiUrl}/api/auth/session`, { headers: { Cookie: adminCookie } }), 200, 'Identificación de rol administrativo')
  assert.equal((await session.json()).user.role, 'ADMINISTRADOR', 'La sesión no se identificó como Administración')

  const dashboardResponse = await expect(await fetch(`${apiUrl}/api/admin/dashboard`, { headers: { Cookie: adminCookie } }), 200, 'Carga del panel administrativo')
  const dashboard = await dashboardResponse.json()
  assert.equal(dashboard.user.role, 'ADMINISTRADOR', 'El panel no identifica correctamente al rol')
  assert.ok(Array.isArray(dashboard.statuses) && dashboard.statuses.length > 0, 'El panel no carga los estados de proyecto')
  assert.ok(Array.isArray(dashboard.projects), 'El panel no devuelve el listado de proyectos')
  assert.equal(dashboard.summary.total, dashboard.projects.length, 'El resumen no coincide con el listado cargado')

  const databaseProjects = await pool.query(
    `SELECT p.codigo_seguimiento, p.titulo_tentativo, ep.codigo AS estado_codigo
     FROM titulacion.proyectos p
     JOIN titulacion.estados_proyecto ep ON ep.id = p.estado_actual_id
     ORDER BY p.registrado_en DESC
     LIMIT 100`,
  )
  assert.equal(dashboard.projects.length, databaseProjects.rows.length, 'El listado administrativo no coincide con PostgreSQL')
  if (databaseProjects.rows[0]) {
    const firstProject = dashboard.projects.find((project) => project.code === databaseProjects.rows[0].codigo_seguimiento)
    assert.ok(firstProject, 'El proyecto registrado no aparece en el panel administrativo')
    assert.equal(firstProject.title, databaseProjects.rows[0].titulo_tentativo, 'El título del proyecto no coincide con PostgreSQL')
    assert.equal(firstProject.statusCode, databaseProjects.rows[0].estado_codigo, 'El estado del proyecto no coincide con PostgreSQL')
  }

  const studentLogin = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: studentEmail, password }),
  }), 200, 'Inicio de sesión del estudiante de control')
  studentCookie = studentLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  await expect(await fetch(`${apiUrl}/api/admin/dashboard`, { headers: { Cookie: studentCookie } }), 403, 'Bloqueo del panel administrativo para estudiante')

  console.log(`QA Administración aprobado: autenticación, autorización y datos reales verificados (${dashboard.projects.length} proyectos).`)
} finally {
  if (adminCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: adminCookie } }).catch(() => undefined)
  if (studentCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: studentCookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
