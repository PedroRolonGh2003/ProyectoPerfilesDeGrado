BEGIN;

INSERT INTO titulacion.modalidades_titulacion (carrera_id, codigo, nombre, activa)
SELECT c.id, 'TRABAJO_DIRIGIDO', 'Trabajo dirigido', true
FROM titulacion.carreras c
WHERE c.codigo = 'SIS'
  AND NOT EXISTS (
    SELECT 1
    FROM titulacion.modalidades_titulacion m
    WHERE m.carrera_id = c.id
      AND m.codigo = 'TRABAJO_DIRIGIDO'
  );

CREATE OR REPLACE FUNCTION titulacion.fn_validar_rol_activo_sesion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM titulacion.usuario_roles ur
    WHERE ur.usuario_id = NEW.usuario_id
      AND ur.rol_id = NEW.rol_activo_id
      AND ur.activo
  ) THEN
    RAISE EXCEPTION 'El rol activo no está asignado a este usuario';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION titulacion.fn_aplicar_historial_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE titulacion.proyectos
  SET estado_actual_id = NEW.estado_nuevo_id,
      fase_actual_id = COALESCE(NEW.fase_nueva_id, fase_actual_id)
  WHERE id = NEW.proyecto_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION titulacion.fn_validar_revision_asignacion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_proyecto_documento uuid;
  v_proyecto_asignacion uuid;
BEGIN
  SELECT d.proyecto_id INTO v_proyecto_documento
  FROM titulacion.rondas_revision rr
  JOIN titulacion.versiones_documento vd ON vd.id = rr.version_documento_id
  JOIN titulacion.documentos d ON d.id = vd.documento_id
  WHERE rr.id = NEW.ronda_revision_id;

  SELECT proyecto_id INTO v_proyecto_asignacion
  FROM titulacion.asignaciones_proyecto
  WHERE id = NEW.asignacion_proyecto_id;

  IF v_proyecto_documento IS NULL OR v_proyecto_documento <> v_proyecto_asignacion THEN
    RAISE EXCEPTION 'La asignación no corresponde al proyecto de la ronda de revisión';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
