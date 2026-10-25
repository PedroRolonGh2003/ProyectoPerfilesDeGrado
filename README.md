# ProyectoPerfilesDeGrado

Aplicación para gestionar el seguimiento de proyectos de titulación: registro de perfil, revisiones, documentos, formularios, aprobaciones y reportes.

## Estado actual

La primera entrega incluye inicio de sesión institucional real, el Formulario 1 y el portal de seguimiento para estudiantes, junto con un portal de Tutor. La interfaz usa tonos guindo Univalle y la API registra sesiones seguras en PostgreSQL. El tutor puede ver las invitaciones de tutoría, aceptarlas o declinarlas con motivo, consultar sus proyectos y documentos autorizados, y revisar las notificaciones internas.

## Tecnologías

- React + TypeScript
- Vite
- Node.js + Express
- PostgreSQL (base existente: `seguimiento_titulacion`)

## Ejecutar en desarrollo

```bash
npm install
npm run dev
```

El comando inicia la aplicación web en `http://localhost:5173` y la API en `http://127.0.0.1:3001`.

## Configuración local

La conexión se toma de `.env`, que está ignorado por Git. Usa `.env.example` como referencia para otra instalación. No subas contraseñas ni archivos adjuntos: los perfiles se guardan localmente en `uploads/`, también ignorado por Git.

## Registro y confirmación de cuentas

La pantalla inicial permite crear cuentas institucionales. El dominio determina el tipo de cuenta:

- `@est.univalle.edu`: crea un perfil de estudiante; tras confirmar el correo puede iniciar sesión.
- `@univalle.edu`: crea una cuenta docente sin roles; tras confirmar el correo, Administración debe asignarle Tutor y/o Revisor desde el directorio de usuarios.

Las cuentas nuevas permanecen inactivas hasta que se consume un enlace de un solo uso enviado por correo. Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`; en producción también define `APP_BASE_URL` si no deseas usar la URL de Vercel detectada automáticamente.

## Recuperación de contraseña

En el inicio de sesión, **¿Olvidaste tu contraseña?** envía un enlace de un solo uso al correo institucional de una cuenta activa. El enlace abre la vista para definir una nueva contraseña, vence en una hora por defecto (`PASSWORD_RESET_HOURS`) y, al usarse, invalida las sesiones activas de esa cuenta.

## Base de datos en Neon

La aplicacion admite una conexion administrada mediante `DATABASE_URL`. Cuando esta variable esta definida, tiene prioridad sobre las variables locales `DB_*`; la cadena debe incluir `sslmode=require`.

Para migrar una base local hacia una base de Neon vacia, define temporalmente `NEON_DATABASE_URL` con la cadena de destino y ejecuta:

```bash
npm run db:migrate:neon
```

En Windows, si PostgreSQL no esta en el `PATH`, define tambien `PG_DUMP_PATH` y `PG_RESTORE_PATH` con las rutas de los ejecutables. La migracion crea un respaldo temporal, lo restaura sin propietarios ni privilegios locales y elimina el respaldo al finalizar.

## Actualizaciones de base de datos

Las migraciones aplicadas se conservan en `database/`.

- `20260908_catalogo_modalidad_y_funciones.sql`: incorpora la modalidad Trabajo dirigido para Sistemas y corrige funciones para usar el esquema `titulacion` de forma explícita.
- `20260908_solicitudes_tutoria_y_cola_correos.sql`: agrega trazabilidad de respuesta a solicitudes de tutoría, índices de notificación y una cola persistente para los correos futuros. La aplicación no envía correos mientras no se configure un proveedor SMTP; solo registra los eventos pendientes de entrega.
- `20261021_recordatorios_revision_sin_fecha_limite.sql`: elimina los plazos de las rondas abiertas. Desde el segundo día de una revisión pendiente, se crea un recordatorio diario para el tutor o revisor correspondiente.
- `20261022_programacion_defensas.sql`: registra una convocatoria por defensa privada o pública, con fecha, hora, lugar y trazabilidad de la persona que la programó.

## Recordatorios en producción

En Vercel, `vercel.json` ejecuta el recordatorio de revisiones una vez al día a las 08:00 (hora de Bolivia). Define `CRON_SECRET` como una variable de entorno aleatoria de al menos 16 caracteres para proteger la tarea programada.

## PWA y notificaciones push

La plataforma es instalable como PWA en navegadores compatibles. El Service Worker solo conserva recursos públicos de la interfaz; no almacena respuestas de `/api`, sesiones, documentos ni datos académicos privados.

Para habilitar las notificaciones push, genera una pareja VAPID una sola vez y configura los valores en el entorno local y en Vercel:

```bash
npm exec web-push generate-vapid-keys
```

Configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (por ejemplo, la URL HTTPS pública de la plataforma). Nunca publiques la clave privada ni regeneres las claves en cada despliegue. Al iniciar sesión por primera vez en un móvil, un diálogo solicita permiso para las notificaciones; el usuario debe pulsar **Permitir notificaciones**. Si elige **Ahora no**, se le vuelve a preguntar al iniciar otra sesión. Una vez activadas, la suscripción se restablece automáticamente al volver a entrar en la misma cuenta. No hace falta mantener abierta la aplicación.

Cada notificación interna encola sus entregas dentro de la misma transacción de PostgreSQL. El servidor las envía mediante Web Push con su título y un extracto del mensaje para cualquier rol, incluso con la aplicación cerrada. El TTL es de hasta siete días; no necesita una pestaña ni una sesión abierta. `waitUntil` mantiene vivo el envío después de la respuesta en Vercel. Las entregas usan un registro único por notificación/dispositivo y una etiqueta común en el proveedor y el navegador. Los reintentos pueden repetir un envío aceptado si el proceso se interrumpió antes de guardarlo; no se promete entrega exactamente una vez.

Los errores temporales se reintentan con espera creciente; 404/410 desactivan suscripciones inválidas. El servidor local revisa pendientes cada minuto. En Vercel, la tarea diaria existente también los procesa; `GET /api/cron/push-deliveries` admite un programador externo más frecuente con `Authorization: Bearer CRON_SECRET`. El plan Hobby solo admite cron diario: sin tráfico, un reintento pendiente puede esperar hasta la siguiente ejecución. El primer intento sí se lanza con la operación que creó el aviso. La aceptación por el proveedor **no confirma recepción en el teléfono**.

**Sesiones:** «Recordar mi sesión» está seleccionado inicialmente. La cookie persistente es `HttpOnly`, `SameSite=Lax` y `Secure` en producción; en la base solo se guarda el hash del token. La ventana de inactividad es de 90 días por defecto (`REMEMBER_SESSION_DAYS`), renovable al usar la aplicación. Desmarcar la opción conserva la sesión corta de `SESSION_HOURS`. Cerrar/reiniciar el dispositivo no elimina la cookie; revocación, cambio de contraseña, vencimiento por inactividad o borrar datos del navegador requieren autenticarse otra vez. Los errores de red conservan la sesión y muestran «Reintentar conexión».

**Móvil:** la barra inferior se conserva. El botón de menú junto al logo abre el lateral con «Cerrar sesión» fijo abajo, fuera del área desplazable y respetando el área segura. Salir revoca la sesión y cancela las entregas al dispositivo actual, sin afectar los otros dispositivos. El Service Worker descarta mensajes en tránsito de la cuenta anterior y cierra los avisos mostrados. Si no hay conexión para confirmar la revocación, la interfaz informa del fallo y permite volver a intentarlo.

**Historial:** la campanita ofrece «Ver historial completo», con paginación y estado de lectura. Abrir la aplicación o recuperar conexión sincroniza los avisos. Enviar un push no los marca como leídos. Al tocarlo, se conserva su ID en la URL hasta que se puede abrir con la sesión y el rol autorizados.

En Android, la instalación y los avisos funcionan en navegadores compatibles con Web Push. En iPhone/iPad, los avisos requieren iOS/iPadOS 16.4 o posterior y que la PWA se haya agregado a la pantalla de inicio desde Safari; el permiso se solicita desde el diálogo de bienvenida.

Pruebas específicas: `npm run qa:pwa:flow` prueba API/base de datos con cuentas temporales y un proveedor simulado; `npm run qa:pwa:worker` prueba los manejadores del Service Worker. Ninguna equivale a recepción física. Consulta [la verificación móvil](docs/VERIFICACION_PWA.md) para los escenarios de dispositivo y producción.

## Verificar compilación

```bash
npm run build
```

## QA local

Con `npm run dev` activo, ejecuta:

```bash
npm run qa
```

La prueba valida la conexión PostgreSQL, las tablas requeridas, el catálogo de modalidades, la API y los rechazos de autenticación no autorizada. La prueba de registro completo requiere credenciales válidas de un estudiante sin proyecto activo.

Para probar el caso positivo de punta a punta sin guardar datos de prueba, define temporalmente `QA_STUDENT_EMAIL` y `QA_STUDENT_PASSWORD` en la terminal y ejecuta `npm run qa:flow`. El script elimina solo el proyecto, adjunto y relaciones que creó al finalizar; la cuenta de prueba permanece disponible.

El flujo de Tutor se prueba de forma aislada y limpia sus propias cuentas, proyecto, documentos, sesiones y notificaciones al terminar:

```bash
npm run qa:tutor
```

La administración general se valida con cuentas y proyectos temporales que se eliminan al finalizar. Comprueba usuarios, roles múltiples, perfiles de estudiante/docente, creación de proyecto y bajas lógicas:

```bash
npm run qa:admin-users
```

La programación de defensas comprueba el bloqueo antes de cada fase, el guardado de fecha, hora y lugar, la información visible para estudiante, tutor y revisores, y las notificaciones con enlaces al portal correspondiente:

```bash
npm run qa:defenses
```
