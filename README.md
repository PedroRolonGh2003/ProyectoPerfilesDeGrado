# ProyectoPerfilesDeGrado

Aplicación web para administrar el proceso de titulación de Univalle desde el registro del perfil hasta el cierre del proyecto. Incluye los portales de Estudiante, Tutor, Revisor y Administración.

## Funcionalidades

- Registro y confirmación por correo institucional, inicio de sesión, recuperación de contraseña y sesiones persistentes.
- Gestión de roles: un estudiante puede ser también Administrador; Tutor, Revisor y Administrador se pueden combinar en perfiles docentes.
- Registro y seguimiento de perfiles, proyectos, objetivos, tutorías, revisores y rondas de revisión.
- Carga y versionado de documentos Word, observaciones, correcciones y dictámenes de perfil, defensa privada y defensa pública.
- Programación administrativa de defensas con fecha, hora y lugar; cierre del proyecto después de las aprobaciones requeridas.
- Notificaciones internas, correo encolado y Web Push para dispositivos compatibles.
- PWA instalable con navegación móvil, historial de avisos y protección de sesiones por dispositivo.
- Auditoría de acciones, historial de estados, recordatorios de revisión y controles de acceso por rol.

## Arquitectura

- **Frontend:** React, TypeScript y Vite en `src/`.
- **API:** Express en `server/index.js`; Vercel la expone mediante `api/[...path].js`.
- **Base de datos:** PostgreSQL con el esquema `titulacion`.
- **Documentos:** se almacenan en PostgreSQL cuando se usa `DATABASE_URL`; la copia local `uploads/` sirve para desarrollo y migración.
- **PWA:** `public/sw.js`, `public/manifest.webmanifest` y los recursos gráficos de `public/`.
- **Migraciones y mantenimiento:** scripts SQL en `database/` y utilidades en `server/`.

## Requisitos

- Node.js 20 o posterior.
- PostgreSQL con la base y el esquema `titulacion` disponibles.
- SMTP configurado para enviar confirmaciones y recuperaciones de contraseña.
- Claves VAPID para habilitar Web Push.

## Instalación y desarrollo

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

La interfaz queda disponible en `http://localhost:5173` y la API en `http://127.0.0.1:3001`.

En PowerShell, completa `.env` con las credenciales locales antes de iniciar. El archivo `.env` está ignorado por Git y no debe publicarse.

## Variables de entorno

`.env.example` contiene todas las variables usadas por la aplicación y sus utilidades. Las principales son:

- `DATABASE_URL`: conexión de PostgreSQL administrado; tiene prioridad cuando existe.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: conexión local alternativa.
- `SESSION_HOURS`, `REMEMBER_SESSION_DAYS`, `EMAIL_CONFIRMATION_HOURS`, `PASSWORD_RESET_HOURS`: tiempos de sesión y tokens.
- `APP_BASE_URL`: URL pública usada en los enlaces por correo. En Vercel puede omitirse.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: envío de correo.
- `CRON_SECRET`: protege los endpoints programados.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Web Push.
- `NEON_DATABASE_URL`, `PG_DUMP_PATH`, `PG_RESTORE_PATH`: migración opcional a Neon.
- `API_URL`, `QA_STUDENT_EMAIL`, `QA_STUDENT_PASSWORD`: pruebas opcionales; no son necesarias para ejecutar la aplicación.

No incluyas secretos, cookies, endpoints Push ni contraseñas en documentación, commits o capturas.

La API y los QA que interactúan con ella usan la misma prioridad de conexión: `DATABASE_URL` cuando está definida y, en caso contrario, `DB_*`. Esto evita validar una base distinta de la que atiende la aplicación.

## Base de datos y migraciones

Las migraciones conservadas en `database/` son acumulativas y documentan cambios aplicados al esquema: cuentas, recuperación de contraseña, documentos, matrices de revisión, defensas, recordatorios, sesiones y Web Push. No se deben ejecutar sobre producción sin revisar previamente el estado del esquema y realizar un respaldo.

Para trasladar una base local a una base Neon vacía:

```bash
npm run db:migrate:neon
```

Define previamente `NEON_DATABASE_URL`. En Windows, si PostgreSQL no está en `PATH`, define también `PG_DUMP_PATH` y `PG_RESTORE_PATH`. Comprueba una migración terminada con:

```bash
npm run qa:neon-migration
```

Para copiar documentos locales que aún no estén almacenados en PostgreSQL:

```bash
npm run storage:backfill
```

## PWA y Web Push

Genera las claves VAPID una sola vez:

```bash
npm exec web-push generate-vapid-keys
```

Configura sus valores en el entorno local y en Vercel. En teléfonos, el usuario recibe la solicitud de permiso al iniciar sesión por primera vez. En iPhone o iPad se requiere iOS/iPadOS 16.4 o posterior, instalar la PWA desde Safari y abrirla desde el icono instalado.

El Service Worker solo almacena el shell público. No almacena respuestas de API, sesiones, documentos ni datos académicos. La cola de entregas se procesa después de crear una notificación y se reintenta ante fallos temporales. La aceptación del proveedor no garantiza la recepción física en el dispositivo.

Consulta [la guía de verificación PWA](docs/VERIFICACION_PWA.md) para pruebas de dispositivos, sesiones y entregas Push.

## Comandos

```bash
npm run dev                 # API y frontend en desarrollo
npm run dev:api             # Solo API con recarga
npm run build               # Verificación TypeScript y build de Vite
npm run preview             # Vista previa del build
npm start                   # API en modo producción
npm run qa                  # Salud de API, base, acceso y catálogo
npm run qa:flow             # Flujo de estudiante con credenciales QA explícitas
npm run qa:admin            # Panel de administración
npm run qa:admin-operations # Operaciones administrativas
npm run qa:admin-users      # Directorio, roles y altas administrativas
npm run qa:tutor            # Flujo de tutoría
npm run qa:reviewer         # Flujo de revisión
npm run qa:defenses         # Programación de defensas
npm run qa:pwa              # Configuración PWA
npm run qa:pwa:flow         # API, cola y Push con proveedor simulado
npm run qa:pwa:worker       # Manejadores del Service Worker
npm run db:migrate:neon      # Copia una base local a Neon (requiere NEON_DATABASE_URL)
npm run qa:neon-migration    # Compara la migración local con Neon
npm run storage:backfill     # Copia documentos locales pendientes a PostgreSQL
npm run seed:demo           # Datos de demostración
npm run seed:multirole-demo # Datos de demostración multirol
npm run qa:multirole-demo   # Verificación de esa carga demo
```

Los QA que consultan la API local requieren que `npm run dev:api` esté activo. `qa:pwa:flow` inicia una API aislada; `qa:pwa:worker` no necesita API. Los scripts que crean cuentas, proyectos y documentos temporales los eliminan al terminar; `qa:flow` usa la cuenta indicada por las variables QA y mantiene esa cuenta.

## Despliegue

Vercel usa `vercel.json` para enrutar `/api`, publicar la SPA y ejecutar el recordatorio de revisiones diario. Configura las variables de entorno de producción en el proyecto de Vercel, especialmente `DATABASE_URL`, `CRON_SECRET`, SMTP y VAPID. El cron se autentica mediante `Authorization: Bearer CRON_SECRET`.

Antes de desplegar, ejecuta al menos:

```bash
npm run build
npm run qa
```

## Estructura principal

```text
api/        Adaptador serverless de Vercel
database/   Migraciones SQL acumulativas
docs/       Guías de operación y verificación
public/     Manifest, Service Worker y recursos PWA
server/     API, entregas Push, semillas, migración y QA
src/        Interfaz React
```
