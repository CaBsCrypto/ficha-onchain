# TrustLeaf — Estado del proyecto

> Actualización de aceptación 2026-09-05: ver [auditoría local](docs/SOW_AUDIT_2026-08-22.md). Los cierres y pruebas de red de abajo son históricos; D1/D2 requieren aceptación y D3 sigue abierto. No se revalidó Testnet.

> Fuente de verdad del **estado** (no del código). Qué está hecho, qué falta,
> qué se decidió y por qué. Se actualiza al cerrar cada pieza de trabajo.
> Última actualización: 2026-07-25
>
> Regla de esta casa: **no escribas aquí un "no se puede" sin volver a probarlo.**
> Tres afirmaciones de este archivo resultaron falsas por no re-testearlas, y una
> costó una PR entera construida sobre una limitación inexistente. `npm test`,
> `npm run test:flow` y `npm run test:onchain` existen para eso.

---

## 🎯 Objetivo actual: Instawards SOW (sprint de 30 días)

Flujo de receta verificable de punta a punta en Stellar Testnet, con hashes
comprobables en Stellar Expert. El SOW tiene 3 entregables.

| Entregable | Estado | Detalle |
| --- | --- | --- |
| **D1 — Contratos testeados y desplegados** | ✅ **Cerrado** | 4 contratos desplegados en testnet. `cargo test` (3 crates) en CI + suite `vitest` (67 tests). |
| **D2 — Interfaz doctor + paciente** | ✅ **Cerrado** | Flujo verificado **logueado en el navegador** con 3 actores Privy reales. |
| **D3 — Integración E2E + demo grabado** | 🟡 **Integración cerrada. Falta el video.** | Evidencia en [`docs/D3_EVIDENCE.md`](docs/D3_EVIDENCE.md), re-verificada contra Horizon el 2026-07-25: las 5 transacciones existen y devuelven `SUCCESS`. Guion en [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). |

**Fuera del alcance del SOW** (existen, funcionan, pero no se entregan ni se
graban aquí): el MCP externo para centros médicos (`/api/mcp`, ver `AGENTS.md`)
y el diario/mapa de dolor.

---

## ✅ El flujo completo, corrido de punta a punta (2026-07-25)

`npm run test:flow` → **19 PASS · 0 FAIL**, contra los contratos reales de
testnet. Cada paso devolvió `mode:"onchain"`, ninguno degradó a simulado:

| # | Paso | Resultado |
| --- | --- | --- |
| 1 | El paciente ve la lista de médicos | `GET /api/doctors` con el médico activo |
| 2–3 | Disponibilidad del médico → slots libres | 8 horas libres derivadas |
| 4 | El paciente reserva (telemedicina + Meet) | 201 + enlace de sala |
| 5 | Anti doble-reserva | 409, y el slot desaparece |
| 6 | El paciente **otorga consentimiento** | `grant_write_access` · onchain |
| 7 | El médico **agrega a la ficha** | `append_entry` · onchain |
| 8 | El historial de la ficha lo devuelve | ancla SHA-256 correcta |
| 9 | El médico **emite receta** (Decreto 41) | `mint_prescription` · onchain, rxId real |
| 10 | **Verificación pública sin sesión** | el `rx_hash` del contrato coincide con el del minteo |

El paso 9 vale además como prueba de la **validación del médico**: un médico que
no esté autorizado en `DoctorRegistry` no falla, degrada a `mode:"simulated"`
con `reason:"doctor_not_authorized"`, que en el test es rojo.

Para reproducirlo hace falta `TRUSTLEAF_REQUIRE_AUTH=false` en local (el script
llama sin sesión de Privy). En producción la bandera está en `true` y el mismo
recorrido se hace logueado.

---

## 🔗 Contratos en vivo (Stellar Testnet)

| Contrato | ID |
| --- | --- |
| DoctorRegistry | `CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O` |
| PrescriptionSoulbound | `CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL` |
| DocumentSoulbound (licencias) | `CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON` |
| ClinicalRecord (ficha demo) | `CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5` |

`npm run test:onchain` los comprueba los cuatro: **11 PASS · 0 FAIL**
(2026-07-25). Los IDs viven en `src/lib/stellar/config.ts` y `.env.local`; un
redeploy obliga a actualizar ambos **y** Vercel.

- Médico demo `GAAG2XS7…` **registrado y autorizado** on-chain.
- **No tenemos la clave de admin del registry**
  (`GB2PFKB24QPIEB3VIKYTIEG7M4KRH5I4KBPV26LUC6KOE2YAWSCPXKZ6`): podemos mintear
  con el médico ya registrado, pero **no registrar médicos nuevos on-chain**.

---

## ⬜ Pendiente (priorizado)

1. **Grabar el demo D3** — es un requisito pendiente; también faltan el hash #6 y la aceptación contra el SOW original. Guion en
   `docs/DEMO_SCRIPT.md`.
2. **Sembrar el médico en producción.** La tabla `doctors` de prod está
   **vacía**, así que `GET /api/doctors` devuelve `[]` y un paciente que busca
   hora no ve a nadie. Se arregla con el alta real (`POST /api/doctors` →
   `pending`) y la aprobación desde `/admin/doctors`; en local lo hace
   `node scripts/seed-demo-journey.mjs`. **Requiere el `WAITLIST_ADMIN_TOKEN` de
   prod, que solo tiene el dueño.**
3. **Completar el paso 6 de la evidencia D3.** La activación de la receta por el
   paciente es el único paso sin hash de transacción en `D3_EVIDENCE.md`
   ("validada en UI"). Se cierra capturando el hash al grabar.
4. **CI: sumar `npm test`** al workflow (requiere token con scope `workflow`).
5. **Fase 2** — firma por-cuenta real (passkey por usuario; hoy es una wallet
   demo compartida en servidor); periféricos (farmacia, dental, óptica,
   cuidador).

---

## 🧠 Decisiones tomadas (para no re-litigar)

- **SDK `@stellar/stellar-sdk` pineado a v14.** v13 no parsea protocol 27; v16
  rompe passkey-kit.
- **El registry se redesplegó con el relayer como admin** porque la clave del
  admin original se perdió.
- **Los contratos SÍ compilan local**, con `stellar contract build` (target
  `wasm32v1-none`), no con `cargo build --target wasm32-unknown-unknown`: este
  emite `reference-types` que la VM de Soroban rechaza. *(Este archivo afirmó
  durante semanas que WDAC lo impedía —`os error 4551`—; era falso y costó una
  PR diseñada alrededor de esa limitación.)*
- **`contracts/Cargo.lock` se commitea** — son binarios que van a la cadena, el
  build tiene que ser reproducible.
- **Auth = Privy**, no el sistema de sesiones propio. Identidad server-side vía
  `requireUser()`.
- **App de Privy correcta = `ficha-onchain` (`cmrix722m…`)**, no "SalesAgent".
- **CI (GitHub Actions) es el gate de merge, no Vercel.** En Vercel los deploys
  **Preview fallan siempre** (ambiental) y los **Production quedan Ready**: el
  check rojo "Vercel" en una PR se ignora, el que manda es `typecheck + build`.
- **Nada de modo demo.** `/demo/medico` y `/demo/paciente` eran maquetas que
  mostraban un hash de transacción inventado bajo el texto "El registro fue
  acuñado"; se borraron (PR #67). Entrar con Privy **es** el producto, sobre
  testnet.
- **Sin worktrees** — una feature a la vez, en git normal.

---

## 🛠️ Comandos que importan

```
npm test                    # 67 tests (vitest)
npm run test:onchain        # los 4 contratos contra testnet
npm run test:flow           # el journey completo contra la app corriendo
npx tsc --noEmit            # 0 errores en src/ antes de commitear
node scripts/migrate.mjs    # esquema en la rama Neon de dev
node scripts/seed-demo-journey.mjs   # deja un journey completo persistido
```

- Base local: rama **dev** de Neon (`ep-lingering-water-ahzh89z5`), nunca la de
  producción. Los deploys de **preview comparten la base de producción**: un
  preview que escribe, escribe en prod.
- Deploy de contrato: `stellar contract build` → `stellar contract deploy`.
