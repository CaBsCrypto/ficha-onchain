<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in parallel

Several agents work this repo at once, each in its own git worktree on its own
branch. `main` is the shared trunk and the only place foundations change.

| Worktree              | Branch         | Port | Owns                                                        |
| --------------------- | -------------- | ---- | ----------------------------------------------------------- |
| `Dev/ficha-onchain`   | `main`         | 3000 | trunk — foundations, merges                                  |
| `Dev/tl-doctor`       | `feat/doctor`  | 3001 | `app/doctor/**`, `components/doctor/**`, `app/api/doctor/**` |
| `Dev/tl-admin`        | `feat/admin`   | 3002 | `app/admin/**`, `app/api/admin/**`                           |
| `Dev/tl-patient`      | `feat/patient` | 3003 | `app/patient/**`, `components/patient/**`, `components/pain/**`, `app/api/patient*/**` |
| `Dev/tl-ficha`        | `feat/ficha`   | 3004 | `app/patient/ficha/**`, `lib/fhir/**`, `app/api/documents/**` |
| `Dev/tl-contracts`    | `feat/smart-contracts` | 3005 | `contracts/**`, `.github/workflows/contracts.yml` |

## Stay inside your lane

Edit only what your branch owns. If you need something outside it, say so and
let it land on `main` first — do not reach across.

**Shared, `main` only — never edit from a feature branch:**

```
src/lib/db.ts          src/lib/stellar/**     src/types/**
src/components/ui/**   scripts/**             package.json
src/lib/auth/**        AGENTS.md              CLAUDE.md
```

This is not bureaucracy. This repo already carried five drifted copies of
`getDb()`, each with its own error string for the same failure, because the
function was convenient to copy and nobody owned it. Four agents working at once
turn that into four copies a day. If a shared thing is wrong, fix it once on
`main`.

## Database

Every agent gets **its own Neon branch** — never share one. A migration or test
row from one agent otherwise corrupts everyone else's run.

Create it in the Neon console (Branches → New Branch, parent `main`,
**auto-delete: Never**), then put its connection string in your worktree's
`.env.local` as `DATABASE_URL`. `.env.local` is gitignored, so it does not
travel with the worktree — it must be copied and then pointed at your own branch.

Apply schema with `node scripts/migrate.mjs`. It is idempotent. Never point it
at the Neon branch Vercel deploys from.

## Schema changes

`scripts/migrate.mjs` is shared and lives on `main`. Need a table or a column?
Ask; it lands on `main` and everyone rebases. Do not add `CREATE TABLE` inside a
route handler — that is where the schema used to live, and every request paid a
round-trip to re-check tables that already existed.

## Before you push

```
npx tsc --noEmit          # must be 0 errors under src/
git fetch && git rebase origin/main
```

Rebase often. A branch that sits for days is a merge conflict with a due date.

## Facts worth knowing

- **Contracts do not build locally.** WDAC blocks the Rust toolchain (os error
  4551). Soroban work goes through CI (`.github/workflows/contracts.yml`), which
  only runs `cargo test` on three crates — `doctor-registry`,
  `prescription-soulbound`, `trustleaf-e2e` — deliberately, so an unfinished
  contract elsewhere in the workspace cannot redden the badge. It does not deploy.
- **Contract IDs live in `src/lib/stellar/config.ts` and `.env.local`**, both
  outside the contracts lane. A newly deployed contract needs its ID wired in on
  `main`.
- **`@stellar/stellar-sdk` is pinned to v14.** v13 cannot parse protocol 27 —
  every on-chain read throws. v16 breaks `passkey-kit`, which needs `^14.2.0`.
- **`DoctorRegistry`'s admin secret is not in the repo.** `register_doctor`
  cannot be called, so `is_authorized` is false for everyone and `/api/mint`
  degrades to `mode:"simulated"`. Real minting is blocked on this.
- **Vercel env vars are sensitive** — `vercel env pull` returns them empty. Get
  connection strings from the Neon console, not from Vercel.
- **Tests do not run.** `vitest.config.ts` and four suites under `src/__tests__/`
  exist, but vitest is not installed and there is no `test` script.

## Do not

- Push to `main` directly — open a PR.
- Commit a `.env*` file, a connection string, or a secret key.
- Point local dev at the production Neon branch.
- Add a second copy of something that already exists in `src/lib/`.
