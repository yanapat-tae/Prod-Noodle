import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { createDemoServer } from '../server/demo.mjs';
import { menuDefinition } from '../src/menu-admin.ts';
test('Owner menu HTTP reads/writes preserve categories, retry identity and old orders', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prod-menu-'));
  const server = createDemoServer({ dataPath: join(dir, 'state.json') });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = async (path, body, token, key) => {
      const r = await fetch(base + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    };
    const owner = (await call('/staff/login', { account: 'demo-1', pin: '1234' })).data;
    const admin = (await call('/staff/login', { account: 'demo-2', pin: '1234' })).data;
    assert.equal((await call('/staff/menu/manage', undefined, admin.token)).status, 403);
    const initial = await call('/staff/menu/manage', undefined, owner.token);
    assert.equal(initial.status, 200);
    const water = initial.data.items.find((i) => i.code === 'water');
    const menu = menuDefinition(water);
    menu.name = 'น้ำดื่ม';
    const payload = { kind: 'save', menu, expectedRevision: water.revision ?? 1 },
      key = randomUUID();
    assert.equal((await call('/staff/menu/manage', payload, admin.token, key)).status, 403);
    assert.equal((await call('/staff/menu/manage', payload, owner.token, key)).status, 200);
    assert.equal((await call('/staff/menu/manage', payload, owner.token, key)).status, 200);
    assert.equal(
      (
        await call(
          '/staff/menu/manage',
          { ...payload, menu: { ...menu, name: 'อื่น' } },
          owner.token,
          key,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call('/staff/menu/manage', payload, owner.token, randomUUID())).status,
      409,
    );
    const current = (await call('/staff/menu/manage', undefined, owner.token)).data.items;
    for (const i of current.filter((i) => i.category === 'desserts'))
      assert.equal(
        (
          await call(
            '/staff/menu/manage',
            { kind: 'archive', code: i.code, expectedRevision: i.revision ?? 1 },
            owner.token,
            randomUUID(),
          )
        ).status,
        200,
      );
    assert(
      (await call('/staff/menu/manage', undefined, owner.token)).data.categories.some(
        (c) => c.code === 'desserts',
      ),
    );
    assert(!(await call('/menu')).data.some((i) => i.category === 'desserts'));
    const dessert = { ...menu, code: 'brand-new-dessert', category: 'desserts' };
    assert.equal(
      (
        await call(
          '/staff/menu/manage',
          { kind: 'save', menu: dessert, expectedRevision: 0 },
          owner.token,
          randomUUID(),
        )
      ).status,
      200,
    );
    assert((await call('/menu')).data.some((i) => i.code === dessert.code));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
test('Edge menu management guards both methods before the owner RPC and passes the request key', async () => {
  let handler;
  let allowed = true;
  const calls = [];
  const actor = randomUUID(),
    key = randomUUID();
  runInNewContext(
    readFileSync(
      new URL('../supabase/functions/staff-api/index.ts', import.meta.url),
      'utf8',
    ).replace(/^import[^\n]+\n/, ''),
    {
      serve: (_name, fn) => (handler = fn),
      service: () => ({}),
      staff: async (_db, _req, owner) => {
        if (owner && !allowed) throw new Error('owner only');
        return actor;
      },
      requestKey: () => key,
      rpc: async (_db, name, args) => {
        calls.push({ name, args });
        return { ok: true };
      },
      HttpError: Error,
    },
  );
  await handler({ method: 'GET' }, '/staff/menu/manage', {});
  await handler({ method: 'POST' }, '/staff/menu/manage', { kind: 'archive' });
  assert.equal(calls[0].name, 'owner_menu_catalog');
  assert.equal(calls[1].args.p_request_key, key);
  allowed = false;
  await assert.rejects(() => handler({ method: 'GET' }, '/staff/menu/manage', {}), /owner only/);
  await assert.rejects(() => handler({ method: 'POST' }, '/staff/menu/manage', {}), /owner only/);
  assert.equal(calls.length, 2);
});
