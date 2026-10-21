const LEGACY_LOCAL = '.trustleaf-local/sow2-clinical';
const LEGACY_EVIDENCE = 'docs/evidence/sow2-week1-2026-10-05';
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = () => new Error('clinical_run_configuration_invalid');

/** Selects one synthetic execution without touching files or interpreting a
 * caller-supplied path. Missing --run-id preserves the original demonstration.
 * Deployment evidence and its signer always belong to the original deployment.
 */
export function clinicalRunConfiguration(argv = process.argv.slice(2), { allowedModes, defaultMode } = {}) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string') ||
      !Array.isArray(allowedModes) || !allowedModes.length ||
      allowedModes.some(value => typeof value !== 'string' || !/^--[a-z]+(?:-[a-z]+)*$/.test(value) || value === '--run-id') ||
      new Set(allowedModes).size !== allowedModes.length ||
      (defaultMode !== undefined && !allowedModes.includes(defaultMode))) throw fail();
  let mode, runId = null;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--run-id') {
      if (runId !== null || !UUID_V4.test(argv[index + 1] ?? '')) throw fail();
      runId = argv[++index];
    } else if (allowedModes.includes(value) && mode === undefined) mode = value;
    else throw fail();
  }
  mode ??= defaultMode;
  if (mode === undefined) throw fail();
  const local = runId === null ? LEGACY_LOCAL : `${LEGACY_LOCAL}/runs/${runId}`;
  const evidence = runId === null ? LEGACY_EVIDENCE : `docs/evidence/sow2-week1-runs/${runId}`;
  return Object.freeze({
    mode, runId, legacy: runId === null, local, evidence,
    sharedLocal: LEGACY_LOCAL, sharedEvidence: LEGACY_EVIDENCE,
    deploymentFile: `${LEGACY_EVIDENCE}/deployment.json`,
    demonstrationFile: `${local}/demonstration.json`,
    restorationFile: `${local}/restoration.json`,
  });
}
