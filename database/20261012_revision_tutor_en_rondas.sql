BEGIN;

-- Incorpora al tutor en las rondas abiertas creadas antes de que el dictamen
-- del tutor formara parte de la revision del perfil. Es idempotente.
INSERT INTO titulacion.revisiones (ronda_revision_id, asignacion_proyecto_id)
SELECT rr.id, tutor_assignment.id
FROM titulacion.rondas_revision rr
JOIN titulacion.versiones_documento version ON version.id = rr.version_documento_id
JOIN titulacion.documentos document ON document.id = version.documento_id
JOIN titulacion.asignaciones_proyecto tutor_assignment
  ON tutor_assignment.proyecto_id = document.proyecto_id
 AND tutor_assignment.tipo = 'TUTOR'
 AND tutor_assignment.activo
 AND tutor_assignment.fecha_fin IS NULL
WHERE rr.cerrada_en IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM titulacion.revisiones existing_review
    WHERE existing_review.ronda_revision_id = rr.id
      AND existing_review.asignacion_proyecto_id = tutor_assignment.id
  );

COMMIT;
