import { addMonths } from './end-of-support-window'
import { POLICY_LIMITS } from './policy'

// Spec 0005 "Evaluation": every component against every policy. Pure: the caller supplies
// today's UTC date (DR-13), so the same inputs always give the same flags. Flags never
// block anything; each one states its policy and reason (DR-20).

export type TechnologyRule = {
  product: string
  rule: 'approved' | 'banned'
  majorVersion: number | null
  note: string | null
}

export type Policies = {
  warningMonths: number
  requireKnownOwner: boolean
  requireEndOfSupport: boolean
  technologyRules: TechnologyRule[]
  teams: string[]
}

// Spec 0005 E4: the defaults when no settings row exists.
export const DEFAULT_POLICIES: Policies = {
  warningMonths: POLICY_LIMITS.warningMonths.default,
  requireKnownOwner: false,
  requireEndOfSupport: false,
  technologyRules: [],
  teams: [],
}

// The parts of a component that policies look at.
export type EvaluatedComponent = {
  id: string
  name: string
  version: string
  owner: string
  eol: { product: string } | null
  endOfSupport: { date: string } | null
}

export type Severity = 'breach' | 'warning'

export type PolicyKind = 'end-of-support' | 'known-owner' | 'known-end-of-support' | 'technology'

export type Flag = { componentId: string; policy: PolicyKind; severity: Severity; reason: string }

// All reason texts in one place (DR-04). Concrete dates and versions (DR-13, DR-20).
export const POLICY_REASONS = {
  pastEndOfSupport: (date: string) => `Past end of support since ${date}.`,
  endOfSupportSoon: (date: string, months: number) =>
    `End of support ${date}, within the ${months}-month warning window.`,
  endOfSupportUnknown: () => 'End-of-support date is unknown.',
  ownerNotKnown: (owner: string) => `Owner "${owner}" is not a known team.`,
  banned: (product: string) => `${product} is banned.`,
  bannedBelow: (product: string, below: number, major: number) =>
    `${product} below version ${below} is banned; this is version ${major}.`,
  belowApprovedMinimum: (product: string, minimum: number, major: number) =>
    `Version ${major} of ${product} is below the approved minimum ${minimum}.`,
  versionUnreadable: (version: string, product: string) =>
    `Version "${version}" can't be checked against the ${product} rule.`,
} as const

// The first whole number in the version text: "24.15" → 24, "v20" → 20, "17-alpine" → 17.
export function majorVersion(version: string): number | null {
  const match = /\d+/.exec(version)
  return match ? Number(match[0]) : null
}

// The endoflife.date product when set, otherwise the lowercased, trimmed name.
export function productOf(component: Pick<EvaluatedComponent, 'name' | 'eol'>): string {
  return component.eol?.product ?? component.name.trim().toLowerCase()
}

function normalizeTeam(name: string): string {
  return name.trim().toLowerCase()
}

function withNote(reason: string, note: string | null): string {
  return note ? `${reason} ${note}` : reason
}

function technologyFlag(
  component: EvaluatedComponent,
  rule: TechnologyRule,
): Omit<Flag, 'componentId' | 'policy'> | null {
  const product = rule.product
  if (rule.majorVersion === null) {
    return rule.rule === 'banned'
      ? { severity: 'breach', reason: withNote(POLICY_REASONS.banned(product), rule.note) }
      : null
  }
  const major = majorVersion(component.version)
  if (major === null) {
    return {
      severity: 'warning',
      reason: POLICY_REASONS.versionUnreadable(component.version, product),
    }
  }
  if (major >= rule.majorVersion) return null
  const reason =
    rule.rule === 'banned'
      ? POLICY_REASONS.bannedBelow(product, rule.majorVersion, major)
      : POLICY_REASONS.belowApprovedMinimum(product, rule.majorVersion, major)
  return { severity: 'breach', reason: withNote(reason, rule.note) }
}

export function evaluatePolicies(
  components: EvaluatedComponent[],
  policies: Policies,
  today: string,
): Flag[] {
  const windowEnd = addMonths(today, policies.warningMonths)
  const teams = new Set(policies.teams.map(normalizeTeam))
  const rules = new Map(policies.technologyRules.map((rule) => [rule.product, rule]))
  const flags: Flag[] = []

  for (const component of components) {
    const add = (policy: PolicyKind, severity: Severity, reason: string) =>
      flags.push({ componentId: component.id, policy, severity, reason })

    const date = component.endOfSupport?.date
    if (date !== undefined) {
      if (date < today) add('end-of-support', 'breach', POLICY_REASONS.pastEndOfSupport(date))
      else if (date <= windowEnd) {
        add(
          'end-of-support',
          'warning',
          POLICY_REASONS.endOfSupportSoon(date, policies.warningMonths),
        )
      }
    } else if (policies.requireEndOfSupport) {
      add('known-end-of-support', 'warning', POLICY_REASONS.endOfSupportUnknown())
    }

    if (policies.requireKnownOwner && !teams.has(normalizeTeam(component.owner))) {
      add('known-owner', 'warning', POLICY_REASONS.ownerNotKnown(component.owner))
    }

    const rule = rules.get(productOf(component))
    const technology = rule ? technologyFlag(component, rule) : null
    if (technology) add('technology', technology.severity, technology.reason)
  }

  return flags
}
