import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { buildClinicalEpisode, canonicalEpisodeBytes, compareInitialEpisodeAnchors, verifyEpisodeAttachments } from '@/lib/clinical/episode';
import { sealClinicalVersion, openClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 15)).publicKey(), author = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 16)).publicKey();
const id = 'c78ac0c8-b42a-47c9-90cf-13d6a70b2614', attachmentId = '2762b48c-5b08-4c43-a357-ea2e87a3523b';
const context = { historyId: 'a'.repeat(64), patient, author, grantRevision: 6, episodeId: id, version: 1, previousCommitment: null };
const note = { title: 'Atención sintética', text: 'Contenido de laboratorio.', eventDate: null };
const file = { fileName: 'fixture.pdf', mediaType: 'application/pdf' as const, base64: Buffer.from('%PDF-1.7\nSynthetic\n%%EOF\n').toString('base64') };
const deps = { readStoredAttachment: async () => file, prescriptionAllowed: async () => false };
describe('isolated episode/v1 laboratory', () => {
  it('anchors one final manifest for one patient and author with exact file bytes', async () => {
    const m = await buildClinicalEpisode(context, note, [attachmentId], deps);
    expect(m.attachments[0].byteLength).toBe(Buffer.from(file.base64, 'base64').length);
    await verifyEpisodeAttachments(m, deps.readStoredAttachment);
    const encryptionContext = { schemaVersion: 1, network: 'testnet', contractId: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',
      historyId: context.historyId, entryId: 'b'.repeat(64), author, patient, version: 1, previousCommitment: null };
    const keyring = { fixture: '9'.repeat(64) }, content = canonicalEpisodeBytes(m);
    const sealed = sealClinicalVersion({ context: encryptionContext, content, metadata: { mediaType: 'application/json', fileName: 'atencion-v1.json' }, keyring, activeKeyId: 'fixture' });
    expect(sealed.commitment).toMatch(/^[a-f0-9]{64}$/);
    const opened = openClinicalVersion({ envelope: sealed.envelope, expectedContext: encryptionContext, expectedCommitment: sealed.commitment, keyring });
    expect(JSON.parse(Buffer.from(opened.content).toString())).toEqual(m); opened.content.fill(0); content.fill(0);
  });
  it('rejects mutable, missing or changed attachments', async () => {
    const m = await buildClinicalEpisode(context, note, [attachmentId], deps);
    await expect(verifyEpisodeAttachments(m, async () => ({ ...file, base64: Buffer.from('%PDF-1.7\nChanged\n%%EOF\n').toString('base64') }))).rejects.toThrow();
    await expect(buildClinicalEpisode(context, note, [attachmentId], { ...deps, readStoredAttachment: async () => null })).rejects.toThrow();
    await expect(buildClinicalEpisode(context, note, [attachmentId, attachmentId], deps)).rejects.toThrow();
  });
  it('requires independent RX authorization, even for the same clinical context', async () => {
    await expect(buildClinicalEpisode(context, { ...note, prescriptionId: attachmentId }, [], deps)).rejects.toThrow();
    const manifest = await buildClinicalEpisode(context, { ...note, prescriptionId: attachmentId }, [], { ...deps, prescriptionAllowed: async () => true });
    expect(manifest.note.prescriptionId).toBe(attachmentId);
  });
  it('requires a new version and previous commitment for corrections', async () => {
    await expect(buildClinicalEpisode({ ...context, version: 2 }, note, [], deps)).rejects.toThrow();
    const m = await buildClinicalEpisode({ ...context, version: 2, previousCommitment: 'c'.repeat(64) }, note, [], deps);
    expect(m.previousCommitment).toBe('c'.repeat(64));
  });
  it('compares counts without inventing prices or changing the rehearsal', () => {
    expect(compareInitialEpisodeAnchors(1)).toMatchObject({ separateAnchors: 2, episodeAnchors: 1, separateNewEntries: 6, episodeNewEntries: 3, feeEstimate: null, publishable: false });
  });
});
