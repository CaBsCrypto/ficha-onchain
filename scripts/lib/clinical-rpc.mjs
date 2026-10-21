// Server configuration only: callers cannot supply an arbitrary RPC URL.
// A failed request never switches providers or resubmits an operation.
const PROVIDERS = Object.freeze({
  sdf: 'https://soroban-testnet.stellar.org',
  gateway: 'https://soroban-rpc.testnet.stellar.gateway.fm',
});

export function clinicalRpcUrl(provider = process.env.TRUSTLEAF_CLINICAL_RPC_PROVIDER) {
  if (provider === undefined) return PROVIDERS.sdf;
  if (typeof provider !== 'string' || !Object.hasOwn(PROVIDERS, provider)) {
    throw new Error('clinical_rpc_provider_invalid');
  }
  return PROVIDERS[provider];
}
