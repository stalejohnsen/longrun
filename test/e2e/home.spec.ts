import { expect, test } from '@playwright/test'

test('the component list is the home page of the production build', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible()
})
