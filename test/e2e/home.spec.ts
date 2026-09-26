import { expect, test } from '@playwright/test'

test('home page renders from a production build', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Longrun' })).toBeVisible()
})
