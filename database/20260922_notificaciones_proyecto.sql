BEGIN;

-- Identifica un evento de negocio por destinatario. Evita que reintentos o
-- solicitudes concurrentes creen más de una notificación del mismo evento.
ALTER TABLE titulacion.notificaciones
  ADD COLUMN IF NOT EXISTS evento_clave varchar(160);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notificaciones_usuario_evento_clave
  ON titulacion.notificaciones (usuario_id, evento_clave)
  WHERE evento_clave IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notificaciones_proyecto_recientes
  ON titulacion.notificaciones (proyecto_id, creada_en DESC);

COMMIT;
