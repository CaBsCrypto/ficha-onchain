export interface RehearsalActor { userId: string; walletId: string; address: string; email?: string }
export interface RehearsalNote { title: string; text: string; eventDate: string | null; prescriptionId: string }
export interface RehearsalInput {
  requestId: string; action: 'append_version' | 'set_permissions'; historyId?: string;
  entryId?: string; expectedVersion?: number; note?: RehearsalNote;
  file?: { fileName: string; mediaType: 'application/pdf'; base64: string };
  doctorId?: number; canRead?: boolean; canAppend?: boolean; expectedRevision?: number;
}
export type RehearsalStepKey = 'renew' | 'grant_read' | 'grant_append' | 'append_note' | 'grant_both' | 'append_pdf' | 'correct_note' | 'revoke';
export interface RehearsalStep {
  key: RehearsalStepKey; requestId: string; actor: 'admin' | 'patient' | 'doctor';
  action: 'renew' | 'set_permissions' | 'append_version'; maxFeeStroops: string;
  input?: RehearsalInput; operationId?: string;
}
export interface RehearsalAuthorization { requestId: string; dossierId: string; validUntil: number; expectedVersion: 3 | 4 | 5 | 6; targetVersion: 4 | 5 | 6 | 7; method: 'reauthorize_doctor' }
export interface RehearsalApproval { schemaVersion: 1; planHash: string; approvedAt: number; statement: string }
export interface RehearsalContinuationLineage {
  originalPlanFile: string; originalPlanHash: string; originalRunId: string; priorDoctorValidUntil: number;
  confirmed: readonly { key: 'renew' | 'grant_read' | 'grant_append'; requestId: string; transactionHash: string }[];
  cancelledNote: { requestId: string; operationId: string; expiresAt: number };
}
export interface RehearsalAggregateConfirmed {
  readonly key: 'append_note' | 'grant_both'; readonly requestId: string; readonly operationId: string;
  readonly transactionHash: string; readonly feeChargedStroops: string; readonly ledger: number;
}
export interface RehearsalAggregateBudget {
  readonly amendmentId: string; readonly preparedAt: number; readonly approvedAt: number;
  readonly basePlanHash: string; readonly baseApprovalHash: string;
  readonly aggregateMaxFeeStroops: '400000000'; readonly pdfMaxFeeStroops: '150000000';
  readonly correctionMaxFeeStroops: '150000000'; readonly withdrawalMaxFeeStroops: '60000000';
  readonly renewalMaxFeeStroops?: '10000000';
  readonly maintenanceMaxFeeStroops?: '20000000';
  readonly recoveryMaintenanceMaxFeeStroops?: '20000000';
  readonly priorRenewalReserveStroops?: '10000000';
  readonly withdrawalReserveStroops: '60000000'; readonly confirmedSteps: readonly Readonly<RehearsalAggregateConfirmed>[];
}
interface ClosingReceipt {
  readonly requestId: string; readonly transactionHash: string;
  readonly ledger: number; readonly feeChargedStroops: string;
}
export interface RehearsalPolicy {
  readonly closingContinuation?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; previousUntil: number; executionUntil: number;
    confirmedPdf: ClosingReceipt; confirmedRenewal: ClosingReceipt;
  }>;
  readonly restoredCompletion?: Readonly<{amendmentId:string;preparedAt:number;approvedAt:number;executionUntil:number;sourceManifestHash:string;sourceApprovalHash:string;priorCreatedAt:number;priorCompletionApprovedAt:number;priorMaintenanceUntil:number;priorAuthorization:RehearsalAuthorization;priorRenewalStep:RehearsalStep;priorRenewalTransactionHash:string;priorRenewalReserveStroops:'10000000';restoration:Readonly<{requestId:string;source:string;maxFeeStroops:'20000000';keys:readonly string[];keysSha256:string;footprintSha256:string;attemptFile:string;approvedAt:number;until:number}>}>;
  readonly expiredSignedPdfRecovery?: Readonly<{amendmentId:string;preparedAt:number;approvedAt:number;sourceApprovedAt:number;executionUntil:number;priorPdfProofCount:5;evidenceFile:string;evidenceSha256:string;requestId:string;transactionHash:string;signedEnvelopeSha256:string}>;
  readonly schemaVersion: 1 | 2; readonly runId: string; readonly createdAt: number; readonly until: number;
  readonly doctorValidUntil: number; readonly network: 'testnet'; readonly contractId: string; readonly registryId: string;
  readonly relayer: string; readonly admin: string; readonly patient: RehearsalActor; readonly doctor: RehearsalActor;
  readonly historyId: string; readonly doctorId: 10; readonly startingGrantRevision: 3 | 5; readonly startingDoctorVersion: 3 | 4 | 5 | 6;
  readonly totalMaxFeeStroops: string; readonly steps: readonly RehearsalStep[];
  readonly reviewer: { userId: string; email: string };
  readonly authorization: RehearsalAuthorization;
  readonly preparedAt?: number; readonly notBefore?: number; readonly executionWindowSeconds?: 21600 | 14400; readonly doctorWindowSeconds?: 86400 | 604800;
  readonly lineage?: RehearsalContinuationLineage; readonly previousAuthorization?: RehearsalAuthorization; readonly previousSteps?: readonly RehearsalStep[];
  readonly feeAmendment?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    baseApprovedAt: number; baseUntil: number; doctorMaxFeeStroops: '50000000';
    permissionMaxFeeStroops: '10000000'; remainingMaxFeeStroops: '170000000';
    executionApprovedAt?: number; executionWindowSeconds?: 21600; originalUntil?: number; executionUntil?: number;
    confirmedRenewalTransactionHash?: string;
  }>;
  readonly noteReplacement?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    supersededNote: Readonly<{ requestId: string; operationId: string; expiresAt: number; unsignedEnvelopeHash: string }>;
    supersededStep: Readonly<RehearsalStep>; replacementNoteRequestId: string; replacementNoteOperationId: string; replacementNoteEntryId: string;
  }>;
  readonly budgetAmendment?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    doctorMaxFeeStroops: '100000000';
  } & ({ permissionMaxFeeStroops: '10000000'; remainingMaxFeeStroops: '320000000' } |
    { permissionMaxFeeStroops: '50000000'; remainingMaxFeeStroops: '400000000' })>;
  readonly aggregateBudget?: Readonly<RehearsalAggregateBudget>;
  readonly executionContinuation?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    executionWindowSeconds: 14400; executionNotAfter: 1792974600; previousUntil: number; executionUntil: number;
  }>;
  readonly pdfReplacement?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    supersededPdf: Readonly<{requestId: string; operationId: string; expiresAt: number; unsignedEnvelopeHash: string; signingHash: string}>;
    supersededStep: Readonly<RehearsalStep>; replacementPdfRequestId: string; replacementPdfOperationId: string; replacementPdfEntryId: string;
  }>;
  /** The first PDF replacement remains an immutable terminal-proof prerequisite. */
  readonly priorPdfReplacement?: RehearsalPolicy['pdfReplacement'];
  /** Raw11 preserves exactly the two earlier PDF replacement proofs, oldest first. */
  readonly priorPdfReplacements?: readonly NonNullable<RehearsalPolicy['pdfReplacement']>[];
  readonly completionContinuation?: Readonly<{
    amendmentId: string; preparedAt: number; approvedAt: number; basePlanHash: string; baseApprovalHash: string;
    previousUntil: number; previousDoctorValidUntil: number; executionWindowSeconds: 14400; doctorWindowSeconds: 604800;
    executionUntil: number; renewalMaxFeeStroops: '10000000'; previousAuthorization: RehearsalAuthorization;
  }>;
  readonly maintenanceContinuation?: Readonly<{
    amendmentId: string; approvedAt: number; until: number; requestId: string; source: string;
    maxFeeStroops: '20000000'; keys: readonly string[]; keysSha256: string; footprintSha256: string; attemptFile: string;
  }>;
  readonly resumeContinuation?: Readonly<{
    amendmentId:string; preparedAt:number; approvedAt:number; basePlanFile:string; basePlanHash:string; baseApprovalFile:string; baseApprovalHash:string;
    previousUntil:number; executionWindowSeconds:14400; executionUntil:number; receiptEvidenceFile:string; receiptEvidenceSha256:string;
    maintenanceActualPaidStroops:'13762544';
  }>;
  readonly expiredPdfRecovery?: Readonly<{amendmentId:string;preparedAt:number;approvedAt:number;basePlanHash:string;baseApprovalHash:string;baseFinancialUntil:number;priorPdfProofCount:3;evidenceFile:string;evidenceSha256:string}>;
  readonly reopenedPdfRecovery?: Readonly<{amendmentId:string;preparedAt:number;approvedAt:number;sourceRecoveryHash:string;originalFinancialUntil:number;executionUntil:number;approvalNotAfter:number}>;
  readonly recoveredReopenedPdf?: Readonly<{amendmentId:string;preparedAt:number;approvedAt:number;sourceApprovedAt:number;executionUntil:number;priorPdfProofCount:4;evidenceFile:string;evidenceSha256:string}>;
  readonly maintenanceThree?: RehearsalMaintenanceThree;
  readonly approvalHash?: string;
  /** SHA-256 of the exact approved manifest bytes; non-enumerable metadata. */
  readonly policyHash: string;
}
/** Numeric temporal calculation only; does not confer any policy or signing authority. */
export function rehearsalContinuationUntil(window: { preparedAt: number; approvedAt: number; now: number; previousUntil: number; doctorValidUntil: number; executionWindowSeconds: 14400; executionNotAfter: 1792974600 }): number;
export function rehearsalCompletionWindow(window: {preparedAt: number; approvedAt: number; now: number; previousUntil: number; previousDoctorValidUntil: number; executionWindowSeconds: 14400; doctorWindowSeconds: 604800}): Readonly<{createdAt: number; until: number; doctorValidUntil: number}>;
export function rehearsalConfigured(env?: Record<string, string | undefined>): boolean;
export function loadRehearsalPolicy(options?: { env?: Record<string, string | undefined>; now?: number; requireApproval?: boolean; previewApproval?: RehearsalApproval }): RehearsalPolicy | null;
export function assertRehearsalAggregateBudget(policy: RehearsalPolicy, options?: { now?: number; step?: RehearsalStep }): Readonly<RehearsalAggregateBudget>;
export function assertRehearsalActor(policy: RehearsalPolicy, actor: Pick<RehearsalActor, 'userId' | 'walletId' | 'address'>): 'patient' | 'doctor';
export function rehearsalStep(policy: RehearsalPolicy, actor: Pick<RehearsalActor, 'userId' | 'walletId' | 'address'>, input: unknown): RehearsalStep;
export function assertRehearsalFee(policy: RehearsalPolicy, step: RehearsalStep, quote: { feeStroops: string | bigint; maxTime: number; source: string; now?: number }): bigint;
export function canonicalJSON(value: unknown): string;
export function payloadHash(value: unknown): string;

/** Immutable public scope descriptor only; no execution authority. */
export function rehearsalMaintenanceDescriptor(): Readonly<{requestId: string; source: string; maxFeeStroops: '20000000'; keys: readonly string[]; keysSha256: string; footprintSha256: string}>;
/** Approved schema13 object only, within its original four-hour window. */
export function assertRehearsalMaintenanceBudget(policy: RehearsalPolicy, options?: {now?: number}): NonNullable<RehearsalPolicy['maintenanceContinuation']>;

export interface RehearsalMaintenanceThree {
  readonly requestId:string; readonly source:string; readonly maxFeeStroops:'6237456'; readonly keys:readonly string[];
  readonly keysSha256:string; readonly footprintSha256:string; readonly attemptFile:string; readonly attemptRunId:string; readonly attemptOperation:'restorec2proofs';
}
/** Pure time arithmetic without approval or execution authority. */
export function rehearsalResumeWindow(window:{preparedAt:number;approvedAt:number;now:number;previousUntil:number;doctorValidUntil:number;executionWindowSeconds:14400}):number;
/** Static preparation data only; never grants authority. */
export function rehearsalMaintenanceThreeDescriptor():Readonly<RehearsalMaintenanceThree>;
/** A null digest is deliberately incomplete and cannot be loaded or activated. */
export function rehearsalResumeManifest(input:{amendmentId:string;preparedAt:number;receiptEvidenceFile:string;receiptEvidenceSha256?:string|null}):Readonly<{
  schemaVersion:14; amendmentId:string; preparedAt:number; basePlanFile:string; basePlanHash:string; baseApprovalFile:string; baseApprovalHash:string;
  executionWindowSeconds:14400; receiptEvidenceFile:string; receiptEvidenceSha256:string|null; maintenanceThree:RehearsalMaintenanceThree;
}>;
export function assertRehearsalResumeBudget(policy:RehearsalPolicy,options?:{now?:number;step?:RehearsalStep}):NonNullable<RehearsalPolicy['resumeContinuation']>;
export function assertRehearsalCompletionMaintenance(policy:RehearsalPolicy,options?:{now?:number}):RehearsalMaintenanceThree;
export const assertRehearsalMaintenanceThreeBudget:typeof assertRehearsalCompletionMaintenance;
/** Inert raw15 replacement: same raw14 deadline and caps; separate own approval required. */
export function rehearsalExpiredPdfRecoveryManifest(input:{amendmentId:string;preparedAt:number;replacementPdfRequestId:string;replacementPdfOperationId:string}):Readonly<{schemaVersion:15;amendmentId:string;preparedAt:number;basePlanFile:string;basePlanHash:string;baseApprovalFile:string;baseApprovalHash:string;replacementPdfRequestId:string;replacementPdfOperationId:string;supersededPdf:NonNullable<RehearsalPolicy['pdfReplacement']>['supersededPdf'];expiredPdfEvidenceFile:string;expiredPdfEvidenceSha256:string}>;

/** Inert schema16 preparation; no execution authority without its own approval. */
export function rehearsalReopenedPdfRecoveryManifest(input:{amendmentId:string;preparedAt:number;doctorValidUntil:number}):Readonly<{schemaVersion:16;amendmentId:string;preparedAt:number;sourceRecoveryFile:string;sourceRecoveryHash:string;executionWindowSeconds:14400;approvalNotAfter:number}>;

/** Exact terminal raw16 PDF replacement; own approval required, original window retained. */
export function rehearsalRecoveredReopenedPdfManifest(input:{amendmentId:string;preparedAt:number;replacementPdfRequestId:string;replacementPdfOperationId:string}):Readonly<{schemaVersion:17;amendmentId:string;preparedAt:number;replacementPdfRequestId:string;replacementPdfOperationId:string}>;

export function rehearsalNeverSubmittedPdfManifest(input:{amendmentId:string;preparedAt:number;replacementPdfRequestId:string;replacementPdfOperationId:string;expiredSignedEvidenceSha256:string}):Readonly<{schemaVersion:18;amendmentId:string;preparedAt:number;replacementPdfRequestId:string;replacementPdfOperationId:string;expiredSignedEvidenceSha256:string}>;

export function assertRehearsalRestoredCompletion(policy:RehearsalPolicy,options?:{now?:number;step?:RehearsalStep}):NonNullable<RehearsalPolicy['restoredCompletion']>;
