<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# How work lands here

One branch per feature, one PR per branch. `main` is protected: direct pushes
are rejected, the Vercel build must pass, and it applies to admins too.

```
git checkout -b feat/whatever
# work
gh pr create            # preview builds automatically, with its own URL
# merge from the PR
```

Nothing else. No worktrees, no staging branch — every PR already gets an
isolated preview deploy, which is what a staging environment would have been
for.

Branches that exist but are unstarted: `feat/doctor`, `feat/admin`,
`feat/patient`, `feat/ficha`, `feat/smart-contracts`, `feat/diario-de-dolor`.

## If several sessions run at once

A checkout can only be on one branch, so two sessions in this folder will fight:
one runs `git checkout`, and the other's commits silently land on the wrong
branch. That already happened once here.

Only then, give each session its own worktree:

```
git worktree add ../tl-doctor feat/doctor
```

Costs ~1.5 GB (its own `node_modules`), needs `.env.local` copied in — it is
gitignored and does not travel — and a distinct port in `.claude/launch.json`.
Remove it when done: `git worktree remove ../tl-doctor`. Create on demand, not
in advance.

## Shared code

```
src/lib/db.ts          src/lib/stellar/**     src/types/**
src/components/ui/**   scripts/**             package.json
src/lib/auth/**        AGENTS.md              CLAUDE.md
```

Changing shared code is fine — just do it deliberately, in its own commit, and
know that everything depends on it.

This repo already carried five drifted copies of `getDb()`, each with its own
error string for the same failure, because the function was convenient to copy
and nobody looked for the original. Before writing a helper, check whether
`src/lib/` already has it.

## Database

`DATABASE_URL` in `.env.local` points at a Neon **dev branch**
(`ep-lingering-water-ahzh89z5`), not the one Vercel deploys from. Keep it that
way.

Apply schema with `node scripts/migrate.mjs` — idempotent, safe to re-run. The
schema lives there and nowhere else. Do not add `CREATE TABLE` to a route
handler: that is where it used to live, and every request paid a round-trip to
re-check tables that already existed.

Need a new Neon branch (parallel sessions, throwaway data)? Neon console →
Branches → New Branch, parent `main`, **auto-delete: Never**.

## Before opening a PR

```
npx tsc --noEmit          # must be 0 errors under src/
git fetch && git rebase origin/main
```

The Vercel build runs `tsc` too, so a type error blocks the merge either way.

## Facts worth knowing

- **Contracts DO build locally** — with `stellar contract build` (target
  `wasm32v1-none`), not `cargo build --target wasm32-unknown-unknown`: newer Rust
  enables `reference-types` and the Soroban host rejects that WASM. An earlier
  version of this file claimed WDAC blocked the toolchain (os error 4551); that
  is no longer true and cost a whole PR built around the wrong assumption.
  `cargo test` runs in CI (`.github/workflows/contracts.yml`) over the four SOW contracts — `doctor-registry`, `prescription-soulbound`, `clinical-record`, `document-soulbound` — plus `trustleaf-e2e`. It does not deploy.
- **`@stellar/stellar-sdk` is pinned to v14.** v13 cannot parse protocol 27 —
  every on-chain read throws `Bad union switch: 1`. v16 breaks `passkey-kit`,
  which needs `^14.2.0`.
- **Real minting WORKS.** The demo doctor is registered in `DoctorRegistry`
  (`is_authorized=true`) and `/api/mint` produces real transactions — verify with
  `npm run test:onchain`, which checks all four contracts against testnet. An
  earlier version of this file claimed the registry admin key was lost and that
  "real minting is blocked on this"; that is stale and, like the WDAC claim
  above, is the kind of thing that gets planned around instead of tested. **Run
  the script before believing any on-chain claim in this file.** What is true:
  we do not hold the registry's admin key
  (`GB2PFKB24QPIEB3VIKYTIEG7M4KRH5I4KBPV26LUC6KOE2YAWSCPXKZ6`), so we cannot
  register *new* doctors — only the already-registered demo doctor can mint.
- **Contract IDs live in `src/lib/stellar/config.ts` and `.env.local`.** A newly
  deployed contract needs its ID wired in.
- **Production's Neon branch is migrated** (as of the profiles/booking/ficha
  work). `scripts/migrate.mjs` was run against the prod branch
  (`ep-rapid-shadow-ahq94785`), so `doctor_availability`, `doctor_time_off`, the
  Meet columns, the profile columns and `clinical_entries` all exist there. The
  script is idempotent — re-run it after adding schema.
- **Auth enforcement is a flag.** Guarded routes (the `withAuth` ones and the
  `resolveOwnerEmail` ones — `doctor/availability`, `doctor/patients`) accept
  token-less calls in demo mode so the flow tests and demo work. Set
  `TRUSTLEAF_REQUIRE_AUTH=true` (or `NEXT_PUBLIC_PASSKEY_ENABLED=true`) in prod to
  reject anonymous callers; with a token they already enforce owner-only access.
  `DEMO_DOCTOR_SECRET` + `RELAYER_SECRET` are NOT in Vercel, so on-chain mint /
  ficha-append degrade to simulated in the deploy until they are added.
- **Previews share production's `DATABASE_URL`.** A preview that writes, writes
  to production.
- **Vercel env vars are sensitive** — `vercel env pull` returns them empty. Get
  connection strings from the Neon console, not from Vercel.
- **Privy app is `ficha-onchain` (`cmrix722m…`)**, not `SalesAgent` — that one
  is a different project of the owner's. `allowed_domains` is deliberately empty:
  filling it in breaks preview deploys, whose URL changes every build.
- **Tests run: `npm test`** (vitest, suites under `src/__tests__/`). They are wired into `.github/workflows/ci.yml` alongside typecheck and build.
- **The 3D body map loads THREE r128 from a CDN**, not from npm, as UMD scripts.
  `BodyMap3D.tsx` hand-rolls its own THREE type declarations because of it.
- **`public/models/` holds only `body_1k.glb`**, the model `BodyMap3D.tsx`
  loads. Four unused GLBs (~19 MB) were deleted in the dead-code cleanup; do not
  re-add variants without wiring them in.

## The external MCP (`/api/mcp`)

A JSON-RPC 2.0 endpoint that lets authorized medical centers anchor clinical
artifacts into a patient's on-chain record. Hand-rolled, no SDK.

- **Model:** 1 patient = 1 ficha, keyed by `rut_hash` = HMAC-SHA256 of the
  normalized RUT under `TRUSTLEAF_RUT_PEPPER`. 1 center = N fichas, each gated by
  that patient's consent. `src/lib/identity/` holds the whole thing.
- **Tables:** `patient_records`, `api_orgs`, `api_keys`, `center_doctors`,
  `center_grants`. They live in **two** places — `scripts/migrate.mjs` (dev,
  source of truth) and `src/app/api/admin/migrate/route.ts` (the only way to
  migrate prod, whose connection string Vercel will not hand out). Change one,
  change the other.
- **Env vars:** `TRUSTLEAF_RUT_PEPPER`, `SANDBOX_OWNER_SECRET`,
  `SANDBOX_CENTER_SECRET`, `MCP_LIVE_ENABLED` (kill-switch: `live` keys are
  rejected while it is off).
- **`live` writes nothing on-chain yet** — only `sandbox` signs. A `live`
  consent records `pending`; a `live` anchor returns `reason:"live_not_enabled"`.
- **`kind` is the only caller-supplied field that is readable on-chain**, so it
  is a closed list in `route.ts` (`ALLOWED_KINDS`). Never widen it to free text:
  the record contract is 1:1 with a person, and a diagnosis in there is a
  permanent public disclosure.
- **Sandbox consent is machine-issued** — nobody is asked. Every response says so
  via `consentSource:"auto_sandbox"`, independent of `mode`.
- Before adding a tool: it must declare `requiresAuth` **and** a `scope`, or the
  gate denies it. Verify with `npm test` and `npm run smoke:sandbox`.

## Do not

- Push to `main` — it is protected and will reject you. Open a PR.
- Commit a `.env*` file, a connection string, or a secret key.
- Point local dev at the production Neon branch.
- Add a second copy of something that already exists in `src/lib/`.

## Imported Claude Cowork project instructions
