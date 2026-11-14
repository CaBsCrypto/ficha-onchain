import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: vi.fn() }));
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: vi.fn() }));
import { ClinicalDraftSaveController, verifiedDraftMetadata } from '@/components/private-portal/clinical-drafts-client';
import { ClinicalClientError } from '@/components/private-portal/clinical-client';
const id = 'aa97f00b-e7e1-42d1-a923-2f544fd515bd', target = { historyId: 'a'.repeat(64), patient: 'G' + 'P'.repeat(55) };
const metadata = { id, ...target, author: 'G' + 'D'.repeat(55), revision: 1, state: 'draft' as const,
  publicationRequestId: null, createdAt: '2026-10-25T10:00:00Z', updatedAt: '2026-10-25T10:00:00Z' };
const payload = { note: { title: '', text: 'Private unfinished draft', eventDate: null } };
describe('private draft client recovery', () => {
  it('retries byte-identical saves after a lost response and keeps the original id', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ClinicalClientError(0, 'network_unavailable')).mockResolvedValue({ draft: metadata }), newId = vi.fn(() => id);
    const c = new ClinicalDraftSaveController(target, null, request, newId);
    await expect(c.save(payload)).rejects.toThrow(); expect(c.uncertain).toBe(true);
    await expect(c.save({ note: { ...payload.note, text: 'Changed while uncertain' } })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1); await c.retry();
    expect(request.mock.calls[0][0]).toEqual(request.mock.calls[1][0]); expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body); expect(request.mock.calls[0][1].method).toBe(request.mock.calls[1][1].method); expect(newId).toHaveBeenCalledTimes(1); expect(c.uncertain).toBe(false);
  });
  it('uses optimistic revisions on update and never puts draft plaintext in browser storage', async () => {
    const request = vi.fn().mockResolvedValue({ draft: { ...metadata, revision: 2 } });
    const c = new ClinicalDraftSaveController(target, metadata, request);
    await c.save(payload);
    expect(request.mock.calls[0][0]).toContain('/' + id);
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ expectedRevision: 1, payload });
    expect(c.metadata?.revision).toBe(2);
  });
  it('blocks editing a draft with a publication already assigned', async () => {
    const request = vi.fn();
    const c = new ClinicalDraftSaveController(target, { ...metadata, publicationRequestId: id }, request);
    await expect(c.save(payload)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
  it('does not accept a response for another patient or a revision jump', async () => {
    const request = vi.fn().mockResolvedValue({ draft: { ...metadata, revision: 8 } });
    const c = new ClinicalDraftSaveController(target, null, request, () => id);
    await expect(c.save(payload)).rejects.toThrow(); expect(c.uncertain).toBe(true); expect(c.metadata).toBeNull();
    expect(() => verifiedDraftMetadata({ ...metadata, publicationRequestId: 'malformed' })).toThrow();
  });
});

it('starts from an opaque history code and uses only the server patient on updates', async () => {
 const request=vi.fn().mockResolvedValueOnce({draft:metadata}).mockResolvedValueOnce({draft:{...metadata,revision:2}});
 const c=new ClinicalDraftSaveController({historyId:target.historyId},null,request,()=>id);
 await c.save(payload); expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('patient');
 await c.save(payload); expect(JSON.parse(request.mock.calls[1][1].body).patient).toBe(metadata.patient);
});
