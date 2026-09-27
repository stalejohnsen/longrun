// Spec 0001 "End-of-support view": the window is whole months from today (UTC), 1–36,
// default 12 (decisions Q2, Q6). Dates are calendar dates as YYYY-MM-DD strings.

export const WINDOW_MONTHS = { min: 1, max: 36, default: 12 } as const

export type WindowMonths = { months: number; adjusted: boolean }

// Reads the ?months= value. Missing means the default; anything invalid or out of range also
// falls back to the default, and `adjusted` tells the page to say so (AC13).
export function parseWindowMonths(raw: string | null | undefined): WindowMonths {
  if (raw === null || raw === undefined || raw === '') {
    return { months: WINDOW_MONTHS.default, adjusted: false }
  }
  if (/^\d{1,2}$/.test(raw)) {
    const months = Number(raw)
    if (months >= WINDOW_MONTHS.min && months <= WINDOW_MONTHS.max) {
      return { months, adjusted: false }
    }
  }
  return { months: WINDOW_MONTHS.default, adjusted: true }
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

// Adds whole months to a calendar date. When the target month is shorter, the result is its
// last day (2026-01-31 + 1 month = 2026-02-28), never a date in the month after.
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const result = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
  return result.toISOString().slice(0, 10)
}

export type EndOfSupportWindow = { today: string; until: string; months: number }

export function endOfSupportWindow(months: number, now: Date = new Date()): EndOfSupportWindow {
  const today = todayUtc(now)
  return { today, until: addMonths(today, months), months }
}
