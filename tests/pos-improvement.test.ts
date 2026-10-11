import test from 'node:test';
import assert from 'node:assert/strict';
import { starterCatalog, menuCategories } from '../src/catalog.ts';
import { priceLine, salesReport } from '../src/domain.ts';
import { applyMenuMutation, publicCatalog } from '../src/menu-admin.ts';

test('Top menus exclude the six drink/ice codes but revenue still includes them', () => {
  const codes = ['ice','water','soft-drink','longan-juice','butterfly-pea-lime','chrysanthemum-tea','grass-jelly'];
  const lines = codes.map(itemCode => priceLine(starterCatalog, { itemCode, variantCode: 'normal', quantity: 2, options: [], notes: [] }));
  const order = { id:'paid',channel:'takeaway' as const,tableNumber:null,queueNumber:1,visitId:null,status:'served' as const,lines,totalSatang:lines.reduce((s,l)=>s+l.totalSatang,0),createdAt:'2026-10-11T05:00:00Z',paidAt:'2026-10-11T05:00:00Z',paymentMethod:'thai_chuay_thai',refundedAt:null,refundedSatang:0 };
  const report = salesReport([order], [], '2026-10-11');
  assert.equal(report.gross,order.totalSatang);
  assert.deepEqual(report.top.map(i=>i.name),['เฉาก๊วยโบราณ']);
});
test('All-menu ordering moves across categories and category ordering preserves unrelated slots', () => {
  let items = publicCatalog(starterCatalog).map((i,index)=>({...i,sortOrder:index,revision:1}));
  const first = items[0], last = items.at(-1)!;
  const entries = [last,...items.slice(0,-1)].map(i=>({code:i.code,revision:i.revision}));
  items = applyMenuMutation(items,menuCategories,{kind:'reorder',category:'all',entries}) as typeof items;
  assert.equal(publicCatalog(items)[0].code,last.code);
  const siblings = publicCatalog(items).filter(i=>i.category===first.category);
  const unrelated = items.filter(i=>i.category!==first.category).map(i=>[i.code,i.sortOrder]);
  items = applyMenuMutation(items,menuCategories,{kind:'reorder',category:first.category,entries:siblings.reverse().map(i=>({code:i.code,revision:i.revision}))}) as typeof items;
  assert.deepEqual(items.filter(i=>i.category!==first.category).map(i=>[i.code,i.sortOrder]),unrelated);
  assert.equal(new Set(publicCatalog(items).map(i=>i.sortOrder)).size,items.length);
});
