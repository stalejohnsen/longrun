import { describe, expect, test } from 'vitest'
import {
  addMonths,
  endOfSupportWindow,
  parseWindowMonths,
  todayUtc,
  WINDOW_MONTHS,
} from '../../src/domain/end-of-support-window'

describe('window from the URL (AC13, decision Q2)', () => {
  test('defaults to 12 months when missing, without telling the user', () => {
    expect(parseWindowMonths(null)).toEqual({ months: 12, adjusted: false })
    expect(parseWindowMonths(undefined)).toEqual({ months: 12, adjusted: false })
    expect(parseWindowMonths('')).toEqual({ months: 12, adjusted: false })
  })

  test.each([1, 6, 12, 36])('accepts %i months', (months) => {
    expect(parseWindowMonths(String(months))).toEqual({ months, adjusted: false })
  })

  test.each(['0', '37', '-1', '12.5', 'abc', '1e1', ' 12', '012345'])(
    'falls back to the default and flags invalid value %j',
    (raw) => {
      expect(parseWindowMonths(raw)).toEqual({ months: WINDOW_MONTHS.default, adjusted: true })
    },
  )
})

describe('dates (decision Q6: UTC)', () => {
  test('today is the UTC calendar date', () => {
    expect(todayUtc(new Date('2026-09-27T23:30:00-02:00'))).toBe('2026-09-28')
    expect(todayUtc(new Date('2026-09-27T00:30:00+02:00'))).toBe('2026-09-26')
  })

  test.each([
    ['2026-09-27', 12, '2027-09-27'],
    ['2026-09-27', 1, '2026-10-27'],
    ['2026-09-27', 36, '2029-09-27'],
    ['2026-11-15', 3, '2027-02-15'],
    // Shorter target month: last day of that month, never spilling into the next.
    ['2026-01-31', 1, '2026-02-28'],
    ['2027-01-31', 13, '2028-02-29'],
    ['2026-03-31', 6, '2026-09-30'],
  ])('%s + %i months = %s', (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected)
  })

  test('the window runs from today to today + N months', () => {
    expect(endOfSupportWindow(12, new Date('2026-09-27T10:00:00Z'))).toEqual({
      today: '2026-09-27',
      until: '2027-09-27',
      months: 12,
    })
  })
})
