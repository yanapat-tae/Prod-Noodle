import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDemoServer } from '../server/demo.mjs';

test('HTTP orders retain takeaway contact and kitchen notes; owner menu creation retries safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prod-takeaway-'));
  const server = createDemoServer({ dataPath: join(dir, 'state.json') });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = async (path, body, token, key) => {
      const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const owner = (await call('/staff/login', { account: 'demo-1', pin: '1234' })).data;
    const staff = (await call('/staff/login', { account: 'demo-2', pin: '1234' })).data;
    const customer = (await call('/customer/session', { entry: 'takeaway' })).data;
    const takeaway = { customerName: 'สมชาย', villageDelivery: true, deliveryAddress: '12/3 ซอย 2', deliveryPhone: '0812345678' };
    const payload = { lines: [{ itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [], freeNote: ' ไม่ใส่น้ำแข็ง · แยกถุง ' }], expectedTotalSatang: 1000, takeaway };
    const key = randomUUID();
    const first = await call('/orders', payload, customer.token, key);
    assert.equal(first.status, 201);
    assert.deepEqual(first.data.takeaway, takeaway);
    assert.equal(first.data.lines[0].freeNote, 'ไม่ใส่น้ำแข็ง · แยกถุง');
    assert.equal((await call('/orders', payload, customer.token, key)).data.id, first.data.id);
    assert.equal((await call('/orders', { ...payload, takeaway: { ...takeaway, customerName: 'อีกคน' } }, customer.token, key)).status, 409);
    assert.equal((await call('/orders', { ...payload, takeaway: { ...takeaway, deliveryAddress: '' } }, customer.token, randomUUID())).status, 400);
    assert.equal((await call('/staff/state', undefined, staff.token)).data.orders[0].takeaway.customerName, 'สมชาย');
    const menu = { code: 'test-owner-dish', name: 'เมนูใหม่ทดสอบ', category: 'snacks', description: '', unit: 'จาน', variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 3500 }], optionGroupCodes: [], prepNotes: [] };
    assert.equal((await call('/staff/menu/create', menu, staff.token)).status, 403);
    assert.equal((await call('/staff/menu/create', menu, owner.token)).status, 201);
    assert.equal((await call('/staff/menu/create', menu, owner.token)).status, 201);
    assert.equal((await call('/menu')).data.filter(item => item.code === menu.code).length, 1);
    assert.equal((await call('/staff/menu/create', { ...menu, name: 'เปลี่ยนคำขอ' }, owner.token)).status, 409);
    await call('/staff/menu', { code: menu.code, prices: { normal: 4000 }, available: true }, owner.token);
    assert.equal((await call('/staff/menu/create', menu, owner.token)).data.variants[0].priceSatang, 4000);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('HTTP owner renames atomically while old order snapshots and legacy edits remain intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prod-rename-'));
  const server = createDemoServer({ dataPath: join(dir, 'state.json') });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = async (path, body, token, key) => {
      const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const owner = (await call('/staff/login', { account: 'demo-1', pin: '1234' })).data;
    const admin = (await call('/staff/login', { account: 'demo-2', pin: '1234' })).data;
    const customer = (await call('/customer/session', { entry: '1' })).data;
    const oldOrder = await call('/orders', { lines: [{ itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] }], expectedTotalSatang: 1000 }, customer.token, randomUUID());
    assert.equal(oldOrder.status, 201);
    const input = { code: 'water', prices: { normal: 1500 }, available: false, name: ' \tน้ำดื่มเย็น 🍜\n ' };
    assert.equal((await call('/staff/menu', input)).status, 401);
    assert.equal((await call('/staff/menu', input, admin.token)).status, 403);
    const renamed = await call('/staff/menu', input, owner.token);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.name, 'น้ำดื่มเย็น 🍜');
    const saved = (await call('/menu')).data.find(item => item.code === 'water');
    assert.equal(saved.name, 'น้ำดื่มเย็น 🍜');
    assert.equal(saved.variants[0].priceSatang, 1500);
    assert.equal(saved.available, false);
    for (const name of ['', ' \n ', '🍜'.repeat(121), null, 12, {}, 'ชื่อ\0เมนู']) {
      assert.equal((await call('/staff/menu', { ...input, name, available: true, prices: { normal: 2000 } }, owner.token)).status, 400);
      assert.deepEqual((await call('/menu')).data.find(item => item.code === 'water'), saved);
    }
    assert.equal((await call('/staff/menu', { ...input, name: 'ห้ามบันทึก', prices: { normal: 0 } }, owner.token)).status, 400);
    assert.deepEqual((await call('/menu')).data.find(item => item.code === 'water'), saved);
    const state = (await call('/staff/state', undefined, owner.token)).data;
    assert.deepEqual(state.orders.find(order => order.id === oldOrder.data.id).lines, oldOrder.data.lines);
    assert.equal((await call('/staff/menu', { code: 'water', prices: { normal: 1000 }, available: true }, owner.token)).data.name, saved.name);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
