import 'server-only';
import { getDbConnection } from '@/lib/db';
import { SqlSponsorshipStore as SharedSqlSponsorshipStore, type SponsorshipConnection } from '../../../scripts/lib/sponsorship-sql-store.mjs';
export type { SponsorshipConnection } from '../../../scripts/lib/sponsorship-sql-store.mjs';
/** Next adapter only: Node runners inject their guarded connection explicitly. */
export class SqlSponsorshipStore extends SharedSqlSponsorshipStore {
  constructor(connect: () => Promise<SponsorshipConnection> = getDbConnection) { super(connect); }
}
