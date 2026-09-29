---
name: org-design-rules
description: Longrun's organisation design rules (DR-01 to DR-21) for text, forms, data display, dates, accessibility, security and data. Use when writing or reviewing a spec, and when designing, building or reviewing any page, form, message, table or data change in Longrun.
---

# Organisation design rules

These rules come from what already works in Longrun (spec 0001) and from WCAG 2.2 AA. Apply them **while writing a spec** (stage 2) and **while building** (stage 3), not afterwards. A spec cites the rules it relies on by number. A deliberate deviation is written in the spec with its reason. Reviews check new UI and data against this list.

## Content and language

- **DR-01 Plain English.** Short sentences. Use the words users know (component, owner, end of support), not internal ones (EOL, kind, IDs, enum values).
- **DR-02 Sentence case,** for headings, labels and buttons. A button says exactly what it does ("Register", "Save changes", "Delete permanently"), never "Submit" or "OK".
- **DR-03 Messages say what happened and what to do.** No apologies and no blame. An error names the fix: "Enter a value." or "Enter a date in the future."
- **DR-04 One place for messages.** Every user-visible message is defined in one map per feature, and the end-to-end tests check its exact text.

## Forms

- **DR-05 Visible labels.** Every input has a visible `<label>`. Optional fields say "(optional)". A hint is linked with `aria-describedby`. A placeholder never carries information.
- **DR-06 Server-side validation with two places for errors.** Validate with Zod on the server. Show an error summary at the top (`role="alert"`) and an error at each field, linked with `aria-describedby` and `aria-invalid`. Keep what the user typed.
- **DR-07 Related fields in a `fieldset`** with a `legend`.
- **DR-08 Destructive actions** get a confirmation page that states the consequence ("This cannot be undone.") and a Cancel link that changes nothing.
- **DR-09 After a successful action, redirect** (POST, redirect, GET) and show a notice (`role="status"`) chosen from a fixed set of notice codes. Never show text from the URL.

## Data display

- **DR-10 Tables:** a `caption` (visually hidden when the heading already says it), `th scope="col"`, and one row per item. The first column names the item and links to it.
- **DR-11 Empty states** say what is missing and link to the action that fixes it.
- **DR-12 No meaning in colour or blanks alone.** A missing value shows "Unknown". A status or flag is shown in words, and colour only supports it.

## Dates and time

- **DR-13 Dates are ISO `YYYY-MM-DD` calendar dates in UTC.** "Today" is computed once per request, in UTC. A window includes both ends. Say the concrete date ("until 2027-09-29"), not only "in 12 months".

## Accessibility and rendering

- **DR-14 WCAG 2.2 AA.** Everything is reachable by keyboard in a logical order, focus is visible, and contrast is at least 4.5:1 in both the light and dark schemes.
- **DR-15 Server-rendered HTML first** (ADR 0001). Use a client component only when the spec needs interactivity. Pages work without JavaScript unless the spec says otherwise.

## Security and privacy

- **DR-16 Every page, server action and route handler checks the user** (`requireUser`), except `/health`. Decisions are made on the server.
- **DR-17 Show and log only what the feature needs.** No user input in URLs, logs or notices. Never log personal data.
- **DR-18 External data is labelled** with its source and when it was looked up. When the source fails, the app says so plainly and manual entry still works.

## Data and rules

- **DR-19 Data changes come with a migration** that is backward compatible (expand/contract) and has `CHECK` constraints matching the Zod limits. Limits are defined once and shared by the schema, the form and the database.
- **DR-20 Every automatic judgement shows its reason.** A flag, warning or rule result in the UI states which rule applies and why ("Past end of support since 2026-08-06"), so a person can check it.

## Specs

- **DR-21 Specs cite these rules** in their behaviour and acceptance criteria (for example "Errors follow DR-06"). Every cited rule is covered by a test. A new rule, or a change to one, is a PR to this file that says why.
