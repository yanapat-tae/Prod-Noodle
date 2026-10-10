import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
import { priceLine } from '../../src/domain.ts';
const firstStaff = { id: 'demo-1', token: 'staff-state-first', name: 'First', role: 'owner' };
const secondStaff = { id: 'demo-2', token: 'staff-state-second', name: 'Second', role: 'admin' };
const oldOrder = {
  id: 'delayed-order',
  channel: 'takeaway',
  tableNumber: null,
  queueNumber: 1,
  visitId: null,
  status: 'new',
  lines: [
    priceLine(starterCatalog, {
      itemCode: 'water',
      variantCode: 'normal',
      quantity: 1,
      options: [],
      notes: [],
    }),
  ],
  totalSatang: 1000,
  createdAt: '2026-10-10T05:00:00Z',
  paidAt: null,
  paymentMethod: null,
  refundedAt: null,
  refundedSatang: 0,
};
const state = (orders) => ({ orders, visits: {}, summaries: [] });
async function setup(page) {
  const pending = { hold: false, release: null };
  let restore;
  await page.addInitScript(
    (identity) => localStorage.setItem('prod-demo-staff', JSON.stringify(identity)),
    firstStaff,
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/staff/me') {
      await new Promise((resolve) => {
        restore = resolve;
      });
      return route.fulfill({ json: firstStaff });
    }
    if (path === '/api/staff/login') return route.fulfill({ json: secondStaff });
    if (path === '/api/staff/logout') return route.fulfill({ json: { ok: true } });
    if (path === '/api/staff/state') {
      const second = route.request().headers().authorization?.includes(secondStaff.token);
      if (pending.hold && !second)
        await new Promise((resolve) => {
          pending.release = resolve;
        });
      return route.fulfill({ json: state(second ? [] : [oldOrder]) });
    }
    if (path === '/api/menu') return route.fulfill({ json: starterCatalog });
    throw new Error('Unexpected API: ' + path);
  });
  await page.goto('/admin');
  await expect.poll(() => Boolean(restore)).toBe(true);
  await page.evaluate(async () => {
    const { api } = await import('/src/api.ts');
    api.watch = (_, refresh) => {
      window.staffUpdate = refresh;
      return () => {};
    };
  });
  restore();
  await expect(page.locator('.ticket')).toHaveCount(1);
  return pending;
}

test('A full refresh cannot overwrite a newer realtime payment/status update', async ({ page }) => {
  const pending = await setup(page);
  await page.getByRole('button', { name: /^ห้องครัว/ }).click();
  pending.hold = true;
  await page.getByRole('button', { name: '↻ โหลดใหม่' }).click();
  await expect.poll(() => Boolean(pending.release)).toBe(true);
  await page.evaluate((order) => window.staffUpdate(order), {
    ...oldOrder,
    status: 'served',
    paidAt: '2026-10-10T05:01:00Z',
    paymentMethod: 'cash',
  });
  await expect(page.locator('.ticket')).toHaveCount(0);
  const response = page.waitForResponse('**/api/staff/state');
  pending.release();
  await response;
  await expect(page.locator('.ticket')).toHaveCount(0);
  await page.getByRole('button', { name: 'โต๊ะ / POS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'รับชำระเงิน', exact: true })).toHaveCount(0);
});

test('A previous login’s delayed refresh cannot populate the next staff session', async ({
  page,
}) => {
  const pending = await setup(page);
  await page.getByRole('button', { name: /^ห้องครัว/ }).click();
  pending.hold = true;
  await page.getByRole('button', { name: '↻ โหลดใหม่' }).click();
  await expect.poll(() => Boolean(pending.release)).toBe(true);
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await page.getByLabel('รหัสทดลอง: 1234').fill('1234');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.locator('.staff-topbar')).toContainText('Second');
  const response = page.waitForResponse('**/api/staff/state');
  pending.release();
  await response;
  await expect(page.locator('.ticket')).toHaveCount(0);
});

test('A late audio enable cannot switch sound back on after logout and another login', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    AudioContext.prototype.resume = () =>
      new Promise((resolve) => {
        window.releaseAudio = resolve;
      });
  });
  await page.getByRole('button', { name: 'เปิดเสียงแจ้งเตือน', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.releaseAudio))).toBe(true);
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await page.getByLabel('รหัสทดลอง: 1234').fill('1234');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.locator('.staff-topbar')).toContainText('Second');
  await page.evaluate(async () => {
    window.releaseAudio();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(
    page.getByRole('button', { name: 'เปิดเสียงแจ้งเตือน', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
