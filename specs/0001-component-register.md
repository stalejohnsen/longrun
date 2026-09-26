# Spec 0001 – Component register and end-of-support view

Status: Ready
Date: 2026-09-26
Related: [plan](../docs/plan.md), ADRs [0001](../docs/adr/0001-web-framework-and-rendering.md)–[0005](../docs/adr/0005-validation-library.md)

## Summary

Signed-in users register technology components and see which ones reach end of support within a time window they choose. The end-of-support date is looked up from endoflife.date when the product is listed there, and entered manually otherwise.

## In scope

1. Register a component.
2. List all components.
3. Edit a component.
4. Delete a component.
5. Look up the end-of-support date from endoflife.date, with manual entry as the fallback.
6. An end-of-support view filtered by a user-chosen window.
7. A health endpoint.

## Out of scope

- Notifications, reminders, email.
- Automatic discovery or import of components.
- Scheduled background refresh of dates (decision Q4).
- Roles or per-owner permissions: any signed-in user may do everything.
- History or audit trail of changes.
- Search, sorting options or pagination beyond what is stated below.

## Data

A **component** has:

| Field | Required | Rules |
| --- | --- | --- |
| Name | yes | Free text, trimmed, 1–100 characters. Example: "Node.js". |
| Version | yes | Free text, trimmed, 1–50 characters. Example: "24.12.0". |
| Where used | yes | Free text, trimmed, 1–500 characters. Example: "Longrun web app, billing API". |
| Owner | yes | Free-text name, trimmed, 1–100 characters. Not linked to Entra ID. |
| endoflife.date product | no | Product ID as used by endoflife.date, for example `nodejs`. Lowercase letters, digits, `.`, `_`, `-`; 1–100 characters. |
| endoflife.date release | no | Release cycle as used by endoflife.date, for example `24`. Letters, digits, `.`, `_`, `-`; 1–50 characters. Required if a product is given. |
| End-of-support date | no | A calendar date (no time). Either looked up or entered manually. |
| Date source | derived | `endoflife.date` or `manual`, or none if there is no date. |
| Looked up at | derived | Timestamp of the last successful lookup, if the source is `endoflife.date`. |

The system also stores created and updated timestamps. It stores no personal data beyond the free-text owner name the user types in.

"End-of-support date" means endoflife.date's `eolFrom` for the release (decision Q1).

## Behaviour

### Register

- A form with the fields above.
- If the user gives an endoflife.date product and release, the system looks up the date when the form is submitted.
- If the user gives no product, they may enter an end-of-support date manually, or leave it empty.
- On success, the user is taken to the list, which shows the new component.

### endoflife.date lookup

- Request: `GET https://endoflife.date/api/v1/products/{product}/releases/{release}`, with both values URL-encoded after validation.
- The response is validated with a schema. Only `result.name`, `result.eolFrom` and `result.isEol` are used; unknown fields are ignored.
- Timeout: 5 seconds. No retries during the request.
- Outcomes:

| Outcome | Result |
| --- | --- |
| Found, `eolFrom` is a date | Store that date, source `endoflife.date`, and the lookup time. |
| Found, `eolFrom` is null | No known date. The user is told the product has no announced end of support and may enter a date manually. |
| 404 | The user is told the product or release was not found on endoflife.date and may correct it or enter a date manually. Nothing is saved until they resubmit. |
| Timeout, network error, other status or invalid response | The user is told the lookup is unavailable and may enter a date manually or try again. The failure is logged without user-entered values. Nothing is saved until they resubmit. |

- If the user enters a manual date **and** gives a product/release, the lookup result wins when it returns a date. The manual date is used only if the lookup finds no date (decision Q3).

### List

- Shows all components: name, version, where used, owner, end-of-support date (or "unknown"), and the date's source.
- Sorted by end-of-support date ascending, with unknown dates last. Ties are sorted by name.

### Edit

- The same form and rules as register, prefilled.
- If the product or release changes, the lookup runs again on submit.
- If neither changed, the stored date is kept. The edit page has a "Look up again" button that re-runs the lookup for the current product and release, with the same outcomes as above (decision Q4).

### Delete

- Deleting requires a confirmation step. After deletion, the component no longer appears anywhere.
- Deletion is permanent.

### End-of-support view

- The user chooses a window in whole months, from 1 to 36. The default is 12 (decision Q2).
- The view shows components whose end-of-support date falls **from today up to and including today + window**, sorted by date ascending.
- Components already past their end-of-support date are shown in a separate "Already unsupported" section above (decision Q5).
- Components with no date are not shown in this view. A count of them is shown with a link to the list.
- "Today" is the current date in UTC (decision Q6).
- The chosen window is part of the URL (for example `?months=12`), so a view can be bookmarked or shared.

### Health endpoint

- `GET /health` returns 200 when the app can reach the database, and 503 otherwise. The body contains no internal details.
- It is protected by App Service built-in auth like every other route. The platform health check works with that (ADR 0002).
- The platform's health pings may arrive without a user identity header. `/health` therefore accepts **either** a valid identity header **or** a valid platform health token. The token is the `x-ms-auth-internal-token` header, which must equal the Base64 SHA-256 hash of `WEBSITE_AUTH_ENCRYPTION_KEY` ([health check docs](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check)). The comparison is constant-time. Which headers the ping actually carries is to be verified on the first deployment.

## Acceptance criteria

Each criterion gets at least one automated test (ADR 0003: unit, integration or end-to-end, as noted).

### Register and list

- **AC1** A signed-in user can register a component with name, version, where used and owner, and it appears in the list. *(e2e)*
- **AC2** With endoflife.date product `nodejs` and release `24`, the stored date equals the `eolFrom` returned by the API, with source `endoflife.date`. *(integration with a stubbed endoflife.date; one e2e smoke test against the stub)*
- **AC3** Without a product, a manually entered date is stored with source `manual`. *(integration)*
- **AC4** Without a product and without a date, the component is stored with no date and shows "unknown". *(integration)*
- **AC5** The list is sorted by end-of-support date ascending, with unknown dates last and ties sorted by name. *(integration)*

### Edit and delete

- **AC6** Editing any field and saving updates the component. *(e2e)*
- **AC7** Changing the product or release triggers a new lookup and updates the date, source and lookup time. *(integration)*
- **AC7a** "Look up again" on the edit page, with unchanged product and release, replaces the stored date when endoflife.date returns a different date, and updates the lookup time. On failure the stored date is kept. *(integration)*
- **AC8** Deleting after confirmation removes the component from the list and from the end-of-support view. *(e2e)*

### End-of-support view

- **AC9** With window N months, a component whose date is exactly today + N months is shown, and one whose date is one day later is not. *(unit for the date logic, integration for the query)*
- **AC10** A component whose date is today is shown in the window section, not in "Already unsupported". *(unit)*
- **AC11** Components with a past date appear under "Already unsupported". *(integration)*
- **AC12** Components without a date are excluded, and their count is shown. *(integration)*
- **AC13** The window is read from the URL. An invalid or out-of-range value falls back to the default and tells the user. *(unit + e2e)*

### Security and platform

- **AC14** Every page, server action and route handler returns 401, or redirects to sign-in through the platform, when there is no valid identity header. `/health` also accepts a valid platform health token, and rejects a wrong or missing one. *(e2e + unit for the header and token helpers)*
- **AC15** Security headers and a CSP are present on every response. *(e2e)*
- **AC16** `/health` returns 200 with the database up and 503 with it down. *(integration)*

## Error cases

Each gets a test.

- **E1** Any required field empty or only whitespace → the form shows a per-field error, nothing is saved, and the other entered values are kept.
- **E2** Any field over its maximum length → per-field error, nothing saved.
- **E3** A product given without a release, or a release without a product → per-field error.
- **E4** Product or release with disallowed characters (for example `../`, `/`, spaces) → per-field error, **no request is made** to endoflife.date.
- **E5** endoflife.date returns 404 → the user sees "not found on endoflife.date", nothing is saved, and entered values are kept.
- **E6** endoflife.date times out (> 5 s), returns 5xx, or returns a body that fails validation → the user sees "lookup unavailable", nothing is saved, and entered values are kept. The log entry contains no user-entered values.
- **E7** Manual date is not a valid calendar date → per-field error.
- **E8** Edit or delete of a component that no longer exists (deleted by someone else) → the user sees "component not found" and is returned to the list.
- **E9** A form submission containing a file instead of text for any field → rejected as invalid input.
- **E10** Database unavailable during any action → a generic error page with no internal details. The error is logged.

## Non-functional

- All input is validated with Zod at the boundary (ADR 0005). Only validated values reach the database or the endoflife.date request.
- All database access goes through Kysely with parameters (ADR 0004).
- Logs never contain field values entered by users, identity header contents or tokens.
- Pages render on the server. Client components only where needed for per-field error display (ADR 0001).
- Accessibility: form fields have labels, errors are announced (`aria-live`), and the confirmation step is keyboard-accessible.

## Decisions

Resolved 2026-09-26 (proposed defaults accepted).

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Which endoflife.date field is "end of support"? `eolFrom` is the end of all support (security fixes) for most products. `eoasFrom` is the end of *active* support. | `eolFrom` |
| Q2 | Allowed window range and default? | 1–36 months, default 12 |
| Q3 | If both a product/release and a manual date are given, which wins? | The lookup date wins when found; the manual date is used only when the lookup finds no date |
| Q4 | Should stored dates be refreshable? Vendors sometimes change dates. | A "Look up again" button on the edit page only. No background refresh in this spec. |
| Q5 | Show already-unsupported components in the end-of-support view? | Yes, in a separate section above the window |
| Q6 | Which time zone defines "today"? | UTC |
| Q7 | How does the user enter the endoflife.date product and release: free text (validated by lookup), or pick from a list fetched from endoflife.date? | Free text with a link to endoflife.date for finding IDs. A picker would be a later spec. |
| Q8 | Are duplicate components (same name, version and where used) allowed? | Allowed; no uniqueness rule |
