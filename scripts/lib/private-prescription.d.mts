export interface PrivatePrescriptionPayload {
  schemaVersion:number; network:string; contractId:string; doctor:string; patient:string;
  issuanceId:string; expiresAt:number; document:Record<string,unknown>; blinding:string;
}
export function prescriptionCommitment(value:unknown):string;
export function encryptPrescription(value:unknown,key:string,context:string):string;
export function decryptPrescription(ciphertext:string,key:string,context:string):PrivatePrescriptionPayload;
