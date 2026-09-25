-- Tokens de un solo uso para restablecer contraseñas sin exponer el valor real.
-- El token que recibe el usuario se guarda únicamente como SHA-256.

CREATE TABLE IF NOT EXISTS titulacion.tokens_recuperacion_contrasena (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  solicitado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,
  usado_en timestamptz NULL,
  ip_origen inet NULL,
  agente_usuario varchar(1000) NULL,
  CONSTRAINT tokens_recuperacion_expiracion_valida CHECK (expira_en > solicitado_en)
);

CREATE INDEX IF NOT EXISTS tokens_recuperacion_usuario_solicitado_idx
  ON titulacion.tokens_recuperacion_contrasena (usuario_id, solicitado_en DESC);

CREATE INDEX IF NOT EXISTS tokens_recuperacion_activos_idx
  ON titulacion.tokens_recuperacion_contrasena (expira_en)
  WHERE usado_en IS NULL;
