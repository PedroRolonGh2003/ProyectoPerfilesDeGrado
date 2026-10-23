BEGIN;

-- Cada navegador/dispositivo conserva su propia suscripción. La URL del
-- endpoint es única para evitar registros duplicados de una misma instalación.
CREATE TABLE IF NOT EXISTS titulacion.suscripciones_push (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES titulacion.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  clave_p256dh text NOT NULL,
  clave_auth text NOT NULL,
  agente_usuario text,
  activa boolean NOT NULL DEFAULT true,
  creada_en timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_exitoso_en timestamptz,
  ultimo_error text
);

CREATE INDEX IF NOT EXISTS ix_suscripciones_push_usuario_activas
  ON titulacion.suscripciones_push (usuario_id, actualizada_en DESC)
  WHERE activa;

-- Una entrega representa exactamente una notificación interna y una
-- suscripción. La restricción única evita avisos repetidos por evento.
CREATE TABLE IF NOT EXISTS titulacion.entregas_notificaciones_push (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES titulacion.notificaciones(id) ON DELETE CASCADE,
  suscripcion_id uuid NOT NULL REFERENCES titulacion.suscripciones_push(id) ON DELETE CASCADE,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PROCESANDO', 'ENVIADO', 'ERROR', 'CANCELADO')),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  disponible_desde timestamptz NOT NULL DEFAULT now(),
  enviado_en timestamptz,
  ultimo_error text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, suscripcion_id)
);

CREATE INDEX IF NOT EXISTS ix_entregas_push_pendientes
  ON titulacion.entregas_notificaciones_push (disponible_desde, creado_en)
  WHERE estado = 'PENDIENTE';

COMMIT;
