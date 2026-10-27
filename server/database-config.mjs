export function databaseConnectionOptions(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL?.trim()
  if (databaseUrl) return { connectionString: databaseUrl, options: '-c search_path=titulacion,public' }
  return {
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT ?? 5432),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    options: '-c search_path=titulacion,public',
  }
}
