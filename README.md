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

Para enviar los correos de confirmación de cuenta y recuperación de contraseña, configura en `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`. La API procesa automáticamente la cola de correos cada 30 segundos. Si SMTP no está configurado, los mensajes se conservan como pendientes y no se envían.

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
- `20260908_solicitudes_tutoria_y_cola_correos.sql`: agrega trazabilidad de respuesta a solicitudes de tutoría, índices de notificación y una cola persistente para los correos futuros. La entrega permanece en cola mientras no se configure un proveedor de correo.
- `20260918_eventos_seguridad.sql`: registra intentos de inicio de sesión fallidos sin almacenar contraseñas ni identificadores en texto plano.
- `20260918_recuperacion_contrasena.sql`: agrega tokens de recuperación de un solo uso, con hash, vencimiento y trazabilidad.
- `20260922_notificaciones_proyecto.sql`: incorpora una clave única por evento y destinatario para impedir notificaciones duplicadas de proyectos, revisiones y tutorías.

## Seguridad

- Las contraseñas creadas o modificadas deben tener entre 8 y 128 caracteres, incluyendo mayúscula, minúscula, número y carácter especial. Se guardan con bcrypt; `BCRYPT_ROUNDS=12` es el valor recomendado.
- Las sesiones expiran entre 1 y 24 horas, y las sesiones recordadas entre 1 y 30 días. Las cookies de sesión son `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Los documentos solo aceptan Word `.doc` o `.docx` de hasta 10 MB; se validan extensión, tipo declarado y firma binaria en el servidor.
- La recuperación de contraseña no revela si una cuenta existe. Sus enlaces expiran entre 10 y 60 minutos, son de un solo uso y cierran todas las sesiones al restablecer la clave. Configura `APP_URL` con la URL pública del frontend.
- Si se configura `EMAIL_DELIVERY_WEBHOOK_URL`, la API envía los correos de recuperación y las notificaciones importantes de proyecto a ese servicio mediante `POST` con `{ to, subject, text }`; sin ese valor, cada correo se conserva de forma segura en `titulacion.cola_correos_notificacion` para que el proceso de entrega configurado lo envíe.

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
