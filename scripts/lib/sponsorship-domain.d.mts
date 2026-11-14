export { QUOTE_MAX_AGE_SECONDS, CLINICAL_QUOTE_MAX_AGE_SECONDS } from './sponsorship-quote-window.mjs';
export type ReservationState = 'reserved' | 'signed' | 'submitted' | 'settled' | 'released';
export declare class SponsorshipError extends Error {
    readonly code: string;
    constructor(code: string);
}
export declare function deny(code: string): never;
export declare function stroops(value: unknown, zero?: boolean): bigint;
export declare function epoch(value: unknown): number;
export declare const utcDay: (seconds: number) => string;
export declare const sha256: (value: string) => string;
export type SponsorshipBinding = Readonly<{
    requestId: string;
    network: 'testnet';
    sourceAddress: string;
    sponsorAddress: string;
    patientAddress: string;
    actorId: string;
    walletId: string;
    contractId: string;
    action: string;
    operationFingerprint: string;
    encounterId?: string;
    intent?: 'standard' | 'revoke';
}>;
declare const verifiedPrincipal: unique symbol;
export type SponsorshipPrincipal = SponsorshipBinding & {
    readonly [verifiedPrincipal]: true;
};
export declare function validateBinding(value: SponsorshipBinding): void;
/** Resolver MUST derive these values from authenticated server/chain state, never a request body. */
export declare function verifySponsorshipPrincipal(resolve: () => Promise<SponsorshipBinding>): Promise<SponsorshipPrincipal>;
export declare function assertPrincipal(value: SponsorshipPrincipal): void;
export declare function bindingDigest(value: SponsorshipBinding): string;
export type SponsorshipPolicy = Readonly<{
    enabled: boolean;
    sponsorDailyLimitStroops: string;
    patientDailyLimitStroops: string;
    maxFeeStroops: string;
    emergencyReserveStroops?: string;
    encounterLimitStroops?: string;
}>;
export declare function assertPolicy(value: SponsorshipPolicy | null | undefined): asserts value is SponsorshipPolicy;
export type QuoteData = Readonly<{
    binding: string;
    quoteId: string;
    unsignedHash: string;
    signingHash: string;
    preparedAt: number;
    maxTime: number;
    offeredFeeStroops: string;
    resourceFeeStroops: string;
    sponsorBaseFeeStroops: string;
    /** Only new clinical quotes opt in; absence permanently preserves the legacy90s window. */
    validUntil?: number;
}>;
export declare function quoteDigest(q: Omit<QuoteData, 'quoteId'>): string;
export type Reservation = {
    binding: SponsorshipBinding;
    quote: QuoteData;
    day: string;
    state: ReservationState;
    signedInnerDigest: string | null;
    signedAt: number | null;
    transactionHash: string | null;
    outcome: 'SUCCESS' | 'FAILED' | null;
    chargedStroops: string | null;
    ledger: number | null;
};
export type Bucket = {
    key: string;
    day: string;
    limitStroops: string;
    reservedStroops: string;
    spentStroops: string;
};
export type Receipt = {
    status: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | 'NOT_FOUND';
    transactionHash: string;
    feeChargedStroops?: string;
    ledger?: number;
};
export declare const bucketKeys: (b: SponsorshipBinding) => string[];
export declare const bucketDay: (key: string, day: string) => string;
export declare const bucketLimit: (key: string, policy: SponsorshipPolicy) => string;
export declare function quoteExpiresAt(quote: Pick<QuoteData, 'preparedAt' | 'maxTime' | 'validUntil'>): number;
export declare function assertFreshQuote(quote: QuoteData, now: number): void;
export declare function assertPrice(quote: QuoteData, policy: SponsorshipPolicy): void;
export declare function assertBinding(reservation: Reservation, principal: SponsorshipPrincipal): void;
export declare function assertBucketLimits(buckets: Bucket[], policy: SponsorshipPolicy, binding?: SponsorshipBinding, emergency?: boolean): void;
export interface BudgetStore {
    get(requestId: string): Promise<Reservation | null>;
    /** A synchronous mutation only. Implementations MUST NOT run RPC or user callbacks under SQL locks. */
    mutate(requestId: string, initial: Reservation | null, policy: SponsorshipPolicy | null, change: (reservation: Reservation | null, buckets: Bucket[]) => Reservation): Promise<Reservation>;
}
export declare function newReservation(principal: SponsorshipPrincipal, quote: QuoteData): Reservation;
export declare function applyReservation(existing: Reservation | null, candidate: Reservation, buckets: Bucket[], policy: SponsorshipPolicy): Reservation;
export declare function releaseReserved(reservation: Reservation, buckets: Bucket[], charged: bigint): void;
