/** Shared Node/Next sponsorship core. Browser/server adapters use the same immutable ledger rules. */
import { bindingDigest, bucketDay, bucketKeys, bucketLimit, deny, epoch, quoteDigest, quoteExpiresAt, SponsorshipError, stroops, utcDay } from './sponsorship-domain.mjs';
function validReservation(value) {
    const r = value;
    try {
        bindingDigest(r.binding);
        if (r.day !== utcDay(r.quote.preparedAt) || r.quote.binding !== bindingDigest(r.binding) ||
            !['reserved', 'signed', 'submitted', 'settled', 'released'].includes(r.state))
            deny('sponsorship_accounting_unavailable');
        const { quoteId, ...data } = r.quote;
        if (quoteId !== quoteDigest(data) || ![r.quote.unsignedHash, r.quote.signingHash].every(h => /^[a-f0-9]{64}$/.test(h)))
            deny('sponsorship_accounting_unavailable');
        const expiresAt = quoteExpiresAt(r.quote);
        if (r.quote.maxTime <= r.quote.preparedAt || r.quote.maxTime > r.quote.preparedAt + 600 ||
            stroops(r.quote.offeredFeeStroops) !== stroops(r.quote.resourceFeeStroops, true) + stroops(r.quote.sponsorBaseFeeStroops) * BigInt(2))
            deny('sponsorship_accounting_unavailable');
        if (['signed', 'submitted', 'settled'].includes(r.state) ? !r.signedInnerDigest || !/^[a-f0-9]{64}$/.test(r.signedInnerDigest) : r.signedInnerDigest !== null)
            deny('sponsorship_accounting_unavailable');
        if (r.signedInnerDigest ? r.signedAt === null || epoch(r.signedAt) < r.quote.preparedAt || r.signedAt >= expiresAt : r.signedAt !== null)
            deny('sponsorship_accounting_unavailable');
        if (['submitted', 'settled'].includes(r.state) ? !r.transactionHash || !/^[a-f0-9]{64}$/.test(r.transactionHash) : r.transactionHash !== null)
            deny('sponsorship_accounting_unavailable');
        if (r.state === 'settled') {
            if (!['SUCCESS', 'FAILED'].includes(r.outcome) || !Number.isSafeInteger(r.ledger) || r.ledger <= 0 ||
                stroops(r.chargedStroops, true) > stroops(r.quote.offeredFeeStroops))
                deny('sponsorship_accounting_unavailable');
        }
        else if (r.outcome !== null || r.ledger !== null || r.chargedStroops !== null)
            deny('sponsorship_accounting_unavailable');
        return r;
    }
    catch {
        return deny('sponsorship_accounting_unavailable');
    }
}
export function decodeSponsorshipReservation(row) {
    const value = validReservation(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
    if (value.binding.requestId.toLowerCase() !== row.request_id || value.binding.network !== row.network ||
        value.day !== row.utc_day || value.state !== row.state || value.transactionHash !== row.transaction_hash)
        deny('sponsorship_accounting_unavailable');
    return value;
}
/** Uses the shared guarded database connector. Request lock + two ordered bucket locks; no RPC callback. */
export class SqlSponsorshipStore {
    connect;
    constructor(connect) {
        this.connect = connect;
    }
    async get(id) {
        let client;
        try {
            client = await this.connect();
            const rows = (await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1', [id])).rows;
            return rows.length ? decodeSponsorshipReservation(rows[0]) : null;
        }
        catch (error) {
            if (error instanceof SponsorshipError)
                throw error;
            return deny('sponsorship_accounting_unavailable');
        }
        finally {
            client?.release();
        }
    }
    async mutate(id, initial, policy, change) {
        let client;
        try {
            client = await this.connect();
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['sponsorship:request:' + id.toLowerCase()]);
            const rows = (await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1 FOR UPDATE', [id])).rows;
            const current = rows.length ? decodeSponsorshipReservation(rows[0]) : null, base = current ?? initial;
            if (!base || base.binding.requestId !== id)
                return deny('sponsorship_reservation_missing');
            const originalQuoteId = base.quote.quoteId;
            const buckets = [];
            for (const key of bucketKeys(base.binding)) {
                const day = bucketDay(key, base.day);
                if (initial && policy)
                    await client.query(`INSERT INTO sponsorship_daily_buckets(network,bucket_key,utc_day,limit_stroops)
          VALUES($1,$2,$3,$4) ON CONFLICT(network,bucket_key,utc_day) DO NOTHING`, [base.binding.network, key, day, bucketLimit(key, policy)]);
                const found = (await client.query(`SELECT bucket_key,utc_day::text,limit_stroops::text,reserved_stroops::text,spent_stroops::text
          FROM sponsorship_daily_buckets WHERE network=$1 AND bucket_key=$2 AND utc_day=$3 FOR UPDATE`, [base.binding.network, key, day])).rows;
                if (found.length !== 1)
                    deny('sponsorship_accounting_unavailable');
                const b = { key: found[0].bucket_key, day: found[0].utc_day, limitStroops: found[0].limit_stroops,
                    reservedStroops: found[0].reserved_stroops, spentStroops: found[0].spent_stroops };
                if (b.key !== key || b.day !== day)
                    deny('sponsorship_accounting_unavailable');
                stroops(b.limitStroops);
                stroops(b.reservedStroops, true);
                stroops(b.spentStroops, true);
                buckets.push(b);
            }
            const result = change(current, buckets);
            if (result && typeof result.then === 'function')
                deny('sponsorship_async_mutation_forbidden');
            validReservation(result);
            if (result.binding.requestId !== id || bindingDigest(result.binding) !== bindingDigest(base.binding) || result.day !== base.day ||
                result.quote.quoteId !== originalQuoteId)
                deny('sponsorship_binding_conflict');
            for (const b of buckets)
                await client.query(`UPDATE sponsorship_daily_buckets SET reserved_stroops=$4,spent_stroops=$5
        WHERE network=$1 AND bucket_key=$2 AND utc_day=$3`, [base.binding.network, b.key, b.day, b.reservedStroops, b.spentStroops]);
            if (current)
                await client.query(`UPDATE sponsorship_reservations SET state=$2,transaction_hash=$3,payload=$4::jsonb,updated_at=NOW() WHERE request_id=$1`, [id, result.state, result.transactionHash, JSON.stringify(result)]);
            else
                await client.query(`INSERT INTO sponsorship_reservations(request_id,network,utc_day,state,transaction_hash,payload)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [id, result.binding.network, result.day, result.state, result.transactionHash, JSON.stringify(result)]);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            if (client)
                try {
                    await client.query('ROLLBACK');
                }
                catch { /* The connection is released below. */ }
            if (error instanceof SponsorshipError)
                throw error;
            return deny('sponsorship_accounting_unavailable');
        }
        finally {
            client?.release();
        }
    }
}
