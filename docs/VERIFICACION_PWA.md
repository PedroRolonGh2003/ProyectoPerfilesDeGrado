# Corrección PWA: verificación y operación

## Causas encontradas

- Producción respondía `configured: false`: faltaban las claves VAPID y no existían suscripciones registradas.
- El frontend sustituía push por avisos locales dependientes del dashboard; podía indicar activación sin suscripción en el backend.
- El envío tras `response.finish` no tenía protección de ejecución serverless. TTL de 60 segundos; trabajos `PROCESANDO` interrumpidos no se recuperaban.
- El Service Worker omitía la notificación del sistema si encontraba una ventana visible, incompatible con `userVisibleOnly` en Safari.
- «Recordar» estaba desmarcado, las sesiones vencían sin renovarse y un fallo de red inicial mostraba Login.
- El CSS móvil ocultaba todo el pie del lateral, incluido Logout. Salir tampoco desactivaba la suscripción de ese dispositivo.
- El historial recuperaba solo las últimas 20 notificaciones y el cambio de rol podía reiniciar el destino del estudiante.

## Correcciones y archivos

- `server/index.js`, `server/push-delivery.mjs`: cookies persistentes renovables, autorización, registro de dispositivos, salida atómica, envío protegido con `waitUntil`, TTL, reintentos y prueba autenticada.
- `database/20261023_pwa_sessions.sql`: campos de sesión y trigger transaccional de la cola. La inicialización aplica la migración idempotente.
- `public/sw.js`, `src/pwa.ts`, `src/main.tsx`: registro único, estado local de la cuenta en IndexedDB, recepción/clic, descarte tras logout y caché exclusiva del shell público.
- `src/PwaControls.tsx`: permiso explícito, vinculación real al backend, reparación de suscripción existente, instrucciones iOS y botón «Enviar prueba».
- `src/App.tsx`, `src/api.ts`: errores HTTP diferenciados de fallos de conexión, sincronización, historial completo y navegación con cambio de rol.
- `src/PortalSidebar.tsx`, `src/Modal.tsx`, `src/styles.css`, `index.html`: lateral móvil con foco contenido, Escape, fondo inactivo, scroll propio, `100dvh` y áreas seguras.
- `.env.example`, `README.md`, `package.json` y lockfile: configuración, dependencia de Vercel y comandos de comprobación.
- `server/qa-pwa*.mjs`: pruebas de infraestructura, API, cola y Service Worker.

## Pruebas automáticas

- Cookie persistente y renovación; opción de sesión corta; revocación de acceso.
- Registro idempotente, dos dispositivos, transferencia entre cuentas y logout sin desactivar otro dispositivo/propietario.
- Rechazo de endpoints ajenos a proveedores push y acceso a notificaciones de otra cuenta.
- Historial con más de 20 avisos, paginación sin repetidos y conservación de lectura.
- Cola con proveedor simulado: TTL, dos workers concurrentes, 503 con reintento, recuperación de trabajo interrumpido y baja 410.
- Service Worker simulado: notificación visible, descarte por logout/cuenta incorrecta, clic con app abierta/cerrada y exclusión de `/api` de la caché.

Estas pruebas no demuestran recepción en Android/iOS. «ENVIADO» significa aceptación por el proveedor.

## Prueba real en un teléfono

1. Actualizar la PWA, iniciar sesión con «Recordar mi sesión» y abrir **Avisos**. En iOS 16.4+, instalar desde Safari y abrir desde el icono de inicio.
2. Pulsar **Activar avisos** y conceder el permiso del sistema. Comprobar que la interfaz permite **Enviar prueba**.
3. Pulsar **Enviar prueba**: debe crearse un aviso interno y una entrega al dispositivo. Comprobar la notificación del sistema y tocarla para abrir el dashboard del rol correspondiente.
4. Para la prueba con app cerrada/bloqueada, generar una nueva notificación desde otro dispositivo mediante una acción real del proyecto. No basta con pulsar «Enviar prueba» y cerrar después: podría llegar antes de cerrar.
5. Repetir en segundo plano, con pantalla bloqueada y con el teléfono apagado al generarse el aviso. Encenderlo y recuperar conexión. Comprobar tanto el push como el historial; el proveedor/SO puede limitar la entrega de mensajes antiguos.
6. Cerrar/reabrir la PWA, bloquear/desbloquear y reiniciar. Debe conservarse la sesión válida. Desconectar Internet y recuperar conexión: no debe sustituirse un error de red por Login.
7. Abrir **Menú**; desplazar opciones y comprobar **Cerrar sesión** fijo abajo. Salir y generar otra notificación: ese teléfono no debe mostrarla, pero otro dispositivo suscrito de la misma cuenta sí.
8. Entrar con una cuenta distinta y comprobar que no recibe avisos privados de la anterior. Probar también una cuenta multirrol y los destinos de documentos, invitaciones y defensas.

Registrar dispositivo, SO, navegador, ID del aviso, hora de envío y recepción. Nunca incluir cookies, endpoints ni claves en capturas compartidas.

## Producción

Variables requeridas: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. No llevan prefijo `VITE_`. Conservar la misma pareja VAPID entre despliegues. El código y las variables nuevas requieren un despliegue de producción.

El cron de revisiones existente procesa también la cola diariamente. Para reintentos frecuentes sin actividad, conectar un programador a `/api/cron/push-deliveries` o usar un plan con cron más frecuente. No se cambió el plan ni se contrató un servicio.

Referencias: [Vercel waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [límites de cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Web Push en iOS](https://webkit.org/blog/13878/).
