BEGIN;

-- Datos declarados por el estudiante en el Formulario 1. No reemplazan el
-- perfil institucional ni la carrera asociada a la cuenta.
ALTER TABLE titulacion.proyectos
  ADD COLUMN IF NOT EXISTS programa_academico varchar(100),
  ADD COLUMN IF NOT EXISTS integrantes_declarados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS direccion_contacto text,
  ADD COLUMN IF NOT EXISTS telefono_fijo varchar(50),
  ADD COLUMN IF NOT EXISTS correo_contacto varchar(320),
  ADD COLUMN IF NOT EXISTS celular_contacto varchar(50),
  ADD COLUMN IF NOT EXISTS alcance_trabajo text,
  ADD COLUMN IF NOT EXISTS tiene_tutor boolean,
  ADD COLUMN IF NOT EXISTS tutor_nombre_declarado text,
  ADD COLUMN IF NOT EXISTS tutor_lugar_trabajo text,
  ADD COLUMN IF NOT EXISTS tutor_correo_declarado varchar(320),
  ADD COLUMN IF NOT EXISTS tutor_celular_declarado varchar(50);

DO $constraint$
BEGIN
  ALTER TABLE titulacion.proyectos
    ADD CONSTRAINT proyectos_programa_academico_valido
    CHECK (
      programa_academico IS NULL OR programa_academico IN (
        'Ingenieria de Sistemas Informaticos',
        'Tecnico Superior en Desarrollo de Video Juegos'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$constraint$;

COMMIT;
