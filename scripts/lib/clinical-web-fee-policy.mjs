import { BASE_FEE, FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

// Testnet clinical web operations only. The total includes Soroban resource/rent
// fees; it is an offered maximum, not a statement of the actual fee charged.
export const CLINICAL_WEB_MAX_SPONSORED_FEE = BigInt(500_000_000); // 50 Testnet XLM
export const CLINICAL_WEB_SPONSOR_BASE_FEE = '2000000';
const BASE = BigInt(CLINICAL_WEB_SPONSOR_BASE_FEE);
export const CLINICAL_WEB_MAX_RESOURCE_FEE = CLINICAL_WEB_MAX_SPONSORED_FEE - BASE * BigInt(2);
const fail = () => Error('clinical_fee_budget_exceeded');

/** Quote the real SDK fee bump before asking the owner to sign. No keys or RPC. */
export function clinicalWebFeeQuote(inner) {
  try {
    if (!(inner instanceof Transaction) || inner.networkPassphrase !== Networks.TESTNET || inner.operations.length !== 1) throw fail();
    const ext = inner.toEnvelope().v1().tx().ext();
    if (![0, 1].includes(ext.switch())) throw fail();
    const resource = ext.switch() === 1 ? BigInt(ext.sorobanData().resourceFee().toString()) : BigInt(0);
    const inclusion = BigInt(inner.fee) - resource;
    if (resource < BigInt(0) || resource > CLINICAL_WEB_MAX_RESOURCE_FEE || inclusion < BigInt(BASE_FEE) || inclusion > BASE) throw fail();
    const outer = TransactionBuilder.buildFeeBumpTransaction(inner.source, CLINICAL_WEB_SPONSOR_BASE_FEE, inner, Networks.TESTNET);
    const sponsored = BigInt(outer.fee);
    if (sponsored !== resource + BASE * BigInt(2) || sponsored > CLINICAL_WEB_MAX_SPONSORED_FEE || sponsored <= BigInt(inner.fee)) throw fail();
    return { resource, inclusion, sponsored };
  } catch { throw fail(); }
}

export function assertClinicalWebSponsoredFee(outer) {
  if (!(outer instanceof FeeBumpTransaction) || outer.networkPassphrase !== Networks.TESTNET ||
      BigInt(outer.fee) !== clinicalWebFeeQuote(outer.innerTransaction).sponsored) throw fail();
}

/** Current ledger reserve + selling liabilities, including sponsored entries. */
export function assertClinicalWebRelayerBudget(account, baseReserve, operations = 8) {
  try {
    if (!Number.isSafeInteger(baseReserve) || baseReserve < 1 || !Number.isSafeInteger(operations) || operations < 1 || operations > 8) throw fail();
    let selling = BigInt(0), sponsoring = 0, sponsored = 0;
    const ext = account.ext();
    if (ext.switch() === 1) {
      const v1 = ext.v1(); selling = BigInt(v1.liabilities().selling().toString());
      if (v1.ext().switch() === 2) { sponsoring = v1.ext().v2().numSponsoring(); sponsored = v1.ext().v2().numSponsored(); }
      else if (v1.ext().switch() !== 0) throw fail();
    } else if (ext.switch() !== 0) throw fail();
    const counts = [account.numSubEntries(), sponsoring, sponsored];
    if (counts.some(v => !Number.isSafeInteger(v) || v < 0) || selling < BigInt(0)) throw fail();
    const units = BigInt(2) + BigInt(counts[0]) + BigInt(sponsoring) - BigInt(sponsored);
    const balance = BigInt(account.balance().toString());
    if (units < BigInt(0) || balance < BigInt(0) || balance - selling - BigInt(baseReserve) * units < CLINICAL_WEB_MAX_SPONSORED_FEE * BigInt(operations)) throw fail();
  } catch { throw Error('rehearsal_relayer_unfunded'); }
}

export async function checkClinicalWebRelayerBudget(server, relayer) {
  try {
    const id = Keypair.fromPublicKey(relayer).xdrPublicKey();
    const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:id}));
    const payer = await server.getLedgerEntries(key), entry = payer.entries?.[0];
    if (!Number.isSafeInteger(payer.latestLedger) || payer.latestLedger < 1 || payer.entries?.length !== 1 ||
        !entry.key.toXDR().equals(key.toXDR()) || entry.val.switch().name !== 'account' || !entry.val.account().accountId().toXDR().equals(id.toXDR())) throw fail();
    const reserveLedger = await server.getLedgers({startLedger:payer.latestLedger,pagination:{limit:1}});
    const header = reserveLedger.ledgers?.[0];
    if (reserveLedger.ledgers?.length !== 1 || header.sequence !== payer.latestLedger || header.headerXdr.header().ledgerSeq() !== header.sequence) throw fail();
    assertClinicalWebRelayerBudget(entry.val.account(),header.headerXdr.header().baseReserve());
  } catch { throw Error('rehearsal_relayer_unfunded'); }
}
