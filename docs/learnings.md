# Learnings

Short, durable lessons from working on Longrun. One line each, newest last. `CLAUDE.md` holds the rules; this file holds the lessons behind them.

- Stacked PRs: merge bottom-up and delete each base branch on merge, or GitHub merges the next PR into the old branch instead of `main`. The repository now deletes head branches on merge automatically (2026-09-26).
- Library docs can lag the released package: Kysely's website still showed `Migrator` imported from `kysely`, but 0.29 moved it to `kysely/migration`. Trust a failing test and the package's own exports over examples (2026-09-26).
- Next.js 16 only logs errors thrown from `instrumentation.ts` `register()` and keeps serving; exit explicitly when startup validation fails (2026-09-26).
