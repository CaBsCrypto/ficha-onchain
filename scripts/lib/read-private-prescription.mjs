import { decryptPrescription, prescriptionCommitment } from './private-prescription.mjs';

/** Service boundary for the synthetic Testnet runner. All adapters are trusted
 * server-side implementations, never caller-supplied wallet/chain assertions.
 * authenticate must verify the credential; findBinding must query current,
 * unrevoked ownership. Public chain state alone never authorizes document access.
 * A patient may retrieve their historical document even after RX revocation.
 */
export async function readPrivatePrescription({credential, id}, {
  authenticate, findBinding, loadRecord, readChain, key,
}) {
  const denied = () => new Error('private_prescription_unavailable');
  const actor = await authenticate(credential);
  if (!actor?.userId || !actor.email) throw denied();
  const binding = await findBinding(actor);
  if (!binding || binding.user_id !== actor.userId || binding.email !== actor.email ||
      binding.role !== 'patient' || binding.revoked_at != null ||
      !binding.verification_reference || !binding.verified_at ||
      !Number.isFinite(new Date(binding.verified_at).getTime()) ||
      new Date(binding.verified_at).getTime() > Date.now()) throw denied();
  // Adapter must filter by this trusted binding too; avoid an unrestricted read.
  const row = await loadRecord(id, binding.wallet);
  if (!row || row.id !== id || row.network !== 'testnet' ||
      row.patient !== binding.wallet || row.state !== 'confirmed' || !row.rxId) throw denied();
  const rx = await readChain(row.contractId, row.rxId);
  if (!rx || String(rx.id) !== String(row.rxId) || rx.patient !== binding.wallet ||
      rx.doctor !== row.doctor || rx.schema_version !== 1 ||
      Number(rx.expires_at) !== row.expiresAt ||
      Buffer.from(rx.commitment).toString('hex') !== row.commitment) throw denied();
  // Domain + row + network + contract context prevents ciphertext swapping.
  const context = JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1', row.id, row.network, row.contractId]);
  let doc;
  try {
    doc = decryptPrescription(row.ciphertext, key, context);
    if (doc.network !== row.network || doc.contractId !== row.contractId ||
        doc.patient !== row.patient || doc.doctor !== row.doctor ||
        doc.issuanceId !== row.issuanceId || doc.expiresAt !== row.expiresAt ||
        prescriptionCommitment(doc) !== row.commitment) throw denied();
  } catch { throw denied(); }
  // Blinding and storage envelope never leave this service.
  return {id: row.id, rxId: String(rx.id), document: doc.document};
}
