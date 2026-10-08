import 'dotenv/config'

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const targetUrl = process.env.NEON_DATABASE_URL?.trim()
const pgDumpPath = process.env.PG_DUMP_PATH ?? 'pg_dump'
const pgRestorePath = process.env.PG_RESTORE_PATH ?? 'pg_restore'

if (!targetUrl?.startsWith('postgres')) {
  throw new Error('Define NEON_DATABASE_URL con la cadena de conexión de la base destino de Neon.')
}

for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Falta ${key} para leer la base de datos local.`)
}

function run(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: environment, stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} finalizó con código ${code}.`))
    })
  })
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'seguimiento-titulacion-neon-'))
const dumpPath = path.join(temporaryDirectory, 'seguimiento_titulacion.dump')

try {
  await run(pgDumpPath, [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    `--host=${process.env.DB_HOST}`,
    `--port=${process.env.DB_PORT}`,
    `--username=${process.env.DB_USER}`,
    `--dbname=${process.env.DB_NAME}`,
    `--file=${dumpPath}`,
  ], { ...process.env, PGPASSWORD: process.env.DB_PASSWORD })

  await run(pgRestorePath, [
    '--exit-on-error',
    '--no-owner',
    '--no-privileges',
    `--dbname=${targetUrl}`,
    dumpPath,
  ], process.env)

  console.log('Migración a Neon completada correctamente.')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
