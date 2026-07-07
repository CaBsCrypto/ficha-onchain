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
      legal: "Legal",
      cta: "Join Waitlist",
      demoPatient: "Patient Demo",
      demoDoctor: "Doctor Demo",
      pharmacy: "Pharmacy Portal",
    },
    hero: {
      badge: "Patient-owned health records on Stellar",
      title: "Your Medical History.",
      titleAccent: "Always Yours. Always Verified.",
      subtitle:
        "Your complete medical record, owned by you and verified on-chain. It follows you to any doctor, any city, any country — no lost files, no phone calls, no borders.",
      cta: "Join the Waitlist",
      secondary: "See how it works",
      card: {
        name: "Ana García",
        badge: "Verified Health Record",
        issued: "Complete health record",
        hash: "0x7f3a...c891",
        network: "Stellar",
      },
    },
    problem: {
      kicker: "The problem",
      title: "Your medical history is scattered everywhere",
      subtitle:
        "Your health story is split across a dozen clinics that never talk to each other. When it matters most, no one — not even you — can see the full picture.",
      cards: [
        {
          title: "Fragmented Records",
          stat: "10+",
          statLabel: "clinics that don't share your data",
          desc: "Every clinic, hospital and app keeps its own island of your history. There's no single, complete record — and no continuity of care.",
        },
        {
          title: "Trapped History",
          stat: "0",
          statLabel: "borders your records cross",
          desc: "Change doctors, move cities or travel abroad and your history stays behind — locked in a system you can't take with you.",
        },
        {
          title: "You Don't Own It",
          stat: "∞",
          statLabel: "hoops to get your own records",
          desc: "Chasing paperwork, calling clinics, waiting weeks for files that are legally yours. Your health data belongs to everyone but you.",
        },
      ],
    },
    solution: {
      kicker: "The solution",
      title: "One health record, owned by you",
      subtitle:
        "Your medical history lives on Stellar Soroban — complete, portable and verifiable. You decide who sees it, and you never lose it.",
      steps: [
        { title: "Doctors add to it", desc: "Each visit, prescription and result is signed on-chain and added to your record." },
        { title: "It lives with you", desc: "Your full history stays in your pocket — it follows you everywhere, fee-free." },
        { title: "You grant access", desc: "Any doctor sees your verified history in seconds — only with your authorization." },
      ],
    },
    how: {
      kicker: "How it works",
      title: "Your records, wherever care happens",
      subtitle: "No crypto knowledge required — for you or your doctors.",
      steps: [
        {
          step: "01",
          title: "Your record is built",
          desc: "Doctors sign each visit and prescription with a biometric Passkey. It's added to your history on Soroban — tamper-proof, forever.",
        },
        {
          step: "02",
          title: "It stays with you",
          desc: "No crypto needed. Your complete record lives in your wallet, delivered fee-free by a relayer that sponsors every transaction.",
        },
        {
          step: "03",
          title: "You share on your terms",
          desc: "Grant any doctor or pharmacy instant access with a scan. They see a verified history; you stay in control the whole time.",
        },
      ],
    },
    audience: {
      kicker: "For everyone in the loop",
      title: "Your record. Everyone on the same page.",
      doctors: {
        title: "For Doctors",
        points: [
          "See a patient's complete, verified history in seconds — with their consent.",
          "Sign visits and prescriptions with a biometric Passkey — no seed phrases.",
          "Add to a permanent, auditable record tied to your medical license.",
          "No more chasing faxes or piecing together fragmented charts.",
        ],
      },
      patients: {
        title: "For Patients",
        points: [
          "Own your complete medical history — it travels with you, for life.",
          "Switch doctors, cities or countries; your record arrives before you do.",
          "Grant and revoke access in a tap — no one sees your history without you.",
          "No wallet setup, no crypto jargon, no fees, no friction.",
        ],
      },
    },
    legal: {
      kicker: "Legal & Compliance",
      title: "Prescribe with legal backing",
      heading: "TrustLeaf meets every current Chilean regulation",
      subheading:
        "Cannabis prescriptions, informed consent and dispensing — issued airtight and verifiable on-chain.",
      compliance: [
        { label: "Decree 41 MINSAL" },
        { label: "Law 20.584" },
        { label: "Blockchain traceability" },
        { label: "Cannabis ISP" },
      ],
      cannabis: {
        title: "Medical cannabis",
        copy: "Unforgeable cannabis prescription. Digital informed consent. Verified single dispensing.",
      },
      soon: "Coming soon: specialized legal advisory",
      cta: "See legal detail",
      page: {
        badge: "Legal",
        title: "Legal compliance",
        subtitle:
          "Every legal safeguard TrustLeaf ships today — and what's coming next for cannabis medicine in Chile.",
        back: "Back to home",
        availableTitle: "Active features",
        availableBadge: "Available",
        soonTitle: "In development",
        soonBadge: "Coming soon",
        available: [
          {
            title: "Magistral cannabis prescription",
            desc: "Dedicated template with ISP-required fields.",
          },
          {
            title: "Digital informed consent",
            desc: "Signature and record on blockchain.",
          },
          {
            title: "Dispensing traceability",
            desc: "Single-use control for retained prescriptions.",
          },
          {
            title: "Decree 41 MINSAL compliance",
            desc: "All mandatory fields covered.",
          },
        ],
        upcoming: [
          {
            title: "Cannabis legal advisory",
            desc: "Network of lawyers specialized in medical cannabis (under construction).",
          },
          {
            title: "Automatic regulatory updates",
            desc: "Alerts whenever ISP regulation changes.",
          },
          {
            title: "Compliance audit",
            desc: "Monthly report for the doctor on their prescriptions.",
          },
        ],
      },
    },
    roadmap: {
      kicker: "Roadmap",
      title: "From verified prescriptions to your full health record",
      phases: [
        {
          phase: "Phase 0",
          title: "Verifiable prescriptions",
          desc: "Tamper-proof, patient-owned prescriptions issued by licensed doctors.",
          status: "In progress",
        },
        {
          phase: "Phase 1",
          title: "Your clinical record",
          desc: "Your complete FHIR-based medical history — patient-owned and portable.",
          status: "Next",
        },
        {
          phase: "Phase 2",
          title: "AI Health Agent",
          desc: "A private assistant that reasons over your verified record.",
          status: "Planned",
        },
        {
          phase: "Phase 3",
          title: "Ecosystem & Integrations",
          desc: "Clinics, pharmacies, labs and insurers plug into your record.",
          status: "Planned",
        },
      ],
    },
    waitlist: {
      kicker: "Early access",
      title: "Take ownership of your health",
      subtitle:
        "Join the waitlist and be first to own a medical record that's complete, portable and truly yours.",
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
      legal: "Legal",
      cta: "Unirse a la lista",
      demoPatient: "Demo Paciente",
      demoDoctor: "Demo Médico",
      pharmacy: "Portal Farmacia",
    },
    hero: {
      badge: "Tu historial de salud, en Stellar",
      title: "Tu Historial Médico.",
      titleAccent: "Siempre Tuyo. Siempre Verificado.",
      subtitle:
        "Tu ficha clínica completa, tuya y verificada on-chain. Te sigue a cualquier médico, ciudad o país — sin papeles perdidos, sin llamadas, sin fronteras.",
      cta: "Unirse a la Lista",
      secondary: "Ver cómo funciona",
      card: {
        name: "Ana García",
        badge: "Ficha Verificada",
        issued: "Ficha clínica completa",
        hash: "0x7f3a...c891",
        network: "Stellar",
      },
    },
    problem: {
      kicker: "El problema",
      title: "Tu historial médico está disperso por todas partes",
      subtitle:
        "Tu historia de salud está repartida en una decena de clínicas que nunca se comunican entre sí. Cuando más importa, nadie — ni siquiera tú — ve el cuadro completo.",
      cards: [
        {
          title: "Registros Fragmentados",
          stat: "10+",
          statLabel: "clínicas que no comparten tus datos",
          desc: "Cada clínica, hospital y app guarda su propia isla de tu historial. No hay un registro único y completo, ni continuidad en tu atención.",
        },
        {
          title: "Historial Atrapado",
          stat: "0",
          statLabel: "fronteras que cruza tu historial",
          desc: "Cambias de médico, te mudas o viajas al extranjero y tu historial se queda atrás — encerrado en un sistema que no puedes llevarte.",
        },
        {
          title: "No Es Tuyo",
          stat: "∞",
          statLabel: "trámites para obtener tu propia ficha",
          desc: "Persiguiendo papeles, llamando a clínicas, esperando semanas por archivos que legalmente son tuyos. Tus datos de salud son de todos menos tuyos.",
        },
      ],
    },
    solution: {
      kicker: "La solución",
      title: "Una sola ficha clínica, tuya",
      subtitle:
        "Tu historial médico vive en Stellar Soroban — completo, portable y verificable. Tú decides quién lo ve, y nunca lo pierdes.",
      steps: [
        { title: "Los médicos la nutren", desc: "Cada consulta, receta y resultado se firma on-chain y se suma a tu ficha." },
        { title: "Vive contigo", desc: "Tu historial completo va en tu bolsillo — te sigue a todas partes, sin comisiones." },
        { title: "Tú das el acceso", desc: "Cualquier médico ve tu historial verificado en segundos — solo con tu autorización." },
      ],
    },
    how: {
      kicker: "Cómo funciona",
      title: "Tu ficha, donde sea que te atiendan",
      subtitle: "No se requiere conocimiento de cripto — ni para ti ni para tus médicos.",
      steps: [
        {
          step: "01",
          title: "Tu ficha se construye",
          desc: "Los médicos firman cada consulta y receta con un Passkey biométrico. Se suma a tu historial en Soroban — inalterable, para siempre.",
        },
        {
          step: "02",
          title: "Se queda contigo",
          desc: "Sin cripto. Tu ficha completa vive en tu billetera, entregada sin comisiones por un relayer que patrocina cada transacción.",
        },
        {
          step: "03",
          title: "Compartes en tus términos",
          desc: "Das acceso instantáneo a cualquier médico o farmacia con un escaneo. Ven un historial verificado; tú mantienes el control todo el tiempo.",
        },
      ],
    },
    audience: {
      kicker: "Para todos en el proceso",
      title: "Tu ficha. Todos en la misma página.",
      doctors: {
        title: "Para Médicos",
        points: [
          "Ve el historial completo y verificado del paciente en segundos — con su consentimiento.",
          "Firma consultas y recetas con un Passkey biométrico — sin frases semilla.",
          "Suma a un registro permanente y auditable ligado a tu licencia médica.",
          "Se acabó perseguir faxes o reconstruir fichas fragmentadas.",
        ],
      },
      patients: {
        title: "Para Pacientes",
        points: [
          "Eres dueño de tu historial médico completo — te acompaña de por vida.",
          "Cambia de médico, ciudad o país; tu ficha llega antes que tú.",
          "Das y revocas acceso con un toque — nadie ve tu historial sin ti.",
          "Sin configurar billeteras, sin jerga cripto, sin comisiones, sin fricción.",
        ],
      },
    },
    legal: {
      kicker: "Legal & Compliance",
      title: "Prescribe con respaldo legal",
      heading: "TrustLeaf cumple con toda la normativa chilena vigente",
      subheading:
        "Receta canábica, consentimiento informado y dispensación — emitidos de forma infalsificable y verificables on-chain.",
      compliance: [
        { label: "Decreto 41 MINSAL" },
        { label: "Ley 20.584" },
        { label: "Trazabilidad blockchain" },
        { label: "Cannabis ISP" },
      ],
      cannabis: {
        title: "Medicina canábica",
        copy: "Receta canábica infalsificable. Consentimiento informado digital. Dispensación única verificada.",
      },
      soon: "Próximamente: Asesoría legal especializada",
      cta: "Ver detalle legal",
      page: {
        badge: "Legal",
        title: "Cumplimiento legal",
        subtitle:
          "Cada resguardo legal que TrustLeaf entrega hoy — y lo que viene para la medicina canábica en Chile.",
        back: "Volver al inicio",
        availableTitle: "Features activas",
        availableBadge: "Disponible",
        soonTitle: "En desarrollo",
        soonBadge: "Próximamente",
        available: [
          {
            title: "Receta magistral canábica",
            desc: "Template específico con campos ISP.",
          },
          {
            title: "Consentimiento informado digital",
            desc: "Firma y registro en blockchain.",
          },
          {
            title: "Trazabilidad de dispensaciones",
            desc: "Control de uso único de recetas retenidas.",
          },
          {
            title: "Cumplimiento Decreto 41 MINSAL",
            desc: "Todos los campos obligatorios.",
          },
        ],
        upcoming: [
          {
            title: "Asesoría legal canábica",
            desc: "Red de abogados especializados en cannabis medicinal (en construcción).",
          },
          {
            title: "Actualización normativa automática",
            desc: "Alertas cuando cambia la regulación ISP.",
          },
          {
            title: "Auditoría de cumplimiento",
            desc: "Reporte mensual para el médico de sus prescripciones.",
          },
        ],
      },
    },
    roadmap: {
      kicker: "Roadmap",
      title: "De recetas verificadas a tu historial completo",
      phases: [
        {
          phase: "Fase 0",
          title: "Recetas verificables",
          desc: "Recetas inalterables y soulbound, propiedad del paciente, emitidas por médicos habilitados.",
          status: "En curso",
        },
        {
          phase: "Fase 1",
          title: "Tu ficha clínica",
          desc: "Tu historial médico completo basado en FHIR — propiedad tuya y portable.",
          status: "Siguiente",
        },
        {
          phase: "Fase 2",
          title: "Agente de Salud IA",
          desc: "Un asistente privado que razona sobre tu historial verificado.",
          status: "Planeado",
        },
        {
          phase: "Fase 3",
          title: "Ecosistema e Integraciones",
          desc: "Clínicas, farmacias, laboratorios y aseguradoras se conectan a tu ficha.",
          status: "Planeado",
        },
      ],
    },
    waitlist: {
      kicker: "Acceso anticipado",
      title: "Toma el control de tu salud",
      subtitle:
        "Únete a la lista y sé de los primeros en tener una ficha médica completa, portable y de verdad tuya.",
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
