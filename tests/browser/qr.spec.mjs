import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
const owner = { id: 'demo-1', token: 'qr-browser-test', name: 'Owner', role: 'owner' };

for (const slot of [2, 3, 4]) {
  test(`Staff account ${slot} displays ten stable QR codes without rotation controls at iPhone width`, async ({ page }, testInfo) => {
    const staff = { id: 'demo-' + slot, token: 'qr-staff-test-' + slot, name: 'Staff ' + slot, role: 'admin' };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(identity => {
      localStorage.setItem('prod-demo-staff', JSON.stringify(identity));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedLink = text; } } });
    }, staff);
    await page.route('**/api/**', async route => {
      const responses = { '/api/menu': starterCatalog, '/api/staff/me': staff, '/api/staff/state': { orders: [], visits: {}, summaries: [] } };
      await route.fulfill({ json: responses[new URL(route.request().url()).pathname] });
    });
    await page.goto('/admin');
    await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
    await expect(page.locator('.qr-grid article')).toHaveCount(10);
    await expect(page.locator('.qr-grid img')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'เปลี่ยน QR ใบนี้', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'จัดการเมนู', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'บัญชีร้าน', exact: true })).toHaveCount(0);
    const links = () => page.locator('.qr-grid a').filter({ hasText: 'เปิดหน้าสั่งอาหาร' }).evaluateAll(nodes => nodes.map(node => node.href));
    const first = await links();
    expect(new Set(first).size).toBe(10);
    const remote = page.locator('.qr-grid article').filter({ hasText: 'กลับบ้าน · สั่งล่วงหน้า / LINE' });
    await remote.getByRole('button', { name: 'คัดลอกลิงก์', exact: true }).click();
    expect(await page.evaluate(() => window.copiedLink)).toBe(first[9]);
    await page.getByRole('button', { name: 'โหลด QR เดิม', exact: true }).click();
    expect(await links()).toEqual(first);
    await page.getByRole('button', { name: 'โต๊ะ / POS', exact: true }).click();
    await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
    await expect(page.locator('.qr-grid article')).toHaveCount(10);
    expect(await links()).toEqual(first);
    await page.reload();
    await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
    await expect(page.locator('.qr-grid article')).toHaveCount(10);
    expect(await links()).toEqual(first);
    await expect(page.getByRole('button', { name: 'เปลี่ยน QR ใบนี้', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('qr-staff-iphone-width.png'), fullPage: true });
  });
}

test('QR view has ten stable links, copies LINE link and rotates only the confirmed card', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(identity => {
    localStorage.setItem('prod-demo-staff', JSON.stringify(identity));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedLink = text; } } });
  }, owner);
  await page.route('**/api/**', async route => {
    const responses = { '/api/menu': starterCatalog, '/api/staff/me': owner, '/api/staff/state': { orders: [], visits: {}, summaries: [] } };
    await route.fulfill({ json: responses[new URL(route.request().url()).pathname] });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
  await expect(page.locator('.qr-grid article')).toHaveCount(10);
  const links = () => page.locator('.qr-grid a').filter({ hasText: 'เปิดหน้าสั่งอาหาร' }).evaluateAll(nodes => nodes.map(node => node.href));
  await page.screenshot({ path: testInfo.outputPath('qr-iphone-width.png'), fullPage: true });
  const first = await links(); expect(new Set(first).size).toBe(10);
  await page.getByRole('button', { name: 'โหลด QR เดิม', exact: true }).click();
  expect(await links()).toEqual(first);
  await page.getByRole('button', { name: 'โต๊ะ / POS', exact: true }).click();
  await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
  await expect(page.locator('.qr-grid article')).toHaveCount(10);
  expect(await links()).toEqual(first);
  const remote = page.locator('.qr-grid article').filter({ hasText: 'กลับบ้าน · สั่งล่วงหน้า / LINE' });
  await remote.getByRole('button', { name: 'คัดลอกลิงก์', exact: true }).click();
  expect(await page.evaluate(() => window.copiedLink)).toBe(first[9]);
  page.once('dialog', dialog => dialog.dismiss());
  await remote.getByRole('button', { name: 'เปลี่ยน QR ใบนี้', exact: true }).click();
  expect(await links()).toEqual(first);
  page.once('dialog', dialog => dialog.accept());
  await remote.getByRole('button', { name: 'เปลี่ยน QR ใบนี้', exact: true }).click();
  await expect.poll(async () => (await links())[9]).not.toBe(first[9]);
  const after = await links(); expect(after.slice(0, 9)).toEqual(first.slice(0, 9));
  await page.reload();
  await page.getByRole('button', { name: 'QR โต๊ะ', exact: true }).click();
  await expect(page.locator('.qr-grid article')).toHaveCount(10);
  expect(await links()).toEqual(after);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
