# Perfiles de Médico y Paciente — diseño para aprobar

Investigación + gap analysis previo a construir. La idea: **no inventar campos**;
guardar lo que un sistema clínico chileno real necesita para que la receta y la
ficha tengan validez, y nada más.

## Marco legal que nos obliga (Chile)

- **Receta electrónica** — Ley 20.724 ("Ley de Fármacos") + reglamento SNRE.
  El prescriptor debe estar inscrito en el **Registro Nacional de Prestadores
  Individuales de la Superintendencia de Salud**, y la receta debe identificar:
  profesional prescriptor, paciente, productos, y firma.
- **Ficha clínica** — Ley 20.584 + **Decreto 41**. Contenido mínimo, confidencial,
  se conserva ≥15 años. Exige identificación del paciente (nombre, RUT, edad,
  fecha nac., teléfono, dirección), antecedentes, motivo de consulta y datos
  clínicos básicos (peso, talla, IMC).

Traducción a nuestro caso: **la receta on-chain ya cumple el "qué se recetó" y el
anclaje inmutable**; lo que falta es la **identificación legal del prescriptor y
del paciente** alrededor de ella.

---

## MÉDICO — tabla `doctors` hoy vs. lo que falta

| Campo | ¿Existe hoy? | Acción |
|---|---|---|
| `name` | ✅ | — (sync con on-chain `full_name`) |
| `email` | ✅ | — |
| `specialty` | ✅ | editable en perfil |
| `license_num` (N° Superintendencia) | ✅ | **hacerlo obligatorio + editable** |
| `rut` | ✅ | editable en perfil |
| `bio` | ✅ | editable |
| `telemedicine` | ✅ | toggle |
| **`phone`** | ❌ | **agregar** — contacto en receta |
| **`center_name`** | ❌ | **agregar** — membrete de la receta |
| **`center_address`** | ❌ | **agregar** — membrete |
| **`signature_url`** / `signature_hash` | ❌ | **agregar** — firma/sello estampado |
| permisos (cannabis, controlados) | ✅ on-chain | ya vive en `DoctorRegistry.permissions` |

**Migración médico:** 4 columnas nuevas (`phone`, `center_name`, `center_address`,
`signature_url`). Nada se rompe: todas `NULL`-ables.

**Sección "Mi perfil" (portal médico):** un form que lee/escribe estos campos vía
`PUT /api/doctor/profile`. Nombre + N° registro se muestran como "verificado
on-chain" cuando coinciden con `DoctorRegistry`.

---

## PACIENTE — tabla `patient_health_records` hoy vs. lo que falta

Hoy es puramente **clínica** (sangre, peso, alergias…). Le falta la **identidad
legal** que el Decreto 41 exige y que la receta/farmacia necesitan.

| Campo | ¿Existe hoy? | Acción |
|---|---|---|
| `blood_type`, `height_cm`, `weight_kg`, `bmi` | ✅ | — |
| `allergies`, `conditions`, `vaccinations` | ✅ | — |
| `primary_doctor(_specialty)`, `notes` | ✅ | — |
| **`full_name`** | ❌ | **agregar** — identificación ficha |
| **`rut`** | ❌ | **agregar** — obligatorio ficha + receta |
| **`birthdate`** | ❌ | **agregar** — edad legal |
| **`phone`** | ❌ | **agregar** |
| **`address`** | ❌ | **agregar** |
| **`prevision`** (Fonasa/Isapre) | ❌ | **agregar** — sistema chileno |
| **`emergency_contact`** | ❌ | **agregar** |

**Migración paciente:** 7 columnas nuevas, todas `NULL`-ables. La ficha clínica
que el médico va construyendo (historial, evoluciones) se apoya en `appointments`
+ estos datos + `notes`; los anclajes inmutables van al contrato `ClinicalRecord`
(hash de cada entrada, sin PHI on-chain).

**Sección "Mi perfil" (portal paciente):** form análogo, `PUT /api/patient/profile`.

---

## Qué NO va al perfil (es por-evento, no del perfil)

- Fecha de emisión, folio, diagnóstico CIE-10, refills → **por receta**.
- Motivo de consulta, evolución → **por cita / entrada de ficha**.

Eso ya lo cubren `prescriptions` (on-chain) y `appointments`.

---

## Plan de construcción (una vez aprobado esto)

1. **Migración** — 4 cols en `doctors`, 7 en `patient_health_records`. Idempotente.
2. **API** — `PUT/GET /api/doctor/profile`, `PUT/GET /api/patient/profile`
   (guardadas con `requireUser()` + ownership, no `?email=` a secas).
3. **UI médico** — sección "Mi perfil" en el portal.
4. **UI paciente** — sección "Mi perfil" en el portal.
5. Recién entonces: booking → Meet → ficha → receta→farmacia (el resto del flujo).

---

### Fuentes
- Sistema Nacional de Receta Electrónica — https://recetaelectronica.minsal.cl/
- ISP, validación de receta electrónica — https://www.ispch.cl/
- Decreto 41 (reglamento fichas clínicas, Ley 20.584) — https://www.conicyt.cl/fonis/files/2013/03/Decreto-N%C2%BA-41-Reglamento-ley-20.584-sobre-Fichas-Cl%C3%ADnicas.pdf
- Ley 20.584 (derechos y deberes del paciente) — SUSESO / SSMSO
