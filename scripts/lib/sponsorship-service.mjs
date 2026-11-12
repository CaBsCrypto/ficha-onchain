/** Shared Node/Next sponsorship core. Browser/server adapters use the same immutable ledger rules. */
import { applyReservation, assertBinding, assertBucketLimits, assertFreshQuote, assertPolicy, assertPrice, assertPrincipal, deny, epoch, newReservation, releaseReserved, stroops } from './sponsorship-domain.mjs';
import { assertVerifiedQuote, signedEnvelope } from './sponsorship-quote.mjs';
export function createSponsorshipService(input) {
    const now = input.now ?? (() => Math.floor(Date.now() / 1000)), store = input.store;
    const policy = input.policy ? Object.freeze({ ...input.policy }) : null;
    const ready = (r, p, recovery = false, signedAt) => {
        if (!r)
            return deny('sponsorship_reservation_missing');
        assertBinding(r, p);
        assertPolicy(policy);
        const currentTime = epoch(now());
        if (recovery && (r.signedAt !== null || signedAt !== undefined)) {
            const acceptedAt = epoch(r.signedAt ?? signedAt);
            assertFreshQuote(r.quote, acceptedAt);
            if (acceptedAt > currentTime || currentTime >= r.quote.maxTime)
                deny('sponsorship_envelope_expired');
        }
        else
            assertFreshQuote(r.quote, currentTime);
        assertPrice(r.quote, policy);
        if (r.state === 'settled' || r.state === 'released')
            deny('sponsorship_reservation_closed');
        return r;
    };
    return {
        async reserve(principal, quote) {
            assertPolicy(policy);
            assertVerifiedQuote(principal, quote);
            assertFreshQuote(quote, epoch(now()));
            assertPrice(quote, policy);
            const candidate = newReservation(principal, quote);
            return store.mutate(principal.requestId, candidate, policy, (existing, buckets) => {
                assertFreshQuote(quote, epoch(now()));
                return applyReservation(existing, candidate, buckets, policy);
            });
        },
        async assertReady(principal, phase) {
            assertPrincipal(principal);
            assertPolicy(policy);
            if (phase !== 'sign' && phase !== 'submit')
                deny('sponsorship_invalid_phase');
            return store.mutate(principal.requestId, null, policy, (current, buckets) => {
                const r = ready(current, principal, phase === 'submit');
                assertBucketLimits(buckets, policy, principal);
                if (phase === 'sign' && r.state !== 'reserved')
                    deny('sponsorship_already_signed');
                if (phase === 'submit' && !['signed', 'submitted'].includes(r.state))
                    deny('sponsorship_signature_missing');
                return r;
            });
        },
        async markSigned(principal, signedInnerXdr, proof) {
            assertPrincipal(principal);
            assertPolicy(policy);
            return store.mutate(principal.requestId, null, policy, (current, buckets) => {
                const r = ready(current, principal, true, proof?.signedAt);
                assertBucketLimits(buckets, policy, principal);
                const signed = signedEnvelope(principal, r.quote, signedInnerXdr);
                if (r.signedInnerDigest && r.signedInnerDigest !== signed.signedInnerDigest)
                    deny('sponsorship_hash_conflict');
                if (r.state === 'reserved')
                    r.state = 'signed';
                r.signedInnerDigest = signed.signedInnerDigest;
                r.signedAt ??= proof?.signedAt ?? epoch(now());
                return r;
            });
        },
        async bindSubmission(principal, signedInnerXdr, proof) {
            assertPrincipal(principal);
            assertPolicy(policy);
            const reservation = await store.mutate(principal.requestId, null, policy, (current, buckets) => {
                const r = ready(current, principal, true, proof?.signedAt);
                assertBucketLimits(buckets, policy, principal);
                const signed = signedEnvelope(principal, r.quote, signedInnerXdr);
                if ((r.signedInnerDigest && r.signedInnerDigest !== signed.signedInnerDigest) ||
                    (r.transactionHash && r.transactionHash !== signed.transactionHash))
                    deny('sponsorship_hash_conflict');
                r.signedInnerDigest = signed.signedInnerDigest;
                r.signedAt ??= proof?.signedAt ?? epoch(now());
                r.transactionHash = signed.transactionHash;
                r.state = 'submitted';
                return r;
            });
            return { reservation, transactionHash: reservation.transactionHash };
        },
        async cancelUnsigned(principal) {
            assertPrincipal(principal);
            return store.mutate(principal.requestId, null, null, (r, buckets) => {
                if (!r)
                    return deny('sponsorship_reservation_missing');
                assertBinding(r, principal);
                if (r.state === 'released')
                    return r;
                if (r.state !== 'reserved' || r.signedInnerDigest || r.transactionHash)
                    deny('sponsorship_signed_reservation');
                releaseReserved(r, buckets, BigInt(0));
                r.state = 'released';
                return r;
            });
        },
        /** Receipt I/O occurs BEFORE mutate: no network operation runs under bucket locks. Missing historical rows are readable. */
        async reconcile(requestId, receiptReader) {
            const snapshot = await store.get(requestId);
            if (!snapshot || !snapshot.transactionHash || snapshot.state === 'released')
                return snapshot;
            let receipt;
            try {
                receipt = await receiptReader(snapshot.transactionHash);
            }
            catch {
                return deny('sponsorship_receipt_unavailable');
            }
            if (!receipt || receipt.transactionHash !== snapshot.transactionHash)
                deny('sponsorship_receipt_mismatch');
            if (receipt.status === 'UNKNOWN' || receipt.status === 'NOT_FOUND')
                return snapshot;
            if (!['SUCCESS', 'FAILED'].includes(receipt.status) || !Number.isSafeInteger(receipt.ledger) || receipt.ledger <= 0)
                deny('sponsorship_receipt_mismatch');
            const charged = stroops(receipt.feeChargedStroops, true);
            return store.mutate(requestId, null, null, (r, buckets) => {
                if (!r || r.transactionHash !== receipt.transactionHash || r.state === 'released')
                    return deny('sponsorship_receipt_mismatch');
                if (r.state === 'settled') {
                    if (r.chargedStroops !== charged.toString() || r.ledger !== receipt.ledger || r.outcome !== receipt.status)
                        deny('sponsorship_receipt_mismatch');
                    return r;
                }
                if (r.state !== 'submitted')
                    deny('sponsorship_receipt_mismatch');
                releaseReserved(r, buckets, charged);
                r.state = 'settled';
                r.outcome = receipt.status;
                r.chargedStroops = charged.toString();
                r.ledger = receipt.ledger;
                return r;
            });
        },
    };
}
