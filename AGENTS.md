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

- **Contracts do not build locally.** WDAC blocks the Rust toolchain (os error
  4551). Soroban work goes through CI (`.github/workflows/contracts.yml`), which
  runs `cargo test` on three crates only — `doctor-registry`,
  `prescription-soulbound`, `trustleaf-e2e` — deliberately, so an unfinished
  contract elsewhere cannot redden the badge. It does not deploy.
- **`@stellar/stellar-sdk` is pinned to v14.** v13 cannot parse protocol 27 —
  every on-chain read throws `Bad union switch: 1`. v16 breaks `passkey-kit`,
  which needs `^14.2.0`.
- **`DoctorRegistry`'s admin secret is not in the repo.** Its admin is
  `GB2PFKB24QPIEB3VIKYTIEG7M4KRH5I4KBPV26LUC6KOE2YAWSCPXKZ6`. `register_doctor`
  cannot be called, so `is_authorized` is false for everyone and `/api/mint`
  degrades to `mode:"simulated"`. **Real minting is blocked on this** — the fix
  is redeploying the registry with an admin whose key we hold.
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
- **Tests do not run.** `vitest.config.ts` and four suites under `src/__tests__/`
  exist, but vitest is not installed and there is no `test` script.
- **The 3D body map loads THREE r128 from a CDN**, not from npm, as UMD scripts.
  `BodyMap3D.tsx` hand-rolls its own THREE type declarations because of it.
- **`public/models/` holds five GLBs, only `body_1k.glb` is used.** The other
  four are ~18 MB of dead weight; `body_final.glb` and `body_opt.glb` are
  smaller only because their textures were stripped, so they are not drop-in
  replacements.

## Do not

- Push to `main` — it is protected and will reject you. Open a PR.
- Commit a `.env*` file, a connection string, or a secret key.
- Point local dev at the production Neon branch.
- Add a second copy of something that already exists in `src/lib/`.
