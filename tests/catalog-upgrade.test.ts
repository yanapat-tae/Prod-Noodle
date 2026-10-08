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
