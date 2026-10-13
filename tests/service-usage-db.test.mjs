import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite(), owner = randomUUID(), staff = randomUUID();
const readUsage = async actor => (await db.query('select public.owner_service_usage($1) as data', [actor])).rows[0].data;
before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;");
  const root = new URL('../supabase/', import.meta.url), first = ['202610050001_initial_schema.sql', '202610050002_application_api.sql'];
  for (const file of first) await db.exec(readFileSync(new URL('migrations/' + file, root), 'utf8'));
  for (const file of ['seed.sql', 'menu-seed.sql']) await db.exec(readFileSync(new URL(file, root), 'utf8'));
  for (const file of readdirSync(new URL('migrations/', root)).filter(f => f.endsWith('.sql') && !first.includes(f)).sort()) await db.exec(readFileSync(new URL('migrations/' + file, root), 'utf8'));
  await db.query('insert into auth.users values($1),($2)', [owner, staff]);
  await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,2,'Staff','admin')", [owner, staff]);
});
after(() => db.close());
test('Usage RPC returns current database size and unavailable Storage when the schema is missing', async () => {
  const usage = await readUsage(owner);
  assert(usage.databaseBytes > 0);
  assert.equal(usage.storageBytes, null);
  assert.equal(usage.storageComplete, false);
  assert.deepEqual(usage.snapshots, []);
});
test('Usage RPC denies staff and browser roles and snapshot writes are service-only', async () => {
  await assert.rejects(() => readUsage(staff), e => e.code === 'PT403');
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(() => readUsage(owner), /permission denied/);
      await assert.rejects(() => db.exec('select * from public.service_usage_snapshots'), /permission denied/);
      await assert.rejects(() => db.exec("insert into public.service_usage_snapshots(provider,payload) values('cloudflare','{}')"), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
});
test('Storage zero is real while incomplete object metadata is unavailable; snapshots carry their collection time', async () => {
  await db.exec("create schema storage; create table storage.objects(metadata jsonb); grant usage on schema storage to service_role; grant select on storage.objects to service_role;");
  assert.equal((await readUsage(owner)).storageBytes, 0);
  assert.equal((await readUsage(owner)).storageComplete, true);
  await db.exec("insert into storage.objects values('{\"size\":150000}'),('{}')");
  assert.equal((await readUsage(owner)).storageBytes, null);
  assert.equal((await readUsage(owner)).storageComplete, false);
  await db.exec("delete from storage.objects where metadata='{}'; insert into public.service_usage_snapshots(provider,payload) values('cloudflare','{\"builds\":40,\"projects\":1}')");
  const usage = await readUsage(owner);
  assert.equal(usage.storageBytes, 150000);
  assert.equal(usage.snapshots[0].payload.builds, 40);
  assert.equal(typeof usage.snapshots[0].observedAt, 'string');
});
