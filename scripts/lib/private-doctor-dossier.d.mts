export interface DoctorDossier {
  schemaVersion: 1; network: 'testnet'; contractId: string; wallet: string;
  version: number; validUntil: number; fullName: string; license: string;
  specialty: string; verificationSource: string; reviewedBy: string;
  reviewedAt: string; blinding: string;
}
export function commitmentFor(dossier: DoctorDossier): string;
export function encryptDossier<T extends object>(dossier: T, key: string, context: string): string;
export function decryptDossier<T = DoctorDossier>(encoded: string, key: string, context: string): T;
