# 0004 – Database driver, query layer and migrations

Status: Accepted
Date: 2026-09-26

## Context

Longrun stores components in Azure Database for PostgreSQL Flexible Server. `CLAUDE.md` requires:

- parameterized queries only;
- all schema changes as migrations in `migrations/`, never editing an applied one;
- backward-compatible (expand/contract) migrations so the previous app version keeps working during a slot swap;
- managed identity for database access (no passwords);
- least privilege for every identity;
- integration tests against real Postgres.

The data model is small: components with name, version, where used, owner, and an end-of-support date that is looked up or entered manually. It is not expected to grow much.

Facts checked on 2026-09-26:

**Entra authentication**

- The access token is used as the Postgres password. It is requested for `https://ossrdbms-aad.database.windows.net/.default` and is **valid for 5–60 minutes**, so a connection pool must fetch a fresh token for each new connection ([Entra auth](https://learn.microsoft.com/en-us/azure/postgresql/security/security-entra-configure), [managed identity](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity)).
- The server can be set to **Microsoft Entra authentication only** (password auth disabled).
- The Entra admin role has elevated rights and should not be used for regular operations.

**Driver and query-layer packages (npm)**

| Package                       | Version                             | Direct deps | Notes                                                                                                                                                            |
| ----------------------------- | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg` (node-postgres)          | 8.23.0                              | 6           | `password` can be a function ([docs](https://node-postgres.com/apis/client))                                                                                     |
| `postgres` (postgres.js)      | 3.4.9                               | 0           | password can be a sync or async function called at connect time                                                                                                  |
| `kysely`                      | 0.29.6                              | 0           | type-safe SQL query builder; built-in `Migrator` that takes a database-level lock so concurrent runs are serialized ([docs](https://kysely.dev/docs/migrations)) |
| `drizzle-orm` / `drizzle-kit` | 0.45.3 / 0.31.11                    | 0 / 4       | 1.0 is at release candidate (`1.0.0-rc.5`), so a major upgrade is imminent; kit generates SQL migrations from a TypeScript schema                                |
| `prisma` / `@prisma/client`   | 8.0.0-rc.17 (`latest` tag) / 7.10.0 | 12 (CLI)    | the CLI's `latest` npm tag currently points at a release candidate; the CLI pulls in cloud/management SDKs                                                       |
| `node-pg-migrate`             | 9.0.0                               | 3           | SQL or JS migrations on top of `pg`                                                                                                                              |
| `@azure/identity`             | 4.13.3                              | 12          | official token acquisition with managed identity (Node ≥ 22)                                                                                                     |

## Options

### A. `pg` + Kysely (query builder) + Kysely `Migrator`

- Pros:
  - SQL stays visible, and queries are parameterized by construction.
  - Type-checked queries.
  - Zero-dependency query builder, and the migrator is built in with locking.
  - `pg` `Pool` with an async `password` function handles token refresh.
  - Hand-written migrations make expand/contract steps explicit, not generated.
- Cons:
  - Pre-1.0: 0.30 is in beta, so expect a breaking minor release.
  - Database types are written by hand (or generated later with `kysely-codegen`).
  - Migrations are TypeScript files. Loading them with Node's built-in type stripping is to be verified in the skeleton.

### B. `pg` + Drizzle ORM + drizzle-kit migrations

- Pros:
  - Popular with Next.js and schema-as-code in TypeScript.
  - Generated SQL migration files are reviewable.
  - Realistic maintenance experience (the 1.0 upgrade is coming).
- Cons:
  - Generated migrations can turn a rename into drop-and-add, so every generated file must be reviewed for expand/contract safety.
  - drizzle-kit brings `esbuild` and `tsx`.
  - A major release is imminent; the 1.0 release candidate changes migration strategy and casing.

### C. Prisma ORM + Prisma Migrate (rejected)

- Rejected because:
  - Largest toolchain.
  - The CLI's `latest` tag currently points at a release candidate.
  - Its own schema language.
  - Auto-generated migrations have the same expand/contract caveat as B.
  - It is far more than a single-table app needs.

### D. `pg` only with hand-written SQL + `node-pg-migrate` (plain SQL files)

- Pros: fewest concepts and transparent SQL; migrations are plain `.sql` files.
- Cons:
  - No type checking between queries and schema; row types are mapped by hand.
  - `node-pg-migrate` adds a CLI dependency tree (`yargs`, `glob`, `jiti`).

### E. postgres.js instead of `pg` (rejected as driver)

- Pros: zero dependencies and good ergonomics.
- Rejected because Kysely, Drizzle and `node-pg-migrate` target `pg` first. Using two drivers, or a less common pairing, adds risk for little gain.

## Decision

**A: `pg` + Kysely + the Kysely `Migrator`**, with `@azure/identity` for tokens.

- **Driver:** a single `pg` `Pool`. In Azure, `password` is an async function returning a token from `ManagedIdentityCredential` (the slot's user-assigned identity). `@azure/identity` caches and refreshes tokens. TLS is required (`ssl` with certificate verification).
- **Queries:** Kysely only. Raw SQL is allowed only through Kysely's `sql` template tag, which parameterizes values. String-built SQL is forbidden, as `CLAUDE.md` requires.
- **Types:** a hand-written `Database` interface in `src/db/`. `kysely-codegen` is considered later, and would need its own justification.
- **Migrations:**
  - TypeScript files in `migrations/`, named with an ISO timestamp and run in order.
  - Only `up` is used in production. `down` is written for tests only; rollback means deploying the previous app version, which expand/contract keeps working.
  - Each migration must be backward compatible with the currently deployed app, and the PR states which expand/contract phase it is.
- **Database roles (least privilege):**
  - `longrun_migrator`: owns the schema and runs DDL. Used only by the migration job.
  - `longrun_app`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on application tables only, no DDL. Mapped to both slots' app identities, because both slots use the same database and managed identities don't swap.
  - The Entra admin is used only for one-time bootstrap (creating the roles above), described in a runbook.
- **Where migrations run:** a CI job **before** deploying to the staging slot, as `longrun_migrator`, authenticated with the pipeline's Entra identity (GitHub OIDC). The app never runs migrations at startup, because that would require DDL rights for the app identity.
- **Server:** Entra-only authentication (password auth disabled).
- **Local and tests:** Testcontainers Postgres with a generated local password. The token path is used only when running in Azure. Configuration is validated at startup, and production refuses a static password.

## Consequences

### Runtime dependencies

`pg`, `kysely` and `@azure/identity` (12 direct dependencies of its own). Each goes into `docs/lifecycle.md` where a support end date exists; Kysely has no published policy, so we watch its 0.x releases.

### Tests

- **Integration tests** (ADR 0003) run all migrations on a fresh container, then exercise queries.
- A test checks that every migration applies cleanly on top of the previous schema.
- A test checks that `longrun_app` cannot run DDL.

### Network (infrastructure phase)

The CI migration job must reach the database. Options (temporary firewall rule for the runner, private networking with a self-hosted runner, or a job running inside Azure) are decided in the infrastructure phase. They need explicit approval.

### Entra and role changes

Mapping identities to database roles (`pgaadauth_create_principal…`) and granting the pipeline identity access are role assignments. They need explicit approval and a runbook.

### Verified in the skeleton task (PR B)

- **Loading `.ts` migrations with Node 24 type stripping works.** `node scripts/migrate.ts` runs against a real Postgres in `test/db/migrate.int.test.ts`.
  - Since Kysely 0.29, `Migrator` and `FileMigrationProvider` are exported from `kysely/migration`, not `kysely`.
  - On Windows, migration files must be imported via `file://` URLs (a custom `import` function).
- **`pg` calls an async `password` function once per new client**, and `Pool` creates a new client for each connection (`test/db/pool.int.test.ts`). The resolved password is cached on that client, so connections are recycled after 30 minutes (`maxLifetimeSeconds`), well within the token lifetime.
- Still open (infrastructure phase): the exact functions for mapping a managed identity to a Postgres role.

## Follow-up

- Validation library ADR (also used to validate configuration and rows from external APIs).
