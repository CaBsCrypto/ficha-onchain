## What this changes

<!-- One paragraph. What behaviour is different after this merges? -->

## Why

<!-- The problem. Not "improve X" — what was actually wrong or missing. -->

## How it was verified

<!-- Be specific and honest. "Typechecks" is not verification: it means the code
     compiles, not that it works. Say what you actually ran and saw.

     Good:  "Booked a slot against a Neon dev branch; it disappeared from the
             patient view and appeared in the doctor's agenda."
     Bad:   "Tested and works."                                            -->

- [ ] `npx tsc --noEmit` — 0 errors under `src/`
- [ ] Exercised in the browser / against a real service (say which, below)
- [ ] Vercel preview build is green

## What was NOT verified

<!-- Required. Every change has an untested edge. Say which one, so the
     reviewer knows where to look instead of assuming it is all covered. -->

## Lane check

- [ ] Only touches paths this branch owns (see the table in `AGENTS.md`)
- [ ] Does not add a second copy of something already in `src/lib/`
- [ ] No schema changes outside `scripts/migrate.mjs`
- [ ] No secrets, connection strings or `.env*` files in the diff
