import { type Bucket, type BudgetStore, type Reservation, type SponsorshipPolicy } from './sponsorship-domain.mjs';
export interface SponsorshipConnection {
    query(sql: string, values?: unknown[]): Promise<{
        rows: Record<string, any>[];
    }>;
    release(): void;
}
/** Uses the shared guarded database connector. Request lock + two ordered bucket locks; no RPC callback. */
export declare class SqlSponsorshipStore implements BudgetStore {
    private readonly connect;
    constructor(connect: () => Promise<SponsorshipConnection>);
    get(id: string): Promise<Reservation | null>;
    mutate(id: string, initial: Reservation | null, policy: SponsorshipPolicy | null, change: (reservation: Reservation | null, buckets: Bucket[]) => Reservation): Promise<Reservation>;
}

export function decodeSponsorshipReservation(row: Record<string, any>): Reservation;
