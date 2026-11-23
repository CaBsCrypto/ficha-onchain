#!/usr/bin/env node
/** Isolated application checks only. Never loads workspace env files or signs for a real user. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const testFile = name => `src/__tests__/${name}.test.ts`;
const isolatedSourceFiles = [
  'clinical-flow-integration', 'clinical-api', 'clinical-chain', 'clinical-client',
  'clinical-document-route', 'clinical-history', 'clinical-identity', 'clinical-input',
  'clinical-keys', 'clinical-operations', 'clinical-permissions', 'clinical-store',
  'clinical-schema', 'clinical-web-schema',
].map(testFile);
const privateFiles = [
  'scripts/lib/clinical-crypto.test.mjs', 'scripts/lib/clinical-read.test.mjs',
  'scripts/lib/clinical-neon-store.test.mjs', 'scripts/lib/clinical-chain-write.test.mjs',
  'scripts/validate-clinical-web-schema.test.mjs',
];
const portalFlows = {
  'permissions-and-receipts': ['clinical-client', 'clinical-permissions', 'clinical-flow-integration'],
  'notifications-and-revocation': ['doctor-clinical-inbox-ui', 'clinical-doctor-inbox', 'clinical-doctor-read', 'clinical-flow-integration'],
  'consultation-between-roles': ['private-signing-component', 'consultation-notices', 'prescription-bookings', 'regular-appointments'],
  'history-pdf-and-versions': ['clinical-flow-integration', 'clinical-history', 'clinical-prepared-review', 'clinical-document-route'],
  'prescription-list': ['prescription-list', 'private-prescription-read-performance'],
};

const portalLimitations = [
  'Functional tests use controlled adapters and do not certify a real Privy signature or a new Stellar receipt.',
  'The report covers the checked-out commit. Run it on the candidate revision to test changes absent from main.',
  'Test totals per flow can overlap because the shared integration covers permissions, withdrawal and clinical history.',
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
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || !['--isolated', '--portal-qa'].includes(mode)) throw new Error('explicit_isolated_mode_required');
  const portalQa = mode === '--portal-qa';
  const sourceFiles = portalQa ? [...new Set(Object.values(portalFlows).flat())].map(testFile) : isolatedSourceFiles;
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const outputDir = join(root, '.trustleaf-local', 'sow2-validation');
  await mkdir(outputDir, { recursive: true });
  const git = await execute('git', ['rev-parse', 'HEAD']);
  if (git.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim())) throw new Error('source_commit_unavailable');
  const productDiff = await execute('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'scripts', 'contracts', 'package.json', 'package-lock.json', 'tsconfig.json']);
  if (productDiff.exitCode !== 0) throw new Error('uncommitted_validation_sources');
  const checksums = [];
  const extraSources = portalQa ? [] : [...privateFiles, 'contracts/clinical-history-private/src/test.rs'];
  for (const file of [...sourceFiles, ...extraSources, 'scripts/validate-clinical-web-flows.mjs']) {
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
  const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  const app = await execute(process.execPath, [vitest, 'run', ...sourceFiles, '--config', configPath, '--reporter=json', `--outputFile=${rawReport}`]);
  let parsed;
  try { parsed = JSON.parse(await readFile(rawReport, 'utf8')); } catch { throw new Error('isolated_application_report_unavailable'); }
  const cases = parsed.testResults?.flatMap(suite => suite.assertionResults ?? []) ?? [];
  const integration = parsed.testResults?.find(suite => suite.name?.replaceAll('\\', '/').endsWith('/clinical-flow-integration.test.ts'));
  const integrationPassed = !!integration?.assertionResults?.length && integration.assertionResults.every(test => test.status === 'passed');
  const expectedSuites = sourceFiles.map(file => join(root, file).replaceAll('\\', '/')).sort();
  const actualSuites = (parsed.testResults ?? []).map(suite => suite.name?.replaceAll('\\', '/')).sort();
  const allRequestedSuitesPresent = JSON.stringify(actualSuites) === JSON.stringify(expectedSuites);
  const appPassed = app.exitCode === 0 && parsed.success === true && cases.length > 0 && cases.every(test => test.status === 'passed') && integrationPassed && allRequestedSuitesPresent;
  const appCheck = { id: 'clinical-application-boundaries-and-shared-state-flow', status: appPassed ? 'passed' : 'failed', exitCode: app.exitCode, testsPassed: cases.filter(test => test.status === 'passed').length, testFiles: parsed.testResults?.length ?? 0, sharedStateIntegrationPassed: integrationPassed, allRequestedSuitesPresent };
  const provenance = {
    schemaVersion: 1, startedAt, sourceCommit: git.stdout.trim(),
    newStellarTransactions: 0, liveDatabaseWrites: 0, authenticPrivySessions: 0,
    workspaceEnvironmentFilesLoaded: false, applicationCredentialsRemovedFromChildren: true,
    trackedValidationSourcesMatchCommit: true,
    isolatedConfig: { envDir: false, sha256: createHash('sha256').update(configContent).digest('hex') },
    sourceChecksums: checksums,
  };
  if (portalQa) {
    const suiteCases = new Map((parsed.testResults ?? []).map(suite => [suite.name.replaceAll('\\', '/'), suite.assertionResults ?? []]));
    const checks = Object.entries(portalFlows).map(([id, names]) => {
      const suites = names.map(name => suiteCases.get(join(root, testFile(name)).replaceAll('\\', '/')) ?? []);
      const tests = suites.flat();
      return { id, status: suites.every(suite => suite.length && suite.every(test => test.status === 'passed')) ? 'passed' : 'failed',
        testsPassed: tests.filter(test => test.status === 'passed').length, testFiles: names.map(testFile) };
    });
    await writeReport(outputDir, stamp, {
      ...provenance, kind: 'isolated-clinical-portal-qa', completedAt: new Date().toISOString(),
      status: appPassed && checks.every(check => check.status === 'passed') ? 'passed' : 'failed',
      checks: [appCheck, ...checks], limitations: portalLimitations,
    });
    return;
  }
  const services = await execute(process.execPath, ['--test', '--test-reporter=tap', ...privateFiles]);
  const total = Number(services.stdout.match(/^# tests (\d+)\r?$/m)?.[1]);
  const passed = Number(services.stdout.match(/^# pass (\d+)\r?$/m)?.[1]);
  const failed = Number(services.stdout.match(/^# fail (\d+)\r?$/m)?.[1]);
  const servicesPassed = services.exitCode === 0 && total > 0 && passed === total && failed === 0;
  const contracts = await execute('cargo', ['test', '--offline', '--locked', '--manifest-path', 'contracts/Cargo.toml', '-p', 'clinical-history-private']);
  const contractCount = Number(contracts.stdout.match(/test result: ok\. (\d+) passed; 0 failed;/)?.[1]);
  const contractsPassed = contracts.exitCode === 0 && contractCount > 0;
  const report = {
    ...provenance, kind: 'isolated-clinical-web-flow-validation', completedAt: new Date().toISOString(),
    status: appPassed && servicesPassed && contractsPassed ? 'passed' : 'failed',
    checks: [
      appCheck,
      { id: 'private-crypto-read-storage-and-recovery', status: servicesPassed ? 'passed' : 'failed', exitCode: services.exitCode, testsPassed: Number.isFinite(passed) ? passed : 0 },
      { id: 'clinical-contract-local-host', status: contractsPassed ? 'passed' : 'failed', exitCode: contracts.exitCode, testsPassed: Number.isFinite(contractCount) ? contractCount : 0 },
    ],
    scope: ['create and confirm history', 'contribute and read private content', 'correct while preserving versions', 'independent permissions and withdrawal', 'identity, integrity, limits, cancellation and uncertain-attempt recovery'],
    limitations: ['SQL, Privy and RPC in the application lifecycle use controlled adapters.', 'Contract tests run in a local Soroban host; not Testnet.', 'No authenticated browser session, live database restart/persistence or new Testnet receipts are certified.', 'Visual review, 200% text enlargement and specifically authorized preview configuration remain separate.'],
  };
  await writeReport(outputDir, stamp, report);
}

async function writeReport(outputDir, stamp, report) {
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
