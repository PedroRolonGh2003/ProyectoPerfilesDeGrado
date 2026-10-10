BEGIN;

-- Conserva la trazabilidad entre una observación respondida por el estudiante
-- y la versión del documento que contiene su corrección.
ALTER TABLE titulacion.observaciones
  ADD COLUMN IF NOT EXISTS version_documento_respuesta_id uuid
    REFERENCES titulacion.versiones_documento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_observaciones_version_respuesta
  ON titulacion.observaciones (version_documento_respuesta_id)
  WHERE version_documento_respuesta_id IS NOT NULL;

COMMIT;
