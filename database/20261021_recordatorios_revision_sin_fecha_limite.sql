BEGIN;

-- Las rondas no expiran por una fecha fija. A partir del segundo día, el
-- sistema envía recordatorios diarios mientras cada dictamen siga pendiente.
ALTER TABLE titulacion.rondas_revision
  ALTER COLUMN fecha_limite DROP NOT NULL;

-- Elimina plazos operativos de las revisiones que todavía están en curso,
-- conservando los datos históricos de rondas y asignaciones ya cerradas.
UPDATE titulacion.rondas_revision
SET fecha_limite = NULL
WHERE cerrada_en IS NULL;

UPDATE titulacion.asignaciones_proyecto
SET fecha_limite = NULL
WHERE activo AND fecha_fin IS NULL;

COMMIT;
