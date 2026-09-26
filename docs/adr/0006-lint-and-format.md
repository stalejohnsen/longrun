# 0006 – Lint and format tooling

Status: Accepted
Date: 2026-09-26

## Context

`CLAUDE.md` requires lint and typecheck to pass before a task is done, and forbids weakening lint rules to get a green build. Much of the code is written by an agent, so consistent formatting keeps diffs small and reviewable.

Facts checked on 2026-09-26:

- Next.js 16 removed `next lint`. The docs set up ESLint's flat config with `eslint-config-next` (`core-web-vitals` and `typescript` presets). For Prettier, they recommend `eslint-config-prettier` ([Next.js ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)).
- `typescript-eslint` 8.70.1, which `eslint-config-next` depends on, supports TypeScript `>=4.8.4 <6.1.0`, while TypeScript 7.0.2 is the `latest` npm tag.
- ESLint 9 reached end of life on 2026-08-06; ESLint 10 is current ([ESLint version support](https://eslint.org/version-support)). `eslint-config-next` 16.3.6 (and its 16.4 canary) depends on `eslint-plugin-react` 7.37, `eslint-plugin-jsx-a11y` 6.10 and `eslint-plugin-import` 2.32, which declare support for ESLint only up to 9. npm therefore resolves ESLint 9.39.5.

## Options

- **(a) ESLint + `eslint-config-next` + Prettier** (with `eslint-config-prettier`): the setup Next.js documents; formatting is separate and deterministic.
- **(b) ESLint only:** fewer dependencies, but no consistent formatting.
- **(c) Biome:** one fast tool for lint and format, but it has none of the Next.js-specific rules from `@next/eslint-plugin-next`.

## Decision

**(a)** Use ESLint (flat config) with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, and Prettier with `eslint-config-prettier`.

- `npm run lint` runs ESLint. `npm run format:check` runs Prettier in check mode. CI runs both.
- Rules may be tightened, never loosened, to pass a build (`CLAUDE.md`).
- **TypeScript is pinned to 6.0.x** until `typescript-eslint` supports 7.x. This is recorded in `docs/lifecycle.md`.
- **ESLint stays on 9 (end of life) for now.** It is a dev-only tool that reads only our own code and never ships. Keeping the full Next.js preset preserves the React and accessibility rules. We considered and rejected two alternatives: ESLint 10 without the Next.js preset, which loses those rules, and forcing ESLint 10 with npm `overrides`, which runs plugins on an unsupported version. Move to ESLint 10 as soon as `eslint-config-next` resolves with it.

## Consequences

- Dev dependencies: `eslint`, `eslint-config-next`, `prettier`, `eslint-config-prettier`.
- Upgrading to TypeScript 7 and to ESLint 10 are tracked maintenance tasks in `docs/lifecycle.md`. They are blocked on `typescript-eslint` and on the React, jsx-a11y and import plugins respectively.
