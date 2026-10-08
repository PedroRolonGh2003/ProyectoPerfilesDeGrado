BEGIN;

-- Una asignación TUTOR inactiva y sin fecha de finalización representa una
-- invitación pendiente. Al declinarla se conserva el registro con fecha_fin.
ALTER TABLE titulacion.asignaciones_proyecto
  ADD COLUMN IF NOT EXISTS respondida_en timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_tutor_pendiente
  ON titulacion.asignaciones_proyecto (proyecto_id)
  WHERE tipo = 'TUTOR' AND NOT activo AND fecha_fin IS NULL;

CREATE INDEX IF NOT EXISTS ix_notificaciones_usuario_no_leidas
  ON titulacion.notificaciones (usuario_id, creada_en DESC)
  WHERE leida_en IS NULL;

-- No envía correos por sí misma. Un servicio SMTP futuro procesará esta cola
-- para no acoplar el flujo académico a un proveedor externo.
CREATE TABLE IF NOT EXISTS titulacion.cola_correos_notificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL UNIQUE
    REFERENCES titulacion.notificaciones(id) ON DELETE CASCADE,
  destinatario varchar(255) NOT NULL,
  tipo varchar(80) NOT NULL,
  asunto varchar(255) NOT NULL,
  cuerpo text NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'ERROR', 'CANCELADO')),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_intento_en timestamptz,
  enviado_en timestamptz,
  error_ultimo_intento text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cola_correos_pendientes
  ON titulacion.cola_correos_notificacion (creado_en)
  WHERE estado = 'PENDIENTE';

-- Conserva la experiencia consistente para solicitudes creadas antes de que
-- existiera la campanita. No realiza ningún envío externo.
INSERT INTO titulacion.notificaciones
  (usuario_id, proyecto_id, tipo, titulo, mensaje, enlace)
SELECT u.id, a.proyecto_id, 'SOLICITUD_TUTORIA', 'Nueva invitación de tutoría',
       concat('Tienes una invitación para acompañar el proyecto ', p.codigo_seguimiento, '. Responde desde el Portal del Tutor.'),
       '/tutor/invitaciones'
FROM titulacion.asignaciones_proyecto a
JOIN titulacion.docentes d ON d.id = a.docente_id
JOIN titulacion.usuarios u ON u.id = d.usuario_id
JOIN titulacion.proyectos p ON p.id = a.proyecto_id
WHERE a.tipo = 'TUTOR'
  AND NOT a.activo
  AND a.fecha_fin IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM titulacion.notificaciones n
    WHERE n.usuario_id = u.id
      AND n.proyecto_id = a.proyecto_id
      AND n.tipo = 'SOLICITUD_TUTORIA'
  );

INSERT INTO titulacion.cola_correos_notificacion
  (notificacion_id, destinatario, tipo, asunto, cuerpo)
SELECT n.id, u.correo, n.tipo, n.titulo, n.mensaje
FROM titulacion.notificaciones n
JOIN titulacion.usuarios u ON u.id = n.usuario_id
WHERE n.tipo = 'SOLICITUD_TUTORIA'
  AND NOT EXISTS (
    SELECT 1
    FROM titulacion.cola_correos_notificacion q
    WHERE q.notificacion_id = n.id
  );

COMMIT;
