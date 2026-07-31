# Runbook de continuidad — TrustLeaf / ficha-onchain

Qué hacer si se pierde un secreto, la base o el deploy. **Nunca escribas valores
de secretos en este archivo ni en ningún archivo del repo.**

## 1. Inventario de secretos críticos

Todos viven en **dos lugares**: `.env.local` (gitignorado, solo en la máquina del
founder) y **Vercel → Project Settings → Environment Variables** (producción).

| Secreto | Qué es | Dónde vive |
|---|---|---|
| `TRUSTLEAF_DATA_KEY` | Clave AES-256-GCM (64 hex) que cifra texto clínico en Neon (`src/lib/crypto/at-rest.ts`) | `.env.local` + Vercel |
| `TRUSTLEAF_RUT_PEPPER` | Pepper del HMAC-SHA256 sobre el RUT → `rut_hash` (`src/lib/identity/`) | `.env.local` + Vercel |
| `DEMO_DOCTOR_SECRET` | Clave Stellar del médico demo registrado en `DoctorRegistry` | `.env.local` + Vercel |
| `RELAYER_SECRET` | Clave Stellar que paga/firma transacciones del relayer | `.env.local` + Vercel |
| `SANDBOX_OWNER_SECRET` | Clave del owner del record sandbox del MCP externo | `.env.local` + Vercel |
| `SANDBOX_CENTER_SECRET` | Clave del centro sandbox del MCP externo | `.env.local` + Vercel |
| `DATABASE_URL` | Connection string de Neon (dev: branch `ep-lingering-water-ahzh89z5`; prod: `ep-rapid-shadow-ahq94785`) | `.env.local` + Vercel; recuperable desde la consola de Neon |

## 2. Qué muere si se pierde cada uno

- **`TRUSTLEAF_DATA_KEY` — el peor caso.** Todo valor `enc:v1:` en Neon
  (resúmenes clínicos, detalle, exámenes base64) queda **irrecuperable para
  siempre**. No hay copia en la DB por diseño; `decryptAtRest` lanza error.
  Es el único secreto cuya pérdida destruye datos.
- **`TRUSTLEAF_RUT_PEPPER`.** Los `rut_hash` existentes dejan de coincidir: el
  MCP externo no encuentra fichas por RUT. Los datos siguen legibles, pero la
  identidad paciente↔ficha se rompe hasta re-hashear con RUTs originales (que
  no guardamos → en la práctica, remapeo manual).
- **`DEMO_DOCTOR_SECRET`.** No se puede mintear on-chain con el médico demo. No
  hay recuperación: no tenemos la admin key del registry
  (`GB2PFKB24QPIEB3VIKYTIEG7M4KRH5I4KBPV26LUC6KOE2YAWSCPXKZ6`) para registrar
  un médico nuevo. El mint degrada a simulado.
- **`RELAYER_SECRET`.** El append a la ficha on-chain degrada a simulado. Se
  regenera: crear cuenta nueva (friendbot en testnet) y re-otorgar grants.
- **`SANDBOX_*_SECRET`.** El sandbox del MCP deja de firmar. Regenerables:
  cuentas nuevas + redeploy del record sandbox + actualizar IDs.
- **`DATABASE_URL`.** Molestia menor: se re-obtiene de la consola de Neon
  (Vercel no la devuelve — `vercel env pull` llega vacío).

## 3. Respaldo recomendado (el founder lo hace a mano, hoy)

1. Abrir el gestor de contraseñas (1Password/Bitwarden). Crear bóveda
   "TrustLeaf infra".
2. Crear una entrada por secreto de la tabla, copiando el valor desde
   `.env.local`. Prioridad absoluta: `TRUSTLEAF_DATA_KEY`.
3. Copia offline: exportar los 7 valores a un archivo de texto en un USB
   cifrado (o imprimirlos) y guardarlo fuera del computador. **Nunca** en
   Drive/Dropbox en claro, nunca en el repo.
4. Añadir también: login de Neon, login de Vercel, login de Privy, y la
   passphrase de GitHub.
5. Verificar el respaldo: en una carpeta temporal, reconstruir un `.env.local`
   desde la bóveda y correr `npm run test:onchain` — debe pasar.
6. Repetir el paso 2 cada vez que se cree o rote un secreto.

## 4. Rotación de cada secreto

Patrón general: generar valor nuevo → actualizar `.env.local` → actualizar
Vercel (las 3 env: Production/Preview/Development) → **Redeploy** → actualizar
el gestor de contraseñas.

- **`TRUSTLEAF_DATA_KEY`** — la única con re-cifrado de datos:
  1. Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  2. **Antes de rotar**, descifrar todo con la clave vieja y re-cifrar con la
     nueva (hoy no existe script de re-key: hay que escribirlo usando
     `decryptAtRest`/`encryptAtRest`, correrlo con ambas claves a mano).
     Rotar sin re-cifrar = pérdida de datos igual que perder la clave.
  3. Recién entonces actualizar `.env.local` y Vercel.
- **`TRUSTLEAF_RUT_PEPPER`** — evitar rotar salvo compromiso: exige re-emitir
  todos los `rut_hash` (mismo problema que su pérdida, sección 2).
- **`RELAYER_SECRET`** — `stellar keys generate` (o friendbot en testnet),
  fondear la cuenta, re-otorgar el grant de append en el record del paciente
  demo, actualizar env, validar con `npm run test:flow`.
- **`DEMO_DOCTOR_SECRET`** — **no rotable**: la cuenta está registrada en
  `DoctorRegistry` y no tenemos la admin key para registrar otra. Protegerla
  es la única opción.
- **`SANDBOX_*_SECRET`** — generar cuentas nuevas, redeploy del record sandbox,
  actualizar IDs y env, validar con `npm run smoke:sandbox`.
- **API keys del MCP (`api_keys` en DB)** — emitir clave nueva para la org,
  revocar la vieja en la tabla; `MCP_LIVE_ENABLED` off es el kill-switch global.

## 5. Recuperación de desastres

- **Neon (datos corruptos/borrados):** console.neon.tech → proyecto → branch
  afectada → **Restore** (point-in-time) o crear branch desde un timestamp
  anterior y apuntar `DATABASE_URL` ahí. Después: `node scripts/migrate.mjs`
  (dev) o `POST /api/admin/migrate` (prod) — ambos idempotentes.
  Prod = `ep-rapid-shadow-ahq94785`; dev = `ep-lingering-water-ahzh89z5`.
- **Vercel (deploy roto):** vercel.com → proyecto → Deployments → deploy verde
  anterior → "Promote to Production". Si faltan env vars, recargarlas desde el
  gestor de contraseñas (sección 3) y Redeploy. Recordar las `NEXT_PUBLIC_*`:
  sin ellas el prerender falla.
- **Contratos testnet:** los IDs viven en `src/lib/stellar/config.ts` y
  `.env.local` (`NEXT_PUBLIC_DOCTOR_REGISTRY_ID`, `NEXT_PUBLIC_PRESCRIPTION_ID`,
  `DOCUMENT_SOULBOUND_ID`, `NEXT_PUBLIC_DEMO_CLINICAL_RECORD_ID`). Testnet se
  resetea periódicamente (~trimestral): si pasa, rebuild con
  `stellar contract build` (target `wasm32v1-none`), redeploy, registrar de
  nuevo el médico demo (necesita una admin key nueva — esta vez **guardarla**),
  y actualizar los 4 IDs en config + env. Verificar: `npm run test:onchain`.
- **Máquina del founder perdida:** clonar repo → reconstruir `.env.local`
  desde el gestor de contraseñas → `npm install` → `npm test` y
  `npm run test:onchain`.

## 6. Contactos y URLs críticos

- Producción: https://trustleaf-demo.vercel.app
- Vercel: https://vercel.com (proyecto trustleaf-demo)
- Neon: https://console.neon.tech (prod `ep-rapid-shadow-ahq94785`, dev `ep-lingering-water-ahzh89z5`)
- Privy: https://dashboard.privy.io — app `ficha-onchain` (`cmrix722m…`), **no** SalesAgent
- Explorer testnet: https://stellar.expert/explorer/testnet
- RPC Soroban: https://soroban-testnet.stellar.org
- Repo: GitHub, rama `main` protegida — todo entra por PR
- Estado del reset de testnet: https://developers.stellar.org (anuncios SDF)
