import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

// Spec 0001 register and list, end to end against the production build, real Postgres and
// the local endoflife.date stub (test/e2e/endoflife-stub.ts). Names are unique per test
// because tests share one database.

function unique(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`
}

async function fillRequired(page: Page, name: string) {
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Version').fill('24.12.0')
  await page.getByLabel('Where used').fill('Longrun web app')
  await page.getByLabel('Owner').fill('Platform team')
}

function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

test('AC1: registering a component shows it in the list', async ({ page }) => {
  const name = unique('AC1')
  await page.goto('/')
  await page.getByRole('link', { name: 'Register component' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Register component' })).toBeVisible()
  await fillRequired(page, name)
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Component registered.')
  await expect(row(page, name)).toContainText('24.12.0')
  await expect(row(page, name)).toContainText('Unknown')
})

test('AC2: an endoflife.date product and release fill in the date', async ({ page }) => {
  const name = unique('AC2')
  await page.goto('/components/new')
  await fillRequired(page, name)
  await page.getByLabel('endoflife.date product').fill('nodejs')
  await page.getByLabel('endoflife.date release').fill('24')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(row(page, name)).toContainText('2028-04-30')
  await expect(row(page, name)).toContainText('endoflife.date')
})

test('AC3: a manual date is shown with source Manual', async ({ page }) => {
  const name = unique('AC3')
  await page.goto('/components/new')
  await fillRequired(page, name)
  await page.getByLabel('End-of-support date').fill('2027-06-30')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(row(page, name)).toContainText('2027-06-30')
  await expect(row(page, name)).toContainText('Manual')
})

test('a release with no announced date is saved without a date and the user is told', async ({
  page,
}) => {
  const name = unique('NoDate')
  await page.goto('/components/new')
  await fillRequired(page, name)
  await page.getByLabel('endoflife.date product').fill('nodejs')
  await page.getByLabel('endoflife.date release').fill('26')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.getByRole('status')).toContainText('no announced end of support')
  await expect(row(page, name)).toContainText('Unknown')
})

test('E1/E3: missing fields show per-field errors and keep what was typed', async ({ page }) => {
  await page.goto('/components/new')
  await page.getByLabel('Version').fill('1.0')
  await page.getByLabel('Owner').fill('Kept owner')
  await page.getByLabel('endoflife.date product').fill('nodejs')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.locator('.error-summary')).toHaveText('Check the highlighted fields.')
  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#name-error')).toHaveText('Enter a value.')
  await expect(page.locator('#eolRelease-error')).toHaveText('Enter the release too.')
  await expect(page.getByLabel('Owner')).toHaveValue('Kept owner')
  await expect(page.getByLabel('Version')).toHaveValue('1.0')
  await expect(page.getByLabel('endoflife.date product')).toHaveValue('nodejs')
})

test('E4: a product with disallowed characters is rejected', async ({ page }) => {
  await page.goto('/components/new')
  await fillRequired(page, unique('E4'))
  await page.getByLabel('endoflife.date product').fill('../admin')
  await page.getByLabel('endoflife.date release').fill('24')
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.locator('#eolProduct-error')).toContainText('Use lowercase letters')
})

test('E5: a product not on endoflife.date is reported on the product field, nothing saved', async ({
  page,
}) => {
  const name = unique('E5')
  await page.goto('/components/new')
  await fillRequired(page, name)
  await page.getByLabel('endoflife.date product').fill('nodejs')
  await page.getByLabel('endoflife.date release').fill('999')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.locator('#eolProduct-error')).toContainText('Not found on endoflife.date')
  await expect(page.getByLabel('Name')).toHaveValue(name)
  await page.goto('/')
  await expect(row(page, name)).toHaveCount(0)
})

test('E6: endoflife.date unavailable is reported, nothing saved, values kept', async ({ page }) => {
  const name = unique('E6')
  await page.goto('/components/new')
  await fillRequired(page, name)
  await page.getByLabel('endoflife.date product').fill('broken')
  await page.getByLabel('endoflife.date release').fill('1')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.locator('.error-summary')).toContainText('endoflife.date could not be reached')
  await expect(page.getByLabel('Name')).toHaveValue(name)
  await page.goto('/')
  await expect(row(page, name)).toHaveCount(0)
})

test('E7: an invalid manual date is rejected', async ({ page }) => {
  await page.goto('/components/new')
  await fillRequired(page, unique('E7'))
  // A date input only accepts valid dates, so send the raw form value directly.
  await page.locator('#manualEndOfSupport').evaluate((input: HTMLInputElement) => {
    input.type = 'text'
    input.value = '2026-02-30'
  })
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.locator('#manualEndOfSupport-error')).toHaveText(
    'Enter a valid date (YYYY-MM-DD).',
  )
})

test('AC14: posting to the register page without an identity is rejected', async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL, extraHTTPHeaders: {} })
  const response = await anonymous.post('/components/new', { form: { name: 'x' } })
  expect(response.status()).toBe(401)
  await anonymous.dispose()
})

test('the form is labelled and the error summary is announced', async ({ page }) => {
  await page.goto('/components/new')
  for (const label of [
    'Name',
    'Version',
    'Where used',
    'Owner',
    'endoflife.date product',
    'endoflife.date release',
    'End-of-support date',
  ]) {
    await expect(page.getByLabel(label)).toBeVisible()
  }
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)
})
