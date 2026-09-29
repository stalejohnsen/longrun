# Intents

Stage 1 of the AI-native SDLC ([playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)): an idea is captured once, in the owner's own words, before any design. An intent says **what** and **why**, never how.

- One file per idea: `NNNN-short-name.md`, numbered like the spec that follows it.
- Claude asks questions until the intent is clear, and writes it down with the owner's words quoted. The owner approves the text.
- The intent is committed in the same PR as its spec (`specs/NNNN-…`), which links back to it.
- An intent is never edited after its spec is `Ready`. A changed idea gets a new intent.

## Template

```markdown
# Intent NNNN – <short name>

Date: YYYY-MM-DD
Owner: <role>
Status: Captured | Accepted (spec NNNN) | Dropped

## In the owner's words

> <quoted, as said>

## Problem

<who has the problem, when it shows up, what it costs today>

## Outcome we want

<what is different for users when this exists; how we would notice>

## Out of scope

<what this is not>

## Open questions

<to be answered in the spec>
```
