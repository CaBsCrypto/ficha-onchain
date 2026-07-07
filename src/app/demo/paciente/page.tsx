"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { truncateHash } from "@/lib/stellar";

/* -------------------------------------------------------------------------- */
/*  Demo data — hardcoded mock. NOT wired to the blockchain yet.               */
/* -------------------------------------------------------------------------- */

const PATIENT = {
  fullName: "Ana García",
  wallet: "GDE3XZ7K2Q9YAVN4RPLM8W6H5TJC1BUFS0DQKX9ZE7NRXYHG2VW1F3K2",
  rut: "12.345.678-9",
  birthDate: "14 mar 1985",
};

type DemoStatus = "active" | "revoked";

interface DemoRx {
  id: string;
  medication: string;
  dosage: string;
  doctor: string;
  license: string;
  specialty: string;
  institution: string;
  route: string; // vía de administración
  frequency: string;
  treatmentDuration: string;
  instructions: string;
  issuedAt: string; // display date
  block: string; // pseudo bloque Soroban
  status: DemoStatus;
  rxHash: string;
}

const PRESCRIPTIONS: DemoRx[] = [
  {
    id: "RX-2048",
    medication: "Amoxicilina 500 mg",
    dosage: "1 cápsula cada 8 h · 7 días",
    doctor: "Dra. Carolina Fuentes",
    license: "ICM 148-923",
    specialty: "Medicina General",
    institution: "Clínica Andes Salud",
    route: "Oral",
    frequency: "Cada 8 horas",
    treatmentDuration: "7 días",
    instructions:
      "Tomar con alimentos. Completar el tratamiento aunque los síntomas mejoren antes.",
    issuedAt: "2 jul 2026",
    block: "#5 481 902",
    status: "active",
    rxHash: "a3f9c7d2e1b84056f7a2c9d1e4b6803f5c1a9e72d8b40f16c3a7e9d215b8046f",
  },
  {
    id: "RX-2044",
    medication: "Cannabis medicinal (THC/CBD 1:1)",
    dosage: "0.5 g inhalado · máx 2 veces al día",
    doctor: "Dr. Ignacio Rivas",
    license: "ICM 097-441",
    specialty: "Medicina del Dolor",
    institution: "Centro de Manejo del Dolor Crónico",
    route: "Inhalado (vaporización)",
    frequency: "Máximo 2 veces al día",
    treatmentDuration: "30 días",
    instructions:
      "Iniciar con la dosis mínima efectiva. No conducir ni operar maquinaria tras la administración. Uso exclusivo bajo control médico.",
    issuedAt: "26 jun 2026",
    block: "#5 470 118",
    status: "active",
    rxHash: "e1b84056f7a2c9d1a3f9c7d2e4b6803f5c1a9e72d8b40f16c3a7e9d215b8046f",
  },
  {
    id: "RX-2039",
    medication: "Losartán 50 mg",
    dosage: "1 comprimido al día · continuo",
    doctor: "Dr. Ignacio Rivas",
    license: "ICM 097-441",
    specialty: "Medicina Interna",
    institution: "Centro Médico Cordillera",
    route: "Oral",
    frequency: "1 vez al día",
    treatmentDuration: "Tratamiento continuo",
    instructions:
      "Tomar a la misma hora cada día. Controlar la presión arterial semanalmente y registrar los valores.",
    issuedAt: "18 jun 2026",
    block: "#5 452 337",
    status: "active",
    rxHash: "7d1e4b6803f5c1a9e72d8b40f16c3a7e9d215b8046fa3f9c7d2e1b84056f7a2c",
  },
  {
    id: "RX-1987",
    medication: "Prednisona 20 mg",
    dosage: "1 comprimido al día · 5 días",
    doctor: "Dra. Carolina Fuentes",
    license: "ICM 148-923",
    specialty: "Medicina General",
    institution: "Clínica Andes Salud",
    route: "Oral",
    frequency: "1 vez al día",
    treatmentDuration: "5 días",
    instructions:
      "Tomar por la mañana junto con alimentos. No suspender de forma brusca sin indicación médica.",
    issuedAt: "3 may 2026",
    block: "#5 401 774",
    status: "revoked",
    rxHash: "c9d1e4b6803f5c1a9e72d8b4a3f9c7d20f16c3a7e9d215b8046fe1b84056f7a2",
  },
];

const STELLAR_EXPERT = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

/* -------------------------------------------------------------------------- */
/*  Clinical record mock — used by the "Ficha Clínica" section.                */
/* -------------------------------------------------------------------------- */

const CLINICAL = {
  age: 41,
  sex: "Femenino",
  bloodType: "A+",
  nationality: "Chilena",
  address: "Av. Providencia 1234, Depto 802, Providencia · Santiago, Chile",
  phone: "+56 9 8765 4321",
  emergencyContact: "Juan García (hermano) · +56 9 1234 5678",
  insurance: "Fonasa · Tramo B",
  updatedBy: "Dra. Valentina Reyes",
  updatedAt: "26 jun 2026",
  updateBlock: "#3.847.291",
  updateHash:
    "e1b84056f7a2c9d1a3f9c7d2e4b6803f5c1a9e72d8b40f16c3a7e9d215b8046f",
};

const CHRONIC: { name: string; since: string }[] = [
  { name: "Hipertensión arterial esencial", since: "2018" },
  { name: "Diabetes mellitus tipo 2", since: "2021" },
];

const SURGERIES: { name: string; year: string }[] = [
  { name: "Apendicectomía", year: "2015" },
  { name: "Colecistectomía laparoscópica", year: "2020" },
];

const HOSPITALIZATIONS: { date: string; reason: string; place: string }[] = [
  {
    date: "mar 2020",
    reason: "Colecistitis aguda · colecistectomía",
    place: "Clínica Andes Salud",
  },
  {
    date: "ago 2021",
    reason: "Descompensación glicémica",
    place: "Hospital El Carmen",
  },
];

type Severity = "Severa" | "Moderada" | "Leve";

const ALLERGIES: {
  kind: "Medicamento" | "Alimentaria";
  agent: string;
  reaction: string;
  severity: Severity;
}[] = [
  {
    kind: "Medicamento",
    agent: "Penicilina",
    reaction: "Reacción anafiláctica",
    severity: "Severa",
  },
  {
    kind: "Medicamento",
    agent: "AINEs",
    reaction: "Urticaria generalizada",
    severity: "Moderada",
  },
  {
    kind: "Alimentaria",
    agent: "Mariscos",
    reaction: "Edema facial",
    severity: "Moderada",
  },
];

const FAMILY: { relation: string; conditions: string }[] = [
  { relation: "Padre", conditions: "Diabetes tipo 2 · Hipertensión arterial" },
  { relation: "Madre", conditions: "Cáncer de mama (diagnosticado 2019)" },
  { relation: "Hermano", conditions: "Asma bronquial" },
];

type VaccineStatus = "Al día" | "Pendiente";

const VACCINES: {
  name: string;
  applied: string;
  next: string;
  status: VaccineStatus;
}[] = [
  { name: "COVID-19 (bivalente)", applied: "12 mar 2026", next: "12 mar 2027", status: "Al día" },
  { name: "Influenza estacional", applied: "5 abr 2026", next: "abr 2027", status: "Al día" },
  { name: "Tétano / difteria (dT)", applied: "20 jun 2019", next: "20 jun 2029", status: "Al día" },
  { name: "Hepatitis B", applied: "10 ene 2015", next: "Completa", status: "Al día" },
  { name: "Neumocócica (PCV13)", applied: "—", next: "Pendiente", status: "Pendiente" },
];

type VitalStatus = "Normal" | "Atención" | "Crítico";

const VITALS: {
  date: string;
  status: VitalStatus;
  items: { label: string; value: string; unit: string; status: VitalStatus }[];
} = {
  date: "15 jun 2026",
  status: "Normal",
  items: [
    { label: "Presión arterial", value: "128/82", unit: "mmHg", status: "Atención" },
    { label: "Frecuencia cardíaca", value: "74", unit: "lpm", status: "Normal" },
    { label: "Peso", value: "68", unit: "kg", status: "Normal" },
    { label: "Talla", value: "165", unit: "cm", status: "Normal" },
    { label: "IMC", value: "25,0", unit: "kg/m²", status: "Atención" },
    { label: "Saturación O₂", value: "98", unit: "%", status: "Normal" },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Historial de atenciones mock                                               */
/* -------------------------------------------------------------------------- */

type ApptType = "Consulta" | "Control" | "Urgencia" | "Teleconsulta";

interface Atencion {
  id: string;
  date: string;
  doctor: string;
  specialty: string;
  type: ApptType;
  diagnosis: string;
  institution: string;
  rxId?: string;
  hash: string;
  summary: string;
}

const ATENCIONES: Atencion[] = [
  {
    id: "AT-3120",
    date: "2 jul 2026",
    doctor: "Dra. Carolina Fuentes",
    specialty: "Medicina General",
    type: "Consulta",
    diagnosis: "Faringoamigdalitis aguda",
    institution: "Clínica Andes Salud",
    rxId: "RX-2048",
    hash: "a3f9c7…5b8046f",
    summary:
      "Consulta por odinofagia y fiebre de 2 días. Examen físico compatible con faringoamigdalitis bacteriana. Se indica antibioterapia y reposo relativo por 48 h.",
  },
  {
    id: "AT-3098",
    date: "26 jun 2026",
    doctor: "Dr. Ignacio Rivas",
    specialty: "Medicina del Dolor",
    type: "Control",
    diagnosis: "Dolor lumbar crónico refractario",
    institution: "Centro de Manejo del Dolor Crónico",
    rxId: "RX-2044",
    hash: "e1b840…d215b8",
    summary:
      "Control de dolor crónico con respuesta parcial a terapia previa. Se ajusta esquema analgésico e inicia cannabis medicinal THC/CBD 1:1 bajo control estricto.",
  },
  {
    id: "AT-3071",
    date: "20 jun 2026",
    doctor: "Dra. Valentina Reyes",
    specialty: "Medicina Interna",
    type: "Control",
    diagnosis: "Control metabólico y presión arterial",
    institution: "Centro Médico Cordillera",
    hash: "7d1e4b…56f7a2",
    summary:
      "Control de rutina. Signos vitales dentro de rango. Se solicitan hemograma, perfil bioquímico y HbA1c. Buena adherencia a tratamiento.",
  },
  {
    id: "AT-3055",
    date: "18 jun 2026",
    doctor: "Dr. Ignacio Rivas",
    specialty: "Medicina Interna",
    type: "Control",
    diagnosis: "Hipertensión arterial esencial",
    institution: "Centro Médico Cordillera",
    rxId: "RX-2039",
    hash: "f16c3a…9c7d2e",
    summary:
      "Renovación de terapia antihipertensiva con Losartán 50 mg. Presión arterial controlada. Se refuerza medición domiciliaria.",
  },
  {
    id: "AT-3022",
    date: "3 jun 2026",
    doctor: "Dr. Andrés Peña",
    specialty: "Cardiología",
    type: "Teleconsulta",
    diagnosis: "Evaluación cardiovascular preventiva",
    institution: "TrustLeaf Telemedicina",
    hash: "b46f5c…1a9e72",
    summary:
      "Teleconsulta de evaluación de riesgo cardiovascular. Electrocardiograma sin hallazgos agudos. Se recomienda actividad física regular y control en 6 meses.",
  },
  {
    id: "AT-2988",
    date: "22 may 2026",
    doctor: "Dra. Carolina Fuentes",
    specialty: "Medicina General",
    type: "Consulta",
    diagnosis: "Dermatitis de contacto",
    institution: "Clínica Andes Salud",
    hash: "8b40f1…3a7e9d",
    summary:
      "Lesiones eritematosas pruriginosas en antebrazo derecho. Se indica manejo tópico y evitar el alérgeno sospechoso. Control si no mejora en 10 días.",
  },
  {
    id: "AT-2950",
    date: "3 may 2026",
    doctor: "Dra. Carolina Fuentes",
    specialty: "Medicina General",
    type: "Urgencia",
    diagnosis: "Crisis asmática leve",
    institution: "Clínica Andes Salud",
    rxId: "RX-1987",
    hash: "215b80…f7a2c9",
    summary:
      "Ingreso a urgencia por disnea y sibilancias. Manejo con broncodilatadores y corticoide sistémico. Evolución favorable, se otorga alta con indicaciones.",
  },
  {
    id: "AT-2901",
    date: "15 abr 2026",
    doctor: "Dra. Sofía Herrera",
    specialty: "Nutrición",
    type: "Control",
    diagnosis: "Control nutricional — Diabetes tipo 2",
    institution: "Centro Médico Cordillera",
    hash: "046fa3…7d2e1b",
    summary:
      "Reevaluación de plan alimentario. Reducción de 2 kg respecto al control previo. Se ajustan porciones de carbohidratos y se refuerza actividad física.",
  },
  {
    id: "AT-2854",
    date: "28 mar 2026",
    doctor: "Dr. Ignacio Rivas",
    specialty: "Medicina Interna",
    type: "Control",
    diagnosis: "Diabetes mellitus tipo 2",
    institution: "Centro Médico Cordillera",
    hash: "9e72d8…40f16c",
    summary:
      "HbA1c en descenso respecto al control anterior. Se mantiene esquema hipoglicemiante actual. Buena tolerancia, sin hipoglicemias reportadas.",
  },
  {
    id: "AT-2810",
    date: "10 mar 2026",
    doctor: "Vacunatorio TrustLeaf",
    specialty: "Medicina Preventiva",
    type: "Consulta",
    diagnosis: "Refuerzo COVID-19 (bivalente)",
    institution: "Vacunatorio TrustLeaf",
    hash: "5c1a9e…d215b8",
    summary:
      "Administración de dosis de refuerzo COVID-19 bivalente. Sin reacciones adversas inmediatas. Se registra en carnet de vacunas on-chain.",
  },
  {
    id: "AT-2766",
    date: "20 feb 2026",
    doctor: "Dra. Valentina Reyes",
    specialty: "Medicina Interna",
    type: "Consulta",
    diagnosis: "Chequeo preventivo anual",
    institution: "Centro Médico Cordillera",
    hash: "3a7e9d…b8046f",
    summary:
      "Chequeo general anual. Examen físico normal. Se solicitan exámenes de laboratorio e imágenes de control como parte del programa preventivo.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Exámenes mock                                                              */
/* -------------------------------------------------------------------------- */

type ExamState = "Resultado disponible" | "En proceso" | "Pendiente";
type ExamResult = "Normal" | "Alterado" | null;

interface Exam {
  id: string;
  name: string;
  date: string;
  orderedBy: string;
  state: ExamState;
  result: ExamResult;
  detail?: string;
  isNew?: boolean;
}

const EXAMS: Exam[] = [
  { id: "EX-4501", name: "Hemograma completo", date: "10 jun 2026", orderedBy: "Dra. Valentina Reyes", state: "Resultado disponible", result: "Normal" },
  { id: "EX-4502", name: "Hemoglobina glicosilada (HbA1c)", date: "10 jun 2026", orderedBy: "Dr. Ignacio Rivas", state: "Resultado disponible", result: "Alterado", detail: "7,2 %" },
  { id: "EX-4503", name: "Perfil lipídico", date: "10 jun 2026", orderedBy: "Dra. Valentina Reyes", state: "Resultado disponible", result: "Normal" },
  { id: "EX-4504", name: "Creatinina sérica", date: "10 jun 2026", orderedBy: "Dra. Valentina Reyes", state: "Resultado disponible", result: "Normal" },
  { id: "EX-4505", name: "Orina completa", date: "10 jun 2026", orderedBy: "Dra. Valentina Reyes", state: "Resultado disponible", result: "Normal" },
  { id: "EX-4478", name: "Ecografía abdominal", date: "15 may 2026", orderedBy: "Dr. Andrés Peña", state: "Resultado disponible", result: "Normal" },
  { id: "EX-4460", name: "Presión arterial ambulatoria (MAPA)", date: "2 may 2026", orderedBy: "Dr. Ignacio Rivas", state: "Resultado disponible", result: "Alterado", detail: "HTA controlada" },
  { id: "EX-4455", name: "Radiografía de tórax (AP)", date: "3 abr 2026", orderedBy: "Dra. Carolina Fuentes", state: "Resultado disponible", result: "Normal" },
];

/* -------------------------------------------------------------------------- */
/*  Exam result reports — detailed mock lab data, keyed by exam id.            */
/* -------------------------------------------------------------------------- */

type AnalyteStatus = "Normal" | "Alto" | "Bajo" | "Alterado";

interface AnalyteRow {
  name: string;
  value: string;
  unit?: string;
  ref: string;
  status: AnalyteStatus;
}

type ReportBlock =
  | { kind: "analytes"; title?: string; rows: AnalyteRow[] }
  | { kind: "narrative"; title?: string; text: string }
  | { kind: "hba1c"; value: number }
  | {
      kind: "metrics";
      title?: string;
      items: { label: string; value: string; status: AnalyteStatus }[];
    };

interface ExamReport {
  institution: string; // dónde se solicitó
  lab: string; // quién emitió el resultado
  hash: string;
  blocks: ReportBlock[];
  conclusion: string;
}

const REPORTS: Record<string, ExamReport> = {
  "EX-4501": {
    institution: "Centro Médico Cordillera",
    lab: "Laboratorio Clínico BioAndes",
    hash: "a3f9c7d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00",
    conclusion: "Hemograma dentro de rangos normales. Sin hallazgos relevantes.",
    blocks: [
      {
        kind: "analytes",
        title: "Serie roja, serie blanca y plaquetas",
        rows: [
          { name: "Glóbulos rojos", value: "4,8", unit: "M/μL", ref: "4,2 – 5,4", status: "Normal" },
          { name: "Hemoglobina", value: "14,2", unit: "g/dL", ref: "12,0 – 15,5", status: "Normal" },
          { name: "Hematocrito", value: "42", unit: "%", ref: "36 – 46", status: "Normal" },
          { name: "VCM", value: "88", unit: "fL", ref: "80 – 100", status: "Normal" },
          { name: "Leucocitos", value: "6.800", unit: "/μL", ref: "4.000 – 11.000", status: "Normal" },
          { name: "Neutrófilos", value: "58", unit: "%", ref: "40 – 70", status: "Normal" },
          { name: "Linfocitos", value: "32", unit: "%", ref: "20 – 45", status: "Normal" },
          { name: "Plaquetas", value: "245.000", unit: "/μL", ref: "150.000 – 450.000", status: "Normal" },
        ],
      },
    ],
  },
  "EX-4502": {
    institution: "Centro Médico Cordillera",
    lab: "Laboratorio Clínico BioAndes",
    hash: "b1e8d2d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff01",
    conclusion:
      "Control glucémico subóptimo. Se recomienda ajuste de tratamiento y control en 3 meses.",
    blocks: [{ kind: "hba1c", value: 7.2 }],
  },
  "EX-4503": {
    institution: "Centro Médico Cordillera",
    lab: "Laboratorio Clínico BioAndes",
    hash: "c7a4f1d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff02",
    conclusion: "Perfil lipídico dentro de rangos aceptables.",
    blocks: [
      {
        kind: "analytes",
        rows: [
          { name: "Colesterol total", value: "185", unit: "mg/dL", ref: "< 200", status: "Normal" },
          { name: "Colesterol LDL", value: "112", unit: "mg/dL", ref: "< 130", status: "Normal" },
          { name: "Colesterol HDL", value: "52", unit: "mg/dL", ref: "> 40", status: "Normal" },
          { name: "Triglicéridos", value: "145", unit: "mg/dL", ref: "< 150", status: "Normal" },
        ],
      },
    ],
  },
  "EX-4504": {
    institution: "Centro Médico Cordillera",
    lab: "Laboratorio Clínico BioAndes",
    hash: "d2b9e6d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff03",
    conclusion: "Función renal conservada.",
    blocks: [
      {
        kind: "analytes",
        rows: [
          { name: "Creatinina sérica", value: "0,82", unit: "mg/dL", ref: "0,5 – 1,1", status: "Normal" },
          { name: "TFG estimada (CKD-EPI)", value: "78", unit: "mL/min/1,73m²", ref: "≥ 90", status: "Bajo" },
        ],
      },
      {
        kind: "narrative",
        title: "Interpretación",
        text: "TFG compatible con Estadio G2 — función renal levemente disminuida, sin repercusión clínica actual. Se sugiere control periódico.",
      },
    ],
  },
  "EX-4505": {
    institution: "Centro Médico Cordillera",
    lab: "Laboratorio Clínico BioAndes",
    hash: "e6c1a8d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff04",
    conclusion: "Sin hallazgos patológicos.",
    blocks: [
      {
        kind: "analytes",
        title: "Examen físico-químico y sedimento",
        rows: [
          { name: "Color", value: "Amarillo claro", ref: "Amarillo", status: "Normal" },
          { name: "Aspecto", value: "Claro", ref: "Claro", status: "Normal" },
          { name: "pH", value: "6,0", ref: "4,5 – 8,0", status: "Normal" },
          { name: "Densidad", value: "1,018", ref: "1,005 – 1,030", status: "Normal" },
          { name: "Proteínas", value: "Negativo", ref: "Negativo", status: "Normal" },
          { name: "Glucosa", value: "Negativo", ref: "Negativo", status: "Normal" },
          { name: "Leucocitos", value: "0 – 2", unit: "/campo", ref: "0 – 5", status: "Normal" },
          { name: "Hematíes", value: "0 – 1", unit: "/campo", ref: "0 – 3", status: "Normal" },
          { name: "Nitritos", value: "Negativo", ref: "Negativo", status: "Normal" },
        ],
      },
    ],
  },
  "EX-4478": {
    institution: "Centro Médico Cordillera",
    lab: "Centro de Imagenología Cordillera",
    hash: "f3d7b2d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff05",
    conclusion: "Ecografía abdominal sin alteraciones.",
    blocks: [
      {
        kind: "narrative",
        title: "Hallazgos",
        text: "Hígado de tamaño y ecoestructura normal. Vesícula biliar sin litiasis. Páncreas no valorable por gas. Bazo homogéneo. Riñones de aspecto normal bilateral. Sin líquido libre.",
      },
    ],
  },
  "EX-4460": {
    institution: "Centro Médico Cordillera",
    lab: "Unidad de Cardiología · Centro Médico Cordillera",
    hash: "9a2e7cd4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff06",
    conclusion:
      "HTA de grado 1 confirmada. Patrón non-dipper. Se recomienda ajuste de medicación antihipertensiva.",
    blocks: [
      {
        kind: "metrics",
        title: "Monitoreo ambulatorio de presión arterial (24 h)",
        items: [
          { label: "Promedio 24 h", value: "138/88 mmHg", status: "Alterado" },
          { label: "Promedio diurno", value: "142/91 mmHg", status: "Alterado" },
          { label: "Promedio nocturno", value: "128/82 mmHg", status: "Normal" },
          { label: "Carga sistólica diurna", value: "68 %", status: "Alto" },
          { label: "Carga sistólica nocturna", value: "45 %", status: "Alto" },
          { label: "Patrón circadiano", value: "Non-dipper (<10%)", status: "Alterado" },
        ],
      },
    ],
  },
  "EX-4455": {
    institution: "Clínica Andes Salud",
    lab: "Unidad de Imagenología · Clínica Andes Salud",
    hash: "4c8f1dd4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff07",
    conclusion: "Radiografía de tórax sin alteraciones significativas.",
    blocks: [
      {
        kind: "narrative",
        title: "Hallazgos",
        text: "Silueta cardíaca de tamaño normal. Índice cardiotorácico 0,45. Hilios vasculares normales. Parénquima pulmonar sin opacidades. Senos costofrénicos libres. Tráquea centrada.",
      },
    ],
  },
  "EX-4520": {
    institution: "Auto-subido por la paciente",
    lab: "TrustLeaf AI · Lectura OCR",
    hash: "7f1c9a3e5d2b48067a1c9d3e5f7089ab112233445566778899aabbccddeeff08",
    conclusion:
      "Deficiencia de vitamina D. Se recomienda suplementación y control en 3 meses.",
    blocks: [
      {
        kind: "analytes",
        rows: [
          { name: "Vitamina D (25-OH)", value: "18", unit: "ng/mL", ref: "30 – 100", status: "Bajo" },
        ],
      },
      {
        kind: "narrative",
        title: "Interpretación",
        text: "Nivel de 25-hidroxivitamina D compatible con deficiencia (<20 ng/mL). Puede afectar el metabolismo óseo y la sensibilidad a la insulina. Se sugiere suplementación con colecalciferol y recontrol en 3 meses.",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  Análisis IA mock — output simulado del agente que cruzó exámenes +         */
/*  antecedentes. NO conectado a un modelo real.                               */
/* -------------------------------------------------------------------------- */

interface AiFinding {
  lead: string;
  text: string;
}

const AI_ANALYSIS = {
  updatedAt: "10 jun 2026",
  examCount: 8,
  alerts: [
    {
      lead: "HbA1c 7,2 %",
      text: "Control glucémico subóptimo. Tu diabetes tipo 2 necesita revisión del tratamiento. El último valor hace 6 meses era 6,8 %: subió 0,4 %.",
    },
    {
      lead: "Patrón non-dipper en MAPA",
      text: "Tu presión arterial no baja lo suficiente durante la noche (descenso <10 %). Esto aumenta el riesgo cardiovascular nocturno.",
    },
  ] satisfies AiFinding[],
  observations: [
    {
      lead: "IMC 25,0",
      text: "Límite superior del rango saludable. Pequeños ajustes de peso podrían mejorar tanto la diabetes como la presión arterial.",
    },
    {
      lead: "Perfil lipídico estable",
      text: "LDL 112 mg/dL dentro de rango aceptable dado tu historial cardiovascular familiar.",
    },
  ] satisfies AiFinding[],
  positives: [
    {
      lead: "Función renal conservada (TFG 78 mL/min)",
      text: "Importante mantenerla dado el uso de antihipertensivos.",
    },
    {
      lead: "Hemograma completamente normal",
      text: "Sin signos de anemia ni infección.",
    },
  ] satisfies AiFinding[],
  recommendations: [
    "Consulta con endocrinólogo antes del 10 jul 2026 para revisar dosis de Metformina",
    "Control de presión ambulatoria en 3 meses",
    "Próxima HbA1c: sep 2026",
  ],
};

/* Exam produced by the "Subir resultado" flow. */
const UPLOADED_EXAM: Exam = {
  id: "EX-4520",
  name: "Vitamina D (25-OH)",
  date: "Hoy",
  orderedBy: "ti mismo",
  state: "Resultado disponible",
  result: "Alterado",
  detail: "18 ng/mL",
  isNew: true,
};

/* -------------------------------------------------------------------------- */
/*  Deterministic pseudo-QR — draws a realistic module grid from a seed.       */
/*  (No external lib; not a scannable code — visual placeholder for the demo.) */
/* -------------------------------------------------------------------------- */

function QrCode({ seed, size = 200 }: { seed: string; size?: number }) {
  const modules = 29;
  const cells = useMemo(() => {
    // Simple deterministic hash → bit per cell.
    const grid: boolean[][] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    for (let r = 0; r < modules; r++) {
      grid[r] = [];
      for (let c = 0; c < modules; c++) {
        h = (h * 1103515245 + 12345 + r * 97 + c * 131) >>> 0;
        grid[r][c] = ((h >> 8) & 1) === 1;
      }
    }
    return grid;
  }, [seed]);

  const unit = size / modules;

  // Finder pattern positions (top-left, top-right, bottom-left).
  const finders = [
    [0, 0],
    [0, modules - 7],
    [modules - 7, 0],
  ];
  const inFinder = (r: number, c: number) =>
    finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Código QR de acceso"
      className="rounded-xl"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on && !inFinder(r, c) ? (
            <rect
              key={`${r}-${c}`}
              x={c * unit}
              y={r * unit}
              width={unit}
              height={unit}
              rx={unit * 0.25}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
      {finders.map(([fr, fc], i) => (
        <g key={i} transform={`translate(${fc * unit}, ${fr * unit})`}>
          <rect
            width={unit * 7}
            height={unit * 7}
            rx={unit * 1.4}
            fill="#0f172a"
          />
          <rect
            x={unit}
            y={unit}
            width={unit * 5}
            height={unit * 5}
            rx={unit}
            fill="#ffffff"
          />
          <rect
            x={unit * 2}
            y={unit * 2}
            width={unit * 3}
            height={unit * 3}
            rx={unit * 0.7}
            fill="#0ea5e9"
          />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small inline icons                                                         */
/* -------------------------------------------------------------------------- */

function FaceIdIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 10v1M15 10v1M12 9.5v3.5a1 1 0 0 1-1 1M9.5 15.5a4 4 0 0 0 5 0" />
    </svg>
  );
}

function StatusBadge({ status }: { status: DemoStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-50 px-3 py-1 text-xs font-semibold text-mint ring-1 ring-inset ring-mint/25">
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-500/25">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Revoked
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function PacienteDemoPage() {
  const [authed, setAuthed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [qrRx, setQrRx] = useState<DemoRx | null>(null);

  const activeCount = PRESCRIPTIONS.filter((p) => p.status === "active").length;

  const authenticate = () => {
    setAuthenticating(true);
    // Simulated biometric handshake.
    setTimeout(() => {
      setAuthenticating(false);
      setAuthed(true);
    }, 1600);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-spotlight" />

      <div className="relative">
        {!authed ? (
          <AccessScreen
            authenticating={authenticating}
            onAuthenticate={authenticate}
            onDemo={() => setAuthed(true)}
          />
        ) : (
          <Dashboard
            activeCount={activeCount}
            onOpenQr={(rx) => setQrRx(rx)}
          />
        )}
      </div>

      {qrRx && <QrModal rx={qrRx} onClose={() => setQrRx(null)} />}
    </main>
  );
}

/* ---------------------------------- Access -------------------------------- */

function AccessScreen({
  authenticating,
  onAuthenticate,
  onDemo,
}: {
  authenticating: boolean;
  onAuthenticate: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <a
        href="/"
        className="mb-10 flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
          <span className="text-sm font-bold">T</span>
        </span>
        <span className="text-ink">
          Trust<span className="text-clinical">Leaf</span>
        </span>
      </a>

      <div className="glass w-full rounded-3xl p-8 shadow-xl shadow-clinical/5">
        <Badge tone="clinical" className="mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-clinical" />
          Stellar Passkey Kit
        </Badge>

        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Acceso del paciente
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          Tu billetera biométrica — sin seed phrase, sin XLM.
        </p>

        <button
          onClick={onAuthenticate}
          disabled={authenticating}
          className={cn(
            "group mt-8 flex w-full flex-col items-center gap-4 rounded-2xl border border-clinical/20 bg-white/70 px-6 py-8 transition-all duration-300",
            "hover:border-clinical/50 hover:shadow-lg hover:shadow-clinical/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical/50 focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed",
          )}
        >
          <span
            className={cn(
              "grid h-20 w-20 place-items-center rounded-2xl bg-clinical/10 text-clinical transition-all duration-300",
              authenticating
                ? "animate-pulse bg-clinical text-white"
                : "group-hover:scale-105 group-hover:bg-clinical group-hover:text-white",
            )}
          >
            <FaceIdIcon className="h-10 w-10" />
          </span>
          <span className="text-base font-semibold text-ink">
            {authenticating
              ? "Verificando identidad…"
              : "Autenticar con Face ID / Touch ID"}
          </span>
        </button>

        <button
          type="button"
          onClick={onDemo}
          disabled={authenticating}
          className="mt-4 text-sm text-muted/70 underline underline-offset-4 transition-colors hover:text-clinical disabled:opacity-50"
        >
          Entrar en modo demo →
        </button>

        <p className="mt-6 text-xs text-muted">
          Protegido por una passkey en tu dispositivo. Nada sale de tu teléfono.
        </p>
      </div>

      <p className="mt-8 text-xs text-muted">
        Demo · Stellar Testnet · sin conexión real a la red
      </p>
    </div>
  );
}

/* -------------------------------- Dashboard ------------------------------- */

type SectionId =
  | "prescriptions"
  | "history"
  | "records"
  | "exams"
  | "settings"
  | "account";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "prescriptions", label: "Mis Prescripciones", icon: NavRxIcon },
  { id: "history", label: "Historial de Atenciones", icon: NavHistoryIcon },
  { id: "records", label: "Fichas Clínicas", icon: NavFolderIcon },
  { id: "exams", label: "Mis Exámenes", icon: NavChartIcon },
  { id: "settings", label: "Configuración", icon: NavGearIcon },
  { id: "account", label: "Mi Cuenta", icon: NavUserIcon },
];

const SECTION_TITLES: Record<SectionId, string> = {
  prescriptions: "Mis Prescripciones",
  history: "Historial de Atenciones",
  records: "Fichas Clínicas",
  exams: "Mis Exámenes",
  settings: "Configuración",
  account: "Mi Cuenta",
};

const EMPTY_STATES: Record<
  Extract<SectionId, "settings" | "account">,
  {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle: string;
  }
> = {
  settings: {
    icon: NavGearIcon,
    title: "Configuración próximamente",
    subtitle:
      "Aquí podrás gestionar tus preferencias, notificaciones y permisos de acceso a tu ficha.",
  },
  account: {
    icon: NavUserIcon,
    title: "Mi cuenta próximamente",
    subtitle:
      "Aquí podrás administrar tu identidad, tu billetera biométrica y tus sesiones activas.",
  },
};

function Dashboard({
  activeCount,
  onOpenQr,
}: {
  activeCount: number;
  onOpenQr: (rx: DemoRx) => void;
}) {
  const [section, setSection] = useState<SectionId>("prescriptions");
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectSection = (id: SectionId) => {
    setSection(id);
    setMobileOpen(false);
  };

  return (
    <div className="relative min-h-screen">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar active={section} onSelect={selectSection} mobileOpen={mobileOpen} />

      {/* Main area */}
      <div className="flex min-h-screen flex-col md:pl-60">
        <MainHeader
          title={SECTION_TITLES[section]}
          onMenu={() => setMobileOpen(true)}
        />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {section === "prescriptions" ? (
            <PrescriptionsSection activeCount={activeCount} onOpenQr={onOpenQr} />
          ) : section === "records" ? (
            <FichaClinicaSection onNavigate={selectSection} />
          ) : section === "history" ? (
            <HistorialSection onNavigate={selectSection} />
          ) : section === "exams" ? (
            <ExamenesSection />
          ) : (
            <EmptyState {...EMPTY_STATES[section]} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Sidebar ------------------------------- */

function Sidebar({
  active,
  onSelect,
  mobileOpen,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  mobileOpen: boolean;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-white transition-transform duration-300 md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/40">
          <span className="text-sm font-bold">T</span>
        </span>
        <span className="text-base font-semibold tracking-tight">
          Trust<span className="text-clinical">Leaf</span>
        </span>
      </div>

      {/* Patient card */}
      <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-clinical to-mint text-sm font-semibold text-white">
          AG
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{PATIENT.fullName}</p>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-mint">
            <VerifiedIcon className="h-3.5 w-3.5" /> Verificado
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {item.id === "settings" && (
                <div className="my-2 border-t border-white/10" />
              )}
              <button
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "border-violet-500 bg-white/5 text-white"
                    : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Wallet + logout */}
      <div className="space-y-2 border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <span className="h-2 w-2 shrink-0 rounded-full bg-mint shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Wallet conectada
            </p>
            <p className="truncate font-mono text-xs text-slate-200">
              {truncateHash(PATIENT.wallet, 6, 4)}
            </p>
          </div>
        </div>
        <a
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogoutIcon className="h-5 w-5 shrink-0" /> Salir del portal
        </a>
      </div>
    </aside>
  );
}

/* -------------------------------- Main header ----------------------------- */

function MainHeader({
  title,
  onMenu,
}: {
  title: string;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-4 backdrop-blur-sm md:px-8">
      <button
        onClick={onMenu}
        aria-label="Abrir menú"
        className="grid h-9 w-9 place-items-center rounded-lg text-ink ring-1 ring-slate-200 transition-colors hover:bg-white md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <h1 className="text-lg font-semibold tracking-tight text-ink md:text-xl">
        {title}
      </h1>
    </header>
  );
}

/* ---------------------------- Prescriptions section ----------------------- */

function PrescriptionsSection({
  activeCount,
  onOpenQr,
}: {
  activeCount: number;
  onOpenQr: (rx: DemoRx) => void;
}) {
  return (
    <>
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="h-2 w-2 rounded-full bg-mint" />
          {activeCount} recetas activas
        </span>
        <span className="text-muted/40">·</span>
        <span>última emitida hace 3 días</span>
        <span className="text-muted/40">·</span>
        <span>{PRESCRIPTIONS.length} registros on-chain</span>
      </div>

      {/* Stats */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Recetas activas"
          value={String(activeCount)}
          hint="Vigentes en tu billetera"
        />
        <StatCard
          label="Costo de red pagado por ti"
          value="$0.00"
          hint="Fees cubiertos por sponsor · Stellar"
          accent="mint"
        />
      </section>

      {/* Cards */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {PRESCRIPTIONS.map((rx) => (
          <RxCard key={rx.id} rx={rx} onOpenQr={onOpenQr} />
        ))}
      </section>
    </>
  );
}

/* -------------------------------- Empty state ----------------------------- */

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-clinical/10 text-clinical ring-1 ring-clinical/15">
        <Icon className="h-9 w-9" />
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted">{subtitle}</p>
      <button
        type="button"
        className={buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "mt-6",
        })}
      >
        Cómo funciona →
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared building blocks for the record-style sections                       */
/* -------------------------------------------------------------------------- */

function SectionCard({
  title,
  icon,
  right,
  children,
  tone = "clinical",
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  tone?: "clinical" | "alert";
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border bg-white p-5 shadow-sm md:p-6",
        tone === "alert" ? "border-red-200" : "border-slate-200/70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
              tone === "alert"
                ? "bg-red-100 text-red-600"
                : "bg-clinical/10 text-clinical",
            )}
          >
            {icon}
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-ink md:text-base">
            {title}
          </h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

function SeverityPill({ level }: { level: Severity }) {
  const map: Record<Severity, string> = {
    Severa: "bg-red-100 text-red-700 ring-red-500/25",
    Moderada: "bg-orange-100 text-orange-700 ring-orange-500/25",
    Leve: "bg-amber-100 text-amber-700 ring-amber-500/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        map[level],
      )}
    >
      {level}
    </span>
  );
}

/* ------------------------------ Ficha clínica ----------------------------- */

function FichaClinicaSection({
  onNavigate,
}: {
  onNavigate: (id: SectionId) => void;
}) {
  const activeMeds = PRESCRIPTIONS.filter((p) => p.status === "active");

  return (
    <div className="space-y-5">
      {/* Identity header */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-clinical/10 to-mint/10 px-5 py-5 md:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-clinical ring-1 ring-inset ring-clinical/20">
            <VerifiedIcon className="h-3.5 w-3.5" />
            Ficha Clínica · Verificada on-chain ✓
          </span>

          <div className="mt-4 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-clinical to-mint text-lg font-semibold text-white shadow-md shadow-clinical/25">
              AG
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {PATIENT.fullName}
              </h2>
              <p className="text-sm text-muted">
                RUT {PATIENT.rut} · {CLINICAL.age} años · {CLINICAL.sex}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <DocField label="Fecha de nacimiento" value={PATIENT.birthDate} />
            <div>
              <SubLabel>Tipo de sangre</SubLabel>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-red-600">
                <DropletIcon className="h-3.5 w-3.5" />
                {CLINICAL.bloodType}
              </p>
            </div>
            <DocField label="Sexo" value={CLINICAL.sex} />
            <DocField label="Nacionalidad" value={CLINICAL.nationality} />
          </dl>
        </div>
      </section>

      {/* Análisis IA */}
      <AiAnalysisCard />

      {/* Datos personales y contacto */}
      <SectionCard title="Datos Personales y Contacto" icon={<ContactIcon className="h-5 w-5" />}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <DocField label="Dirección" value={CLINICAL.address} />
          <DocField label="Teléfono" value={CLINICAL.phone} />
          <DocField label="Contacto de emergencia" value={CLINICAL.emergencyContact} />
          <DocField label="Seguro médico" value={CLINICAL.insurance} />
        </dl>
      </SectionCard>

      {/* Antecedentes médicos */}
      <SectionCard title="Antecedentes Médicos" icon={<HeartPulseIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <SubLabel>Enfermedades crónicas</SubLabel>
            <ul className="mt-2 space-y-1.5">
              {CHRONIC.map((c) => (
                <li key={c.name} className="text-sm text-ink">
                  {c.name}
                  <span className="text-muted"> · desde {c.since}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SubLabel>Cirugías previas</SubLabel>
            <ul className="mt-2 space-y-1.5">
              {SURGERIES.map((s) => (
                <li key={s.name} className="text-sm text-ink">
                  {s.name}
                  <span className="text-muted"> · {s.year}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SubLabel>Hospitalizaciones</SubLabel>
            <ul className="mt-2 space-y-2">
              {HOSPITALIZATIONS.map((h) => (
                <li key={h.reason} className="text-sm text-ink">
                  {h.reason}
                  <span className="block text-xs text-muted">
                    {h.date} · {h.place}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>

      {/* Alergias — alert */}
      <SectionCard
        title="Alergias e Intolerancias"
        tone="alert"
        icon={<AlertIcon className="h-5 w-5" />}
        right={
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-500/25">
            {ALLERGIES.length} alertas activas
          </span>
        }
      >
        <ul className="space-y-2.5">
          {ALLERGIES.map((a) => {
            const chip: Record<Severity, string> = {
              Severa: "border-red-200 bg-red-50/70",
              Moderada: "border-orange-200 bg-orange-50/60",
              Leve: "border-amber-200 bg-amber-50/60",
            };
            return (
              <li
                key={a.agent}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all duration-150",
                  chip[a.severity],
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-base leading-none" aria-hidden>
                    ⚠️
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {a.agent}
                      <span className="ml-2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted ring-1 ring-inset ring-slate-200">
                        {a.kind}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{a.reaction}</p>
                  </div>
                </div>
                <SeverityPill level={a.severity} />
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {/* Antecedentes familiares */}
      <SectionCard title="Antecedentes Familiares" icon={<FamilyIcon className="h-5 w-5" />}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          {FAMILY.map((f) => (
            <DocField key={f.relation} label={f.relation} value={f.conditions} />
          ))}
        </dl>
      </SectionCard>

      {/* Medicación actual */}
      <SectionCard
        title="Medicación Actual"
        icon={<PillIcon className="h-5 w-5" />}
        right={
          <button
            onClick={() => onNavigate("prescriptions")}
            className="text-xs font-semibold text-clinical transition-colors hover:text-clinical-600"
          >
            Ver prescripciones completas →
          </button>
        }
      >
        <ul className="divide-y divide-slate-100">
          {activeMeds.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{m.medication}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {m.dosage} · {m.doctor}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-mint-50 px-2.5 py-1 text-[11px] font-semibold text-mint ring-1 ring-inset ring-mint/25">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                Activa
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Vacunas */}
      <SectionCard title="Vacunas" icon={<SyringeIcon className="h-5 w-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4 font-medium">Vacuna</th>
                <th className="pb-2 pr-4 font-medium">Aplicación</th>
                <th className="pb-2 pr-4 font-medium">Próximo refuerzo</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {VACCINES.map((v) => (
                <tr key={v.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-medium text-ink">{v.name}</td>
                  <td className="py-3 pr-4 text-muted">{v.applied}</td>
                  <td className="py-3 pr-4 text-muted">{v.next}</td>
                  <td className="py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                        v.status === "Al día"
                          ? "bg-mint-50 text-mint ring-mint/25"
                          : "bg-amber-100 text-amber-700 ring-amber-500/25",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          v.status === "Al día" ? "bg-mint" : "bg-amber-500",
                        )}
                      />
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Signos vitales */}
      <SectionCard
        title="Signos Vitales"
        icon={<HeartPulseIcon className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">
              Último control · {VITALS.date}
            </span>
            <VitalStatusBadge status={VITALS.status} />
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {VITALS.items.map((it) => {
            const vitalIcons: Record<string, string> = {
              "Presión arterial": "🩸",
              "Frecuencia cardíaca": "❤️",
              Peso: "⚖️",
              Talla: "📏",
              IMC: "📊",
              "Saturación O₂": "🫁",
            };
            return (
              <div
                key={it.label}
                className={cn(
                  "rounded-2xl border px-4 py-3 transition-all duration-150",
                  it.status === "Normal"
                    ? "border-slate-200/70 bg-slate-50/60"
                    : it.status === "Atención"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-red-200 bg-red-50/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="text-sm leading-none" aria-hidden>
                      {vitalIcons[it.label] ?? "🩺"}
                    </span>
                    <SubLabel>{it.label}</SubLabel>
                  </div>
                  <VitalDot status={it.status} />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-ink">
                  {it.value}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {it.unit}
                  </span>
                </p>
              </div>
            );
          })}
        </dl>
      </SectionCard>

      {/* Footer */}
      <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <a
              href={STELLAR_EXPERT(CLINICAL.updateHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-clinical hover:text-clinical-600 hover:underline"
            >
              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
              {truncateHash(CLINICAL.updateHash, 10, 8)}
            </a>
            <p className="mt-1.5 text-xs text-muted">
              Ficha actualizada por {CLINICAL.updatedBy} · {CLINICAL.updatedAt} ·
              Bloque {CLINICAL.updateBlock}
            </p>
          </div>
          <Button size="md" className="shrink-0">
            <DownloadIcon className="h-4 w-4" />
            Descargar ficha completa
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ Análisis IA ------------------------------- */

type AiTone = "alert" | "watch" | "good";

function AiFindingGroup({
  label,
  tone,
  items,
}: {
  label: string;
  tone: AiTone;
  items: AiFinding[];
}) {
  const map: Record<
    AiTone,
    { wrap: string; badge: string; dot: string }
  > = {
    alert: {
      wrap: "border-red-200 bg-red-50/50",
      badge: "bg-red-100 text-red-700 ring-red-500/25",
      dot: "bg-red-500",
    },
    watch: {
      wrap: "border-amber-200 bg-amber-50/50",
      badge: "bg-amber-100 text-amber-700 ring-amber-500/25",
      dot: "bg-amber-500",
    },
    good: {
      wrap: "border-mint/30 bg-mint-50/60",
      badge: "bg-mint-50 text-mint ring-mint/25",
      dot: "bg-mint",
    },
  };
  const t = map[tone];
  return (
    <div className={cn("rounded-2xl border p-4", t.wrap)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
          t.badge,
        )}
      >
        {label}
        <span className="opacity-70">· {items.length}</span>
      </span>
      <ul className="mt-3 space-y-2.5">
        {items.map((it) => (
          <li key={it.lead} className="flex gap-2.5">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                t.dot,
              )}
            />
            <p className="text-sm leading-relaxed text-ink">
              <span className="font-semibold">{it.lead}</span>
              <span className="text-muted"> — {it.text}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiAnalysisCard() {
  return (
    <section className="overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-4 text-white md:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
          <SparklesIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              Análisis IA
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-white/25">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Beta
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/80">
            Actualizado {AI_ANALYSIS.updatedAt}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-4 px-5 py-5 md:px-6">
        <AiFindingGroup
          label="Alertas"
          tone="alert"
          items={AI_ANALYSIS.alerts}
        />
        <AiFindingGroup
          label="Observaciones"
          tone="watch"
          items={AI_ANALYSIS.observations}
        />
        <AiFindingGroup
          label="Positivo"
          tone="good"
          items={AI_ANALYSIS.positives}
        />

        {/* Recomendaciones */}
        <div className="rounded-2xl border border-violet-200 bg-white/70 p-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-500/25">
            Recomendaciones del agente
          </span>
          <ul className="mt-3 space-y-2">
            {AI_ANALYSIS.recommendations.map((r) => (
              <li key={r} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-600">
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm leading-relaxed text-ink">{r}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-violet-100 bg-white/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
          <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
          Generado por TrustLeaf AI · Basado en {AI_ANALYSIS.examCount} exámenes
          + ficha clínica completa
        </span>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-500/25 transition-opacity hover:opacity-90"
        >
          Ver análisis completo →
        </button>
      </div>
    </section>
  );
}

function VitalDot({ status }: { status: VitalStatus }) {
  const map: Record<VitalStatus, { text: string; dot: string }> = {
    Normal: { text: "text-mint", dot: "bg-mint" },
    Atención: { text: "text-amber-600", dot: "bg-amber-500" },
    Crítico: { text: "text-red-600", dot: "bg-red-500" },
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold",
        map[status].text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", map[status].dot)} />
      {status}
    </span>
  );
}

function VitalStatusBadge({ status }: { status: VitalStatus }) {
  const map: Record<VitalStatus, string> = {
    Normal: "bg-mint-50 text-mint ring-mint/25",
    Atención: "bg-amber-100 text-amber-700 ring-amber-500/25",
    Crítico: "bg-red-100 text-red-700 ring-red-500/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

/* ---------------------------- Historial section --------------------------- */

function TypePill({ type }: { type: ApptType }) {
  const map: Record<ApptType, string> = {
    Consulta: "bg-clinical/10 text-clinical ring-clinical/20",
    Control: "bg-slate-100 text-slate-600 ring-slate-300/60",
    Urgencia: "bg-red-100 text-red-700 ring-red-500/25",
    Teleconsulta: "bg-violet-100 text-violet-700 ring-violet-500/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        map[type],
      )}
    >
      {type}
    </span>
  );
}

function HistorialSection({
  onNavigate,
}: {
  onNavigate: (id: SectionId) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(ATENCIONES[0].id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="h-2 w-2 rounded-full bg-clinical" />
          {ATENCIONES.length} atenciones registradas
        </span>
        <span className="text-muted/40">·</span>
        <span>todas verificadas on-chain</span>
      </div>

      <div className="space-y-2.5">
        {ATENCIONES.map((a) => (
          <AtencionRow
            key={a.id}
            atencion={a}
            open={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function AtencionRow({
  atencion: a,
  open,
  onToggle,
  onNavigate,
}: {
  atencion: Atencion;
  open: boolean;
  onToggle: () => void;
  onNavigate: (id: SectionId) => void;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors",
        open ? "border-clinical/30" : "border-slate-200/70",
      )}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/70 md:px-5"
      >
        <div className="hidden w-20 shrink-0 text-xs font-medium text-muted sm:block">
          {a.date}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">
              {a.diagnosis}
            </span>
            <TypePill type={a.type} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            <span className="sm:hidden">{a.date} · </span>
            {a.doctor} · {a.specialty}
          </p>
        </div>
        <ChevronIcon
          className={cn(
            "h-5 w-5 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4 md:px-5">
          <p className="text-sm leading-relaxed text-ink">{a.summary}</p>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <DocField label="Institución" value={a.institution} />
            <div>
              <SubLabel>Prescripción</SubLabel>
              {a.rxId ? (
                <button
                  onClick={() => onNavigate("prescriptions")}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-clinical transition-colors hover:text-clinical-600"
                >
                  <PillIcon className="h-4 w-4" />
                  {a.rxId} · ver receta →
                </button>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Sin prescripción asociada
                </p>
              )}
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-1.5 font-mono text-xs text-muted">
            <LinkIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Hash on-chain: {a.hash}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Exámenes section --------------------------- */

function ExamStateBadge({ state }: { state: ExamState }) {
  const map: Record<ExamState, string> = {
    "Resultado disponible": "bg-mint-50 text-mint ring-mint/25",
    "En proceso": "bg-clinical/10 text-clinical ring-clinical/20",
    Pendiente: "bg-slate-100 text-slate-600 ring-slate-300/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        map[state],
      )}
    >
      {state}
    </span>
  );
}

function ResultBadge({ result }: { result: ExamResult }) {
  if (!result) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        result === "Normal"
          ? "bg-mint-50 text-mint ring-mint/25"
          : "bg-orange-100 text-orange-700 ring-orange-500/25",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          result === "Normal" ? "bg-mint" : "bg-orange-500",
        )}
      />
      {result}
    </span>
  );
}

function ExamenesSection() {
  const [openExam, setOpenExam] = useState<Exam | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [extra, setExtra] = useState<Exam[]>([]);

  const exams = [...extra, ...EXAMS];
  const disponibles = exams.filter(
    (e) => e.state === "Resultado disponible",
  ).length;

  const addExam = (exam: Exam) => {
    setUploadOpen(false);
    setExtra((prev) =>
      prev.some((e) => e.id === exam.id) ? prev : [exam, ...prev],
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <span className="h-2 w-2 rounded-full bg-mint" />
            {disponibles} resultados disponibles
          </span>
          <span className="text-muted/40">·</span>
          <span>{exams.length} exámenes en total</span>
        </div>

        <Button
          size="md"
          onClick={() => setUploadOpen(true)}
          className="shrink-0"
        >
          <UploadIcon className="h-4 w-4" />
          Subir resultado
        </Button>
      </div>

      <div className="space-y-2.5">
        {exams.map((e) => {
          const available = e.state === "Resultado disponible";
          return (
            <div
              key={e.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-5",
                e.isNew
                  ? "border-clinical/40 ring-1 ring-clinical/15"
                  : "border-slate-200/70",
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
                  <FlaskIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{e.name}</p>
                    {e.isNew && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-clinical/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clinical ring-1 ring-inset ring-clinical/20">
                        <SparklesIcon className="h-3 w-3" />
                        Nuevo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.date} · Solicitado por {e.orderedBy}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[3.25rem] sm:pl-0">
                {e.detail && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                      e.result === "Alterado"
                        ? "bg-orange-100 text-orange-700 ring-orange-500/25"
                        : "bg-slate-100 text-slate-600 ring-slate-300/60",
                    )}
                  >
                    {e.detail}
                  </span>
                )}
                <ResultBadge result={e.result} />
                <ExamStateBadge state={e.state} />
                <Button
                  size="sm"
                  variant={available ? "primary" : "secondary"}
                  disabled={!available}
                  onClick={() => setOpenExam(e)}
                >
                  Ver resultado
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {openExam && (
        <ExamResultModal exam={openExam} onClose={() => setOpenExam(null)} />
      )}

      {uploadOpen && (
        <UploadResultModal
          onClose={() => setUploadOpen(false)}
          onAdd={addExam}
        />
      )}
    </div>
  );
}

/* --------------------------- Upload result modal -------------------------- */

type UploadStep = "source" | "processing" | "result";

const PROCESS_STEPS: { label: string; ms: number }[] = [
  { label: "Leyendo documento…", ms: 1000 },
  { label: "Extrayendo valores con OCR…", ms: 1500 },
  { label: "Analizando con TrustLeaf AI…", ms: 1500 },
  { label: "Guardando en tu ficha on-chain…", ms: 1000 },
];

function UploadResultModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (exam: Exam) => void;
}) {
  const [step, setStep] = useState<UploadStep>("source");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Subir resultado de examen"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200/70 bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
              <UploadIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink">
                Subir resultado
              </h3>
              <p className="text-[11px] text-muted">
                {step === "source"
                  ? "Elige cómo cargar tu examen"
                  : step === "processing"
                    ? "Procesando documento…"
                    : "Resultado detectado"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {step === "source" ? (
          <UploadSourceStep onPick={() => setStep("processing")} />
        ) : step === "processing" ? (
          <UploadProcessingStep onDone={() => setStep("result")} />
        ) : (
          <UploadResultStep onAdd={() => onAdd(UPLOADED_EXAM)} />
        )}
      </div>
    </div>
  );
}

function SourceOption({
  icon,
  title,
  subtitle,
  accept,
  capture,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accept: string;
  capture?: "environment";
  onPick: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3.5 transition-all hover:border-clinical/40 hover:bg-clinical/5 focus-within:border-clinical/50 focus-within:ring-2 focus-within:ring-clinical/30">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronIcon className="h-5 w-5 shrink-0 -rotate-90 text-muted" />
      <input
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        onChange={onPick}
      />
    </label>
  );
}

function UploadSourceStep({ onPick }: { onPick: () => void }) {
  return (
    <div className="space-y-2.5 px-5 py-5 sm:px-6">
      <SourceOption
        icon={<CameraIcon className="h-5 w-5" />}
        title="Tomar foto"
        subtitle="Usa la cámara de tu teléfono"
        accept="image/*"
        capture="environment"
        onPick={onPick}
      />
      <SourceOption
        icon={<GalleryIcon className="h-5 w-5" />}
        title="Elegir de galería"
        subtitle="Selecciona una imagen guardada"
        accept="image/*"
        onPick={onPick}
      />
      <SourceOption
        icon={<PdfIcon className="h-5 w-5" />}
        title="Subir PDF"
        subtitle="Informe de laboratorio en PDF"
        accept=".pdf"
        onPick={onPick}
      />

      <p className="pt-1 text-center text-[11px] text-muted">
        TrustLeaf AI leerá el documento y extraerá los valores automáticamente.
      </p>
    </div>
  );
}

function UploadProcessingStep({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    PROCESS_STEPS.forEach((s, i) => {
      acc += s.ms;
      timers.push(
        setTimeout(() => {
          if (alive) setActive(i + 1);
        }, acc),
      );
    });
    timers.push(
      setTimeout(() => {
        if (alive) onDone();
      }, acc),
    );
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  return (
    <div className="px-5 py-8 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-clinical/10 text-clinical">
          <SpinnerIcon className="h-8 w-8 animate-spin" />
        </span>
        <p className="mt-4 text-sm font-semibold text-ink">
          Procesando tu examen
        </p>
      </div>

      <ul className="mx-auto mt-6 max-w-xs space-y-3">
        {PROCESS_STEPS.map((s, i) => {
          const done = active > i;
          const current = active === i;
          return (
            <li key={s.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors",
                  done
                    ? "bg-mint text-white ring-mint"
                    : current
                      ? "bg-clinical/10 text-clinical ring-clinical/30"
                      : "bg-slate-100 text-slate-400 ring-slate-200",
                )}
              >
                {done ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : current ? (
                  <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors",
                  done
                    ? "font-medium text-ink"
                    : current
                      ? "font-medium text-clinical"
                      : "text-muted",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UploadResultStep({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2 rounded-xl bg-mint-50 px-3 py-2 text-xs font-medium text-mint ring-1 ring-inset ring-mint/25">
        <CheckIcon className="h-4 w-4 shrink-0" />
        Examen detectado y valores extraídos correctamente
      </div>

      {/* Detected exam card */}
      <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-orange-600 ring-1 ring-inset ring-orange-200">
              <FlaskIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                Vitamina D (25-OH)
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Solicitado por: ti mismo · Fecha: hoy
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-500/25">
            Alterado
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-white/70 px-3.5 py-3">
          <div>
            <SubLabel>Resultado</SubLabel>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-orange-600">
              18
              <span className="ml-1 text-sm font-semibold text-orange-500">
                ng/mL
              </span>
            </p>
          </div>
          <div className="text-right">
            <SubLabel>Referencia</SubLabel>
            <p className="mt-0.5 text-sm font-medium text-muted">30 – 100</p>
            <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/25">
              Deficiencia
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        Valores extraídos por TrustLeaf AI a partir del documento.
      </p>

      <Button size="md" className="mt-4 w-full" onClick={onAdd}>
        Agregar a mi ficha
      </Button>
    </div>
  );
}

/* --------------------------- Exam result modal ---------------------------- */

function AnalyteBadge({ status }: { status: AnalyteStatus }) {
  const map: Record<AnalyteStatus, string> = {
    Normal: "bg-mint-50 text-mint ring-mint/25",
    Alto: "bg-orange-100 text-orange-700 ring-orange-500/25",
    Bajo: "bg-amber-100 text-amber-700 ring-amber-500/25",
    Alterado: "bg-red-100 text-red-700 ring-red-500/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

function AnalyteTable({ rows }: { rows: AnalyteRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-muted">
            <th className="pb-2 pr-4 font-medium">Parámetro</th>
            <th className="pb-2 pr-4 font-medium">Resultado</th>
            <th className="pb-2 pr-4 font-medium">Referencia</th>
            <th className="pb-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-4 font-medium text-ink">{r.name}</td>
              <td
                className={cn(
                  "py-2.5 pr-4 font-semibold",
                  r.status === "Normal" ? "text-ink" : "text-orange-700",
                )}
              >
                {r.value}
                {r.unit && (
                  <span className="ml-1 text-xs font-normal text-muted">
                    {r.unit}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-4 text-xs text-muted">{r.ref}</td>
              <td className="py-2.5">
                <AnalyteBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HbA1cGauge({ value }: { value: number }) {
  const min = 4;
  const max = 10;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const pct = (v: number) => clamp(((v - min) / (max - min)) * 100);
  const normalEnd = pct(5.7);
  const preEnd = pct(6.5);
  const pos = pct(value);
  const display = value.toFixed(1).replace(".", ",");

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SubLabel>Hemoglobina glicosilada (HbA1c)</SubLabel>
          <p className="mt-1 text-4xl font-bold tracking-tight text-orange-600">
            {display}
            <span className="ml-1 text-xl font-semibold text-orange-500">%</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-500/25">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          Zona diabetes controlada
        </span>
      </div>

      <div className="relative mt-7">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div style={{ width: `${normalEnd}%` }} className="bg-mint" />
          <div
            style={{ width: `${preEnd - normalEnd}%` }}
            className="bg-amber-400"
          />
          <div style={{ width: `${100 - preEnd}%` }} className="bg-orange-500" />
        </div>
        <div
          className="absolute -top-1.5 -translate-x-1/2"
          style={{ left: `${pos}%` }}
        >
          <div className="h-5 w-1 rounded-full bg-ink ring-2 ring-white" />
        </div>
      </div>
      <div className="mt-2.5 flex justify-between text-[10px] font-medium text-muted">
        <span>Normal &lt;5,7%</span>
        <span>Prediabetes 5,7–6,4%</span>
        <span>Diabetes ≥6,5%</span>
      </div>
    </div>
  );
}

function MetricGrid({
  items,
}: {
  items: { label: string; value: string; status: AnalyteStatus }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((m) => (
        <div
          key={m.label}
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
            m.status === "Normal"
              ? "border-slate-200/70 bg-slate-50/60"
              : m.status === "Alterado"
                ? "border-red-200 bg-red-50/40"
                : "border-orange-200 bg-orange-50/40",
          )}
        >
          <div className="min-w-0">
            <SubLabel>{m.label}</SubLabel>
            <p className="mt-0.5 text-base font-semibold text-ink">{m.value}</p>
          </div>
          <AnalyteBadge status={m.status} />
        </div>
      ))}
    </div>
  );
}

function ReportBlockView({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "analytes":
      return (
        <div>
          {block.title && (
            <p className="mb-2.5 text-sm font-semibold text-ink">{block.title}</p>
          )}
          <AnalyteTable rows={block.rows} />
        </div>
      );
    case "narrative":
      return (
        <div>
          <SubLabel>{block.title ?? "Informe"}</SubLabel>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{block.text}</p>
        </div>
      );
    case "hba1c":
      return <HbA1cGauge value={block.value} />;
    case "metrics":
      return (
        <div>
          {block.title && (
            <p className="mb-2.5 text-sm font-semibold text-ink">{block.title}</p>
          )}
          <MetricGrid items={block.items} />
        </div>
      );
  }
}

function ExamResultModal({
  exam,
  onClose,
}: {
  exam: Exam;
  onClose: () => void;
}) {
  const report = REPORTS[exam.id];
  if (!report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Resultado · ${exam.name}`}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200/70 bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
                  <FlaskIcon className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  {exam.name}
                </h3>
                <ResultBadge result={exam.result} />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {exam.date} · Solicitado por {exam.orderedBy} ·{" "}
                {report.institution}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-slate-100 hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 px-5 py-5 sm:px-6">
          {report.blocks.map((b, i) => (
            <ReportBlockView key={i} block={b} />
          ))}

          {/* Conclusion */}
          <div
            className={cn(
              "rounded-2xl border p-4",
              exam.result === "Normal"
                ? "border-mint/30 bg-mint-50/50"
                : "border-orange-200 bg-orange-50/50",
            )}
          >
            <SubLabel>Conclusión</SubLabel>
            <p className="mt-1 text-sm font-medium leading-relaxed text-ink">
              {report.conclusion}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Resultado emitido por
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{report.lab}</p>
          </div>
          <a
            href={STELLAR_EXPERT(report.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-clinical hover:text-clinical-600 hover:underline"
          >
            <LinkIcon className="h-3.5 w-3.5 shrink-0" />
            {truncateHash(report.hash, 10, 8)}
          </a>
          <Button size="md" className="w-full">
            <DownloadIcon className="h-4 w-4" />
            Descargar resultado PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "clinical",
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "clinical" | "mint";
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tracking-tight",
          accent === "mint" ? "text-mint" : "text-clinical",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function RxCard({
  rx,
  onOpenQr,
}: {
  rx: DemoRx;
  onOpenQr: (rx: DemoRx) => void;
}) {
  const revoked = rx.status === "revoked";
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-3xl border border-l-4 bg-white shadow-sm transition-all duration-300",
        revoked
          ? "border-slate-200/70 border-l-slate-300 opacity-90"
          : "border-slate-200/70 border-l-mint hover:-translate-y-1 hover:border-clinical/30 hover:border-l-mint hover:shadow-xl hover:shadow-clinical/5",
      )}
    >
      {/* NFT-style header band */}
      <div
        className={cn(
          "relative flex items-center justify-between px-5 py-3",
          revoked
            ? "bg-gradient-to-r from-slate-100 to-slate-50"
            : "bg-gradient-to-r from-clinical/10 to-mint/10",
        )}
      >
        <span className="font-mono text-xs font-medium text-muted">
          #{rx.id}
        </span>
        <StatusBadge status={rx.status} />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold tracking-tight text-ink">
          {rx.medication}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{rx.dosage}</p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Médico</dt>
            <dd className="text-right font-medium text-ink">{rx.doctor}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Licencia</dt>
            <dd className="text-right font-mono text-xs text-ink">
              {rx.license}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Emisión</dt>
            <dd className="text-right font-medium text-ink">{rx.issuedAt}</dd>
          </div>
        </dl>

        <a
          href={STELLAR_EXPERT(rx.rxHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 truncate font-mono text-xs text-clinical hover:text-clinical-600 hover:underline"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          {truncateHash(rx.rxHash, 8, 6)}
        </a>

        <div className="mt-5 flex-1" />

        <Button
          variant={revoked ? "secondary" : "primary"}
          size="sm"
          disabled={revoked}
          onClick={() => onOpenQr(rx)}
          className="w-full"
        >
          {revoked ? "Prescripción revocada" : "Generar QR de acceso"}
        </Button>
      </div>
    </article>
  );
}

/* --------------------------------- QR Modal ------------------------------- */

type ModalTab = "qr" | "receta";

function QrModal({ rx, onClose }: { rx: DemoRx; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>("qr");
  const [copied, setCopied] = useState(false);
  const accessLink = `https://trustleaf.app/rx/${rx.id}?token=${rx.rxHash.slice(0, 16)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(accessLink);
    } catch {
      /* clipboard blocked — demo, ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de la prescripción"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200/70 bg-white shadow-2xl ring-1 ring-black/5">
        {/* Top bar */}
        <div className="flex items-start justify-between px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-ink">
              {rx.medication}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              #{rx.id} · {rx.doctor}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-slate-200 px-5 sm:px-6">
          <TabButton active={tab === "qr"} onClick={() => setTab("qr")}>
            QR de acceso
          </TabButton>
          <TabButton active={tab === "receta"} onClick={() => setTab("receta")}>
            Ver receta
          </TabButton>
        </div>

        {tab === "qr" ? (
          <div className="px-5 py-5 sm:px-6">
            <div className="flex justify-center">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <QrCode seed={accessLink} size={200} />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-clinical"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="font-medium text-ink">
                Token válido por 15 minutos
              </span>
            </div>

            <div className="mt-5 space-y-2">
              <Button onClick={copy} className="w-full" size="md">
                {copied ? "✓ Enlace copiado" : "Copiar enlace de acceso"}
              </Button>
              <Button
                onClick={onClose}
                variant="secondary"
                size="md"
                className="w-full"
              >
                Cerrar
              </Button>
            </div>

            <p className="mt-4 text-center text-[11px] text-muted">
              El farmacéutico escanea este código para verificar la receta
              on-chain.
            </p>
          </div>
        ) : (
          <RecetaView rx={rx} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-clinical text-clinical"
          : "border-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Receta view ------------------------------ */

function RecetaView({ rx }: { rx: DemoRx }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      {/* Official document */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Document header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
              <span className="text-sm font-bold">T</span>
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-ink">
                Receta Médica Oficial
              </p>
              <p className="text-[11px] text-muted">
                TrustLeaf · Registro clínico on-chain
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint-50 px-2.5 py-1 text-[11px] font-semibold text-mint ring-1 ring-inset ring-mint/25">
            <VerifiedIcon className="h-3.5 w-3.5" />
            Verificada on-chain
          </span>
        </div>

        {/* Body */}
        <div className="space-y-5 px-5 py-5">
          {/* Doctor + patient */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <DocLabel>Médico tratante</DocLabel>
              <p className="mt-1.5 text-sm font-semibold text-ink">
                {rx.doctor}
              </p>
              <dl className="mt-1 space-y-0.5 text-xs text-muted">
                <div>{rx.specialty}</div>
                <div>Licencia: {rx.license}</div>
                <div>{rx.institution}</div>
              </dl>
            </div>
            <div className="sm:text-right">
              <DocLabel>Paciente</DocLabel>
              <p className="mt-1.5 text-sm font-semibold text-ink">
                {PATIENT.fullName}
              </p>
              <dl className="mt-1 space-y-0.5 text-xs text-muted">
                <div>RUT: {PATIENT.rut}</div>
                <div>Nacimiento: {PATIENT.birthDate}</div>
              </dl>
            </div>
          </div>

          <div className="h-px bg-slate-200" />

          {/* Medication */}
          <div>
            <DocLabel>Medicamento prescrito</DocLabel>
            <p className="mt-1.5 text-base font-semibold text-ink">
              {rx.medication}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <DocField label="Dosis" value={rx.dosage} />
              <DocField label="Vía de administración" value={rx.route} />
              <DocField label="Frecuencia" value={rx.frequency} />
              <DocField label="Duración del tratamiento" value={rx.treatmentDuration} />
            </dl>
          </div>

          <div className="h-px bg-slate-200" />

          {/* Instructions */}
          <div>
            <DocLabel>Indicaciones adicionales</DocLabel>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">
              {rx.instructions}
            </p>
          </div>

          <div className="h-px bg-slate-200" />

          {/* On-chain meta */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <DocField label="N° de receta" value={rx.id} mono />
            <DocField label="Fecha de emisión" value={rx.issuedAt} />
            <div className="col-span-2">
              <DocLabel>Hash on-chain</DocLabel>
              <a
                href={STELLAR_EXPERT(rx.rxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-clinical hover:text-clinical-600 hover:underline"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {truncateHash(rx.rxHash, 10, 8)}
              </a>
            </div>
          </dl>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-[11px] text-muted">
          Esta receta está registrada en Stellar Soroban · Bloque {rx.block}
        </div>
      </div>

      {/* Actions (UI only) */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="md" className="w-full">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
          </svg>
          Descargar PDF
        </Button>
        <Button variant="secondary" size="md" className="w-full">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          Compartir receta
        </Button>
      </div>
    </div>
  );
}

function DocLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

function DocField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <DocLabel>{label}</DocLabel>
      <p
        className={cn(
          "mt-1 text-sm font-medium text-ink",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar / navigation icons (stroke = currentColor)                         */
/* -------------------------------------------------------------------------- */

function iconProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function NavRxIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function NavHistoryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13a9 9 0 1 0 2.6-6.36L3 8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function NavFolderIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function NavChartIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 3v18h18" />
      <path d="M7 15l3-4 3 2 4-6" />
    </svg>
  );
}

function NavGearIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

function NavUserIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function DropletIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3s6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 6-10 6-10z" />
    </svg>
  );
}

function ContactIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M5.5 16a3.5 3.5 0 0 1 7 0M15 9h4M15 13h4" />
    </svg>
  );
}

function HeartPulseIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 1 0-7.1 7.1l1.3 1.3L12 21l7.1-7 1.3-1.3a5 5 0 0 0 0-7.1z" />
      <path d="M3.5 12.5H8l2-3 2 5 1.6-3H20" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function FamilyIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <path d="M2 21v-1a5 5 0 0 1 5-5 5 5 0 0 1 5 5v1M12 21v-1a5 5 0 0 1 5-5 5 5 0 0 1 5 5v1" />
    </svg>
  );
}

function PillIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  );
}

function SyringeIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M18 2l4 4M17 3l4 4-9 9H8v-4z" />
      <path d="M14 6l4 4M4 20l4-4M6 18l2 2" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" />
      <path d="M7 15h10" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3l1.6 4.6L18 9.2l-4.4 1.6L12 15l-1.6-4.2L6 9.2l4.4-1.6z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 15V3M8 7l4-4 4 4M5 21h14" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 17l4.5-4.5 3 3L15 12l5 5" />
    </svg>
  );
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8.5 13.5h1.5a1.2 1.2 0 0 1 0 2.4H8.5zM8.5 13.5v4M14 13.5v4M14 13.5h1.8M14 15.5h1.4" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}
