import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { continuationManifest, completionContinuationManifest, maintenanceCompletionManifest } from './prepare-clinical-continuation.mjs';

function original() {
  const note = { title: 'Synthetic technical follow-up', text: 'Synthetic content; no clinical care.', eventDate: null, prescriptionId: randomUUID() };
  const steps = ['renew','grant_read','grant_append','append_note','grant_both','append_pdf','correct_note','revoke'].map(key => ({ key, requestId: randomUUID(), operationId: randomBytes(32).toString('hex') }));
  steps[3].input = { note };
  steps[5].input = { file: { fileName: 'synthetic.pdf', mediaType: 'application/pdf', base64: 'JVBERi0xLjQKJSVFT0YK' } };
  steps[6].input = { entryId: randomBytes(32).toString('hex'), note: { ...note, text: note.text + ' Technical correction.' } };
  return { schemaVersion: 1, runId: 'e33dc64c-b634-493a-82b8-a29381a2e542', createdAt: 1792802809, until: 1792824409, doctorValidUntil: 1792889209,
    network: 'testnet', contractId: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', registryId: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',
    relayer: 'GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB', admin: 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO',
    patient: { userId: 'did:privy:syntheticpatient', walletId: 'patient', address: 'GDUIUM2OR4LCV4Y6R3ZQRWMC3FZR4QRYWHQ4MKZISQ56K3ZNSGVWBMO5', email: 'patient@example.test' },
    doctor: { userId: 'did:privy:syntheticdoctor', walletId: 'doctor', address: 'GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX', email: 'doctor@example.test' },
    reviewer: { userId: 'did:privy:syntheticpatient', email: 'patient@example.test' }, historyId: randomBytes(32).toString('hex'), doctorId: 10, steps };
}
const options = old => ({ old, originalPath: 'C:/Private/rehearsal/plan.private.json', cancelledExpiresAt: 1792807306, preparedAt: 1792888200 });

test('continuation preserves the reviewed payload and identities without carrying authority or fixed deadlines forward', () => {
  const old = original(), before = structuredClone(old), plan = continuationManifest(options(old));
  assert.deepEqual(old, before);
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(plan.steps.map(v => v.key), ['renew','append_note','grant_both','append_pdf','correct_note','revoke']);
  assert.equal(plan.steps.length, 6);
  for (const key of ['patient','doctor','reviewer']) { assert.deepEqual(plan[key], old[key]); assert.notEqual(plan[key], old[key]); }
  assert.deepEqual(plan.steps[1].input.note, old.steps[3].input.note);
  assert.deepEqual(plan.steps[3].input.file, old.steps[5].input.file);
  assert.deepEqual(plan.steps[4].input.note, old.steps[6].input.note);
  assert.equal(plan.steps[1].input.note.prescriptionId, plan.steps[4].input.note.prescriptionId);
  assert.notEqual(plan.steps[4].input.entryId, old.steps[6].input.entryId);
  assert.equal(plan.steps[4].input.expectedVersion, 1);
  assert.equal(plan.notBefore, old.doctorValidUntil);
  assert.equal(plan.executionWindowSeconds, 21600);
  assert.equal(plan.doctorWindowSeconds, 86400);
  assert.equal(plan.totalMaxFeeStroops, '60000000');
  assert(plan.steps.every(v => v.maxFeeStroops === '10000000'));
  for (const forbidden of ['createdAt','until','doctorValidUntil','approvedAt','approval','approvalHash']) assert.equal(Object.hasOwn(plan, forbidden), false);
  assert.equal(Object.hasOwn(plan.authorization, 'validUntil'), false);
});

test('a continuation uses new slots and preserves prior receipts/cancelled intent only as lineage', () => {
  const old = original(), plan = continuationManifest(options(old));
  const oldIds = new Set(old.steps.map(v => v.requestId)), oldOps = new Set(old.steps.map(v => v.operationId));
  assert.equal(new Set(plan.steps.map(v => v.requestId)).size, 6);
  assert(plan.steps.every(v => !oldIds.has(v.requestId)));
  assert(plan.steps.slice(1).every(v => !oldOps.has(v.operationId) && v.input.requestId === v.requestId));
  assert.deepEqual(plan.steps.map(v => v.actor), ['admin','doctor','patient','doctor','doctor','patient']);
  assert.equal(plan.authorization.expectedVersion, 4);
  assert.equal(plan.authorization.targetVersion, 5);
  assert.equal(plan.authorization.requestId, plan.steps[0].requestId);
  assert.deepEqual(plan.lineage.confirmed.map(v => v.requestId), old.steps.slice(0,3).map(v => v.requestId));
  assert.equal(plan.lineage.cancelledNote.requestId, old.steps[3].requestId);
  assert.equal(plan.lineage.cancelledNote.operationId, old.steps[3].operationId);
  assert.equal(plan.steps[2].input.expectedRevision, 5);
  assert.equal(plan.steps[2].input.canRead, true);
  assert.equal(plan.steps[5].input.expectedRevision, 6);
  assert.equal(plan.steps[5].input.canRead, false);
  assert.equal(plan.steps[5].input.canAppend, false);
});

test('builder rejects a different original run and invalid preparation or cancellation timestamps', () => {
  const old = original();
  assert.throws(() => continuationManifest({ ...options(old), old: { ...old, runId: randomUUID() } }), /continuation_original_invalid/);
  assert.throws(() => continuationManifest({ ...options(old), preparedAt: old.createdAt - 1 }), /continuation_original_invalid/);
  assert.throws(() => continuationManifest({ ...options(old), cancelledExpiresAt: 0 }), /continuation_cancelled_note_invalid/);
  assert.throws(() => continuationManifest({ ...options(old), cancelledExpiresAt: old.until + 1 }), /continuation_cancelled_note_invalid/);
});


test('completion proposal binds approved base10 and unused PDF while adding only seven-day renewal and four-hour window',()=>{
 const plan=completionContinuationManifest({basePlanFile:process.platform==='win32'?'C:/Private/base10/plan.private.json':'/private/base10/plan.private.json',baseApprovalFile:process.platform==='win32'?'C:/Private/base10/approval.private.json':'/private/base10/approval.private.json',preparedAt:1793469600});
 assert.equal(plan.schemaVersion,12);assert.equal(plan.executionWindowSeconds,14400);assert.equal(plan.doctorWindowSeconds,604800);
 assert.equal(plan.basePlanHash,'6ad1f0558da616fe37e6eea46161597d0d3adf8635df68dbd3840bc0c0478956');
 assert.equal(plan.baseApprovalHash,'330b65b8b635077c928e8be83f050433dfc56c0283e8772f14225e254e0acf26');
 assert.equal(plan.replacementPdfRequestId,'7b704051-d090-4251-ad57-82d45067f4e8');assert.equal(plan.startingDoctorVersion,5);
 assert.equal(plan.renewalMaxFeeStroops,'10000000');assert.equal(new Set([plan.amendmentId,plan.renewalRequestId,plan.renewalDossierId]).size,3);
 for(const key of ['approvedAt','until','doctorValidUntil','approvalHash','steps','confirmedSteps','aggregateMaxFeeStroops'])assert.equal(Object.hasOwn(plan,key),false);
 assert.equal(plan.supersededPdf.requestId,'ac5d06bb-c2c7-4af0-9c91-7feb2a5a1d65');
});

test('completion proposal rejects relative paths, pre-expiry time and colliding renewal identifiers',()=>{
 const base={basePlanFile:process.platform==='win32'?'C:/Private/base10/plan.private.json':'/private/base10/plan.private.json',baseApprovalFile:process.platform==='win32'?'C:/Private/base10/approval.private.json':'/private/base10/approval.private.json',preparedAt:1793469600};
 for(const patch of [{basePlanFile:'relative.json'},{baseApprovalFile:'relative.json'},{preparedAt:1792975921},{preparedAt:1.1},{renewalRequestId:'invalid'},
  {amendmentId:'d1111111-1111-4111-8111-111111111111',renewalRequestId:'d1111111-1111-4111-8111-111111111111'}])
  assert.throws(()=>completionContinuationManifest({...base,...patch}),/continuation_completion_/);
});


test('maintenance completion proposal preserves the reviewed renewal slots and the one canonical two-XLM journal',()=>{
 const base={basePlanFile:process.platform==='win32'?'C:/Private/base10/plan.private.json':'/private/base10/plan.private.json',baseApprovalFile:process.platform==='win32'?'C:/Private/base10/approval.private.json':'/private/base10/approval.private.json',preparedAt:1793469600,
  renewalRequestId:'de46469b-3f8a-4af8-b409-9744d85c4527',renewalDossierId:'f2d738c1-977d-40b3-9b72-126d04b5f4c7'};
 const first=maintenanceCompletionManifest(base),second=maintenanceCompletionManifest(base);
 assert.equal(first.schemaVersion,13);assert.equal(first.renewalRequestId,base.renewalRequestId);assert.equal(first.renewalDossierId,base.renewalDossierId);
 assert.equal(first.executionWindowSeconds,14400);assert.equal(first.doctorWindowSeconds,604800);
 assert.equal(first.maintenance.maxFeeStroops,'20000000');assert.equal(first.maintenance.keys.length,14);
 assert.equal(first.maintenance.requestId,second.maintenance.requestId);assert.equal(first.maintenance.attemptFile,second.maintenance.attemptFile);
 assert.equal(first.maintenance.requestId,'b6329a70-5b43-4193-8708-86be4280a7ef');
 assert.equal(first.maintenance.attemptFile,resolve(dirname(base.basePlanFile),'maintenance-14-attempt.private.json'));
 for(const key of ['approvedAt','until','doctorValidUntil','approvalHash','steps'])assert.equal(Object.hasOwn(first,key),false);
 for(const patch of [{maintenanceRequestId:randomUUID()},{maintenanceAttemptFile:'other'},{maintenanceMaxFeeStroops:'1'},{maintenance:{}},{keys:[]}])
  assert.throws(()=>maintenanceCompletionManifest({...base,...patch}),/maintenance_override_rejected/);
});


test('maintenance proposal pins renewal identifiers even when omitted and rejects replacement slots',()=>{
 const base={basePlanFile:process.platform==='win32'?'C:/Private/base10/plan.private.json':'/private/base10/plan.private.json',baseApprovalFile:process.platform==='win32'?'C:/Private/base10/approval.private.json':'/private/base10/approval.private.json',preparedAt:1793469600};
 const raw=maintenanceCompletionManifest(base);
 assert.equal(raw.renewalRequestId,'de46469b-3f8a-4af8-b409-9744d85c4527');
 assert.equal(raw.renewalDossierId,'f2d738c1-977d-40b3-9b72-126d04b5f4c7');
 for(const patch of [{renewalRequestId:randomUUID()},{renewalDossierId:randomUUID()}])
  assert.throws(()=>maintenanceCompletionManifest({...base,...patch}),/maintenance_renewal_slot_rejected/);
});
