# Bitácora de prueba integral — DEMO-2026-003

Fecha de ejecución: 27 de octubre de 2026.

Proyecto de prueba: **DEMO-2026-003 — Gestión de laboratorios de computación**. Se utilizaron exclusivamente cuentas y archivos de demostración existentes.

## Objetivo

Comprobar desde la interfaz publicada el ciclo de documentos, las revisiones de tutor y revisores, las correcciones del estudiante y la trazabilidad en Administración.

## Cuentas utilizadas

- Estudiante: Elena Vargas (`estudiante.demo.3@univalle.edu`)
- Tutora: Ana Quiroga (`tutor.demo.ana@univalle.edu`)
- Revisora 1: Sofía Ledezma (`revisor.demo.2@univalle.edu`)
- Revisor 2: Pablo Cabrera (`revisor.demo.3@univalle.edu`)
- Administración: Andrea Administración (`admin.demo@univalle.edu`)

## Recorrido y resultados comprobados

1. **Perfil V1**
   - El estudiante tenía el perfil V1 y una ronda activa.
   - Tutora, Revisora 1 y Revisor 2 pudieron abrir el mismo documento V1 y emitir su dictamen.
   - Se devolvió V1 con observaciones desde los tres roles.
   - Resultado: la ronda se cerró y el proyecto regresó a `Registro de propuesta · Observado`.

2. **Corrección V2**
   - El estudiante visualizó las tres observaciones pendientes.
   - La pantalla exigió una respuesta por observación junto con el archivo.
   - Se cargó V2 y se comprobó que cada respuesta quedó asociada a **V2**.
   - Se creó automáticamente la ronda 2 para la misma tutora y los mismos dos revisores.
   - Tutora y Revisor 2 aprobaron; Revisora 1 devolvió con una nueva observación.
   - Resultado: la ronda se cerró como observada, conservando V1 y V2.

3. **Corrección V3 y aprobación del perfil**
   - El estudiante respondió la observación pendiente de V2 y adjuntó V3.
   - Se comprobó el historial con tres versiones correlativas: V1, V2 y V3.
   - Tutora y ambos revisores aprobaron V3 sin observaciones.
   - Resultado: el sistema cerró la ronda 3, marcó las correcciones anteriores como validadas y habilitó el documento para defensa privada.

4. **Documento para defensa privada V1**
   - Después de la aprobación del perfil se creó automáticamente un documento independiente: `Documento para defensa privada - DEMO-2026-003`.
   - El estudiante cargó su V1.
   - Se verificó que el documento privado conserva su propio contador de versiones (V1) y que el perfil continúa con su propio historial (V1–V3).
   - Resultado: se abrió una ronda de revisión privada para tutor y ambos revisores; el estudiante ya no puede cargar otra versión mientras esa ronda permanece abierta.

5. **Administración**
   - El listado administrativo muestra el proyecto en `Documento privado`, con `3 pendientes` y el equipo correcto.
   - El detalle conserva enlaces descargables de Perfil V1, V2 y V3.
   - El detalle muestra la ronda privada pendiente y mantiene separados los datos del formulario del estudiante de las acciones administrativas.
   - El cierre del proyecto permanece deshabilitado, como corresponde antes de la aprobación de defensa pública.

6. **Aprobación del documento para defensa privada**
   - Tutora, Revisora 1 y Revisor 2 abrieron el documento privado V1 y aprobaron los cinco criterios del Formulario 3.
   - La última aprobación cerró la ronda y el proyecto pasó a `Documento público`.
   - El sistema creó automáticamente un tercer registro documental independiente: `Documento final para defensa pública - DEMO-2026-003`.

7. **Documento para defensa pública V1 y ratificación**
   - El estudiante cargó V1 del documento público; la interfaz registró el nombre generado `Documento_final_para_defensa_publica_DEMO_2026_003_v1.docx` y bloqueó nuevas cargas mientras la ronda estaba abierta.
   - Tutora y ambos revisores emitieron la ratificación **Sí** mediante el Formulario 4.
   - Resultado: la ronda pública quedó aprobada por los tres docentes y el proyecto pasó a `Aprobado institucionalmente`.

8. **Cierre administrativo**
   - Administración mostró el botón `Cerrar proyecto` solo después de las tres ratificaciones públicas.
   - Al cerrarlo, la fase cambió a `Cierre` y el estado a `Finalizado`; la pantalla confirmó que se completó la línea de progreso.

## Resultado general

La carga, versionado, respuestas a observaciones, reapertura de rondas, aprobaciones privada y pública, ratificación y cierre administrativo funcionaron correctamente en el ciclo completo ejecutado. Se comprobaron tres versiones consecutivas del perfil y una versión independiente en cada documento de defensa; no se verificó un límite máximo de cinco versiones por tipo documental.

## Hallazgos de interfaz y mensajes

1. Al aprobar la última revisión del perfil, el aviso del revisor dice: **“el perfil pasa a aprobación institucional”**, pero el proyecto queda correctamente en **Documento privado**. El mensaje no coincide con la transición real y puede confundir.
2. En el detalle administrativo, la ronda abierta del documento privado aparece como **“Ronda 1 · Perfil V1”**. La ronda corresponde al documento para defensa privada, por lo que el texto debería distinguir tipo de documento y no llamarlo “Perfil”.
3. El mismo etiquetado genérico **“Perfil V1”** también aparece en Administración para la ronda del documento público. La trazabilidad de la fase funciona, pero la etiqueta no permite diferenciar visualmente perfil, documento privado y documento público.
4. Las vistas de tutor y revisor siguen mostrando el bloque de ayuda `¿Necesitas apoyo?`, aunque previamente se había solicitado retirar ese elemento de todas las vistas. No afecta el flujo académico, pero contradice la decisión de interfaz acordada.

## Correcciones aplicadas después de la prueba

- Administración ahora identifica cada ronda como `Perfil`, `Documento privado` o `Documento público`, con su versión correspondiente.
- El mensaje que recibe el último revisor ahora describe la transición real: habilitación del documento privado, habilitación del documento público o aprobación institucional.
- Se retiró el bloque de ayuda estático de las barras laterales de estudiante, tutor, revisor y Administración.

## Siguientes verificaciones recomendadas

- Programar fecha, hora y lugar de defensas privada y pública desde Administración, y comprobar las notificaciones resultantes.
- Ejecutar una prueba separada de versiones V1–V5 para cada tipo documental si se requiere validar explícitamente ese volumen. En esta ejecución se validaron tres versiones del perfil y V1 de los documentos privado y público.
