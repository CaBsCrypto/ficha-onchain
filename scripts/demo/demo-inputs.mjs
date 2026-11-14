import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export function readDemoInputs(argv = process.argv.slice(2)) {
  const [envFlag, envFile, artifactsFlag, artifactsDir, ...args] = argv;
  if (envFlag !== '--env-file' || artifactsFlag !== '--artifacts-dir' || !envFile || !artifactsDir) {
    throw new Error('demo_input_paths_required');
  }
  const environmentPath = realpathSync(resolve(envFile));
  const evidencePath = realpathSync(resolve(artifactsDir));
  if (!statSync(environmentPath).isFile() || !statSync(evidencePath).isDirectory()) {
    throw new Error('demo_input_paths_invalid');
  }
  const configured = parseEnv(readFileSync(environmentPath, 'utf8'));
  if (configured.TRUSTLEAF_ENV !== 'local' || configured.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
      Object.hasOwn(configured, 'VERCEL') || Object.hasOwn(configured, 'VERCEL_ENV')) {
    throw new Error('demo_environment_mismatch');
  }
  return {
    envFile: environmentPath, artifactsDir: evidencePath, configured, args,
    privateFile: name => join(evidencePath, name),
  };
}

export function requiredDemoDigest(configured, key) {
  const value = configured[key];
  if (typeof value !== 'string' || !/^(?!0{64}$)[a-f0-9]{64}$/.test(value)) {
    throw new Error('demo_digest_required');
  }
  return value;
}

export function readDemoInputsOrExit() {
  try {
    return readDemoInputs();
  } catch {
    console.error('Usa --env-file <configuración Testnet> --artifacts-dir <directorio de evidencias> antes del modo.');
    process.exit(1);
  }
}
