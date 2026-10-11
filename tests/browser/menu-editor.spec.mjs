import { test, expect } from '@playwright/test';
import { starterCatalog, menuCategories } from '../../src/catalog.ts';
import { applyMenuMutation, publicCatalog } from '../../src/menu-admin.ts';
const identity = { id: 'demo-1', token: 'menu-browser-test-only', name: 'Owner', role: 'owner' };
async function openMenu(page, { archived = false, intercept } = {}) {
  let items = structuredClone(starterCatalog).map((i) => ({ ...i, revision: 1, archived }));
  const mutations = [];
  const cache = new Map();
  await page.addInitScript(
    (staff) => localStorage.setItem('prod-demo-staff', JSON.stringify(staff)),
    identity,
  );
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === '/api/staff/menu/manage' && req.method() === 'POST') {
      const payload = req.postDataJSON(),
        key = req.headers()['idempotency-key'];
      mutations.push({ payload, key });
      const commit = () => {
        if (!cache.has(key)) {
          items = applyMenuMutation(items, menuCategories, payload);
          cache.set(key, true);
        }
      };
      if (intercept && (await intercept({ route, payload, key, commit, index: mutations.length })))
        return;
      try {
        commit();
        await route.fulfill({ json: { ok: true } });
      } catch (e) {
        await route.fulfill({ status: e.code ?? 400, json: { error: e.message } });
      }
      return;
    }
    const bodies = {
      '/api/menu': publicCatalog(items),
      '/api/staff/menu/manage': { items, categories: menuCategories },
      '/api/staff/me': identity,
      '/api/staff/state': { orders: [], visits: {}, summaries: [] },
    };
    if (!(path in bodies)) throw new Error('Unexpected request ' + path);
    await route.fulfill({ json: bodies[path] });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'จัดการเมนู', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เพิ่มเมนูใหม่', exact: true })).toBeEnabled();
  return { mutations };
}
const row = (page, name) =>
  page.locator('.inventory-row').filter({ has: page.getByRole('heading', { name, exact: true }) });
async function createDraft(page) {
  await page.getByRole('button', { name: 'เพิ่มเมนูใหม่', exact: true }).click();
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('เมนูใหม่ทดสอบ');
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('55.50');
}
test('Full editor creates variants, modifiers and customer copy; preview uses the same choices without sending orders', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { mutations } = await openMenu(page);
  await createDraft(page);
  await page.getByLabel('หมวดหมู่', { exact: true }).selectOption('rice');
  await page.getByLabel('หน่วยขาย', { exact: true }).fill('จาน');
  await page.getByRole('button', { name: 'เพิ่มขนาด / ราคา', exact: true }).click();
  await page.getByLabel('ชื่อขนาด 2', { exact: true }).fill('พิเศษ');
  await page.getByLabel('ราคาขนาด 2 (บาท)', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'เพิ่มกลุ่มตัวเลือก', exact: true }).click();
  await page.getByLabel('ชื่อกลุ่ม 1', { exact: true }).fill('เพิ่มพิเศษ');
  await page.getByLabel('ชื่อตัวเลือก 1.1', { exact: true }).fill('เพิ่มไข่ดาว');
  await page.getByLabel('ราคาตัวเลือก 1.1 (บาท)', { exact: true }).fill('10');
  await page.getByLabel('หัวข้อเลือกขนาด', { exact: true }).fill('เลือกจาน');
  await page
    .getByRole('textbox', { name: 'ข้อความแนะนำลูกค้า', exact: true })
    .fill('เลือกสูตรที่ชอบ');
  await page
    .getByRole('textbox', { name: 'ข้อความตัวอย่างหมายเหตุ', exact: true })
    .fill('เช่น แยกไข่');
  await page.getByRole('button', { name: 'ดูตัวอย่างหน้าลูกค้า', exact: true }).click();
  await expect(page.locator('.menu-preview')).toContainText('เลือกจาน');
  await expect(page.getByPlaceholder('เช่น แยกไข่')).toBeVisible();
  await page.getByRole('checkbox', { name: /เพิ่มไข่ดาว/ }).check();
  await page.getByRole('button', { name: /ลองเพิ่มรายการ · 65.5 บาท/ }).click();
  await expect(page.locator('.success-message')).toContainText('เพิ่มไข่ดาว');
  expect(mutations).toHaveLength(0);
  await page.getByRole('button', { name: 'กลับไปแก้ไข', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('.menu-editor input:not([type=checkbox]), .menu-editor select, .menu-editor button')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => n.getBoundingClientRect().height)
          .every((n) => n.getBoundingClientRect().height >= 56),
      ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/menu-editor-390.png', fullPage: true });
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(row(page, 'เมนูใหม่ทดสอบ')).toBeVisible();
  expect(mutations[0].payload.menu).toMatchObject({
    category: 'rice',
    unit: 'จาน',
    variants: [{ priceSatang: 5550 }, { priceSatang: 6500 }],
    copy: { variantLabel: 'เลือกจาน' },
    groups: [{ options: [{ name: 'เพิ่มไข่ดาว', priceSatang: 1000 }] }],
  });
});
test('Save retains draft and key after lost responses, blocks double submit and retries only once on the server', async ({
  page,
}) => {
  let saved = 0;
  let release;
  const { mutations } = await openMenu(page, {
    intercept: async ({ route, index, commit }) => {
      if (index === 1) {
        await new Promise((r) => (release = r));
        commit();
        saved++;
        await route.abort('failed');
        return true;
      }
      if (index === 2) {
        await route.abort('failed');
        return true;
      }
      return false;
    },
  });
  await createDraft(page);
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect.poll(() => mutations.length).toBe(1);
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'กลับ', exact: true })).toBeDisabled();
  await page
    .locator('.menu-editor form')
    .evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
  expect(mutations).toHaveLength(1);
  release();
  await expect(page.getByRole('alert')).toContainText('ยังยืนยันการบันทึกไม่ได้');
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('เมนูใหม่ทดสอบ');
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(row(page, 'เมนูใหม่ทดสอบ')).toBeVisible();
  expect(new Set(mutations.map((m) => m.key)).size).toBe(1);
  expect(saved).toBe(1);
});
test('Existing full edits retain draft on stale revision; owner can load current data explicitly', async ({
  page,
}) => {
  const { mutations } = await openMenu(page, {
    intercept: async ({ route }) => {
      await route.fulfill({
        status: 409,
        json: { error: 'เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก' },
      });
      return true;
    },
  });
  await row(page, 'ไอศกรีมมหาชัย').getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('ไอศกรีมสูตรใหม่');
  await page.getByLabel('สูงสุด เล็ก กลุ่ม 1', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'บันทึกเมนู', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('เมนูถูกแก้ไขแล้ว');
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('ไอศกรีมสูตรใหม่');
  expect(mutations[0].payload.menu.groups[0].limitsByVariant.normal.max).toBe(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'โหลดเมนูล่าสุดแทนฉบับนี้', exact: true }).click();
  await expect(page.getByLabel('ชื่อเมนู', { exact: true })).toHaveValue('ไอศกรีมมหาชัย');
});
test('Owner reorders within a category, archives/restores and can create after all dishes are archived', async ({
  page,
}) => {
  const { mutations } = await openMenu(page);
  await page.getByLabel('กรองหมวดหมู่', { exact: true }).selectOption('desserts');
  await row(page, 'ไอศกรีมมหาชัย').getByRole('button', { name: 'เลื่อนขึ้น', exact: true }).click();
  await expect(page.locator('.inventory-row').first()).toContainText('ไอศกรีมมหาชัย');
  expect(mutations[0].payload.kind).toBe('reorder');
  page.once('dialog', (d) => d.accept());
  await row(page, 'ไอศกรีมมหาชัย').getByRole('button', { name: 'ลบเมนู', exact: true }).click();
  await expect(row(page, 'ไอศกรีมมหาชัย')).toHaveCount(0);
  await page.getByLabel('แสดงเมนูที่ลบแล้ว', { exact: true }).check();
  await row(page, 'ไอศกรีมมหาชัย').getByRole('button', { name: 'กู้คืนเมนู', exact: true }).click();
  await expect(row(page, 'ไอศกรีมมหาชัย')).toHaveCount(0);
  await page.getByLabel('แสดงเมนูที่ลบแล้ว', { exact: true }).uncheck();
  await expect(row(page, 'ไอศกรีมมหาชัย')).toBeVisible();
});
test('All-archived categories remain selectable and malformed prices or names do not send requests', async ({
  page,
}) => {
  const { mutations } = await openMenu(page, { archived: true });
  await createDraft(page);
  await page.getByLabel('หมวดหมู่', { exact: true }).selectOption('desserts');
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('1e3');
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('กรุณาใส่จำนวนเงินบาท');
  expect(mutations).toHaveLength(0);
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('25');
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ชื่อเมนู');
  expect(mutations).toHaveLength(0);
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('ขนมใหม่');
  await page.getByRole('button', { name: 'บันทึกเมนูใหม่', exact: true }).click();
  await expect(row(page, 'ขนมใหม่')).toBeVisible();
});
test('Existing menu saves name, price, availability and independent group choices', async ({
  page,
}) => {
  const { mutations } = await openMenu(page);
  await row(page, 'ชามโปรดหมูแผ่น').getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await page.getByLabel('ชื่อเมนู', { exact: true }).fill('ชามโปรดสูตรใหม่');
  await page.getByLabel('ราคาขนาด 1 (บาท)', { exact: true }).fill('52.50');
  await page.getByLabel('เปิดขายเมนูนี้', { exact: true }).uncheck();
  await page.getByLabel('ชื่อตัวเลือก 1.1', { exact: true }).fill('เส้นชื่อใหม่');
  await page.getByRole('button', { name: 'บันทึกเมนู', exact: true }).click();
  await expect(row(page, 'ชามโปรดสูตรใหม่')).toContainText('52.5 บาท');
  await expect(row(page, 'ชามโปรดสูตรใหม่')).toContainText('ปิดขายชั่วคราว');
  expect(mutations[0].payload.menu.groups[0].options[0].name).toBe('เส้นชื่อใหม่');
  await row(page, 'ชามโปรดหมูท่วม').getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await expect(page.getByLabel('ชื่อตัวเลือก 1.1', { exact: true })).toHaveValue('เส้นเล็ก');
});
