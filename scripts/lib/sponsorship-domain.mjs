/** Shared Node/Next sponsorship core. Browser/server adapters use the same immutable ledger rules. */
import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { QUOTE_MAX_AGE_SECONDS, CLINICAL_QUOTE_MAX_AGE_SECONDS } from './sponsorship-quote-window.mjs';
export { QUOTE_MAX_AGE_SECONDS, CLINICAL_QUOTE_MAX_AGE_SECONDS } from './sponsorship-quote-window.mjs';
const MAX_STROOPS = BigInt('9223372036854775807');
export class SponsorshipError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'SponsorshipError';
    }
}
export function deny(code) { throw new SponsorshipError(code); }
export function stroops(value, zero = false) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value))
        return deny('sponsorship_invalid_amount');
    const n = BigInt(value);
    if (n > MAX_STROOPS || (!zero && n === BigInt(0)))
        return deny('sponsorship_invalid_amount');
    return n;
}
export function epoch(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799)
        return deny('sponsorship_invalid_time');
    return value;
}
export const utcDay = (seconds) => new Date(epoch(seconds) * 1000).toISOString().slice(0, 10);
export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const PRINCIPALS = new WeakSet();
export function validateBinding(value) {
    if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId) ||
        value.network !== 'testnet' || ![value.sourceAddress, value.sponsorAddress, value.patientAddress].every(v => typeof v === 'string' && StrKey.isValidEd25519PublicKey(v)) ||
        (value.encounterId !== undefined && !/^(?:[a-f0-9]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(value.encounterId)) ||
        (value.intent !== undefined && !['standard', 'revoke'].includes(value.intent)) ||
        (value.intent === 'revoke' && value.action !== 'set_permissions') ||
        !StrKey.isValidContract(value.contractId) || !/^[a-z][a-z0-9_]{0,63}$/.test(value.action) ||
        !/^[a-f0-9]{64}$/.test(value.operationFingerprint) ||
        ![value.actorId, value.walletId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\x00-\x1f]/.test(v)))
        deny('sponsorship_invalid_binding');
}
/** Resolver MUST derive these values from authenticated server/chain state, never a request body. */
export async function verifySponsorshipPrincipal(resolve) {
    const value = { ...await resolve() };
    if (typeof value.requestId === 'string')
        value.requestId = value.requestId.toLowerCase();
    validateBinding(value);
    const result = Object.freeze(value);
    PRINCIPALS.add(result);
    return result;
}
export function assertPrincipal(value) {
    if (!value || !PRINCIPALS.has(value))
        deny('sponsorship_unverified_principal');
}
export function bindingDigest(value) {
    validateBinding(value);
    return sha256(JSON.stringify([value.requestId, value.network, value.sourceAddress, value.sponsorAddress,
        value.patientAddress, value.actorId, value.walletId, value.contractId, value.action, value.operationFingerprint, value.encounterId ?? null, value.intent ?? 'standard']));
}
export function assertPolicy(value) {
    if (!value || value.enabled !== true)
        deny('sponsorship_disabled');
    stroops(value.sponsorDailyLimitStroops);
    stroops(value.patientDailyLimitStroops);
    stroops(value.maxFeeStroops);
    if (value.emergencyReserveStroops !== undefined && (stroops(value.emergencyReserveStroops, true) > stroops(value.sponsorDailyLimitStroops) || stroops(value.emergencyReserveStroops, true) > stroops(value.patientDailyLimitStroops)))
        deny('sponsorship_invalid_policy');
    if (value.encounterLimitStroops !== undefined)
        stroops(value.encounterLimitStroops);
}
export function quoteDigest(q) {
    const canonical = [q.binding, q.unsignedHash, q.signingHash, q.preparedAt, q.maxTime, q.offeredFeeStroops, q.resourceFeeStroops, q.sponsorBaseFeeStroops];
    // Do not append an absent field: existing reservations retain their original digest.
    if (q.validUntil !== undefined)
        canonical.push('validUntil', q.validUntil);
    return sha256(JSON.stringify(canonical));
}
export const bucketKeys = (b) => ['patient:' + b.patientAddress, 'sponsor:' + b.sponsorAddress, ...(b.encounterId ? ['encounter:' + b.patientAddress + ':' + b.encounterId] : [])].sort();
export const bucketDay = (key, day) => key.startsWith('encounter:') ? '1970-01-01' : day;
export const bucketLimit = (key, policy) => key.startsWith('encounter:') ? (policy.encounterLimitStroops ?? deny('sponsorship_encounter_unconfigured')) : key.startsWith('patient:') ? policy.patientDailyLimitStroops : policy.sponsorDailyLimitStroops;
export function quoteExpiresAt(quote) {
    const preparedAt = epoch(quote.preparedAt), maxTime = epoch(quote.maxTime);
    if (maxTime <= preparedAt)
        deny('sponsorship_invalid_time');
    if (quote.validUntil === undefined)
        return Math.min(preparedAt + QUOTE_MAX_AGE_SECONDS, maxTime);
    const validUntil = epoch(quote.validUntil);
    if (validUntil !== Math.min(preparedAt + CLINICAL_QUOTE_MAX_AGE_SECONDS, maxTime))
        deny('sponsorship_invalid_time');
    return validUntil;
}
export function assertFreshQuote(quote, now) {
    epoch(now);
    if (now < quote.preparedAt || now >= quoteExpiresAt(quote))
        deny('sponsorship_quote_expired');
}
export function assertPrice(quote, policy) {
    if (stroops(quote.offeredFeeStroops) > stroops(policy.maxFeeStroops))
        deny('sponsorship_price_blocked');
}
export function assertBinding(reservation, principal) {
    assertPrincipal(principal);
    if (bindingDigest(reservation.binding) !== bindingDigest(principal))
        deny('sponsorship_binding_conflict');
}
export function assertBucketLimits(buckets, policy, binding, emergency = false) {
    for (const b of buckets) {
        const effective = stroops(bucketLimit(b.key, policy)) < stroops(b.limitStroops) ? stroops(bucketLimit(b.key, policy)) : stroops(b.limitStroops);
        if (stroops(b.spentStroops, true) + stroops(b.reservedStroops, true) + (emergency && (b.key.startsWith('sponsor:') || b.key.startsWith('patient:')) && binding?.intent !== 'revoke' ? stroops(policy.emergencyReserveStroops ?? '0', true) : BigInt(0)) > effective)
            deny('sponsorship_daily_limit');
    }
}
export function newReservation(principal, quote) {
    return { binding: { ...principal }, quote: { ...quote }, day: utcDay(quote.preparedAt), state: 'reserved',
        signedInnerDigest: null, signedAt: null, transactionHash: null, outcome: null, chargedStroops: null, ledger: null };
}
export function applyReservation(existing, candidate, buckets, policy) {
    if (existing) {
        if (bindingDigest(existing.binding) !== bindingDigest(candidate.binding) || existing.quote.quoteId !== candidate.quote.quoteId)
            deny('sponsorship_idempotency_conflict');
        if (existing.state === 'released')
            deny('sponsorship_reservation_closed');
        assertBucketLimits(buckets, policy, candidate.binding);
        return existing;
    }
    if (policy.encounterLimitStroops && candidate.binding.action === 'append_version' && !candidate.binding.encounterId)
        deny('sponsorship_encounter_required');
    const amount = stroops(candidate.quote.offeredFeeStroops);
    for (const b of buckets)
        b.reservedStroops = (stroops(b.reservedStroops, true) + amount).toString();
    assertBucketLimits(buckets, policy, candidate.binding, true);
    return candidate;
}
export function releaseReserved(reservation, buckets, charged) {
    const amount = stroops(reservation.quote.offeredFeeStroops);
    if (charged < BigInt(0) || charged > amount)
        deny('sponsorship_receipt_mismatch');
    for (const b of buckets) {
        const reserved = stroops(b.reservedStroops, true);
        if (reserved < amount)
            deny('sponsorship_accounting_unavailable');
        b.reservedStroops = (reserved - amount).toString();
        b.spentStroops = (stroops(b.spentStroops, true) + charged).toString();
    }
}
