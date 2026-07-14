// ── Shared types ──────────────────────────────────────────────────────────────
export type PatientStatus = 'Activo' | 'Nuevo' | 'Crónico';
export type ConsultationType = 'Presencial' | 'Telemedicina';
export type PrescriptionTipo = 'Simple' | 'Retenida' | 'Magistral';
export type PrescriptionStatus = 'Activa' | 'Dispensada' | 'Vencida';
export type LicenseTipo = 'Enfermedad' | 'Accidente' | 'Maternidad';
export type LicenseStatus = 'Emitida' | 'Validada' | 'Vencida';

export interface MockPatient {
  id: string;
  name: string;
  rut: string;
  lastVisit: string;
  status: PatientStatus;
  age: number;
  condition: string;
  email: string;
}

export interface MockConsultation {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: ConsultationType;
  motivo: string;
}

export interface MockPrescription {
  id: string;
  patientName: string;
  medication: string;
  tipo: PrescriptionTipo;
  fecha: string;
  status: PrescriptionStatus;
  concentracion: string;
  posologia: string;
}

export interface MockLicense {
  id: string;
  patientName: string;
  fechaInicio: string;
  dias: number;
  cie10: string;
  tipo: LicenseTipo;
  status: LicenseStatus;
}

// ── Mock data constants ───────────────────────────────────────────────────────
export const MOCK_PATIENTS: MockPatient[] = [
  { id: 'p1', name: 'María González R.',   rut: '12.345.678-5', lastVisit: '2026-07-10', status: 'Activo',  age: 52, condition: 'Hipertensión / Hipotiroidismo', email: 'maria@example.cl' },
  { id: 'p2', name: 'Roberto Silva P.',    rut: '9.876.543-2',  lastVisit: '2026-07-02', status: 'Crónico', age: 38, condition: 'Diabetes tipo 2',                email: 'roberto@example.cl' },
  { id: 'p3', name: 'Carmen Rojas M.',     rut: '14.222.333-1', lastVisit: '2026-06-25', status: 'Crónico', age: 67, condition: 'Artritis reumatoidea',           email: 'carmen@example.cl' },
  { id: 'p4', name: 'Diego Herrera F.',    rut: '16.789.012-K', lastVisit: '2026-07-13', status: 'Nuevo',   age: 29, condition: 'Evaluación inicial',             email: 'diego@example.cl' },
  { id: 'p5', name: 'Lucía Morales C.',    rut: '11.111.222-3', lastVisit: '2026-06-18', status: 'Activo',  age: 44, condition: 'Asma bronquial',                 email: 'lucia@example.cl' },
  { id: 'p6', name: 'Fernando Pinto V.',   rut: '8.765.432-1',  lastVisit: '2026-07-05', status: 'Nuevo',   age: 55, condition: 'Dolor lumbar crónico',           email: 'fernando@example.cl' },
];

export const MOCK_CONSULTATIONS: MockConsultation[] = [
  { id: 'c1', patientId: 'p1', patientName: 'María González R.',  date: '2026-07-14', time: '09:00', type: 'Presencial',   motivo: 'Control hipertensión' },
  { id: 'c2', patientId: 'p2', patientName: 'Roberto Silva P.',   date: '2026-07-14', time: '10:30', type: 'Telemedicina', motivo: 'Control diabetes — hemoglobina glicosilada' },
  { id: 'c3', patientId: 'p4', patientName: 'Diego Herrera F.',   date: '2026-07-14', time: '12:00', type: 'Presencial',   motivo: 'Primera consulta — evaluación general' },
];

export const MOCK_PRESCRIPTIONS: MockPrescription[] = [
  { id: 'rx1', patientName: 'María González R.',  medication: 'Enalapril 10 mg',        tipo: 'Simple',    fecha: '2026-07-10', status: 'Activa',     concentracion: '10 mg',  posologia: '1 comp. c/12h por 30 días' },
  { id: 'rx2', patientName: 'Roberto Silva P.',   medication: 'Metformina 850 mg',       tipo: 'Simple',    fecha: '2026-07-02', status: 'Dispensada', concentracion: '850 mg', posologia: '1 comp. c/8h con comidas' },
  { id: 'rx3', patientName: 'Carmen Rojas M.',    medication: 'Metotrexato 7,5 mg',      tipo: 'Retenida',  fecha: '2026-06-25', status: 'Activa',     concentracion: '7,5 mg', posologia: '1 comp. semanal' },
  { id: 'rx4', patientName: 'Lucía Morales C.',   medication: 'Budesonida 200 mcg',      tipo: 'Simple',    fecha: '2026-06-18', status: 'Vencida',    concentracion: '200 mcg', posologia: '2 inhalaciones c/12h' },
  { id: 'rx5', patientName: 'Fernando Pinto V.',  medication: 'Tramadol compuesto 37,5', tipo: 'Retenida',  fecha: '2026-07-05', status: 'Activa',     concentracion: '37,5 mg', posologia: '1 comp. c/8h por 7 días' },
];

export const MOCK_LICENSES: MockLicense[] = [
  { id: 'lic1', patientName: 'Roberto Silva P.',  fechaInicio: '2026-07-01', dias: 7,  cie10: 'E11.9', tipo: 'Enfermedad', status: 'Validada' },
  { id: 'lic2', patientName: 'Lucía Morales C.',  fechaInicio: '2026-06-20', dias: 5,  cie10: 'J45.0', tipo: 'Enfermedad', status: 'Vencida'  },
  { id: 'lic3', patientName: 'Fernando Pinto V.', fechaInicio: '2026-07-05', dias: 10, cie10: 'M54.5', tipo: 'Accidente',  status: 'Emitida'  },
];
