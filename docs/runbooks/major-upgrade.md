# Runbook: major upgrade

For a new major version of the runtime, the framework, the database or a held tool. One upgrade per PR. A major upgrade stays inside the decided stack (`CLAUDE.md`), so it needs no ADR; replacing a component does.

## Common steps

1. **Check support.** Read the official upgrade guide and support policy. Check that every dependency that matters supports the new version (peer dependencies, `engines`, the platform).
2. **Branch and upgrade.** Claude changes every place that names the version (lists below), reads the breaking changes, and fixes code, tests and config. Each fix is its own commit with the reason in the message.
3. **Run everything locally:** `npm run lint`, `npm run typecheck`, `npm run test:all`.
4. **PR.** The description lists the breaking changes that applied, what changed and what was checked. `docs/lifecycle.md` is updated in the same PR. CI must be green without weakening anything.
5. **Merge and deploy.** On the staging slot, the owner clicks through the main flows (list, register, edit, end-of-support view) before approving the swap.
6. **Rollback** is the swap back (`rollback.md`). It also reverts the Node.js runtime, because the runtime is swapped with the slot.
7. **Record** the upgrade in `docs/maintenance-log.md`, including how much the agent had to change and whether anything broke later.

## Node.js (for example 24 → 26)

Dependabot does not propose this. The trigger is the monthly review and `docs/lifecycle.md` (Node 26 LTS from 2026-10-28; Node 24 end of life 2028-04-30).

1. **App Service must offer the runtime.** The deploy workflow derives `NODE|<major>-lts` from `.node-version`. Check the exact string:

   ```sh
   az webapp list-runtimes --os-type linux -o tsv | grep -i node
   ```

   On 2026-09-27 the list had `NODE:26` but no `NODE:26-lts` yet. Wait until the `-lts` entry exists, or change the derivation in `deploy.yml` (step "Resolve runtime versions") in the same PR, with a reason.

2. **Change every place:**
   - `.node-version`
   - `package.json` `engines`
   - `@types/node` (to the new major), and remove its `ignore` entry in `.github/dependabot.yml`
   - `CLAUDE.md` (Commands: "Requires Node …")
   - `docs/lifecycle.md`, and `docs/runbooks/local-development.md` if it names the version

   CI picks up the new version from `.node-version`.

3. **Deploy.** The staging slot gets the new runtime; production keeps the old one until the swap (spec 0002 step 3). The run log shows both values in "Resolve runtime versions". Review staging, approve, and check afterwards:

   ```sh
   WEB_APP=$(az webapp list -g rg-longrun --query "[0].name" -o tsv)
   az webapp config show -g rg-longrun -n "$WEB_APP" --query linuxFxVersion -o tsv                  # production
   az webapp config show -g rg-longrun -n "$WEB_APP" --slot staging --query linuxFxVersion -o tsv   # old runtime until the next deploy
   ```

## Next.js (for example 16 → 17)

Dependabot opens the major as its own PR. It never auto-merges and will usually fail CI.

1. Read the official upgrade guide for the new version. The official codemod may be run locally (`npx @next/codemod@<version> upgrade`). It is not added as a dependency, and its changes are reviewed like any other code.
2. Upgrade `react`, `react-dom`, `eslint-config-next` and `@types/react*` together when the guide requires it.
3. Check the things Longrun relies on (ADR 0001): App Router, server actions with `useActionState`, `proxy.ts`, standalone output, nonce CSP.
4. The end-to-end tests run against the production build; they are the main safety net here.

## PostgreSQL (for example 17 → 18)

This changes the production server in place. There is no slot for the database, so this is the riskiest upgrade.

1. Check that Azure Database for PostgreSQL Flexible Server supports the target version for in-place major version upgrade ([Microsoft docs](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-major-version-upgrade)). Do not rely on the CLI's list of allowed values; it lags behind.
2. First PR: move the Testcontainers image (`test/helpers/postgres.ts`) to the new major, and run all integration and end-to-end tests.
3. Second PR: the version in `infra/main` Bicep, following Microsoft's documented procedure (including the pre-upgrade checks and backup). The owner reviews the what-if before approving. Plan it for a quiet time, because the server restarts.
4. Update `docs/lifecycle.md`.

## Held tools (TypeScript 7, ESLint 10)

These are held by upstream support (ADR 0006). The monthly review checks whether `typescript-eslint` supports TypeScript 7 and whether the `eslint-config-next` plugins support ESLint 10. When one is unblocked, remove its `ignore` entry in `.github/dependabot.yml`. Dependabot then proposes the major, and it follows the common steps above.
