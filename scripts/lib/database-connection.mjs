/** One connection selection rule for the application and explicit migrations. */
export function databaseConnectionString(env = process.env) {
  if (env.TRUSTLEAF_DATABASE_URL !== undefined) return env.TRUSTLEAF_DATABASE_URL;
  return env.DATABASE_URL ?? (env.TRUSTLEAF_ENV ? undefined : env.POSTGRES_URL);
}
