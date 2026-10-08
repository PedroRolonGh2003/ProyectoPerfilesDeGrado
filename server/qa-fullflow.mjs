import 'dotenv/config'

import assert from 'node:assert/strict'
import { access, rm } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const email = process.env.QA_STUDENT_EMAIL
const password = process.env.QA_STUDENT_PASSWORD
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

if (!email || !password) throw new Error('Define QA_STUDENT_EMAIL y QA_STUDENT_PASSWORD solo en tu entorno local.')

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

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

function minimalDocx() {
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Perfil de prueba QA</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'],
  ]
  const localRecords = []
  const centralRecords = []
  let offset = 0

  for (const [filename, text] of entries) {
    const name = Buffer.from(filename)
    const content = Buffer.from(text)
    const checksum = crc32(content)
    const local = Buffer.concat([dword(0x04034b50), word(20), word(0), word(0), word(0), word(0), dword(checksum), dword(content.length), dword(content.length), word(name.length), word(0), name, content])
    localRecords.push(local)
    centralRecords.push(Buffer.concat([dword(0x02014b50), word(20), word(20), word(0), word(0), word(0), word(0), dword(checksum), dword(content.length), dword(content.length), word(name.length), word(0), word(0), word(0), word(0), dword(0), dword(offset), name]))
    offset += local.length
  }

  const central = Buffer.concat(centralRecords)
  return Buffer.concat([...localRecords, central, dword(0x06054b50), word(0), word(0), word(entries.length), word(entries.length), dword(central.length), dword(offset), word(0)])
}

async function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: se esperaba HTTP ${status} y se recibió ${response.status}`)
  return response
}

let sessionCookie = ''
let projectId = ''
let storedPath = ''

async function cleanup() {
  if (!projectId) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM titulacion.asignaciones_proyecto WHERE proyecto_id = $1', [projectId])
    await client.query('DELETE FROM titulacion.historial_estados WHERE proyecto_id = $1', [projectId])
    await client.query('DELETE FROM titulacion.documentos WHERE proyecto_id = $1', [projectId])
    await client.query('DELETE FROM titulacion.objetivos_especificos WHERE proyecto_id = $1', [projectId])
    await client.query('DELETE FROM titulacion.proyecto_estudiantes WHERE proyecto_id = $1', [projectId])
    await client.query('DELETE FROM titulacion.proyectos WHERE id = $1', [projectId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  const uploadRoot = path.resolve(process.cwd(), 'uploads', 'proyectos')
  const absolutePath = path.resolve(process.cwd(), storedPath)
  if (storedPath.startsWith(`uploads/proyectos/${projectId}/`) && absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
    await rm(path.dirname(absolutePath), { recursive: true, force: true })
  }
}

try {
  const login = await expect(await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password, remember: false }),
  }), 200, 'Inicio de sesión de estudiante')
  sessionCookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  assert.ok(sessionCookie.startsWith('stit_session='), 'La API no creó una cookie de sesión')

  const bootstrap = await expect(await fetch(`${apiUrl}/api/student/bootstrap`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Carga del portal de estudiante')
  const data = await bootstrap.json()
  assert.equal(data.user.email, email, 'La sesión no corresponde al estudiante de QA')
  assert.equal(data.project, null, 'La cuenta de QA debe comenzar sin proyecto')
  assert.ok(data.modalities.some((item) => item.codigo === 'TRABAJO_DIRIGIDO'), 'Trabajo dirigido no llegó al formulario')
  assert.ok(data.tutors.length > 0, 'No hay tutor disponible para la prueba')

  const form = new FormData()
  form.set('managementId', data.managements[0].id)
  form.set('modalityId', data.modalities.find((item) => item.codigo === 'TRABAJO_DIRIGIDO').id)
  form.set('tutorId', data.tutors[0].id)
  form.set('title', 'Proyecto de verificación integral QA')
  form.set('description', 'Registro temporal para comprobar el almacenamiento transaccional del Formulario 1.')
  form.set('generalObjective', 'Verificar el flujo completo de registro.')
  form.set('objectives', JSON.stringify(['Validar la integración entre interfaz y base de datos.', 'Comprobar el resguardo del documento Word adjunto.']))
  form.set('profile', new Blob([minimalDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'perfil-qa.docx')

  const registration = await expect(await fetch(`${apiUrl}/api/projects`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: form,
  }), 201, 'Registro transaccional del Formulario 1')
  const created = await registration.json()
  projectId = created.project.id
  assert.match(created.project.code, /^TIT-\d{4}-\d{6}$/, 'El código de seguimiento no fue generado')

  const overview = await expect(await fetch(`${apiUrl}/api/student/overview`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Carga de Inicio del estudiante')
  const overviewData = await overview.json()
  assert.equal(overviewData.project.code, created.project.code, 'Inicio no muestra el proyecto propio')
  assert.equal(overviewData.tutor.status, 'PROPUESTO', 'Inicio no distingue el tutor propuesto')
  assert.equal(overviewData.objectives.length, 2, 'Inicio no muestra los objetivos específicos')
  assert.equal(overviewData.profile.version, 1, 'Inicio no muestra el perfil adjunto')
  assert.ok(overviewData.history.length > 0, 'Inicio no muestra el historial del proyecto')

  const verification = await pool.query(
    `SELECT p.codigo_seguimiento, count(DISTINCT oe.id)::int AS objetivos,
            count(DISTINCT d.id)::int AS documentos, vd.ruta_archivo
     FROM titulacion.proyectos p
     LEFT JOIN titulacion.objetivos_especificos oe ON oe.proyecto_id = p.id
     LEFT JOIN titulacion.documentos d ON d.proyecto_id = p.id
     LEFT JOIN titulacion.versiones_documento vd ON vd.documento_id = d.id
     WHERE p.id = $1
     GROUP BY p.codigo_seguimiento, vd.ruta_archivo`,
    [projectId],
  )
  const stored = verification.rows[0]
  assert.equal(stored.objetivos, 2, 'No se guardaron todos los objetivos específicos')
  assert.equal(stored.documentos, 1, 'No se guardó el documento de perfil')
  assert.ok(stored.ruta_archivo, 'No se registró la ruta del documento')
  storedPath = stored.ruta_archivo
  await access(path.resolve(process.cwd(), storedPath))

  const documents = await expect(await fetch(`${apiUrl}/api/documents`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Listado privado de documentos')
  const documentList = await documents.json()
  assert.equal(documentList.documents.length, 1, 'El perfil no aparece en el listado de documentos')
  const profile = documentList.documents[0]
  assert.equal(profile.totalVersions, 1, 'El perfil debe iniciar con una sola versión')
  assert.equal(profile.canUploadVersion, false, 'No se debe permitir edición mientras el proyecto está registrado')

  const firstDownload = await expect(await fetch(`${apiUrl}/api/documents/${profile.id}/download`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Descarga del perfil propio')
  assert.ok((await firstDownload.arrayBuffer()).byteLength > 100, 'La descarga del perfil está vacía')

  const blockedVersion = new FormData()
  blockedVersion.set('document', new Blob([minimalDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'perfil-qa-bloqueado.docx')
  const blockedUpdate = await fetch(`${apiUrl}/api/documents/${profile.id}/versions`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: blockedVersion,
  })
  await expect(blockedUpdate, 403, 'Bloqueo de edición por estado')

  const student = await pool.query(
    `SELECT u.id AS usuario_id, ep.id AS estado_observado_id
     FROM titulacion.usuarios u
     CROSS JOIN titulacion.estados_proyecto ep
     WHERE u.correo = $1 AND ep.codigo = 'OBSERVADO'`,
    [email],
  )
  await pool.query(
    `INSERT INTO titulacion.historial_estados
      (proyecto_id, estado_nuevo_id, cambiado_por_usuario_id, motivo)
     VALUES ($1, $2, $3, 'Cambio temporal para validar la versión observada en QA.')`,
    [projectId, student.rows[0].estado_observado_id, student.rows[0].usuario_id],
  )

  const newVersion = new FormData()
  newVersion.set('document', new Blob([minimalDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'perfil-qa-v2.docx')
  newVersion.set('comment', 'Versión de QA posterior a observación.')
  const versionResponse = await expect(await fetch(`${apiUrl}/api/documents/${profile.id}/versions`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: newVersion,
  }), 201, 'Registro de nueva versión autorizada')
  const createdVersion = await versionResponse.json()
  assert.equal(createdVersion.version.number, 2, 'La nueva versión no recibió el número consecutivo')

  const updatedDocuments = await expect(await fetch(`${apiUrl}/api/documents`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Listado posterior a nueva versión')
  const updatedProfile = (await updatedDocuments.json()).documents[0]
  assert.equal(updatedProfile.totalVersions, 2, 'El historial no muestra ambas versiones')
  assert.equal(updatedProfile.latest.number, 2, 'La última versión no se actualizó')

  const secondDownload = await expect(await fetch(`${apiUrl}/api/documents/${profile.id}/download?version=${createdVersion.version.id}`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Descarga de una versión específica')
  assert.ok((await secondDownload.arrayBuffer()).byteLength > 100, 'La nueva versión descargada está vacía')

  const afterRegistration = await expect(await fetch(`${apiUrl}/api/student/bootstrap`, {
    headers: { Cookie: sessionCookie },
  }), 200, 'Consulta posterior al registro')
  assert.equal((await afterRegistration.json()).project.code, created.project.code, 'El proyecto registrado no aparece en el portal')

  console.log(`QA integral aprobado: autenticación, catálogo, Formulario 1, documentos, versiones y persistencia verificados (${created.project.code}).`)
} finally {
  if (sessionCookie) await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: sessionCookie } }).catch(() => undefined)
  await cleanup()
  await pool.end()
}
