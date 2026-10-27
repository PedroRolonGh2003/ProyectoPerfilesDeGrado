-- El rol no cuenta con vistas, rutas ni reglas de negocio activas en la aplicación.
-- Se conserva su historial y la cuenta previamente asociada para no perder trazabilidad.
UPDATE titulacion.usuario_roles AS usuario_rol
SET activo = false,
    retirado_en = COALESCE(retirado_en, now())
FROM titulacion.roles AS rol
WHERE usuario_rol.rol_id = rol.id
  AND rol.codigo = 'DIRECTOR_CARRERA'
  AND usuario_rol.activo;

UPDATE titulacion.roles
SET activo = false
WHERE codigo = 'DIRECTOR_CARRERA'
  AND activo;
