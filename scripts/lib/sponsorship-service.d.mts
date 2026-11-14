import { type BudgetStore, type Receipt, type Reservation, type SponsorshipPolicy, type SponsorshipPrincipal } from './sponsorship-domain.mjs';
import { type SponsorshipQuote } from './sponsorship-quote.mjs';
export declare function createSponsorshipService(input: {
    store: BudgetStore;
    policy?: SponsorshipPolicy | null;
    now?: () => number;
}): {
    reserve(principal: SponsorshipPrincipal, quote: SponsorshipQuote): Promise<Reservation>;
    assertReady(principal: SponsorshipPrincipal, phase: "sign" | "submit"): Promise<Reservation>;
    markSigned(principal: SponsorshipPrincipal, signedInnerXdr: string, proof?: {
        signedAt: number;
    }): Promise<Reservation>;
    bindSubmission(principal: SponsorshipPrincipal, signedInnerXdr: string, proof?: {
        signedAt: number;
    }): Promise<{
        reservation: Reservation;
        transactionHash: string;
    }>;
    cancelUnsigned(principal: SponsorshipPrincipal): Promise<Reservation>;
    /** Receipt I/O occurs BEFORE mutate: no network operation runs under bucket locks. Missing historical rows are readable. */
    reconcile(requestId: string, receiptReader: (hash: string) => Promise<Receipt>): Promise<Reservation | null>;
};
