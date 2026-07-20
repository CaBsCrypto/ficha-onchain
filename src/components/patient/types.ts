import type { OnChainPrescription, WithExpiry } from "@/lib/stellar";

// Real on-chain prescription enriched with expiry metadata.
export type PatientRx = WithExpiry<OnChainPrescription>;

// ---------------------------------------------------------------------------
// Authorized doctors (grants)
// ---------------------------------------------------------------------------
export interface AuthorizedDoctor {
  wallet: string;
  name: string;
  specialty: string;
  grantedAt: string;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Ficha médica
// ---------------------------------------------------------------------------
export interface HealthRecord {
  patient_email:            string;
  blood_type:               string | null;
  height_cm:                string | null;
  weight_kg:                string | null;
  bmi:                      string | null;
  allergies:                string[];
  conditions:               { label: string; since?: string; controlled?: boolean }[];
  vaccinations:             { name: string; date: string }[];
  primary_doctor:           string | null;
  primary_doctor_specialty: string | null;
  notes:                    string | null;
  full_name:                string | null;
  rut:                      string | null;
  birthdate:                string | null;
  phone:                    string | null;
  address:                  string | null;
  prevision:                string | null;
  emergency_contact:        string | null;
  updated_at:               string;
}

export interface ClinicalEntry {
  id: number;
  kind: string;
  summary: string;
  detail: string | null;
  content_hash: string;
  tx_hash: string | null;
  mode: string;
  created_at: string;
}

export const EMPTY_RECORD: Omit<HealthRecord, 'patient_email' | 'updated_at'> = {
  blood_type: null, height_cm: null, weight_kg: null, bmi: null,
  allergies: [], conditions: [], vaccinations: [],
  primary_doctor: null, primary_doctor_specialty: null, notes: null,
  full_name: null, rut: null, birthdate: null, phone: null,
  address: null, prevision: null, emergency_contact: null,
};

// ---------------------------------------------------------------------------
// Licencias médicas
// ---------------------------------------------------------------------------
export interface PatientDBLicense {
  id: number;
  doctor_email: string;
  patient_email: string | null;
  patient_name: string;
  patient_rut: string | null;
  fecha_inicio: string;
  dias: number;
  cie10: string;
  tipo: string;
  diagnostico: string | null;
  observaciones: string | null;
  status: 'draft' | 'signed' | 'expired';
  tx_hash: string | null;
  doc_hash: string | null;
  doc_id: number | null;
  mode: 'onchain' | 'simulated' | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Consultas / citas
// ---------------------------------------------------------------------------
export interface DBAppointment {
  id: number;
  doctor_email: string;
  patient_email: string;
  patient_name: string;
  date: string;
  time_slot: string;
  type: 'Presencial' | 'Telemedicina';
  motivo: string | null;
  notes: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  meet_link: string | null;
  started_at?: string | null;
  consent_tx?: string | null;
  consent_mode?: string | null;
  consent_wallet?: string | null;
  created_at: string;
}

export interface PublicDoctor {
  name: string;
  email: string;
  specialty: string | null;
  telemedicine: boolean;
  center_name: string | null;
}

export interface BookingSlot {
  time: string;
  available: boolean;
}
