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

async function expectStatus(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
}

try {
  const health = await fetch(`${apiUrl}/api/health`)
  await expectStatus(health, 200, 'Salud de API')
  assert.equal((await health.json()).status, 'ok', 'La API no confirmó una conexión saludable')

  const rejectedLogin = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'qa-inexistente@univalle.edu', password: 'incorrecta', remember: false }),
  })
  await expectStatus(rejectedLogin, 401, 'Rechazo de credenciales inválidas')

  const rejectedSession = await fetch(`${apiUrl}/api/student/bootstrap`)
  await expectStatus(rejectedSession, 401, 'Protección de sesión')

  const rejectedOverview = await fetch(`${apiUrl}/api/student/overview`)
  await expectStatus(rejectedOverview, 401, 'Protección de Inicio')

  const rejectedDocuments = await fetch(`${apiUrl}/api/documents`)
  await expectStatus(rejectedDocuments, 401, 'Protección de documentos')

  const database = await pool.query(
    `SELECT m.codigo
     FROM titulacion.modalidades_titulacion m
     JOIN titulacion.carreras c ON c.id = m.carrera_id
     WHERE c.codigo = 'SIS' AND m.activa
     ORDER BY m.codigo`,
  )
  assert.deepEqual(
    database.rows.map((row) => row.codigo),
    ['PROYECTO_GRADO', 'TESIS', 'TRABAJO_DIRIGIDO'],
    'El catálogo de modalidades de Sistemas no coincide con el flujo definido',
  )

  const tables = await pool.query(
    `SELECT count(*)::int AS total
     FROM information_schema.tables
     WHERE table_schema = 'titulacion'
       AND table_name IN ('usuarios', 'sesiones_usuario', 'proyectos', 'objetivos_especificos', 'documentos', 'versiones_documento')`,
  )
  assert.equal(tables.rows[0].total, 6, 'Faltan tablas requeridas para el flujo de Formulario 1')

  const passwordProbe = await bcrypt.hash('qa-local-probe', 4)
  assert.equal(await bcrypt.compare('qa-local-probe', passwordProbe), true, 'La verificación bcrypt no funciona')
  assert.equal(await bcrypt.compare('valor-distinto', passwordProbe), false, 'bcrypt aceptó una contraseña incorrecta')

  console.log('QA aprobado: base de datos, API, controles de acceso y catálogo verificados.')
} finally {
  await pool.end()
}
