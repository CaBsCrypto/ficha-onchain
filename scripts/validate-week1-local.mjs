// Local acceptance evidence, separate from the historical four-contract audit.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const output = 'docs/evidence/week1-2026-09-06';
mkdirSync(output, { recursive: true });
const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0').filter(p => /^(src\/|contracts\/.*\.(rs|toml|lock)$|scripts\/.*\.mjs$|package(?:-lock)?\.json$|next\.config\.ts$|tsconfig\.json$|vitest\.config\.)/.test(p));
const report = {
  startedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  inputs: Object.fromEntries(sourceFiles.sort().map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])),
  checks: [],
};
const npm = process.platform === 'win32' ? [process.execPath, [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'test']] : ['npm', ['test']];
for (const [name, command, args] of [
  ['typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['vitest', ...npm],
  ['contracts', 'cargo', ['test', '--offline', '--locked', '--manifest-path', 'contracts/Cargo.toml', '-p', 'doctor-registry', '-p', 'prescription-soulbound', '-p', 'trustleaf-e2e']],
  ['build', process.execPath, ['scripts/build-sow-local.mjs']],
]) {
  console.log(`Running ${name}...`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${output}/${name}.txt`, (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''));
  report.checks.push({ name, command, args, exitCode: result.status ?? 1, log: `${name}.txt` });
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
}
report.completedAt = new Date().toISOString();
report.passed = report.checks.every(c => c.exitCode === 0);
writeFileSync(`${output}/local-validation.json`, JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.passed ? 0 : 1;
