BEGIN;

-- Habilita la fase pública para proyectos que ya habían concluido la defensa
-- privada antes de que se incorporara este flujo al sistema.
WITH catalog AS (
  SELECT
    (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PUBLICO' AND activa) AS fase_publica_id,
    (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PUBLICO') AS estado_publico_id
), elegibles AS (
  SELECT p.id AS proyecto_id, p.estado_actual_id, p.fase_actual_id,
         private_document.creado_por_usuario_id, p.codigo_seguimiento, p.titulo_tentativo
  FROM titulacion.proyectos p
  JOIN titulacion.estados_proyecto estado ON estado.id = p.estado_actual_id AND estado.codigo = 'APROBADO_TECNICO'
  JOIN titulacion.fases fase ON fase.id = p.fase_actual_id AND fase.codigo = 'APROBACION_PERFIL'
  JOIN LATERAL (
    SELECT d.creado_por_usuario_id
    FROM titulacion.documentos d
    WHERE d.proyecto_id = p.id AND d.tipo_documento = 'DOCUMENTO_PRIVADO' AND d.activo
    ORDER BY d.creado_en DESC
    LIMIT 1
  ) private_document ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM titulacion.documentos public_document
    WHERE public_document.proyecto_id = p.id
      AND public_document.tipo_documento = 'DOCUMENTO_PUBLICO'
      AND public_document.activo
  )
)
INSERT INTO titulacion.documentos (proyecto_id, fase_id, nombre, tipo_documento, creado_por_usuario_id)
SELECT elegibles.proyecto_id, catalog.fase_publica_id,
       concat('Documento final para defensa pública - ', elegibles.titulo_tentativo),
       'DOCUMENTO_PUBLICO', elegibles.creado_por_usuario_id
FROM elegibles CROSS JOIN catalog
WHERE catalog.fase_publica_id IS NOT NULL;

WITH catalog AS (
  SELECT
    (SELECT id FROM titulacion.fases WHERE codigo = 'DOCUMENTO_PUBLICO' AND activa) AS fase_publica_id,
    (SELECT id FROM titulacion.estados_proyecto WHERE codigo = 'EN_DOCUMENTO_PUBLICO') AS estado_publico_id
), elegibles AS (
  SELECT p.id AS proyecto_id, p.estado_actual_id, p.fase_actual_id,
         d.creado_por_usuario_id
  FROM titulacion.proyectos p
  JOIN titulacion.estados_proyecto estado ON estado.id = p.estado_actual_id AND estado.codigo = 'APROBADO_TECNICO'
  JOIN titulacion.fases fase ON fase.id = p.fase_actual_id AND fase.codigo = 'APROBACION_PERFIL'
  JOIN LATERAL (
    SELECT creado_por_usuario_id
    FROM titulacion.documentos
    WHERE proyecto_id = p.id AND tipo_documento = 'DOCUMENTO_PUBLICO' AND activo
    ORDER BY creado_en DESC
    LIMIT 1
  ) d ON true
)
INSERT INTO titulacion.historial_estados
  (proyecto_id, estado_anterior_id, estado_nuevo_id, fase_anterior_id, fase_nueva_id, cambiado_por_usuario_id, motivo)
SELECT elegibles.proyecto_id, elegibles.estado_actual_id, catalog.estado_publico_id,
       elegibles.fase_actual_id, catalog.fase_publica_id, elegibles.creado_por_usuario_id,
       'Se habilitó el documento final para defensa pública tras la aprobación de defensa privada.'
FROM elegibles CROSS JOIN catalog
WHERE catalog.fase_publica_id IS NOT NULL AND catalog.estado_publico_id IS NOT NULL;

COMMIT;
