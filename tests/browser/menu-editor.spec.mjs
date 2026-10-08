import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';

const identity = { id: 'demo-1', token: 'menu-browser-test-only', name: 'Owner', role: 'owner' };

async function openMenu(page) {
  let catalog = structuredClone(starterCatalog);
  const creates = [];
  const edits = [];
  await page.addInitScript(staff => localStorage.setItem('prod-demo-staff', JSON.stringify(staff)), identity);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/staff/menu/create') {
      creates.push({ route, input: route.request().postDataJSON() });
      return;
    }
    if (path === '/api/staff/menu') {
      const input = route.request().postDataJSON();
      edits.push(input);
      catalog = catalog.map(item => item.code === input.code ? { ...item, available: input.available,
        variants: item.variants.map(variant => ({ ...variant, priceSatang: input.prices[variant.code] })) } : item);
      await route.fulfill({ json: {} });
      return;
    }
    const responses = {
      '/api/menu': catalog,
      '/api/staff/me': identity,
      '/api/staff/state': { orders: [], visits: {}, summaries: [] },
    };
    if (!(path in responses)) throw new Error('Unexpected API request: ' + path);
    await route.fulfill({ json: responses[path] });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'จัดการเมนู', exact: true }).click();
  return { creates, edits, async succeed(index) {
    const { input, route } = creates[index];
    const item = { ...input, available: true,
      categoryName: catalog.find(item => item.category === input.category).categoryName,
      groups: input.optionGroupCodes.map(code => catalog.flatMap(item => item.groups).find(group => group.code === code)),
    };
    catalog.push(item);
    await route.fulfill({ json: item });
  } };
}

test('owner creation keeps the same draft after failure, blocks double submission, and refreshes after retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { creates, succeed } = await openMenu(page);
  await page.getByRole('button', { name: 'เพิ่มเมนูใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('ก๋วยเตี๋ยวสูตรเจ้าของ');
  await page.getByRole('combobox', { name: 'หมวดหมู่', exact: true }).selectOption('rice');
  await page.getByLabel('หน่วยขาย', { exact: true }).fill('จาน');
  await page.getByLabel('คำอธิบายเมนู (ไม่บังคับ)', { exact: true }).fill('สูตรใหม่ประจำร้าน');
  await page.getByLabel('ชื่อขนาด 1', { exact: true }).fill('ปกติ');
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('55.50');
  await page.getByRole('button', { name: 'เพิ่มขนาด / ราคา', exact: true }).click();
  await page.getByLabel('ชื่อขนาด 2', { exact: true }).fill('พิเศษ');
  await page.getByLabel('ราคาขนาด 2 (บาท)', { exact: true }).fill('65');
  await page.getByRole('checkbox', { name: /^เพิ่มพิเศษ / }).check();
  await page.getByLabel('หมายเหตุที่ลูกค้าเลือกได้ (ไม่บังคับ)', { exact: false }).fill('ไม่ใส่ผัก\nไม่ใส่กระเทียม');
  const controls = page.locator('.menu-editor input:not([type=checkbox]), .menu-editor select, .menu-editor button');
  expect(await controls.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 56))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect.poll(() => creates.length).toBe(1);
  await expect(page.getByRole('button', { name: 'กำลังบันทึก…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'กลับ', exact: true })).toBeDisabled();
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toBeDisabled();
  await page.locator('.menu-editor form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(creates).toHaveLength(1);
  expect(creates[0].input).toMatchObject({ code: expect.stringMatching(/^menu-[a-z0-9-]+$/), name: 'ก๋วยเตี๋ยวสูตรเจ้าของ', category: 'rice',
    description: 'สูตรใหม่ประจำร้าน', unit: 'จาน', optionGroupCodes: ['topping'], prepNotes: ['ไม่ใส่ผัก', 'ไม่ใส่กระเทียม'],
    variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 5550 }, { code: expect.stringMatching(/^size-/), name: 'พิเศษ', priceSatang: 6500 }] });

  await creates[0].route.fulfill({ status: 503, json: { error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' } });
  await expect(page.getByRole('alert')).toHaveText('บันทึกไม่สำเร็จ ลองอีกครั้ง');
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('ก๋วยเตี๋ยวสูตรเจ้าของ');
  await expect(page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true })).toHaveValue('55.50');
  await expect(page.getByLabel('ชื่อขนาด 2', { exact: true })).toHaveValue('พิเศษ');
  await expect(page.getByRole('checkbox', { name: /^เพิ่มพิเศษ / })).toBeChecked();
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect.poll(() => creates.length).toBe(2);
  expect(creates[1].input).toEqual(creates[0].input);
  await succeed(1);
  await expect(page.getByRole('status')).toHaveText('เพิ่มเมนูแล้ว ลูกค้าสามารถสั่งเมนูนี้ได้');
  const row = page.locator('.inventory-row').filter({ has: page.getByRole('heading', { name: 'ก๋วยเตี๋ยวสูตรเจ้าของ', exact: true }) });
  await expect(row).toContainText('55.5 บาท');
  await expect(row).toContainText('พร้อมขาย');
  await page.getByRole('button', { name: 'เพิ่มเมนูใหม่', exact: true }).click();
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('ชื่อขนาด 2', { exact: true })).toHaveCount(0);
});

test('owner creation rejects non-decimal baht without sending a request or discarding the draft', async ({ page }) => {
  const { creates } = await openMenu(page);
  await page.getByRole('button', { name: 'เพิ่มเมนูใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('ราคาที่ต้องแก้');
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('1e3');
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('กรุณาใส่จำนวนเงินบาท');
  expect(creates).toHaveLength(0);
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('ราคาที่ต้องแก้');
  await expect(page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true })).toHaveValue('1e3');
  await expect(page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true })).toBeEnabled();
});

test('existing menu price and availability editing still saves and refreshes the inventory', async ({ page }) => {
  const { edits } = await openMenu(page);
  const row = page.locator('.inventory-row').filter({ has: page.getByRole('heading', { name: 'ชามโปรดหมูแผ่น', exact: true }) });
  await row.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await page.getByLabel('ราคาธรรมดา (บาท)', { exact: true }).fill('52.50');
  await page.getByLabel('เปิดขายเมนูนี้', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'บันทึกเมนู', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('บันทึกเมนูแล้ว ออเดอร์เก่าใช้ราคาเดิม');
  expect(edits).toEqual([{ code: 'soft-pork-noodles', prices: { normal: 5250, special: 6000 }, available: false }]);
  await expect(row).toContainText('52.5 บาท');
  await expect(row).toContainText('ปิดขายชั่วคราว');
});
