import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { addMonths, todayUtc } from '../../src/domain/end-of-support-window'

// Spec 0001 "End-of-support view", end to end. Dates are relative to today in UTC (Q6).
// Tests share one database, so each checks only its own uniquely named components.

const tag = randomUUID().slice(0, 8)
const today = todayUtc()
const names = {
  today: `EOS today ${tag}`,
  edge: `EOS edge ${tag}`,
  dayAfter: `EOS day after ${tag}`,
  past: `EOS past ${tag}`,
  sixMonths: `EOS six months ${tag}`,
  noDate: `EOS no date ${tag}`,
}

function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

function dayBefore(date: string): string {
  const previous = new Date(`${date}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}

async function register(page: Page, name: string, date?: string) {
  await page.goto('/components/new')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Version').fill('1.0')
  await page.getByLabel('Where used').fill('Test system')
  await page.getByLabel('Owner').fill('Test team')
  if (date) await page.getByLabel('End-of-support date').fill(date)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('status')).toHaveText('Component registered.')
}

function section(page: Page, heading: RegExp | string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await register(page, names.today, today)
  await register(page, names.edge, addMonths(today, 12))
  await register(page, names.dayAfter, dayAfter(addMonths(today, 12)))
  await register(page, names.past, dayBefore(today))
  await register(page, names.sixMonths, addMonths(today, 6))
  await register(page, names.noDate)
  await page.close()
})

test('AC9: the default 12-month window includes today + 12 months and excludes the day after', async ({
  page,
}) => {
  await page.goto('/end-of-support')
  const within = section(page, /^Ending within 12 months/)
  await expect(within.getByRole('heading', { level: 2 })).toHaveText(
    `Ending within 12 months (until ${addMonths(today, 12)})`,
  )
  await expect(within.getByRole('row').filter({ hasText: names.edge })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: names.dayAfter })).toHaveCount(0)
})

test('AC10: a date of today is in the window, not already unsupported', async ({ page }) => {
  await page.goto('/end-of-support')
  await expect(
    section(page, /^Ending within/)
      .getByRole('row')
      .filter({ hasText: names.today }),
  ).toHaveCount(1)
  await expect(
    section(page, 'Already unsupported').getByRole('row').filter({ hasText: names.today }),
  ).toHaveCount(0)
})

test('AC11: past dates are listed under "Already unsupported"', async ({ page }) => {
  await page.goto('/end-of-support')
  await expect(
    section(page, 'Already unsupported').getByRole('row').filter({ hasText: names.past }),
  ).toHaveCount(1)
})

test('AC12: components without a date are not listed, and a count links to the list', async ({
  page,
}) => {
  await page.goto('/end-of-support')
  await expect(page.getByRole('row').filter({ hasText: names.noDate })).toHaveCount(0)
  await expect(page.locator('.without-date')).toContainText(
    /\d+ components? ha(s|ve) no end-of-support date/,
  )
  await page.getByRole('link', { name: 'See all components' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible()
})

test('the window is chosen in the form and kept in the URL', async ({ page }) => {
  await page.goto('/end-of-support')
  await page.getByLabel('Window (months)').fill('3')
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(page).toHaveURL(/\/end-of-support\?months=3$/)
  const within = section(page, /^Ending within 3 months/)
  // Six months away is outside a 3-month window, today is inside.
  await expect(within.getByRole('row').filter({ hasText: names.sixMonths })).toHaveCount(0)
  await expect(within.getByRole('row').filter({ hasText: names.today })).toHaveCount(1)
  await expect(page.getByLabel('Window (months)')).toHaveValue('3')
})

test('a bookmarked window is honoured: ?months=36', async ({ page }) => {
  await page.goto('/end-of-support?months=36')
  const within = section(page, /^Ending within 36 months/)
  await expect(within.getByRole('row').filter({ hasText: names.dayAfter })).toHaveCount(1)
})

for (const raw of ['0', '37', 'abc', '-1', '12.5']) {
  test(`AC13: an invalid window ${JSON.stringify(raw)} falls back to 12 months and says so`, async ({
    page,
  }) => {
    await page.goto(`/end-of-support?months=${encodeURIComponent(raw)}`)
    await expect(page.getByRole('status')).toContainText('Showing 12 months instead')
    await expect(section(page, /^Ending within 12 months/)).toHaveCount(1)
  })
}

test('rows link to the component', async ({ page }) => {
  await page.goto('/end-of-support')
  await page.getByRole('link', { name: names.edge }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Edit ${names.edge}` })).toBeVisible()
})

test('the view is in the main navigation', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'End of support' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'End of support' })).toBeVisible()
})
