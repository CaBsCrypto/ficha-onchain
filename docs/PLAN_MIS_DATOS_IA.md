# Plan — "Mis datos": el paciente trae su ficha + IA que la entiende

*Preparado 2026-07-30. Decisiones tomadas: alcance completo (subida + solicitud
guiada), IA en 4 capacidades escalonadas, consentimiento IA por documento,
prioridad después de los irreversibles (respaldo de clave + PR-1b).*

## La tesis

La Ley 20.584 (art. 12-13) da al paciente derecho a copia de su ficha clínica;
la 21.541 (interoperabilidad) obliga a los prestadores a entregarla. Hoy ese
derecho se ejerce por papel y queda en un cajón. TrustLeaf se convierte en el
**destino** de ese derecho: pide tu ficha → súbela → queda cifrada, anclada y
bajo tu control → una IA te la explica y la vigila.

Nadie en Chile cierra ese círculo. Los EMR guardan la ficha PARA el prestador;
TrustLeaf la ordena PARA el paciente.

## Fase 0 — Prerrequisitos (esta semana, ya en el roadmap)

- Respaldo de `TRUSTLEAF_DATA_KEY` + runbook (irreversible si se pierde).
- PR-1b: rutas de la app al contrato per-paciente (irreversible si espera).
- Migración de prod pendiente (`api_access_log`, `patient_grants`, `api_rate_limits`).

## Fase 1 — El paciente trae sus datos (~1 semana)

**1a. Subida de documentos propios** (extiende `clinical_documents`, ya cifrada):
- Nueva categoría `self_uploaded` + origen (`patient`) en los documentos.
- UI en el portal paciente: "Agregar mis documentos" — PDF y foto (cámara del
  teléfono: el caso real es la receta/examen en papel).
- Anclaje on-chain igual que los documentos de médicos (hash del contenido,
  DocumentReference), autor = wallet del paciente.
- Se marca visualmente "Aportado por ti" vs "Emitido por Dr. X" — la procedencia
  es parte de la confianza del sistema.

**1b. Solicitud guiada a la clínica** (tabla nueva `record_requests`):
- Wizard: elige prestador → generamos la carta/email formal citando Ley 20.584
  art. 13 con los datos del paciente → el paciente la envía (mailto/copia).
- Seguimiento de plazo: la ley da 15 días hábiles — contador visible,
  recordatorio al vencer, y texto de escalamiento a la Superintendencia de
  Salud si no responden.
- Estado: borrador → enviada → respondida → documentos subidos (cierra el ciclo
  con 1a).

## Fase 2 — IA: extraer y ordenar (~1-2 semanas)

El cimiento de todo lo demás. Por documento subido, con **consentimiento
explícito por documento** (opt-in, registrado en `api_access_log` como
`ai.analyze` — la IA también aparece en "quién vio tu ficha").

- Pipeline: documento (PDF/foto) → Claude (visión) → extracción estructurada:
  diagnósticos (CIE-10 cuando se pueda), medicamentos, resultados de laboratorio
  con unidades y fechas, procedimientos.
- **El paciente confirma antes de guardar** — la IA propone, el humano decide.
  Lo confirmado se convierte en entradas estructuradas de la ficha (mismas
  tablas que ya usan los médicos, origen `patient+ai`).
- Nada del contenido va al LLM sin el opt-in; el hash on-chain se calcula sobre
  el documento original, no sobre la extracción.

## Fase 3 — IA: resumen en lenguaje simple (~1 semana)

- "Tu examen dice creatinina 1.4 — en palabras simples: …" por documento.
- Línea de tiempo de salud: la ficha completa (entradas de médicos + aportadas)
  como narrativa cronológica.
- Disclaimers no negociables: "esto no es diagnóstico ni reemplaza a tu médico"
  en cada superficie de IA.

## Fase 4 — IA: alertas y seguimiento (~2 semanas, requiere Fase 2 madura)

- Tendencias sobre datos estructurados: glicemia/presión/colesterol subiendo
  entre exámenes, receta crónica por vencer, control anual vencido.
- Interacciones medicamentosas básicas (sobre la lista estructurada de
  medicamentos, con fuente citable).
- Canal: la campana de notificaciones del roadmap (Fase "1 mes") — esta feature
  y aquella se refuerzan.

## Fase 5 — IA: chat con mi ficha (~1 semana, al final a propósito)

- "¿Cuándo fue mi última mamografía?" — respuestas SOLO con citas a documentos
  de la ficha ("según tu examen del 12/03…"), nunca consejo médico abierto.
- Se construye sobre las extracciones de Fase 2 (RAG sobre la ficha propia).
- Es lo más vistoso para demos/competencias — pero va último porque sin las
  fases 2-3 sería un chat que alucina sobre PDFs.

## Privacidad y legal (transversal)

- Consentimiento IA **por documento**, revocable, visible en el access-log.
- API de Anthropic sin retención para entrenamiento; citarlo en el
  consentimiento. Clave del API server-side, nunca en el cliente.
- Los documentos siguen cifrados at-rest (AES-256-GCM); al LLM viaja solo el
  documento consentido, por TLS, en el momento del análisis.
- La 21.719 (dic-2026) exige base de licitud para tratamiento con IA — el
  opt-in por documento ES esa base. Ventaja: lo tendremos antes que la multa.

## Orden de ejecución y estimación

| Semana | Entregable |
|---|---|
| 0 | Irreversibles del roadmap (clave, PR-1b, migración prod) |
| 1 | Fase 1 completa: subir documentos + solicitud guiada con plazo legal |
| 2-3 | Fase 2: extracción IA con confirmación del paciente |
| 4 | Fase 3: resúmenes + línea de tiempo |
| 5-6 | Fase 4: alertas |
| 7 | Fase 5: chat con citas |

Cada fase es demo-able por sí sola. Si una competencia exige demo antes, se
corta donde estemos y lo mostrado es real.

## Métricas de éxito (instrumentar desde Fase 1)

- Documentos subidos por paciente / semana.
- % de solicitudes a clínicas que terminan en documentos subidos (cierre del ciclo legal).
- % de documentos con análisis IA consentido.
- Extracciones confirmadas vs corregidas por el paciente (calidad de la IA).
