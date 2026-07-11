/**
 * Patient portal — types, status configs, and mock data.
 * No JSX, no client deps.
 */

export interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export type MockRx = {
  id: number;
  medication: string;
  dosage: string;
  form: string;
  units_total: number;
  balance: number;
  status: string;
  issued: string;
  expires: string;
  rx_hash: string;
  doctor: string;
};

export type MockLicense = {
  id: number;
  type: string;
  days: number;
  start: string;
  end: string;
  status: string;
  doctor: string;
  hash: string;
};

export interface AuthorizedDoctor {
  wallet: string;
  name: string;
  specialty: string;
  grantedAt: string;
  verified: boolean;
}

export const MOCK_RX_STATUS_CONFIG: Record<string, StatusConfig> = {
  Active: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  PartiallyDispensed: { label: "Parcialmente dispensada", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  Burned: { label: "Dispensada", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  Revoked: { label: "Revocada", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  Blocked: { label: "Bloqueada", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  Registered: { label: "Registrada", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
};

export const LICENSE_STATUS_CONFIG: Record<string, StatusConfig> = {
  Activa: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  Vencida: { label: "Vencida", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  "En revisión": { label: "En revisión", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
};

export const MOCK_FICHA = {
  bloodType: "A+",
  allergies: ["Penicilina", "AINES (ibuprofeno)"],
  conditions: [
    { label: "Hipertensión arterial", since: "2021", controlled: true },
    { label: "Hipotiroidismo", since: "2019", controlled: true },
  ],
  lastVisit: "2026-06-18",
  nextAppointment: "2026-07-22",
  primaryDoctor: "Dra. Valentina Reyes",
  primaryDoctorSpecialty: "Medicina Interna",
  height: "165 cm",
  weight: "68 kg",
  bmi: "25.0",
  vaccinations: [
    { name: "COVID-19 (bivalente)", date: "2025-10" },
    { name: "Influenza", date: "2026-04" },
    { name: "Hepatitis B", date: "2022-08" },
  ],
};

export const MOCK_RX: MockRx[] = [
  { id: 1, medication: "Amoxicilina", dosage: "500mg", form: "Cápsulas", units_total: 30, balance: 18, status: "Active", issued: "2026-06-15", expires: "2026-07-15", rx_hash: "a3f8c2e1b9d4f7e2", doctor: "Dr. Ramírez" },
  { id: 2, medication: "Ibuprofeno", dosage: "400mg", form: "Comprimidos", units_total: 20, balance: 0, status: "Burned", issued: "2026-05-20", expires: "2026-06-20", rx_hash: "9c7b1d3e5f2a8b6c", doctor: "Dra. Chen" },
  { id: 3, medication: "Metformina", dosage: "850mg", form: "Comprimidos", units_total: 90, balance: 45, status: "PartiallyDispensed", issued: "2026-06-01", expires: "2026-09-01", rx_hash: "f1e4a8b3c2d7e9f0", doctor: "Dr. Ramírez" },
];

export const MOCK_LICENSES: MockLicense[] = [
  { id: 1, type: "Enfermedad común", days: 7, start: "2026-06-10", end: "2026-06-17", status: "Vencida", doctor: "Dr. Ramírez", hash: "b2c5f8a1d3e6f9c2" },
  { id: 2, type: "Accidente laboral", days: 14, start: "2026-07-01", end: "2026-07-15", status: "Activa", doctor: "Dra. Chen", hash: "e7d3a9c4f2b1e8a5" },
];

export const MOCK_AUTHORIZED_DOCTORS: AuthorizedDoctor[] = [
  {
    wallet: "GBQD7XK2Q9YAV4RPLM8W6H5T1BUFS0DQKX9ZE7NR",
    name: "Dra. Valentina Reyes",
    specialty: "Medicina Interna",
    grantedAt: "2026-05-10",
    verified: true,
  },
  {
    wallet: "GCMK8P2NJZR5HVQA3DLM7W4F6C9BUFS0DQKX9ZE7",
    name: "Dr. Carlos Muñoz",
    specialty: "Cardiología",
    grantedAt: "2026-06-02",
    verified: true,
  },
];
