import test from 'node:test';
import assert from 'node:assert/strict';
import { starterCatalog } from '../src/catalog.ts';
import { validateNewMenu } from '../src/menu-management.ts';
import * as menuManagement from '../src/menu-management.ts';

function draft() {
  return { code: 'menu-owner-created', name: 'ก๋วยเตี๋ยวหมู', category: starterCatalog[0].category,
    description: 'เมนูใหม่ของร้าน', unit: 'ชาม', variants: [{ code: 'normal', name: 'ธรรมดา', priceSatang: 5500 }],
    optionGroupCodes: ['noodle', 'broth'], prepNotes: ['ไม่ใส่ผัก'] };
}

test('new menu validation trims display text and returns an independent normalized value', () => {
  const input = draft();
  input.name = '  ก๋วยเตี๋ยวหมู  '; input.description = ' เมนูใหม่ของร้าน '; input.unit = ' ชาม ';
  input.variants[0].name = ' ธรรมดา '; input.prepNotes = [' ไม่ใส่ผัก '];
  const result = validateNewMenu(input, starterCatalog);
  assert.deepEqual(result, draft());
  assert.equal(input.name, '  ก๋วยเตี๋ยวหมู  ');
  assert.notEqual(result.variants, input.variants);
  assert.notEqual(result.variants[0], input.variants[0]);
  assert.notEqual(result.optionGroupCodes, input.optionGroupCodes);
  assert.notEqual(result.prepNotes, input.prepNotes);
});

test('new menu validation rejects malformed objects, missing fields and unexpected fields', () => {
  for (const input of [null, undefined, true, 42, 'menu', [], {}, { ...draft(), available: true }, { ...draft(), priceSatang: 1 }]) {
    assert.throws(() => validateNewMenu(input, starterCatalog));
  }
  for (const field of Object.keys(draft())) {
    const input: Record<string, unknown> = draft(); delete input[field];
    assert.throws(() => validateNewMenu(input, starterCatalog), field);
  }
});

test('new menu codes use bounded slugs and categories must already exist', () => {
  for (const code of ['', 'Uppercase', '-menu', 'menu_code', ' menu ', 'ก๋วยเตี๋ยว', 'a'.repeat(81), 12]) {
    assert.throws(() => validateNewMenu({ ...draft(), code }, starterCatalog));
  }
  assert.equal(validateNewMenu({ ...draft(), code: 'a'.repeat(80) }, starterCatalog).code.length, 80);
  for (const category of ['new-category', '', null, 12]) {
    assert.throws(() => validateNewMenu({ ...draft(), category }, starterCatalog));
  }
  // An existing code can be an idempotent retry; persistence checks payload equality.
  assert.equal(validateNewMenu({ ...draft(), code: starterCatalog[0].code }, starterCatalog).code, starterCatalog[0].code);
});

test('new menu text limits count Unicode codepoints and reject non-text or blank required fields', () => {
  for (const [field, maximum, minimum] of [['name', 120, 1], ['description', 500, 0], ['unit', 20, 1]] as const) {
    for (const invalid of [null, 5, {}, '🍜'.repeat(maximum + 1), ...(minimum ? [' ', ''] : [])]) {
      assert.throws(() => validateNewMenu({ ...draft(), [field]: invalid }, starterCatalog), field);
    }
    const text = '🍜'.repeat(maximum);
    assert.equal(validateNewMenu({ ...draft(), [field]: text }, starterCatalog)[field], text);
  }
  assert.equal(validateNewMenu({ ...draft(), description: ' ' }, starterCatalog).description, '');
});

test('new menu variants require one to eight unique valid codes and positive integer satang prices', () => {
  const input = draft();
  for (const variants of [null, {}, [], Array.from({ length: 9 }, (_, index) => ({ code: 'size-' + index, name: 'ขนาด', priceSatang: 100 }))]) {
    assert.throws(() => validateNewMenu({ ...input, variants }, starterCatalog));
  }
  for (const variant of [null, {}, { ...input.variants[0], extra: true }, { ...input.variants[0], code: 'invalid_code' }, { ...input.variants[0], code: 'x'.repeat(81) }, { ...input.variants[0], name: ' ' }, { ...input.variants[0], name: '🍜'.repeat(61) }]) {
    assert.throws(() => validateNewMenu({ ...input, variants: [variant] }, starterCatalog));
  }
  assert.throws(() => validateNewMenu({ ...input, variants: [input.variants[0], input.variants[0]] }, starterCatalog));
  for (const priceSatang of [0, -1, 1.5, 100001, NaN, Infinity, '5500', null]) {
    assert.throws(() => validateNewMenu({ ...input, variants: [{ ...input.variants[0], priceSatang }] }, starterCatalog));
  }
  for (const priceSatang of [1, 100000]) {
    assert.equal(validateNewMenu({ ...input, variants: [{ code: 'size-1', name: '🍜'.repeat(60), priceSatang }] }, starterCatalog).variants[0].priceSatang, priceSatang);
  }
  const variants = Array.from({ length: 8 }, (_, index) => ({ code: 'size-' + index, name: 'ขนาด', priceSatang: 100 }));
  assert.equal(validateNewMenu({ ...input, variants }, starterCatalog).variants.length, 8);
});

test('new menu option groups must be distinct existing catalog groups with at most eight choices', () => {
  for (const optionGroupCodes of [null, {}, ['unknown'], ['noodle', 'noodle'], [5]]) {
    assert.throws(() => validateNewMenu({ ...draft(), optionGroupCodes }, starterCatalog));
  }
  assert.deepEqual(validateNewMenu({ ...draft(), optionGroupCodes: [] }, starterCatalog).optionGroupCodes, []);
  const catalog = structuredClone(starterCatalog);
  const codes = Array.from({ length: 9 }, (_, index) => 'group-' + index);
  catalog[0].groups.push(...codes.map(code => ({ code, name: code, min: 0, max: 1, options: [] })));
  assert.equal(validateNewMenu({ ...draft(), optionGroupCodes: codes.slice(0, 8) }, catalog).optionGroupCodes.length, 8);
  assert.throws(() => validateNewMenu({ ...draft(), optionGroupCodes: codes }, catalog));
});

test('new menu preparation notes are distinct trimmed text with bounded count and length', () => {
  for (const prepNotes of [null, {}, [5], [' '], ['ไม่ใส่ผัก', ' ไม่ใส่ผัก '], ['🍜'.repeat(81)], Array.from({ length: 6 }, (_, index) => String(index))]) {
    assert.throws(() => validateNewMenu({ ...draft(), prepNotes }, starterCatalog));
  }
  assert.deepEqual(validateNewMenu({ ...draft(), prepNotes: [] }, starterCatalog).prepNotes, []);
  const prepNotes = Array.from({ length: 5 }, (_, index) => String(index) + '🍜'.repeat(79));
  assert.deepEqual(validateNewMenu({ ...draft(), prepNotes }, starterCatalog).prepNotes, prepNotes);
});

test('new menu validation rejects sparse arrays instead of returning incomplete entries', () => {
  for (const field of ['variants', 'optionGroupCodes', 'prepNotes']) {
    assert.throws(() => validateNewMenu({ ...draft(), [field]: Array(1) }, starterCatalog));
  }
});

test('menu mapping uses catalog category and option templates without sharing mutable data', () => {
  assert.equal(typeof menuManagement.menuFromInput, 'function');
  const input = draft();
  const result = menuManagement.menuFromInput(input, starterCatalog);
  assert.deepEqual(result, { code: input.code, name: input.name, category: input.category,
    categoryName: starterCatalog[0].categoryName, description: input.description, unit: input.unit, available: true,
    variants: input.variants, groups: starterCatalog[0].groups.filter(group => input.optionGroupCodes.includes(group.code)), prepNotes: input.prepNotes });
  assert.notEqual(result.variants[0], input.variants[0]);
  assert.notEqual(result.groups[0], starterCatalog[0].groups[0]);
  assert.notEqual(result.groups[0].options[0], starterCatalog[0].groups[0].options[0]);
  assert.notEqual(result.prepNotes, input.prepNotes);
  assert.throws(() => menuManagement.menuFromInput({ ...input, category: 'foreign' }, starterCatalog));
});

test('new menu option templates follow stable code order instead of catalog display order', () => {
  const first = structuredClone(starterCatalog[0]); first.code = 'a-template';
  const last = structuredClone(first); last.code = 'z-template'; last.groups[0].options[0].priceSatang = 999;
  const result = menuManagement.menuFromInput(draft(), [first,last]);
  assert.equal(result.groups[0].options[0].priceSatang, first.groups[0].options[0].priceSatang);
});
