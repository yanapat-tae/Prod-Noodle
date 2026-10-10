import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
import { priceLine } from '../../src/domain.ts';

const identity = { id: 'demo-2', token: 'kitchen-browser-test', name: 'Staff', role: 'admin' };
async function openKitchen(page, status, fail = false) {
  let order = { id: 'kitchen-order', channel: 'dine_in', tableNumber: 1, queueNumber: null, visitId: 'visit-1', status,
    lines: [priceLine(starterCatalog, { itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] })],
    totalSatang: 1000, createdAt: '2026-10-10T05:00:00Z', paidAt: null, paymentMethod: null, refundedAt: null, refundedSatang: 0 };
  const requests = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(staff => localStorage.setItem('prod-demo-staff', JSON.stringify(staff)), identity);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) {
      const body = route.request().postDataJSON(); requests.push(body);
      if (fail) { await route.fulfill({ status: 409, json: { error: 'สถานะเปลี่ยนไปแล้ว กรุณาโหลดใหม่' } }); return; }
      order = { ...order, status: body.status }; await route.fulfill({ json: order }); return;
    }
    const responses = { '/api/menu': starterCatalog, '/api/staff/me': identity,
      '/api/staff/state': { orders: [order], visits: { 1: { id: 'visit-1' } }, summaries: [] } };
    if (!(path in responses)) throw new Error('Unexpected request: ' + path);
    await route.fulfill({ json: responses[path] });
  });
  await page.goto('/admin');
  await expect(page.locator('.ticket')).toHaveCount(1);
  await page.getByRole('button', { name: /^ห้องครัว/ }).click();
  return requests;
}
for (const status of ['new', 'preparing', 'ready']) {
  test(`Kitchen completes ${status} with one button and retains unpaid order in POS`, async ({ page }) => {
    const requests = await openKitchen(page, status);
    const complete = page.getByRole('button', { name: 'เสร็จ/เสิร์ฟแล้ว', exact: true });
    await expect(complete).toBeVisible();
    await expect(page.getByRole('button', { name: /^(กำลังทำ|พร้อมเสิร์ฟ \/ รับ)$/ })).toHaveCount(0);
    await complete.click();
    await expect(page.locator('.ticket')).toHaveCount(0);
    expect(requests).toEqual([{ status: 'served' }]);
    await page.getByRole('button', { name: 'โต๊ะ / POS', exact: true }).click();
    await expect(page.locator('.ticket')).toContainText('ยังไม่ชำระ');
    await expect(page.locator('.ticket')).toContainText('ส่งมอบแล้ว');
    await expect(page.getByRole('button', { name: 'รับชำระเงิน', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เสร็จ/เสิร์ฟแล้ว', exact: true })).toHaveCount(0);
  });
}
test('Failed kitchen completion keeps the ticket visible and shows the server error', async ({ page }) => {
  await openKitchen(page, 'new', true);
  await page.getByRole('button', { name: 'เสร็จ/เสิร์ฟแล้ว', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('สถานะเปลี่ยนไปแล้ว กรุณาโหลดใหม่');
  await expect(page.locator('.ticket')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'เสร็จ/เสิร์ฟแล้ว', exact: true })).toBeEnabled();
});
