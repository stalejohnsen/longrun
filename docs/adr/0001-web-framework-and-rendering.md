# 0001 – Web framework and rendering approach

Status: Proposed
Date: 2026-09-26

## Context

Longrun is a small internal CRUD app: a form to register components, a list, and a view of components reaching end of support within a user-chosen window. It runs on Azure App Service (Linux) with Node LTS, signs users in with Entra ID, and must be secure by default (auth on every route except health, security headers, validated input). `CLAUDE.md` asks for few runtime dependencies and a preference for Node built-ins.

Two decisions are bundled here because they constrain each other:

1. **Rendering approach:** server-rendered HTML, or a single-page app (SPA) calling a JSON API.
2. **HTTP framework** on Node.

Facts checked on 2026-09-26:

- Node 24 is Active LTS (maintenance from 2026-10-20, end of life 2028-04-30). Node 26 becomes LTS on 2026-10-28. Source: [nodejs/Release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
- App Service Linux supports `NODE|24-lts`, passes the port in `PORT`, and terminates TLS before the app (`X-Forwarded-Proto`). Source: [Configure Node.js apps](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs).
- App Service built-in authentication runs as a separate container on Linux, is framework-agnostic, and passes the user identity to the app in request headers. Its browser flow is cookie based. Source: [App Service authentication overview](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization).
- Node 24 type stripping is stable from v24.12.0, so `.ts` files can run without a build step. It does not support enums, runtime namespaces, parameter properties or decorators, and it ignores `tsconfig.json`. It also does not handle JSX. Source: [Node.js TypeScript docs](https://nodejs.org/api/typescript.html).

## Part 1: Rendering approach

| | Server-rendered HTML (forms, links, optional small JS) | SPA + JSON API |
| --- | --- | --- |
| Fit for the features | Good: forms, tables and one filter | More than needed |
| Auth | Browser session cookie; works directly with App Service auth redirect flow or a server-side OIDC library | Token handling in the browser, or a backend-for-frontend; more moving parts |
| Security surface | No tokens in the browser; strict CSP is easy; output escaping in one place (templates) | XSS in the client bundle can reach tokens; CORS and CSRF design needed |
| Dependencies | Framework plus possibly a template engine | UI framework, bundler, router, state and API client, plus server |
| Testing | HTTP-level tests cover the whole feature | API tests plus component or browser tests |
| UX | Full page reloads | Richer interactivity (not required by any spec) |

**Proposed:** server-rendered HTML. No spec asks for rich client interactivity, and it keeps tokens out of the browser and the dependency count low.

## Part 2: HTTP framework

Options that fit server rendering on Node:

### A. Express 5

- Versions: 5.2.1 current. Official support page lists v5 as ongoing and requires Node 18 or newer ([Express support](https://expressjs.com/en/support/)).
- Pros:
  - Most widely known Node framework, so docs, examples and agent training data are plentiful.
  - Microsoft's App Service docs use it in examples.
  - v5 handles rejected promises from async handlers.
- Cons:
  - 28 direct runtime dependencies (more transitive).
  - Types come separately (`@types/express`).
  - Needs a separate template engine, and security headers need `helmet`.
  - The request and response objects are Node-specific, so tests usually need a supertest-style helper or a running server.

### B. Fastify 5

- Versions: 5.12.5 current, v5 LTS with no end date set yet ([Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/)).
- Pros:
  - Solid performance.
  - First-class TypeScript and a structured logger (pino) included.
  - `inject()` allows in-process HTTP tests.
- Cons:
  - 15 direct dependencies, including its own JSON-schema validator (ajv). That overlaps with the pending validation-library ADR.
  - Plugin model adds concepts.
  - Server rendering needs `@fastify/view` plus a template engine, and headers need `@fastify/helmet`.

### C. Hono 4 with `@hono/node-server`

- Versions: `hono` 4.13.9 and `@hono/node-server` 2.1.1 (Node 20 or newer).
- Pros:
  - `hono` has zero runtime dependencies.
  - Built on web-standard `Request`/`Response`, so `app.request()` tests run in-process without a server.
  - Server-side JSX templates are built in (`hono/jsx`), so no separate template engine. They are type-checked by TypeScript and raw HTML needs an explicit `dangerouslySetInnerHTML`.
  - Built-in secure-headers middleware with CSP nonce support ([docs](https://hono.dev/docs/middleware/builtin/secure-headers)).
- Cons:
  - Smaller Node-specific community than Express.
  - No published LTS/support-window policy for major versions (I could not find one).
  - JSX means `.tsx` files, so Node's built-in type stripping is not enough and a compile step (`tsc`) is needed.
  - Auto-escaping of interpolated text is not stated explicitly on the JSX docs page, so it must be confirmed by a test in the skeleton.

### D. Next.js (rejected)

- 16.3.6 current.
- Rejected because:
  - Full-stack React framework with a large dependency tree and frequent major releases.
  - Its hosting model is optimised for Vercel. App Service needs standalone output and extra care.
  - Far more than the features require.

### E. Node built-in `node:http` only (rejected)

- Zero dependencies.
- Rejected because we would hand-write routing, body parsing, cookies, escaping and headers. That is more security-sensitive code to own and test than a small framework, which works against secure-by-default.

### Comparison

| | Express 5 | Fastify 5 | Hono 4 |
| --- | --- | --- | --- |
| Direct runtime deps | 28 | 15 | 0 (+ `@hono/node-server`) |
| Templates | separate engine | `@fastify/view` + engine | built in (`hono/jsx`) |
| Security headers | `helmet` | `@fastify/helmet` | built in |
| In-process HTTP tests | needs helper library | `inject()` | `app.request()` |
| TypeScript | `@types/express` | built in | built in |
| Published support policy | yes | yes (LTS doc) | no |
| Familiarity / examples | highest | high | medium |

## Decision

Proposed, pending your choice:

- **Rendering:** server-rendered HTML with plain forms. Small scripts only where a spec needs them, allowed by a CSP nonce.
- **Framework:** **Hono 4 on `@hono/node-server`, with `hono/jsx` for templates.** It needs the fewest dependencies (two packages in total), covers templates, security headers and in-process testing without add-ons, and gives type-checked templates.

**Express 5 is the conservative alternative.** Choose it if a published support policy and maximum familiarity matter more than dependency count. It would add a template engine and `helmet`, which each need their own justification.

## Consequences

If Hono is accepted:

- A compile step (`tsc`) is required for `.tsx`. The build output is what gets deployed. This affects the test-runner ADR and the CI workflow.
- The skeleton must include a test proving that interpolated user input is HTML-escaped. It must also include tests that security headers and CSP are present on every response.
- Hono has no published support window. Track it in `docs/lifecycle.md` by watching major releases, and revisit this ADR if the project becomes unmaintained.
- `app.request()` makes behaviour tests cheap. Integration tests still use real Postgres (Testcontainers).

Independent of the framework:

- **Authentication mechanism (App Service built-in auth vs. an OIDC library in the app) needs its own ADR.** Built-in auth fits server rendering well. Note that without a client secret it falls back to the implicit flow, which affects the Key Vault setup.
- Trust `X-Forwarded-Proto` from App Service only (proxy settings), not from arbitrary clients.

## Follow-up ADRs

- 0002 Authentication mechanism (App Service built-in auth vs. in-app OIDC)
- Test runner, database driver/query layer, migration tool, validation library (from `CLAUDE.md`)
