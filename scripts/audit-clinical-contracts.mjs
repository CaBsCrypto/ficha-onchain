/** Public-only audit of the three current private Testnet contracts. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rpc } from '@stellar/stellar-sdk';
import { clinicalRunConfiguration } from './lib/clinical-run-config.mjs';
import { CLINICAL_AUDIT_DOCTOR, PRIVATE_PRESCRIPTION_ID, createClinicalContractAuditor } from './lib/clinical-contract-audit.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const ALLOWED = new Set(['clinical_run_configuration_invalid', 'audit_configuration_invalid', 'audit_network_mismatch', 'audit_instance_unavailable', 'audit_code_unavailable',
  'audit_wasm_mismatch', 'audit_interface_mismatch', 'audit_configuration_mismatch', 'audit_read_unavailable', 'audit_ledger_regressed',
  'audit_result_invalid', 'audit_authorization_invalid', 'audit_authorization_changed', 'audit_fixture_invalid', 'audit_fixture_mismatch']);
const safeReason = error => ALLOWED.has(error?.message) ? error.message : 'audit_provider_unavailable';
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
async function main() {
  const selected = clinicalRunConfiguration(process.argv.slice(2), { allowedModes: ['--audit'], defaultMode: '--audit' });
  if (process.env.NEXT_PUBLIC_STELLAR_NETWORK && process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet') throw Error('audit_network_mismatch');
  const registry = load('docs/evidence/testnet-generation-2026-09-07/private-registry.json');
  const prescription = load('docs/evidence/testnet-generation-2026-09-07/prescription-booking-deployment.json');
  const clinical = load(selected.deploymentFile);
  if ([registry, prescription, clinical].some(value => value.network !== 'testnet') || registry.contractId !== PRIVATE_REGISTRY_ID ||
      prescription.contractId !== PRIVATE_PRESCRIPTION_ID || prescription.registry !== PRIVATE_REGISTRY_ID ||
      clinical.registryId !== PRIVATE_REGISTRY_ID || clinical.registryWasmHash !== registry.wasmSha256) throw Error('audit_configuration_invalid');
  const auditor = createClinicalContractAuditor({ server: new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 20_000 }), readerAddress: clinical.deployer });
  await auditor.network();
  const report = { schemaVersion: 1, runId: selected.runId, network: 'testnet', syntheticOnly: true, readOnly: true,
    observedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
    newTransactions: 0, contracts: [], doctor: null, prescriptionFixture: null, clinicalExecution: { ready: false, blockers: [] } };
  const deployments = [
    { name: 'DoctorRegistryPrivate', contractId: registry.contractId, expectedWasmHash: registry.wasmSha256, interfaceVersion: 1, configuration: { get_admin: registry.admin } },
    { name: 'PrescriptionPrivate', contractId: prescription.contractId, expectedWasmHash: prescription.wasmSha256, interfaceVersion: 2,
      configuration: { get_registry: registry.contractId, get_admin: prescription.admin, get_booking_authority: prescription.bookingAuthority } },
    { name: 'ClinicalHistoryPrivate', contractId: clinical.contractId, expectedWasmHash: clinical.wasmHash, interfaceVersion: 1, configuration: { get_registry: registry.contractId } },
  ];
  for (const deployment of deployments) {
    try { report.contracts.push(await auditor.auditDeployment(deployment)); }
    catch (error) {
      report.contracts.push({ name: deployment.name, contractId: deployment.contractId,
        explorer: `https://stellar.expert/explorer/testnet/contract/${deployment.contractId}`, expectedWasmHash: deployment.expectedWasmHash,
        status: 'failed', reason: safeReason(error), wasmVerified: false, interfaceVerified: false, configurationVerified: false });
      report.clinicalExecution.blockers.push('contract_audit_failed:' + deployment.name);
    }
  }
  try {
    report.doctor = { status: 'verified', ...await auditor.doctor() };
    if (!report.doctor.authorized) report.clinicalExecution.blockers.push('doctor_not_currently_authorized');
    else if (report.doctor.remainingSeconds < 1200) report.clinicalExecution.blockers.push('doctor_authorization_insufficient_margin');
  } catch (error) {
    report.doctor = { wallet: CLINICAL_AUDIT_DOCTOR, status: 'failed', reason: safeReason(error) };
    report.clinicalExecution.blockers.push('doctor_authorization_unavailable');
  }
  try {
    const old = load('docs/evidence/testnet-generation-2026-09-07/private-flow-verification.json');
    if (!old.syntheticOnly || old.network !== 'testnet' || old.contractId !== prescription.contractId ||
        old.transactions?.mint?.status !== 'SUCCESS' || old.transactions.mint.contractId !== prescription.contractId ||
        old.transactions.mint.method !== 'mint_prescription') throw Error('audit_fixture_invalid');
    report.prescriptionFixture = await auditor.prescription({ ...old.prescription, rxId: String(old.transactions.mint.value) });
    report.prescriptionFixture.historicalMintReceipt = old.transactions.mint.hash;
    report.prescriptionFixture.receiptEvidence = 'previous_execution_manifest_not_new_rpc_receipt';
  } catch (error) {
    report.prescriptionFixture = { status: 'pending', reason: safeReason(error), contentRead: false, changed: false,
      note: 'Existing public prescription could not be read and matched. No new issuance is performed.' };
  }
  report.clinicalExecution.ready = report.clinicalExecution.blockers.length === 0;
  report.contractsVerified = report.contracts.filter(value => value.status === 'verified').length;
  report.status = report.contractsVerified === 3 ? 'contracts_verified' : 'audit_incomplete';
  save(path.join(ROOT, selected.evidence, 'contracts-audit.json'), report);
  console.log(JSON.stringify({ report: `${selected.evidence}/contracts-audit.json`, runId: selected.runId, readOnly: true,
    contractsVerified: report.contractsVerified, doctorAuthorized: report.doctor.authorized ?? false,
    doctorValidUntil: report.doctor.validUntilUtc ?? null, readyForNewExecution: report.clinicalExecution.ready,
    blockers: report.clinicalExecution.blockers, prescriptionFixture: report.prescriptionFixture.status, newTransactions: 0 }));
  if (report.contractsVerified !== 3) process.exitCode = 1;
}
main().catch(error => { console.error(JSON.stringify({ error: safeReason(error), readOnly: true, newTransactions: 0 })); process.exitCode = 1; });
