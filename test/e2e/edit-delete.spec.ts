import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

// Spec 0001 edit, look up again and delete, end to end (production build, real Postgres,
// endoflife.date stub). Names are unique per test because tests share one database.

function unique(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`
}

function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

async function register(
  page: Page,
  name: string,
  extra: { product?: string; release?: string; date?: string } = {},
) {
  await page.goto('/components/new')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Version').fill('1.0')
  await page.getByLabel('Where used').fill('Billing API')
  await page.getByLabel('Owner').fill('Team A')
  if (extra.product) await page.getByLabel('endoflife.date product').fill(extra.product)
  if (extra.release) await page.getByLabel('endoflife.date release').fill(extra.release)
  if (extra.date) await page.getByLabel('End-of-support date').fill(extra.date)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(row(page, name)).toBeVisible()
}

async function openEdit(page: Page, name: string) {
  await row(page, name)
    .getByRole('link', { name: `Edit ${name}` })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: `Edit ${name}` })).toBeVisible()
}

test('AC6: editing fields and saving updates the component', async ({ page }) => {
  const name = unique('AC6')
  await register(page, name, { date: '2027-01-31' })
  await openEdit(page, name)

  // The form starts with the stored values.
  await expect(page.getByLabel('Owner')).toHaveValue('Team A')
  await expect(page.getByLabel('End-of-support date')).toHaveValue('2027-01-31')

  await page.getByLabel('Owner').fill('Team B')
  await page.getByLabel('Version').fill('2.0')
  await page.getByLabel('End-of-support date').fill('2027-12-31')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('status')).toHaveText('Component updated.')
  await expect(row(page, name)).toContainText('Team B')
  await expect(row(page, name)).toContainText('2.0')
  await expect(row(page, name)).toContainText('2027-12-31')
})

test('AC7: changing the release looks up the new date', async ({ page }) => {
  const name = unique('AC7')
  await register(page, name, { product: 'nodejs', release: '22' })
  await expect(row(page, name)).toContainText('2027-04-30')
  await openEdit(page, name)

  await page.getByLabel('endoflife.date release').fill('24')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(row(page, name)).toContainText('2028-04-30')
  await expect(row(page, name)).toContainText('endoflife.date')
})

test('AC7a: "Look up again" re-checks endoflife.date and reports the result', async ({ page }) => {
  const name = unique('AC7a')
  await register(page, name, { product: 'nodejs', release: '24' })
  await openEdit(page, name)
  await expect(page.getByText('2028-04-30 (from endoflife.date')).toBeVisible()

  await page.getByRole('button', { name: 'Look up again on endoflife.date' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Looked up again: the end-of-support date is unchanged.',
  )
})

test('"Look up again" is only offered for components with a product and release', async ({
  page,
}) => {
  const name = unique('NoEol')
  await register(page, name, { date: '2027-01-31' })
  await openEdit(page, name)
  await expect(page.getByRole('button', { name: 'Look up again on endoflife.date' })).toHaveCount(0)
})

test('editing keeps per-field errors and typed values (E1)', async ({ page }) => {
  const name = unique('EditE1')
  await register(page, name)
  await openEdit(page, name)
  await page.getByLabel('Owner').fill('   ')
  await page.getByLabel('Version').fill('9.9')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.locator('#owner-error')).toHaveText('Enter a value.')
  await expect(page.getByLabel('Version')).toHaveValue('9.9')
  await page.goto('/')
  await expect(row(page, name)).toContainText('Team A')
})

test('AC8: deleting after confirmation removes the component', async ({ page }) => {
  const name = unique('AC8')
  await register(page, name)
  await row(page, name)
    .getByRole('link', { name: `Delete ${name}` })
    .click()

  await expect(page.getByRole('heading', { level: 1, name: `Delete ${name}?` })).toBeVisible()
  await expect(page.getByText('This cannot be undone.')).toBeVisible()
  // Keyboard: the confirmation button is reachable and activates with Enter.
  await page.getByRole('button', { name: 'Delete permanently' }).focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('status')).toHaveText('Component deleted.')
  await expect(row(page, name)).toHaveCount(0)
})

test('cancelling the delete keeps the component', async ({ page }) => {
  const name = unique('Cancel')
  await register(page, name)
  await row(page, name)
    .getByRole('link', { name: `Delete ${name}` })
    .click()
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Edit ${name}` })).toBeVisible()
  await page.goto('/')
  await expect(row(page, name)).toHaveCount(1)
})

test('E8: editing or deleting a component that no longer exists returns to the list', async ({
  page,
}) => {
  const name = unique('E8')
  await register(page, name)
  await openEdit(page, name)
  const editUrl = page.url()
  const deleteUrl = editUrl.replace(/\/edit$/, '/delete')

  // Someone else deletes it.
  await page.goto(deleteUrl)
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByRole('status')).toHaveText('Component deleted.')

  await page.goto(editUrl)
  await expect(page.getByRole('status')).toHaveText('That component no longer exists.')
  await page.goto(deleteUrl)
  await expect(page.getByRole('status')).toHaveText('That component no longer exists.')
})

test('an id that is not a UUID is treated as not found', async ({ page }) => {
  await page.goto('/components/not-a-uuid/edit')
  await expect(page.getByRole('status')).toHaveText('That component no longer exists.')
})

test('unknown notice codes in the URL are ignored', async ({ page }) => {
  await page.goto('/?notice=%3Cscript%3Ealert(1)%3C%2Fscript%3E')
  await expect(page.getByRole('status')).toHaveCount(0)
})
