import { databaseConnectionString } from './database-connection.mjs';

const DEV = /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/;
const CONTRACT = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
/** An opt-in DDL operation, never authority to prepare or transmit a Stellar operation. */
export function clinicalMigrationConnection(env = process.env, web = false) {
  try {
    const connection = databaseConnectionString(env);
    const target = new URL(connection ?? '');
    if (env.TRUSTLEAF_CLINICAL_MIGRATION !== 'true' || (web && env.TRUSTLEAF_CLINICAL_WEB_MIGRATION !== 'true') ||
        !['postgres:', 'postgresql:'].includes(target.protocol) || !/^[a-z0-9.-]+\.neon\.tech$/.test(target.hostname) ||
        [...target.searchParams.keys()].some(key => !['sslmode','channel_binding','connect_timeout','pgbouncer'].includes(key)) ||
        target.hostname.includes('ep-rapid-shadow-ahq94785')) throw Error();
    if (DEV.test(target.hostname) && !env.VERCEL_ENV && (!env.TRUSTLEAF_ENV || env.TRUSTLEAF_ENV === 'local')
        && (!env.TRUSTLEAF_ENV || target.hostname === env.TRUSTLEAF_DB_HOST)) return connection;
    if (env.TRUSTLEAF_ENV !== 'test' || env.VERCEL_ENV !== 'production' || !env.TRUSTLEAF_DATABASE_URL ||
        target.hostname !== env.TRUSTLEAF_DB_HOST || DEV.test(target.hostname) ||
        env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID !== CONTRACT ||
        env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' ||
        ['TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET','TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER','TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL'].some(key => env[key] !== undefined)) throw Error();
    return connection;
  } catch { throw Error('clinical_migration_target_not_authorized'); }
}
