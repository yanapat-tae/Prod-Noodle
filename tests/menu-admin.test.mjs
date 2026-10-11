import test from 'node:test';
import assert from 'node:assert/strict';
import { priceLine } from '../src/domain.ts';
import { starterCatalog } from '../src/catalog.ts';

const categories = [{ code: 'desserts', name: 'ของหวาน' }];
function iceCream() {
  return { ...structuredClone(starterCatalog.find(item => item.code === 'mahachai-ice-cream')), revision: 1, groups: [
    { code: 'ice-toppings', name: 'เลือกเครื่อง', min: 0, max: 4, limitsByVariant: { normal: { min: 0, max: 3 }, special: { min: 0, max: 4 } },
      options: ['ถั่วทอง', 'ฟักทองเชื่อม', 'มันเชื่อม', 'ลูกชิด', 'สับปะรดเชื่อม'].map((name, i) => ({ code: 'topping-' + i, name, priceSatang: 0 })) },
    { code: 'peanuts', name: 'ถั่วลิสง', min: 1, max: 1, options: [{ code: 'include', name: 'ถั่วลิสง (ใส่ให้อยู่แล้ว)', priceSatang: 0, defaultQuantity: 1 }, { code: 'omit', name: 'ไม่ใส่ถั่วลิสง', priceSatang: 0 }] },
  ] };
}
function input(count, variantCode = 'normal', peanut = 'include') {
  return { itemCode: 'mahachai-ice-cream', variantCode, quantity: 1, notes: [], options: [
    ...Array.from({ length: count }, (_, i) => ({ groupCode: 'ice-toppings', optionCode: 'topping-' + i, quantity: 1 })),
    { groupCode: 'peanuts', optionCode: peanut, quantity: 1 },
  ] };
}

test('Ice cream enforces 3/4 toppings by size; peanuts use a separate choice and omission reaches the kitchen', () => {
  const item = iceCream();
  assert.throws(() => priceLine([item], input(4)), /เลือกเครื่อง/);
  assert.equal(priceLine([item], input(3)).totalSatang, 3000);
  assert.equal(priceLine([item], input(4, 'special')).totalSatang, 4000);
  assert.throws(() => priceLine([item], input(5, 'special')), /เลือกเครื่อง/);
  assert.ok(priceLine([item], input(3, 'normal', 'omit')).optionNames.includes('ไม่ใส่ถั่วลิสง'));
});

test('Archived menus and disabled options/groups cannot be ordered from a stale cart', () => {
  const item = iceCream(); item.archived = true;
  assert.throws(() => priceLine([item], input(1)), /ไม่พร้อมขาย/);
  item.archived = false; item.groups[0].options[0].enabled = false;
  assert.throws(() => priceLine([item], input(1)), /ไม่รองรับ/);
  item.groups[0].enabled = false;
  assert.throws(() => priceLine([item], input(1)), /ไม่รองรับ/);
  assert.equal(priceLine([item], input(0)).totalSatang, 3000);
});

test('Full menu edits are immutable, local to one item and guarded by revision', async () => {
  const { menuDefinition, applyMenuMutation } = await import('../src/menu-admin.ts');
  const original = iceCream(); const other = { ...structuredClone(original), code: 'other-dessert' };
  const before = structuredClone([original, other]);
  const menu = menuDefinition(original); menu.name = 'ไอศกรีม'; menu.groups[0].options[0].name = 'ถั่วทองใหม่';
  const updated = applyMenuMutation(before, categories, { kind: 'save', menu, expectedRevision: 1 });
  assert.equal(updated[0].revision, 2);
  assert.equal(updated[0].groups[0].options[0].name, 'ถั่วทองใหม่');
  assert.deepEqual(updated[1], other); assert.deepEqual(before[0], original);
  assert.throws(() => applyMenuMutation(updated, categories, { kind: 'save', menu, expectedRevision: 1 }), error => error.code === 409);
});

test('Archive/restore and category reorder preserve data and reject incomplete or stale order lists', async () => {
  const { applyMenuMutation, publicCatalog } = await import('../src/menu-admin.ts');
  const first = iceCream(), second = { ...structuredClone(first), code: 'second' };
  const reordered = applyMenuMutation([first, second], categories, { kind: 'reorder', category: 'desserts', entries: [{ code: 'second', revision: 1 }, { code: first.code, revision: 1 }] });
  assert.deepEqual(publicCatalog(reordered).map(item => item.code), ['second', first.code]);
  assert.throws(() => applyMenuMutation(reordered, categories, { kind: 'reorder', category: 'desserts', entries: [{ code: 'second', revision: 1 }] }), error => error.code === 409);
  const archived = applyMenuMutation([first], categories, { kind: 'archive', code: first.code, expectedRevision: 1 });
  assert.deepEqual(publicCatalog(archived), []);
  const restored = applyMenuMutation(archived, categories, { kind: 'restore', code: first.code, expectedRevision: 2 });
  assert.equal(restored[0].revision, 3); assert.deepEqual(restored[0].groups, first.groups);
});

test('Menu validation rejects unreachable variant limits, invalid defaults, disabled required choices and unknown fields', async () => {
  const { menuDefinition, validateMenuDefinition } = await import('../src/menu-admin.ts');
  const value = menuDefinition(iceCream());
  assert.equal(validateMenuDefinition(value, categories).groups[0].options[1].name, 'ฟักทองเชื่อม');
  for (const change of [
    v => { v.groups[0].limitsByVariant.unknown = { min: 0, max: 3 }; },
    v => { v.groups[0].options.forEach(o => { o.defaultQuantity = 1; }); },
    v => { v.groups[1].options.forEach(o => { o.enabled = false; }); },
    v => { v.copy.variantLabel = '\0'; },
    v => { v.variants[0].priceSatang = 30.5; },
    v => { v.injected = true; },
    v => { v.groups[0].options[1].code = v.groups[0].options[0].code; },
  ]) {
    const invalid = structuredClone(value); change(invalid);
    assert.throws(() => validateMenuDefinition(invalid, categories));
  }
});

test('Creation still works with all menus archived and public catalog hides disabled choices', async () => {
  const { menuDefinition, applyMenuMutation, publicCatalog } = await import('../src/menu-admin.ts');
  const archived = { ...iceCream(), archived: true };
  const menu = menuDefinition(iceCream()); menu.code = 'new-dessert'; menu.groups[0].options[0].enabled = false;
  const result = applyMenuMutation([archived], categories, { kind: 'save', menu, expectedRevision: 0 });
  assert.equal(result[1].revision, 1);
  const visible = publicCatalog(result);
  assert.equal(visible.length, 1); assert.equal(visible[0].groups[0].options.length, 4);
});

test('Requested presets upgrade only once, retain custom prices and never duplicate owner dishes', async () => {
  const { catalogVersion, upgradeSavedCatalog } = await import('../src/catalog.ts');
  const ice = { ...iceCream(), groups: [], variants: [{ code: 'normal', name: 'เล็ก', priceSatang: 3500 }, { code: 'special', name: 'ใหญ่', priceSatang: 4500 }] };
  const basil = { ...structuredClone(ice), code: 'menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef', name: 'ข้าวผัดกระเพราหมูสับ', category: 'rice', groups: [] };
  const result = upgradeSavedCatalog([ice, basil], 4);
  assert.equal(result.length, 2); assert.equal(catalogVersion, 5);
  assert.equal(result[0].variants[0].priceSatang, 3500);
  assert.equal(result[0].groups[0].options[1].name, 'ฟักทองเชื่อม');
  assert.equal(result[1].groups[0].options[0].priceSatang, 1000);
  result[0].groups[0].options[1].name = 'ชื่อที่เจ้าของแก้';
  assert.deepEqual(upgradeSavedCatalog(result, 5), result);
});
