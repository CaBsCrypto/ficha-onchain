import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { clinicalRunConfiguration } from './clinical-run-config.mjs';

const options = { allowedModes: ['--run', '--readback', '--inspect', '--restore'] };
const first = '01234567-89ab-4cde-8fab-0123456789ab';
const second = 'fedcba98-7654-4321-bfed-cba987654321';
const configure = argv => clinicalRunConfiguration(argv, options);

test('legacy execution retains its exact local journal, evidence and deployment paths', () => {
  const configuration = configure(['--readback']);
  assert.equal(configuration.legacy, true);
  assert.equal(configuration.runId, null);
  assert.equal(configuration.local, '.trustleaf-local/sow2-clinical');
  assert.equal(configuration.evidence, 'docs/evidence/sow2-week1-2026-10-05');
  assert.equal(configuration.demonstrationFile, '.trustleaf-local/sow2-clinical/demonstration.json');
  assert.equal(configuration.restorationFile, '.trustleaf-local/sow2-clinical/restoration.json');
});

test('independent UUID executions isolate journals and public evidence while sharing only deployment references', () => {
  const a = configure(['--run', '--run-id', first]);
  const b = configure(['--run-id', second, '--readback']);
  assert.equal(a.mode, '--run');
  assert.equal(b.mode, '--readback');
  assert.equal(a.legacy, false);
  assert.equal(a.local, `.trustleaf-local/sow2-clinical/runs/${first}`);
  assert.equal(a.evidence, `docs/evidence/sow2-week1-runs/${first}`);
  for (const field of ['local', 'evidence', 'demonstrationFile', 'restorationFile']) assert.notEqual(a[field], b[field]);
  for (const field of ['sharedLocal', 'sharedEvidence', 'deploymentFile']) assert.equal(a[field], b[field]);
  assert.equal(a.deploymentFile, 'docs/evidence/sow2-week1-2026-10-05/deployment.json');
  assert.equal(a.sharedLocal, '.trustleaf-local/sow2-clinical');
  assert.ok(resolve(a.local).startsWith(resolve('.trustleaf-local/sow2-clinical/runs') + sep));
  assert.ok(resolve(a.evidence).startsWith(resolve('docs/evidence/sow2-week1-runs') + sep));
  assert.ok(Object.isFrozen(a));
});

test('a configured default mode is usable without silently accepting a missing required mode', () => {
  assert.equal(clinicalRunConfiguration([], { allowedModes: ['--inspect'], defaultMode: '--inspect' }).mode, '--inspect');
  assert.equal(clinicalRunConfiguration(['--run-id', first], { allowedModes: ['--inspect'], defaultMode: '--inspect' }).runId, first);
  assert.throws(() => configure([]), /clinical_run_configuration_invalid/);
  assert.throws(() => configure(['--run-id', first]), /clinical_run_configuration_invalid/);
});

test('malformed IDs, absolute paths, traversal, encoded traversal and noncanonical UUIDs are rejected', () => {
  for (const id of ['', '../other', '..\\other', '/tmp/other', 'C:\\other', '%2e%2e%2fother',
    first + '/extra', first + '\\extra', first.toUpperCase(), first + ' ',
    '01234567-89ab-1cde-8fab-0123456789ab', '01234567-89ab-4cde-7fab-0123456789ab',
    '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => configure(['--run', '--run-id', id]), /clinical_run_configuration_invalid/);
  }
});

test('duplicate modes or run selectors, unknown switches and incomplete selectors are rejected', () => {
  for (const args of [['--run', '--run'], ['--run', '--readback'], ['--readback', '--mainnet'],
    ['--run', '--run-id'], ['--run', '--run-id', '--inspect'],
    ['--run', '--run-id', first, '--run-id', second], ['--run', `--run-id=${first}`],
    ['--run', first], ['--run', '--output', '/tmp/report'], ['--run', 42]]) {
    assert.throws(() => configure(args), /clinical_run_configuration_invalid/);
  }
});

test('invalid mode policies cannot expand the CLI parsing boundary', () => {
  for (const policy of [{}, { allowedModes: [] }, { allowedModes: ['--run', '--run'] },
    { allowedModes: ['--run-id'] }, { allowedModes: ['run'] }, { allowedModes: ['--run'], defaultMode: '--restore' }]) {
    assert.throws(() => clinicalRunConfiguration(['--run'], policy), /clinical_run_configuration_invalid/);
  }
});
