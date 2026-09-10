# Privy / Stellar migration — prerequisite in progress

TrustLeaf uses Stellar only. Ethereum and Solana automatic wallet creation is
disabled. No address conversion is permitted. The React SDK was upgraded to v3
to use the official `extended-chains` creation and raw-sign hooks with
`chainType: 'stellar'`. Signing happens through the logged-in owner's browser;
the local relay verifies that signature and sponsors the Testnet transaction.

## Local prerequisite

`/privy-check` is a local diagnostic, not the clinical portal integration.
Its endpoint is disabled unless `TRUSTLEAF_PRIVY_SIGNING_CHECK=true`, refuses
Vercel and non-loopback hosts, and requires a Privy session and same-origin POST.
It accepts preparation, signature confirmation and status actions. The caller
cannot supply transaction XDR, contract, method, arguments or a signing hash.
The only prepared operation is `interface_version` on the private registry:
`CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`.

The SDK creates a native Stellar wallet when needed. The server checks the
authenticated user's linked wallet, pins its ID and address in local evidence,
provisions via Testnet Friendbot if needed, prepares an expiring transaction,
and checks the signature before fee-bump submission. Signed envelopes and hashes
are saved before broadcast in gitignored `.trustleaf-local/privy-signing-check`.
Repeated calls reconcile the same envelope. Do not run other relay workers while
this prerequisite probe is active. An interrupted process leaves a lock requiring
operator review; this diagnostic is not the production worker implementation.

## Validation status

- 146 application tests passed after the SDK upgrade.
- TypeScript passed after the final UI adjustments.
- Browser: updated TrustLeaf page and official Privy login modal render.
- Real user signatures and relay receipts: **pending; doctor login completed but wallet association is ambiguous**.
- Three distinct test accounts (admin, doctor, patient) offered by the owner.
- No clinical flow, preview or main-site activation performed for this migration.

Do not mark this gate passed based on unit tests or the earlier CLI fixtures.
Complete two distinct owner signatures and confirmed relay receipts, then proceed
with persistent application services, admin worker, portalling, retirement of old
modules, isolated preview database and the two planned PRs. No admin-signature
substitution and no fallback to old contracts.

Official references:
- https://docs.privy.io/recipes/react/whitelabel
- https://docs.privy.io/basics/react/advanced/migrating-to-3.0

The older server-side owner-signing adapter is not connected to this diagnostic;
the active probe uses the official browser SDK. Consolidate the verification
boundary into application services after the prerequisite succeeds.

## Week 2 prerequisite attempt — 9 September 2026

The doctor test user logged in through Privy in the local browser. The browser
reported four linked Stellar wallets. The diagnostic stopped before preparing or
signing a transaction, as required by the ambiguous-binding safeguard. No relay
receipt was produced. The UI now explicitly reports this condition instead of a
generic signing error. Existing wallets were not deleted or reassigned.

Resolve the intended owner-wallet association, or use a separate test identity
with a single Stellar wallet, before repeating the prerequisite. Two distinct
successful owner signatures and confirmed receipts remain required. The nine
owner-signing adapter unit tests passed during this attempt; these are mocked
tests and do not satisfy that requirement.

### Duplicate prevention implemented locally

Wallet provisioning now uses a durable, app-scoped user-to-wallet association.
GET no longer creates wallets. POST claims creation in Neon before contacting
Privy, without automatic creation retries after an uncertain response. Subsequent
requests recover a linked wallet or remain pending; they cannot create another.
The signing probe uses the same resolver. Changed bindings fail closed; legacy
multiple-wallet users without an association still require resolution.

The matching migration was applied only to Neon dev. Both migration definitions
match. Validation: 158 application tests passed, including concurrency, lost
response recovery, changed wallet and request-origin checks; TypeScript passed.
The browser reached the server and confirmed wallet_binding_ambiguous for the
doctor account. No wallet was removed, no transaction was submitted, and the
two-user real-signature gate remains pending. Changes are local, not deployed.

### Doctor owner-signature prerequisite confirmed

On 9 September 2026 the designated doctor test account completed the local
browser flow using its existing native Stellar wallet and Privy signing.
The probe verified the owner's signature, persisted the signed fee-bump envelope,
and reconciled the Testnet receipt to SUCCESS. TrustLeaf's relayer paid the fee.
Receipt: https://stellar.expert/explorer/testnet/tx/58f5a8c1d05f3b8004658c20bf769885aeafb9545aa1f3708e4c9ef88a900821

This is the registry interface_version probe, not clinical issuance or doctor
authorization. The second distinct user (patient) remains pending; the overall
two-user gate is not yet complete.

### Two-user prerequisite completed — 9 September 2026

The designated patient account also completed the browser signing probe using
its own existing native Stellar wallet. The receipt was reconciled to SUCCESS:
https://stellar.expert/explorer/testnet/tx/6f9fdefa7cb7d769ea38ca6693acbfd7b9859d2cc9dd7739a0b5b7ef9f7b2dd9

Both saved envelopes were checked independently: distinct user IDs and Stellar
addresses, valid owner signatures, matching transaction sources and hashes, and
fee-bump envelopes. Both browser sessions displayed confirmation. The prerequisite
for two real user signatures and relay receipts is now satisfied. Earlier pending
entries above describe the chronology, not the current gate status.

This validates identity/signing and fee sponsorship only. It does not establish
doctor authorization, patient consent, prescription issuance or a deployed portal.
Those Week 2 integration and validation tasks remain outstanding, as does the
administrator's historical wallet association.

### Administrator wallet cleanup — 9 September 2026

The authorized cleanup was applied to ficha-onchain (`cmrix722m03d30clewd1fuffq`)
only, preserving the administrator user and login methods. The retained native
Stellar wallet is `lxtvax7du51qexxrhrw8a346`, address
`GDGPJH5ZURYU5XRJSPM3AJ6776LMV4FHWP5VTDLQDFSAWJ7R25J763VP`, now permanently
associated in Neon dev. The three specified extra Stellar wallets and the one
specified Ethereum wallet were individually archived using Privy's official API.
Each archived wallet was read back with a populated archived_at; ordinary wallet
reads returned 404. The retained wallet remains readable and unarchived.

Before archiving, the Ethereum wallet showed $0 and no visible transactions in
Privy's supported dashboard activity view. The four removed addresses had no
references in the wallet/address columns audited in Neon dev. No user was deleted,
and no wallet belonging to another user was archived. Doctor and patient bindings
and their two confirmed signing-probe receipts were preserved.

Privy removed the three archived Stellar entries from the user's linkedAccounts,
but retained the archived Ethereum entry as historical metadata. That entry is not
an active wallet; archive status is verified through the wallet API, not inferred
from linkedAccounts alone. TrustLeaf resolves the saved Stellar association and
fails closed if its active wallet cannot be read. Automatic Ethereum and Solana
creation remain off. Archiving retains keys/history; recovery requires Privy.

Detailed per-wallet outcomes are recorded locally in the gitignored
`.trustleaf-local/admin-wallet-cleanup/audit.json`.

The fresh administrator login and sponsored owner-signature test subsequently
passed. The user ID, email/Google login methods, retained wallet ID and Stellar
address remained unchanged. The account has one active Stellar wallet and zero
active EVM wallets; the historical EVM link still resolves to an archived wallet.
No replacement wallet was created during this login. The browser confirmed SUCCESS:
https://stellar.expert/explorer/testnet/tx/5b56c95c7f2adde613ec48ddfdd0ff6934b6e0c1ca9e79b2ee56596af2ea9467

The saved envelope was independently checked for the owner's Stellar signature,
transaction source, transaction hash and relayer fee-bump signature. Administrator,
doctor and patient now have confirmed owner-signing probes. This does not grant
contract administrator permissions to the login wallet; the separate secure local
administrative signer and existing contracts remain unchanged.

### Remaining Stellar duplicates archived — 9 September 2026

The two additional user-authorized duplicate cleanups were completed in
ficha-onchain. For joaco.esteban.r@gmail.com, wallet
`qdq7on4a1n95jz43lk70wl2v` (`GBJDF…MPE7`) was retained and
`c0n87w84e7tdkosk92njaess` was archived. For crwom01@gmail.com, wallet
`ab837gejrgp1iurft3nth53v` (`GD6ON…3FAK`) was retained and
`zv8id76fiy3v4hetiqajbe56` was archived. Both retained associations were saved in
Neon dev before archival.

Preflight revalidated app, users, linked wallets, owners, addresses and absence
of references to the discarded addresses in the audited Neon dev wallet/address
columns. Both networks returned account-not-found for the four Stellar addresses.
Each discarded wallet now has archived_at and returns 404 on ordinary reads;
both retained wallets remain active. The post-operation inventory confirmed six
active Stellar wallets, exactly one per existing user.

All six user identities and non-wallet login methods were preserved. Non-Stellar
linked accounts were unchanged. This operation did not archive EVM wallets and
does not establish that the entire Privy application contains only Stellar.
The administrator, doctor and patient associations were unchanged, and SHA-256
comparisons confirmed that all three approved SUCCESS receipt files were unchanged.
No new signatures, transactions or deployments were performed for this cleanup.
Detailed outcomes are recorded in the gitignored
`.trustleaf-local/duplicate-wallet-cleanup/audit.json`.
