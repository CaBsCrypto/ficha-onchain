import { afterEach, expect, it, vi } from 'vitest';
import { Networks, StrKey, rpc } from '@stellar/stellar-sdk';
import { clinicalRpcUrl } from '../../scripts/lib/clinical-rpc.mjs';
import { createClinicalChainReader } from '../../scripts/lib/clinical-chain-read.mjs';
import { createClinicalWebChain } from '@/lib/clinical/chain';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const sdf = 'https://soroban-testnet.stellar.org';
const gateway = 'https://soroban-rpc.testnet.stellar.gateway.fm';
const config = { network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)),
  registryId: StrKey.encodeContract(Buffer.alloc(32, 2)), wasmHash: '3'.repeat(64),
  readerAddress: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4)) };

it('retains SDF by default and selects Gateway only through the explicit server setting', () => {
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', undefined);
  expect(clinicalRpcUrl()).toBe(sdf);
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', 'gateway');
  expect(clinicalRpcUrl()).toBe(gateway);
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', 'sdf');
  expect(clinicalRpcUrl()).toBe(sdf);
});

it.each(['', 'GATEWAY', 'mainnet', 'constructor', '__proto__', 'https://example.test',
  'https://soroban-rpc.testnet.stellar.gateway.fm', 'gateway/', ' gateway'])('rejects unsupported provider %s', value => {
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', value);
  const calls = vi.spyOn(rpc.Server.prototype, 'getNetwork');
  expect(() => createClinicalWebChain()).toThrow('clinical_rpc_provider_invalid');
  expect(() => createClinicalChainReader(config)).toThrow('clinical_rpc_provider_invalid');
  expect(calls).not.toHaveBeenCalled();
});

it.each(['sdf', 'gateway'])('both clinical boundaries use %s and still reject the wrong network', async provider => {
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', provider);
  const urls: string[] = [];
  vi.spyOn(rpc.Server.prototype, 'getNetwork').mockImplementation(async function (this: rpc.Server) {
    urls.push(this.serverURL.toString().replace(/\/$/, ''));
    return { passphrase: Networks.PUBLIC, protocolVersion: 29 };
  });
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  await expect(createClinicalWebChain().verifyDeployment()).rejects.toThrow('clinical_chain_unavailable');
  await expect(createClinicalChainReader(config).verifyDeployment()).rejects.toThrow('clinical_chain_unavailable');
  expect(urls).toEqual([provider === 'sdf' ? sdf : gateway, provider === 'sdf' ? sdf : gateway]);
  expect(send).not.toHaveBeenCalled();
});

it('an RPC error remains an error without provider failover or transmission', async () => {
  vi.stubEnv('TRUSTLEAF_CLINICAL_RPC_PROVIDER', 'gateway');
  const urls: string[] = [];
  vi.spyOn(rpc.Server.prototype, 'getNetwork').mockImplementation(async function (this: rpc.Server) {
    urls.push(this.serverURL.toString().replace(/\/$/, ''));
    throw new Error('synthetic_rpc_unavailable');
  });
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  await expect(createClinicalWebChain().verifyDeployment()).rejects.toThrow();
  await expect(createClinicalChainReader(config).verifyDeployment()).rejects.toThrow();
  expect(urls).toEqual([gateway, gateway]);
  expect(send).not.toHaveBeenCalled();
});
