// Operator-only management of the bounded, private Testnet rehearsal.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { PrivyClient } from '@privy-io/server-auth';
import { assertCurrentPrivyIdentity, PRIVY_APP_ID } from './lib/private-worker-runtime.mjs';
import {
  activateHostedCapture, assertHostedCaptureOperator, closeHostedCapture,
  readHostedCaptureActive, readHostedCaptureBySha, stageHostedCapture,
} from './lib/hosted-capture-store.mjs';
import { HOSTED_CAPTURE_SCHEMA_SQL } from './lib/hosted-capture-schema.mjs';

function safeSnapshot(value) {
  return value ? {
    phase: value.phase, runId: value.runId, sha256: value.sha256, active: value.active,
    approvedAt: value.approvedAt, expiresAt: new Date(value.expiresAt * 1000).toISOString(),
    predecessorSha256: value.predecessorSha256, baseSha256: value.baseSha256,
  } : null;
}

const usage = "node scripts/hosted-capture.mjs --env-file <file> migrate | status [sha256] | stage <phase> <manifest> <sha256> | activate <phase> <sha256> | close <active sha256>";
async function verifyChosenPatient(actor, env) {
  const email = env.TRUSTLEAF_HOSTED_CAPTURE_PATIENT_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || env.PRIVY_APP_ID !== PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw Error('hosted_capture_patient_configuration');
  }
  const provider = new PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET);
  const user = await provider.getUserByEmail(email);
  if (!actor || user?.id !== actor.userId) throw Error('hosted_capture_patient_identity');
  await assertCurrentPrivyIdentity(provider, { ...actor, email });
}
async function main() {
  const [flag, file, command, ...args] = process.argv.slice(2);
  const argumentCounts = { migrate: [0], status: [0, 1], stage: [3], activate: [2], close: [1] };
  if (flag !== '--env-file' || !file || !Object.hasOwn(argumentCounts, command) || !argumentCounts[command].includes(args.length))
    throw Error('hosted_capture_usage');
  const env = parseEnv(readFileSync(file, 'utf8'));
  const target = assertHostedCaptureOperator(env);
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: target.directConnectionString, connectionTimeoutMillis: 15_000, query_timeout: 25_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query(command === 'status' ? 'BEGIN READ ONLY' : 'BEGIN');
    let output;
    if (command === 'migrate') {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('trustleaf-hosted-capture-v1'))");
      for (const sql of HOSTED_CAPTURE_SCHEMA_SQL) await client.query(sql);
      output = { status: 'migration_applied' };
    } else if (command === 'status') {
      output = { status: 'read_only', scope: safeSnapshot(args[0]
        ? await readHostedCaptureBySha(client, args[0])
        : await readHostedCaptureActive(client)) };
    } else if (command === 'stage') {
      const [phase, manifest, sha256] = args;
      const path = resolve(manifest);
      const fileInfo = lstatSync(path);
      if (!isAbsolute(manifest) || realpathSync(path) !== path || !fileInfo.isFile() ||
        !path.endsWith('.private.json') || fileInfo.size > 8192) throw Error('hosted_capture_manifest_path');
      const bytes = readFileSync(path);
      if (phase === 'create') await verifyChosenPatient(JSON.parse(bytes.toString('utf8')).patient, env);
      output = { status: 'staged', scope: safeSnapshot(await stageHostedCapture(client, { phase, sha256, bytes, env })) };
    } else if (command === 'activate') {
      const [phase, sha256] = args;
      if (phase === 'create') await verifyChosenPatient((await readHostedCaptureBySha(client, sha256))?.patient, env);
      output = { status: 'activated', scope: safeSnapshot(await activateHostedCapture(client, { phase, sha256, env })) };
    } else {
      await closeHostedCapture(client, args[0]);
      output = { status: 'shutdown', sha256: args[0] };
    }
    await client.query('COMMIT');
    console.log(JSON.stringify(output));
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

try { await main(); }
catch (error) {
  const reason = /^hosted_capture_[a-z_]+$/.test(error.message) ? error.message
    : error.code === '23505' ? 'hosted_capture_already_registered' : 'hosted_capture_unavailable';
  console.error(JSON.stringify({ status: 'blocked', reason }));
  if (reason === 'hosted_capture_usage') console.error(usage);
  process.exitCode = 1;
}
