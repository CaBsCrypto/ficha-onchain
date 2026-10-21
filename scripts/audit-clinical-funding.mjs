/** Audit the completed new execution's existing Friendbot funding receipt. */
import fs from 'node:fs';
import path from 'node:path';
import { clinicalRunConfiguration } from './lib/clinical-run-config.mjs';
import { verifyClinicalTestnetFunding } from './lib/clinical-funding-audit.mjs';
const ROOT = path.resolve(import.meta.dirname, '..');
async function main() {
  const selected = clinicalRunConfiguration(process.argv.slice(2), { allowedModes: ['--audit'], defaultMode: '--audit' });
  if (selected.legacy || (process.env.NEXT_PUBLIC_STELLAR_NETWORK && process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet')) throw Error('clinical_funding_configuration_invalid');
  const demonstration = JSON.parse(fs.readFileSync(path.join(ROOT, selected.evidence, 'demonstration.json'), 'utf8'));
  const patient = demonstration.transactions?.create_history?.source, transactionHash = demonstration.funding?.transactionHash;
  if (demonstration.runId !== selected.runId || demonstration.network !== 'testnet' || demonstration.syntheticOnly !== true ||
      demonstration.funding?.source !== 'Stellar Testnet Friendbot' || !/^[a-f0-9]{64}$/.test(transactionHash ?? '')) throw Error('clinical_funding_configuration_invalid');
  const transactionUrl = 'https://horizon-testnet.stellar.org/transactions/' + transactionHash;
  async function get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
    if (!response.ok) throw Error('clinical_funding_unavailable');
    return response.json();
  }
  const [transaction, operationPage] = await Promise.all([get(transactionUrl), get(transactionUrl + '/operations?limit=100')]);
  const report = { schemaVersion: 1, runId: selected.runId, observedAt: new Date().toISOString(), newTransactions: 0,
    ...verifyClinicalTestnetFunding({ transactionHash, patient, transaction, operations: operationPage._embedded?.records }) };
  const target = path.join(ROOT, selected.evidence, 'funding-audit.json');
  fs.writeFileSync(target + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(target + '.tmp', target);
  console.log(JSON.stringify({ readOnly: true, runId: selected.runId, fundingReceipt: report.status, transactionHash,
    patient, ledger: report.ledger, amountXlm: report.amountXlm, newTransactions: 0, report: `${selected.evidence}/funding-audit.json` }));
}
main().catch(error => {
  const allowed = ['clinical_run_configuration_invalid', 'clinical_funding_configuration_invalid', 'clinical_funding_receipt_unverified', 'clinical_funding_unavailable'];
  console.error(JSON.stringify({ error: allowed.includes(error?.message) ? error.message : 'clinical_funding_unavailable', readOnly: true, newTransactions: 0 }));
  process.exitCode = 1;
});
