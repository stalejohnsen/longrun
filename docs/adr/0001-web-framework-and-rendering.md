# 0001 – Web framework and rendering approach

Status: Accepted
Date: 2026-09-26

## Context

Longrun is a small internal CRUD app: a form to register components, a list, and a view of components reaching end of support within a user-chosen window. It runs on Azure App Service (Linux) with Node LTS, signs users in with Entra ID, and must be secure by default (auth on every route except health, security headers, validated input).

Longrun is also a learning project. One explicit goal is to practise **maintaining a realistic application over time**: framework upgrades, security advisories, dependency churn. `CLAUDE.md` asks to keep the app small and dependencies few. This ADR trades some of that smallness for a stack that is representative of real-world maintenance, and states that trade-off openly.

Facts checked on 2026-09-26:

- Node 24 is Active LTS (maintenance from 2026-10-20, end of life 2028-04-30). Source: [nodejs/Release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
- Next.js 16.3.6 is current and requires Node 20.9 or newer. React 19.3.0 is current.
- Next.js support policy: roughly one major version per year. The latest major is Active LTS. The previous major is in Maintenance LTS (critical and security fixes only), and each major is supported for 2 years from release. 16.x (released 2025-10-21) is Active; 15.x is Maintenance. Source: [Next.js support policy](https://nextjs.org/support-policy).
- App Service Linux supports `NODE|24-lts`, passes the port in `PORT`, and terminates TLS before the app. Source: [Configure Node.js apps](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs).
- App Service built-in authentication runs as a separate container in front of the app on Linux, is framework-agnostic, and passes the user identity in request headers. Source: [App Service authentication overview](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization).
- Self-hosted Next.js needs the following when run like we will run it: standalone output with `.next/static` and `public` copied in; a `deploymentId` to handle version skew during rolling or swap deployments; and, with more than one instance, a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a shared cache handler. Source: [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).
- CVE-2025-55182 ("React2Shell", December 2025) was a critical (CVSS 10.0) unauthenticated remote code execution in React Server Components, affecting Next.js. It was exploited in the wild within days. Source: [React advisory](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components).

## Options

### A. Next.js (App Router) with React, server-rendered first

- Pros:
  - Widely used full-stack stack, so the skills and maintenance experience transfer to real projects.
  - Published support policy with predictable yearly majors, which gives a real lifecycle to track.
  - React is available if a future spec needs interactivity.
  - One project and one deployment for UI and server.
- Cons:
  - Large dependency tree and yearly major upgrades.
  - Larger attack surface; the React Server Components protocol has had a critical pre-auth RCE.
  - Self-hosting needs extra configuration: standalone packaging, `deploymentId` for slot swap, an encryption key and shared cache if scaled out.
  - Microsoft's first-party Next.js guidance targets Azure Static Web Apps, not App Service.

### B. Hono 4 with server-rendered JSX (rejected)

- Pros:
  - Smallest option: `hono` has zero runtime dependencies.
  - Built-in secure headers and CSP, and in-process HTTP tests.
  - No client bundle, so no version-skew concerns.
- Rejected because:
  - It gives less realistic maintenance and learning value.
  - It has no published support policy.
  - It has a smaller community.
- Best fit if the goal were only "smallest, safest app".

### C. Express 5 with a template engine (rejected)

- Pros: most familiar Node framework, and it has a published support policy.
- Rejected because it needs a template engine and `helmet` as extra dependencies and offers no advantage over A for the learning goal or over B for size.

### D. Single-page app (React or Angular) plus a separate JSON API (rejected)

- Rejected because:
  - Two applications to build and deploy.
  - Tokens would be handled in the browser.
  - It adds CORS and CSRF design work.
  - No spec needs this level of client interactivity.

### E. Node built-in `node:http` only (rejected)

- Rejected because we would hand-write routing, parsing, escaping and security headers. That is more security-sensitive code to own.

## Decision

Use **Next.js (App Router, current Active LTS major) with React on Node 24 LTS**, deployed to App Service as a Node server (standalone output).

Use it **server-rendered first**:

- Pages are React Server Components.
- Forms use server actions or route handlers.
- Client components (`'use client'`) only where a spec needs interactivity.

The reason for choosing Next.js over the smaller options is the learning goal: practising realistic, long-term maintenance of a mainstream stack. This is a deliberate exception to "keep dependencies few", limited to this framework choice.

## Consequences

### Security

- App Service built-in authentication will be evaluated in the auth ADR with "require authentication", so unauthenticated requests are rejected before they reach Next.js. Only the health endpoint is excluded. This limits exposure to pre-auth vulnerabilities like CVE-2025-55182.
- Every server action and route handler validates input with a schema and checks authentication itself. Built-in auth is a first line of defence, not the only one.
- Security headers and a CSP with nonces are set in Next.js config or `proxy`. Tests prove they are present.
- CI fails on known high or critical vulnerabilities in dependencies. A runbook in `docs/runbooks/` describes how to patch a framework advisory quickly.

### Deployment

- Build with `output: 'standalone'`. CI copies `.next/static` and `public` into the artifact.
- Set `deploymentId` (for example the commit SHA) so a staging slot swap does not break clients holding an older build.
- Run a single instance at first. If we scale out, a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (stored in Key Vault) and a shared cache handler become required; that needs a new ADR.

### Maintenance

- Next.js, React and Node are added to `docs/lifecycle.md` with their support end dates.
- Major upgrades are planned before the running major leaves Maintenance LTS.

### Testing

- The test-runner ADR must cover server logic, React components and probably browser-level tests (for example Playwright).
- The validation-library ADR applies to server actions as well as route handlers.
- TypeScript is compiled by the Next.js build, so Node's built-in type stripping is not relevant.

## Follow-up ADRs

- Authentication mechanism (App Service built-in auth vs. in-app OIDC library)
- Test runner, database driver/query layer, migration tool, validation library (from `CLAUDE.md`)
