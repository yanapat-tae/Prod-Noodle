import { test, expect } from '@playwright/test';
import { starterCatalog } from '../../src/catalog.ts';
import { friedEggGroup } from '../../src/menu-presets.ts';
async function open(page, item) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === '/api/menu'
          ? [item]
          : path === '/api/customer/session'
            ? { token: 'menu-options', channel: 'dine_in', tableNumber: 1, visitId: 'visit' }
            : [],
    });
  });
  await page.goto('/?table=1');
  await page.getByRole('button', { name: 'เลือกเมนูนี้' }).click();
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
}
test('Ice cream keeps four toppings on size change until corrected and peanuts never consume the quota', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const item = structuredClone(starterCatalog.find((i) => i.code === 'mahachai-ice-cream'));
  item.copy = {
    variantLabel: 'เลือกถ้วย',
    instructions: 'เลือกเครื่องที่ชอบ',
    notesLabel: 'ฝากบอกคนตัก',
    notesPlaceholder: 'เช่น แยกถั่ว',
  };
  await open(page, item);
  await expect(page.getByText('เลือกถ้วย', { exact: false }).first()).toBeVisible();
  await expect(page.getByPlaceholder('เช่น แยกถั่ว')).toBeVisible();
  await expect(page.getByRole('radio', { name: /ถั่วลิสง \(ใส่ให้อยู่แล้ว\)/ })).toBeChecked();
  for (const name of ['ถั่วทอง', 'ฟักทองเชื่อม', 'มันเชื่อม'])
    await page.getByRole('checkbox', { name: new RegExp(name) }).check();
  await page.getByRole('radio', { name: /ใหญ่/ }).check();
  await page.getByRole('checkbox', { name: /ลูกชิด/ }).check();
  await page.getByRole('radio', { name: /เล็ก/ }).check();
  await page.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  await expect(page.getByRole('alert')).toContainText('3');
  await expect(page.getByRole('checkbox', { name: /ลูกชิด/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /ลูกชิด/ }).uncheck();
  await page.getByRole('radio', { name: /ไม่ใส่ถั่วลิสง/ }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('.option-control')
      .evaluateAll((nodes) => nodes.every((n) => n.getBoundingClientRect().height >= 56)),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/menu-options-390.png', fullPage: true });
  await page.getByRole('button', { name: /เพิ่มลงตะกร้า · 30 บาท/ }).click();
  await page.getByRole('button', { name: /ดูตะกร้า/ }).click();
  await expect(page.locator('.cart-line')).toContainText('ไม่ใส่ถั่วลิสง');
  await expect(page.locator('.cart-line')).toContainText('ฟักทองเชื่อม');
});
test('Optional fried egg is removable and disabled choices stay hidden at 430px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  const item = {
    ...structuredClone(starterCatalog.find((i) => i.code === 'water')),
    name: 'ข้าวผัดกระเพรา',
    groups: [structuredClone(friedEggGroup)],
  };
  item.groups[0].options.push({
    code: 'disabled',
    name: 'ตัวเลือกปิด',
    priceSatang: 500,
    enabled: false,
  });
  await open(page, item);
  await expect(page.getByText('ตัวเลือกปิด')).toHaveCount(0);
  const egg = page.getByRole('checkbox', { name: /เพิ่มไข่ดาว/ });
  await egg.check();
  await expect(page.getByRole('button', { name: /เพิ่มลงตะกร้า · 20 บาท/ })).toBeVisible();
  await egg.uncheck();
  await expect(page.getByRole('button', { name: /เพิ่มลงตะกร้า · 10 บาท/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
