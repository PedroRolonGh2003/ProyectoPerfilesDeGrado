-- Registro público: las cuentas se activan solo luego de confirmar el correo.
ALTER TABLE titulacion.usuarios
  ADD COLUMN IF NOT EXISTS email_confirmado_en timestamptz;

CREATE TABLE IF NOT EXISTS titulacion.email_confirmation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  usado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_email_confirmation_tokens_usuario
  ON titulacion.email_confirmation_tokens (usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS ix_email_confirmation_tokens_expiracion
  ON titulacion.email_confirmation_tokens (expires_at);
