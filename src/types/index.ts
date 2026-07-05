/**
 * Shared TypeScript types for ficha | onchain
 */

export type Language = "en" | "es";

/** Lifecycle status of an on-chain prescription (mirrors the Soroban contract). */
export type PrescriptionStatus = "active" | "dispensed" | "revoked" | "expired";

/** A blockchain-verified prescription record. */
export interface Prescription {
  /** Soulbound token id on Soroban. */
  id: string;
  doctorWallet: string;
  patientWallet: string;
  /** Keccak/sha hash of the encrypted FHIR payload. */
  rxHash: string;
  issuedAt: number;
  status: PrescriptionStatus;
}

/** A registered, credential-verified prescribing doctor. */
export interface Doctor {
  wallet: string;
  fullName: string;
  /** National medical license number. */
  licenseId: string;
  authorized: boolean;
}

/** Minimal patient profile shown on the on-chain card. */
export interface PatientProfile {
  fullName: string;
  wallet: string;
}

/** Waitlist signup payload. */
export interface WaitlistEntry {
  email: string;
  /** "doctor" | "patient" | undefined */
  role?: "doctor" | "patient";
  createdAt: number;
}
