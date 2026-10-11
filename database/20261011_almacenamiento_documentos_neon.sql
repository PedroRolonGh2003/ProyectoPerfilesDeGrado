BEGIN;

ALTER TABLE titulacion.versiones_documento
  ADD COLUMN IF NOT EXISTS contenido_archivo bytea;

COMMENT ON COLUMN titulacion.versiones_documento.contenido_archivo
  IS 'Contenido binario persistente del documento, disponible desde los despliegues serverless.';

COMMIT;
