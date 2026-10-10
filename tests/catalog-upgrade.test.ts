import test from 'node:test';
import assert from 'node:assert/strict';
import * as catalog from '../src/catalog.ts';

test('saved demo catalog gains real menus while preserving owner prices and custom dishes', () => {
  const edited = structuredClone(catalog.starterCatalog[0]); edited.name = 'ชื่อทดลองเดิม'; edited.available=false; edited.variants[0].priceSatang=5900;
  const custom = {...structuredClone(edited),code:'custom-dish',name:'เมนูเจ้าของ'};
  const retired = {...structuredClone(edited),code:'braised-pork-noodles'};
  const upgraded = catalog.upgradeSavedCatalog([edited,custom,retired]);
  assert.equal(upgraded.length,39);
  assert.equal(upgraded.find(m=>m.code===edited.code)!.name,'ชามโปรดหมูแผ่น');
  assert.equal(upgraded.find(m=>m.code===edited.code)!.variants[0].priceSatang,5900);
  assert.equal(upgraded.find(m=>m.code===edited.code)!.available,false);
  assert.deepEqual(upgraded.find(m=>m.code==='custom-dish'),custom);
  assert.ok(!upgraded.some(m=>m.code==='braised-pork-noodles'));
  assert.equal(edited.name,'ชื่อทดลองเดิม');
});

test('menu corrections preserve owner names and prices while restricting crispy-pork rice toppings', () => {
  const saved = structuredClone(catalog.starterCatalog);
  saved.find(item => item.code === 'water')!.name = 'น้ำดื่มของร้าน';
  saved.find(item => item.code === 'water')!.variants[0].priceSatang = 1200;
  saved.find(item => item.code === 'yentafo-hotpot')!.description = 'รอประมาณ 2–3 นาที';
  saved.find(item => item.code === 'mahachai-ice-cream')!.name = 'ไอศกรีมมหาชัยพร้อมเครื่อง';
  const corrected = catalog.upgradeSavedCatalog(saved, 2);
  assert.equal(corrected.find(item => item.code === 'water')!.name, 'น้ำดื่มของร้าน');
  assert.equal(corrected.find(item => item.code === 'water')!.variants[0].priceSatang, 1200);
  assert.equal(corrected.find(item => item.code === 'yentafo-hotpot')!.description, 'สำหรับ 2–3 ท่าน');
  assert.equal(corrected.find(item => item.code === 'mahachai-ice-cream')!.name, 'ไอศกรีมมหาชัย');
  assert.deepEqual(corrected.find(item => item.code === 'crispy-pork-rice')!.groups[0].options.map(o => o.code), ['crispy-pork', 'soft-boiled-egg']);
  assert.equal(saved.find(item => item.code === 'mahachai-ice-cream')!.name, 'ไอศกรีมมหาชัยพร้อมเครื่อง');
});

test('Coke rename preserves saved prices, availability, custom names and historical lines', () => {
  const drink = structuredClone(catalog.starterCatalog.find(item => item.code === 'soft-drink')!);
  drink.name = 'น้ำอัดลม'; drink.variants[0].priceSatang = 2500; drink.available = false;
  const upgraded = catalog.upgradeSavedCatalog([drink], 3)[0];
  assert.equal(upgraded.name, 'น้ำอัดลม - โค้ก');
  assert.deepEqual({ ...upgraded, name: drink.name }, drink);
  assert.equal(drink.name, 'น้ำอัดลม');
  assert.equal(catalog.starterCatalog.find(item => item.code === 'soft-drink')!.name, 'น้ำอัดลม - โค้ก');
  drink.name = 'ชื่อร้านตั้งเอง';
  assert.equal(catalog.upgradeSavedCatalog([drink], 3)[0].name, 'ชื่อร้านตั้งเอง');
});
