import { z } from 'zod'

// Spec 0001 "Data": rules for a component. The same limits are enforced by the database
// (migrations/2026-09-27T10-00-00_create_components.ts). Validation messages are shown to
// the user per field and never contain the rejected value.

export const LIMITS = {
  name: 100,
  version: 50,
  whereUsed: 500,
  owner: 100,
  eolProduct: 100,
  eolRelease: 50,
} as const

export function requiredText(max: number) {
  return z
    .string({ error: 'Enter a value.' })
    .trim()
    .min(1, { error: 'Enter a value.' })
    .max(max, { error: `Use at most ${max} characters.` })
}

// An empty or whitespace-only optional field means "not given".
export function optionalText(schema: z.ZodType<string, string>) {
  return z
    .string({ error: 'Enter text.' })
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(schema.optional())
    .optional()
}

export const eolProduct = z
  .string()
  .max(LIMITS.eolProduct, { error: `Use at most ${LIMITS.eolProduct} characters.` })
  .regex(/^[a-z0-9._-]+$/, {
    error: 'Use lowercase letters, digits, dots, underscores or hyphens (as on endoflife.date).',
  })

const eolRelease = z
  .string()
  .max(LIMITS.eolRelease, { error: `Use at most ${LIMITS.eolRelease} characters.` })
  .regex(/^[A-Za-z0-9._-]+$/, {
    error: 'Use letters, digits, dots, underscores or hyphens (as on endoflife.date).',
  })

const calendarDate = z.iso.date({ error: 'Enter a valid date (YYYY-MM-DD).' })

export const componentInputSchema = z
  .object({
    name: requiredText(LIMITS.name),
    version: requiredText(LIMITS.version),
    whereUsed: requiredText(LIMITS.whereUsed),
    owner: requiredText(LIMITS.owner),
    eolProduct: optionalText(eolProduct),
    eolRelease: optionalText(eolRelease),
    manualEndOfSupport: optionalText(calendarDate),
  })
  .superRefine((input, ctx) => {
    // Spec 0001 E3: product and release are given together or not at all.
    if (input.eolProduct !== undefined && input.eolRelease === undefined) {
      ctx.addIssue({ code: 'custom', path: ['eolRelease'], message: 'Enter the release too.' })
    }
    if (input.eolRelease !== undefined && input.eolProduct === undefined) {
      ctx.addIssue({ code: 'custom', path: ['eolProduct'], message: 'Enter the product too.' })
    }
  })

export type ComponentInput = z.output<typeof componentInputSchema>
