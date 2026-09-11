import 'dotenv/config'

import assert from 'node:assert/strict'
import pg from 'pg'

const { Pool } = pg
const targetUrl = process.env.NEON_DATABASE_URL?.trim()
if (!targetUrl?.startsWith('postgres')) throw new Error('Define NEON_DATABASE_URL para validar la migración.')

const local = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: '-c search_path=titulacion,public',
})
const neon = new Pool({ connectionString: targetUrl, options: '-c search_path=titulacion,public' })
const tables = ['usuarios', 'estudiantes', 'docentes', 'proyectos', 'documentos', 'versiones_documento', 'asignaciones_proyecto', 'rondas_revision', 'revisiones', 'notificaciones']

try {
  const compared = {}
  for (const table of tables) {
    const [source, target] = await Promise.all([
      local.query(`SELECT count(*)::int AS total FROM titulacion.${table}`),
      neon.query(`SELECT count(*)::int AS total FROM titulacion.${table}`),
    ])
    compared[table] = target.rows[0].total
    assert.equal(target.rows[0].total, source.rows[0].total, `El conteo de ${table} no coincide entre local y Neon`)
  }
  const loadedData = await neon.query(`
    SELECT
      (SELECT count(*)::int FROM titulacion.proyectos WHERE codigo_seguimiento LIKE 'CARGA-2026-%') AS carga_projects,
      (SELECT count(*)::int FROM titulacion.usuario_roles ur JOIN titulacion.usuarios u ON u.id = ur.usuario_id JOIN titulacion.roles r ON r.id = ur.rol_id WHERE lower(u.correo) = 'docente.multirol.carga@univalle.edu' AND r.codigo IN ('TUTOR', 'REVISOR') AND ur.activo) AS multi_role_count
  `)
  assert.equal(loadedData.rows[0].carga_projects, 9, 'No se encontraron los nueve proyectos de carga en Neon')
  assert.equal(loadedData.rows[0].multi_role_count, 2, 'La cuenta multirol no conserva sus roles en Neon')
  console.log(JSON.stringify({ verified: true, tables: compared, cargaProjects: 9, multiRoleRoles: 2 }))
} finally {
  await Promise.all([local.end(), neon.end()])
}
