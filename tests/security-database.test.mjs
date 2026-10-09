import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const sha = value => createHash('sha256').update(value).digest('hex');

test('Final migration chain preserves RLS, service-only mutations and inactive/customer isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to authenticated,service_role;`);
    for (const file of readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    for (const file of ['seed.sql', 'menu-seed.sql']) await db.exec(readFileSync(new URL('../supabase/' + file, import.meta.url), 'utf8'));
    const owner = randomUUID(), inactive = randomUUID();
    await db.query('insert into auth.users(id) values($1),($2)', [owner, inactive]);
    await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role,is_active) values($1,1,'Synthetic owner','owner',true),($2,2,'Synthetic inactive','admin',false)", [owner, inactive]);
    const tables = (await db.query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
    assert.equal(tables.length, 22);
    assert.ok(tables.every(t => t.relrowsecurity));
    const functions = (await db.query("select p.proname,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows;
    for (const f of functions) {
      assert.equal(f.anon_execute, false, f.proname);
      assert.equal(f.authenticated_execute, ['is_staff', 'staff_sales_report'].includes(f.proname), f.proname);
    }
    const entries = Array.from({ length: 9 }, (_, i) => ({ tableNumber: i < 8 ? i + 1 : null, hash: sha('synthetic-entry-' + i) }));
    await db.query('select public.rotate_qr($1,$2)', [owner, JSON.stringify(entries)]);
    for (const who of ['A', 'B']) await db.query('select public.customer_bootstrap($1,$2,null)', [entries[0].hash, sha('synthetic-customer-' + who)]);
    const payload = { lines: [{ itemCode: 'water', variantCode: 'normal', quantity: 1, options: [], notes: [] }], expectedTotalSatang: 1000 };
    await db.query('select public.place_order($1,$2,$3,$4,null)', [JSON.stringify(payload), randomUUID(), sha('request'), sha('synthetic-customer-A')]);
    assert.deepEqual((await db.query('select public.customer_orders($1) as orders', [sha('synthetic-customer-B')])).rows[0].orders, []);
    const count = async () => (await db.query('select count(*)::integer as n from public.orders')).rows[0].n;
    assert.equal(await count(), 1);
    await assert.rejects(() => db.query('select public.place_order($1,$2,$3,null,$4)', [JSON.stringify({ ...payload, channel: 'takeaway' }), randomUUID(), sha('inactive-request'), inactive]), /สิทธิ์/);
    assert.equal(await count(), 1, 'inactive actor denial must leave orders unchanged');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [inactive]);
    await db.exec('set role authenticated');
    assert.equal(await count(), 0, 'inactive staff cannot read orders through RLS');
    await assert.rejects(() => db.query('select public.staff_sales_report($1,$2)', ['2026-10-01', '2026-11-01']), /เข้าสู่ระบบ/);
    await assert.rejects(() => db.query('select public.rotate_qr($1,$2)', [owner, JSON.stringify(entries)]), /permission denied/);
    await assert.rejects(() => db.query("update public.admins set role='owner'"), /permission denied/);
    await db.exec('reset role');
    assert.equal(await count(), 1);
    const orderId=(await db.query('select id from public.orders')).rows[0].id;
    await db.query("select public.staff_order_action($1,$2,'status','cancelled')", [owner,orderId]);
    await db.query('select public.close_table($1,1)', [owner]);
    for (const who of ['A', 'B']) await assert.rejects(() => db.query('select public.customer_orders($1)', [sha('synthetic-customer-' + who)]), /หมดอายุ/);
  } finally { await db.close(); }
});
