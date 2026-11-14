export type PrivateRxRole = 'patient' | 'doctor';
export type PrivateRxStepKey = 'attest' | 'consent' | 'mint';
export interface PrivateRxActor { readonly userId: string; readonly walletId: string; readonly address: string }
export interface PrivateRxDocument { readonly medication: string; readonly dosage: string; readonly instructions: string }
export interface PrivateRxSlot { readonly date: string; readonly timeSlot: string; readonly type: 'Presencial' | 'Telemedicina'; readonly oneTime?: true }
export interface PrivateRxStep { readonly requestId: string; readonly maxFeeStroops: string }
interface ScopeBase {
  readonly schemaVersion: 1; readonly runId: string; readonly openedAt: number; readonly until: number;
  readonly network: 'testnet'; readonly basePdfScopeSha256: string; readonly contractId: string; readonly registryId: string;
  readonly authority: string; readonly relayer: string; readonly patient: PrivateRxActor; readonly doctor: PrivateRxActor;
  readonly historyId: string; readonly doctorId: number; readonly slot: PrivateRxSlot; readonly document: PrivateRxDocument;
  readonly approved: boolean; readonly policyHash: string;
}
export interface PrivateRxAppointmentScope extends ScopeBase { readonly phase: 'appointment' }
export interface PrivateRxIssuanceScope extends ScopeBase {
  readonly phase: 'issuance'; readonly appointmentId: number; readonly issuanceId: string; readonly bookingValidUntil: number;
  readonly prescriptionId: string; readonly maxTotalFeeStroops: string; readonly attestationQuoteSha256: string | null;
  readonly steps: Readonly<Record<PrivateRxStepKey, PrivateRxStep>>;
}
export type PrivateRxScope = PrivateRxAppointmentScope | PrivateRxIssuanceScope;
export const PRIVATE_RX_SCOPE_ENV: Readonly<{ file: string; hash: string; approval: string }>;
export const DIGITAL_CABS_RX_DOCUMENT: PrivateRxDocument;
export const PRIVATE_RX_CONTRACT_ID: string;
export const PRIVATE_RX_REGISTRY_ID: string;
export const PRIVATE_RX_AUTHORITY: string;
export function privateRxScopeConfigured(env?: NodeJS.ProcessEnv): boolean;
export function privateRxAppointmentEpoch(slot: unknown): number;
export function validatePrivateRxManifest(plan: unknown, verifiedBase: unknown, options: { now: number; basePdfScopeSha256: string; requireApproval?: boolean; allowExpired?: boolean }): void;
export function loadPrivateRxScope(options?: { env?: NodeJS.ProcessEnv; now?: number; requireApproval?: boolean; allowExpired?: boolean }): PrivateRxScope | null;
export function assertPrivateRxScopeOpen(scope: PrivateRxScope, options?: { env?: NodeJS.ProcessEnv; now?: number; step?: PrivateRxStepKey }): PrivateRxScope;
