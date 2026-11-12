import type { RehearsalPolicy, RehearsalStep } from './clinical-rehearsal-policy.mjs';
export interface RehearsalClosureClient {
  query(sql: string, values?: any[]): Promise<{ rows: Record<string, any>[] }>;
}
export function rehearsalRunLockKey(policy: RehearsalPolicy): string | null;
/** Requires an existing explicit transaction; never begins/commits one. */
export function lockClinicalRehearsalRun(client: RehearsalClosureClient, policy: RehearsalPolicy): Promise<void>;
/** lock:false requires the runner's fixed PG session already holding the same
 * session advisory lock for the entire prepare/sign/submit lifecycle. */
export function assertRehearsalOpen(client: RehearsalClosureClient, policy: RehearsalPolicy, options?: { lock?: boolean; step?: RehearsalStep }): Promise<void>;
