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
