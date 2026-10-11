import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { menuDefinition } from '../src/menu-admin.ts';
const db = new PGlite();
const owner = randomUUID(),
  otherOwner = randomUUID(),
  admin = randomUUID();
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rpc = (fn, args = []) =>
  scalar(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const catalog = () => rpc('owner_menu_catalog', [owner]);
const item = async (code) => (await catalog()).items.find((i) => i.code === code);
const manage = (payload, key = randomUUID(), actor = owner) =>
  rpc('owner_manage_menu', [actor, key, JSON.stringify(payload)]);
const save = async (code, change) => {
  const current = await item(code);
  const menu = menuDefinition(current);
  change(menu);
  return manage({ kind: 'save', menu, expectedRevision: current.revision });
};
const place = (lines, total, key = randomUUID()) => {
  const input = { channel: 'takeaway', lines, expectedTotalSatang: total };
  const data = JSON.stringify(input);
  return rpc('place_order', [
    data,
    key,
    createHash('sha256').update(data).digest('hex'),
    null,
    owner,
  ]);
};
const line = (itemCode, variantCode = 'normal', options = []) => ({
  itemCode,
  variantCode,
  quantity: 1,
  notes: [],
  options,
});
const option = (groupCode, optionCode) => ({ groupCode, optionCode, quantity: 1 });
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
  const root = new URL('../supabase/', import.meta.url);
  const first = ['202610050001_initial_schema.sql', '202610050002_application_api.sql'];
  for (const file of first)
    await db.exec(readFileSync(new URL('migrations/' + file, root), 'utf8'));
  for (const file of ['seed.sql', 'menu-seed.sql'])
    await db.exec(readFileSync(new URL(file, root), 'utf8'));
  for (const file of readdirSync(new URL('migrations/', root))
    .filter((f) => f.endsWith('.sql') && !first.includes(f))
    .sort()) {
    if (file.endsWith('_requested_menu_options.sql'))
      await db.exec(`insert into public.menu_items(code,name,category_id,unit) select 'menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef','ข้าวผัดกระเพราหมูสับ',id,'จาน' from public.menu_categories where code='rice';
  insert into public.menu_variants(menu_item_id,code,name,price_satang,is_default) select id,'normal','ปกติ',5500,true from public.menu_items where code='menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef';`);
    await db.exec(readFileSync(new URL('migrations/' + file, root), 'utf8'));
  }
  await db.query('insert into auth.users values($1),($2),($3)', [owner, otherOwner, admin]);
  await db.query(
    "insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,2,'Other owner','owner'),($3,3,'Staff','admin')",
    [owner, otherOwner, admin],
  );
});
after(() => db.close());
test('Menu RPCs require service role and an active owner, including read access', async () => {
  for (const actor of [admin, null, randomUUID()])
    await assert.rejects(
      () => rpc('owner_menu_catalog', [actor]),
      (e) => e.code === 'PT403',
    );
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(() => catalog(), /permission denied/);
      await assert.rejects(() => manage({}), /permission denied/);
    } finally {
      await db.exec('reset role');
    }
  }
  await db.exec('set role service_role');
  try {
    assert.equal((await catalog()).categories.length, 6);
  } finally {
    await db.exec('reset role');
  }
  assert.equal(
    await scalar("select prosecdef from pg_proc where proname='owner_manage_menu'"),
    false,
  );
});
test('Server prices requested ice-cream limits, explicit peanut omission and fried egg', async () => {
  const ice = await item('mahachai-ice-cream');
  const toppings = ice.groups.find((g) => g.code === 'ice-toppings');
  assert.deepEqual(
    toppings.options.map((o) => o.name),
    ['ถั่วทอง', 'ฟักทองเชื่อม', 'มันเชื่อม', 'ลูกชิด', 'สับปะรดเชื่อม'],
  );
  const picks = (n) => [
    ...toppings.options.slice(0, n).map((o) => option(toppings.code, o.code)),
    option('ice-peanuts', 'omit'),
  ];
  await assert.rejects(
    () => place([line(ice.code, 'normal', picks(4))], 3000),
    (e) => e.code === 'PT400',
  );
  const small = await place([line(ice.code, 'normal', picks(3))], 3000);
  assert(small.lines[0].optionNames.includes('ไม่ใส่ถั่วลิสง'));
  assert.equal((await place([line(ice.code, 'special', picks(4))], 4000)).totalSatang, 4000);
  assert.equal(
    (
      await place(
        [
          line('menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef', 'normal', [
            option('basil-extras', 'fried-egg'),
          ]),
        ],
        6500,
      )
    ).totalSatang,
    6500,
  );
});
test('Per-menu override isolates shared choices, snapshots survive removal and exact retries survive archival', async () => {
  const before = await item('soft-pork-noodles');
  const key = randomUUID();
  const input = [
    line('mixed-dry-noodles', 'normal', [
      option('noodle', 'sen-lek'),
      option('topping', 'pork-slices'),
    ]),
  ];
  const order = await place(input, 7000, key);
  await save('mixed-dry-noodles', (m) => {
    m.groups.find((g) => g.code === 'topping').options.find((o) => o.code === 'pork-slices').name =
      'ชื่อเฉพาะเมนู';
    m.groups
      .find((g) => g.code === 'topping')
      .options.find((o) => o.code === 'pork-slices').priceSatang = 1500;
  });
  assert.deepEqual((await item('soft-pork-noodles')).groups, before.groups);
  const edited = await place(input, 7500);
  assert(edited.lines[0].optionNames.includes('ชื่อเฉพาะเมนู'));
  await save('mixed-dry-noodles', (m) => {
    m.groups = m.groups.filter((g) => g.code !== 'topping');
    m.variants = m.variants.filter((v) => v.code === 'special');
  });
  assert.deepEqual(await rpc('order_json', [order.id]), order);
  const current = await item('mixed-dry-noodles');
  await manage({ kind: 'archive', code: current.code, expectedRevision: current.revision });
  assert.equal((await place(input, 7000, key)).id, order.id);
  await assert.rejects(
    () => place(input, 7000),
    (e) => e.code === 'PT400',
  );
  const archived = await item(current.code);
  await manage({ kind: 'restore', code: current.code, expectedRevision: archived.revision });
});
test('Owner keys bind actor/payload, retries precede revisions, legacy edits also conflict', async () => {
  const current = await item('water');
  const menu = menuDefinition(current);
  menu.name = 'น้ำดื่ม';
  const payload = { kind: 'save', menu, expectedRevision: current.revision },
    key = randomUUID();
  assert.deepEqual(await manage(payload, key), { ok: true });
  assert.deepEqual(await manage(payload, key), { ok: true });
  await assert.rejects(
    () => manage(payload, key, otherOwner),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    () => manage({ ...payload, menu: { ...menu, name: 'อื่น' } }, key),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    () => manage(payload),
    (e) => e.code === 'PT409',
  );
  const updated = await item('water');
  await rpc('edit_menu', [owner, 'water', JSON.stringify({ normal: 1000 }), true]);
  assert.equal((await item('water')).revision, updated.revision + 1);
  await assert.rejects(
    () => manage({ kind: 'save', menu, expectedRevision: updated.revision }),
    (e) => e.code === 'PT409',
  );
});
test('Reordering checks exact membership and revisions; archive all retains category for create and restore', async () => {
  const active = (await catalog()).items
    .filter((i) => i.category === 'desserts' && !i.archived)
    .reverse();
  const payload = {
    kind: 'reorder',
    category: 'desserts',
    entries: active.map((i) => ({ code: i.code, revision: i.revision })),
  };
  await manage(payload);
  assert.deepEqual(
    (await rpc('menu_catalog')).filter((i) => i.category === 'desserts').map((i) => i.code),
    active.map((i) => i.code),
  );
  await assert.rejects(
    () => manage(payload),
    (e) => e.code === 'PT409',
  );
  for (const i of (await catalog()).items.filter((i) => i.category === 'desserts' && !i.archived))
    await manage({ kind: 'archive', code: i.code, expectedRevision: i.revision });
  assert((await catalog()).categories.some((c) => c.code === 'desserts'));
  const menu = menuDefinition(active[0]);
  menu.code = 'new-dessert';
  await manage({ kind: 'save', menu, expectedRevision: 0 });
  assert.equal((await item(menu.code)).revision, 1);
  const archived = await item('mahachai-ice-cream');
  await manage({ kind: 'restore', code: archived.code, expectedRevision: archived.revision });
});
test('Invalid nested data rolls back and disabled choices reject stale orders', async () => {
  const original = await item('mahachai-ice-cream');
  for (const change of [
    (m) => (m.extra = true),
    (m) => (m.groups[0].limitsByVariant.unknown = { min: 0, max: 3 }),
    (m) => m.groups[0].options.forEach((o) => (o.defaultQuantity = 1)),
    (m) =>
      m.groups[1].options.forEach((o) => {
        o.enabled = false;
        o.defaultQuantity = 0;
      }),
    (m) => (m.variants[0].priceSatang = 1.5),
    (m) => (m.groups[0].options[1].code = m.groups[0].options[0].code),
  ]) {
    const menu = menuDefinition(original);
    change(menu);
    await assert.rejects(
      () => manage({ kind: 'save', menu, expectedRevision: original.revision }),
      (e) => e.code === 'PT400',
    );
  }
  assert.deepEqual(await item(original.code), original);
  await save(original.code, (m) => {
    m.groups[0].options[0].enabled = false;
  });
  await assert.rejects(
    () =>
      place(
        [
          line(original.code, 'normal', [
            option('ice-toppings', 'mung-bean'),
            option('ice-peanuts', 'include'),
          ]),
        ],
        3000,
      ),
    (e) => e.code === 'PT400',
  );
  assert(
    !(await rpc('menu_catalog'))
      .find((i) => i.code === original.code)
      .groups[0].options.some((o) => o.code === 'mung-bean'),
  );
});
