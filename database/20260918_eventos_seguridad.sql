-- Auditoría mínima para eventos de seguridad que no siempre cuentan con una sesión válida.
-- Aplicar después de las migraciones base del esquema titulacion.

CREATE TABLE IF NOT EXISTS titulacion.eventos_seguridad (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid NULL REFERENCES titulacion.usuarios(id),
  tipo varchar(80) NOT NULL,
  identificador_hash char(64) NULL,
  ip_origen inet NULL,
  agente_usuario varchar(1000) NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_seguridad_tipo_no_vacio CHECK (length(trim(tipo)) > 0)
);

CREATE INDEX IF NOT EXISTS eventos_seguridad_creado_en_idx
  ON titulacion.eventos_seguridad (creado_en DESC);

CREATE INDEX IF NOT EXISTS eventos_seguridad_identificador_hash_idx
  ON titulacion.eventos_seguridad (identificador_hash, creado_en DESC)
  WHERE identificador_hash IS NOT NULL;
