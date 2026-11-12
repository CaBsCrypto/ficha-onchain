/**
 * Unintegrated automatic sponsorship stays disabled even when unrelated flags are enabled.
 * This is deliberately not a policy/config loader: a path needs the persistent ledger first.
 * Trusted worker factories may inject a test-only assertion with synthetic adapters.
 * @returns {void} The assertion throws while this path has no persistent ledger.
 */
export function assertUnintegratedSponsorship() {
  throw Error('sponsorship_path_disabled');
}
