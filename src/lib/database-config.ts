/**
 * A dedicated connection can isolate the private portal from hosting integrations
 * that manage the generic DATABASE_URL. An empty dedicated value fails closed.
 * Both the environment guard and the shared database client use this selection.
 */
export { databaseConnectionString } from '../../scripts/lib/database-connection.mjs';
