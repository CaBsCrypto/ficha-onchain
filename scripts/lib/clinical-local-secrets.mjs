import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

const fail = () => new Error('clinical_local_secrets_unavailable');
function dpapi(bytes, action) {
  if (process.platform !== 'win32' || !['Protect', 'Unprotect'].includes(action)) throw fail();
  const script = `Add-Type -AssemblyName System.Security;
    $taskBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());
    $taskEntropy=[Text.Encoding]::UTF8.GetBytes('trustleaf:clinical:testnet:local:v1');
    $taskResult=[Security.Cryptography.ProtectedData]::${action}($taskBytes,$taskEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Console]::Out.Write([Convert]::ToBase64String($taskResult));`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !/^[A-Za-z0-9+/]+=*$/.test(result.stdout.trim())) throw fail();
  return Buffer.from(result.stdout.trim(), 'base64');
}
function validate(value) {
  if (value?.schemaVersion !== 1 || value.network !== 'testnet' || !/^[a-f0-9]{64}$/.test(value.keyring?.['clinical.dev.1'] ?? '')) throw fail();
  for (const role of ['patient', 'deployer']) Keypair.fromSecret(value[role]);
  return value;
}
/** Isolated local technical demo only. DPAPI binds decryption to this Windows
 * account. A backup is recoverable under this account, not a portable disaster
 * recovery or production key-management service. Keys never enter Neon or logs. */
export function clinicalLocalSecrets(directory, { create = false, backup = false } = {}) {
  const file = join(directory, 'secrets.dpapi');
  const backupFile = join(directory, 'secrets.backup.dpapi');
  try {
    if (!existsSync(file)) {
      if (!create) throw fail();
      mkdirSync(directory, { recursive: true });
      const value = { schemaVersion: 1, network: 'testnet', patient: Keypair.random().secret(),
        deployer: Keypair.random().secret(), keyring: { 'clinical.dev.1': randomBytes(32).toString('hex') } };
      const plaintext = Buffer.from(JSON.stringify(value));
      try { writeFileSync(file, dpapi(plaintext, 'Protect'), { flag: 'wx', mode: 0o600 }); }
      finally { plaintext.fill(0); }
    }
    const protectedBytes = readFileSync(file);
    const decoded = dpapi(protectedBytes, 'Unprotect');
    let value;
    try { value = validate(JSON.parse(decoded.toString('utf8'))); } finally { decoded.fill(0); }
    if (backup) {
      if (!existsSync(backupFile)) writeFileSync(backupFile, protectedBytes, { flag: 'wx', mode: 0o600 });
      const restored = dpapi(readFileSync(backupFile), 'Unprotect');
      try {
        const recovery = validate(JSON.parse(restored.toString('utf8')));
        if (recovery.patient !== value.patient || recovery.deployer !== value.deployer ||
            !timingSafeEqual(Buffer.from(recovery.keyring['clinical.dev.1'], 'hex'), Buffer.from(value.keyring['clinical.dev.1'], 'hex'))) throw fail();
      } finally { restored.fill(0); }
    }
    return value;
  } catch { throw fail(); }
}
