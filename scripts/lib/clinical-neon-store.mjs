import { validateClinicalContext, validateClinicalEnvelope } from './clinical-crypto.mjs';

const HEX = /^[a-f0-9]{64}$/;
const MAX_ENVELOPE_BYTES = 6_000_000;
const CONTEXT_KEYS = ['schemaVersion', 'network', 'contractId', 'historyId', 'entryId', 'author', 'patient', 'version', 'previousCommitment'];
const sameContext = (a, b) => CONTEXT_KEYS.every(key => a?.[key] === b?.[key]);
const fail = () => { throw Error('clinical_storage_invalid'); };
function hex(value) { if (typeof value !== 'string' || !HEX.test(value)) fail(); }
function checkEnvelope(envelope) {
  validateClinicalEnvelope(envelope);
  if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_ENVELOPE_BYTES) fail();
}
function ids(context) { return [context.contractId, context.historyId, context.entryId, context.version]; }
function deserialize(row) {
  if (!row) return null;
  const context = typeof row.context === 'string' ? JSON.parse(row.context) : row.context;
  const envelope = typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope;
  validateClinicalContext(context); checkEnvelope(envelope); hex(row.commitment); hex(row.operation_id);
  if (row.transaction_hash !== null) hex(row.transaction_hash);
  if (!['prepared', 'confirmed'].includes(row.state) || (row.state === 'confirmed' && !row.transaction_hash)) fail();
  return { context, envelope, commitment: row.commitment, operationId: row.operation_id, state: row.state, transactionHash: row.transaction_hash };
}

/** Server-only adapter over the existing connected PostgreSQL client.
 * No authentication is inferred from SQL row existence: clinical-read checks
 * identity and live chain authorization before AND after this adapter runs.
 * This adapter neither signs nor transmits. A prepared record is not evidence
 * of a Stellar transaction, and unconfirmed bytes are never returned by loadEnvelope.
 */
export function clinicalNeonStore(client) {
  const select = `SELECT context,envelope,commitment,operation_id,state,transaction_hash
    FROM clinical_private_versions WHERE network='testnet' AND contract_id=$1
      AND history_id=$2 AND entry_id=$3 AND version=$4`;
  return {
    async stageVersion({ context, envelope, commitment, operationId }) {
      context = validateClinicalContext(context); checkEnvelope(envelope); hex(commitment); hex(operationId);
      envelope = Object.freeze({ ...envelope });
      // An uncertain attempt reuses its exact stored envelope and blinding.
      // Never regenerate ciphertext and overwrite a prior preparation on retry.
      await client.query('BEGIN');
      try {
        await client.query(`INSERT INTO clinical_private_versions
          (network,contract_id,history_id,entry_id,version,context,commitment,envelope,operation_id,state)
          VALUES('testnet',$1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,'prepared') ON CONFLICT DO NOTHING`,
        [...ids(context), JSON.stringify(context), commitment, JSON.stringify(envelope), operationId]);
        const saved = deserialize((await client.query(select + ' FOR UPDATE', ids(context))).rows[0]);
        if (!saved || !sameContext(saved.context, context) || saved.commitment !== commitment || saved.operationId !== operationId ||
            saved.envelope.keyId !== envelope.keyId || saved.envelope.payload !== envelope.payload || saved.envelope.wrappedKey !== envelope.wrappedKey)
          throw Error('clinical_version_conflict');
        await client.query('COMMIT');
        return { state: saved.state, commitment: saved.commitment, operationId: saved.operationId, transactionHash: saved.transactionHash };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    },
    async preparedVersion({ context }) {
      context = validateClinicalContext(context);
      const saved = deserialize((await client.query(select, ids(context))).rows[0]);
      if (!saved || !sameContext(saved.context, context)) throw Error('clinical_version_unavailable');
      return saved; // Internal recovery only; do not expose an HTTP endpoint for this method.
    },
    async confirmVersion({ context, commitment, operationId, receipt }) {
      context = validateClinicalContext(context); hex(commitment); hex(operationId);
      // receipt must be obtained by the trusted chain adapter, never request JSON.
      if (receipt?.status !== 'SUCCESS' || receipt.network !== 'testnet' || receipt.contractId !== context.contractId ||
          receipt.operationId !== operationId || receipt.commitment !== commitment || !sameContext(receipt.context, context))
        throw Error('clinical_confirmation_invalid');
      hex(receipt.transactionHash);
      const transactionHash = receipt.transactionHash;
      await client.query('BEGIN');
      try {
        const saved = deserialize((await client.query(select + ' FOR UPDATE', ids(context))).rows[0]);
        if (!saved || !sameContext(saved.context, context) || saved.commitment !== commitment || saved.operationId !== operationId ||
            (saved.state === 'confirmed' && saved.transactionHash !== transactionHash)) throw Error('clinical_confirmation_invalid');
        if (saved.state !== 'confirmed') await client.query(`UPDATE clinical_private_versions
          SET state='confirmed',transaction_hash=$5,confirmed_at=NOW()
          WHERE network='testnet' AND contract_id=$1 AND history_id=$2 AND entry_id=$3 AND version=$4`,
        [...ids(context), transactionHash]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    },
    async loadEnvelope({ context, commitment }) {
      context = validateClinicalContext(context); hex(commitment);
      const saved = deserialize((await client.query(select, ids(context))).rows[0]);
      if (!saved || saved.state !== 'confirmed' || !sameContext(saved.context, context) || saved.commitment !== commitment)
        throw Error('clinical_version_unavailable');
      return saved.envelope;
    },
  };
}
