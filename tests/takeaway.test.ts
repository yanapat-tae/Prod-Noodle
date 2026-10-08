import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/domain.ts';
import { starterCatalog } from '../src/catalog.ts';

test('Free-text kitchen notes are trimmed, preserved and bounded independently of preset notes', () => {
  const input = { itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [], freeNote: '  ไม่ใส่น้ำแข็ง · แยกถุง  ' };
  assert.equal(domain.priceLine(starterCatalog, input).freeNote, 'ไม่ใส่น้ำแข็ง · แยกถุง');
  assert.throws(() => domain.priceLine(starterCatalog, { ...input, freeNote: 'ก'.repeat(301) }), /300/);
  assert.throws(() => domain.priceLine(starterCatalog, { ...input, freeNote: 123 as unknown as string }));
  assert.equal(domain.priceLine(starterCatalog, { ...input, freeNote: '🍜'.repeat(300) }).freeNote, '🍜'.repeat(300));
});

test('Takeaway details require a name and village deliveries require contact and address', () => {
  const details = { customerName: '  สมชาย  ', villageDelivery: false, deliveryAddress: '', deliveryPhone: '' };
  assert.deepEqual(domain.validateTakeaway(details), { ...details, customerName: 'สมชาย' });
  assert.throws(() => domain.validateTakeaway({ ...details, customerName: ' ' }), /ชื่อ/);
  assert.throws(() => domain.validateTakeaway({ ...details, villageDelivery: true }), /บ้านเลขที่/);
  assert.throws(() => domain.validateTakeaway({ ...details, villageDelivery: true, deliveryAddress: '12/3 ซอย 2' }), /เบอร์/);
  assert.throws(() => domain.validateTakeaway({ ...details, villageDelivery: 'true' }));
  assert.throws(() => domain.validateTakeaway({ ...details, customerName: 'ก'.repeat(81) }));
  assert.equal(domain.validateTakeaway({ ...details, villageDelivery: true, deliveryAddress: '12/3 ซอย 2', deliveryPhone: '081-234-5678' }).deliveryPhone, '081-234-5678');
});

test('Takeaway tickets display names and retain queue identifiers, including legacy orders', () => {
  const order = { channel: 'takeaway', queueNumber: 7, takeaway: { customerName: 'สมชาย', villageDelivery: false, deliveryAddress: '', deliveryPhone: '' } } as domain.Order;
  assert.equal(domain.orderLabel(order), 'กลับบ้าน-สมชาย · T-07');
  assert.equal(domain.orderLabel({ ...order, takeaway: null }), 'กลับบ้าน · T-07');
});
