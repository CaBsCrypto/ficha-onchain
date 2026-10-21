#!/usr/bin/env node
/** Isolated application checks only. Never loads workspace env files or signs for a real user. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceFiles = [
  'clinical-flow-integration', 'clinical-api', 'clinical-chain', 'clinical-client',
  'clinical-document-route', 'clinical-history', 'clinical-identity', 'clinical-input',
  'clinical-keys', 'clinical-operations', 'clinical-permissions', 'clinical-store',
  'clinical-schema', 'clinical-web-schema',
].map(name => `src/__tests__/${name}.test.ts`);
const privateFiles = [
  'scripts/lib/clinical-crypto.test.mjs', 'scripts/lib/clinical-read.test.mjs',
  'scripts/lib/clinical-neon-store.test.mjs', 'scripts/lib/clinical-chain-write.test.mjs',
  'scripts/validate-clinical-web-schema.test.mjs',
];

// Only operating-system/toolchain variables travel to the isolated test processes.
const allowedEnvironment = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'CI',
]);
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnvironment.has(key.toUpperCase())));

async function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: childEnv, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', () => reject(new Error('isolated_tool_unavailable')));
    child.on('close', exitCode => resolve({ exitCode, stdout, stderr }));
  });
}

async function run() {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== '--isolated') throw new Error('explicit_isolated_mode_required');
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const outputDir = join(root, '.trustleaf-local', 'sow2-validation');
  await mkdir(outputDir, { recursive: true });
  const git = await execute('git', ['rev-parse', 'HEAD']);
  if (git.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim())) throw new Error('source_commit_unavailable');
  const productDiff = await execute('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'scripts', 'contracts', 'package.json', 'package-lock.json', 'tsconfig.json']);
  if (productDiff.exitCode !== 0) throw new Error('uncommitted_validation_sources');
  const checksums = [];
  for (const file of [...sourceFiles, ...privateFiles, 'contracts/clinical-history-private/src/test.rs', 'scripts/validate-clinical-web-flows.mjs']) {
    const bytes = await readFile(join(root, file));
    checksums.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  // Vite otherwise reads local env files independently of the inherited env.
  const isolatedConfig = { root, envDir: false, resolve: { alias: { '@': join(root, 'src') } },
    test: { environment: 'node', include: sourceFiles } };
  const configContent = `export default ${JSON.stringify(isolatedConfig)};\n`;
  const configPath = join(outputDir, `clinical-flows-${stamp}-vitest.config.mjs`);
  await writeFile(configPath, configContent, 'utf8');
  const rawReport = join(outputDir, `clinical-flows-${stamp}-vitest.json`);
  const app = await execute(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...sourceFiles, '--config', configPath, '--reporter=json', `--outputFile=${rawReport}`]);
  let parsed;
  try { parsed = JSON.parse(await readFile(rawReport, 'utf8')); } catch { throw new Error('isolated_application_report_unavailable'); }
  const cases = parsed.testResults?.flatMap(suite => suite.assertionResults ?? []) ?? [];
  const integration = parsed.testResults?.find(suite => suite.name?.replaceAll('\\', '/').endsWith('/clinical-flow-integration.test.ts'));
  const integrationPassed = !!integration?.assertionResults?.length && integration.assertionResults.every(test => test.status === 'passed');
  const expectedSuites = sourceFiles.map(file => join(root, file).replaceAll('\\', '/')).sort();
  const actualSuites = (parsed.testResults ?? []).map(suite => suite.name?.replaceAll('\\', '/')).sort();
  const allRequestedSuitesPresent = JSON.stringify(actualSuites) === JSON.stringify(expectedSuites);
  const appPassed = app.exitCode === 0 && parsed.success === true && cases.length > 0 && cases.every(test => test.status === 'passed') && integrationPassed && allRequestedSuitesPresent;
  const services = await execute(process.execPath, ['--test', '--test-reporter=tap', ...privateFiles]);
  const total = Number(services.stdout.match(/^# tests (\d+)\r?$/m)?.[1]);
  const passed = Number(services.stdout.match(/^# pass (\d+)\r?$/m)?.[1]);
  const failed = Number(services.stdout.match(/^# fail (\d+)\r?$/m)?.[1]);
  const servicesPassed = services.exitCode === 0 && total > 0 && passed === total && failed === 0;
  const contracts = await execute('cargo', ['test', '--offline', '--locked', '--manifest-path', 'contracts/Cargo.toml', '-p', 'clinical-history-private']);
  const contractCount = Number(contracts.stdout.match(/test result: ok\. (\d+) passed; 0 failed;/)?.[1]);
  const contractsPassed = contracts.exitCode === 0 && contractCount > 0;
  const report = {
    schemaVersion: 1, kind: 'isolated-clinical-web-flow-validation', startedAt, completedAt: new Date().toISOString(),
    sourceCommit: git.stdout.trim(), status: appPassed && servicesPassed && contractsPassed ? 'passed' : 'failed',
    newStellarTransactions: 0, liveDatabaseWrites: 0, authenticPrivySessions: 0,
    workspaceEnvironmentFilesLoaded: false, applicationCredentialsRemovedFromChildren: true,
    trackedValidationSourcesMatchCommit: true,
    isolatedConfig: { envDir: false, sha256: createHash('sha256').update(configContent).digest('hex') },
    checks: [
      { id: 'clinical-application-boundaries-and-shared-state-flow', status: appPassed ? 'passed' : 'failed', exitCode: app.exitCode, testsPassed: cases.filter(test => test.status === 'passed').length, testFiles: parsed.testResults?.length ?? 0, sharedStateIntegrationPassed: integrationPassed, allRequestedSuitesPresent },
      { id: 'private-crypto-read-storage-and-recovery', status: servicesPassed ? 'passed' : 'failed', exitCode: services.exitCode, testsPassed: Number.isFinite(passed) ? passed : 0 },
      { id: 'clinical-contract-local-host', status: contractsPassed ? 'passed' : 'failed', exitCode: contracts.exitCode, testsPassed: Number.isFinite(contractCount) ? contractCount : 0 },
    ],
    scope: ['create and confirm history', 'contribute and read private content', 'correct while preserving versions', 'independent permissions and withdrawal', 'identity, integrity, limits, cancellation and uncertain-attempt recovery'],
    limitations: ['SQL, Privy and RPC in the application lifecycle use controlled adapters.', 'Contract tests run in a local Soroban host; not Testnet.', 'No authenticated browser session, live database restart/persistence or new Testnet receipts are certified.', 'Visual review, 200% text enlargement and specifically authorized preview configuration remain separate.'],
    sourceChecksums: checksums,
  };
  const path = join(outputDir, `clinical-web-flows-${stamp}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
  // Do not forward provider diagnostics, credentials or private test payloads.
  console.log(JSON.stringify({ status: report.status, sourceCommit: report.sourceCommit, checks: report.checks,
    newStellarTransactions: 0, liveDatabaseWrites: 0, authenticPrivySessions: 0,
    report: relative(root, path).replaceAll('\\', '/'), limitations: report.limitations }, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}
run().catch(error => {
  const allowed = new Set(['explicit_isolated_mode_required', 'source_commit_unavailable', 'isolated_tool_unavailable', 'isolated_application_report_unavailable', 'uncommitted_validation_sources']);
  console.error(JSON.stringify({ status: 'failed', error: allowed.has(error.message) ? error.message : 'isolated_validation_unavailable', newStellarTransactions: 0 }));
  process.exitCode = 1;
});
