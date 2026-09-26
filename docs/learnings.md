# Learnings

Short, durable lessons from working on Longrun. One line each, newest last. `CLAUDE.md` holds the rules; this file holds the lessons behind them.

- Stacked PRs: merge bottom-up and delete each base branch on merge, or GitHub merges the next PR into the old branch instead of `main`. The repository now deletes head branches on merge automatically (2026-09-26).
- Library docs can lag the released package: Kysely's website still showed `Migrator` imported from `kysely`, but 0.29 moved it to `kysely/migration`. Trust a failing test and the package's own exports over examples (2026-09-26).
- Next.js 16 only logs errors thrown from `instrumentation.ts` `register()` and keeps serving; exit explicitly when startup validation fails (2026-09-26).
- GitHub OIDC subjects for repositories created after 2026-07-15 include immutable IDs (`repo:owner@ownerId/repo@repoId:...`). Build federated credential subjects from `gh api repos/OWNER/REPO` IDs, not names; the first deploy failed with AADSTS700213 (2026-09-26).
