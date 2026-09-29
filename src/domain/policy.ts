import { z } from 'zod'
import { eolProduct, optionalText, requiredText } from './component'

// Spec 0005 "Data": rules for policies, technology rules and teams. The same limits are
// enforced by the database (migrations/2026-09-30T10-00-00_create_policies.ts, DR-19).
// Messages name the fix and never contain the rejected value (DR-03, DR-06).

export const POLICY_LIMITS = {
  warningMonths: { min: 1, max: 36, default: 6 },
  majorVersion: { min: 0, max: 999 },
  note: 200,
  teamName: 100,
} as const

function wholeNumber(min: number, max: number) {
  const message = `Enter a whole number from ${min} to ${max}.`
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d{1,4}$/, { error: message })
    .transform(Number)
    .pipe(z.number().int().min(min, { error: message }).max(max, { error: message }))
}

// An HTML checkbox sends its value when ticked and nothing when not.
const checkbox = z
  .string()
  .optional()
  .transform((value) => value !== undefined)

export const policySettingsInputSchema = z.object({
  warningMonths: wholeNumber(POLICY_LIMITS.warningMonths.min, POLICY_LIMITS.warningMonths.max),
  requireKnownOwner: checkbox,
  requireEndOfSupport: checkbox,
})

export type PolicySettingsInput = z.output<typeof policySettingsInputSchema>

export const technologyRuleInputSchema = z.object({
  product: z
    .string({ error: 'Enter a value.' })
    .trim()
    .min(1, { error: 'Enter a value.' })
    .pipe(eolProduct),
  rule: z.enum(['approved', 'banned'], { error: 'Choose approved or banned.' }),
  majorVersion: optionalText(z.string()).pipe(
    wholeNumber(POLICY_LIMITS.majorVersion.min, POLICY_LIMITS.majorVersion.max).optional(),
  ),
  note: optionalText(
    z.string().max(POLICY_LIMITS.note, { error: `Use at most ${POLICY_LIMITS.note} characters.` }),
  ),
})

export type TechnologyRuleInput = z.output<typeof technologyRuleInputSchema>

export const teamInputSchema = z.object({ name: requiredText(POLICY_LIMITS.teamName) })

export type TeamInput = z.output<typeof teamInputSchema>
