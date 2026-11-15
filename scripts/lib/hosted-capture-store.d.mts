export type HostedCapturePhase = 'create' | 'grant-note' | 'pdf' | 'appointment' | 'attest' | 'issuance' | 'close';
export interface HostedCaptureActor { userId: string; walletId: string; address: string }
export interface HostedCaptureSnapshot {
  phase: HostedCapturePhase;
  sha256: string;
  bytes: Buffer;
  approvalSha256: string | null;
  approvedAt: number | null;
  expiresAt: number;
  baseSha256: string | null;
  baseBytes: Buffer | null;
  predecessorSha256: string | null;
  baseReceiptHash: string | null;
  runId: string;
  patient: HostedCaptureActor;
  doctor: HostedCaptureActor;
  relayer: string;
  historyId: string;
  doctorId: number;
  origin: string;
  active: boolean;
}
export interface HostedCaptureClient {
  query(statement: string, values?: any[]): Promise<{rows: any[]}>;
}
export interface HostedCaptureEnvironment { origin: string; connectionString: string; directConnectionString: string }
export const HOSTED_CAPTURE_ORIGIN: string;
export function hostedCaptureWebConfigured(env?: NodeJS.ProcessEnv): boolean;
export function assertHostedCaptureWeb(env?: NodeJS.ProcessEnv): HostedCaptureEnvironment;
export function assertHostedCaptureOperator(env?: NodeJS.ProcessEnv): HostedCaptureEnvironment;
export function assertRegularAppointmentWeb(env?: NodeJS.ProcessEnv): HostedCaptureEnvironment;
export function assertRegularClinicalWeb(env?: NodeJS.ProcessEnv): HostedCaptureEnvironment;
export function readHostedCaptureActive(client: HostedCaptureClient): Promise<HostedCaptureSnapshot | null>;
export function readHostedCaptureBySha(client: HostedCaptureClient, sha256: string): Promise<HostedCaptureSnapshot | null>;
export function readHostedCaptureByRequest(client: HostedCaptureClient, requestId: string): Promise<HostedCaptureSnapshot | null>;
export function lockHostedCaptureShared(client: HostedCaptureClient): Promise<void>;
export function lockHostedCaptureMutation(client: HostedCaptureClient, phase: HostedCapturePhase, sha256: string): Promise<HostedCaptureSnapshot>;
export function lockHostedCaptureRecovery(client: HostedCaptureClient, requestId: string, sha256: string): Promise<HostedCaptureSnapshot>;
export function lockHostedCaptureSession(client: HostedCaptureClient, phase: HostedCapturePhase, sha256: string): Promise<() => Promise<void>>;
export function lockHostedCaptureRecoverySession(client: HostedCaptureClient, requestId: string, sha256: string): Promise<() => Promise<void>>;
export function recordHostedCaptureVerification(client: HostedCaptureClient, sha256: string): Promise<void>;
