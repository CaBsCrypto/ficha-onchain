#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy the SANDBOX toy ClinicalRecord to Stellar Testnet.
#
# Wraps `stellar contract deploy` with the constructor owner arg. Run this on a
# machine WITHOUT WDAC (the Rust toolchain is blocked here) — see
# docs/SANDBOX_DEPLOY.md for the full runbook.
#
#   SANDBOX_OWNER=<cli-identity-or-secret>  ./scripts/deploy-sandbox-record.sh [wasm-path]
#
# Prints the deployed contract id (C...) to paste into SANDBOX_CLINICAL_RECORD_ID.
# ---------------------------------------------------------------------------
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
# `stellar contract build` emits to the wasm32v1-none target and produces a
# host-compatible module. Do NOT use a raw `cargo build --target
# wasm32-unknown-unknown` — newer Rust enables reference-types and the Soroban
# host rejects it ("reference-types not enabled").
WASM="${1:-contracts/target/wasm32v1-none/release/clinical_record.wasm}"

# The account that deploys AND is the record owner (signs future grants).
OWNER="${SANDBOX_OWNER:?Set SANDBOX_OWNER to a funded testnet CLI identity or secret}"

if [ ! -f "$WASM" ]; then
  echo "WASM no encontrado: $WASM" >&2
  echo "Compílalo:  cd contracts/clinical-record && stellar contract build" >&2
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "El CLI 'stellar' no está instalado. Ver https://developers.stellar.org/docs/tools/cli" >&2
  exit 1
fi

# Resolve the owner G-address (works whether OWNER is a CLI identity or a secret).
OWNER_ADDR="$(stellar keys address "$OWNER" 2>/dev/null || true)"
if [ -z "$OWNER_ADDR" ]; then
  echo "No pude resolver la dirección del owner. Usa una identidad del CLI (stellar keys generate ...)." >&2
  exit 1
fi

echo "Desplegando clinical-record (owner=$OWNER_ADDR) en $NETWORK ..." >&2
stellar contract deploy \
  --wasm "$WASM" \
  --source "$OWNER" \
  --network "$NETWORK" \
  -- --owner "$OWNER_ADDR"
# La última línea del stdout es el CONTRACT ID (C...) → SANDBOX_CLINICAL_RECORD_ID
