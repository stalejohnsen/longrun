---
name: major-upgrade
description: Upgrade a major version of Node.js, Next.js, PostgreSQL or a held tool (TypeScript, ESLint) in Longrun. Use when asked to upgrade a runtime, framework, database or held dependency to a new major version.
---

# Major upgrade

Follow `docs/runbooks/major-upgrade.md`: the common steps, then the section for the component.

Rules that matter most:

- Read the official upgrade guide and check platform support first. For Node, check the exact App Service runtime string (`az webapp list-runtimes --os-type linux`).
- Change every place that names the version (the runbook lists them) and update `docs/lifecycle.md` in the same PR.
- One upgrade per PR. Explain each fix in its commit message.
- Run lint, typecheck and all tests before opening the PR. Never weaken a check to get green.
- The owner reviews staging before approving the swap. A rollback swap also reverts the Node runtime.
