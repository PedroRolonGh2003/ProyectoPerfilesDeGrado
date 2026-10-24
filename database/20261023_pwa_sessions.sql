ALTER TABLE titulacion.sesiones_usuario
  ADD COLUMN IF NOT EXISTS persistente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_endpoint text;

-- Queue within the same transaction, even if the sender is temporarily disabled.
CREATE OR REPLACE FUNCTION titulacion.encolar_notificacion_push()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO titulacion.entregas_notificaciones_push (notificacion_id, suscripcion_id)
  SELECT NEW.id, id FROM titulacion.suscripciones_push
  WHERE usuario_id = NEW.usuario_id AND activa
  ON CONFLICT (notificacion_id, suscripcion_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER notificacion_push_encolada
AFTER INSERT ON titulacion.notificaciones
FOR EACH ROW EXECUTE FUNCTION titulacion.encolar_notificacion_push();
