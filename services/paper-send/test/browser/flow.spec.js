import { test, expect } from '@playwright/test';
import { pdfBytes, address } from '../helpers.js';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`complete demo on ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByText('Demo mode: try the full flow. No real charges or mail.')).toBeVisible();
    await page.screenshot({ path: `/tmp/papersend-${viewport.width}-home.png`, fullPage: true });
    await page.getByRole('button', { name: 'Continue to addresses' }).click();
    await expect(page.getByRole('alert')).toHaveText('Choose a PDF first.');
    await page.locator('#document').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: await pdfBytes(2) });
    await page.getByRole('button', { name: 'Continue to addresses' }).click();
    for (const side of ['recipient', 'sender']) for (const [field, value] of Object.entries(address)) if (field !== 'address_country') await page.locator(`#${side}-${field}`).fill(value);
    await page.getByRole('button', { name: 'Prepare my letter' }).click();
    await expect(page.getByRole('heading', { name: 'One last look.' })).toBeVisible();
    await expect(page.locator('#price')).toHaveText('$5.24');
    await expect(page.getByRole('button', { name: 'Simulate payment & mailing' })).toBeDisabled();
    await expect(page.locator('#preview')).toHaveJSProperty('complete', true);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('#page-label')).toHaveText('Page 2 of 2');
    await page.screenshot({ path: `/tmp/papersend-${viewport.width}-review.png`, fullPage: true });
    await page.locator('#confirmed').check();
    await page.getByRole('button', { name: 'Simulate payment & mailing' }).click();
    await expect(page.getByRole('heading', { name: 'Your demo letter is complete.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your demo letter is complete.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
