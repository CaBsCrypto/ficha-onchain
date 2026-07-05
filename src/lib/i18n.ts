import type { Language } from "@/types";

/**
 * Lightweight i18n dictionary for the landing page (EN / ES).
 * Kept as a single typed object — no runtime deps. Swap for next-intl later.
 */
export const translations = {
  en: {
    nav: {
      problem: "Problem",
      solution: "Solution",
      how: "How it works",
      roadmap: "Roadmap",
      cta: "Join Waitlist",
    },
    hero: {
      badge: "Health records on Stellar Soroban",
      title: "Your Medical History.",
      titleAccent: "Verified. Always Yours.",
      subtitle:
        "Doctors issue prescriptions as blockchain records. Patients receive them instantly — no fees, no paperwork, no borders.",
      cta: "Join the Waitlist",
      secondary: "See how it works",
      card: {
        name: "Ana García",
        badge: "Verified Prescription",
        issued: "Issued by Dr. M. Rojas",
        hash: "0x7f3a...c891",
        network: "Stellar",
      },
    },
    problem: {
      kicker: "The problem",
      title: "Paper prescriptions are broken",
      subtitle:
        "Trust in medical records still relies on ink, stamps and fax machines. It fails patients exactly when it matters.",
      cards: [
        {
          title: "Prescription Fraud",
          stat: "100M+",
          statLabel: "forged prescriptions / year",
          desc: "Paper scripts are trivially copied and altered. Pharmacies have no reliable way to verify who really issued them.",
        },
        {
          title: "No International Portability",
          stat: "0",
          statLabel: "borders your records cross",
          desc: "Travel, move or seek a second opinion abroad and your history stays behind — locked inside a single clinic's system.",
        },
        {
          title: "Lost Medical History",
          stat: "∞",
          statLabel: "scattered fragments",
          desc: "Records are spread across clinics, apps and drawers. No continuity, no single source of truth, no patient ownership.",
        },
      ],
    },
    solution: {
      kicker: "The solution",
      title: "One verifiable record, owned by the patient",
      subtitle:
        "Every prescription becomes a tamper-proof record on Stellar Soroban — issued, delivered and verified in seconds.",
      steps: [
        { title: "Doctor issues", desc: "Signs and mints the prescription on-chain." },
        { title: "Patient receives", desc: "Lands instantly in their wallet — fee-free." },
        { title: "Verify anywhere", desc: "Any pharmacy or clinic confirms it in a scan." },
      ],
    },
    how: {
      kicker: "How it works",
      title: "Built for the real clinical workflow",
      subtitle: "No crypto knowledge required — for doctors or patients.",
      steps: [
        {
          step: "01",
          title: "Doctor Issues",
          desc: "Biometric signature via Passkey authorizes the prescription, which is minted as a record on Soroban.",
        },
        {
          step: "02",
          title: "Patient Receives",
          desc: "No crypto needed. The record arrives fee-lessly through a relayer that sponsors the transaction.",
        },
        {
          step: "03",
          title: "Verified Anywhere",
          desc: "Any pharmacy or clinic scans a QR code to confirm authenticity, issuer and status on-chain.",
        },
      ],
    },
    audience: {
      kicker: "For everyone in the loop",
      title: "One protocol, two experiences",
      doctors: {
        title: "For Doctors",
        points: [
          "Sign prescriptions with a biometric Passkey — no seed phrases.",
          "Instantly verifiable credentials tied to your medical license.",
          "Revoke or update a prescription on-chain in one tap.",
          "A permanent, auditable record of everything you issue.",
        ],
      },
      patients: {
        title: "For Patients",
        points: [
          "Own your complete medical history — it travels with you.",
          "Receive prescriptions instantly, with zero fees.",
          "Share verified records with any doctor, anywhere.",
          "No wallet setup, no crypto jargon, no friction.",
        ],
      },
    },
    roadmap: {
      kicker: "Roadmap",
      title: "From prescriptions to a full health protocol",
      phases: [
        {
          phase: "Phase 0",
          title: "Prescriptions on-chain",
          desc: "Verifiable, soulbound prescriptions issued by licensed doctors.",
          status: "In progress",
        },
        {
          phase: "Phase 1",
          title: "Clinical Records",
          desc: "Full FHIR-based clinical history, patient-owned and portable.",
          status: "Next",
        },
        {
          phase: "Phase 2",
          title: "AI Health Agent",
          desc: "A private assistant that reasons over your verified records.",
          status: "Planned",
        },
        {
          phase: "Phase 3",
          title: "Ecosystem & Integrations",
          desc: "Pharmacies, labs and insurers plug into the protocol.",
          status: "Planned",
        },
      ],
    },
    waitlist: {
      kicker: "Early access",
      title: "Be first when we launch in Chile",
      subtitle:
        "Join the waitlist and help shape verifiable healthcare from day one.",
      placeholder: "you@email.com",
      cta: "Join Waitlist",
      success: "You're on the list. We'll be in touch.",
      invalid: "Please enter a valid email address.",
    },
    footer: {
      tagline: "Built on Stellar Soroban",
      built: "Built on Stellar Soroban",
      rights: "All rights reserved.",
      columns: {
        product: { title: "Product", links: ["Problem", "Solution", "How it works", "Roadmap"] },
        company: { title: "Company", links: ["About", "Contact", "Careers"] },
        legal: { title: "Legal", links: ["Privacy", "Terms", "Security"] },
      },
    },
  },
  es: {
    nav: {
      problem: "Problema",
      solution: "Solución",
      how: "Cómo funciona",
      roadmap: "Roadmap",
      cta: "Unirse a la lista",
    },
    hero: {
      badge: "Registros de salud en Stellar Soroban",
      title: "Tu Historial Médico.",
      titleAccent: "Verificado. Siempre Tuyo.",
      subtitle:
        "Los médicos emiten recetas como registros en blockchain. Los pacientes las reciben al instante — sin comisiones, sin papeleo, sin fronteras.",
      cta: "Unirse a la Lista",
      secondary: "Ver cómo funciona",
      card: {
        name: "Ana García",
        badge: "Receta Verificada",
        issued: "Emitida por Dr. M. Rojas",
        hash: "0x7f3a...c891",
        network: "Stellar",
      },
    },
    problem: {
      kicker: "El problema",
      title: "Las recetas en papel están rotas",
      subtitle:
        "La confianza en los registros médicos aún depende de tinta, sellos y fax. Falla justo cuando más importa.",
      cards: [
        {
          title: "Fraude de Recetas",
          stat: "100M+",
          statLabel: "recetas falsificadas / año",
          desc: "Las recetas en papel se copian y alteran con facilidad. Las farmacias no tienen forma confiable de verificar quién las emitió.",
        },
        {
          title: "Sin Portabilidad Internacional",
          stat: "0",
          statLabel: "fronteras que cruza tu historial",
          desc: "Viaja, múdate o busca una segunda opinión en el extranjero y tu historial se queda atrás — encerrado en el sistema de una sola clínica.",
        },
        {
          title: "Historial Médico Perdido",
          stat: "∞",
          statLabel: "fragmentos dispersos",
          desc: "Los registros se reparten entre clínicas, apps y cajones. Sin continuidad, sin una única fuente de verdad, sin propiedad del paciente.",
        },
      ],
    },
    solution: {
      kicker: "La solución",
      title: "Un registro verificable, propiedad del paciente",
      subtitle:
        "Cada receta se convierte en un registro inalterable en Stellar Soroban — emitido, entregado y verificado en segundos.",
      steps: [
        { title: "El médico emite", desc: "Firma y acuña la receta en la blockchain." },
        { title: "El paciente recibe", desc: "Llega al instante a su billetera — sin costo." },
        { title: "Verifica donde sea", desc: "Cualquier farmacia o clínica la confirma con un escaneo." },
      ],
    },
    how: {
      kicker: "Cómo funciona",
      title: "Diseñado para el flujo clínico real",
      subtitle: "No se requiere conocimiento de cripto — ni para médicos ni pacientes.",
      steps: [
        {
          step: "01",
          title: "El Médico Emite",
          desc: "Una firma biométrica vía Passkey autoriza la receta, que se acuña como registro en Soroban.",
        },
        {
          step: "02",
          title: "El Paciente Recibe",
          desc: "Sin cripto. El registro llega sin comisiones mediante un relayer que patrocina la transacción.",
        },
        {
          step: "03",
          title: "Verificado en Cualquier Lugar",
          desc: "Cualquier farmacia o clínica escanea un código QR para confirmar autenticidad, emisor y estado en la blockchain.",
        },
      ],
    },
    audience: {
      kicker: "Para todos en el proceso",
      title: "Un protocolo, dos experiencias",
      doctors: {
        title: "Para Médicos",
        points: [
          "Firma recetas con un Passkey biométrico — sin frases semilla.",
          "Credenciales verificables al instante, ligadas a tu licencia médica.",
          "Revoca o actualiza una receta en la blockchain con un toque.",
          "Un registro permanente y auditable de todo lo que emites.",
        ],
      },
      patients: {
        title: "Para Pacientes",
        points: [
          "Eres dueño de tu historial médico completo — viaja contigo.",
          "Recibe recetas al instante, sin comisiones.",
          "Comparte registros verificados con cualquier médico, donde sea.",
          "Sin configurar billeteras, sin jerga cripto, sin fricción.",
        ],
      },
    },
    roadmap: {
      kicker: "Roadmap",
      title: "De las recetas a un protocolo de salud completo",
      phases: [
        {
          phase: "Fase 0",
          title: "Recetas en blockchain",
          desc: "Recetas verificables y soulbound emitidas por médicos habilitados.",
          status: "En curso",
        },
        {
          phase: "Fase 1",
          title: "Registros Clínicos",
          desc: "Historial clínico completo basado en FHIR, propiedad del paciente y portable.",
          status: "Siguiente",
        },
        {
          phase: "Fase 2",
          title: "Agente de Salud IA",
          desc: "Un asistente privado que razona sobre tus registros verificados.",
          status: "Planeado",
        },
        {
          phase: "Fase 3",
          title: "Ecosistema e Integraciones",
          desc: "Farmacias, laboratorios y aseguradoras se conectan al protocolo.",
          status: "Planeado",
        },
      ],
    },
    waitlist: {
      kicker: "Acceso anticipado",
      title: "Sé el primero cuando lancemos en Chile",
      subtitle:
        "Únete a la lista y ayuda a dar forma a la salud verificable desde el primer día.",
      placeholder: "tu@email.com",
      cta: "Unirse a la Lista",
      success: "Estás en la lista. Te contactaremos.",
      invalid: "Ingresa un correo electrónico válido.",
    },
    footer: {
      tagline: "Construido sobre Stellar Soroban",
      built: "Construido sobre Stellar Soroban",
      rights: "Todos los derechos reservados.",
      columns: {
        product: { title: "Producto", links: ["Problema", "Solución", "Cómo funciona", "Roadmap"] },
        company: { title: "Empresa", links: ["Nosotros", "Contacto", "Trabaja con nosotros"] },
        legal: { title: "Legal", links: ["Privacidad", "Términos", "Seguridad"] },
      },
    },
  },
} as const;

export type Translation = (typeof translations)[Language];
