import { publicPortuguese } from './i18n-pt';
import type { Language } from "@/types";

/**
 * Lightweight i18n dictionary for the landing page (EN / ES).
 * Kept as a single typed object — no runtime deps. Swap for next-intl later.
 */
const baseTranslations = {
  en: {
    nav: {
      problem: "Problem",
      solution: "Solution",
      how: "How it works",
      roadmap: "Roadmap",
      legal: "Legal",
      traction: "Traction",
      verify: "Verify",
      cta: "Join Waitlist",
      demoPatient: "Patient Demo",
      demoDoctor: "Doctor Demo",
      pharmacy: "Pharmacy Portal",
    },
    hero: {
      badge: "Digital Clinical Records",
      title: "Your complete medical history,",
      titleAccent: "owned by you.",
      subtitle:
        "TrustLeaf puts your clinical history on blockchain — verified, portable, and always under your control. No more lost records when you switch doctors.",
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
      "kicker": "Our vision",
      "title": "One health record, owned by you",
      "subtitle": "We are building a connected health history with private access and verifiable records. Today, we start with prescriptions on Stellar Testnet.",
      "steps": [
        {
          "title": "Connected care",
          "desc": "Our goal: bring visits, prescriptions and results together."
        },
        {
          "title": "A history that follows you",
          "desc": "We envision continuity of care across providers and places."
        },
        {
          "title": "Access under your control",
          "desc": "Patient authorization is at the heart of that vision."
        }
      ]
    },
    how: {
      "kicker": "Today · Stellar Testnet demo",
      "title": "A private prescription, a verifiable record",
      "subtitle": "Synthetic data · No clinical use. Sign in with Privy; TrustLeaf covers Testnet transaction fees.",
      "steps": [
        {
          "step": "01",
          "title": "The patient authorizes",
          "desc": "The patient grants permission for prescription issuance, separately from confirming attendance."
        },
        {
          "step": "02",
          "title": "The doctor issues",
          "desc": "An authorized doctor signs the issuance and activation. Each confirmed transaction has a receipt."
        },
        {
          "step": "03",
          "title": "Read privately, verify the record",
          "desc": "The patient and issuing doctor open the private document. Transaction receipts can be checked on Stellar Expert."
        }
      ]
    },
    audience: {
      "kicker": "Our vision · Patients first",
      "title": "Your health has a story. Make it yours.",
      "subtitle": "We are building a space to help you understand and follow your health, with continuity and control.",
      "patients": {
        "title": "For you",
        "headline": "Your story, with you.",
        "points": [
          "Your health information, together and accessible.",
          "Control over whom you share it with."
        ],
        "futureLabel": "Part of our vision",
        "futureTitle": "A map to track your pain",
        "futureDescription": "Record where it hurts and follow how it changes over time. A future capability, not yet available in this demo."
      },
      "doctors": {
        "title": "For those who care for you",
        "headline": "More context to support you.",
        "points": [
          "Better understand your progress between visits.",
          "Consult the information you choose to share."
        ]
      }
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
      "kicker": "Roadmap",
      "title": "From prescriptions to a connected health history",
      "phases": [
        {
          "phase": "Today",
          "title": "Verifiable prescriptions",
          "desc": "Issuance, activation and revocation with private documents and receipts on Stellar Testnet.",
          "status": "Demo"
        },
        {
          "phase": "Next stages",
          "title": "Your clinical record",
          "desc": "Explore a portable health history based on FHIR. Scope and validation remain to be defined.",
          "status": "Proposed"
        },
        {
          "phase": "Future vision",
          "title": "AI health assistant",
          "desc": "Explore a private assistant grounded in authorized health information.",
          "status": "Exploration"
        },
        {
          "phase": "Future vision",
          "title": "Connected ecosystem",
          "desc": "Explore integrations with clinics, pharmacies and laboratories.",
          "status": "Exploration"
        }
      ]
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
      /** {count} is replaced with the live waitlist number. */
      socialProof: "Join {count} doctors and patients already on the list.",
    },
    traction: {
      badge: "Live traction",
      title: "Real usage, verifiable on-chain",
      subtitle:
        "Every prescription TrustLeaf issues is signed on Stellar and publicly auditable. Here's where the pilot stands today.",
      metrics: {
        prescriptions: "Prescriptions issued",
        doctors: "Doctors registered",
        stellarTx: "Stellar transactions",
        waitlist: "On the waitlist",
      },
      verified: {
        title: "Verified on Stellar",
        desc: "Every record is written to the Stellar testnet — inspect the transactions yourself.",
        cta: "View on Stellar Explorer",
      },
      compliance: {
        title: "Built for Chilean regulation",
        desc: "TrustLeaf is designed around the norms that govern prescriptions and clinical records in Chile.",
        items: [
          { label: "Decreto 41 MINSAL", desc: "Cannabis prescription requirements" },
          { label: "Ley 20.584", desc: "Patient rights & clinical records" },
          { label: "Ley 21.541", desc: "Medicinal cannabis framework" },
        ],
      },
      back: "Back to home",
    },
    verify: {
      badge: "Public verifier",
      title: "Verify a prescription",
      subtitle:
        "Paste a prescription hash or Stellar transaction ID to confirm it was issued by a licensed doctor and recorded on-chain.",
      placeholder: "Prescription hash or transaction ID",
      cta: "Verify",
      verifying: "Verifying…",
      emptyError: "Enter a prescription hash or transaction ID to verify.",
      resultTitle: "Verified ✓",
      resultSubtitle: "This prescription is authentic and recorded on Stellar.",
      fields: {
        date: "Prescription date",
        doctor: "Issuing doctor",
        patient: "Patient",
        status: "Status",
        reference: "On-chain reference",
      },
      mock: {
        date: "12 June 2026",
        doctor: "Dr. Ana García",
        patient: "P.R.",
        status: "Valid — Single use dispensing available",
      },
      explorerCta: "View on Stellar testnet explorer",
      disclaimer:
        "Demo verifier on Stellar testnet. Any non-empty input returns a sample verified record.",
      back: "Back to home",
    },
    footer: {
      "tagline": "Built on Stellar Soroban",
      "built": "Built on Stellar Soroban",
      "rights": "All rights reserved.",
      "columns": {
        "product": {
          "title": "Explore",
          "links": [
            {
              "label": "Problem",
              "href": "#problem"
            },
            {
              "label": "Our vision",
              "href": "#solution"
            },
            {
              "label": "How it works",
              "href": "#how"
            },
            {
              "label": "Roadmap",
              "href": "#roadmap"
            }
          ]
        },
        "legal": {
          "title": "Stay connected",
          "links": [
            {
              "label": "Join the waitlist",
              "href": "#waitlist"
            },
            {
              "label": "Waitlist privacy notice",
              "href": "#waitlist"
            }
          ]
        }
      }
    },
  },
  es: {
    nav: {
      problem: "Problema",
      solution: "Solución",
      how: "Cómo funciona",
      roadmap: "Roadmap",
      legal: "Legal",
      traction: "Tracción",
      verify: "Verificar",
      cta: "Unirse a la lista",
      demoPatient: "Demo Paciente",
      demoDoctor: "Demo Médico",
      pharmacy: "Portal Farmacia",
    },
    hero: {
      badge: "Historial Clínico Digital",
      title: "Tu historial clínico completo,",
      titleAccent: "tuyo para siempre.",
      subtitle:
        "TrustLeaf lleva tu ficha clínica a la blockchain — verificada, portátil y siempre bajo tu control. No más registros perdidos al cambiar de médico.",
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
      "kicker": "Nuestra visión",
      "title": "Una sola ficha clínica, tuya",
      "subtitle": "Construimos un historial conectado, con acceso privado y registros verificables. Hoy empezamos por las recetas en Stellar Testnet.",
      "steps": [
        {
          "title": "Atención conectada",
          "desc": "Buscamos reunir consultas, recetas y resultados en una misma historia."
        },
        {
          "title": "Un historial que te acompaña",
          "desc": "Aspiramos a dar continuidad a tu atención entre médicos y lugares."
        },
        {
          "title": "Acceso bajo tu control",
          "desc": "La autorización del paciente está en el centro de esa visión."
        }
      ]
    },
    how: {
      "kicker": "Hoy · Demo en Stellar Testnet",
      "title": "Una receta privada, un registro verificable",
      "subtitle": "Datos sintéticos · Sin uso clínico. Ingresas con Privy; TrustLeaf cubre las comisiones de Testnet.",
      "steps": [
        {
          "step": "01",
          "title": "El paciente autoriza",
          "desc": "El paciente concede permiso para emitir la receta, por separado de la confirmación de asistencia."
        },
        {
          "step": "02",
          "title": "El médico emite",
          "desc": "Un médico autorizado firma la emisión y la activación. Cada transacción confirmada tiene su recibo."
        },
        {
          "step": "03",
          "title": "Lectura privada y registro verificable",
          "desc": "El paciente y el médico emisor abren el documento privado. Los recibos se pueden contrastar en Stellar Expert."
        }
      ]
    },
    audience: {
      "kicker": "Nuestra visión · El paciente primero",
      "title": "Tu salud tiene una historia. Hazla tuya.",
      "subtitle": "Construimos un espacio para que puedas comprender y seguir tu salud, con continuidad y bajo tu control.",
      "patients": {
        "title": "Para ti",
        "headline": "Tu historia, contigo.",
        "points": [
          "Tu información de salud reunida y accesible.",
          "Control sobre con quién la compartes."
        ],
        "futureLabel": "En nuestra visión",
        "futureTitle": "Un mapa para seguir tu dolor",
        "futureDescription": "Registrar dónde duele y observar cómo cambia con el tiempo. Una capacidad futura, aún no disponible en esta demo."
      },
      "doctors": {
        "title": "Para quienes te cuidan",
        "headline": "Más contexto para acompañarte.",
        "points": [
          "Comprender mejor tu evolución entre consultas.",
          "Consultar la información que decidas compartir."
        ]
      }
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
      "kicker": "Roadmap",
      "title": "De recetas a un historial conectado",
      "phases": [
        {
          "phase": "Hoy",
          "title": "Recetas verificables",
          "desc": "Emisión, activación y revocación con documentos privados y recibos en Stellar Testnet.",
          "status": "Demo"
        },
        {
          "phase": "Próximas etapas",
          "title": "Tu ficha clínica",
          "desc": "Explorar un historial portable basado en FHIR. Alcance y validación por definir.",
          "status": "Propuesta"
        },
        {
          "phase": "Visión futura",
          "title": "Asistente de salud con IA",
          "desc": "Explorar un asistente privado basado en información de salud autorizada.",
          "status": "Exploración"
        },
        {
          "phase": "Visión futura",
          "title": "Ecosistema conectado",
          "desc": "Explorar integraciones con clínicas, farmacias y laboratorios.",
          "status": "Exploración"
        }
      ]
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
      /** {count} se reemplaza con el número real de la lista. */
      socialProof: "Únete a {count} médicos y pacientes que ya están en la lista.",
    },
    traction: {
      badge: "Tracción en vivo",
      title: "Uso real, verificable on-chain",
      subtitle:
        "Cada receta que emite TrustLeaf se firma en Stellar y es auditable públicamente. Así va el piloto hoy.",
      metrics: {
        prescriptions: "Recetas emitidas",
        doctors: "Médicos registrados",
        stellarTx: "Transacciones Stellar",
        waitlist: "En la lista de espera",
      },
      verified: {
        title: "Verificado en Stellar",
        desc: "Cada registro se escribe en la testnet de Stellar — inspecciona las transacciones tú mismo.",
        cta: "Ver en Stellar Explorer",
      },
      compliance: {
        title: "Hecho para la normativa chilena",
        desc: "TrustLeaf está diseñado en torno a las normas que rigen las recetas y las fichas clínicas en Chile.",
        items: [
          { label: "Decreto 41 MINSAL", desc: "Requisitos de receta canábica" },
          { label: "Ley 20.584", desc: "Derechos del paciente y ficha clínica" },
          { label: "Ley 21.541", desc: "Marco de cannabis medicinal" },
        ],
      },
      back: "Volver al inicio",
    },
    verify: {
      badge: "Verificador público",
      title: "Verifica una receta",
      subtitle:
        "Pega el hash de una receta o el ID de transacción de Stellar para confirmar que fue emitida por un médico habilitado y registrada on-chain.",
      placeholder: "Hash de receta o ID de transacción",
      cta: "Verificar",
      verifying: "Verificando…",
      emptyError: "Ingresa un hash de receta o ID de transacción para verificar.",
      resultTitle: "Verificada ✓",
      resultSubtitle: "Esta receta es auténtica y está registrada en Stellar.",
      fields: {
        date: "Fecha de la receta",
        doctor: "Médico emisor",
        patient: "Paciente",
        status: "Estado",
        reference: "Referencia on-chain",
      },
      mock: {
        date: "12 de junio de 2026",
        doctor: "Dra. Ana García",
        patient: "P.R.",
        status: "Válida — Dispensación de uso único disponible",
      },
      explorerCta: "Ver en el explorador de la testnet de Stellar",
      disclaimer:
        "Verificador de demostración en la testnet de Stellar. Cualquier entrada no vacía devuelve un registro verificado de ejemplo.",
      back: "Volver al inicio",
    },
    footer: {
      "tagline": "Construido sobre Stellar Soroban",
      "built": "Construido sobre Stellar Soroban",
      "rights": "Todos los derechos reservados.",
      "columns": {
        "product": {
          "title": "Explorar",
          "links": [
            {
              "label": "Problema",
              "href": "#problem"
            },
            {
              "label": "Nuestra visión",
              "href": "#solution"
            },
            {
              "label": "Cómo funciona",
              "href": "#how"
            },
            {
              "label": "Roadmap",
              "href": "#roadmap"
            }
          ]
        },
        "legal": {
          "title": "Sigamos en contacto",
          "links": [
            {
              "label": "Lista de interés",
              "href": "#waitlist"
            },
            {
              "label": "Privacidad del registro de interés",
              "href": "#waitlist"
            }
          ]
        }
      }
    },
  },
} as const;

// Legacy pages outside the public-language scope retain Spanish.
export const translations = { ...baseTranslations, pt: { ...baseTranslations.es, ...publicPortuguese } };

export type Translation = (typeof translations)[Language];
