# Intent 0005 – Lifecycle policies

Date: 2026-09-29
Owner: the product owner (the repository owner)
Status: Accepted (spec 0005)

## In the owner's words

> Maybe some organization design rules skill would be good now, both as a feature addon to longrun but also to add on to the "soft" governance in the ai loop.

Answers to the intent questions:

> 1. **Who has the problem, and when does it show up?** "We don't have a good overview over what is end of support or we randomly discover it"
> 2. **Who sets the rules?** "Anyone"
> 3. **What happens when a component breaks a rule?** "Flag"
> 4. **Approved and banned technologies at what level?** "Both" (whole products and versions)
> 5. **What is missing most often and should be required?** "owner"
> 6. **One set of rules, or per team?** "one for all"
> 7. **How would we notice success in six months?** "Better planning of upgrades, less technical dept"

Earlier decision (2026-09-29): the policy types are **end of support**, **required fields**, and **approved and banned technologies**.

## Problem

Teams find out by chance that a component is past, or close to, its end of support. Longrun already shows dates, but nothing tells anyone which components break the organisation's expectations, such as "nothing past end of support", "warn well ahead", "not that technology" or "not that version". So problems are discovered late, upgrades are unplanned, and technical debt grows unnoticed.

## Outcome we want

- The organisation writes its lifecycle expectations down once, as policies that apply to everyone.
- Longrun **flags** every component that breaks a policy, and says which policy and why. It **does not block** anything.
- Anyone can see in one place what breaks the policies right now, and plan upgrades from that instead of discovering problems by chance.
- In six months: upgrades are planned ahead, and the number of flagged components (technical debt) goes down.

## Out of scope

- Blocking or refusing registrations.
- Roles or permissions: anyone who can sign in can read and change the policies, as with components.
- Policies per team; there is one set for the whole organisation.
- Notifications (e-mail, Teams); still a non-goal in `docs/plan.md`.

## Open questions (for spec 0005)

- **Owner is already required** in the form today (spec 0001). Is the need an owner that is a _real, known team_ (for example from a list), rather than any text?
- How do we recognise a "product" for approved and banned technologies: by the endoflife.date product (such as `nodejs`), by the component name, or both?
- How are versions compared ("Node below 22"), given that version is free text today?
- Where do flags show: the component list, the end-of-support view, a new "policy breaches" page, or several?
- Is a policy change recorded (who and when), so flags can be trusted?
- Longrun can register its own dependencies (dogfooding). Should one of the first policies flag ESLint 9, which is past end of support and held on purpose?
