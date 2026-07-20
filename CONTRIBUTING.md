<div align="center">

# 🌿 Contributing to TrustLeaf

**Patient-owned medical records on Stellar Soroban.** Thanks for helping build it.

</div>

This is a friendly, human-facing companion to [`AGENTS.md`](./AGENTS.md) — the
canonical dev-process doc. Where the two overlap, `AGENTS.md` wins. Read this
first to get productive; reach for `AGENTS.md` when you need the fine print.

---

## 🚀 Dev setup

```bash
git clone https://github.com/CaBsCrypto/ficha-onchain.git
cd ficha-onchain
npm install
cp .env.example .env.local        # then fill in DATABASE_URL (see below)
node scripts/migrate.mjs          # apply the schema — idempotent, safe to re-run
npm run dev                       # http://localhost:3000
```

**What you need in `.env.local`:**

- **`DATABASE_URL`** — a **Neon Postgres branch** connection string. Point it at
  a **dev** branch, never production (see [Database](#-database)).
- **Signer secrets are optional.** Leave `DEMO_DOCTOR_SECRET` and
  `RELAYER_SECRET` blank and on-chain writes degrade to `mode:"simulated"` — the
  hash isn't anchored, but **every screen still works**. This is *demo mode*, and
  it's the default. Add the secrets only when you want to anchor for real on
  Soroban testnet.

> 💡 You can do almost all product work in demo mode without ever touching a
> signer secret.

---

## 🌿 The branch-per-PR flow

`main` is **protected** — direct pushes are rejected, **even for admins**. The
only way in is a pull request.

```bash
git checkout -b feat/whatever     # one branch per feature
# ...work...
gh pr create                      # opens a PR — Vercel builds a preview automatically
# merge from the PR once checks are green
```

- **One branch per feature, one PR per branch.** Use `feat/…`, `fix/…`, or
  `chore/…` prefixes.
- **Every PR gets its own isolated Vercel preview deploy** with a unique URL —
  that's your staging environment. There is no shared staging branch.
- **Merge from the PR.** No worktrees, no direct commits to `main`.

Running several sessions in this one checkout at once? A checkout can only be on
one branch, so they'll clobber each other's commits. Only then give each session
its own `git worktree` — see `AGENTS.md` for the recipe.

---

## ✅ Before opening a PR

```bash
npx tsc --noEmit                  # must be 0 errors under src/
git fetch && git rebase origin/main
```

**The required check is `typecheck + build`** (the `ci` GitHub Action). It runs
`tsc --noEmit` and a full `next build` on every PR — that is the merge gate.

> ⚠️ **The Vercel check may show as failing — that's expected and it is NOT
> required.** Vercel's Hobby plan has a daily deploy cap; once it's hit, previews
> fail with a 0ms build and no message. Merges deliberately do **not** depend on
> Vercel, which is why the `ci` Action exists. Judge your PR by `typecheck +
> build`.

Fill in the [PR template](./.github/pull_request_template.md) honestly —
especially **How it was verified** ("typechecks" is not verification) and **What
was NOT verified**.

---

## 🧪 Tests

Three suites run against a **local dev server** and exercise the real HTTP API:

```bash
npm run test:phases    # 23/23 — the 8 journey phases, end to end
npm run test:flow      # 13/13 — integrated E2E over the HTTP API
npm run test:onchain   # 11/11 — real Soroban anchoring
```

They rely on **demo passthrough**, so auth enforcement must be **off** while they
run — make sure `TRUSTLEAF_REQUIRE_AUTH` is not set to `true` (its default) in
your local env. With enforcement on, the guarded routes reject the token-less
calls the tests make.

---

## 🗄️ Database

- The schema lives in **`scripts/migrate.mjs` and nowhere else.** It's
  idempotent — re-run it after any schema change.
- **Never add `CREATE TABLE` to a route handler.** That's where schema used to
  live, and every request paid a round-trip to re-check tables that already
  existed.
- **Local dev points at a Neon _dev_ branch**, never production. Writing to the
  prod branch from your machine writes to real data.

Need a throwaway branch (parallel sessions, disposable data)? Create one in the
Neon console from parent `main`, with **auto-delete: Never**.

---

## 📜 Smart contracts

The Soroban contracts (Rust → WASM) live in [`contracts/`](./contracts).

**They do not build locally.** WDAC blocks the Rust toolchain from loading
proc-macro DLLs (`os error 4551`), so `cargo build`/`cargo test` fail on the
maintainer's machine. All contract work goes through the
[`contracts` GitHub Action](./.github/workflows/contracts.yml):

- **`cargo test`** runs on three crates only — `doctor-registry`,
  `prescription-soulbound`, and `clinical-record` (plus the `trustleaf-e2e`
  crate) — deliberately scoped so an unfinished contract can't redden the badge.
- **A deployable, optimized WASM** is produced as a downloadable CI artifact.
  Download it from a run and deploy with the `stellar` CLI — CI does not deploy.

So: iterate on contracts by pushing and reading the Action, not by building
locally.

---

## 🧩 Shared code

Anything reusable lives under **`src/lib/**`** (`db.ts`, `stellar/**`,
`auth/**`, `src/types/**`, `src/components/ui/**`, …).

- **Check `src/lib/` before writing a helper.** This repo once carried **five
  drifted copies of `getDb()`**, each with its own error string for the same
  failure, because copying was easier than looking for the original.
- **Change shared code deliberately** — in its own commit, knowing everything
  depends on it.

---

## 🚫 Don't

- ❌ **Push to `main`.** It's protected and will reject you — open a PR.
- ❌ **Commit any `.env*` file, connection string, or secret key.**
- ❌ **Point local dev at the production Neon branch.**
- ❌ **Add a second copy of something already in `src/lib/`.**
- ❌ **Add `CREATE TABLE` to a route** — schema changes go only in
  `scripts/migrate.mjs`.

---

<div align="center">

Questions the guide doesn't answer? Check **[`AGENTS.md`](./AGENTS.md)** for the
full process detail. Happy shipping. 🌿

</div>
