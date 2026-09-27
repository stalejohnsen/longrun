import type { Kysely } from 'kysely'
import {
  createComponent,
  getComponent,
  updateComponent,
  type Component,
  type ComponentData,
  type EndOfSupport,
} from '../db/components'
import type { Database } from '../db/database'
import { componentInputSchema, type ComponentInput } from '../domain/component'
import type { LookupResult } from './endoflife'

// Spec 0001 "Register" and "Edit": turns a submitted form into a saved component, including
// the endoflife.date lookup. Plain functions so they can be tested against real Postgres
// with a stub lookup; the server actions in src/app are thin wrappers.

export const FORM_FIELDS = [
  'name',
  'version',
  'whereUsed',
  'owner',
  'eolProduct',
  'eolRelease',
  'manualEndOfSupport',
] as const

export type FormField = (typeof FORM_FIELDS)[number]
export type FormValues = Record<FormField, string>

export type FormState = {
  fieldErrors: Partial<Record<FormField, string>>
  formError?: string
  values: FormValues
}

export type SaveResult =
  | { ok: true; component: Component; notice?: 'eol-no-date' }
  | { ok: false; state: FormState }
  | { ok: false; notFound: true }

export type ServiceDeps = {
  db: Kysely<Database>
  lookUp: (product: string, release: string) => Promise<LookupResult>
  now: () => Date
}

export const MESSAGES = {
  notFoundOnEndOfLife:
    'Not found on endoflife.date. Check the product and release, or remove them and enter a date manually.',
  lookupUnavailable:
    'endoflife.date could not be reached. Try again, or remove the product and release and enter a date manually.',
} as const

// Reads only the known fields. Files and missing fields are passed on as-is so the schema
// rejects them (spec 0001 E9); nothing else from the request is used.
export function readForm(formData: FormData): Record<FormField, FormDataEntryValue | undefined> {
  return Object.fromEntries(
    FORM_FIELDS.map((field) => [field, formData.get(field) ?? undefined]),
  ) as Record<FormField, FormDataEntryValue | undefined>
}

// Values echoed back into the form after an error, so the user keeps what they typed.
// Only text is echoed; a file becomes an empty field.
export function echoValues(raw: Record<FormField, FormDataEntryValue | undefined>): FormValues {
  return Object.fromEntries(
    FORM_FIELDS.map((field) => [field, typeof raw[field] === 'string' ? raw[field] : '']),
  ) as FormValues
}

function invalid(
  raw: Record<FormField, FormDataEntryValue | undefined>,
  fieldErrors: FormState['fieldErrors'],
  formError?: string,
): SaveResult {
  return { ok: false, state: { fieldErrors, formError, values: echoValues(raw) } }
}

function baseData(input: ComponentInput): Omit<ComponentData, 'endOfSupport'> {
  return {
    name: input.name,
    version: input.version,
    whereUsed: input.whereUsed,
    owner: input.owner,
    eol:
      input.eolProduct !== undefined && input.eolRelease !== undefined
        ? { product: input.eolProduct, release: input.eolRelease }
        : null,
  }
}

function manualDate(input: ComponentInput): EndOfSupport | null {
  return input.manualEndOfSupport ? { date: input.manualEndOfSupport, source: 'manual' } : null
}

type DateDecision =
  | { ok: true; endOfSupport: EndOfSupport | null; notice?: 'eol-no-date' }
  | { ok: false; field?: FormField; message: string }

// Spec 0001 "endoflife.date lookup" outcomes and decision Q3 (a found date wins over a manual one).
async function dateFromLookup(deps: ServiceDeps, input: ComponentInput): Promise<DateDecision> {
  const result = await deps.lookUp(input.eolProduct!, input.eolRelease!)
  switch (result.kind) {
    case 'found':
      return {
        ok: true,
        endOfSupport: { date: result.date, source: 'endoflife.date', lookedUpAt: deps.now() },
      }
    case 'no-date': {
      const manual = manualDate(input)
      return manual
        ? { ok: true, endOfSupport: manual }
        : { ok: true, endOfSupport: null, notice: 'eol-no-date' }
    }
    case 'not-found':
      return { ok: false, field: 'eolProduct', message: MESSAGES.notFoundOnEndOfLife }
    case 'unavailable':
      return { ok: false, message: MESSAGES.lookupUnavailable }
  }
}

function parse(raw: Record<FormField, FormDataEntryValue | undefined>) {
  const parsed = componentInputSchema.safeParse(raw)
  if (parsed.success) return { ok: true as const, input: parsed.data }
  const fieldErrors: FormState['fieldErrors'] = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as FormField
    fieldErrors[field] ??= issue.message
  }
  return { ok: false as const, fieldErrors }
}

export async function registerComponent(
  deps: ServiceDeps,
  formData: FormData,
): Promise<SaveResult> {
  const raw = readForm(formData)
  const parsed = parse(raw)
  if (!parsed.ok) return invalid(raw, parsed.fieldErrors)
  const { input } = parsed

  let decision: DateDecision = { ok: true, endOfSupport: manualDate(input) }
  if (input.eolProduct !== undefined) {
    decision = await dateFromLookup(deps, input)
  }
  if (!decision.ok) {
    return invalid(
      raw,
      decision.field ? { [decision.field]: decision.message } : {},
      decision.field ? undefined : decision.message,
    )
  }
  const component = await createComponent(deps.db, {
    ...baseData(input),
    endOfSupport: decision.endOfSupport,
  })
  return { ok: true, component, notice: decision.notice }
}

export async function editComponent(
  deps: ServiceDeps,
  id: string,
  formData: FormData,
): Promise<SaveResult> {
  const existing = await getComponent(deps.db, id)
  if (!existing) return { ok: false, notFound: true }

  const raw = readForm(formData)
  const parsed = parse(raw)
  if (!parsed.ok) return invalid(raw, parsed.fieldErrors)
  const { input } = parsed

  const eolUnchanged =
    input.eolProduct !== undefined &&
    existing.eol?.product === input.eolProduct &&
    existing.eol?.release === input.eolRelease

  let decision: DateDecision
  if (input.eolProduct === undefined) {
    decision = { ok: true, endOfSupport: manualDate(input) }
  } else if (eolUnchanged && existing.endOfSupport?.source === 'endoflife.date') {
    // Neither product nor release changed: keep the looked-up date (spec 0001 "Edit").
    decision = { ok: true, endOfSupport: existing.endOfSupport }
  } else if (eolUnchanged) {
    // Unchanged product and release that had no announced date: the manual date applies.
    decision = { ok: true, endOfSupport: manualDate(input) }
  } else {
    decision = await dateFromLookup(deps, input)
  }
  if (!decision.ok) {
    return invalid(
      raw,
      decision.field ? { [decision.field]: decision.message } : {},
      decision.field ? undefined : decision.message,
    )
  }
  const component = await updateComponent(deps.db, id, {
    ...baseData(input),
    endOfSupport: decision.endOfSupport,
  })
  return component
    ? { ok: true, component, notice: decision.notice }
    : { ok: false, notFound: true }
}

export type LookUpAgainFailure = 'no-eol' | 'no-date' | 'not-found' | 'unavailable'

export const LOOK_UP_AGAIN_MESSAGES: Record<LookUpAgainFailure, string> = {
  'no-eol': 'This component has no endoflife.date product and release.',
  'no-date':
    'endoflife.date has no announced end of support for this release. The stored date is kept.',
  'not-found': `${MESSAGES.notFoundOnEndOfLife} The stored date is kept.`,
  unavailable: `${MESSAGES.lookupUnavailable} The stored date is kept.`,
}

export type LookUpAgainResult =
  | { ok: true; component: Component; changed: boolean }
  | { ok: false; notFound: true }
  | { ok: false; reason: LookUpAgainFailure; message: string; component: Component }

// Spec 0001 decision Q4 / AC7a: re-run the lookup for the stored product and release.
// A found date replaces the stored one and updates the lookup time; any other outcome keeps it.
export async function lookUpAgain(deps: ServiceDeps, id: string): Promise<LookUpAgainResult> {
  const existing = await getComponent(deps.db, id)
  if (!existing) return { ok: false, notFound: true }
  const failed = (reason: LookUpAgainFailure): LookUpAgainResult => ({
    ok: false,
    reason,
    message: LOOK_UP_AGAIN_MESSAGES[reason],
    component: existing,
  })
  if (!existing.eol) return failed('no-eol')
  const result = await deps.lookUp(existing.eol.product, existing.eol.release)
  if (result.kind !== 'found') return failed(result.kind)
  const changed = existing.endOfSupport?.date !== result.date
  const updated = await updateComponent(deps.db, id, {
    name: existing.name,
    version: existing.version,
    whereUsed: existing.whereUsed,
    owner: existing.owner,
    eol: existing.eol,
    endOfSupport: { date: result.date, source: 'endoflife.date', lookedUpAt: deps.now() },
  })
  return updated ? { ok: true, component: updated, changed } : { ok: false, notFound: true }
}
