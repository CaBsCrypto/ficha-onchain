import { type QuoteData, type SponsorshipPrincipal } from './sponsorship-domain.mjs';
declare const verifiedQuote: unique symbol;
export type SponsorshipQuote = QuoteData & {
    readonly [verifiedQuote]: true;
};
export declare function quoteSponsorship(principal: SponsorshipPrincipal, input: {
    unsignedXdr: string;
    sponsorBaseFeeStroops: string;
    preparedAt: number;
    now: number;
    /** Server-only opt-in used by new clinical preparations; never inferred on reads. */
    validUntil?: number;
}): SponsorshipQuote;
export declare function assertVerifiedQuote(principal: SponsorshipPrincipal, quote: SponsorshipQuote): void;
/** Checks the immutable signing payload; existing actor-signature verification remains mandatory at the caller. */
export declare function signedEnvelope(principal: SponsorshipPrincipal, quote: QuoteData, signedInnerXdr: string): {
    signedInnerDigest: string;
    transactionHash: string;
};
export {};
