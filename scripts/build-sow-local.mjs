// Build an isolated source snapshot. Never copy .env files or deployment config.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';

const root = process.cwd();
mkdirSync(join(root, '.next'), { recursive: true });
const snapshot = mkdtempSync(join(root, '.next', 'sow-build-'));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (file.split('/').some(p => p.startsWith('.env') || p === '.vercel')) continue;
  if (!/^(src\/|public\/|package(?:-lock)?\.json$|tsconfig\.json$|next\.config\.|postcss\.config\.)/.test(file)) continue;
  const target = join(snapshot, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
}
symlinkSync(resolve(root, 'node_modules'), join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
// Turbopack requires linked dependencies to remain inside its resolution root.
// Only this snapshot's filesystem root differs from the application config.
let resolutionRoot = root;
while (relative(resolutionRoot, snapshot).startsWith('..') || isAbsolute(relative(resolutionRoot, snapshot))) resolutionRoot = dirname(resolutionRoot);
const configPath = join(snapshot, 'next.config.ts');
const config = readFileSync(configPath, 'utf8');
if (!config.includes('turbopack: {}')) throw new Error('Update snapshot root handling for the changed Next config');
writeFileSync(configPath, config.replace('turbopack: {}', `turbopack: { root: ${JSON.stringify(resolutionRoot)} }`));
// Allowlist OS runtime variables; no application credentials are inherited.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|localappdata|appdata|number_of_processors)$/i.test(k)));
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_PRIVY_APP_ID: 'cmrix722m03d30clewd1fuffq', NEXT_PUBLIC_PASSKEY_ENABLED: 'false' });
console.log(`Isolated build snapshot: ${snapshot}`);
console.log('No environment files, database credentials or signing keys copied. Default Turbopack build; snapshot resolution root includes linked node_modules.');
const result = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', snapshot], { env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
