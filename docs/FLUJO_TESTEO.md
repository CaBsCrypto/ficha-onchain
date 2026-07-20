# Flujo de Testeo — recorrido completo TrustLeaf

Mapa del recorrido de punta a punta, con **qué existe hoy**, **qué falta**, y **cómo
se prueba cada paso**. Sirve para (a) el guion de la demo D3 y (b) saber qué lógica
todavía hay que construir antes de grabar.

Leyenda: ✅ listo · ⚠️ parcial · ❌ falta

---

## Paso 0 — Onboarding del médico (el admin lo habilita)

Para que exista un médico, el administrador lo habilita. Hay dos caminos posibles:

| Camino | Estado | Cómo |
|---|---|---|
| **Admin agrega al médico directo** | ✅ existe | `POST /api/admin/doctors` (detrás de `WAITLIST_ADMIN_TOKEN`) + página `/admin/doctors` |
| **Médico solicita → admin aprueba** | ❌ falta | Hoy solo hay un `waitlist` crudo (email + rol). No convierte una solicitud en médico. |

**Decisión para el testeo:** usar el camino directo (admin agrega). El flujo
"solicitud → aprobación" queda como mejora posterior (no bloquea la demo).

**Prueba:** el médico (`cabscryptocontacto@gmail.com`) ya está en `doctors` como
activo. Verificable en `GET /api/doctors`.

---

## Paso 1 — El médico tiene su cuenta y completa su perfil

| Sub-paso | Estado | Notas |
|---|---|---|
| Login (Privy/Google) | ✅ | Login manual del owner; agentes no pueden loguear |
| Perfil legal (registro Superintendencia, RUT, especialidad, centro, firma) | ✅ | Sección **Mi perfil** (`/doctor?tab=perfil`) |
| Autorización on-chain para recetar | ✅ | `doctor-registry` → `is_authorized=true` |

**Prueba:** loguear → Mi perfil → completar → guardar.

---

## Paso 2 — El médico planifica su disponibilidad

| Estado | Notas |
|---|---|
| ✅ | Tab **Disponibilidad**: grilla semanal, anti-solapamiento. `PUT /api/doctor/availability` |

**Prueba:** agregar bloques lun–vie 09–13. Verificable: `GET /api/doctor/slots`.

---

## Paso 3 — El paciente busca y encuentra disponibilidad, y reserva

| Sub-paso | Estado | Notas |
|---|---|---|
| Paciente ve médicos disponibles | ✅ | `GET /api/doctors` (selector) |
| Ve horas libres reales | ✅ | `GET /api/doctor/slots` (resta tomadas/pasadas/días off) |
| Reserva | ✅ | `POST /api/appointments`; anti doble-reserva (409) |

**Prueba:** portal paciente → Consultas → Solicitar → elegir médico/fecha/hora → reservar.

---

## Paso 4 — La consulta (videollamada)

| Sub-paso | Estado | Notas |
|---|---|---|
| Sala de video en la cita | ✅ | Telemedicina → enlace Jitsi en `meet_link`; botón "Entrar" en ambos portales |
| "Inicio de consulta" como evento explícito | ⚠️ | Hoy el enlace existe desde que se agenda; no hay un botón "iniciar consulta" que marque el arranque |

**Prueba:** reservar tipo Telemedicina → aparece "Entrar a la consulta" en médico y paciente.

---

## Paso 5 — El paciente le da acceso a su ficha al médico  ← HUECO

Tu intuición: al iniciar la consulta, el paciente autoriza al médico a ver/escribir
su ficha (on-chain `grant_write_access`).

| Sub-paso | Estado | Notas |
|---|---|---|
| El contrato soporta grant/revoke | ✅ | `ClinicalRecord.grant_write_access` (owner firma) |
| API/UI para que el paciente otorgue acceso | ❌ **falta** | Hoy el grant se hizo por CLI. No hay `/api/ficha/grant` ni botón en el portal |
| Firma del grant por el paciente | ⚠️ | El owner (paciente) debe firmar; en el demo el server no tiene la llave del paciente (igual que "activar receta") |

**Qué construir:** un flujo donde el paciente autoriza al médico. Para el demo,
el grant ya está hecho (paciente controlado), así que el médico **ya puede escribir**;
falta la **UI/registro** del consentimiento para que se vea en cámara.

---

## Paso 6 — El médico genera la RECETA médica (queda anexada al paciente)

| Sub-paso | Estado | Notas |
|---|---|---|
| Emitir receta on-chain | ✅ | `POST /api/mint` → `mode:onchain`, Decreto 41, hash FHIR anclado |
| Queda asociada al paciente | ✅ | `prescription-soulbound`; el paciente la ve en su portal |
| Activar / farmacia valida | ✅ | `activate` (paciente logueado) + QR de verificación |

**Prueba:** el flujo de mint está validado (rxId real, tx en testnet).

---

## Paso 7 — La FICHA on-chain (similar a la receta)

| Sub-paso | Estado | Notas |
|---|---|---|
| Médico ancla entrada en la ficha | ✅ | `POST /api/ficha/entry` → `mode:onchain` (tab Ficha del paciente) |
| Paciente ve su historial on-chain | ✅ | Card "Historial clínico on-chain" |
| Ligar el "anclar ficha" al consentimiento del Paso 5 | ⚠️ | Funciona porque el grant ya está hecho; falta atarlo al flujo de consentimiento |

---

## Paso 8 — Documentos / licencias médicas

| Estado | Notas |
|---|---|
| ✅ | `document-soulbound` desplegado; `POST /api/documents/mint` → `mode:onchain` |

---

## Resumen: qué falta construir (además de lo estético)

1. ❌ **Consentimiento del paciente al médico** (Paso 5) — el hueco más importante:
   API + UI para que el paciente autorice al médico (grant on-chain), idealmente
   al iniciar la consulta. Es lo que ata todo el modelo "paciente dueño de sus datos".
2. ⚠️ **"Iniciar consulta"** como evento (Paso 4) — un botón que marque el arranque
   y dispare el consentimiento del Paso 5.
3. ⚠️ **Solicitud→aprobación de médicos** (Paso 0) — opcional; el admin-directo alcanza para el demo.
4. 🎨 **Pulido visual** de todo el recorrido para la grabación.

## Cómo se valida hoy (automático)

- `npm run test:flow` — recorre HTTP: médicos → disponibilidad → slots → reserva → Meet → ficha on-chain. **10/10**
- `npm run test:onchain` — lee los contratos: registry, recetas, ficha, documentos. **10/10**

Lo que estos scripts **no** cubren (requiere login real del owner): activar receta,
consentimiento del paciente, y el recorrido visual en el navegador.
