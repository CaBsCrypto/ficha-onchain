import type { RehearsalPolicy, RehearsalStep } from './clinical-rehearsal-policy.mjs';

export interface RehearsalBudgetRow {
  id: string; state: 'awaiting_signature' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';
  action: 'append_version' | 'set_permissions'; source_wallet: string; contract_id: string; network: 'testnet';
  expected: Record<string, unknown>; unsigned_xdr: string; signing_hash: string;
  signed_xdr: string | null; transaction_hash: string | null; error_code: string | null;
  method?: string; actor_user_id?: string; wallet_id?: string; expires_at?: number | string;
}
export interface RehearsalAggregateExposureOptions {
  step: RehearsalStep;
  rows: readonly RehearsalBudgetRow[];
  authorizationRows?: readonly Record<string, any>[];
  authorizationReservations?: readonly Record<string, any>[];
  candidate: { unsignedXdr: string; offeredFeeStroops: string | bigint };
  receipt: (hash: string) => Promise<unknown>;
  now?: number;
}
export interface RehearsalAggregateExposure {
  readonly paidStroops: string;
  readonly reservedOfferedStroops: string;
  readonly candidateOfferedStroops: string;
  readonly withdrawalReserveStroops: string;
  /** Schema13 holds the complete maintenance maximum for the whole run. */
  readonly maintenanceReservedStroops?: string;
  readonly recoveryMaintenanceReservedStroops?: string;
  readonly priorRenewalReservedStroops?: string;
  readonly renewalCeilingRemainderStroops?: string;
  readonly totalExposureStroops: string;
  readonly remainingStroops: string;
}
/** Approved provenance/time is checked before calling the read-only receipt adapter. */
export function assertRehearsalAggregateExposure(
  policy: RehearsalPolicy,
  options: RehearsalAggregateExposureOptions,
): Promise<Readonly<RehearsalAggregateExposure>>;


export function rehearsalAuthorizationBinding(policy: RehearsalPolicy, job: Record<string, any>): import('./sponsorship-domain.mjs').SponsorshipBinding;
export function inspectRehearsalAuthorizationReservation(policy: RehearsalPolicy, job: Record<string, any>, row: Record<string, any>): import('./sponsorship-domain.mjs').Reservation;

export function verifiedRehearsalAuthorizationReceipt(policy: RehearsalPolicy, job: Record<string, any>, evidence: unknown): import('./sponsorship-domain.mjs').Receipt;

/** Approved schema13 authority is checked before reading the exact historical receipts. */
export function assertRehearsalHistoricalCharges(
  policy: RehearsalPolicy,
  options: { rows: readonly RehearsalBudgetRow[]; receipt: (hash: string) => Promise<unknown>; now?: number },
): Promise<Readonly<{ paidStroops: '93618202' }>>;

export interface RehearsalConfirmedOperationInspection {
  readonly status:'SUCCESS'; readonly key:string; readonly requestId:string; readonly operationId:string;
  readonly transactionHash:string; readonly ledger:number; readonly feeChargedStroops:string; readonly offeredFeeStroops:string;
  readonly entryId?:string; readonly version?:number; readonly revision?:number;
  readonly actorAndPayerSignaturesVerified:true; readonly expectedInvocationAndReturnedOutcomeVerified:true;
  readonly typedMetaAndSuccessEventPreimageVerified:true; readonly durableRecordedOperationReadPending:true;
}
/** Pure read-only inspection of an exact approved, already confirmed C4/C5/C6. */
export function inspectRehearsalConfirmedOperation(policy:RehearsalPolicy,options:{step:RehearsalStep;row:RehearsalBudgetRow;evidence:unknown;now?:number}):Readonly<RehearsalConfirmedOperationInspection>;

export function inspectPriorRehearsalRenewal(policy: import("./clinical-rehearsal-policy.mjs").RehearsalPolicy, options:{job:Record<string,any>;reservationRow:Record<string,any>}): Readonly<{requestId:string;transactionHash:string;heldStroops:"10000000";canonicalFeeReaudited:false}>;
