import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDemoServer } from '../server/demo.mjs';

test('Demo kitchen completion is repeatable, preserves unpaid bills and enforces staff authorization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prod-kitchen-'));
  const server = createDemoServer({ dataPath: join(dir, 'state.json') });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    const call = async (path, body, token, key) => {
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const staff = (await call('/staff/login', { account: 'demo-2', pin: '1234' })).data;
    const customer = (await call('/customer/session', { entry: '1' })).data;
    const payload = { lines: [{ itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] }], expectedTotalSatang: 1000 };
    for (const steps of [[], ['preparing'], ['preparing', 'ready']]) {
      const key = randomUUID();
      const order = (await call('/orders', payload, customer.token, key)).data;
      for (const status of steps) assert.equal((await call(`/staff/orders/${order.id}/status`, { status }, staff.token)).status, 200);
      const path = `/staff/orders/${order.id}/status`;
      assert.equal((await call(path, { status: 'served' })).status, 401);
      assert.equal((await call(path, { status: 'served' }, customer.token)).status, 401);
      const first = await call(path, { status: 'served' }, staff.token);
      assert.equal(first.status, 200);
      assert.equal(first.data.status, 'served');
      assert.equal(first.data.paidAt, null);
      assert.deepEqual(first.data.lines, order.lines);
      assert.equal(first.data.totalSatang, order.totalSatang);
      assert.deepEqual((await call(path, { status: 'served' }, staff.token)).data, first.data);
      assert.equal((await call(path, { status: 'new' }, staff.token)).status, 409);
      assert.equal((await call('/orders', payload, customer.token, key)).data.id, order.id);
    }
    const state = (await call('/staff/state', undefined, staff.token)).data;
    assert.equal(state.orders.length, 3);
    assert.ok(state.orders.every(order => order.status === 'served' && !order.paidAt));
    assert.equal((await call('/staff/tables/1/close', {}, staff.token)).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});
