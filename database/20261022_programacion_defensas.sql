BEGIN;

-- Cada proyecto puede tener una convocatoria independiente para la defensa
-- privada y para la pública. Se conserva una sola programación vigente por
-- tipo, que Administración puede actualizar si cambia la convocatoria.
CREATE TABLE IF NOT EXISTS titulacion.defensas_programadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES titulacion.proyectos(id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('PRIVADA', 'PUBLICA')),
  fecha_hora timestamptz NOT NULL,
  lugar text NOT NULL CHECK (length(btrim(lugar)) >= 3),
  programada_por_usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id),
  programada_en timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proyecto_id, tipo)
);

CREATE INDEX IF NOT EXISTS ix_defensas_programadas_proyecto
  ON titulacion.defensas_programadas (proyecto_id, tipo);

COMMIT;
