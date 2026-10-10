CREATE TABLE IF NOT EXISTS titulacion.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  usado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_usuario
  ON titulacion.password_reset_tokens (usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expiracion
  ON titulacion.password_reset_tokens (expires_at);
