# Hosted Testnet worker (preparation only)

This image runs the existing administration and booking queues as one long-lived Background Worker. The web remains on Vercel. Patient and doctor signatures remain in Privy. No hosting, secret transfer, cutover or new transaction is performed by this PR.

## Build and run

Linux amd64; Node 22.22.0, Stellar CLI 27.0.0 (download SHA-256 checked), locked npm runtime dependencies. The image runs as `node`, not root. Only the explicitly allowed scripts and dependency manifests enter the build context. No application source, evidence, video, `.env*`, key or `.trustleaf-local` directory is included.

```sh
docker build --platform linux/amd64 -f infra/worker/Dockerfile -t trustleaf-worker:test .
# Supply configuration through your runtime secret manager, never build arguments.
# Mount the authority secret read-only at /etc/secrets/authority-testnet.
docker run --rm --env-file /secure/runtime.env \
  --mount type=bind,src=/secure/authority-testnet,dst=/etc/secrets/authority-testnet,readonly \
  trustleaf-worker:test --once
```

Default command is `--watch`; `--once` performs one queue cycle. Both require valid configuration and exclusive ownership. `--once` exits without processing when another instance owns the lock. Watch mode retries every three seconds and reports waiting, not readiness. Do not copy a real runtime env file into this repository. The mounted key must be readable by the container's non-root user and unavailable to unrelated users. Do not put a key in a command argument, Dockerfile, image, build log or Blueprint.

## Configuration

`render.example.yaml` is an inert template, not an instruction to deploy. Create a **Background Worker**, not a web service, from an approved commit. Keep automatic deployment off and exactly one instance. Render secret files are mounted at `/etc/secrets/<filename>`; create `authority-testnet` only during the separately approved hosting stage.

| Setting | Requirement |
| --- | --- |
| `DATABASE_URL` | TLS Neon **direct** URL, never the `-pooler` endpoint. This dedicated session holds the advisory lock. |
| `TRUSTLEAF_DB_HOST` | Exact hostname of that URL. |
| `TRUSTLEAF_AUTHORITY_DATABASE_HOST` | The single approved database host bound operationally to this authority. Must match the URL. |
| `TRUSTLEAF_AUTHORITY_DATABASE_NAME` | Exact logical database name on that host; must match the URL path. |
| `TRUSTLEAF_ENV` | Existing guard: `test` for hosted Testnet demo, `preview` for an isolated preview; `local` is restricted to the existing dev host. This is not a Mainnet deployment mode. |
| `STELLAR_NETWORK` | Exactly `testnet`. RPC and signing passphrase remain pinned to Stellar Testnet. |
| `TRUSTLEAF_SIGNER_MODE` | `secret-file` for hosting. Default `local` retains the CLI secure-store alias. |
| `TRUSTLEAF_AUTHORITY_SECRET_FILE` | Runtime mount path; a single Stellar secret seed, trimmed, matching the configured authority. |
| `DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY`, `BOOKING_AUTHORITY_PUBLIC_KEY` | Same approved public authority. |
| `DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID`, `PRESCRIPTION_PRIVATE_CONTRACT_ID` | Existing pinned private contracts; startup rejects other IDs. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Existing ficha-onchain app and server credential. |
| `RELAYER_SECRET` | Runtime secret of the existing fee payer; never an image value. |
| `TRUSTLEAF_DATA_KEY` | Existing encryption key for that database, supplied at runtime. |
| `TRUSTLEAF_PRIVATE_WRITES_ENABLED` | Defaults to `false`. Enable only during approved cutover. |
| `STELLAR_CONFIG_DIR` | Writable local lock directory; image default `/app/runtime`. Local mode also requires `DOCTOR_REGISTRY_ADMIN_ALIAS`. |

The secret-file signer signs only an unsigned, single invoke-host-function envelope from the configured authority, under the Testnet passphrase. Existing queue adapters enforce contract, method, arguments, identity and eligibility before invoking it. It does not expose a signing endpoint.

**One authority, one writable database.** Advisory locks coordinate PC and server only when they connect to the same database. Host equality is an explicit configuration check, not a global registry: changing both hostname variables can defeat an operator's intended binding. Never reuse this authority in another writable database. Isolated testing must use unrelated throwaway identities. No schema or global authority registry is introduced here.

## Exclusivity, interruption and recovery

The process first acquires the local filesystem lock, then a session-level PostgreSQL advisory lock named from the authority. A direct, dedicated client must keep that lock for its entire lifetime. It never reconnects silently. Lock ownership is checked before preparation, signing and transmission; lost ownership or a connection error stops new work and makes the guard permanently unusable. Release happens during shutdown.

SIGINT/SIGTERM abort lock-wait sleeps, prevent subsequent guarded signing/transmission, and allow current awaited work to settle before releasing resources. Configure a sufficient termination grace period. An RPC already transmitted when the connection or process fails cannot be recalled. This is not an exactly-once network guarantee: persisted envelopes and transaction hashes are reconciled, and the same envelope may be resubmitted only under existing recovery rules. An uncertain attempt must never be replaced by a freshly signed operation.

`TRUSTLEAF_PRIVATE_WRITES_ENABLED=false` prevents preparation and transmission, **but is not database read-only**. Existing signed attempts may still be claimed, looked up on chain and reconciled into the database, and leases/notes may change. For a strictly read-only preflight, do not run the worker: inspect configuration, balances, existing transactions and queues using read-only tools. Never use a paused worker to promise unchanged main data.

## Logs and supervision

Structured records contain timestamps, queue/status and safe booleans, not emails, documents, seeds, URLs or provider error bodies:

- `waiting_for_local_lock` / `waiting_for_lock`: alive but not processing; investigate an unexpected wait instead of deleting locks.
- `ready`: configured and lock acquired; not proof that a transaction or provider is healthy.
- `cycle_ok`: emitted at most once per minute after successful guard/cycle checks; not a transaction confirmation.
- Queue outcomes such as `submitted`, `confirmed`, `writes_paused`, `needs_reconciliation`: interpret separately. A healthy process can still have a queue requiring intervention.
- `stopped`, or the generic failure line: inspect configuration and persisted attempts through approved tools; do not print raw secrets to debug.

During hosting stage configure alerts for unexpected process exit, prolonged lock waiting, missing heartbeats (for example over three minutes), and repeated reconciliation outcomes. Verify contract configuration, authority, relayer balance and RPC independently before enabling writes. Render lifecycle logs alone do not prove queue health. No public health route is added.

## Tests and preparation gate

`npm run test:private` includes new synthetic-key signer and lock lifecycle tests plus existing uncertain-RPC/envelope-reuse and writes-disabled regressions. They do not exercise live Privy or create Stellar transactions.

The `hosted-worker` workflow additionally uses an ephemeral loopback PostgreSQL service to demonstrate real session exclusion, loss and takeover, builds the Docker image, checks CLI/runtime/non-root permissions and payload, runs synthetic signer and real SIGTERM tests inside it, and checks safe startup rejection without credentials. The local Docker engine was unavailable during initial preparation; **container and PostgreSQL acceptance requires the workflow to pass**, not merely the unit tests.

The minimal dependency lock preserves existing SDK/Privy versions. Its audit currently reports 7 inherited findings (5 moderate, 2 high), including transitive TOML, stream-json and uuid advisories. The worker does not call Stellar TOML discovery or Solana JSON-RPC, but this does not constitute a completed reachability audit. Do not run `npm audit fix --force`: suggested SDK/Privy changes cross compatibility boundaries. Review and disposition these findings before real hosting; this PR does not claim a vulnerability-free image.

## Future cutover (separate approval)

1. Select reviewed commit and hosting account/plan; confirm cost and secret ownership. Audit the newly recorded video separately.
2. Inspect queues and uncertain attempts read-only. Reconcile any uncertainty under the existing worker, without new signatures.
3. Stop the local worker gracefully after in-flight work settles. Confirm process exit and database lock release. Keep its configuration intact for rollback.
4. Provision runtime secrets only in the approved service, verify direct DB/authority binding and relayer balance. Start one hosted instance with writes disabled; remember reconciliation can still update rows.
5. Confirm lock ownership, safe logs, recovery behavior and one active process. Explicitly enable writes only after those checks and approved operational readiness.
6. Observe subsequent intended operations, receipts and final queue state; never generate clinical transactions solely to test Docker.

Rollback: disable/reconcile pending work as appropriate, stop the hosted instance, confirm it has released its database session, then restart the local worker against the same approved database. Never run both actively across different databases, erase attempts, or restore a database to undo infrastructure changes.

References: [Render background workers](https://render.com/docs/background-workers), [secret files](https://render.com/docs/configure-environment-variables#secret-files), [Stellar CLI release](https://github.com/stellar/stellar-cli/releases/tag/v27.0.0).
