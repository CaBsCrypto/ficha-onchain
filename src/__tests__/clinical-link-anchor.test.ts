import { Account, Address, Contract, Keypair, Networks, StrKey, Transaction, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createClinicalLinkAnchorChain } from '@/lib/clinical-links/anchor';

const publisher = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 5));
const contract = StrKey.encodeContract(Buffer.alloc(32, 6));
const wasmHash = 'ab'.repeat(32);
const commitment = '12'.repeat(32);
const alternate = '34'.repeat(32);

function ledgerValue(key: xdr.LedgerKey, val: xdr.ScVal): rpc.Api.LedgerEntryResult {
  const data = key.contractData();
  return {
    key,
    val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0), contract: data.contract(), key: data.key(), durability: data.durability(), val,
    })),
    liveUntilLedgerSeq: 120,
  };
}

function fixture() {
  let observedCommitment = commitment;
  let observedWasm = wasmHash;
  const getNetwork = vi.fn(async () => ({ passphrase: Networks.TESTNET, protocolVersion: '27' }));
  const getLedgerEntries = vi.fn(async (...keys: xdr.LedgerKey[]) => {
    const [instance, data] = keys;
    const entries = [ledgerValue(instance, xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(observedWasm, 'hex')),
      storage: [new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('publisher'), val: new Address(publisher.publicKey()).toScVal() })],
    })))];
    if (data && data.contractData().key().bytes().toString('hex') === observedCommitment) {
      entries.push(ledgerValue(data, xdr.ScVal.scvBool(true)));
    }
    return { entries, latestLedger: 101 };
  });
  const getTransaction = vi.fn<rpc.Server['getTransaction']>();
  const sendTransaction = vi.fn<rpc.Server['sendTransaction']>();
  const getAccount = vi.fn<rpc.Server['getAccount']>();
  const prepareTransaction = vi.fn<rpc.Server['prepareTransaction']>();
  const chain = createClinicalLinkAnchorChain({ contract, publisher: publisher.publicKey(), wasmHash }, {
    getNetwork, getLedgerEntries, getTransaction, getAccount, prepareTransaction, sendTransaction,
  });
  return {
    chain, getNetwork, getLedgerEntries, getTransaction, sendTransaction,
    setObservedCommitment: (hex: string) => { observedCommitment = hex; },
    setObservedWasm: (hex: string) => { observedWasm = hex; },
  };
}

function signedAnchor(hex = commitment) {
  const transaction = new TransactionBuilder(new Account(publisher.publicKey(), '1'), {
    fee: '100', networkPassphrase: Networks.TESTNET,
  }).addOperation(new Contract(contract).call('anchor', xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'))))
    .setSorobanData(new xdr.SorobanTransactionData({
      ext: new xdr.SorobanTransactionDataExt(0),
      resources: new xdr.SorobanResources({
        footprint: new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }), instructions: 1, diskReadBytes: 1, writeBytes: 1,
      }),
      resourceFee: xdr.Int64.fromString('0'),
    })).setTimeout(120).build();
  transaction.sign(publisher);
  return transaction;
}

function missing(transaction: Transaction): rpc.Api.GetMissingTransactionResponse {
  return {
    status: rpc.Api.GetTransactionStatus.NOT_FOUND, txHash: transaction.hash().toString('hex'), latestLedger: 100,
    latestLedgerCloseTime: Math.floor(Date.now() / 1000), oldestLedger: 50, oldestLedgerCloseTime: 1,
  };
}

function job(transaction: Transaction) {
  return { commitment, attempts: 1, transaction_hash: transaction.hash().toString('hex'), transaction_xdr: transaction.toXDR() };
}

describe('clinical link Testnet anchor', () => {
  it('checks byte equality against live data, the pinned WASM and the Testnet network', async () => {
    const { chain, getNetwork, setObservedWasm } = fixture();
    await expect(chain.contains(commitment)).resolves.toBe(true);
    await expect(chain.contains(alternate)).resolves.toBe(false);
    setObservedWasm(alternate);
    await expect(chain.contains(commitment)).rejects.toThrow('clinical_link_anchor_unavailable');
    getNetwork.mockResolvedValueOnce({ passphrase: Networks.PUBLIC, protocolVersion: '27' });
    await expect(chain.contains(commitment)).rejects.toThrow('clinical_link_anchor_unavailable');
  });

  it('reuses the exact signed transaction and checks the grant before any submission', async () => {
    const { chain, getTransaction, sendTransaction } = fixture();
    const transaction = signedAnchor();
    getTransaction.mockResolvedValue(missing(transaction));
    await expect(chain.reconcile(job(transaction), async () => false)).resolves.toBe('pending');
    expect(sendTransaction).not.toHaveBeenCalled();
    await expect(chain.reconcile(job(transaction), async () => true)).resolves.toBe('pending');
    expect(sendTransaction.mock.calls[0][0].toEnvelope().toXDR()).toEqual(transaction.toEnvelope().toXDR());
    await expect(chain.reconcile(job(signedAnchor(alternate)), async () => true)).rejects.toThrow('clinical_link_anchor_unavailable');
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('requires an exact successful receipt and confirmed live commitment', async () => {
    const { chain, getTransaction, setObservedCommitment, sendTransaction } = fixture();
    const transaction = signedAnchor();
    getTransaction.mockResolvedValue({
      ...missing(transaction),
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      envelopeXdr: transaction.toEnvelope(),
    } as rpc.Api.GetSuccessfulTransactionResponse);
    await expect(chain.reconcile(job(transaction), async () => false)).resolves.toBe('confirmed');
    setObservedCommitment(alternate);
    await expect(chain.reconcile(job(transaction), async () => false)).rejects.toThrow('clinical_link_anchor_unavailable');
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
