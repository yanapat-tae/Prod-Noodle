import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
import { priceLine } from '../../src/domain.ts';

const identity = { id: 'demo-2', token: 'sound-test', name: 'Staff', role: 'admin' };
function order(id) { return { id, channel: 'dine_in', tableNumber: 1, queueNumber: null, visitId: 'visit-1', status: 'new', lines: [priceLine(starterCatalog, { itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] })], totalSatang: 1000, createdAt: '2026-10-10T05:00:00Z', paidAt: null, paymentMethod: null, refundedAt: null, refundedSatang: 0 }; }
async function setup(page) {
  const data = { orders: [order('initial')], payments: [], fail: false, release: null, delay: false };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(staff => {
    localStorage.setItem('prod-demo-staff', JSON.stringify(staff));
    window.soundNotes = [];
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = original.call(this), start = oscillator.start.bind(oscillator);
      oscillator.start = when => { window.soundNotes.push({ frequency: oscillator.frequency.value, type: oscillator.type }); start(when); };
      return oscillator;
    };
  }, identity);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/pay')) {
      data.payments.push(route.request().postDataJSON());
      if (data.delay) await new Promise(resolve => { data.release = resolve; });
      if (data.fail) return route.fulfill({ status: 409, json: { error: 'บันทึกไม่สำเร็จ' } });
      data.orders[0] = { ...data.orders[0], paidAt: '2026-10-10T05:01:00Z', paymentMethod: data.payments.at(-1).method };
      return route.fulfill({ json: data.orders[0] });
    }
    const responses = { '/api/menu': starterCatalog, '/api/staff/me': identity, '/api/staff/state': { orders: data.orders, visits: { 1: { id: 'visit-1' } }, summaries: [] } };
    if (!(path in responses)) throw new Error('Unexpected request: ' + path);
    await route.fulfill({ json: responses[path] });
  });
  await page.goto('/admin');
  await expect(page.locator('.ticket')).toHaveCount(1);
  await page.getByRole('button', { name: 'เปิดเสียงแจ้งเตือน', exact: true }).click();
  return data;
}
const notes = page => page.evaluate(() => window.soundNotes);
const clear = page => page.evaluate(() => { window.soundNotes = []; });

test('New orders ring once; reloads and reappearing orders stay silent; previews are distinct', async ({ page }) => {
  const data = await setup(page);
  await expect.poll(() => notes(page)).toEqual([]);
  await page.getByRole('button', { name: 'ลองเสียงออเดอร์เข้า', exact: true }).click();
  const bell = await notes(page); expect(bell.length).toBeGreaterThan(1);
  await clear(page);
  await page.getByRole('button', { name: 'ลองเสียงรับเงิน', exact: true }).click();
  const paid = await notes(page); expect(paid.length).toBeGreaterThan(1); expect(paid).not.toEqual(bell);
  await clear(page);
  data.orders.push(order('new'));
  await expect(page.locator('.ticket')).toHaveCount(2);
  await expect.poll(() => notes(page)).toEqual(bell);
  await clear(page);
  await page.getByRole('button', { name: /^ห้องครัว/ }).click();
  await page.getByRole('button', { name: '↻ โหลดใหม่' }).click();
  expect(await notes(page)).toEqual([]);
  const recent = data.orders.pop();
  await expect(page.locator('.ticket')).toHaveCount(1);
  data.orders.push(recent);
  await expect(page.locator('.ticket')).toHaveCount(2);
  expect(await notes(page)).toEqual([]);
  await page.getByRole('button', { name: 'ปิดเสียงแจ้งเตือน', exact: true }).click();
  data.orders.push(order('muted'));
  await expect(page.locator('.ticket')).toHaveCount(3);
  expect(await notes(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const [label, method] of [['รับเงินสดแล้ว', 'cash'], ['ตรวจยอด PromptPay แล้ว', 'promptpay']]) {
  test(`${method} sound follows server success only, once, on the confirming device`, async ({ page }) => {
    const data = await setup(page);
    await page.getByRole('button', { name: 'ลองเสียงรับเงิน', exact: true }).click();
    const paidSound = await notes(page); await clear(page);
    data.delay = true;
    await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => data.payments.length).toBe(1);
    expect(await notes(page)).toEqual([]);
    await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
    data.release();
    await expect(page.locator('.ticket')).toContainText('✓ ชำระแล้ว');
    await expect.poll(() => notes(page)).toEqual(paidSound);
    expect(data.payments).toEqual([{ method }]);
    await clear(page);
    await page.getByRole('button', { name: /^ห้องครัว/ }).click();
    await page.getByRole('button', { name: '↻ โหลดใหม่' }).click();
    expect(await notes(page)).toEqual([]);
  });
}
test('Failed payment remains unpaid and silent; retry sounds after success', async ({ page }) => {
  const data = await setup(page); data.fail = true;
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await page.getByRole('button', { name: 'ตรวจยอด PromptPay แล้ว', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('บันทึกไม่สำเร็จ');
  expect(await notes(page)).toEqual([]);
  data.fail = false;
  await page.getByRole('button', { name: 'ตรวจยอด PromptPay แล้ว', exact: true }).click();
  await expect(page.locator('.ticket')).toContainText('✓ ชำระแล้ว');
  expect((await notes(page)).length).toBeGreaterThan(1);
});

test('Payments from another device and muted confirmations do not play a receipt sound', async ({ page }) => {
  const data = await setup(page);
  data.orders[0] = { ...data.orders[0], paidAt: '2026-10-10T05:02:00Z', paymentMethod: 'cash' };
  await expect(page.locator('.ticket')).toContainText('✓ ชำระแล้ว');
  expect(await notes(page)).toEqual([]);
  await page.getByRole('button', { name: 'ปิดเสียงแจ้งเตือน', exact: true }).click();
  data.orders.unshift(order('muted-payment'));
  await expect(page.locator('.ticket')).toHaveCount(2);
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await page.getByRole('button', { name: 'รับเงินสดแล้ว', exact: true }).click();
  await expect(page.getByRole('button', { name: 'รับชำระเงิน', exact: true })).toHaveCount(0);
  expect(await notes(page)).toEqual([]);
});

test('Audio failure cannot turn a successfully recorded payment into a failed payment', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { AudioContext.prototype.resume = () => Promise.reject(new Error('audio unavailable')); });
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await page.getByRole('button', { name: 'รับเงินสดแล้ว', exact: true }).click();
  await expect(page.locator('.ticket')).toContainText('✓ ชำระแล้ว');
  await expect(page.getByRole('alert')).toContainText('เสียงหยุดทำงาน');
  await expect(page.getByRole('button', { name: 'เปิดเสียงแจ้งเตือน', exact: true })).toBeVisible();
  expect(await notes(page)).toEqual([]);
});

test('Both cues render audible distinct waveforms with headroom instead of clipping', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const { scheduleStaffSound } = await import('/src/staff-sounds.ts');
    const sounds = [];
    for (const kind of ['order', 'payment']) {
      const context = new OfflineAudioContext(1, 48000 * 2, 48000);
      scheduleStaffSound(context, kind, 0);
      const samples = (await context.startRendering()).getChannelData(0);
      const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      sounds.push({ peak, rms, samples: Array.from(samples.slice(0, 48000).filter((_, i) => i % 200 === 0)) });
    }
    return sounds;
  });
  for (const sound of result) { expect(sound.peak).toBeGreaterThan(0.4); expect(sound.peak).toBeLessThan(1); expect(sound.rms).toBeGreaterThan(0.06); }
  expect(result[0].samples).not.toEqual(result[1].samples);
});
