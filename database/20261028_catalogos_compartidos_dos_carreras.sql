BEGIN;

-- El sistema académico opera únicamente con estas dos carreras. Conservamos sus
-- códigos internos para no romper referencias existentes, pero normalizamos los
-- nombres que se muestran en los formularios y paneles.
UPDATE titulacion.carreras
SET nombre = CASE codigo
  WHEN 'SIS' THEN 'Ingeniería en Sistemas Informáticos'
  WHEN 'INF' THEN 'Técnico Superior en Videojuegos'
  ELSE nombre
END
WHERE codigo IN ('SIS', 'INF');

-- Las modalidades son compartidas: cada una queda disponible y activa para las
-- dos carreras. La relación por carrera se mantiene por compatibilidad con el
-- esquema y con los proyectos ya registrados.
WITH modalidades(codigo, nombre) AS (
  VALUES
    ('PROYECTO_GRADO', 'Proyecto de grado'),
    ('TESIS', 'Tesis de grado'),
    ('TRABAJO_DIRIGIDO', 'Trabajo dirigido')
)
INSERT INTO titulacion.modalidades_titulacion (carrera_id, codigo, nombre, activa)
SELECT c.id, m.codigo, m.nombre, true
FROM titulacion.carreras c
CROSS JOIN modalidades m
WHERE c.codigo IN ('SIS', 'INF')
  AND NOT EXISTS (
    SELECT 1
    FROM titulacion.modalidades_titulacion existing
    WHERE existing.carrera_id = c.id AND existing.codigo = m.codigo
  );

UPDATE titulacion.modalidades_titulacion modality
SET activa = true
FROM titulacion.carreras career
WHERE career.id = modality.carrera_id
  AND career.codigo IN ('SIS', 'INF')
  AND modality.codigo IN ('PROYECTO_GRADO', 'TESIS', 'TRABAJO_DIRIGIDO');

COMMIT;
