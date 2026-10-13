import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
import { demoServiceUsage } from '../../src/service-usage.ts';
const owner = { id: 'demo-1', token: 'usage-browser', name: 'Owner', role: 'owner' };

async function setup(page, identity = owner, usage = demoServiceUsage()) {
  await page.addInitScript(value => localStorage.setItem('prod-demo-staff', JSON.stringify(value)), identity);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const response = { '/api/menu': starterCatalog, '/api/staff/me': identity, '/api/staff/state': { orders: [], visits: {}, summaries: [] }, '/api/staff/usage': usage }[path];
    await route.fulfill({ json: response });
  });
  await page.goto('/admin');
}
test('owner sees truthful two-provider bars and explanatory unknown/unlimited states at iPhone widths', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole('button', { name: 'การใช้โควตา', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Supabase', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cloudflare', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'ฐานข้อมูล', exact: true })).toHaveAttribute('aria-valuenow', '6');
  await expect(page.getByRole('progressbar', { name: 'รูปและไฟล์', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('progressbar', { name: 'การสร้างเว็บ / Builds', exact: true })).toHaveAttribute('aria-valuenow', '8');
  await expect(page.getByRole('progressbar', { name: 'การเรียก API / Edge Functions', exact: true })).toHaveCount(0);
  await expect(page.getByText('ข้อมูลตัวอย่าง · ไม่ใช่ Usage ของร้านจริง')).toBeVisible();
  await expect(page.locator('[data-metric="static-requests"]')).toContainText('ไม่จำกัด');
  await expect(page.locator('[data-metric="pages-functions"]')).toContainText('เว็บนี้ไม่ได้ใช้');
  await page.screenshot({ path: testInfo.outputPath('usage-390.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('refresh errors retain prior data but clearly indicate failure, old snapshots and exceeded quotas', async ({ page }) => {
  const usage = demoServiceUsage(); usage.databaseBytes = 600_000_000;
  usage.snapshots[0].observedAt = new Date(Date.now() - 3 * 86400_000).toISOString();
  await setup(page, owner, usage);
  await page.getByRole('button', { name: 'การใช้โควตา', exact: true }).click();
  await expect(page.locator('[data-metric="database"]')).toContainText('120%');
  await expect(page.locator('[data-metric="database"]')).toContainText('ใกล้เต็มหรือเกินโควตา');
  await expect(page.locator('[data-metric="projects"]')).toContainText('ข้อมูลเก่า');
  await page.route('**/api/staff/usage', route => route.fulfill({ status: 503, json: { error: 'ยังโหลดข้อมูลไม่ได้' } }));
  await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด', exact: true }).click();
  await expect(page.locator('.service-usage [role="alert"]')).toBeVisible();
  await expect(page.locator('[data-metric="database"]')).toContainText('120%');
});
test('staff has no Usage tab while retaining the existing QR tab', async ({ page }) => {
  await setup(page, { ...owner, id: 'demo-2', role: 'admin' });
  await expect(page.getByRole('button', { name: 'การใช้โควตา', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'QR โต๊ะ', exact: true })).toBeVisible();
});
