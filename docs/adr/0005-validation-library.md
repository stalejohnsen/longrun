# 0005 – Validation library

Status: Accepted
Date: 2026-09-26

## Context

`CLAUDE.md` requires validating all external input with a schema at the boundary (HTTP, external APIs, config), and treating endoflife.date data as untrusted. Earlier ADRs add specific boundaries:

- **Server actions and route handlers** (ADR 0001). The Next.js docs warn to verify auth inside every server action, and form data arrives as untyped `FormData` whose values can be strings or files.
- **The App Service identity header** `X-MS-CLIENT-PRINCIPAL`: Base64 JSON (ADR 0002).
- **Configuration at startup:** environment and app settings, including the rule that production refuses a static database password (ADR 0004).
- **endoflife.date API responses:** external and untrusted.

The library must give TypeScript types from the schema, so validated data and types cannot drift. It must also produce per-field errors for forms.

Facts checked on 2026-09-26:

- The Next.js forms guide names **Zod** or **Valibot** for server-side validation in server actions ([Next.js forms](https://nextjs.org/docs/app/guides/forms)). Its example uses Zod 3 APIs (`invalid_type_error`, `.flatten()`). Zod 4 removed the first and deprecated the second in favour of `z.treeifyError()` ([Zod 4 changelog](https://zod.dev/v4/changelog)). **We follow the Zod 4 API, not the Next.js snippet.**
- Versions and direct runtime dependencies (npm):

| Package   | Version | Direct deps |
| --------- | ------- | ----------- |
| `zod`     | 4.6.5   | 0           |
| `valibot` | 1.5.0   | 0           |
| `arktype` | 2.2.5   | 3           |
| `typebox` | 1.3.34  | 0           |

## Options

### A. Zod 4

- Pros:
  - Named in the Next.js docs.
  - The most widely used TypeScript schema library, so examples, agent familiarity and ecosystem support are highest.
  - Zero dependencies.
  - Types are inferred from schemas.
  - Error formatting helpers for per-field form errors.
- Cons:
  - Larger than Valibot. This hardly matters here, because validation runs on the server.
  - Many online examples still use Zod 3 APIs, so reviews must catch outdated calls.

### B. Valibot 1

- Pros:
  - Also named in the Next.js docs.
  - Zero dependencies and very small because of its modular, function-based design.
- Cons: smaller ecosystem, fewer examples, and a less familiar API. Its main advantage (client bundle size) is small for a server-rendered app.

### C. ArkType 2 (rejected)

- Pros: fast, concise type-syntax schemas.
- Rejected because it has 3 dependencies, an unusual string-based schema syntax, and a smaller ecosystem.

### D. TypeBox (rejected)

- Pros: JSON Schema-first, which is good for documenting APIs.
- Rejected because we expose no public JSON API, and it is less ergonomic for form validation.

### E. Hand-written validation (rejected)

- Rejected because it is easy to get wrong, types drift from checks, and `CLAUDE.md` asks for a schema.

## Decision

**A: Zod 4** (full `zod` package, not `zod/mini`), used at every boundary:

| Boundary               | Rule                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server actions / forms | Parse `FormData` with a schema. Strings must be strings, not files. Each field is trimmed and has a maximum length. Unknown keys are stripped, not rejected, because Next.js adds `$ACTION_*` keys. Errors are returned per field with `z.treeifyError()`. |
| Route handlers         | Path parameters, query and body parsed with a schema; failures return 400 without internal details.                                                                                                                                                        |
| Identity header        | Base64 decode, JSON parse, then schema. Any failure is treated as "no user" (401).                                                                                                                                                                         |
| Configuration          | One schema for all settings, parsed once at startup. Invalid or missing config stops the app with a message naming the setting, never its value.                                                                                                           |
| endoflife.date         | Response parsed with a schema after a timeout-bounded `fetch`. Failure means "no lookup result" and the user can enter the date manually. Unknown fields are ignored.                                                                                      |

Shared rules:

- Schemas live next to the boundary they protect, in `src/`. Shared domain schemas (for example `Component`) live in one module and are reused by forms and data access.
- Only the parsed output is used after validation, never the raw input.
- Validation errors are logged without the rejected values, because they may contain personal data.

## Consequences

- One runtime dependency, `zod`, with zero transitive dependencies. It goes into `docs/lifecycle.md` (no published support end date; track majors).
- **Tests** (ADR 0003): each schema has unit tests for accepted input, each rejection case, and length limits. Integration and end-to-end tests cover the form error path.
- Code review and agents must use Zod 4 APIs. I'll suggest adding this to `docs/learnings.md` if outdated Zod 3 usage turns up.

## Follow-up

- With this ADR, all pending stack decisions in `CLAUDE.md` are made. The next step is the first spec in `specs/` and then the application skeleton.
