BEGIN;

-- Matrices del Formulario 2 asociadas al dictamen que ya emite cada revisor.
ALTER TABLE titulacion.revisiones
  ADD COLUMN IF NOT EXISTS criterios_formato jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS criterios_fondo jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
