import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sha = value => createHash('sha256').update(value).digest('hex');
const owner = randomUUID(), admin = randomUUID();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const rpc = (name, args = []) => scalar(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const line = { itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] };
const takeaway = { customerName: 'คุณเอ', villageDelivery: true, deliveryAddress: 'บ้าน 12 ซอย 3', deliveryPhone: '081-234-5678' };
const payload = extra => ({ channel: 'takeaway', lines: [line], expectedTotalSatang: 1000, ...extra });
const place = (input, key = randomUUID()) => rpc('place_order', [JSON.stringify(input), key, sha(JSON.stringify(input)), null, owner]);
const newMenu = extra => ({ code: 'owner-noodles', name: 'เมนูใหม่', category: 'noodles', description: '', unit: 'ชาม', variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 6500 }], optionGroupCodes: ['noodle'], prepNotes: ['แยกน้ำ'], ...extra });

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;`);
  const applied = ['202610050001_initial_schema.sql', '202610050002_application_api.sql'];
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of applied) await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  for (const file of ['seed.sql', 'menu-seed.sql']) await db.exec(readFileSync(new URL('../supabase/' + file, import.meta.url), 'utf8'));
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && !applied.includes(file)).sort()) await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  if (process.env.DRAFT_MIGRATION_PATH) await db.exec(readFileSync(process.env.DRAFT_MIGRATION_PATH, 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [owner, admin]);
  await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,2,'Staff','admin')", [owner, admin]);
});
after(async () => db.close());

test('free notes and takeaway details survive retries, reads and price changes', async () => {
  const input = payload({ lines: [{ ...line, freeNote: ' \tแยกถุง 🍜\n ' }], takeaway: { ...takeaway, customerName: '  คุณเอ\n' } });
  const key = randomUUID();
  const order = await place(input, key);
  assert.equal(order.lines[0].freeNote, 'แยกถุง 🍜');
  assert.deepEqual(order.takeaway, takeaway);
  assert.equal((await place(input, key)).id, order.id);
  await assert.rejects(() => place({ ...input, takeaway: { ...takeaway, customerName: 'คุณบี' } }, key), /รหัสอ้างอิง/);
  await rpc('edit_menu', [owner, 'water', JSON.stringify({ normal: 1200 }), true]);
  const snapshot = await rpc('order_json', [order.id]);
  assert.equal(snapshot.totalSatang, 1000);
  assert.equal(snapshot.lines[0].freeNote, 'แยกถุง 🍜');
  assert.deepEqual(snapshot.takeaway, takeaway);
  await rpc('edit_menu', [owner, 'water', JSON.stringify({ normal: 1000 }), true]);
  const legacy = await place(payload());
  assert.equal(legacy.takeaway, null);
  assert.equal(legacy.lines[0].freeNote, '');
  const pickup = await place(payload({ takeaway: { ...takeaway, villageDelivery: false } }));
  assert.deepEqual(pickup.takeaway, { ...takeaway, villageDelivery: false, deliveryAddress: '', deliveryPhone: '' });
  const unicode = await place(payload({ lines: [{ ...line, freeNote: '🍜'.repeat(300) }] }));
  assert.equal([...unicode.lines[0].freeNote].length, 300);
});

test('invalid free notes and takeaway inputs roll back the whole order', async () => {
  const count = await scalar('select count(*) from public.orders');
  const invalid = [
    payload({ lines: [{ ...line, freeNote: '🍜'.repeat(301) }] }),
    payload({ lines: [{ ...line, freeNote: null }] }),
    payload({ lines: [{ ...line, freeNote: 42 }] }),
    payload({ takeaway: [] }),
    payload({ takeaway: { ...takeaway, customerName: '  ' } }),
    payload({ takeaway: { ...takeaway, customerName: 'ก'.repeat(81) } }),
    payload({ takeaway: { ...takeaway, villageDelivery: 'true' } }),
    payload({ takeaway: { ...takeaway, deliveryAddress: '' } }),
    payload({ takeaway: { ...takeaway, deliveryAddress: 'ก'.repeat(201) } }),
    payload({ takeaway: { ...takeaway, deliveryPhone: 'call me' } }),
    payload({ takeaway: { ...takeaway, deliveryPhone: '12345678' } }),
    payload({ takeaway: { ...takeaway, deliveryPhone: '1234567890123456' } }),
    payload({ channel: 'dine_in', tableNumber: 1, takeaway }),
  ];
  for (const input of invalid) await assert.rejects(() => place(input), error => error.code === 'PT400');
  assert.equal(await scalar('select count(*) from public.orders'), count);
});

test('owner menu creation copies deterministic active templates and preserves price overrides', async () => {
  const template = (await query(`select m.id, m.code, g.id group_id, ig.min_selections, ig.max_selections
    from public.menu_items m join public.menu_categories c on c.id=m.category_id
    join public.menu_item_option_groups ig on ig.menu_item_id=m.id join public.option_groups g on g.id=ig.group_id
    where m.is_active and c.is_active and g.code='noodle' order by m.code limit 1`))[0];
  await db.query(`update public.menu_item_options set price_override_satang=700 where menu_item_id=$1 and group_id=$2`, [template.id, template.group_id]);
  const originalOptions = await query('select option_id,price_override_satang,default_quantity,max_quantity from public.menu_item_options where menu_item_id=$1 and group_id=$2 order by option_id', [template.id, template.group_id]);
  const globalOptions = await query('select * from public.menu_options order by id');
  const input = newMenu({ name: '  เมนูใหม่\t', description: ' \n ', unit: ' ชาม ', prepNotes: [' แยกน้ำ '] });
  const menu = await rpc('create_menu', [owner, JSON.stringify(input)]);
  assert.equal(menu.code, input.code);
  assert.equal(menu.name, 'เมนูใหม่');
  assert.equal(menu.available, true);
  assert.equal(menu.groups[0].min, template.min_selections);
  assert.equal(menu.groups[0].max, template.max_selections);
  assert(menu.groups[0].options.every(option => option.priceSatang === 700));
  assert.deepEqual(await query('select * from public.menu_options order by id'), globalOptions);
  const id = await scalar('select id from public.menu_items where code=$1', [input.code]);
  assert.deepEqual(await query('select option_id,price_override_satang,default_quantity,max_quantity from public.menu_item_options where menu_item_id=$1 order by option_id', [id]), originalOptions);
  await rpc('edit_menu', [owner, input.code, JSON.stringify({ normal: 7500 }), false]);
  const retried = await rpc('create_menu', [owner, JSON.stringify(newMenu())]);
  assert.equal(retried.variants[0].priceSatang, 7500);
  assert.equal(retried.available, false);
  await assert.rejects(() => rpc('create_menu', [owner, JSON.stringify(newMenu({ name: 'changed' }))]), error => error.code === 'PT409');
  await assert.rejects(() => rpc('create_menu', [owner, JSON.stringify(newMenu({ code: 'water' }))]), error => error.code === 'PT409');
  assert.equal(await scalar('select count(*) from public.menu_items where code=$1', [input.code]), 1);
});

test('menu creation rejects malformed payloads, duplicate groups and non-owner actors atomically', async () => {
  const count = await scalar('select count(*) from public.menu_items');
  for (const actor of [admin, randomUUID(), null]) await assert.rejects(() => rpc('create_menu', [actor, JSON.stringify(newMenu({ code: 'forbidden' }))]), error => error.code === 'PT403');
  const invalid = [
    { extra: true }, { code: 'Bad Code' }, { name: '' }, { name: 'ก'.repeat(121) }, { category: 'unknown' },
    { description: 'ก'.repeat(501) }, { unit: 'ก'.repeat(21) }, { variants: [] },
    { variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 0 }] },
    { variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 1.5 }] },
    { variants: [{ code: 'normal', name: 'ปกติ', priceSatang: '100' }] },
    { variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 100001 }] },
    { variants: [{ code: 'normal', name: 'ปกติ', priceSatang: 100 }, { code: 'normal', name: 'พิเศษ', priceSatang: 200 }] },
    { optionGroupCodes: ['unknown'] }, { optionGroupCodes: ['noodle', 'noodle'] },
    { prepNotes: ['ซ้ำ', ' ซ้ำ '] }, { prepNotes: ['ก'.repeat(81)] }, { prepNotes: [123] },
  ];
  for (const patch of invalid) await assert.rejects(() => rpc('create_menu', [owner, JSON.stringify(newMenu({ code: 'invalid', ...patch }))]), error => error.code === 'PT400');
  assert.equal(await scalar('select count(*) from public.menu_items'), count);
});

test('menu creation and order mutation RPCs remain service-only security invoker functions', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(() => rpc('create_menu', [owner, JSON.stringify(newMenu())]), /permission denied/);
      await assert.rejects(() => place(payload()), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try {
    assert.equal((await rpc('create_menu', [owner, JSON.stringify(newMenu({ code: 'owner-drink', category: 'drinks', optionGroupCodes: [] }))])).code, 'owner-drink');
  } finally { await db.exec('reset role'); }
  const functions = await query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_menu','place_order','order_json')");
  assert.equal(functions.length, 3);
  assert(functions.every(fn => !fn.prosecdef));
});

test('staff menu creation endpoint checks the owner before calling the database', async () => {
  const source = readFileSync(new URL('../supabase/functions/staff-api/index.ts', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
  let handler;
  let ownerAllowed = true;
  const calls = [];
  runInNewContext(source, {
    serve: (_name, callback) => { handler = callback; }, service: () => ({}),
    staff: async (_db, _req, ownerOnly) => { if (ownerOnly && !ownerAllowed) throw new Error('owner required'); return owner; },
    rpc: async (_db, name, args) => { calls.push({ name, args }); return { code: args.p_payload.code }; },
    HttpError: Error,
  });
  const input = newMenu();
  assert.equal((await handler({ method: 'POST' }, '/staff/menu/create', input)).code, input.code);
  assert.equal(calls[0].name, 'create_menu');
  assert.equal(calls[0].args.p_actor, owner);
  assert.deepEqual(calls[0].args.p_payload, input);
  ownerAllowed = false;
  await assert.rejects(() => handler({ method: 'POST' }, '/staff/menu/create', input), /owner required/);
  assert.equal(calls.length, 1);
});

test('owner cannot create a menu with an empty option template', async () => {
  await db.exec(`insert into public.option_groups(code,name) values('empty-template','กลุ่มไม่มีตัวเลือก');
    insert into public.menu_item_option_groups(menu_item_id,group_id,min_selections,max_selections)
    select m.id,g.id,0,1 from public.menu_items m,public.option_groups g where m.code='water' and g.code='empty-template';`);
  await assert.rejects(() => rpc('create_menu', [owner, JSON.stringify(newMenu({code:'empty-options-menu',optionGroupCodes:['empty-template']}))]), /ตัวเลือก/);
  assert.equal(await scalar("select count(*)::int from public.menu_items where code='empty-options-menu'"),0);
});
