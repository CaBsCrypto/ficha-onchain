import { StrKey } from '@stellar/stellar-sdk';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = () => new Error('clinical_attempt_unavailable');
/** Persistent technical journal. Callers hold the same source advisory lock as
 * private-user operations. An uncertain signed attempt remains submitted and
 * occupies the source until its exact transaction is reconciled. */
export function clinicalAttemptStore(client, { runId, source }) {
  if (!/^[a-f0-9-]{36}$/.test(runId) || !StrKey.isValidEd25519PublicKey(source)) throw fail();
  const params = name => {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name)) throw fail();
    return [runId, name, source];
  };
  const select = `SELECT intent,signed_xdr,transaction_hash,state FROM clinical_transaction_attempts
    WHERE run_id=$1 AND operation_name=$2 AND source_wallet=$3`;
  async function transaction(work) {
    await client.query('BEGIN');
    try { const value = await work(); await client.query('COMMIT'); return value; }
    catch { await client.query('ROLLBACK'); throw fail(); }
  }
  return {
    async reserve(name, { intent, source: expectedSource }) {
      if (!hex(intent) || expectedSource !== source) throw fail();
      return transaction(async () => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['private-user:' + source]);
        const competing = await client.query(`SELECT id FROM private_operations WHERE source_wallet=$1
          AND state IN ('awaiting_signature','submitted') LIMIT 1`, [source]);
        if (competing.rows.length) throw fail();
        await client.query(`INSERT INTO clinical_transaction_attempts(run_id,operation_name,source_wallet,intent,state)
          VALUES($1,$2,$3,$4,'prepared') ON CONFLICT(run_id,operation_name) DO NOTHING`, [...params(name), intent]);
        const row = (await client.query(select + ' FOR UPDATE', params(name))).rows[0];
        if (!row || row.intent !== intent || row.state !== 'prepared' || row.signed_xdr) throw fail();
      });
    },
    async load(name) {
      const row = (await client.query(select, params(name))).rows[0];
      if (!row || row.state === 'prepared') return null;
      if (!hex(row.intent) || !hex(row.transaction_hash) || typeof row.signed_xdr !== 'string') throw fail();
      return { intent: row.intent, source, hash: row.transaction_hash, xdr: row.signed_xdr };
    },
    async save(name, record) {
      if (record.source !== source || !hex(record.intent) || !hex(record.hash) || typeof record.xdr !== 'string' ||
          Buffer.byteLength(record.xdr) > 1_000_000) throw fail();
      return transaction(async () => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['private-user:' + source]);
        const result = await client.query(`UPDATE clinical_transaction_attempts SET signed_xdr=$5,transaction_hash=$6,state='submitted',updated_at=NOW()
          WHERE run_id=$1 AND operation_name=$2 AND source_wallet=$3 AND intent=$4 AND state='prepared' AND signed_xdr IS NULL RETURNING operation_name`,
          [...params(name), record.intent, record.xdr, record.hash]);
        if (result.rows.length !== 1) throw fail();
      });
    },
    async complete(name, receipt) {
      if (!['SUCCESS', 'FAILED'].includes(receipt.status) || !hex(receipt.transactionHash)) throw fail();
      const state = receipt.status === 'SUCCESS' ? 'confirmed' : 'failed';
      const result = await client.query(`UPDATE clinical_transaction_attempts SET state=$5,updated_at=NOW()
        WHERE run_id=$1 AND operation_name=$2 AND source_wallet=$3 AND transaction_hash=$4 AND state IN ('submitted',$5) RETURNING operation_name`,
        [...params(name), receipt.transactionHash, state]);
      if (result.rows.length !== 1) throw fail();
    },
  };
}
