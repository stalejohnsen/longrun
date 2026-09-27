# Architecture decision records

Each ADR records one decision: context, options with trade-offs, the decision and its consequences. Changing a decided item in the stack (see `CLAUDE.md`) requires a new ADR that supersedes the old one.

File name: `NNNN-short-title.md`. Status: `Proposed`, `Accepted`, `Superseded by NNNN` or `Rejected`.

## Index

| ADR                                                 | Title                                                                                                  | Status   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-web-framework-and-rendering.md)         | Web framework and rendering approach (Next.js, server-rendered first)                                  | Accepted |
| [0002](0002-authentication-mechanism.md)            | Authentication mechanism (App Service built-in auth, secretless)                                       | Accepted |
| [0003](0003-test-runner.md)                         | Test runner and test levels (Vitest, Testcontainers, Playwright)                                       | Accepted |
| [0004](0004-data-access-and-migrations.md)          | Database driver, query layer and migrations (pg, Kysely, Kysely Migrator)                              | Accepted |
| [0005](0005-validation-library.md)                  | Validation library (Zod 4)                                                                             | Accepted |
| [0006](0006-lint-and-format.md)                     | Lint and format (ESLint 9 with Next.js presets, Prettier; TypeScript 6.0)                              | Accepted |
| [0007](0007-infrastructure-and-deployment.md)       | Infrastructure layout and deployment (bootstrap + main Bicep, P0v3, B1ms, public access with firewall) | Accepted |
| [0008](0008-dependency-updates-and-supply-chain.md) | Dependency updates and supply-chain security (Dependabot, public repository, zizmor, CodeQL)           | Proposed |
