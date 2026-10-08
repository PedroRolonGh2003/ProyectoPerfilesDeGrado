import 'dotenv/config'

import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const port = Number(process.env.PORT ?? 3001)
const apiUrl = `http://127.0.0.1:${port}`
const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, options: '-c search_path=titulacion,public' }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: '-c search_path=titulacion,public',
    })

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const password = 'AdminUsersQA-2026'
let adminId = ''
let targetUserId = ''
let projectId = ''
let uploadPath = ''
let cookie = ''

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

async function setup() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const catalog = await client.query(
      `SELECT
         (SELECT id FROM titulacion.carreras WHERE codigo = 'SIS' AND activa) AS career_id,
         (SELECT g.id FROM titulacion.gestiones g JOIN titulacion.carreras c ON c.id = g.carrera_id WHERE c.codigo = 'SIS' AND g.activa ORDER BY g.fecha_inicio DESC LIMIT 1) AS management_id,
         (SELECT m.id FROM titulacion.modalidades_titulacion m JOIN titulacion.carreras c ON c.id = m.carrera_id WHERE c.codigo = 'SIS' AND m.activa ORDER BY m.codigo LIMIT 1) AS modality_id`,
    )
    const values = catalog.rows[0]
    assert.ok(values.career_id && values.management_id && values.modality_id, 'Faltan catálogos de Sistemas para QA')
    const admin = await client.query(
      `INSERT INTO titulacion.usuarios (nombres, apellidos, correo, password_hash)
       VALUES ('QA', 'Administración Usuarios', $1, $2)
       RETURNING id`,
      [`qa.admin.users.${suffix}@univalle.edu`, await bcrypt.hash(password, 10)],
    )
    adminId = admin.rows[0].id
    await client.query(
      `INSERT INTO titulacion.usuario_roles (usuario_id, rol_id)
       SELECT $1, id FROM titulacion.roles WHERE codigo = 'ADMINISTRADOR' AND activo`,
      [adminId],
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

async function cleanup() {
  const userIds = [adminId, targetUserId].filter(Boolean)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (projectId) {
      await client.query('DELETE FROM titulacion.auditoria WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.notificaciones WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.historial_estados WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.anulaciones_proyecto WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.objetivos_especificos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
      await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    }
    if (userIds.length > 0) {
      await client.query('DELETE FROM titulacion.auditoria WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.notificaciones WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.sesiones_usuario WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.usuario_roles WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.estudiantes WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.docentes WHERE usuario_id = ANY($1::uuid[])', [userIds])
      await client.query('DELETE FROM titulacion.usuarios WHERE id = ANY($1::uuid[])', [userIds])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  if (uploadPath) await rm(path.resolve(process.cwd(), ...uploadPath.split('/')), { force: true })
}

try {
  const catalog = await setup()
  const login = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: `qa.admin.users.${suffix}@univalle.edu`, password }),
  }), 200, 'Inicio de sesión de Administración')
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''

  await expect(await fetch(`${apiUrl}/api/admin/users`), 401, 'Protección del directorio de usuarios')
  const directory = await expect(await fetch(`${apiUrl}/api/admin/users`, { headers: { Cookie: cookie } }), 200, 'Carga de usuarios')
  assert.ok((await directory.json()).users.some((user) => user.id === adminId), 'El administrador de QA no aparece en el directorio')

  const userEmail = `qa.usuario.integral.${suffix}@univalle.edu`
  const created = await expect(await fetch(`${apiUrl}/api/admin/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      firstName: 'QA', lastName: 'Usuario Integral', email: userEmail, phone: '70000001', password,
      roles: ['ESTUDIANTE'], active: true, careerId: catalog.career_id, registration: `QA-USR-${suffix}`,
    }),
  }), 201, 'Alta de estudiante')
  targetUserId = (await created.json()).userId

  const updated = await expect(await fetch(`${apiUrl}/api/admin/users/${targetUserId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      firstName: 'QA', lastName: 'Usuario Integral Editado', email: userEmail, phone: '70000002', password: '', active: true,
      roles: ['ESTUDIANTE', 'TUTOR', 'REVISOR'], careerId: catalog.career_id, registration: `QA-USR-${suffix}`, teacherCode: `QA-DOC-${suffix}`, specialty: 'Gestión académica',
    }),
  }), 200, 'Edición y roles múltiples')
  assert.match((await updated.json()).message, /actualizado/i)

  const reloaded = await expect(await fetch(`${apiUrl}/api/admin/users`, { headers: { Cookie: cookie } }), 200, 'Verificación de usuario editado')
  const target = (await reloaded.json()).users.find((user) => user.id === targetUserId)
  assert.deepEqual(target.roles, ['ESTUDIANTE', 'TUTOR', 'REVISOR'], 'No se conservaron los roles múltiples')
  assert.ok(target.studentId && target.teacherId && target.teacherCode === `QA-DOC-${suffix}`, 'No se crearon ambos perfiles académicos')

  const form = new FormData()
  form.append('studentId', target.studentId)
  form.append('managementId', catalog.management_id)
  form.append('modalityId', catalog.modality_id)
  form.append('title', 'Proyecto administrativo temporal para QA integral')
  form.append('description', 'Proyecto temporal creado por Administración para comprobar el alta general de proyectos.')
  form.append('generalObjective', 'Comprobar el registro administrativo de un proyecto completo y trazable.')
  form.append('objectives', JSON.stringify(['Verificar la creación inicial de los datos académicos.']))
  form.append('profile', new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'perfil-qa.docx')
  const projectResponse = await expect(await fetch(`${apiUrl}/api/admin/projects`, { method: 'POST', headers: { Cookie: cookie }, body: form }), 201, 'Alta administrativa de proyecto')
  projectId = (await projectResponse.json()).project.id
  const stored = await pool.query(
    `SELECT vd.ruta_archivo
     FROM titulacion.versiones_documento vd
     JOIN titulacion.documentos d ON d.id = vd.documento_id
     WHERE d.proyecto_id = $1`,
    [projectId],
  )
  uploadPath = stored.rows[0]?.ruta_archivo ?? ''

  await expect(await fetch(`${apiUrl}/api/admin/users/${targetUserId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...target, password: '', active: false }),
  }), 409, 'Protección de estudiante con proyecto activo')

  await expect(await fetch(`${apiUrl}/api/admin/projects/${projectId}/cancel`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'QA de eliminación lógica', detail: 'Prueba temporal de anulación para liberar al estudiante de control.' }),
  }), 200, 'Anulación lógica de proyecto')

  const deactivated = await expect(await fetch(`${apiUrl}/api/admin/users/${targetUserId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...target, password: '', active: false }),
  }), 200, 'Desactivación lógica de usuario')
  assert.match((await deactivated.json()).message, /desactivado/i)
  const afterDeactivationDirectory = await expect(await fetch(`${apiUrl}/api/admin/users`, { headers: { Cookie: cookie } }), 200, 'Consulta de usuario inactivo')
  const inactiveTarget = (await afterDeactivationDirectory.json()).users.find((user) => user.id === targetUserId)
  assert.deepEqual(inactiveTarget.roles, ['ESTUDIANTE', 'TUTOR', 'REVISOR'], 'Los roles deben conservarse para poder reactivar al usuario')
  const reactivated = await expect(await fetch(`${apiUrl}/api/admin/users/${targetUserId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...inactiveTarget, password: '', active: true }),
  }), 200, 'Reactivación de usuario')
  assert.match((await reactivated.json()).message, /actualizado/i)
  console.log('QA de Administración general aprobado: usuarios, roles múltiples, perfiles, proyecto y bajas lógicas verificados.')
} finally {
  if (cookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
