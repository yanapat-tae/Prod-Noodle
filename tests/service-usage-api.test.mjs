import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createDemoServer } from '../server/demo.mjs';

test('Usage HTTP endpoint denies anonymous/staff and identifies both-provider owner data as a demo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'usage-api-'));
  const server = createDemoServer({ dataPath: join(dir, 'state.json') });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = async (path, body, token) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, data: await r.json() };
    };
    const owner = (await call('/staff/login', { account: 'demo-1', pin: '1234' })).data;
    const staff = (await call('/staff/login', { account: 'demo-2', pin: '1234' })).data;
    assert.equal((await call('/staff/usage')).status, 401);
    assert.equal((await call('/staff/usage', undefined, staff.token)).status, 403);
    const usage = await call('/staff/usage', undefined, owner.token);
    assert.equal(usage.status, 200);
    assert.equal(usage.data.demo, true);
    assert.equal(usage.data.snapshots[0].provider, 'cloudflare');
    assert.equal(typeof usage.data.databaseBytes, 'number');
    assert.equal(JSON.stringify(usage.data).includes(owner.token), false);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
