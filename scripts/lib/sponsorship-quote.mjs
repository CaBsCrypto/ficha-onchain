/** Shared Node/Next sponsorship core. Browser/server adapters use the same immutable ledger rules. */
import { Address, BASE_FEE, FeeBumpTransaction, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { assertPrincipal, bindingDigest, deny, epoch, quoteDigest, quoteExpiresAt, sha256, stroops } from './sponsorship-domain.mjs';
const QUOTES = new WeakSet();
export function quoteSponsorship(principal, input) {
    assertPrincipal(principal);
    try {
        const preparedAt = epoch(input.preparedAt), now = epoch(input.now);
        if (preparedAt > now)
            deny('sponsorship_quote_expired');
        const tx = new Transaction(input.unsignedXdr, Networks.TESTNET);
        if (tx.source !== principal.sourceAddress || tx.signatures.length || tx.operations.length !== 1 ||
            tx.operations[0].type !== 'invokeHostFunction' || !tx.timeBounds)
            deny('sponsorship_invalid_envelope');
        const op = tx.operations[0];
        if (op.type !== 'invokeHostFunction')
            deny('sponsorship_invalid_envelope');
        if (op.source !== undefined || op.func.switch().name !== 'hostFunctionTypeInvokeContract' ||
            tx.toEnvelope().v1().tx().memo().switch().name !== 'memoNone')
            deny('sponsorship_invalid_envelope');
        const invocation = op.func.invokeContract();
        if (Address.fromScAddress(invocation.contractAddress()).toString() !== principal.contractId ||
            invocation.functionName().toString() !== principal.action ||
            sha256(op.func.toXDR('base64')) !== principal.operationFingerprint)
            deny('sponsorship_invalid_envelope');
        const bounds = tx.timeBounds;
        if (!bounds)
            deny('sponsorship_invalid_envelope');
        const maxTime = epoch(Number(bounds.maxTime)), minTime = epoch(Number(bounds.minTime));
        if (minTime > now || maxTime <= now || maxTime > preparedAt + 600)
            deny('sponsorship_invalid_envelope');
        const ext = tx.toEnvelope().v1().tx().ext();
        if (ext.switch() !== 1)
            deny('sponsorship_invalid_envelope');
        const resource = stroops(ext.sorobanData().resourceFee().toString(), true);
        const base = stroops(input.sponsorBaseFeeStroops), inclusion = stroops(tx.fee) - resource;
        if (base < BigInt(BASE_FEE) || inclusion < BigInt(BASE_FEE) || inclusion > base)
            deny('sponsorship_invalid_envelope');
        const outer = TransactionBuilder.buildFeeBumpTransaction(principal.sponsorAddress, input.sponsorBaseFeeStroops, tx, Networks.TESTNET);
        const offered = stroops(outer.fee);
        if (offered !== resource + base * BigInt(2))
            deny('sponsorship_invalid_envelope');
        const data = { binding: bindingDigest(principal), unsignedHash: sha256(input.unsignedXdr),
            signingHash: tx.hash().toString('hex'), preparedAt, maxTime, offeredFeeStroops: offered.toString(),
            resourceFeeStroops: resource.toString(), sponsorBaseFeeStroops: base.toString(),
            ...(input.validUntil === undefined ? {} : { validUntil: input.validUntil }) };
        if (now >= quoteExpiresAt(data))
            deny('sponsorship_quote_expired');
        const result = Object.freeze({ ...data, quoteId: quoteDigest(data) });
        QUOTES.add(result);
        return result;
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('sponsorship_'))
            throw error;
        return deny('sponsorship_invalid_envelope');
    }
}
export function assertVerifiedQuote(principal, quote) {
    assertPrincipal(principal);
    if (!quote || !QUOTES.has(quote) || quote.binding !== bindingDigest(principal))
        deny('sponsorship_unverified_quote');
}
/** Checks the immutable signing payload; existing actor-signature verification remains mandatory at the caller. */
export function signedEnvelope(principal, quote, signedInnerXdr) {
    try {
        const tx = new Transaction(signedInnerXdr, Networks.TESTNET);
        if (tx.source !== principal.sourceAddress || !tx.signatures.length || tx.hash().toString('hex') !== quote.signingHash)
            deny('sponsorship_invalid_envelope');
        const outer = TransactionBuilder.buildFeeBumpTransaction(principal.sponsorAddress, quote.sponsorBaseFeeStroops, tx, Networks.TESTNET);
        if (outer.fee !== quote.offeredFeeStroops)
            deny('sponsorship_invalid_envelope');
        return { signedInnerDigest: sha256(signedInnerXdr), transactionHash: outer.hash().toString('hex') };
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('sponsorship_'))
            throw error;
        return deny('sponsorship_invalid_envelope');
    }
}
