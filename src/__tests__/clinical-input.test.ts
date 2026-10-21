import { expect, it, describe } from 'vitest';
import { clinicalInput, clinicalBody, clinicalNote } from '@/lib/clinical/input';
const requestId = '10000000-0000-4000-8000-000000000001';
describe('bounded clinical requests', () => {
  it('accepts patient notes and separates permission flags', () => {
    expect(clinicalInput({ requestId, action: 'append_version', note: { title: ' Anterior ', text: ' Examen ', eventDate: null } }).note?.title).toBe('Anterior');
    expect(clinicalInput({ requestId, action: 'set_permissions', doctorId: 1, canRead: false, canAppend: true, expectedRevision: 0 }).canRead).toBe(false);
  });
  it.each(['patient', 'wallet', 'historyId', 'envelope', 'commitment', 'keyring', 'signedXdr'])('rejects caller-selected %s', key => {
    expect(() => clinicalInput({ requestId, action: 'create_history', [key]: 'foreign' })).toThrow('clinical_request_invalid');
  });
  it.each([null, [], {}, { requestId, action: 'retired' }, { requestId, action: 'create_history', note: {} }])('rejects malformed intents', value => expect(() => clinicalInput(value)).toThrow());
  it.each(['2026-02-30', 'not-date', '2026-10-08T00:00:00Z'])('rejects ambiguous or invalid clinical date %s', eventDate => expect(() => clinicalNote({ title: 'A', text: 'B', eventDate })).toThrow());
  it('requires exact source version for corrections', () => {
    expect(() => clinicalInput({ requestId, action: 'append_version', entryId: 'ab'.repeat(32), note: { title: 'A', text: 'B', eventDate: null } })).toThrow();
  });
  it('accepts exactly 3M original bytes and rejects an extra byte', () => {
    const input = (length: number) => ({ requestId, action: 'append_version', file: { fileName: 'test.pdf', mediaType: 'application/pdf', base64: Buffer.alloc(length, 1).toString('base64') } });
    expect(clinicalInput(input(3_000_000)).file).toBeDefined();
    expect(() => clinicalInput(input(3_000_001))).toThrow('clinical_file_invalid');
  });
  it.each(['../x.pdf', 'x\ny.pdf', '..', ''])('rejects unsafe filename %s', fileName => {
    expect(() => clinicalInput({ requestId, action: 'append_version', file: { fileName, mediaType: 'application/pdf', base64: 'YWJj' } })).toThrow();
  });
  it('bounds streamed bodies even without a content-length header', async () => {
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4_010_001)); c.close(); } });
    await expect(clinicalBody(new Request('http://localhost/test', { method: 'POST', body, duplex: 'half' } as RequestInit))).rejects.toThrow('clinical_request_too_large');
  });
});
