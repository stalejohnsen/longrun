# Spec 0005 – Lifecycle policies

Status: Draft
Date: 2026-09-29
Related: intent [0005](../intents/0005-lifecycle-policies.md), spec [0001](0001-component-register.md), [plan](../docs/plan.md) phase 8. Design rules: `org-design-rules` (cited as DR-nn).

## Summary

The organisation writes down its lifecycle expectations once, as policies that apply to everyone. Longrun **flags** every component that breaks a policy and says which policy and why. It never blocks anything. A new "Policy breaches" page shows everything that needs attention in one place, so upgrades can be planned instead of discovered by chance.

## In scope

- One organisation-wide set of policies, readable and editable by anyone signed in:
  - **End of support:** a warning window in months.
  - **Required information:** the owner must be a known team; the end-of-support date must be known. Each is on or off.
  - **Technology rules:** per product, either _approved_ (optionally from a minimum major version) or _banned_ (optionally only below a major version).
- A list of **known teams**.
- **Evaluation:** every component against every policy, with a reason for each flag.
- Pages: **Policies** (view and edit), **Policy breaches** (overview). A **Policy** column in the component list. The owner field suggests known teams.

## Out of scope

- Blocking or refusing registrations (intent).
- Roles or permissions; policies per team (intent).
- Notifications (plan non-goal).
- History of policy changes beyond "last changed" (see "Changes are recorded").
- Minor or patch version rules. Only the major version is compared.

## Behaviour

### Policies (page `/policies`, in the main navigation)

Server-rendered forms (DR-15); every page and action checks the user (DR-16).

**End of support**

- "Warn this many months before end of support": a whole number from 1 to 36, default 6.
- A component whose end-of-support date is **before today** gets a **breach**. One whose date is **today or within the window** gets a **warning**. Today and the window end are UTC dates, and the window includes both ends (DR-13, same rules as spec 0001's end-of-support view).

**Required information** (checkboxes, both off by default)

- "Owner must be a known team." A component whose owner does not match a known team, case-insensitively and ignoring surrounding spaces, gets a **warning**.
- "End-of-support date must be known." A component without an end-of-support date gets a **warning**.

**Technology rules** (a table, plus a form to add a rule; each rule can be edited or deleted with a confirmation, DR-08)

| Field         | Values                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product       | Lowercase letters, digits, `.`, `_`, `-`, at most 100 characters (the endoflife.date product format, spec 0001). Unique.                                          |
| Rule          | **Approved** or **Banned**                                                                                                                                        |
| Major version | Optional whole number from 0 to 999. For _Approved_: the minimum approved major version. For _Banned_: banned **below** this major version. Empty: every version. |
| Note          | Optional, at most 200 characters, shown with the flag ("Use PostgreSQL instead.").                                                                                |

A component **matches a product** when its endoflife.date product equals the rule's product. A component without an endoflife.date product matches when its name, in lowercase and trimmed, equals the product.

A component's **major version** is the first whole number in its version text ("24.15" is 24, "v20" is 20, "17-alpine" is 17).

| Rule                    | Component                | Result                                                                                                   |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Banned, no version      | matches                  | **breach**: "`<product>` is banned." plus the note                                                       |
| Banned below N          | major < N                | **breach**: "`<product>` below version N is banned; this is version M."                                  |
| Banned below N          | major ≥ N                | no flag                                                                                                  |
| Approved from N         | major < N                | **breach**: "Version M of `<product>` is below the approved minimum N."                                  |
| Approved (any)          | major ≥ N, or no minimum | no flag                                                                                                  |
| Any rule with a version | no major version found   | **warning**: "Version '`<version>`' can't be checked against the `<product>` rule." (DR-20: no guessing) |

Products without a rule are neither approved nor banned; they get no technology flag.

**Known teams** (a list with add and delete; delete asks for confirmation, DR-08)

- A team name is 1–100 characters, trimmed, and unique case-insensitively.
- Deleting a team in use is allowed. Its components then get the owner warning, if that policy is on, and the confirmation page says how many components use it.

**Changes are recorded.** The policies page shows the date each setting, rule and team was last changed. Who changed it is stored with it (the user's ID from the identity header), but not shown (DR-17).

**Forms** follow DR-02, DR-05, DR-06 and DR-07. After saving, the page redirects and shows a fixed notice such as "Policy saved." or "Rule added." (DR-09).

### Policy breaches (page `/breaches`, in the main navigation)

- Two sections, **Breaches** and then **Warnings**, each a table (DR-10) with the columns component (linking to its edit page), version, owner, and **Reason**. A component with several flags gets one row per flag.
- Every row states the policy and the reason, with concrete dates and versions (DR-20, DR-13). For example: "Past end of support since 2026-08-06." or "End of support 2027-01-31, within the 6-month warning window."
- Sorted by severity, then by end-of-support date (unknown last), then by name.
- **Empty state (DR-11):** "No components break the policies." with a link to the policies. With no policies set up at all: "No policies set up yet." with a link to set them up.
- The page heading shows the totals in words: "3 breaches and 5 warnings".

### Component list and form

- The component list gets a **Policy** column: "2 breaches", "1 warning", or "None", in words, not colour alone (DR-12). It links to the breaches page.
- The owner field in the register and edit form suggests known teams with a native `<datalist>` (no JavaScript, DR-15). It stays free text; a team that isn't known only leads to a warning, if that policy is on.

### Evaluation

- A pure domain function takes the components, the policies and today's UTC date, and returns the flags: component, policy, severity and reason.
- It runs on the server for each request to the list and the breaches page. There is no stored state, so a policy change applies immediately.
- The reason texts come from one message map (DR-04).

### Data (migration)

Expand-only: three new tables and no change to `components`, so the previous app version keeps working during the swap (ADR 0004, DR-19). `CHECK` constraints mirror the Zod limits, which are defined once (DR-19).

- `policy_settings`: one row. `eos_warning_months` (1–36, default 6), `require_known_owner`, `require_end_of_support` (both default false), `updated_at`, `updated_by`.
- `technology_rules`: `product` (unique), `rule` (`approved` or `banned`), `major_version` (0–999, nullable), `note` (≤ 200, nullable), `updated_at`, `updated_by`.
- `teams`: `name` (unique on `lower(name)`), `created_at`, `created_by`.

`longrun_app` gets `SELECT, INSERT, UPDATE, DELETE` on the new tables automatically: `infra/database/grants.sql` sets default privileges for tables that `longrun_migrator` creates. No grant change is needed, and the app role still has no DDL rights (ADR 0004).

## Acceptance criteria

| ID  | Criterion                                                                                                                                                                                                | Test                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| P1  | With a 6-month window, a component past end of support is a breach, one ending today or within 6 months is a warning, and one ending after the window is not flagged. The window includes both ends      | Unit (domain), e2e                                |
| P2  | Changing the window to 12 months changes the flags at once                                                                                                                                               | e2e                                               |
| P3  | With "owner must be a known team" on, an unknown owner is a warning. Matching ignores case and surrounding spaces                                                                                        | Unit, e2e                                         |
| P4  | With "end-of-support date must be known" on, a component without a date is a warning                                                                                                                     | Unit, e2e                                         |
| P5  | Banned without a version flags every matching component; banned below N flags only lower major versions                                                                                                  | Unit, e2e                                         |
| P6  | Approved from N flags lower major versions; approved without a minimum flags nothing                                                                                                                     | Unit                                              |
| P7  | Matching uses the endoflife.date product, or else the lowercased, trimmed name                                                                                                                           | Unit                                              |
| P8  | An unreadable version under a versioned rule is a warning saying it can't be checked, never a guess                                                                                                      | Unit                                              |
| P9  | The breaches page lists breaches before warnings, one row per flag, each with a reason that has concrete dates or versions                                                                               | e2e                                               |
| P10 | The component list shows the number of flags in words, linking to the breaches page                                                                                                                      | e2e                                               |
| P11 | Policies, rules and teams can be added, changed and deleted. Deletion asks for confirmation. Invalid input follows DR-06 and keeps typed values. A duplicate product or team gets "This already exists." | Integration (database), e2e                       |
| P12 | The policies page shows when each item last changed; the change is stored with the user's ID                                                                                                             | Integration                                       |
| P13 | The owner field suggests known teams without JavaScript                                                                                                                                                  | Component, e2e                                    |
| P14 | All new pages and actions require a signed-in user (DR-16)                                                                                                                                               | e2e (existing auth pattern)                       |
| P15 | The migration only adds tables; the previous app version works against the migrated schema                                                                                                               | Integration (migrate, then run spec 0001 queries) |
| P16 | **Dogfooding (manual, after deploy):** with Longrun's own dependencies registered and a rule "eslint approved from 10", ESLint 9 is flagged with a reason                                                | Owner, on staging                                 |

## Error cases

- **E1** Invalid policy input (window outside 1–36, product format, major version, note length, team name) → per-field errors and summary (DR-06); nothing saved.
- **E2** Duplicate product or team name → "This already exists." on the field.
- **E3** Editing or deleting a rule or team that someone else has deleted → back to the policies page with "That item no longer exists." (as spec 0001 E8).
- **E4** No `policy_settings` row (a fresh database before the migration's seed) → the defaults apply, and the breaches page says "No policies set up yet".
- **E5** The database is unavailable → the existing error page (spec 0001).

## Delivery (PRs)

1. Intent 0005 and this spec (docs only).
2. Migration and the domain evaluation (pure function, message map), with unit and migration tests.
3. The policies page: settings, technology rules, teams, with data access and e2e.
4. The breaches page, the list column and the owner suggestions, with e2e.
5. Deploy, then dogfooding (P16), `docs/plan.md` phase 8, and the maintenance log.
