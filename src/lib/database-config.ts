/**
 * A dedicated connection can isolate the private portal from hosting integrations
 * that manage the generic DATABASE_URL. An empty dedicated value fails closed.
 * Both the environment guard and the shared database client use this selection.
 */
export function databaseConnectionString(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.TRUSTLEAF_DATABASE_URL !== undefined) return env.TRUSTLEAF_DATABASE_URL;
  return env.DATABASE_URL ?? (env.TRUSTLEAF_ENV ? undefined : env.POSTGRES_URL);
}
