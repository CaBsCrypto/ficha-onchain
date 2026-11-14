import type { FeeBumpTransaction, xdr } from '@stellar/stellar-sdk';
import type { PrivateRxScope } from './digital-cabs-rx-scope.mjs';
import type { Reservation, Receipt, SponsorshipPolicy } from './sponsorship-domain.mjs';
import type { SponsorshipQuote } from './sponsorship-quote.mjs';
import type { SponsorshipConnection } from './sponsorship-sql-store.mjs';

type IssuanceScope = Extract<PrivateRxScope, { phase: 'issuance' }>;
export type PrivateRxStep = 'attest' | 'consent' | 'mint';
export type PrivateRxExpected = { doctor: string; patient: string; issuanceId: string; validUntil: number; commitment?: string; expiresAt?: number };
type PreparedAuthority = { xdr: string; hash: string; unsignedXdr: string; signedAt: number };
export declare const PRIVATE_RX_SPONSOR_BASE_FEE: '100000';
export declare function privateRxInvocation(scope: IssuanceScope, step: PrivateRxStep, expected?: PrivateRxExpected): xdr.Operation;
export declare function privateRxQuote(scope: IssuanceScope, step: PrivateRxStep, unsignedXdr: string, expected?: PrivateRxExpected,
  options?: { preparedAt?: number; now?: number }): Promise<SponsorshipQuote>;
export declare function verifyPrivateRxReceipt(receipt: unknown, outer: FeeBumpTransaction, hash: string): Receipt;
export declare function createPrivateRxSponsorship(options: {
  scope: IssuanceScope;
  client: Pick<SponsorshipConnection, 'query'>;
  connect?: () => Promise<SponsorshipConnection>;
  env?: Record<string, string | undefined>;
  now?: () => number;
}): {
  assertConfigured(step: PrivateRxStep): SponsorshipPolicy;
  reserve(step: PrivateRxStep, unsignedXdr: string, expected?: PrivateRxExpected,
    options?: { atomic?: boolean; preparedAt?: number; pinnedQuoteId?: string }): Promise<Reservation>;
  signAuthority(unsignedXdr: string, signXdr: (unsignedXdr: string) => Promise<string>): Promise<PreparedAuthority>;
  cancelAuthorityBeforeSigning(): Promise<void>;
  persistAuthority(prepared: PreparedAuthority): Promise<void>;
  signOwner(step: 'consent' | 'mint', unsignedXdr: string, expected: PrivateRxExpected, signature: string): Promise<{ xdr: string; hash: string }>;
  assertCanSubmit(step: PrivateRxStep, unsignedXdr: string, expected: PrivateRxExpected | undefined, encoded: string, hash: string): Promise<FeeBumpTransaction>;
  verifyBound(step: PrivateRxStep, unsignedXdr: string, expected: PrivateRxExpected | undefined, encoded: string, hash: string): Promise<FeeBumpTransaction>;
  reconcile(step: PrivateRxStep, unsignedXdr: string, expected: PrivateRxExpected | undefined, encoded: string, hash: string, receipt: unknown,
    options?: { atomic?: boolean; readOnly?: boolean }): Promise<Receipt | null>;
  quoteView(step: PrivateRxStep, unsignedXdr: string, expected?: PrivateRxExpected,
    options?: { atomic?: boolean }): Promise<{ maxFeeStroops: string; quotePreparedAt: number; quoteExpiresAt: number; quoteValidUntil?: number }>;
  cancelUnsigned(step: PrivateRxStep, unsignedXdr: string, expected?: PrivateRxExpected): Promise<Reservation>;
};
