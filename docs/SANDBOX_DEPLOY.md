# Desplegar el ClinicalRecord de juguete (sandbox) → anclaje real

> Pasa el flujo de consentimiento del sandbox de `mode:"simulated"` a un
> **grant real anclado en Stellar Testnet**, verificable en Stellar Expert. El
> código ya está listo (PR "sandbox-onchain-grant"): en cuanto existan las dos
> env vars, `request_consent` firma un `grant_write_access` real.
>
> **No se puede compilar el contrato localmente** (WDAC bloquea la toolchain de
> Rust — os error 4551). El WASM sale de CI o de una máquina sin WDAC (WSL/Docker
> con la toolchain de Soroban). Esta guía es para ejecutarla **tú**.

## Qué vas a obtener
- `SANDBOX_CLINICAL_RECORD_ID` — el contrato de juguete (una ficha compartida).
- `SANDBOX_OWNER_SECRET` — la llave del dueño del contrato, que firma los grants.

## Prerrequisitos
- `stellar` CLI instalado (`stellar --version`).
- El WASM de `clinical-record` compilado: `contracts/target/wasm32-unknown-unknown/release/clinical_record.wasm`
  - vía CI (artefacto de `.github/workflows/contracts.yml`) **o**
  - `cd contracts && cargo build --release --target wasm32-unknown-unknown -p clinical-record` en una máquina sin WDAC.
- Una cuenta testnet fundeada para pagar el deploy (o reusar el relayer).

## Pasos

### 1. Generar el keypair del dueño sandbox y fundearlo
```bash
stellar keys generate sandbox-owner --network testnet
stellar keys address sandbox-owner      # → G... (el owner)
# fundear:
curl "https://friendbot.stellar.org/?addr=$(stellar keys address sandbox-owner)"
```

### 2. Desplegar el contrato con el owner en el constructor
El constructor es `__constructor(env, owner)` (ver `contracts/clinical-record/src/lib.rs:73`).
```bash
stellar contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/clinical_record.wasm \
  --source sandbox-owner \
  --network testnet \
  -- --owner "$(stellar keys address sandbox-owner)"
# → imprime el CONTRACT ID (C...)
```
> El helper `scripts/deploy-sandbox-record.sh` envuelve este paso.

### 3. Cargar las env vars
- **Local (`.env.local`)** para probar:
  ```
  SANDBOX_CLINICAL_RECORD_ID=C...            # del paso 2
  SANDBOX_OWNER_SECRET=S...                   # secret de sandbox-owner (NUNCA commitear)
  RELAYER_SECRET=S...                         # ya lo tienes; paga el fee-bump
  ```
- **Vercel** (para prod): mismas tres, en el scope que corresponda. `SANDBOX_OWNER_SECRET` es un secreto — cárgalo tú, nunca pasa por el chat.

### 4. Registrar el ID en el código (opcional, si prefieres hardcode)
Hoy `SANDBOX_CLINICAL_RECORD_ID` se lee de env (`src/lib/identity/patient-records.ts`), así que con la env var alcanza. No hace falta tocar `config.ts`.

## Verificar el anclaje real
1. La wallet del centro (`api_orgs.signing_wallet`) debe ser una **G-address real**
   de testnet (el grant se otorga a ese address). Actualiza tu org de prueba.
2. Corre el flujo:
   ```bash
   npm run smoke:sandbox        # o request_consent vía MCP con una key sandbox
   ```
3. `request_consent` debe devolver `mode:"onchain"` + `grantTx` + `txUrl`.
4. Abre el `txUrl` en Stellar Expert → la tx `grant_write_access` en `SUCCESS`.

## Notas de seguridad
- Es el sandbox: **datos de juguete**, un contrato compartido. NO usar para pacientes reales.
- Si algo falla (contrato caído, secret ausente), el flujo **degrada a `simulated`**
  automáticamente — nunca rompe el demo, nunca ancla en el lugar equivocado.
- El append real de fichas (firmado por la wallet del centro) es el siguiente
  paso; este PR cubre el **grant** on-chain, que ya deja una tx verificable.
