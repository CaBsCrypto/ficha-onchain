import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Address, FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { assertClinicalWebSponsoredFee } from './clinical-web-fee-policy.mjs';
import { databaseConnectionString } from './database-connection.mjs';

const CONTRACT = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const REGISTRY = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const VARIABLES = ['TRUSTLEAF_CLINICAL_REHEARSAL_FILE', 'TRUSTLEAF_CLINICAL_REHEARSAL_HASH', 'TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const TEXT_ID = /^did:privy:[A-Za-z0-9_-]{1,128}$/;
const KEYS = ['renew', 'grant_read', 'grant_append', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
const CONTINUATION_KEYS = ['renew', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
const PRIOR_RECEIPTS = ['3cf5ccedbbcc8aa796662b1af869996e0a474934e7b5b62eaa78c805b318e4bb', '0e9798dd745f544ee70b818fb860abb78de4663fbca0e0c4c2d3454070931215', '43e1f8d254c4d6deba5c5c2e35f324806cfd2ea4498ddc84e52feb6e450c9f0f'];
const CONTINUATION_PATIENT = 'GDUIUM2OR4LCV4Y6R3ZQRWMC3FZR4QRYWHQ4MKZISQ56K3ZNSGVWBMO5';
const CONTINUATION_DOCTOR = 'GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX';
const MAX_BYTES = 4_100_000;
const STEP_FEE = 10_000_000n;
const DOCTOR_FEE = 50_000_000n;
const EXPANDED_DOCTOR_FEE = 100_000_000n;
const EXPANDED_PERMISSION_FEE = 50_000_000n;
const REALLOCATED_DOCTOR_FEE = 150_000_000n;
const WITHDRAWAL_RESERVE = 60_000_000n;
const REAL_AGGREGATE_FEE = 400_000_000n;
const EXECUTION_CONTINUATION_SECONDS = 14_400;
const EXECUTION_CONTINUATION_NOT_AFTER = 1_792_974_600;
const EXECUTION_CONTINUATION_BASE_HASH = '43e477dc4695c42a477fb91455d010bb632f52b1bd9f991a41e2f7c25491ceec';
const EXECUTION_CONTINUATION_APPROVAL_HASH = '0b4c41c78725b10471171522a47fbfd3569e74b8948127a55c6ec0f51b17e079';
const EXECUTION_CONTINUATION_POLICIES = new WeakSet();
const PDF_REPLACEMENT_BASE_HASH = 'b9d27665aaaa883cc08ec5c74ecb92f5468aa2888966f3593dddd93d06319bda';
const PDF_REPLACEMENT_APPROVAL_HASH = '2c29f6c5a82c9dc169e623c5ea356df438921165a68aae79751a834630a7272b';
const PDF_REPLACEMENT_POLICIES = new WeakSet();
const COMPLETION_CONTINUATION_POLICIES = new WeakSet();
const MAINTENANCE_CONTINUATION_POLICIES = new WeakSet();
const RESUME_CONTINUATION_POLICIES = new WeakSet();
// One separately approved replacement of the Nov2 raw14 PDF. No recursive format,
// new execution window, renewal or maintenance authority is introduced.
const EXPIRED_PDF_RECOVERY_POLICIES = new WeakSet();
const REOPENED_PDF_RECOVERY_POLICIES = new WeakSet();
const RECOVERED_REOPENED_PDF_POLICIES = new WeakSet();
const NEVER_SUBMITTED_PDF_POLICIES = new WeakSet();
const RESTORED_COMPLETION_POLICIES = new WeakSet();
const RESTORED_COMPLETION_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', '55fd7799-a9e5-42db-9c32-9e15e57c7e32');
const RESTORED_COMPLETION_SOURCE_HASH = '5000fd11994f58ab22a678c4fc2d018dfbb01a10ce98e01cc529b12a7c2ee2f0';
const RESTORED_COMPLETION_APPROVAL_HASH = 'f18749805452bdfec5547065c914c43ff59e85ad649d88d6641b17dfbe6b04bd';
const RESTORED_COMPLETION_KEYS_SHA256 = 'ebba176fdcad48e6158f55752509d210a6e449ddf9349d3be7913d7efbe085a8';
const RESTORED_COMPLETION_FOOTPRINT_SHA256 = '06cce6bbfea13a282be1321137f59499ba070740eeb216fb40415da4fc4c4a19';
const RESTORED_COMPLETION_IDENTIFIERS = Object.freeze({amendmentId:'724be994-d8c5-4e79-aae3-5dd6e76327b2',renewalRequestId:'1ac91584-457b-49ea-82c9-cb93ba67b506',renewalDossierId:'d6b96efa-361c-481b-8b42-4afe84c82478',restorationRequestId:'fe2ea875-d036-49bc-b505-c8b251fc9c2a'});
const NEVER_SUBMITTED_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', '0d3891cd-2a8d-4b06-bdfc-96751cc79117');
const NEVER_SUBMITTED_SOURCE_HASH = '6f0c968f54ce83f422e25fe7ce9add83e6d081f47e825cb28b2e3fb36e1c51ed';
const NEVER_SUBMITTED_APPROVAL_HASH = 'e3b5886dc8f0b085db39d813311cfa3f63cb9d20a04aa546b0015f80c8cd0300';
const NEVER_SUBMITTED_REQUEST = '418dcca6-2ee8-4570-9d8d-637fa4a4bc1c';
const NEVER_SUBMITTED_HASH = 'd865a23db28ce24774cbace0b6605da40e9a7556c29992b3449014e34aaaa0d3';
const RECOVERED_REOPENED_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'eb04fb2a-163a-4960-b8d7-af1c3c903409');
const RECOVERED_REOPENED_SOURCE_HASH = 'd91debde2e82980dbb816cd5d32e107bfdbe94e2640f175ef28cdf91a1241de1';
const RECOVERED_REOPENED_APPROVAL_HASH = '006cd6ea83de4cfa4a6fca275852997f7b873cd9c657d8e7894ea1be78404ef4';
const RECOVERED_REOPENED_EVIDENCE_HASH = 'c283e600a074a1648872f43da6763b92be8972710df2a22bf79628b60322ad2b';
const RECOVERED_REOPENED_PROOF = Object.freeze({"requestId":"dd00eaa3-9c6a-47cf-85ce-69bff173a7d1","operationId":"e15742329ec940ce9dfecacca93d7867a569570fd999bf4eafc7c28c93c53299","expiresAt":1794046612,"unsignedEnvelopeHash":"9646088ae8f1c6ab981066894bfa5ad793f3e4dd4e28bc68d5a6f79af55931aa","signingHash":"55ec5ddf4810d378f47afb9a53431e62bc8f9aab87e37146d6eb394d6f703e80"});

const REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'cb5a0040-3850-4350-8978-4c7ba51cac4b');
const REOPENED_PDF_RECOVERY_SOURCE_HASH = '46133ccc474d26ad8714a60ca3ff88ea0dfb2e163bc0d2918cdf618096aff6e3';
const EXPIRED_PDF_RECOVERY_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'bf5db55a-0d30-4e5c-9ecd-6af1c97e36de');
const EXPIRED_PDF_RECOVERY_BASE_HASH = '149fd42dbfb86eacac0bd079e5af97af6111cd9bf2c4b087d6502495d8ba4b22';
const EXPIRED_PDF_RECOVERY_BASE_APPROVAL_HASH = '0acd6cde17a2996df405d6507390e0b27039d45757db77b60422bdae0ad300de';
const EXPIRED_PDF_RECOVERY_EVIDENCE_HASH = '3703e6b575876a21965b3f9a4ee31868d473b853a819adcd5d0cad2f044541fc';
const EXPIRED_PDF_RECOVERY_EXPIRY = Math.floor(Date.parse('2026-11-02T18:41:39Z')/1000);
const EXPIRED_PDF_RECOVERY_PROOF = Object.freeze({
  requestId:'7b704051-d090-4251-ad57-82d45067f4e8',
  operationId:'52ea85d09aa5a14d008395fe82cec664e09cadb57aad1c55748038ca1774fbf8',
  expiresAt:EXPIRED_PDF_RECOVERY_EXPIRY,
  unsignedEnvelopeHash:'fca588c043a5c0e62ceb58614e0291091bdb1bdcf2029d6c0ae36d471152f7d4',
  signingHash:'72263e5bb8a0bec42fbe84f8825738d34752ce2ddd01e681977f7383bb5ae22a'
});

const RESUME_BASE_HASH = 'e3dcee6b274631db745401639a44a6290319fc04317e45a7437189ed2442a083';
const RESUME_BASE_APPROVAL_HASH = 'b5567ed7746be4cc5aa0da4d637977fa188af8633c2184d89ffb225eb2741a1b';
const RESUME_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', '79d18d6d-7521-465c-999c-393bbb2212f9');
const MAINTENANCE_THREE_DESCRIPTOR = freeze({...{"requestId":"5aea0ca6-80ff-40d0-a34a-2e98a7363bb9","source":"GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB","maxFeeStroops":"6237456","keysSha256":"1269fd0fed0ec9938ab7f8b486514c83f8655048b62f83e30c36486255c99a8a","footprintSha256":"6c92ffca0a37dff13f5c13efeb85732c496dd70178b059a7edda23ad34d7d3b4","keys":["AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAAAwAAAA8AAAAFRW50cnkAAAAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACCkwjnhuJFE0xF6lTeEGoZ9ky/8Bp++fXLPKswr2cZAUQAAAAE=","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAAAwAAAA8AAAAJT3BlcmF0aW9uAAAAAAAAEgAAAAAAAAAAFdb+LzZYcxXJ/lIhdwIfrUOZjEsKFhmdSZip12p9YukAAAANAAAAIAZaQqCDoUh8/kQYjMws3NBbwZBHn9qSXejObUaqvfV9AAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACCkwjnhuJFE0xF6lTeEGoZ9ky/8Bp++fXLPKswr2cZAUQAAAAMAAAABAAAAAQ=="],"attemptRunId":"79d18d6d-7521-465c-999c-393bbb2212f9","attemptOperation":"restorec2proofs"},attemptFile:privateDirectoryFile(RESUME_BASE_DIRECTORY,'clinical-c2-maintenance-attempt.private.json')});
const MAINTENANCE_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'c5d94d9b-0457-4402-8b6d-bc488f820d67');
const MAINTENANCE_DESCRIPTOR = freeze({
  requestId:'b6329a70-5b43-4193-8708-86be4280a7ef',
  source:'GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB',
  maxFeeStroops:'20000000',
  keysSha256:'2c5d074cd1e6709c9db64bd884dbef0876309b088cdcb43eeb54423a587af473',
  footprintSha256:'8ba7b7ea962a539977cbca00bddc0b2f636bfe8f1f40f7ba55eb5ccef25e005a',
  keys:["AAAAB0cD0m9+1jIcTF8byyCsk5LEPHn64+DxatvHrHDnOBVc","AAAAB7Md6Jz9cEqpF6/SuQVrl6OCQtkfJFKEaiCJYvfeNY4C","AAAABgAAAAFbjTSy8jdDl8aG0EgbjhQHtJ4RIPM9EEOunF1NzumAaQAAABAAAAABAAAAAgAAAA8AAAAGRG9jdG9yAAAAAAASAAAAAAAAAAAV1v4vNlhzFcn+UiF3Ah+tQ5mMSwoWGZ1JmKnXan1i6QAAAAE=","AAAABgAAAAFbjTSy8jdDl8aG0EgbjhQHtJ4RIPM9EEOunF1NzumAaQAAABQAAAAB","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAAAgAAAA8AAAAHSGlzdG9yeQAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAAAgAAAA8AAAAHUGF0aWVudAAAAAASAAAAAAAAAADoijNOjxYq8x6O8wjZgtlzHkI4seHGKyiUO+VvLZGrYAAAAAE=","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAAAwAAAA8AAAAFR3JhbnQAAAAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAAEgAAAAAAAAAAFdb+LzZYcxXJ/lIhdwIfrUOZjEsKFhmdSZip12p9YukAAAAB","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACA9uKsOO747Zf4NluuBtlminejxV6VOaNX8kZ4c2IdDgAAAAAMAAAABAAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACCGEI3mhhAZGVGxR4KJosLjeMh6xiRBdIFh1FdEMHG35QAAAAMAAAABAAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACCcKkqOwcJE7YYzGII1D5I98CqM2FhKibb8fnZhvVOrEQAAAAMAAAABAAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACCcKkqOwcJE7YYzGII1D5I98CqM2FhKibb8fnZhvVOrEQAAAAMAAAACAAAAAQ==","AAAABgAAAAGRtR7KRU1Iy0sCO1T0XyHX53/MO0VhVHm1ooIG55LWbgAAABAAAAABAAAABAAAAA8AAAAHVmVyc2lvbgAAAAANAAAAIN/3SNiMSN7Wa/nbDhDj6/jlHWOmGpuq99Gi7kRL+zAYAAAADQAAACDIGUBPO4FxPL5a+z73mqoFnGc5KJkd9Z+b0Yxw2nioqAAAAAMAAAABAAAAAQ==","AAAABgAAAAHo3xblv52Fv8OW7fiL+jBqyW5lT9ZZh2s1Xl8+zI+KLAAAABAAAAABAAAAAgAAAA8AAAACUngAAAAAAAUAAAAAAAAAAwAAAAE=","AAAABgAAAAHo3xblv52Fv8OW7fiL+jBqyW5lT9ZZh2s1Xl8+zI+KLAAAABQAAAAB"]
});

const COMPLETION_PDF_REQUEST = '7b704051-d090-4251-ad57-82d45067f4e8';
const COMPLETION_PDF_OPERATION = '52ea85d09aa5a14d008395fe82cec664e09cadb57aad1c55748038ca1774fbf8';
const SECOND_PDF_REPLACEMENT_BASE_HASH = '83a46ca163f9a7dd2ced3a99ee6bf187e4f184d7978ea84904118513ac22b1b3';
const SECOND_PDF_REPLACEMENT_APPROVAL_HASH = 'c08ef3165e2f60ad6ed096f1d52840321e8d8533fff5c3e29bc81399118e41df';
const THIRD_PDF_REPLACEMENT_BASE_HASH = '6ad1f0558da616fe37e6eea46161597d0d3adf8635df68dbd3840bc0c0478956';
const THIRD_PDF_REPLACEMENT_APPROVAL_HASH = '330b65b8b635077c928e8be83f050433dfc56c0283e8772f14225e254e0acf26';
// Exact terminal, unsigned and released attempt independently audited before raw11 preparation.
const THIRD_PDF_REPLACEMENT_PROOF = Object.freeze({"requestId":"ac5d06bb-c2c7-4af0-9c91-7feb2a5a1d65","operationId":"22a3ed39a40d6aa28d721e42c886a3d76f5de45d5ef59731beba2d4b215ac355","expiresAt":1792967797,"unsignedEnvelopeHash":"8ec5b5e47c4fbf19c14d0254f4c55077cc0cefda3db435fa85653296f6cc9190","signingHash":"bb66bb48b433ba43e8d3c8262efdc5ee5e0f2194c5319cda15d77a0d74862b50"});
const CONFIRMED_CONTINUATION_RENEWAL = '683f4082e8c4563434760ef008b83c94f959a27ef7dcee05e8c3ab77923ae424';
const CLOSING_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', "724be994-d8c5-4e79-aae3-5dd6e76327b2");
const CLOSING_SOURCE_HASH = "3cfb59acd4c39d574502631482038c1753a40644ad36e72f0176542f2966b4fc";
const CLOSING_SOURCE_APPROVAL_HASH = "8d017e7200bd1add1f6b5571b4f21576cc9399cd8079cca2d925395d3297e604";
const CLOSING_AMENDMENT_ID = "e2abf263-1090-4a0e-b920-d9cf01bbfdc8";
const CLOSING_PDF_HASH = "4b0f01b1981c6b829a70aca4670089e8c722d05a452333774c75c53a0062bf7d";
const CLOSING_RENEWAL_HASH = "a5a32f4e46b2e90f50781fa6ee5aa69e4fe78fa78c466d037cffd9401e6a15ba";
const CLOSING_CONTINUATION_POLICIES = new WeakSet();
const AMENDED_POLICIES = new WeakSet();
const EXPANDED_BUDGET_POLICIES = new WeakSet();
const REALLOCATED_POLICIES = new WeakSet();
const TOTAL_FEE = STEP_FEE * 8n;
const epoch = () => Math.floor(Date.now() / 1000);
const fail = (code = 'clinical_rehearsal_scope_rejected') => { throw new Error(code); };
const check = (condition, code) => { if (!condition) fail(code); };
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value, required, optional = []) {
  return plain(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
}
const hash = value => typeof value === 'string' && HASH.test(value) && !/^0+$/.test(value);
const uuid = value => typeof value === 'string' && UUID.test(value);
const wallet = value => typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
const integer = value => Number.isSafeInteger(value) && value > 0;
const email = value => typeof value === 'string' && value === value.trim().toLowerCase() && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function amount(value, limit, exceededCode) {
  check(typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value));
  const parsed = BigInt(value); check(parsed <= limit, exceededCode); return parsed;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Canonical JSON only: rejects undefined, sparse arrays, exotic objects and cycles. */
export function canonicalJSON(value) {
  const active = new Set();
  function visit(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') { check(Number.isFinite(item)); return JSON.stringify(item); }
    check(Array.isArray(item) || plain(item)); check(!active.has(item)); active.add(item);
    let result;
    if (Array.isArray(item)) {
      check(Object.keys(item).length === item.length && Object.keys(item).every((key, index) => key === String(index)));
      result = '[' + item.map(visit).join(',') + ']';
    } else {
      check(Object.getOwnPropertySymbols(item).length === 0);
      result = '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + visit(item[key])).join(',') + '}';
    }
    active.delete(item); return result;
  }
  return visit(value);
}
export function payloadHash(value) { return createHash('sha256').update(canonicalJSON(value)).digest('hex'); }
function derivedHistory(patient) {
  const tuple = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('hist_id'), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()), new Address(CONTRACT).toScVal(), new Address(patient).toScVal()]);
  return createHash('sha256').update(tuple.toXDR()).digest('hex');
}
function derivedEntry(history, author, operationId) {
  const tuple = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()), new Address(CONTRACT).toScVal(), nativeToScVal(Buffer.from(history, 'hex')), new Address(author).toScVal(), nativeToScVal(Buffer.from(operationId, 'hex'))]);
  return createHash('sha256').update(tuple.toXDR()).digest('hex');
}
function actor(value) {
  check(exact(value, ['userId', 'walletId', 'address'], ['email']) && TEXT_ID.test(value.userId) && typeof value.walletId === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(value.walletId) && wallet(value.address));
  if (value.email !== undefined) check(email(value.email));
}
function note(value) {
  check(exact(value, ['title', 'text', 'eventDate', 'prescriptionId']) && typeof value.title === 'string' && value.title === value.title.trim() && value.title.length > 0 && value.title.length <= 120 && typeof value.text === 'string' && value.text === value.text.trim() && value.text.length > 0 && value.text.length <= 20_000 && uuid(value.prescriptionId));
  check(value.eventDate === null || typeof value.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.eventDate) && Number.isFinite(Date.parse(value.eventDate)) && new Date(value.eventDate).toISOString().slice(0, 10) === value.eventDate);
}
function pdf(value) {
  check(exact(value, ['fileName', 'mediaType', 'base64']) && value.mediaType === 'application/pdf' && typeof value.fileName === 'string' && value.fileName.trim() === value.fileName && value.fileName.length > 0 && Buffer.byteLength(value.fileName) <= 255 && !/[\x00-\x1f\x7f/\\]/.test(value.fileName) && !['.', '..'].includes(value.fileName));
  check(typeof value.base64 === 'string' && value.base64.length <= 4_000_000 && value.base64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.base64));
  const bytes = Buffer.from(value.base64, 'base64');
  check(bytes.length > 0 && bytes.length <= 3_000_000 && bytes.toString('base64') === value.base64 && /^%PDF-(1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(bytes.subarray(0, 12).toString('ascii')) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii')));
}
function validate(plan, now) {
  check(exact(plan, ['schemaVersion', 'runId', 'createdAt', 'until', 'doctorValidUntil', 'network', 'contractId', 'registryId', 'relayer', 'admin', 'patient', 'doctor', 'historyId', 'doctorId', 'startingGrantRevision', 'startingDoctorVersion', 'totalMaxFeeStroops', 'steps', 'authorization', 'reviewer']));
  check(plan.schemaVersion === 1 && uuid(plan.runId) && integer(plan.createdAt) && integer(plan.until) && plan.until > plan.createdAt && plan.until - plan.createdAt <= 6 * 3600 && plan.createdAt <= now && now < plan.until, 'clinical_rehearsal_expired');
  check(plan.doctorValidUntil === plan.createdAt + 86400 && plan.network === 'testnet' && plan.contractId === CONTRACT && plan.registryId === REGISTRY && plan.admin === ADMIN && wallet(plan.relayer));
  actor(plan.patient); actor(plan.doctor);
  check(plan.patient.userId !== plan.doctor.userId && plan.patient.walletId !== plan.doctor.walletId && plan.patient.address !== plan.doctor.address && ![plan.patient.address, plan.doctor.address].includes(plan.admin));
  check(exact(plan.reviewer, ['userId', 'email']) && TEXT_ID.test(plan.reviewer.userId) && email(plan.reviewer.email));
  check(plan.doctorId === 10 && plan.startingGrantRevision === 3 && plan.startingDoctorVersion === 3 && hash(plan.historyId) && plan.historyId === derivedHistory(plan.patient.address));
  const total = amount(plan.totalMaxFeeStroops, TOTAL_FEE);
  check(Array.isArray(plan.steps) && plan.steps.length === 8);
  const ids = new Set(), operations = new Set(); let offered = 0n;
  plan.steps.forEach((step, index) => {
    check(exact(step, ['key', 'requestId', 'actor', 'action', 'maxFeeStroops'], ['input', 'operationId']) && step.key === KEYS[index] && uuid(step.requestId) && !ids.has(step.requestId));
    ids.add(step.requestId); offered += amount(step.maxFeeStroops, STEP_FEE);
    if (index === 0) { check(step.actor === 'admin' && step.action === 'renew' && step.input === undefined && step.operationId === undefined); return; }
    check(hash(step.operationId) && !operations.has(step.operationId)); operations.add(step.operationId);
    const input = step.input; check(plain(input) && input.requestId === step.requestId && input.action === step.action);
    if ([1, 2, 4, 7].includes(index)) {
      const flags = index === 1 ? [true, false] : index === 2 ? [false, true] : index === 4 ? [true, true] : [false, false];
      const revision = index === 1 ? 3 : index === 2 ? 4 : index === 4 ? 5 : 6;
      check(step.actor === 'patient' && step.action === 'set_permissions' && exact(input, ['requestId', 'action', 'doctorId', 'canRead', 'canAppend', 'expectedRevision']) && input.doctorId === plan.doctorId && input.canRead === flags[0] && input.canAppend === flags[1] && input.expectedRevision === revision);
    } else {
      check(step.actor === 'doctor' && step.action === 'append_version' && input.historyId === plan.historyId);
      if (index === 3 || index === 6) {
        check(exact(input, ['requestId', 'action', 'historyId', 'note', ...(index === 6 ? ['entryId', 'expectedVersion'] : [])], index === 3 ? ['expectedVersion'] : []));
        note(input.note);
        if (index === 3) check(input.expectedVersion === undefined || input.expectedVersion === 0);
        else check(input.expectedVersion === 1 && input.entryId === derivedEntry(plan.historyId, plan.doctor.address, plan.steps[3].operationId) && input.note.prescriptionId === plan.steps[3].input.note.prescriptionId && payloadHash(input.note) !== payloadHash(plan.steps[3].input.note));
      } else {
        check(index === 5 && exact(input, ['requestId', 'action', 'historyId', 'file'], ['expectedVersion']) && (input.expectedVersion === undefined || input.expectedVersion === 0)); pdf(input.file);
      }
    }
  });
  check(offered <= total);
  const authorization = plan.authorization;
  check(exact(authorization, ['requestId', 'dossierId', 'validUntil', 'expectedVersion', 'targetVersion', 'method']) && authorization.requestId === plan.steps[0].requestId && uuid(authorization.dossierId) && !ids.has(authorization.dossierId) && authorization.validUntil === plan.doctorValidUntil && authorization.expectedVersion === 3 && authorization.targetVersion === 4 && authorization.method === 'reauthorize_doctor');
  return plan;
}

/** A continuation has no authority until the exact one-time human attestation is
 * pinned separately. All dates derive from that fixed approval, never load time. */
function validateContinuation(raw, approval, now, original) {
  check(exact(raw, ['schemaVersion','runId','preparedAt','notBefore','executionWindowSeconds','doctorWindowSeconds','network','contractId','registryId','relayer','admin','patient','doctor','historyId','doctorId','startingGrantRevision','startingDoctorVersion','totalMaxFeeStroops','steps','authorization','reviewer','lineage']));
  check(raw.schemaVersion === 2 && uuid(raw.runId) && raw.runId !== original.runId && integer(raw.preparedAt) && integer(raw.notBefore));
  check(raw.executionWindowSeconds === 21600 && raw.doctorWindowSeconds === 86400 && raw.notBefore === original.doctorValidUntil);
  check(exact(approval, ['schemaVersion','planHash','approvedAt','statement']) && approval.schemaVersion === 1 && hash(approval.planHash) && integer(approval.approvedAt) && typeof approval.statement === 'string' && approval.statement.trim() === approval.statement && approval.statement.length > 0 && approval.statement.length <= 2000, 'clinical_rehearsal_approval_required');
  check(approval.approvedAt >= raw.preparedAt && raw.preparedAt >= original.createdAt && approval.approvedAt <= now && now < approval.approvedAt + raw.executionWindowSeconds && raw.notBefore < approval.approvedAt + raw.executionWindowSeconds, 'clinical_rehearsal_expired');
  check(now >= raw.notBefore, 'clinical_rehearsal_not_started');
  for (const key of ['network','contractId','registryId','relayer','admin','historyId','doctorId']) check(raw[key] === original[key]);
  for (const key of ['patient','doctor','reviewer']) check(payloadHash(raw[key]) === payloadHash(original[key]));
  check(raw.patient.address === CONTINUATION_PATIENT && raw.doctor.address === CONTINUATION_DOCTOR);
  check(raw.startingGrantRevision === 5 && raw.startingDoctorVersion === 4);
  const lineage = raw.lineage;
  check(exact(lineage, ['originalPlanFile','originalPlanHash','originalRunId','confirmed','cancelledNote','priorDoctorValidUntil']) && lineage.originalRunId === original.runId && lineage.priorDoctorValidUntil === original.doctorValidUntil);
  check(Array.isArray(lineage.confirmed) && lineage.confirmed.length === 3);
  lineage.confirmed.forEach((prior,index) => check(exact(prior, ['key','requestId','transactionHash']) && prior.key === KEYS[index] && prior.requestId === original.steps[index].requestId && prior.transactionHash === PRIOR_RECEIPTS[index]));
  const cancelled = lineage.cancelledNote;
  check(exact(cancelled, ['requestId','operationId','expiresAt']) && cancelled.requestId === original.steps[3].requestId && cancelled.operationId === original.steps[3].operationId && integer(cancelled.expiresAt) && cancelled.expiresAt > original.createdAt && cancelled.expiresAt <= original.until && cancelled.expiresAt <= approval.approvedAt);
  check(Array.isArray(raw.steps) && raw.steps.length === CONTINUATION_KEYS.length);
  const oldIds = new Set([original.runId, original.authorization.dossierId, ...original.steps.map(s => s.requestId)]);
  const oldOperations = new Set(original.steps.map(s => s.operationId).filter(Boolean));
  const ids = new Set(), operations = new Set(); let offered = 0n;
  raw.steps.forEach((step,index) => {
    check(exact(step, ['key','requestId','actor','action','maxFeeStroops'], ['input','operationId']) && step.key === CONTINUATION_KEYS[index] && uuid(step.requestId) && !oldIds.has(step.requestId) && !ids.has(step.requestId));
    ids.add(step.requestId); offered += amount(step.maxFeeStroops, STEP_FEE);
    if (!index) { check(step.actor === 'admin' && step.action === 'renew' && step.input === undefined && step.operationId === undefined); return; }
    check(hash(step.operationId) && !operations.has(step.operationId) && !oldOperations.has(step.operationId)); operations.add(step.operationId);
    const input = step.input;
    check(plain(input) && input.requestId === step.requestId && input.action === step.action);
    if (step.key === 'grant_both' || step.key === 'revoke') {
      const both = step.key === 'grant_both';
      check(step.actor === 'patient' && step.action === 'set_permissions' && exact(input, ['requestId','action','doctorId','canRead','canAppend','expectedRevision']) && input.doctorId === raw.doctorId && input.canRead === both && input.canAppend === both && input.expectedRevision === (both ? 5 : 6));
    } else {
      check(step.actor === 'doctor' && step.action === 'append_version' && input.historyId === raw.historyId);
      if (step.key === 'append_pdf') {
        check(exact(input, ['requestId','action','historyId','file'], ['expectedVersion']) && (input.expectedVersion === undefined || input.expectedVersion === 0));
        pdf(input.file); check(payloadHash(input.file) === payloadHash(original.steps[5].input.file));
      } else {
        const correction = step.key === 'correct_note';
        check(exact(input, ['requestId','action','historyId','note', ...(correction ? ['entryId','expectedVersion'] : [])], correction ? [] : ['expectedVersion']));
        note(input.note); check(payloadHash(input.note) === payloadHash(original.steps[correction ? 6 : 3].input.note));
        if (correction) check(input.expectedVersion === 1 && input.entryId === derivedEntry(raw.historyId, raw.doctor.address, raw.steps[1].operationId));
        else check(input.expectedVersion === undefined || input.expectedVersion === 0);
      }
    }
  });
  const total = amount(raw.totalMaxFeeStroops, STEP_FEE * 6n); check(offered <= total);
  const a = raw.authorization;
  check(exact(a, ['requestId','dossierId','expectedVersion','targetVersion','method']) && a.requestId === raw.steps[0].requestId && uuid(a.dossierId) && !oldIds.has(a.dossierId) && !ids.has(a.dossierId) && a.expectedVersion === 4 && a.targetVersion === 5 && a.method === 'reauthorize_doctor');
  const normalized = { ...raw, createdAt: approval.approvedAt, until: approval.approvedAt + raw.executionWindowSeconds, doctorValidUntil: approval.approvedAt + raw.doctorWindowSeconds, authorization: { ...a, validUntil: approval.approvedAt + raw.doctorWindowSeconds } };
  Object.defineProperty(normalized, 'previousAuthorization', { value: original.authorization, enumerable: false });
  Object.defineProperty(normalized, 'previousSteps', { value: original.steps, enumerable: false });
  return normalized;
}
/** Approval shape is identical across manifests; each record is bound to its
 * own manifest hash and separately pinned bytes. No loader creates attestations. */
function approvalRecord(approval, digest) {
  check(exact(approval, ['schemaVersion','planHash','approvedAt','statement']) && approval.schemaVersion === 1 && approval.planHash === digest && hash(approval.planHash) && integer(approval.approvedAt) && typeof approval.statement === 'string' && approval.statement.trim() === approval.statement && approval.statement.length > 0 && approval.statement.length <= 2000, 'clinical_rehearsal_approval_required');
}
function continuationWithOriginal(raw, approval, now, env) {
  check(raw?.schemaVersion === 2 && plain(raw.lineage) && hash(raw.lineage.originalPlanHash));
  const originalBytes = privateBytes(raw.lineage.originalPlanFile, env, raw.lineage.originalPlanHash).bytes;
  const originalRaw = JSON.parse(originalBytes.toString('utf8'));
  const original = freeze(validate(originalRaw, originalRaw.createdAt));
  return validateContinuation(raw, approval, now, original);
}
/** Schema3 preserves the pinned v2 execution dates. Schema4 requires a new
 * approval for a capped execution window while preserving every fixed identity,
 * payload and the already-confirmed doctor expiry. Neither can renew a doctor. */
function validateFeeAmendment(raw, approval, now, env, actual) {
  const continuation = raw.schemaVersion === 4;
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','doctorMaxFeeStroops','permissionMaxFeeStroops','remainingMaxFeeStroops', ...(continuation ? ['executionWindowSeconds','confirmedRenewalTransactionHash'] : [])]));
  check([3,4].includes(raw.schemaVersion) && uuid(raw.amendmentId) && integer(raw.preparedAt) && hash(raw.basePlanHash) && hash(raw.baseApprovalHash));
  if (continuation) check(raw.executionWindowSeconds === 21600 && raw.confirmedRenewalTransactionHash === CONFIRMED_CONTINUATION_RENEWAL);
  check(raw.doctorMaxFeeStroops === DOCTOR_FEE.toString() && raw.permissionMaxFeeStroops === STEP_FEE.toString() && raw.remainingMaxFeeStroops === (3n * DOCTOR_FEE + 2n * STEP_FEE).toString());
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 2 && baseRaw.runId !== raw.amendmentId);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = continuationWithOriginal(baseRaw, baseApproval, continuation ? Math.max(baseApproval.approvedAt, baseRaw.notBefore) : now, env);
  check(approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now, 'clinical_rehearsal_expired');
  let executionUntil = base.until;
  if (continuation) {
    check(raw.preparedAt >= base.until && raw.preparedAt < base.doctorValidUntil, 'clinical_rehearsal_expired');
    executionUntil = Math.min(approval.approvedAt + raw.executionWindowSeconds, base.doctorValidUntil);
    check(now < executionUntil, 'clinical_rehearsal_expired');
  } else {
    check(raw.preparedAt >= base.createdAt && raw.preparedAt < base.until && approval.approvedAt < base.until, 'clinical_rehearsal_expired');
  }
  check(base.steps.every(step => step.maxFeeStroops === STEP_FEE.toString()) && base.totalMaxFeeStroops === (6n * STEP_FEE).toString());
  const plan = { ...base, until:executionUntil, steps: base.steps.map(step => ({ ...step, maxFeeStroops: step.actor === 'doctor' ? DOCTOR_FEE.toString() : step.maxFeeStroops })), totalMaxFeeStroops: (3n * DOCTOR_FEE + 3n * STEP_FEE).toString() };
  Object.defineProperty(plan, 'previousAuthorization', { value: freeze(base.previousAuthorization), enumerable: false });
  Object.defineProperty(plan, 'previousSteps', { value: freeze(base.previousSteps), enumerable: false });
  Object.defineProperty(plan, 'feeAmendment', { value: freeze({ amendmentId:raw.amendmentId, preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, basePlanHash:raw.basePlanHash, baseApprovalHash:raw.baseApprovalHash, baseApprovedAt:base.createdAt, baseUntil:base.until, doctorMaxFeeStroops:raw.doctorMaxFeeStroops, permissionMaxFeeStroops:raw.permissionMaxFeeStroops, remainingMaxFeeStroops:raw.remainingMaxFeeStroops, ...(continuation ? { executionApprovedAt:approval.approvedAt, executionWindowSeconds:raw.executionWindowSeconds, originalUntil:base.until, executionUntil, confirmedRenewalTransactionHash:raw.confirmedRenewalTransactionHash } : {}) }), enumerable:false });
  return plan;
}
/** One specifically approved replacement of an expired, unsigned note slot.
 * The database boundary must independently verify the pinned terminal proof.
 * No old slot is reset; no other identity, payload, budget or date changes. */
function validateNoteReplacement(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','replacementNoteRequestId','replacementNoteOperationId','supersededNote']));
  check(raw.schemaVersion === 5 && uuid(raw.amendmentId) && integer(raw.preparedAt) && hash(raw.basePlanHash) && hash(raw.baseApprovalHash));
  check(uuid(raw.replacementNoteRequestId) && hash(raw.replacementNoteOperationId));
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 4 && baseRaw.amendmentId !== raw.amendmentId);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateFeeAmendment(baseRaw, baseApproval, now, env, baseRecord.actual));
  const oldStep = base.steps.find(step => step.key === 'append_note');
  const proof = raw.supersededNote;
  check(oldStep && exact(proof, ['requestId','operationId','expiresAt','unsignedEnvelopeHash']) && proof.requestId === oldStep.requestId && proof.operationId === oldStep.operationId && integer(proof.expiresAt) && hash(proof.unsignedEnvelopeHash));
  check(proof.expiresAt > base.feeAmendment.executionApprovedAt && proof.expiresAt <= base.until && raw.preparedAt >= proof.expiresAt && approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId, base.lineage.originalRunId, base.authorization.dossierId, base.previousAuthorization.dossierId, baseRaw.amendmentId, ...base.steps.map(step => step.requestId), ...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId) && !ids.has(raw.replacementNoteRequestId) && raw.replacementNoteRequestId !== raw.amendmentId);
  const operations = new Set([...base.steps, ...base.previousSteps].map(step => step.operationId).filter(Boolean));
  check(!operations.has(raw.replacementNoteOperationId));
  const replacementNoteEntryId = derivedEntry(base.historyId, base.doctor.address, raw.replacementNoteOperationId);
  const steps = base.steps.map(step => step.key === 'append_note'
    ? { ...step, requestId:raw.replacementNoteRequestId, operationId:raw.replacementNoteOperationId, input:{ ...step.input, requestId:raw.replacementNoteRequestId } }
    : step.key === 'correct_note' ? { ...step, input:{ ...step.input, entryId:replacementNoteEntryId } } : step);
  const plan = { ...base, steps };
  Object.defineProperty(plan, 'previousAuthorization', { value:base.previousAuthorization, enumerable:false });
  Object.defineProperty(plan, 'previousSteps', { value:base.previousSteps, enumerable:false });
  Object.defineProperty(plan, 'feeAmendment', { value:base.feeAmendment, enumerable:false });
  Object.defineProperty(plan, 'noteReplacement', { value:freeze({ amendmentId:raw.amendmentId, preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, basePlanHash:raw.basePlanHash, baseApprovalHash:raw.baseApprovalHash, supersededNote:{ ...proof }, supersededStep:oldStep, replacementNoteRequestId:raw.replacementNoteRequestId, replacementNoteOperationId:raw.replacementNoteOperationId, replacementNoteEntryId }), enumerable:false });
  return plan;
}
/** A separately approved financial amendment of the exact live schema5 plan.
 * It does not alter the execution window, identity slots, content or renewal. */
function validateExpandedBudget(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','doctorMaxFeeStroops','permissionMaxFeeStroops','remainingMaxFeeStroops']));
  check(raw.schemaVersion === 6 && uuid(raw.amendmentId) && integer(raw.preparedAt) && hash(raw.basePlanHash) && hash(raw.baseApprovalHash));
  const permissionFee = raw.permissionMaxFeeStroops === STEP_FEE.toString() ? STEP_FEE : raw.permissionMaxFeeStroops === EXPANDED_PERMISSION_FEE.toString() ? EXPANDED_PERMISSION_FEE : null;
  check(raw.doctorMaxFeeStroops === EXPANDED_DOCTOR_FEE.toString() && permissionFee !== null && raw.remainingMaxFeeStroops === (3n * EXPANDED_DOCTOR_FEE + 2n * permissionFee).toString());
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 5);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateNoteReplacement(baseRaw, baseApproval, now, env, baseRecord.actual));
  check(raw.preparedAt >= base.noteReplacement.approvedAt && raw.preparedAt < base.until && approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,baseRaw.amendmentId,base.feeAmendment.amendmentId,...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId));
  check(base.totalMaxFeeStroops === (3n * DOCTOR_FEE + 3n * STEP_FEE).toString() && base.steps.every(step => step.maxFeeStroops === (step.actor === 'doctor' ? DOCTOR_FEE : STEP_FEE).toString()));
  const plan = { ...base, steps:base.steps.map(step => step.actor === 'doctor' ? { ...step, maxFeeStroops:EXPANDED_DOCTOR_FEE.toString() } : step.actor === 'patient' ? { ...step, maxFeeStroops:permissionFee.toString() } : step), totalMaxFeeStroops:(3n * EXPANDED_DOCTOR_FEE + 2n * permissionFee + STEP_FEE).toString() };
  Object.defineProperty(plan, 'previousAuthorization', { value:base.previousAuthorization, enumerable:false });
  Object.defineProperty(plan, 'previousSteps', { value:base.previousSteps, enumerable:false });
  Object.defineProperty(plan, 'feeAmendment', { value:base.feeAmendment, enumerable:false });
  Object.defineProperty(plan, 'noteReplacement', { value:base.noteReplacement, enumerable:false });
  Object.defineProperty(plan, 'budgetAmendment', { value:freeze({ amendmentId:raw.amendmentId, preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, basePlanHash:raw.basePlanHash, baseApprovalHash:raw.baseApprovalHash, doctorMaxFeeStroops:raw.doctorMaxFeeStroops, permissionMaxFeeStroops:raw.permissionMaxFeeStroops, remainingMaxFeeStroops:raw.remainingMaxFeeStroops }), enumerable:false });
  return plan;
}
/** Individually larger future caps are conditional on a separately approved,
 * real aggregate budget. Canonical receipt verification and reservation totals
 * remain mandatory in the async mutation boundary, under its source/run locks. */
function validateAggregateBudget(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','aggregateMaxFeeStroops','pdfMaxFeeStroops','correctionMaxFeeStroops','withdrawalMaxFeeStroops','confirmedSteps']));
  check(raw.schemaVersion === 7 && uuid(raw.amendmentId) && integer(raw.preparedAt) && hash(raw.basePlanHash) && hash(raw.baseApprovalHash));
  check(raw.aggregateMaxFeeStroops === REAL_AGGREGATE_FEE.toString() && raw.pdfMaxFeeStroops === REALLOCATED_DOCTOR_FEE.toString() && raw.correctionMaxFeeStroops === REALLOCATED_DOCTOR_FEE.toString() && raw.withdrawalMaxFeeStroops === WITHDRAWAL_RESERVE.toString());
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 6 && baseRaw.doctorMaxFeeStroops === EXPANDED_DOCTOR_FEE.toString() && baseRaw.permissionMaxFeeStroops === EXPANDED_PERMISSION_FEE.toString() && baseRaw.remainingMaxFeeStroops === REAL_AGGREGATE_FEE.toString());
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateExpandedBudget(baseRaw, baseApproval, now, env, baseRecord.actual));
  check(raw.preparedAt >= base.budgetAmendment.approvedAt && raw.preparedAt < base.until && approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,baseRaw.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId));
  check(Array.isArray(raw.confirmedSteps) && raw.confirmedSteps.length === 2);
  const confirmedHashes = new Set(); let charged = 0n;
  raw.confirmedSteps.forEach((receipt,index) => {
    const step = base.steps[index + 1];
    check(exact(receipt, ['key','requestId','operationId','transactionHash','feeChargedStroops','ledger']) && receipt.key === ['append_note','grant_both'][index] && receipt.key === step.key && receipt.requestId === step.requestId && receipt.operationId === step.operationId && hash(receipt.transactionHash) && !confirmedHashes.has(receipt.transactionHash) && integer(receipt.ledger));
    confirmedHashes.add(receipt.transactionHash);
    charged += amount(receipt.feeChargedStroops, BigInt(step.maxFeeStroops));
  });
  check(charged + WITHDRAWAL_RESERVE <= REAL_AGGREGATE_FEE);
  const caps = { append_pdf:REALLOCATED_DOCTOR_FEE, correct_note:REALLOCATED_DOCTOR_FEE, revoke:WITHDRAWAL_RESERVE };
  const plan = { ...base, steps:base.steps.map(step => Object.hasOwn(caps,step.key) ? { ...step, maxFeeStroops:caps[step.key].toString() } : step), totalMaxFeeStroops:(STEP_FEE + EXPANDED_DOCTOR_FEE + EXPANDED_PERMISSION_FEE + 2n * REALLOCATED_DOCTOR_FEE + WITHDRAWAL_RESERVE).toString() };
  Object.defineProperty(plan, 'previousAuthorization', { value:base.previousAuthorization, enumerable:false });
  Object.defineProperty(plan, 'previousSteps', { value:base.previousSteps, enumerable:false });
  Object.defineProperty(plan, 'feeAmendment', { value:base.feeAmendment, enumerable:false });
  Object.defineProperty(plan, 'noteReplacement', { value:base.noteReplacement, enumerable:false });
  Object.defineProperty(plan, 'budgetAmendment', { value:base.budgetAmendment, enumerable:false });
  Object.defineProperty(plan, 'aggregateBudget', { value:freeze({ amendmentId:raw.amendmentId, preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, basePlanHash:raw.basePlanHash, baseApprovalHash:raw.baseApprovalHash, aggregateMaxFeeStroops:raw.aggregateMaxFeeStroops, pdfMaxFeeStroops:raw.pdfMaxFeeStroops, correctionMaxFeeStroops:raw.correctionMaxFeeStroops, withdrawalMaxFeeStroops:raw.withdrawalMaxFeeStroops, withdrawalReserveStroops:WITHDRAWAL_RESERVE.toString(), confirmedSteps:raw.confirmedSteps.map(receipt => ({ ...receipt })) }), enumerable:false });
  return plan;
}
/** Pure arithmetic and temporal validation only. This returns a number, never
 * a policy or financial credential; it does not read files or register authority. */
export function rehearsalContinuationUntil(window) {
  check(exact(window, ['preparedAt','approvedAt','now','previousUntil','doctorValidUntil','executionWindowSeconds','executionNotAfter']));
  check(window.executionWindowSeconds === EXECUTION_CONTINUATION_SECONDS && window.executionNotAfter === EXECUTION_CONTINUATION_NOT_AFTER);
  for (const field of ['preparedAt','approvedAt','now','previousUntil','doctorValidUntil']) check(integer(window[field]), 'clinical_rehearsal_expired');
  check(Number.isSafeInteger(window.approvedAt + EXECUTION_CONTINUATION_SECONDS), 'clinical_rehearsal_expired');
  const until = Math.min(window.approvedAt + EXECUTION_CONTINUATION_SECONDS, EXECUTION_CONTINUATION_NOT_AFTER);
  check(window.preparedAt >= window.previousUntil && window.approvedAt >= window.preparedAt && window.now >= window.approvedAt && window.now < until && until > window.previousUntil && until <= window.doctorValidUntil - 900, 'clinical_rehearsal_expired');
  return until;
}
/** A time-only amendment of the exact previously approved forty-XLM scope.
 * The expired base is deserialized at its own historical approval instant only;
 * it is never returned or registered as current authority. No clinical slot,
 * receipt, budget, creation time or medical expiry can change here. */
function validateExecutionContinuation(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','executionWindowSeconds','executionNotAfter']));
  check(raw.schemaVersion === 8 && uuid(raw.amendmentId) && integer(raw.preparedAt));
  check(raw.basePlanHash === EXECUTION_CONTINUATION_BASE_HASH && raw.baseApprovalHash === EXECUTION_CONTINUATION_APPROVAL_HASH, 'clinical_rehearsal_approval_required');
  check(raw.executionWindowSeconds === EXECUTION_CONTINUATION_SECONDS && raw.executionNotAfter === EXECUTION_CONTINUATION_NOT_AFTER);
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 7 && baseRaw.aggregateMaxFeeStroops === REAL_AGGREGATE_FEE.toString() && baseRaw.pdfMaxFeeStroops === REALLOCATED_DOCTOR_FEE.toString() && baseRaw.correctionMaxFeeStroops === REALLOCATED_DOCTOR_FEE.toString() && baseRaw.withdrawalMaxFeeStroops === WITHDRAWAL_RESERVE.toString());
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateAggregateBudget(baseRaw, baseApproval, baseApproval.approvedAt, env, baseRecord.actual));
  const until = rehearsalContinuationUntil({ preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, now, previousUntil:base.until, doctorValidUntil:base.doctorValidUntil, executionWindowSeconds:raw.executionWindowSeconds, executionNotAfter:raw.executionNotAfter });
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,baseRaw.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,base.budgetAmendment.amendmentId,...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId));
  const plan = { ...base, until };
  for (const field of ['previousAuthorization','previousSteps','feeAmendment','noteReplacement','budgetAmendment','aggregateBudget']) Object.defineProperty(plan, field, { value:base[field], enumerable:false });
  Object.defineProperty(plan, 'executionContinuation', { value:freeze({ amendmentId:raw.amendmentId, preparedAt:raw.preparedAt, approvedAt:approval.approvedAt, basePlanHash:raw.basePlanHash, baseApprovalHash:raw.baseApprovalHash, executionWindowSeconds:raw.executionWindowSeconds, executionNotAfter:raw.executionNotAfter, previousUntil:base.until, executionUntil:until }), enumerable:false });
  return plan;
}
/** One specifically reviewed replacement of the expired unsigned PDF slot.
 * The execution window and all financial authority remain inherited from raw8. */
function validatePdfReplacement(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','replacementPdfRequestId','replacementPdfOperationId','supersededPdf']));
  check(raw.schemaVersion === 9 && uuid(raw.amendmentId) && integer(raw.preparedAt) && uuid(raw.replacementPdfRequestId) && raw.replacementPdfRequestId === raw.replacementPdfRequestId.toLowerCase() && hash(raw.replacementPdfOperationId));
  check(raw.basePlanHash === PDF_REPLACEMENT_BASE_HASH && raw.baseApprovalHash === PDF_REPLACEMENT_APPROVAL_HASH, 'clinical_rehearsal_approval_required');
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 8);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateExecutionContinuation(baseRaw, baseApproval, now, env, baseRecord.actual));
  const oldStep = base.steps.find(step => step.key === 'append_pdf'), proof = raw.supersededPdf;
  check(oldStep && exact(proof, ['requestId','operationId','expiresAt','unsignedEnvelopeHash','signingHash']) &&
    proof.requestId === oldStep.requestId && proof.operationId === oldStep.operationId &&
    proof.expiresAt === 1792961226 && proof.unsignedEnvelopeHash === '2c67edbc6474e7cda7c5a1487115dfc985ee3487b31e9d74a35209360348b122' &&
    proof.signingHash === '07cab2a02ffe8279e732863876315684b70a7b6aae8af3596498b2c688cee9c9');
  check(proof.expiresAt > base.executionContinuation.approvedAt && proof.expiresAt <= base.until &&
    raw.preparedAt >= proof.expiresAt && raw.preparedAt < base.until && approval.approvedAt >= raw.preparedAt &&
    approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,
    base.executionContinuation.amendmentId,base.aggregateBudget.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,base.budgetAmendment.amendmentId,
    base.noteReplacement.supersededStep.requestId,...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId) && !ids.has(raw.replacementPdfRequestId) && raw.amendmentId !== raw.replacementPdfRequestId);
  const operations = new Set([...base.steps,...base.previousSteps,base.noteReplacement.supersededStep].map(step => step.operationId).filter(Boolean));
  check(!operations.has(raw.replacementPdfOperationId));
  const replacementPdfEntryId = derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId);
  const steps = base.steps.map(step => step.key === 'append_pdf'
    ? {...step,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...step.input,requestId:raw.replacementPdfRequestId}} : step);
  const plan = {...base,steps};
  for (const field of ['previousAuthorization','previousSteps','feeAmendment','noteReplacement','budgetAmendment','aggregateBudget','executionContinuation']) Object.defineProperty(plan,field,{value:base[field],enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,supersededPdf:{...proof},supersededStep:oldStep,
    replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId}),enumerable:false});
  return plan;
}

/** One further explicitly approved replacement of that exact raw9 PDF only.
 * This is deliberately not a recursive replacement format or a new window. */
function validateSecondPdfReplacement(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','replacementPdfRequestId','replacementPdfOperationId','supersededPdf']));
  check(raw.schemaVersion === 10 && uuid(raw.amendmentId) && integer(raw.preparedAt) && uuid(raw.replacementPdfRequestId) && hash(raw.replacementPdfOperationId));
  const proof = raw.supersededPdf;
  check(exact(proof, ['requestId','operationId','expiresAt','unsignedEnvelopeHash','signingHash']) &&
    proof.requestId === '433ae780-920e-4987-8a2e-8b96d5110545' && proof.operationId === '55badf20c0d41903b55f04e8b4a319923a3f0cac525d2f8d06d4ed0fbe947a7a' &&
    proof.expiresAt === 1792964311 && proof.unsignedEnvelopeHash === '6690f0168c7b201d9a3fa9e8b9c1e57aae5f4944916b0c098111889d99c2535b' &&
    proof.signingHash === '26c99cf87a8a46667cab0ec6f7843c9032cf1579642efdf2177695f4124c9447');
  check(raw.preparedAt >= proof.expiresAt && approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now, 'clinical_rehearsal_expired');
  check(raw.basePlanHash === SECOND_PDF_REPLACEMENT_BASE_HASH && raw.baseApprovalHash === SECOND_PDF_REPLACEMENT_APPROVAL_HASH, 'clinical_rehearsal_approval_required');
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 9);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validatePdfReplacement(baseRaw, baseApproval, now, env, baseRecord.actual));
  const oldStep = base.steps.find(step => step.key === 'append_pdf');
  check(oldStep && proof.requestId === oldStep.requestId && proof.operationId === oldStep.operationId);
  check(proof.expiresAt > base.pdfReplacement.approvedAt && proof.expiresAt <= base.until &&
    raw.preparedAt >= proof.expiresAt && raw.preparedAt < base.until && approval.approvedAt >= raw.preparedAt &&
    approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,
    base.executionContinuation.amendmentId,base.aggregateBudget.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,base.budgetAmendment.amendmentId,
    base.pdfReplacement.amendmentId,base.pdfReplacement.supersededStep.requestId,base.noteReplacement.supersededStep.requestId,
    ...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId) && !ids.has(raw.replacementPdfRequestId) && raw.amendmentId !== raw.replacementPdfRequestId);
  const operations = new Set([...base.steps,...base.previousSteps,base.noteReplacement.supersededStep,base.pdfReplacement.supersededStep].map(step => step.operationId).filter(Boolean));
  check(!operations.has(raw.replacementPdfOperationId));
  const replacementPdfEntryId = derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId);
  const steps = base.steps.map(step => step.key === 'append_pdf'
    ? {...step,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...step.input,requestId:raw.replacementPdfRequestId}} : step);
  const plan = {...base,steps};
  for (const field of ['previousAuthorization','previousSteps','feeAmendment','noteReplacement','budgetAmendment','aggregateBudget','executionContinuation']) Object.defineProperty(plan,field,{value:base[field],enumerable:false});
  Object.defineProperty(plan,'priorPdfReplacement',{value:base.pdfReplacement,enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,supersededPdf:{...proof},supersededStep:oldStep,
    replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId}),enumerable:false});
  return plan;
}

/** Only the specifically reviewed raw10 PDF may be replaced once under raw11.
 * All three predecessors remain immutable prerequisites; no recursive format. */
function validateThirdPdfReplacement(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash','replacementPdfRequestId','replacementPdfOperationId','supersededPdf']));
  check(raw.schemaVersion === 11 && uuid(raw.amendmentId) && integer(raw.preparedAt) && uuid(raw.replacementPdfRequestId) && hash(raw.replacementPdfOperationId));
  const proof = raw.supersededPdf;
  check(exact(proof, ['requestId','operationId','expiresAt','unsignedEnvelopeHash','signingHash']) &&
    THIRD_PDF_REPLACEMENT_PROOF !== null && payloadHash(proof) === payloadHash(THIRD_PDF_REPLACEMENT_PROOF));
  check(raw.preparedAt >= proof.expiresAt && approval.approvedAt >= raw.preparedAt && approval.approvedAt <= now, 'clinical_rehearsal_expired');
  check(raw.basePlanHash === THIRD_PDF_REPLACEMENT_BASE_HASH && raw.baseApprovalHash === THIRD_PDF_REPLACEMENT_APPROVAL_HASH, 'clinical_rehearsal_approval_required');
  const baseRecord = privateBytes(raw.basePlanFile, env, raw.basePlanHash);
  check(baseRecord.actual !== actual);
  const baseRaw = JSON.parse(baseRecord.bytes.toString('utf8'));
  check(baseRaw?.schemaVersion === 10);
  const baseApprovalRecord = privateBytes(raw.baseApprovalFile, env, raw.baseApprovalHash, 4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval = JSON.parse(baseApprovalRecord.bytes.toString('utf8'));
  approvalRecord(baseApproval, raw.basePlanHash);
  const base = freeze(validateSecondPdfReplacement(baseRaw, baseApproval, now, env, baseRecord.actual));
  check(base.priorPdfReplacement && base.priorPdfReplacements === undefined);
  const oldStep = base.steps.find(step => step.key === 'append_pdf');
  check(oldStep && proof.requestId === oldStep.requestId && proof.operationId === oldStep.operationId);
  check(proof.expiresAt > base.pdfReplacement.approvedAt && proof.expiresAt <= base.until &&
    raw.preparedAt >= proof.expiresAt && raw.preparedAt < base.until && approval.approvedAt >= raw.preparedAt &&
    approval.approvedAt <= now && now < base.until, 'clinical_rehearsal_expired');
  const ids = new Set([base.runId,base.lineage.originalRunId,base.authorization.dossierId,base.previousAuthorization.dossierId,
    base.executionContinuation.amendmentId,base.aggregateBudget.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,base.budgetAmendment.amendmentId,
    base.pdfReplacement.amendmentId,base.pdfReplacement.supersededStep.requestId,base.priorPdfReplacement.amendmentId,base.priorPdfReplacement.supersededStep.requestId,base.noteReplacement.supersededStep.requestId,
    ...base.steps.map(step => step.requestId),...base.previousSteps.map(step => step.requestId)]);
  check(!ids.has(raw.amendmentId) && !ids.has(raw.replacementPdfRequestId) && raw.amendmentId !== raw.replacementPdfRequestId);
  const operations = new Set([...base.steps,...base.previousSteps,base.noteReplacement.supersededStep,base.pdfReplacement.supersededStep,base.priorPdfReplacement.supersededStep].map(step => step.operationId).filter(Boolean));
  check(!operations.has(raw.replacementPdfOperationId));
  const replacementPdfEntryId = derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId);
  const steps = base.steps.map(step => step.key === 'append_pdf'
    ? {...step,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...step.input,requestId:raw.replacementPdfRequestId}} : step);
  const plan = {...base,steps};
  for (const field of ['previousAuthorization','previousSteps','feeAmendment','noteReplacement','budgetAmendment','aggregateBudget','executionContinuation']) Object.defineProperty(plan,field,{value:base[field],enumerable:false});
  Object.defineProperty(plan,'priorPdfReplacement',{value:base.priorPdfReplacement,enumerable:false});
  Object.defineProperty(plan,'priorPdfReplacements',{value:freeze([base.priorPdfReplacement,base.pdfReplacement]),enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,supersededPdf:{...proof},supersededStep:oldStep,
    replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId}),enumerable:false});
  return plan;
}

/** Numeric timing only; no approval, activation or registry authority is created. */
export function rehearsalCompletionWindow(window) {
  check(exact(window,['preparedAt','approvedAt','now','previousUntil','previousDoctorValidUntil','executionWindowSeconds','doctorWindowSeconds']));
  const { preparedAt, approvedAt, now, previousUntil, previousDoctorValidUntil, executionWindowSeconds, doctorWindowSeconds }=window;
  check(executionWindowSeconds === 14400 && doctorWindowSeconds === 604800);
  for (const value of [preparedAt,approvedAt,now,previousUntil,previousDoctorValidUntil]) check(integer(value), 'clinical_rehearsal_expired');
  check(preparedAt >= previousUntil && preparedAt >= previousDoctorValidUntil && approvedAt >= preparedAt && now >= approvedAt &&
    Number.isSafeInteger(approvedAt + doctorWindowSeconds) && now < approvedAt + executionWindowSeconds, 'clinical_rehearsal_expired');
  return freeze({ createdAt:approvedAt, until:approvedAt + executionWindowSeconds, doctorValidUntil:approvedAt + doctorWindowSeconds });
}
/** A new, separately approved four-hour completion scope. The expired raw10
 * approval is verified at its historical instant only and never reactivated.
 * Raw11 was stopped; it is neither loaded nor accepted as financial authority. */
function validateCompletionContinuation(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash',
    'executionWindowSeconds','doctorWindowSeconds','renewalMaxFeeStroops','renewalRequestId','renewalDossierId','startingDoctorVersion',
    'replacementPdfRequestId','replacementPdfOperationId','supersededPdf']));
  check(raw.schemaVersion === 12 && uuid(raw.amendmentId) && integer(raw.preparedAt) && uuid(raw.renewalRequestId) && uuid(raw.renewalDossierId));
  check(raw.executionWindowSeconds === 14400 && raw.doctorWindowSeconds === 604800 && raw.startingDoctorVersion === 5 && raw.renewalMaxFeeStroops === STEP_FEE.toString());
  check(raw.replacementPdfRequestId === COMPLETION_PDF_REQUEST && raw.replacementPdfOperationId === COMPLETION_PDF_OPERATION);
  const proof=raw.supersededPdf;
  check(exact(proof,['requestId','operationId','expiresAt','unsignedEnvelopeHash','signingHash']) && payloadHash(proof) === payloadHash(THIRD_PDF_REPLACEMENT_PROOF));
  check(raw.basePlanHash === THIRD_PDF_REPLACEMENT_BASE_HASH && raw.baseApprovalHash === THIRD_PDF_REPLACEMENT_APPROVAL_HASH, 'clinical_rehearsal_approval_required');
  const baseRecord=privateBytes(raw.basePlanFile,env,raw.basePlanHash);check(baseRecord.actual !== actual);
  const baseRaw=JSON.parse(baseRecord.bytes.toString('utf8'));check(baseRaw?.schemaVersion === 10);
  const baseApprovalRecord=privateBytes(raw.baseApprovalFile,env,raw.baseApprovalHash,4096);
  check(baseApprovalRecord.actual === realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual !== actual);
  const baseApproval=JSON.parse(baseApprovalRecord.bytes.toString('utf8'));approvalRecord(baseApproval,raw.basePlanHash);
  const base=freeze(validateSecondPdfReplacement(baseRaw,baseApproval,baseApproval.approvedAt,env,baseRecord.actual));
  const times=rehearsalCompletionWindow({preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,now,previousUntil:base.until,
    previousDoctorValidUntil:base.doctorValidUntil,executionWindowSeconds:raw.executionWindowSeconds,doctorWindowSeconds:raw.doctorWindowSeconds});
  const oldStep=base.steps.find(step=>step.key==='append_pdf');
  check(base.authorization.targetVersion === 5 && oldStep?.requestId === proof.requestId && oldStep.operationId === proof.operationId &&
    base.priorPdfReplacement && !base.priorPdfReplacements && base.aggregateBudget.aggregateMaxFeeStroops === '400000000' &&
    base.aggregateBudget.confirmedSteps.reduce((total,item)=>total+BigInt(item.feeChargedStroops),0n) === 93618202n);
  const ids=new Set([base.runId,base.lineage.originalRunId,base.authorization.requestId,base.authorization.dossierId,base.previousAuthorization.dossierId,
    base.executionContinuation.amendmentId,base.aggregateBudget.amendmentId,base.feeAmendment.amendmentId,base.noteReplacement.amendmentId,base.budgetAmendment.amendmentId,
    base.pdfReplacement.amendmentId,base.pdfReplacement.supersededStep.requestId,base.priorPdfReplacement.amendmentId,base.priorPdfReplacement.supersededStep.requestId,
    base.noteReplacement.supersededStep.requestId,...base.steps.map(step=>step.requestId),...base.previousSteps.map(step=>step.requestId)]);
  const freshIds=[raw.amendmentId,raw.renewalRequestId,raw.renewalDossierId,raw.replacementPdfRequestId];
  check(new Set(freshIds).size === freshIds.length && freshIds.every(id=>!ids.has(id)));
  const operations=new Set([...base.steps,...base.previousSteps,base.noteReplacement.supersededStep,base.pdfReplacement.supersededStep,base.priorPdfReplacement.supersededStep].map(step=>step.operationId).filter(Boolean));
  check(!operations.has(raw.replacementPdfOperationId));
  const replacementPdfEntryId=derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId);
  const steps=base.steps.map(step=>step.key==='renew'?{...step,requestId:raw.renewalRequestId,maxFeeStroops:raw.renewalMaxFeeStroops}:step.key==='append_pdf'
    ?{...step,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...step.input,requestId:raw.replacementPdfRequestId}}:step);
  const authorization={requestId:raw.renewalRequestId,dossierId:raw.renewalDossierId,expectedVersion:5,targetVersion:6,method:'reauthorize_doctor',validUntil:times.doctorValidUntil};
  const plan={...base,...times,startingDoctorVersion:5,executionWindowSeconds:14400,doctorWindowSeconds:604800,authorization,steps};
  for(const field of ['previousAuthorization','previousSteps','feeAmendment','noteReplacement','budgetAmendment','executionContinuation']) Object.defineProperty(plan,field,{value:base[field],enumerable:false});
  Object.defineProperty(plan,'aggregateBudget',{value:freeze({...base.aggregateBudget,renewalMaxFeeStroops:raw.renewalMaxFeeStroops}),enumerable:false});
  Object.defineProperty(plan,'priorPdfReplacement',{value:base.priorPdfReplacement,enumerable:false});
  Object.defineProperty(plan,'priorPdfReplacements',{value:freeze([base.priorPdfReplacement,base.pdfReplacement]),enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,supersededPdf:{...proof},supersededStep:oldStep,
    replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId}),enumerable:false});
  Object.defineProperty(plan,'completionContinuation',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,previousUntil:base.until,previousDoctorValidUntil:base.doctorValidUntil,
    executionWindowSeconds:14400,doctorWindowSeconds:604800,executionUntil:times.until,renewalMaxFeeStroops:raw.renewalMaxFeeStroops,previousAuthorization:base.authorization}),enumerable:false});
  return plan;
}


/** Public reviewed scope only. This descriptor never carries approval or authority. */
export function rehearsalMaintenanceDescriptor() { return MAINTENANCE_DESCRIPTOR; }

/** Maintenance shares the approved completion window and is budgeted at its
 * full maximum throughout the run, even after its actual fee settles lower.
 * The canonical base10 journal prevents new proposals/copies resetting it. */
const MAINTENANCE_RENEWAL_REQUEST = 'de46469b-3f8a-4af8-b409-9744d85c4527';
const MAINTENANCE_RENEWAL_DOSSIER = 'f2d738c1-977d-40b3-9b72-126d04b5f4c7';
function validateMaintenanceContinuation(raw, approval, now, env, actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash',
    'executionWindowSeconds','doctorWindowSeconds','renewalMaxFeeStroops','renewalRequestId','renewalDossierId','startingDoctorVersion',
    'replacementPdfRequestId','replacementPdfOperationId','supersededPdf','maintenance']));
  check(raw.schemaVersion === 13 && exact(raw.maintenance,['requestId','source','maxFeeStroops','keysSha256','footprintSha256','keys','attemptFile']));
  // A failed or uncertain renewal retains the same slot and cannot disappear from accounting.
  check(raw.renewalRequestId === MAINTENANCE_RENEWAL_REQUEST && raw.renewalDossierId === MAINTENANCE_RENEWAL_DOSSIER);
  const m=raw.maintenance;
  check(m.requestId === MAINTENANCE_DESCRIPTOR.requestId && m.source === MAINTENANCE_DESCRIPTOR.source &&
    m.maxFeeStroops === MAINTENANCE_DESCRIPTOR.maxFeeStroops && m.keysSha256 === MAINTENANCE_DESCRIPTOR.keysSha256 &&
    m.footprintSha256 === MAINTENANCE_DESCRIPTOR.footprintSha256 && Array.isArray(m.keys) && m.keys.length === 14 &&
    m.keys.every((key,index)=>key === MAINTENANCE_DESCRIPTOR.keys[index]));
  check(typeof m.attemptFile === 'string' && isAbsolute(m.attemptFile) &&
    m.attemptFile === privateDirectoryFile(MAINTENANCE_BASE_DIRECTORY,'maintenance-14-attempt.private.json'));
  const baseRecord=privateBytes(raw.basePlanFile,env,raw.basePlanHash);
  check(baseRecord.actual === privateDirectoryFile(MAINTENANCE_BASE_DIRECTORY,'plan.private.json'));
  check(uuid(raw.amendmentId));
  check(actual === privateDirectoryFile(dirname(MAINTENANCE_BASE_DIRECTORY),`${raw.amendmentId}/plan.private.json`));
  const core={...raw,schemaVersion:12};delete core.maintenance;
  const base=validateCompletionContinuation(core,approval,now,env,actual);
  check(m.source === base.relayer && base.aggregateBudget.aggregateMaxFeeStroops === '400000000');
  const used=new Set(),seen=new Set();
  function collect(value) {
    if(typeof value === 'string') { if(uuid(value))used.add(value);return; }
    if(!value || typeof value !== 'object' || seen.has(value))return;
    seen.add(value);for(const name of Object.getOwnPropertyNames(value))collect(value[name]);
  }
  collect(base);check(!used.has(m.requestId));
  const plan={...base};
  for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(base)))
    if(!descriptor.enumerable && name !== 'aggregateBudget')Object.defineProperty(plan,name,descriptor);
  Object.defineProperty(plan,'aggregateBudget',{value:freeze({...base.aggregateBudget,maintenanceMaxFeeStroops:m.maxFeeStroops}),enumerable:false});
  Object.defineProperty(plan,'maintenanceContinuation',{value:freeze({...m,keys:[...m.keys],amendmentId:raw.amendmentId,
    approvedAt:approval.approvedAt,until:base.until}),enumerable:false});
  return plan;
}

/** Pure arithmetic only: a new four-hour window never renews the doctor. */
export function rehearsalResumeWindow(window) {
  check(exact(window,['preparedAt','approvedAt','now','previousUntil','doctorValidUntil','executionWindowSeconds']));
  const {preparedAt,approvedAt,now,previousUntil,doctorValidUntil,executionWindowSeconds}=window;
  check(executionWindowSeconds===14400);
  for(const value of [preparedAt,approvedAt,now,previousUntil,doctorValidUntil])check(integer(value),'clinical_rehearsal_expired');
  check(preparedAt>=previousUntil && approvedAt>=preparedAt && now>=approvedAt && Number.isSafeInteger(approvedAt+14400),'clinical_rehearsal_expired');
  const until=Math.min(approvedAt+14400,doctorValidUntil);
  check(now<until,'clinical_rehearsal_expired');return until;
}
/** A separately approved resumption of the exact raw13. Its registry renewal,
 * all prior maintenance and all clinical identities remain immutable history. */
function validateResumeContinuation(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash',
    'executionWindowSeconds','receiptEvidenceFile','receiptEvidenceSha256','maintenanceThree']));
  check(raw.schemaVersion===14 && uuid(raw.amendmentId) && integer(raw.preparedAt) && raw.executionWindowSeconds===14400);
  check(raw.basePlanHash===RESUME_BASE_HASH && raw.baseApprovalHash===RESUME_BASE_APPROVAL_HASH,'clinical_rehearsal_approval_required');
  const baseRecord=privateBytes(raw.basePlanFile,env,raw.basePlanHash);
  check(baseRecord.actual===privateDirectoryFile(RESUME_BASE_DIRECTORY,'plan.private.json') && baseRecord.actual!==actual);
  const baseRaw=JSON.parse(baseRecord.bytes.toString('utf8'));check(baseRaw?.schemaVersion===13);
  const baseApprovalRecord=privateBytes(raw.baseApprovalFile,env,raw.baseApprovalHash,4096);
  check(baseApprovalRecord.actual===realpathSync(privateApprovalFile(baseRecord.actual)) && baseApprovalRecord.actual!==actual);
  const baseApproval=JSON.parse(baseApprovalRecord.bytes.toString('utf8'));approvalRecord(baseApproval,raw.basePlanHash);
  const base=freeze(validateMaintenanceContinuation(baseRaw,baseApproval,baseApproval.approvedAt,env,baseRecord.actual));
  const until=rehearsalResumeWindow({preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,now,previousUntil:base.until,
    doctorValidUntil:base.doctorValidUntil,executionWindowSeconds:raw.executionWindowSeconds});
  check(actual===privateDirectoryFile(dirname(RESUME_BASE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  const m=raw.maintenanceThree,d=MAINTENANCE_THREE_DESCRIPTOR;
  check(exact(m,Object.keys(d)) && m.requestId===d.requestId && m.source===d.source && m.source===base.relayer &&
    m.maxFeeStroops===d.maxFeeStroops && m.keysSha256===d.keysSha256 && m.footprintSha256===d.footprintSha256 &&
    Array.isArray(m.keys) && m.keys.length===3 && m.keys.every((key,index)=>key===d.keys[index]) &&
    m.attemptFile===d.attemptFile && m.attemptRunId===d.attemptRunId && m.attemptOperation===d.attemptOperation);
  check(hash(raw.receiptEvidenceSha256));
  const receipts=privateBytes(raw.receiptEvidenceFile,env,raw.receiptEvidenceSha256);
  check(![actual,baseRecord.actual,baseApprovalRecord.actual].includes(receipts.actual));
  const used=new Set(),seen=new Set();function collect(value){
    if(typeof value==='string'){if(uuid(value))used.add(value);return;}
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    for(const name of Object.getOwnPropertyNames(value))collect(value[name]);
  }collect(base);check(!used.has(raw.amendmentId)&&!used.has(m.requestId)&&raw.amendmentId!==m.requestId);
  const plan={...base,until};
  for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(base)))if(!descriptor.enumerable)Object.defineProperty(plan,name,descriptor);
  Object.defineProperty(plan,'resumeContinuation',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanFile:baseRecord.actual,basePlanHash:raw.basePlanHash,baseApprovalFile:baseApprovalRecord.actual,baseApprovalHash:raw.baseApprovalHash,
    previousUntil:base.until,executionWindowSeconds:14400,executionUntil:until,receiptEvidenceFile:receipts.actual,
    receiptEvidenceSha256:raw.receiptEvidenceSha256,maintenanceActualPaidStroops:'13762544'}),enumerable:false});
  Object.defineProperty(plan,'maintenanceThree',{value:freeze({...m,keys:[...m.keys]}),enumerable:false});return plan;
}

/** One exact unsigned C4 recovery, retaining raw14's original financial deadline.
 * All prior cancellation/reservation proofs are rechecked by the web run gate. */
function validateExpiredPdfRecovery(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','basePlanFile','basePlanHash','baseApprovalFile','baseApprovalHash',
    'replacementPdfRequestId','replacementPdfOperationId','supersededPdf','expiredPdfEvidenceFile','expiredPdfEvidenceSha256']));
  check(raw.schemaVersion===15&&uuid(raw.amendmentId)&&integer(raw.preparedAt)&&uuid(raw.replacementPdfRequestId)&&hash(raw.replacementPdfOperationId));
  check(exact(raw.supersededPdf,Object.keys(EXPIRED_PDF_RECOVERY_PROOF))&&payloadHash(raw.supersededPdf)===payloadHash(EXPIRED_PDF_RECOVERY_PROOF));
  check(raw.basePlanHash===EXPIRED_PDF_RECOVERY_BASE_HASH&&raw.baseApprovalHash===EXPIRED_PDF_RECOVERY_BASE_APPROVAL_HASH,'clinical_rehearsal_approval_required');
  const baseRecord=privateBytes(raw.basePlanFile,env,raw.basePlanHash);
  check(baseRecord.actual===privateDirectoryFile(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY,'plan.private.json')&&baseRecord.actual!==actual);
  const baseRaw=JSON.parse(baseRecord.bytes.toString('utf8'));check(baseRaw.schemaVersion===14);
  const approvalRecordBytes=privateBytes(raw.baseApprovalFile,env,raw.baseApprovalHash,4096);
  check(approvalRecordBytes.actual===realpathSync(privateApprovalFile(baseRecord.actual))&&approvalRecordBytes.actual!==actual);
  const baseApproval=JSON.parse(approvalRecordBytes.bytes.toString('utf8'));approvalRecord(baseApproval,raw.basePlanHash);
  const base=freeze(validateResumeContinuation(baseRaw,baseApproval,baseApproval.approvedAt,env,baseRecord.actual));
  const proof=raw.supersededPdf,oldStep=base.steps.find(s=>s.key==='append_pdf');
  check(oldStep&&oldStep.requestId===proof.requestId&&oldStep.operationId===proof.operationId&&base.resumeContinuation&&
    base.priorPdfReplacements?.length===2&&base.priorPdfReplacements[0]===base.priorPdfReplacement);
  check(integer(now)&&proof.expiresAt>base.resumeContinuation.approvedAt&&proof.expiresAt<base.until&&
    raw.preparedAt>=proof.expiresAt&&raw.preparedAt<base.until&&approval.approvedAt>=raw.preparedAt&&
    now>=approval.approvedAt&&now<base.until,'clinical_rehearsal_expired');
  check(actual===privateDirectoryFile(dirname(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  check(raw.expiredPdfEvidenceSha256===EXPIRED_PDF_RECOVERY_EVIDENCE_HASH);
  const evidenceRecord=privateBytes(raw.expiredPdfEvidenceFile,env,raw.expiredPdfEvidenceSha256);
  check(evidenceRecord.actual===privateDirectoryFile(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY,'C4-expired-unsigned-evidence.private.json')&&
    ![actual,baseRecord.actual,approvalRecordBytes.actual].includes(evidenceRecord.actual));
  const evidence=JSON.parse(evidenceRecord.bytes.toString('utf8')),r=evidence.row,rr=evidence.reservationRow;
  const reservation=typeof rr?.payload==='string'?JSON.parse(rr.payload):rr?.payload;
  check(evidence.schemaVersion===1&&evidence.kind==='expired-unsigned-clinical-attempt'&&
    evidence.manifestHash===raw.basePlanHash&&evidence.approvalHash===raw.baseApprovalHash&&
    r?.id===proof.requestId&&r.state==='cancelled'&&r.error_code==='signature_request_expired'&&r.signed_xdr===null&&r.transaction_hash===null&&
    r.expires_at*1===proof.expiresAt&&typeof r.unsigned_xdr==='string'&&createHash('sha256').update(r.unsigned_xdr).digest('hex')===proof.unsignedEnvelopeHash&&r.signing_hash===proof.signingHash&&
    r.source_wallet===base.doctor.address&&r.expected?.historyId===base.historyId&&r.expected.operationId===proof.operationId&&
    rr?.request_id===proof.requestId&&rr.state==='released'&&rr.transaction_hash===null&&reservation?.state==='released'&&
    reservation.signedInnerDigest===null&&reservation.signedAt===null&&reservation.transactionHash===null&&reservation.chargedStroops===null&&
    reservation.binding?.requestId===proof.requestId&&reservation.binding.sourceAddress===base.doctor.address&&reservation.binding.patientAddress===base.patient.address&&
    evidence.chain?.getterError==='Error(Contract,#1)'&&integer(evidence.chain.getterObservedLedger)&&
    evidence.chain.pinnedDeployment?.status==='verified'&&evidence.chain.pinnedDeployment.contractId===base.contractId);
  const usedIds=new Set(),usedHashes=new Set(),seen=new Set();
  function collect(value){if(typeof value==='string'){if(uuid(value))usedIds.add(value);if(hash(value))usedHashes.add(value);return;}
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    for(const name of Object.getOwnPropertyNames(value))collect(value[name]);}
  collect(base);collect(evidence);usedHashes.add(raw.basePlanHash);usedHashes.add(raw.baseApprovalHash);
  check(!usedIds.has(raw.amendmentId)&&!usedIds.has(raw.replacementPdfRequestId)&&raw.amendmentId!==raw.replacementPdfRequestId&&!usedHashes.has(raw.replacementPdfOperationId));
  const steps=base.steps.map(s=>s.key==='append_pdf'?{...s,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...s.input,requestId:raw.replacementPdfRequestId}}:s);
  const plan={...base,steps};
  for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(base)))
    if(!descriptor.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(name))Object.defineProperty(plan,name,descriptor);
  Object.defineProperty(plan,'priorPdfReplacements',{value:freeze([...base.priorPdfReplacements,base.pdfReplacement]),enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,supersededPdf:{...proof},supersededStep:oldStep,
    replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,
    replacementPdfEntryId:derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId)}),enumerable:false});
  Object.defineProperty(plan,'expiredPdfRecovery',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,
    basePlanHash:raw.basePlanHash,baseApprovalHash:raw.baseApprovalHash,baseFinancialUntil:base.until,priorPdfProofCount:3,
    evidenceFile:evidenceRecord.actual,evidenceSha256:raw.expiredPdfEvidenceSha256}),enumerable:false});
  return plan;
}
/** Inert replacement data only. A fresh own approval is still mandatory. */
export function rehearsalExpiredPdfRecoveryManifest({amendmentId,preparedAt,replacementPdfRequestId,replacementPdfOperationId}={}) {
  check(uuid(amendmentId)&&integer(preparedAt)&&uuid(replacementPdfRequestId)&&hash(replacementPdfOperationId));
  return freeze({schemaVersion:15,amendmentId,preparedAt,
    basePlanFile:privateDirectoryFile(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY,'plan.private.json'),basePlanHash:EXPIRED_PDF_RECOVERY_BASE_HASH,
    baseApprovalFile:privateDirectoryFile(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY,'approval.private.json'),baseApprovalHash:EXPIRED_PDF_RECOVERY_BASE_APPROVAL_HASH,
    replacementPdfRequestId,replacementPdfOperationId,supersededPdf:{...EXPIRED_PDF_RECOVERY_PROOF},
    expiredPdfEvidenceFile:privateDirectoryFile(EXPIRED_PDF_RECOVERY_BASE_DIRECTORY,'C4-expired-unsigned-evidence.private.json'),
    expiredPdfEvidenceSha256:EXPIRED_PDF_RECOVERY_EVIDENCE_HASH});
}

/** A fresh own approval may reopen only the exact, never-activated recovery15.
 * Its old approval-like preview is reconstruction data, never a financial brand.
 * New authority is conferred exclusively by loadRehearsalPolicy's own16 record. */
function validateReopenedPdfRecovery(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','sourceRecoveryFile','sourceRecoveryHash','executionWindowSeconds','approvalNotAfter']));
  check(raw.schemaVersion===16&&uuid(raw.amendmentId)&&integer(raw.preparedAt)&&raw.executionWindowSeconds===14400);
  check(raw.sourceRecoveryHash===REOPENED_PDF_RECOVERY_SOURCE_HASH);
  const record=privateBytes(raw.sourceRecoveryFile,env,raw.sourceRecoveryHash);
  check(record.actual===privateDirectoryFile(REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY,'plan.private.json')&&record.actual!==actual);
  check(!existsSync(privateApprovalFile(record.actual)),'clinical_rehearsal_scope_rejected');
  const data=JSON.parse(record.bytes.toString('utf8'));check(data.schemaVersion===15);
  // Validate all pinned source14/expiry evidence and the unchanged PDF without
  // loading or registering an approved source15 policy.
  const preview={schemaVersion:1,planHash:raw.sourceRecoveryHash,approvedAt:data.preparedAt,statement:'INERT SOURCE RECONSTRUCTION ONLY; NOT AN APPROVAL.'};
  const base=validateExpiredPdfRecovery(data,preview,data.preparedAt,env,record.actual);
  check(raw.amendmentId!==data.amendmentId&&!base.steps.some(s=>s.requestId===raw.amendmentId));
  check(actual===privateDirectoryFile(dirname(REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  check(raw.approvalNotAfter===Math.min(raw.preparedAt+86400,base.doctorValidUntil)&&approval.approvedAt<raw.approvalNotAfter,'clinical_rehearsal_expired');
  const until=rehearsalResumeWindow({preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,now,previousUntil:base.until,doctorValidUntil:base.doctorValidUntil,executionWindowSeconds:raw.executionWindowSeconds});
  const plan={...base,until};
  for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(base)))
    if(!descriptor.enumerable&&name!=='resumeContinuation')Object.defineProperty(plan,name,descriptor);
  Object.defineProperty(plan,'resumeContinuation',{value:freeze({...base.resumeContinuation,amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,executionUntil:until}),enumerable:false});
  Object.defineProperty(plan,'reopenedPdfRecovery',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,sourceRecoveryHash:raw.sourceRecoveryHash,originalFinancialUntil:base.until,executionUntil:until,approvalNotAfter:raw.approvalNotAfter}),enumerable:false});
  return plan;
}
/** Inert data. Current own approval is mandatory, with no renewed doctor/maintenance. */
export function rehearsalReopenedPdfRecoveryManifest({amendmentId,preparedAt,doctorValidUntil}={}) {
  check(uuid(amendmentId)&&integer(preparedAt)&&integer(doctorValidUntil)&&preparedAt<doctorValidUntil);
  return freeze({schemaVersion:16,amendmentId,preparedAt,sourceRecoveryFile:privateDirectoryFile(REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY,'plan.private.json'),sourceRecoveryHash:REOPENED_PDF_RECOVERY_SOURCE_HASH,executionWindowSeconds:14400,approvalNotAfter:Math.min(preparedAt+86400,doctorValidUntil)});
}

/** One exact terminal raw16 PDF replacement. Own approval changes only its
 * UUID/nonce; the original raw16 execution window and all prior proofs remain. */
function validateRecoveredReopenedPdf(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','replacementPdfRequestId','replacementPdfOperationId']));
  check(raw.schemaVersion===17&&uuid(raw.amendmentId)&&integer(raw.preparedAt)&&uuid(raw.replacementPdfRequestId)&&hash(raw.replacementPdfOperationId));
  const sourceFile=privateDirectoryFile(RECOVERED_REOPENED_SOURCE_DIRECTORY,'plan.private.json');
  const source=privateBytes(sourceFile,env,RECOVERED_REOPENED_SOURCE_HASH);
  const sourceApprovalRecord=privateBytes(privateApprovalFile(sourceFile),env,RECOVERED_REOPENED_APPROVAL_HASH,4096);
  const sourceRaw=JSON.parse(source.bytes.toString('utf8')),sourceApproval=JSON.parse(sourceApprovalRecord.bytes.toString('utf8'));
  approvalRecord(sourceApproval,RECOVERED_REOPENED_SOURCE_HASH);check(sourceRaw.schemaVersion===16);
  const base=validateReopenedPdfRecovery(sourceRaw,sourceApproval,sourceApproval.approvedAt,env,source.actual);
  const old=base.steps.find(s=>s.key==='append_pdf'),p=RECOVERED_REOPENED_PROOF;
  check(old?.requestId===p.requestId&&old.operationId===p.operationId&&base.priorPdfReplacements.length===3);
  check(actual===privateDirectoryFile(dirname(RECOVERED_REOPENED_SOURCE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  check(raw.preparedAt>=p.expiresAt&&approval.approvedAt>=raw.preparedAt&&now>=approval.approvedAt&&now<base.until,'clinical_rehearsal_expired');
  const record=privateBytes(privateDirectoryFile(RECOVERED_REOPENED_SOURCE_DIRECTORY,'C4-expired-unsigned-evidence.private.json'),env,RECOVERED_REOPENED_EVIDENCE_HASH);
  const e=JSON.parse(record.bytes.toString('utf8')),r=e.row,rr=e.reservationRow;
  const reserve=typeof rr?.payload==='string'?JSON.parse(rr.payload):rr?.payload;
  check(e.schemaVersion===1&&e.kind==='expired-unsigned-clinical-attempt'&&e.manifestHash===RECOVERED_REOPENED_SOURCE_HASH&&e.approvalHash===RECOVERED_REOPENED_APPROVAL_HASH&&
    r?.id===p.requestId&&r.state==='cancelled'&&r.error_code==='signature_request_expired'&&r.signed_xdr===null&&r.transaction_hash===null&&Number(r.expires_at)===p.expiresAt&&
    typeof r.unsigned_xdr==='string'&&createHash('sha256').update(r.unsigned_xdr).digest('hex')===p.unsignedEnvelopeHash&&r.signing_hash===p.signingHash&&
    r.source_wallet===base.doctor.address&&r.expected?.historyId===base.historyId&&r.expected.operationId===p.operationId&&
    rr?.request_id===p.requestId&&rr.state==='released'&&rr.transaction_hash===null&&reserve?.state==='released'&&reserve.signedInnerDigest===null&&reserve.signedAt===null&&
    reserve.transactionHash===null&&reserve.chargedStroops===null&&reserve.binding?.requestId===p.requestId&&reserve.binding.sourceAddress===base.doctor.address&&reserve.binding.patientAddress===base.patient.address&&
    e.chain?.getterError==='Error(Contract,#1)'&&integer(e.chain.getterObservedLedger)&&e.chain.pinnedDeployment?.status==='verified'&&e.chain.pinnedDeployment.contractId===base.contractId);
  const ids=new Set(),hashes=new Set(),seen=new Set();function collect(v){if(typeof v==='string'){if(uuid(v))ids.add(v);if(hash(v))hashes.add(v);return;}if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);for(const n of Object.getOwnPropertyNames(v))collect(v[n]);}
  collect(base);collect(e);check(!ids.has(raw.amendmentId)&&!ids.has(raw.replacementPdfRequestId)&&raw.amendmentId!==raw.replacementPdfRequestId&&!hashes.has(raw.replacementPdfOperationId));
  const steps=base.steps.map(s=>s.key==='append_pdf'?{...s,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...s.input,requestId:raw.replacementPdfRequestId}}:s);
  const plan={...base,steps};for(const [n,d]of Object.entries(Object.getOwnPropertyDescriptors(base)))if(!d.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(n))Object.defineProperty(plan,n,d);
  Object.defineProperty(plan,'priorPdfReplacements',{value:freeze([...base.priorPdfReplacements,base.pdfReplacement]),enumerable:false});
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,basePlanHash:RECOVERED_REOPENED_SOURCE_HASH,baseApprovalHash:RECOVERED_REOPENED_APPROVAL_HASH,
    supersededPdf:{...p},supersededStep:old,replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId:derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId)}),enumerable:false});
  Object.defineProperty(plan,'recoveredReopenedPdf',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,sourceApprovedAt:base.reopenedPdfRecovery.approvedAt,executionUntil:base.until,priorPdfProofCount:4,evidenceFile:record.actual,evidenceSha256:RECOVERED_REOPENED_EVIDENCE_HASH}),enumerable:false});
  return plan;
}
/** Inert descriptor only. No new execution window or authority is created. */
export function rehearsalRecoveredReopenedPdfManifest({amendmentId,preparedAt,replacementPdfRequestId,replacementPdfOperationId}={}) {
  check(uuid(amendmentId)&&integer(preparedAt)&&uuid(replacementPdfRequestId)&&hash(replacementPdfOperationId));
  return freeze({schemaVersion:17,amendmentId,preparedAt,replacementPdfRequestId,replacementPdfOperationId});
}


/** Exactly the signed raw17 PDF that expired before transport binding. The
 * canonical signed bytes stay preserved. This is not a retry or a new window. */
function validateNeverSubmittedPdfRecovery(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','replacementPdfRequestId','replacementPdfOperationId','expiredSignedEvidenceSha256']));
  check(raw.schemaVersion===18&&uuid(raw.amendmentId)&&integer(raw.preparedAt)&&uuid(raw.replacementPdfRequestId)&&hash(raw.replacementPdfOperationId)&&hash(raw.expiredSignedEvidenceSha256));
  const sourceFile=privateDirectoryFile(NEVER_SUBMITTED_SOURCE_DIRECTORY,'plan.private.json');
  const source=privateBytes(sourceFile,env,NEVER_SUBMITTED_SOURCE_HASH),sourceApprovalRecord=privateBytes(privateApprovalFile(sourceFile),env,NEVER_SUBMITTED_APPROVAL_HASH,4096);
  const sourceApproval=JSON.parse(sourceApprovalRecord.bytes.toString('utf8'));approvalRecord(sourceApproval,NEVER_SUBMITTED_SOURCE_HASH);
  const base=validateRecoveredReopenedPdf(JSON.parse(source.bytes.toString('utf8')),sourceApproval,sourceApproval.approvedAt,env,source.actual),old=base.steps.find(s=>s.key==='append_pdf');
  check(old?.requestId===NEVER_SUBMITTED_REQUEST&&base.priorPdfReplacements.length===4);
  check(actual===privateDirectoryFile(dirname(NEVER_SUBMITTED_SOURCE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  check(approval.approvedAt>=raw.preparedAt&&now>=approval.approvedAt&&now<base.until,'clinical_rehearsal_expired');
  const record=privateBytes(privateDirectoryFile(NEVER_SUBMITTED_SOURCE_DIRECTORY,'C4-expired-never-submitted-evidence.private.json'),env,raw.expiredSignedEvidenceSha256);
  const e=JSON.parse(record.bytes.toString('utf8')),r=e.row,rr=e.reservationRow,p=typeof rr?.payload==='string'?JSON.parse(rr.payload):rr?.payload;
  check(e.schemaVersion===1&&e.kind==='expired-never-submitted-clinical-attempt'&&e.manifestHash===NEVER_SUBMITTED_SOURCE_HASH&&e.approvalHash===NEVER_SUBMITTED_APPROVAL_HASH&&
    r?.id===old.requestId&&r.state==='failed'&&r.error_code==='signed_expired_before_submission'&&r.transaction_hash===NEVER_SUBMITTED_HASH&&typeof r.signed_xdr==='string'&&typeof r.unsigned_xdr==='string'&&
    r.action==='append_version'&&r.method==='append_version'&&r.network==='testnet'&&r.contract_id===base.contractId&&r.actor_user_id===base.doctor.userId&&r.wallet_id===base.doctor.walletId&&r.source_wallet===base.doctor.address&&
    r.expected?.historyId===base.historyId&&r.expected.patient===base.patient.address&&r.expected.author===base.doctor.address&&r.expected.operationId===old.operationId&&r.expected.expectedVersion===0&&r.expected.expectedGrantRevision===6&&r.expected.previousCommitment===null&&r.expected.entryId===derivedEntry(base.historyId,base.doctor.address,old.operationId));
  const expiresAt=Number(r.expires_at);check(integer(expiresAt)&&raw.preparedAt>=expiresAt+60&&Number.isFinite(Date.parse(e.checkedAtUtc)/1000)&&Date.parse(e.checkedAtUtc)/1000>=expiresAt+60);
  const unsigned=TransactionBuilder.fromXDR(r.unsigned_xdr,Networks.TESTNET),signed=TransactionBuilder.fromXDR(r.signed_xdr,Networks.TESTNET);
  check(unsigned instanceof Transaction&&unsigned.signatures.length===0&&unsigned.source===base.doctor.address&&unsigned.hash().toString('hex')===r.signing_hash&&Number(unsigned.timeBounds?.maxTime)===expiresAt&&Number(unsigned.timeBounds?.minTime)===0&&unsigned.operations.length===1);
  check(signed instanceof FeeBumpTransaction&&signed.feeSource===base.relayer&&signed.hash().toString('hex')===NEVER_SUBMITTED_HASH&&signed.innerTransaction.source===base.doctor.address&&signed.innerTransaction.hash().equals(unsigned.hash()));
  assertClinicalWebSponsoredFee(signed);
  for(const [tx,address]of [[signed,base.relayer],[signed.innerTransaction,base.doctor.address]]){const k=Keypair.fromPublicKey(address);check(tx.signatures.length===1&&tx.signatures[0].hint().equals(k.signatureHint())&&k.verify(tx.hash(),tx.signatures[0].signature()));}
  check(rr?.request_id===old.requestId&&rr.network==='testnet'&&rr.state==='released'&&rr.transaction_hash===null&&p?.state==='released'&&p.transactionHash===null&&p.signedInnerDigest===null&&p.signedAt===null&&p.chargedStroops===null&&p.outcome===null&&p.ledger===null&&
    p.binding?.requestId===old.requestId&&p.binding.sourceAddress===base.doctor.address&&p.binding.patientAddress===base.patient.address&&p.binding.sponsorAddress===base.relayer&&p.binding.actorId===base.doctor.userId&&p.binding.walletId===base.doctor.walletId&&p.binding.contractId===base.contractId&&p.binding.action==='append_version'&&p.binding.encounterId===r.expected.entryId&&
    p.quote?.unsignedHash===createHash('sha256').update(r.unsigned_xdr).digest('hex')&&p.quote.signingHash===r.signing_hash&&p.quote.maxTime===expiresAt&&p.quote.offeredFeeStroops===signed.fee);
  check(e.receipt?.status==='NOT_FOUND'&&e.receipt.hash===NEVER_SUBMITTED_HASH&&integer(e.receipt.latestLedger)&&integer(e.receipt.latestLedgerCloseTime)&&e.receipt.latestLedgerCloseTime>=expiresAt+60&&
    e.chain?.getterError==='Error(Contract,#1)'&&integer(e.chain.getterObservedLedger)&&e.chain.getterObservedLedger>=e.receipt.latestLedger&&e.chain.pinnedDeployment?.status==='verified'&&e.chain.pinnedDeployment.contractId===base.contractId&&e.chain.pinnedDeployment.observedWasmHash==='29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0'&&e.inventory?.entries===5&&e.inventory.versions===6);
  const ids=new Set(),hashes=new Set(),seen=new Set();function collect(v){if(typeof v==='string'){if(uuid(v))ids.add(v);if(hash(v))hashes.add(v);return;}if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);for(const n of Object.getOwnPropertyNames(v))collect(v[n]);}collect(base);collect(e);
  check(!ids.has(raw.amendmentId)&&!ids.has(raw.replacementPdfRequestId)&&raw.amendmentId!==raw.replacementPdfRequestId&&!hashes.has(raw.replacementPdfOperationId));
  const steps=base.steps.map(s=>s.key==='append_pdf'?{...s,requestId:raw.replacementPdfRequestId,operationId:raw.replacementPdfOperationId,input:{...s.input,requestId:raw.replacementPdfRequestId}}:s),plan={...base,steps};
  for(const [n,d]of Object.entries(Object.getOwnPropertyDescriptors(base)))if(!d.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(n))Object.defineProperty(plan,n,d);
  Object.defineProperty(plan,'priorPdfReplacements',{value:freeze([...base.priorPdfReplacements,base.pdfReplacement]),enumerable:false});
  const proof={requestId:old.requestId,operationId:old.operationId,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(r.unsigned_xdr).digest('hex'),signingHash:r.signing_hash};
  Object.defineProperty(plan,'pdfReplacement',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,basePlanHash:NEVER_SUBMITTED_SOURCE_HASH,baseApprovalHash:NEVER_SUBMITTED_APPROVAL_HASH,supersededPdf:proof,supersededStep:old,replacementPdfRequestId:raw.replacementPdfRequestId,replacementPdfOperationId:raw.replacementPdfOperationId,replacementPdfEntryId:derivedEntry(base.historyId,base.doctor.address,raw.replacementPdfOperationId)}),enumerable:false});
  Object.defineProperty(plan,'expiredSignedPdfRecovery',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,sourceApprovedAt:sourceApproval.approvedAt,executionUntil:base.until,priorPdfProofCount:5,evidenceFile:record.actual,evidenceSha256:raw.expiredSignedEvidenceSha256,requestId:old.requestId,transactionHash:NEVER_SUBMITTED_HASH,signedEnvelopeSha256:createHash('sha256').update(r.signed_xdr).digest('hex')}),enumerable:false});
  return plan;
}
/** Inert data only. No authority or new execution window. */
export function rehearsalNeverSubmittedPdfManifest({amendmentId,preparedAt,replacementPdfRequestId,replacementPdfOperationId,expiredSignedEvidenceSha256}={}) {
  check(uuid(amendmentId)&&integer(preparedAt)&&uuid(replacementPdfRequestId)&&hash(replacementPdfOperationId)&&hash(expiredSignedEvidenceSha256));
  return freeze({schemaVersion:18,amendmentId,preparedAt,replacementPdfRequestId,replacementPdfOperationId,expiredSignedEvidenceSha256});
}


/** Separate own approval after expired raw18. Clinical identities and all prior
 * evidence are inherited at their historical time; no old approval is extended. */
function validateRestoredCompletion(raw,approval,now,env,actual) {
  check(exact(raw,['schemaVersion','amendmentId','preparedAt','approvalNotAfter','executionWindowSeconds','doctorWindowSeconds','renewalRequestId','renewalDossierId','restoration']));
  check(raw.schemaVersion===19&&uuid(raw.amendmentId)&&integer(raw.preparedAt)&&raw.executionWindowSeconds===14400&&raw.doctorWindowSeconds===604800);
  check(raw.amendmentId===RESTORED_COMPLETION_IDENTIFIERS.amendmentId&&raw.renewalRequestId===RESTORED_COMPLETION_IDENTIFIERS.renewalRequestId&&raw.renewalDossierId===RESTORED_COMPLETION_IDENTIFIERS.renewalDossierId&&raw.restoration?.requestId===RESTORED_COMPLETION_IDENTIFIERS.restorationRequestId);
  check(raw.approvalNotAfter===raw.preparedAt+86400&&approval.approvedAt<raw.approvalNotAfter,'clinical_rehearsal_expired');
  const file=privateDirectoryFile(RESTORED_COMPLETION_SOURCE_DIRECTORY,'plan.private.json');
  const source=privateBytes(file,env,RESTORED_COMPLETION_SOURCE_HASH),approvedRecord=privateBytes(privateApprovalFile(file),env,RESTORED_COMPLETION_APPROVAL_HASH,4096);
  const previousApproval=JSON.parse(approvedRecord.bytes.toString('utf8'));approvalRecord(previousApproval,RESTORED_COMPLETION_SOURCE_HASH);
  const base=validateNeverSubmittedPdfRecovery(JSON.parse(source.bytes.toString('utf8')),previousApproval,previousApproval.approvedAt,env,source.actual);
  check(actual===privateDirectoryFile(dirname(RESTORED_COMPLETION_SOURCE_DIRECTORY),raw.amendmentId+'/plan.private.json'));
  const times=rehearsalCompletionWindow({preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,now,previousUntil:base.until,previousDoctorValidUntil:base.doctorValidUntil,executionWindowSeconds:14400,doctorWindowSeconds:604800});
  const ids=new Set(),seen=new Set();function collect(v){if(typeof v==='string'){if(uuid(v))ids.add(v);return;}if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);for(const n of Object.getOwnPropertyNames(v))collect(v[n]);}collect(base);
  const m=raw.restoration,newIds=[raw.amendmentId,raw.renewalRequestId,raw.renewalDossierId,m?.requestId];
  check(newIds.every(v=>uuid(v)&&!ids.has(v))&&new Set(newIds).size===4);
  check(base.authorization.expectedVersion===5&&base.authorization.targetVersion===6&&base.authorization.requestId==='de46469b-3f8a-4af8-b409-9744d85c4527');
  check(exact(m,['requestId','source','maxFeeStroops','keysSha256','footprintSha256','keys','attemptFile'])&&m.source===base.relayer&&m.maxFeeStroops==='20000000');
  check(m.keysSha256===RESTORED_COMPLETION_KEYS_SHA256&&m.footprintSha256===RESTORED_COMPLETION_FOOTPRINT_SHA256&&Array.isArray(m.keys)&&m.keys.length===27&&new Set(m.keys).size===27);
  const keys=m.keys.map(k=>{check(typeof k==='string');const key=xdr.LedgerKey.fromXDR(k,'base64');check(key.toXDR('base64')===k);return key;});
  check(createHash('sha256').update([...m.keys].sort().join('\n')).digest('hex')===m.keysSha256);
  const canonicalKeys=[...keys].sort((a,b)=>Buffer.compare(a.toXDR(),b.toXDR()));
  check(keys.every((k,i)=>k.toXDR().equals(canonicalKeys[i].toXDR())));
  const footprint=new xdr.LedgerFootprint({readOnly:[],readWrite:canonicalKeys});
  check(createHash('sha256').update(footprint.toXDR()).digest('hex')===m.footprintSha256&&m.attemptFile===privateDirectoryFile(dirname(actual),'maintenance27-attempt.private.json'));
  const steps=base.steps.map(s=>s.key==='renew'?{...s,requestId:raw.renewalRequestId,maxFeeStroops:'10000000'}:s);
  const authorization={requestId:raw.renewalRequestId,dossierId:raw.renewalDossierId,expectedVersion:6,targetVersion:7,method:'reauthorize_doctor',validUntil:times.doctorValidUntil};
  const plan={...base,...times,startingDoctorVersion:6,executionWindowSeconds:14400,doctorWindowSeconds:604800,authorization,steps};
  for(const[n,d]of Object.entries(Object.getOwnPropertyDescriptors(base)))if(!d.enumerable&&!['aggregateBudget','completionContinuation','resumeContinuation'].includes(n))Object.defineProperty(plan,n,d);
  Object.defineProperty(plan,'aggregateBudget',{value:freeze({...base.aggregateBudget,recoveryMaintenanceMaxFeeStroops:'20000000',priorRenewalReserveStroops:'10000000'}),enumerable:false});
  Object.defineProperty(plan,'completionContinuation',{value:freeze({...base.completionContinuation,amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,previousUntil:base.until,previousDoctorValidUntil:base.doctorValidUntil,previousAuthorization:base.authorization,executionUntil:times.until}),enumerable:false});
  Object.defineProperty(plan,'resumeContinuation',{value:freeze({...base.resumeContinuation,amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,executionUntil:times.until}),enumerable:false});
  Object.defineProperty(plan,'restoredCompletion',{value:freeze({amendmentId:raw.amendmentId,preparedAt:raw.preparedAt,approvedAt:approval.approvedAt,executionUntil:times.until,sourceManifestHash:RESTORED_COMPLETION_SOURCE_HASH,sourceApprovalHash:RESTORED_COMPLETION_APPROVAL_HASH,priorCreatedAt:base.createdAt,priorCompletionApprovedAt:base.completionContinuation.approvedAt,priorMaintenanceUntil:base.maintenanceContinuation.until,priorAuthorization:base.authorization,priorRenewalStep:base.steps.find(s=>s.key==='renew'),priorRenewalTransactionHash:'cd6e6ea2abec586ff5a2e2325be19bb0783b7055264ba4c83fc77a1bfcba3519',priorRenewalReserveStroops:'10000000',restoration:freeze({...m,keys:[...m.keys],approvedAt:approval.approvedAt,until:times.until})}),enumerable:false});
  return plan;
}
function validateClosingContinuation(raw, approval, now, env, actual) {
  check(exact(raw, ['schemaVersion','amendmentId','preparedAt','approvalNotAfter','executionWindowSeconds']));
  check(raw.schemaVersion === 20 && raw.amendmentId === CLOSING_AMENDMENT_ID && integer(raw.preparedAt));
  check(raw.approvalNotAfter === raw.preparedAt + 86400 && approval.approvedAt < raw.approvalNotAfter, 'clinical_rehearsal_expired');
  const sourceFile = privateDirectoryFile(CLOSING_SOURCE_DIRECTORY, 'plan.private.json');
  const source = privateBytes(sourceFile, env, CLOSING_SOURCE_HASH);
  const sourceApproval = privateBytes(privateApprovalFile(sourceFile), env, CLOSING_SOURCE_APPROVAL_HASH, 4096);
  const prior = JSON.parse(sourceApproval.bytes.toString('utf8'));
  approvalRecord(prior, CLOSING_SOURCE_HASH);
  const base = validateRestoredCompletion(JSON.parse(source.bytes.toString('utf8')), prior, prior.approvedAt, env, source.actual);
  check(actual === privateDirectoryFile(dirname(CLOSING_SOURCE_DIRECTORY), raw.amendmentId + '/plan.private.json'));
  const until = rehearsalResumeWindow({ preparedAt: raw.preparedAt, approvedAt: approval.approvedAt, now,
    previousUntil: base.until, doctorValidUntil: base.doctorValidUntil, executionWindowSeconds: raw.executionWindowSeconds });
  const pdf = base.steps.find(step => step.key === 'append_pdf');
  check(pdf && base.authorization.targetVersion === 7);
  const plan = { ...base, until, closingContinuation: freeze({
    amendmentId: raw.amendmentId, preparedAt: raw.preparedAt, approvedAt: approval.approvedAt,
    previousUntil: base.until, executionUntil: until,
    confirmedPdf: { requestId: pdf.requestId, transactionHash: CLOSING_PDF_HASH, ledger: 5646333, feeChargedStroops: '48748461' },
    confirmedRenewal: { requestId: base.authorization.requestId, transactionHash: CLOSING_RENEWAL_HASH, ledger: 5645990, feeChargedStroops: '4726' },
  }) };
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(base))) {
    if (!descriptor.enumerable) Object.defineProperty(plan, name, descriptor);
  }
  return plan;
}

// Historical steps stay available for receipt accounting. Only these two can mutate.
function assertClosingAuthority(policy, now, step) {
  const scope = policy.closingContinuation;
  check(CLOSING_CONTINUATION_POLICIES.has(policy) && scope.executionUntil === policy.until);
  check(integer(now) && now >= scope.approvedAt && now < policy.until, 'clinical_rehearsal_expired');
  if (step !== undefined) {
    const declared = policy.steps.find(item => item.requestId === step?.requestId);
    check(declared && ['correct_note','revoke'].includes(declared.key) && payloadHash(declared) === payloadHash(step));
  }
}

/** The returned scope is authoritative only on the loader's approved object. */
export function assertRehearsalRestoredCompletion(policy,{now=epoch(),step}={}) {
  check(RESTORED_COMPLETION_POLICIES.has(policy));const r=policy.restoredCompletion;
  check(r&&r.approvedAt===policy.createdAt&&r.executionUntil===policy.until&&policy.authorization.expectedVersion===6&&policy.authorization.targetVersion===7);
  check(integer(now)&&now>=r.approvedAt&&now<r.executionUntil,'clinical_rehearsal_expired');
  if(step!==undefined){const s=policy.steps.find(s=>s.requestId===step?.requestId);check(s&&['renew','append_pdf','correct_note','revoke'].includes(s.key)&&payloadHash(s)===payloadHash(step));}
  return r;
}

/** Immutable, non-authoritative preparation data only. */
export function rehearsalMaintenanceThreeDescriptor(){return MAINTENANCE_THREE_DESCRIPTOR;}
/** Non-authoritative plan data only. Dates and identity are always explicit;
 * a null receipt digest stays visibly incomplete and is rejected by the loader. */
export function rehearsalResumeManifest({amendmentId,preparedAt,receiptEvidenceFile,receiptEvidenceSha256=null}={}) {
  check(uuid(amendmentId)&&integer(preparedAt)&&typeof receiptEvidenceFile==='string'&&isAbsolute(receiptEvidenceFile));
  check(receiptEvidenceSha256===null||hash(receiptEvidenceSha256));
  return freeze({schemaVersion:14,amendmentId,preparedAt,basePlanFile:privateDirectoryFile(RESUME_BASE_DIRECTORY,'plan.private.json'),
    basePlanHash:RESUME_BASE_HASH,baseApprovalFile:privateDirectoryFile(RESUME_BASE_DIRECTORY,'approval.private.json'),baseApprovalHash:RESUME_BASE_APPROVAL_HASH,
    executionWindowSeconds:14400,receiptEvidenceFile,receiptEvidenceSha256,maintenanceThree:{...MAINTENANCE_THREE_DESCRIPTOR,keys:[...MAINTENANCE_THREE_DESCRIPTOR.keys]}});
}
/** Only the original newly approved raw14 object has resumption authority. */
export function assertRehearsalResumeBudget(policy,{now=epoch(),step}={}) {
  if (policy.closingContinuation) {
    assertClosingAuthority(policy, now, step);
    return policy.resumeContinuation;
  }
  if(policy.restoredCompletion!==undefined){assertRehearsalRestoredCompletion(policy,{now,step});return policy.resumeContinuation;}
  check(RESUME_CONTINUATION_POLICIES.has(policy));
  const r=policy.resumeContinuation;
  const signedRecovery=policy.expiredSignedPdfRecovery;
  if(signedRecovery!==undefined){check(NEVER_SUBMITTED_PDF_POLICIES.has(policy)&&signedRecovery.executionUntil===policy.until&&signedRecovery.sourceApprovedAt===policy.recoveredReopenedPdf?.approvedAt&&signedRecovery.priorPdfProofCount===5&&policy.priorPdfReplacements?.length===5);check(integer(now)&&now>=signedRecovery.approvedAt&&now<policy.until,'clinical_rehearsal_expired');}
  const recovered=policy.recoveredReopenedPdf;
  if(recovered!==undefined){check(RECOVERED_REOPENED_PDF_POLICIES.has(policy)&&recovered.executionUntil===policy.until&&recovered.sourceApprovedAt===policy.reopenedPdfRecovery?.approvedAt&&recovered.priorPdfProofCount===4&&policy.priorPdfReplacements?.length===(policy.expiredSignedPdfRecovery?5:4));check(integer(now)&&now>=recovered.approvedAt&&now<policy.until,'clinical_rehearsal_expired');}
  if(policy.expiredPdfRecovery!==undefined){const recovery=policy.expiredPdfRecovery;
    check(EXPIRED_PDF_RECOVERY_POLICIES.has(policy)&&recovery.priorPdfProofCount===3);
    const reopened=policy.reopenedPdfRecovery;
    if(reopened!==undefined){
      check(REOPENED_PDF_RECOVERY_POLICIES.has(policy)&&reopened.originalFinancialUntil===recovery.baseFinancialUntil&&reopened.executionUntil===policy.until&&policy.resumeContinuation.approvedAt===reopened.approvedAt);
      check(integer(now)&&now>=reopened.approvedAt&&now<reopened.executionUntil,'clinical_rehearsal_expired');
    }else{
      check(recovery.baseFinancialUntil===policy.until);
      check(integer(now)&&now>=recovery.approvedAt&&now<recovery.baseFinancialUntil,'clinical_rehearsal_expired');
    }}
  check(integer(now)&&now>=r.approvedAt&&now<policy.until&&policy.until===r.executionUntil,'clinical_rehearsal_expired');
  if(step!==undefined){const declared=policy.steps.find(item=>item.requestId===step?.requestId);
    check(declared&&['append_pdf','correct_note','revoke'].includes(declared.key)&&payloadHash(declared)===payloadHash(step));}
  return r;
}
/** M3 alone may consume its fixed residual within the unchanged two-XLM hold. */
export function assertRehearsalCompletionMaintenance(policy,{now=epoch()}={}) {
  assertRehearsalResumeBudget(policy,{now});check(policy.expiredPdfRecovery===undefined);const aggregate=assertRehearsalAggregateBudget(policy,{now});
  check(aggregate.maintenanceMaxFeeStroops==='20000000'&&policy.maintenanceThree.maxFeeStroops==='6237456');return policy.maintenanceThree;
}
export const assertRehearsalMaintenanceThreeBudget=assertRehearsalCompletionMaintenance;

/** Sole maintenance authority boundary. No preview, clone, legacy plan or
 * expired approval can grant signing/submission or reset the canonical journal. */
export function assertRehearsalMaintenanceBudget(policy,{now=epoch()}={}) {
  check(!policy.closingContinuation);
  if(policy.restoredCompletion!==undefined){const r=assertRehearsalRestoredCompletion(policy,{now});assertRehearsalAggregateBudget(policy,{now});return r.restoration;}
  check(MAINTENANCE_CONTINUATION_POLICIES.has(policy) && !RESUME_CONTINUATION_POLICIES.has(policy));
  const aggregate=assertRehearsalAggregateBudget(policy,{now});
  check(aggregate.maintenanceMaxFeeStroops === '20000000' && policy.maintenanceContinuation.maxFeeStroops === '20000000');
  return policy.maintenanceContinuation;
}

/** Approvals are private runtime files, never build assets. URL sibling resolution
 * preserves the same path while preventing Next's static tracer from expanding
 * an unknown dirname into a recursive project-wide approval-file search. */
function privateDirectoryFile(directory, fileName) {
  return fileURLToPath(new URL(fileName, pathToFileURL(`${directory}${sep}`)));
}

function privateApprovalFile(actualFile) {
  return fileURLToPath(new URL('approval.private.json', pathToFileURL(actualFile)));
}

/** Read only a regular pinned private file; no writes, dates, connections or fallback. */
function privateBytes(file, env, expectedHash, maximum = MAX_BYTES) {
  check(typeof file === 'string' && isAbsolute(file) && !contained(ROOT, resolve(file)) && !lstatSync(file).isSymbolicLink());
  const actual = realpathSync(file); check(!contained(ROOT, actual));
  for (const key of ['OneDrive','OneDriveConsumer','OneDriveCommercial']) if (env[key]) check(!contained(realpathSync(env[key]), actual));
  check(!actual.split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)));
  let descriptor;
  try {
    descriptor = openSync(actual, 'r'); const stat = fstatSync(descriptor);
    check(stat.isFile() && stat.size > 0 && stat.size <= maximum);
    const bytes = readFileSync(descriptor); check(bytes.length === stat.size);
    if (expectedHash !== undefined) check(hash(expectedHash) && createHash('sha256').update(bytes).digest('hex') === expectedHash, 'clinical_rehearsal_approval_required');
    return { bytes, actual };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function contained(root, candidate) {
  const path = relative(root, candidate); return path === '' || !path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path);
}
function environment(env) {
  check(env.TRUSTLEAF_ENV === 'local' && env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false' && env.VERCEL_ENV === undefined && env.VERCEL === undefined && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet');
  check(!Object.keys(env).some(key => /^(?:TRUSTLEAF_CLINICAL_(?:CREATE_ONCE|HOSTED_CREATE_ONCE|PATIENT_DEMO)_|TRUSTLEAF_CLINICAL_(?:MIGRATION|WEB_MIGRATION)$)/.test(key) && env[key] !== undefined));
  let database; try { database = new URL(databaseConnectionString(env)); } catch { fail(); }
  check(['postgres:', 'postgresql:'].includes(database.protocol) && /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(database.hostname) && env.TRUSTLEAF_DB_HOST === database.hostname);
  check(env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === CONTRACT && env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === REGISTRY && env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === ADMIN && env.BOOKING_AUTHORITY_PUBLIC_KEY === ADMIN);
}
export function rehearsalConfigured(env = process.env) { return VARIABLES.some(key => env[key] !== undefined); }
/** Reads a pinned private local manifest. This module never changes files, SQL,
 * environment, keys or chain state. Approval is required by default. */
export function loadRehearsalPolicy({ env = process.env, now = epoch(), requireApproval = true, previewApproval } = {}) {
  if (!rehearsalConfigured(env)) return null;
  check(Number.isSafeInteger(now) && now > 0 && typeof requireApproval === 'boolean');
  environment(env);
  const file = env[VARIABLES[0]], digest = env[VARIABLES[1]], approved = env[VARIABLES[2]];
  check(typeof file === 'string' && isAbsolute(file) && typeof digest === 'string' && HASH.test(digest));
  if (requireApproval) check(typeof approved === 'string' && HASH.test(approved), 'clinical_rehearsal_approval_required');
  try {
    const { bytes, actual } = privateBytes(file, env, digest), raw = JSON.parse(bytes.toString('utf8'));
    let plan;
    if ([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) {
      let approval;
      if (requireApproval || approved !== undefined) {
        check(previewApproval === undefined, 'clinical_rehearsal_approval_required');
        const record = privateBytes(privateApprovalFile(actual), env, approved, 4096);
        approval = JSON.parse(record.bytes.toString('utf8'));
      } else {
        check(previewApproval !== undefined, 'clinical_rehearsal_approval_required');
        approval = structuredClone(previewApproval);
      }
      approvalRecord(approval, digest);
      if (raw.schemaVersion === 20) plan = validateClosingContinuation(raw, approval, now, env, actual);
      else plan = raw.schemaVersion === 19 ? validateRestoredCompletion(raw, approval, now, env, actual) : raw.schemaVersion === 18 ? validateNeverSubmittedPdfRecovery(raw, approval, now, env, actual) : raw.schemaVersion === 17 ? validateRecoveredReopenedPdf(raw, approval, now, env, actual) : raw.schemaVersion === 16 ? validateReopenedPdfRecovery(raw, approval, now, env, actual) : raw.schemaVersion === 15 ? validateExpiredPdfRecovery(raw, approval, now, env, actual) : raw.schemaVersion === 14 ? validateResumeContinuation(raw, approval, now, env, actual) : raw.schemaVersion === 13 ? validateMaintenanceContinuation(raw, approval, now, env, actual) : raw.schemaVersion === 12 ? validateCompletionContinuation(raw, approval, now, env, actual) : raw.schemaVersion === 11 ? validateThirdPdfReplacement(raw, approval, now, env, actual) : raw.schemaVersion === 10 ? validateSecondPdfReplacement(raw, approval, now, env, actual) : raw.schemaVersion === 9 ? validatePdfReplacement(raw, approval, now, env, actual) : raw.schemaVersion === 8 ? validateExecutionContinuation(raw, approval, now, env, actual) : raw.schemaVersion === 7 ? validateAggregateBudget(raw, approval, now, env, actual) : raw.schemaVersion === 6 ? validateExpandedBudget(raw, approval, now, env, actual) : raw.schemaVersion === 5 ? validateNoteReplacement(raw, approval, now, env, actual) : raw.schemaVersion >= 3 ? validateFeeAmendment(raw, approval, now, env, actual) : continuationWithOriginal(raw, approval, now, env);
      if (approved !== undefined) {
        Object.defineProperty(plan, 'approvalHash', { value: approved, enumerable: false });
        if (raw.schemaVersion >= 3) AMENDED_POLICIES.add(plan);
        if (raw.schemaVersion === 6) EXPANDED_BUDGET_POLICIES.add(plan);
        if ([12,13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) COMPLETION_CONTINUATION_POLICIES.add(plan);
        if ([13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) MAINTENANCE_CONTINUATION_POLICIES.add(plan);
        if ([14,15,16,17,18,19,20].includes(raw.schemaVersion)) RESUME_CONTINUATION_POLICIES.add(plan);
        if ([15,16,17,18,19,20].includes(raw.schemaVersion)) EXPIRED_PDF_RECOVERY_POLICIES.add(plan);
        if ([16,17,18,19,20].includes(raw.schemaVersion)) REOPENED_PDF_RECOVERY_POLICIES.add(plan);
        if ([17,18,19,20].includes(raw.schemaVersion)) RECOVERED_REOPENED_PDF_POLICIES.add(plan);
        if ([18,19,20].includes(raw.schemaVersion)) NEVER_SUBMITTED_PDF_POLICIES.add(plan);
        if (raw.schemaVersion === 19) RESTORED_COMPLETION_POLICIES.add(plan);
        if (raw.schemaVersion === 20) CLOSING_CONTINUATION_POLICIES.add(plan);
        if ([7,8,9,10,11,12,13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) REALLOCATED_POLICIES.add(plan);
        if ([8,9,10,11,12,13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) EXECUTION_CONTINUATION_POLICIES.add(plan);
        if ([9,10,11,12,13,14,15,16,17,18,19,20].includes(raw.schemaVersion)) PDF_REPLACEMENT_POLICIES.add(plan);
      }
    } else {
      if (requireApproval || approved !== undefined) check(approved === digest, 'clinical_rehearsal_approval_required');
      check(previewApproval === undefined, 'clinical_rehearsal_scope_rejected');
      plan = validate(raw, now);
    }
    if (requireApproval || env.RELAYER_SECRET !== undefined) check(typeof env.RELAYER_SECRET === 'string' && Keypair.fromSecret(env.RELAYER_SECRET).publicKey() === plan.relayer);
    Object.defineProperty(plan, 'policyHash', { value: digest, enumerable: false });
    return freeze(plan);
  } catch (error) {
    if (error instanceof Error && /^(?:clinical_rehearsal_[a-z_]+|signature_request_expired)$/.test(error.message)) throw error;
    fail();
  }
}
/** Read-only proof of a loaded, newly approved aggregate scope. Metadata alone
 * never grants financial authority. Optional step binds only a future action. */
export function assertRehearsalAggregateBudget(policy, { now = epoch(), step } = {}) {
  check(REALLOCATED_POLICIES.has(policy));
  if (policy.pdfReplacement !== undefined) check(PDF_REPLACEMENT_POLICIES.has(policy));
  if (policy.completionContinuation !== undefined || policy.startingDoctorVersion === 5) check(COMPLETION_CONTINUATION_POLICIES.has(policy));
  const budget = policy.aggregateBudget;
  if (policy.resumeContinuation !== undefined) assertRehearsalResumeBudget(policy, { now, step });
  if (policy.maintenanceContinuation !== undefined || budget?.maintenanceMaxFeeStroops !== undefined) check(MAINTENANCE_CONTINUATION_POLICIES.has(policy));
  check(integer(now) && now >= budget.approvedAt && (policy.executionContinuation === undefined || now >= policy.executionContinuation.approvedAt) && (policy.pdfReplacement === undefined || now >= policy.pdfReplacement.approvedAt) && now < policy.until, 'clinical_rehearsal_expired');
  if (step !== undefined) {
    const declared = policy.steps.find(item => item.requestId === step?.requestId);
    check(declared && payloadHash(declared) === payloadHash(step) && ['append_pdf','correct_note','revoke',...(COMPLETION_CONTINUATION_POLICIES.has(policy)?['renew']:[])].includes(declared.key));
  }
  return budget;
}
/** The administrator is a separate authority, never an inferred ClinicalActor. */
export function assertRehearsalActor(policy, current) {
  for (const role of ['patient', 'doctor']) {
    const expected = policy?.[role];
    if (expected && current?.userId === expected.userId && current.walletId === expected.walletId && current.address === expected.address) return role;
  }
  fail();
}
/** Exact reviewed payload; only emergency withdrawal may use observed revision 4/5/6. */
export function rehearsalStep(policy, current, input) {
  if (policy.resumeContinuation !== undefined) check(RESUME_CONTINUATION_POLICIES.has(policy));
  if (policy.completionContinuation !== undefined || policy.startingDoctorVersion === 5) check(COMPLETION_CONTINUATION_POLICIES.has(policy));
  const role = assertRehearsalActor(policy, current);
  const step = policy.steps.find(item => item.requestId === input?.requestId);
  check(step && step.actor === role && step.actor !== 'admin' && step.input);
  if (policy.closingContinuation) assertClosingAuthority(policy, epoch(), step);
  if (policy.executionContinuation !== undefined) check(EXECUTION_CONTINUATION_POLICIES.has(policy) && ['append_pdf','correct_note','revoke',...(COMPLETION_CONTINUATION_POLICIES.has(policy)?['renew']:[])].includes(step.key));
  if (policy.pdfReplacement !== undefined) check(PDF_REPLACEMENT_POLICIES.has(policy) && ['append_pdf','correct_note','revoke',...(COMPLETION_CONTINUATION_POLICIES.has(policy)?['renew']:[])].includes(step.key));
  let supplied = input;
  if (step.key === 'revoke') {
    check((policy.completionContinuation ? [6] : policy.schemaVersion === 2 ? [5, 6] : [4, 5, 6]).includes(input.expectedRevision));
    supplied = { ...input, expectedRevision: 6 };
  }
  check(payloadHash(supplied) === payloadHash(step.input));
  return step;
}
/** Validate the offered total fee bump, not just the inclusion/base fee. */
export function assertRehearsalFee(policy, step, { feeStroops, maxTime, source, now = epoch() } = {}) {
  if (policy?.completionContinuation !== undefined || policy?.startingDoctorVersion === 5) check(COMPLETION_CONTINUATION_POLICIES.has(policy));
  const recorded = policy?.steps?.find(item => item.requestId === step?.requestId);
  check(recorded && payloadHash(recorded) === payloadHash(step));
  if (policy.executionContinuation !== undefined) check(EXECUTION_CONTINUATION_POLICIES.has(policy) && ['append_pdf','correct_note','revoke',...(COMPLETION_CONTINUATION_POLICIES.has(policy)?['renew']:[])].includes(step.key));
  if (policy.pdfReplacement !== undefined) check(PDF_REPLACEMENT_POLICIES.has(policy) && ['append_pdf','correct_note','revoke',...(COMPLETION_CONTINUATION_POLICIES.has(policy)?['renew']:[])].includes(step.key));
  if (policy.resumeContinuation !== undefined) assertRehearsalResumeBudget(policy, { now, step });
  const expectedSource = step.actor === 'admin' ? policy.admin : policy[step.actor]?.address;
  check(source === expectedSource && Number.isSafeInteger(now) && now >= policy.createdAt && (!AMENDED_POLICIES.has(policy) || policy.feeAmendment.executionApprovedAt === undefined || now >= policy.feeAmendment.executionApprovedAt) && (!AMENDED_POLICIES.has(policy) || policy.noteReplacement === undefined || now >= policy.noteReplacement.approvedAt) && (!EXPANDED_BUDGET_POLICIES.has(policy) || now >= policy.budgetAmendment.approvedAt) && (!REALLOCATED_POLICIES.has(policy) || now >= policy.aggregateBudget.approvedAt) && (policy.executionContinuation === undefined || now >= policy.executionContinuation.approvedAt) && (policy.pdfReplacement === undefined || now >= policy.pdfReplacement.approvedAt) && now < policy.until && Number.isSafeInteger(maxTime) && maxTime <= policy.until, 'clinical_rehearsal_expired');
  check(maxTime > now, 'signature_request_expired');
  let absoluteCap = STEP_FEE;
  if (REALLOCATED_POLICIES.has(policy)) absoluteCap = ({ renew:STEP_FEE, append_note:EXPANDED_DOCTOR_FEE, grant_both:EXPANDED_PERMISSION_FEE, append_pdf:REALLOCATED_DOCTOR_FEE, correct_note:REALLOCATED_DOCTOR_FEE, revoke:WITHDRAWAL_RESERVE })[step.key] ?? STEP_FEE;
  else if (step.actor === 'doctor') absoluteCap = EXPANDED_BUDGET_POLICIES.has(policy) ? EXPANDED_DOCTOR_FEE : AMENDED_POLICIES.has(policy) ? DOCTOR_FEE : STEP_FEE;
  else if (step.actor === 'patient' && EXPANDED_BUDGET_POLICIES.has(policy)) absoluteCap = BigInt(policy.budgetAmendment.permissionMaxFeeStroops);
  const fee = amount(typeof feeStroops === 'bigint' ? feeStroops.toString() : feeStroops, absoluteCap, 'clinical_rehearsal_fee_exceeded');
  check(fee <= BigInt(step.maxFeeStroops), 'clinical_rehearsal_fee_exceeded');
  return fee;
}
