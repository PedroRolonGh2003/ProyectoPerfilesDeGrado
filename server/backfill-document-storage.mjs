import 'dotenv/config'

import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: '-c search_path=titulacion,public' })

function localPath(relativePath, projectId) {
  const prefix = `uploads/proyectos/${projectId}/`
  if (typeof relativePath !== 'string' || !relativePath.startsWith(prefix)) return null
  const root = path.resolve(process.cwd(), 'uploads')
  const absolute = path.resolve(process.cwd(), ...relativePath.split('/'))
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null
}

let copied = 0
let missing = 0
try {
  const versions = await pool.query(
    `SELECT vd.id, vd.ruta_archivo, d.proyecto_id
     FROM titulacion.versiones_documento vd
     JOIN titulacion.documentos d ON d.id = vd.documento_id
     WHERE vd.contenido_archivo IS NULL
     ORDER BY vd.subida_en`,
  )
  for (const version of versions.rows) {
    const source = localPath(version.ruta_archivo, version.proyecto_id)
    if (!source) {
      missing += 1
      continue
    }
    try {
      await access(source)
      const content = await readFile(source)
      await pool.query(
        `UPDATE titulacion.versiones_documento
         SET contenido_archivo = $2
         WHERE id = $1 AND contenido_archivo IS NULL`,
        [version.id, content],
      )
      copied += 1
    } catch {
      missing += 1
    }
  }
  console.log(`Documentos copiados a Neon: ${copied}. Archivos locales no encontrados: ${missing}.`)
} finally {
  await pool.end()
}
