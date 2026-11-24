import type { rpc } from '@stellar/stellar-sdk';
export const CLINICAL_AUDIT_DOCTOR: string;
export const PRIVATE_PRESCRIPTION_ID: string;
export const PRIVATE_PRESCRIPTION_WASM_HASH: string;
export function createClinicalContractAuditor(options: { server: rpc.Server; readerAddress: string }): {
  verifyWasm(contractId: string, expectedWasmHash: string): Promise<{ observedWasmHash: string; wasmBytes: number; observedLedger: number }>;
  network(): Promise<{ network: string }>;
};
