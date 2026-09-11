# Flujo real de datos médicos — revisión de código

> Mapa de la implementación base previa al borrador defensivo de API. Los cambios locales posteriores de mint todavía no están integrados ni desplegados; consultar SOW_WEEK_1_RECONCILIATION.md para el estado de versiones.

Fecha: 2026-09-06. Inspección estática del checkout compartido; no se consultaron pacientes, bases de datos, secretos ni variables desplegadas. No se enviaron transacciones. Este mapa describe implementación, no certifica cumplimiento normativo, seguridad clínica ni configuración efectiva de producción. El cierre SOW 1 se limita a DoctorRegistry y PrescriptionSoulbound; ficha/MCP se describen para evitar extrapolar sus propiedades a recetas.

## Receta: portal → API → FHIR → Stellar y Neon

| Paso | Implementación y datos | Evidencia de código |
| --- | --- | --- |
| Portal | Formulario en memoria; digest del contenido e identidad estable de emisión en sessionStorage. Reintentos conservan identidad. No confundir identidad de emisión con identidad autenticada del médico. | `src/components/doctor/RecetasTab.tsx:229`; `src/lib/prescription-issuance.ts` |
| Petición | POST JSON incluye wallet destinataria, datos identificatorios del paciente y prescriptor, diagnóstico, medicamento, dosis, cantidad y consentimiento declarado. El servidor recibe contenido legible. | `src/app/api/mint/route.ts:118` |
| Acceso | `requireAuthOrDemo` exige usuario autenticado cuando enforcement está activo; permite demo cuando no lo está. El helper no comprueba rol de médico ni vincula identidad HTTP al firmante del contrato. | `src/app/api/mint/route.ts:94`; `src/lib/auth/privy-auth.ts:167` |
| Documento | Construye Bundle FHIR con Patient, Practitioner, Organization, Condition, MedicationRequest y Consent opcional. Añade UUID de emisión al Bundle, canonicaliza y calcula SHA-256 del texto sin cifrar. | `src/lib/fhir/index.ts:108`; `src/app/api/mint/route.ts:177` |
| Consentimiento | Booleano/fecha procedentes de body; validar campos no prueba firma o autorización del paciente. No exige consentimiento universal: solo valida fecha si se declara concedido. | `src/app/api/mint/route.ts:154`; `src/lib/decreto41.ts:168` |
| Firma | Emite con clave custodial de médico demo configurada en servidor; comprueba esa wallet en Registry. El relayer firma fee-bump y paga. No es firma independiente del profesional conectado en portal. | `src/app/api/mint/route.ts:250`, `:296`; `src/lib/stellar/server.ts:38`, `:126` |
| Cadena | Envía hash **y medicamento y dosis legibles**, wallets médico/paciente, unidades y vencimiento. El contrato guarda además saldo, estado y timestamp. Datos públicos de blockchain, aunque la interfaz limite consultas. | `src/app/api/mint/route.ts:270`; `contracts/prescription-soulbound/src/lib.rs:103` |
| Neon | Guarda espejo best-effort en prescriptions_log: paciente/email, médico/email, medicamento, dosis, cantidad, CIE10, diagnóstico, tipo, ID y tx. Esta inserción no llama encryptAtRest. Un fallo de log no revierte emisión confirmada. | `src/app/api/mint/route.ts:185` |
| Payload completo | En esta ruta el Bundle sirve para hash; no hay carga ni persistencia demostrada del Bundle completo cifrado. No prometer repositorio recuperable de FHIR cifrado basándose en comentarios. | `src/app/api/mint/route.ts:177`, `:192` |

**Consecuencia para grabación:** usar exclusivamente valores sintéticos también en medicamento/dosis. La afirmación general «solo hashes van on-chain» es falsa para PrescriptionSoulbound. SHA-256 aporta compromiso/integridad bajo las condiciones del formato y preimagen; no es cifrado ni prueba veracidad médica, consentimiento o autoría humana.

## Cifrado que sí existe: ficha y documentos

`src/lib/crypto/at-rest.ts:64` implementa AES-256-GCM con IV aleatorio de 12 bytes, tag y prefijo enc:v1. Es cifrado de aplicación en servidor con clave compartida configurada, no cifrado extremo a extremo donde el servidor desconoce la clave. **Sin TRUSTLEAF_DATA_KEY devuelve texto sin cifrar** (`:68`); la inspección de código no demuestra que esa clave exista en Vercel. Lecturas de datos históricos sin prefijo también pasan sin descifrar (`:89`).

- `src/app/api/ficha/entry/route.ts:76` calcula hash antes de cifrar; `:112` persiste summary/detail mediante encryptAtRest. `src/app/api/ficha/entries/route.ts:55` descifra para responder.
- `src/app/api/ficha/document/route.ts:89` calcula hash de bytes originales; `:119` guarda base64 mediante encryptAtRest. `src/app/api/ficha/document/[id]/route.ts:53` descifra al recuperar.
- `src/app/api/admin/encrypt/route.ts:49` contiene backfill de esas columnas antiguas. Existencia del endpoint no demuestra ejecución ni cobertura de prescriptions_log.
- `src/app/api/ficha/entry/route.ts:52` contempla propietario o médico tratante con cita consentida. Ese control no debe suponerse compartido automáticamente por `/api/mint`.

Los comentarios sobre «encrypted FHIR» en `src/lib/fhir/index.ts:6`, `src/lib/stellar/server.ts:226` o rutas de consulta son descripciones, no evidencia de cifrado de receta. El código ejecutado anterior determina el comportamiento. El cifrado de infraestructura del proveedor, si existe, no sustituye estos controles ni se verificó aquí.

## MCP / centros: otro flujo y otro contrato

1. `/api/mcp` autentica API key y exige scope por herramienta (`src/app/api/mcp/route.ts:471`). `src/lib/auth/api-key.ts:82` bloquea live salvo flag; `:110` rechaza claves revocadas. La clave autentica organización, no una firma personal de paciente o médico.
2. El RUT normalizado se transforma mediante HMAC-SHA256 con pepper de servidor (`src/lib/identity/rut.ts:59`). Es seudonimización dependiente del secreto, no anonimato garantizado ni prueba ZK. La relación paciente/contrato queda en patient_records (`src/lib/identity/patient-records.ts:95`).
3. Consentimiento sandbox es autoaprobado por máquina y marcado auto_sandbox; live registra pending (`src/lib/identity/center-grants.ts:162`). Sandbox usa firmante custodial propietario para grant (`:164`). No presentar eso como consentimiento firmado por persona real.
4. Anchor exige grant activo y vincula hash a rut_hash, kind y content (`src/lib/identity/anchor.ts:101`, `:123`). El contenido recibido se procesa legible para hash; este flujo no persiste el artefacto completo. El emisor conserva el documento fuera de esta API. Solo sandbox firma append con clave de centro configurada (`:135`); live responde live_not_enabled (`:89`).
5. ClinicalRecord publica kind, hash, autor y timestamp, ligados al contrato del paciente; kind es lista cerrada (`src/app/api/mcp/route.ts:125`). Metadatos también pueden correlacionar personas/actividad. La protección de API de lectura no vuelve privado el ledger público.

## ZK: evaluación de alcance, sin implementación

Una futura prueba de conocimiento cero podría demostrar un predicado específico sobre credenciales o compromiso documental sin revelar sus entradas. Requiere definir emisor de credenciales, circuito, entradas públicas, vinculación de wallet/solicitud, revocación, anti-replay y verificador compatible con Soroban. Nada de ello está acreditado por un hash FHIR o por cifrado AES.

ZK **no corrige** un endpoint que usa una clave custodial autorizada para solicitudes insuficientemente autorizadas; tampoco elimina medicamento/dosis ya publicados ni configura cifrado ausente. Primero se deben resolver autorización HTTP vinculada al actor, consentimiento según el flujo, minimización de campos públicos y almacenamiento/gestión de claves. No añadir ZK al alcance SOW 1 ni prometerlo como condición ya cumplida.

## Herramientas y límites de revisión

La búsqueda de metadata de herramientas disponibles por «OpenZeppelin» no devolvió coincidencias. No se instaló ni configuró herramienta externa. Esta revisión estática no es auditoría formal externa. No se verificó estado de producción, no se recorrió portal autenticado ni se cambió infraestructura. Las líneas corresponden al checkout al inspeccionar; cambios concurrentes pueden desplazarlas.
