import { bucketDay, bucketKeys, bucketLimit, deny, type Bucket, type BudgetStore, type Reservation, type SponsorshipPolicy } from './domain';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Deterministic test/reference store. Production MUST use SqlSponsorshipStore. */
export class MemorySponsorshipStore implements BudgetStore {
  private reservations = new Map<string, Reservation>();
  private buckets = new Map<string, Bucket>();
  private tail: Promise<void> = Promise.resolve();
  async get(id: string): Promise<Reservation | null> { return copy(this.reservations.get(id) ?? null); }
  inspectBuckets(): Bucket[] { return copy([...this.buckets.values()]); }
  async mutate(id: string, initial: Reservation | null, policy: SponsorshipPolicy | null,
    change: (reservation: Reservation | null, buckets: Bucket[]) => Reservation): Promise<Reservation> {
    const previous = this.tail; let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    try {
      const current = copy(this.reservations.get(id) ?? null), base = current ?? initial;
      if (!base) return deny('sponsorship_reservation_missing');
      const keys = bucketKeys(base.binding).map(key => [base.binding.network, key, bucketDay(key,base.day)].join('|'));
      const buckets = keys.map((key, i) => copy(this.buckets.get(key) ?? (() => {
        if (!initial || !policy) return deny('sponsorship_accounting_unavailable');
        return { key: bucketKeys(base.binding)[i], day: bucketDay(bucketKeys(base.binding)[i],base.day), limitStroops: bucketLimit(bucketKeys(base.binding)[i], policy), reservedStroops: '0', spentStroops: '0' };
      })()));
      const result = change(current, buckets);
      if (result && typeof (result as unknown as { then?: unknown }).then === 'function') deny('sponsorship_async_mutation_forbidden');
      keys.forEach((key, i) => this.buckets.set(key, copy(buckets[i])));
      this.reservations.set(id, copy(result)); return copy(result);
    } finally { release(); }
  }
}
