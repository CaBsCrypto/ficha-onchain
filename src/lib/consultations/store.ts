/**
 * In-memory consultation store.
 *
 * Each consultation represents a scheduled telemedicine session:
 * one Google Meet space + optional prescription link + metadata.
 *
 * ⚠️  Production note: replace with Vercel KV / Upstash Redis so data
 * survives server restarts and scales across instances.
 */
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsultationStatus = "scheduled" | "completed";

export interface Consultation {
  id: string;
  doctorWallet: string;
  patientWallet?: string;
  /** Full Meet join URL (https://meet.google.com/…) */
  meetLink: string;
  /** Short meeting code shown to the patient (e.g. "abc-defg-hij") */
  meetingCode: string;
  /** Internal Meet resource name ("spaces/…") */
  spaceName: string;
  /** Unix timestamp (ms) for the scheduled start; undefined = ASAP */
  scheduledAt?: number;
  notes?: string;
  status: ConsultationStatus;
  createdAt: number;
  /** Soroban prescription ID linked after the rx is issued */
  rxId?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = new Map<string, Consultation>();

export function createConsultation(
  data: Omit<Consultation, "id" | "createdAt" | "status">,
): Consultation {
  const consultation: Consultation = {
    ...data,
    id: randomUUID(),
    status: "scheduled",
    createdAt: Date.now(),
  };
  store.set(consultation.id, consultation);
  return consultation;
}

export function getConsultation(id: string): Consultation | undefined {
  return store.get(id);
}

export function updateConsultation(
  id: string,
  patch: Partial<Omit<Consultation, "id" | "createdAt">>,
): Consultation | undefined {
  const existing = store.get(id);
  if (!existing) return undefined;
  const updated: Consultation = { ...existing, ...patch };
  store.set(id, updated);
  return updated;
}

export function listConsultationsByDoctor(doctorWallet: string): Consultation[] {
  return [...store.values()]
    .filter((c) => c.doctorWallet === doctorWallet)
    .sort((a, b) => b.createdAt - a.createdAt);
}
