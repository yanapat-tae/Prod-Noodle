import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { starterCatalog } from '../../src/catalog.ts';
import { salesReport } from '../../src/domain.ts';

const identity = { id: 'demo-1', token: 'browser-test-only', name: 'Owner', role: 'owner' };
const period = '2026-10-05';
const emptyReport = salesReport([], [], period);

function report(gross) {
  return { ...emptyReport, gross, net: gross, count: 1, average: gross,
    channels: emptyReport.channels.map((channel, index) => ({ ...channel, value: index === 0 ? gross : 0 })) };
}

async function waitForRequest(page, index, expectedPeriod) {
  await expect.poll(() => page.evaluate(i => window.reportRequests[i]?.period, index)).toBe(expectedPeriod);
}

async function settle(page, index, result, error) {
  await page.evaluate(({ index, result, error }) => {
    const request = window.reportRequests[index];
    if (error) request.reject(new Error(error));
    else request.resolve(result);
    // Let React commit the response before assertions, including ignored responses.
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { index, result, error });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T05:00:00Z'));
  await page.addInitScript(staff => localStorage.setItem('prod-demo-staff', JSON.stringify(staff)), identity);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      '/api/menu': starterCatalog,
      '/api/staff/me': identity,
      '/api/staff/state': { orders: [], visits: {}, summaries: [] },
    };
    if (!(path in responses)) throw new Error('Unexpected API request: ' + path);
    await route.fulfill({ json: responses[path] });
  });
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'ยอดขาย', exact: true })).toBeVisible();
  // Control only the report API boundary; render the actual app, controls and CSV exporter.
  await page.evaluate(async () => {
    const { api } = await import('/src/api.ts');
    window.reportRequests = [];
    api.report = (_identity, period) => new Promise((resolve, reject) => {
      window.reportRequests.push({ period, resolve, reject });
    });
  });
  await page.getByRole('button', { name: 'ยอดขาย', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.reportRequests.length)).toBeGreaterThan(0);
  await page.evaluate(data => window.reportRequests.forEach(request => request.resolve(data)), report(10000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('100 บาท');
  const index = await page.evaluate(() => window.reportRequests.length);
  await page.getByLabel('วันที่', { exact: true }).fill(period);
  await waitForRequest(page, index, period);
  await settle(page, index, report(10000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('100 บาท');
  await page.evaluate(() => { window.reportRequests = []; });
});

test('changing day hides previous figures and prevents export until the new report arrives', async ({ page }) => {
  await page.getByLabel('วันที่', { exact: true }).fill('2026-10-06');
  await waitForRequest(page, 0, '2026-10-06');
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await expect(page.locator('.kpi-grid')).toHaveCount(0);
  await settle(page, 0, report(20000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('200 บาท');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออก CSV' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('prod-sales-2026-10-06.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('"2026-10-06","ทานที่ร้าน","200.00"');
  expect(csv).not.toContain('"100.00"');
});

test('month selection does not export the previous daily report', async ({ page }) => {
  await page.getByLabel('รวมทั้งเดือน').check();
  await waitForRequest(page, 0, '2026-10');
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await settle(page, 0, report(30000));
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออก CSV' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('prod-sales-2026-10.csv');
  expect(await readFile(await download.path(), 'utf8')).toContain('"2026-10","ทานที่ร้าน","300.00"');
});

test('failed period loads hide old totals, stop loading and allow retry', async ({ page }) => {
  await page.getByLabel('วันที่', { exact: true }).fill('2026-10-06');
  await waitForRequest(page, 0, '2026-10-06');
  await settle(page, 0, null, 'โหลดรายงานไม่สำเร็จ');
  await expect(page.getByRole('alert')).toHaveText('โหลดรายงานไม่สำเร็จ');
  await expect(page.getByText('กำลังโหลดรายงาน…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await expect(page.locator('.kpi-grid')).toHaveCount(0);
  await page.getByRole('button', { name: '↻ อัปเดตยอด', exact: true }).click();
  await waitForRequest(page, 1, '2026-10-06');
  await settle(page, 1, emptyReport);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.kpi-grid article').first()).toContainText('0 บาท');
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeEnabled();
});

test('a late manual refresh cannot overwrite the newly selected period', async ({ page }) => {
  await page.getByRole('button', { name: '↻ อัปเดตยอด', exact: true }).click();
  await waitForRequest(page, 0, period);
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await page.getByLabel('วันที่', { exact: true }).fill('2026-10-06');
  await waitForRequest(page, 1, '2026-10-06');
  await settle(page, 1, report(20000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('200 บาท');
  await settle(page, 0, report(90000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('200 บาท');
});

test('clearing the date asks for a date and prevents requests and exports', async ({ page }) => {
  await page.getByLabel('วันที่', { exact: true }).fill('');
  await expect(page.getByRole('alert')).toHaveText('กรุณาเลือกวันที่');
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '↻ อัปเดตยอด', exact: true })).toBeDisabled();
  await expect(page.locator('.kpi-grid')).toHaveCount(0);
  expect(await page.evaluate(() => window.reportRequests.length)).toBe(0);
});

test('returning to a previous period still waits for its new request', async ({ page }) => {
  await page.getByLabel('วันที่', { exact: true }).fill('2026-10-06');
  await waitForRequest(page, 0, '2026-10-06');
  await page.getByLabel('วันที่', { exact: true }).fill(period);
  await waitForRequest(page, 1, period);
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await expect(page.locator('.kpi-grid')).toHaveCount(0);
  await settle(page, 0, report(90000));
  await expect(page.getByRole('button', { name: 'ส่งออก CSV' })).toBeDisabled();
  await settle(page, 1, report(40000));
  await expect(page.locator('.kpi-grid article').first()).toContainText('400 บาท');
});

test('a late refresh error cannot replace the new period with an old error', async ({ page }) => {
  await page.getByRole('button', { name: '↻ อัปเดตยอด', exact: true }).click();
  await waitForRequest(page, 0, period);
  await page.getByLabel('วันที่', { exact: true }).fill('2026-10-06');
  await waitForRequest(page, 1, '2026-10-06');
  await settle(page, 1, report(20000));
  await settle(page, 0, null, 'old request failed');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.kpi-grid article').first()).toContainText('200 บาท');
});

test('payment labels and amounts do not overlap at iPhone widths or enlarged text', async ({ page }) => {
 const payments = salesReport([], [], period).payments.map(p => ({ ...p, value: 12345678 }));
 await page.getByRole('button', { name: '↻ อัปเดตยอด', exact: true }).click();
 await waitForRequest(page, 0, period); await settle(page, 0, { ...report(12345678), payments });
 for (const width of [320, 390, 430]) {
  await page.setViewportSize({ width, height: 844 });
  for (const size of ['100%', '200%']) {
   await page.evaluate(s => { document.documentElement.style.fontSize = s; }, size);
   const rows = page.locator('article.panel').filter({ has: page.getByRole('heading', { name: 'ช่องทางชำระเงิน', exact: true }) }).locator('.channel-legend > div');
   await expect(rows).toHaveCount(5);
   for (const row of await rows.all()) {
    const label = await row.locator('span').boundingBox(), amount = await row.locator('strong').boundingBox();
    expect(label.x + label.width <= amount.x + 1 || label.y + label.height <= amount.y + 1).toBe(true);
    const dimensions = await row.locator('span').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
 await page.locator('article.panel').filter({has:page.getByRole('heading',{name:'ช่องทางชำระเงิน',exact:true})}).screenshot({path:'.local-data/payment-mobile.png'});
});

const historyRecords = [1,2].map(n => ({ kind: 'order', id: `00000000-0000-4000-8000-00000000000${n}`, version: String(n).repeat(32), label: 'โต๊ะ '+n, date: '2026-10-05T05:00:00Z', totalSatang: n*10000, paid:true, detail:'ก๋วยเตี๋ยว × 1' }));
test('owner reviews selection/reason, can cancel, and deletion refreshes report only after server confirms', async ({ page }) => {
 let deletions=0;
 await page.route('**/api/staff/sales/history',route=>route.fulfill({json:{records:deletions?[]:historyRecords}}));
 await page.route('**/api/staff/sales/delete',async route=>{
  const body=route.request().postDataJSON(); expect(body.reason).toBe('ทดลองก่อนเปิดร้าน'); expect(body.records).toHaveLength(2);
  expect(body.records[0]).toEqual({kind:'order',id:historyRecords[0].id,version:historyRecords[0].version});
  deletions++; await route.fulfill({json:{ok:true,count:2}});
 });
 await page.getByRole('button',{name:'จัดการประวัติยอดขาย',exact:true}).click();
 await page.getByLabel('เลือกทั้งหมด 2 รายการที่แสดง').check();
 await expect(page.getByRole('button',{name:'ลบรายการที่เลือก',exact:true})).toBeDisabled();
 await page.getByLabel('เหตุผลการลบ').fill('ทดลองก่อนเปิดร้าน');
 await page.getByRole('button',{name:'ลบรายการที่เลือก',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toContainText('ยืนยันลบ 2 รายการ'); expect(deletions).toBe(0);
 await page.setViewportSize({width:390,height:844}); await page.locator('.sales-history').screenshot({path:'.local-data/sales-confirmation-mobile.png'});
 await page.getByRole('button',{name:'กลับไปตรวจรายการ'}).click(); expect(deletions).toBe(0);
 await page.getByRole('button',{name:'ลบรายการที่เลือก',exact:true}).click();
 await page.getByRole('button',{name:'ยืนยันลบประวัติ',exact:true}).click();
 await waitForRequest(page,0,period); await settle(page,0,emptyReport);
 await expect(page.locator('.sales-history')).toContainText('ไม่มีประวัติยอดขายให้ลบ');
 await expect(page.locator('.kpi-grid article').first()).toContainText('0 บาท'); expect(deletions).toBe(1);
});
test('a failed deletion keeps the reviewed payload and request key for a safe retry',async({page})=>{
 const requests=[];
 await page.route('**/api/staff/sales/history',route=>route.fulfill({json:{records:historyRecords}}));
 await page.route('**/api/staff/sales/delete',route=>{
  requests.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  return route.fulfill({status:requests.length<=2?503:200,json:requests.length<=2?{error:'ลองใหม่'}:{ok:true,count:1}});
 });
 await page.getByRole('button',{name:'จัดการประวัติยอดขาย',exact:true}).click();
 await page.locator('.sales-record input').first().check(); await page.getByLabel('เหตุผลการลบ').fill('ทดสอบ');
 await page.getByRole('button',{name:'ลบรายการที่เลือก',exact:true}).click(); await page.getByRole('button',{name:'ยืนยันลบประวัติ',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('ยังยืนยันผลการลบไม่ได้ กรุณาตรวจเน็ต แล้วกดยืนยันอีกครั้ง ระบบจะไม่ลบซ้ำ'); await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('button',{name:'ยืนยันลบประวัติ',exact:true}).click();
 await expect.poll(()=>requests.length).toBe(3); expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
});
test('staff dashboard provides no history deletion controls',async({page})=>{
 await page.route('**/api/staff/me',route=>route.fulfill({json:{...identity,role:'admin'}}));
 await page.reload(); await page.getByRole('button',{name:'ยอดขาย',exact:true}).click();
 await expect(page.getByRole('heading',{name:'ภาพรวมยอดขาย'})).toBeVisible();
 await expect(page.getByRole('button',{name:'จัดการประวัติยอดขาย',exact:true})).toHaveCount(0);
});
