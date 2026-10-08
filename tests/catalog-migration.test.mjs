import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { starterCatalog } from '../src/catalog.ts';

test('Real menu migration replaces the trial catalog while preserving retired dishes and historical bills', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    const root = new URL('../supabase/', import.meta.url);
    for (const file of ['migrations/202610050001_initial_schema.sql', 'migrations/202610050002_application_api.sql', 'seed.sql', 'menu-seed.sql']) await db.exec(readFileSync(new URL(file, root), 'utf8'));
    const owner = randomUUID();
    await db.query('insert into auth.users values($1)', [owner]);
    await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner')", [owner]);
    await db.exec(`update public.menu_items set name='หมูนุ่มทดลอง' where code='soft-pork-noodles';
      update public.menu_variants set price_satang=6500 where menu_item_id=(select id from public.menu_items where code='soft-pork-noodles') and code='normal';
      insert into public.menu_items(category_id,code,name,unit) select id,'braised-pork-noodles','หมูตุ๋นทดลอง','ชาม' from public.menu_categories where code='noodles';
      insert into public.menu_variants(menu_item_id,code,name,price_satang,is_default) select id,'normal','ธรรมดา',5000,true from public.menu_items where code='braised-pork-noodles';`);
    const lines = [{itemCode:'soft-pork-noodles',variantCode:'normal',quantity:1,options:[{groupCode:'noodle',optionCode:'sen-lek',quantity:1},{groupCode:'broth',optionCode:'clear',quantity:1}],notes:[]}, {itemCode:'braised-pork-noodles',variantCode:'normal',quantity:1,options:[],notes:[]}];
    const order = (await db.query('select public.place_order($1,$2,$3,null,$4) as value', [JSON.stringify({channel:'dine_in',tableNumber:1,lines,expectedTotalSatang:11500}),randomUUID(),createHash('sha256').update('catalog-test').digest('hex'),owner])).rows[0].value;
    const file = readdirSync(new URL('migrations/', root)).find(name => name.endsWith('_owner_menu_catalog.sql'));
    const path = file ? new URL('migrations/' + file, root) : process.env.DRAFT_MENU_PATH;
    assert.ok(path, 'The real-menu migration must exist');
    await db.exec(readFileSync(path, 'utf8'));
    const snapshot = (await db.query('select public.order_json($1) as value', [order.id])).rows[0].value;
    assert.equal(snapshot.totalSatang, 11500);
    assert.deepEqual(snapshot.lines.map(line=>line.name).sort(), ['หมูตุ๋นทดลอง','หมูนุ่มทดลอง'].sort());
    const catalog = (await db.query('select public.menu_catalog() as value')).rows[0].value;
    assert.equal(catalog.length, 38);
    assert.equal(new Set(catalog.map(item=>item.category)).size, 6);
    assert.ok(!catalog.some(item=>item.code==='braised-pork-noodles'));
    assert.equal((await db.query("select count(*)::int as n from public.menu_items where code='braised-pork-noodles'")).rows[0].n, 1);
    for (const expected of starterCatalog) {
      const actual = catalog.find(item=>item.code===expected.code);
      assert.equal(actual.name, expected.name);
      assert.equal(actual.categoryName, expected.categoryName);
      for (const variant of expected.variants) assert.deepEqual(actual.variants.find(item=>item.code===variant.code), variant);
      for (const group of expected.groups) {
        const found = actual.groups.find(value=>value.code===group.code);
        assert.equal(found.min,group.min); assert.equal(found.max,group.max);
        assert.equal(found.options.length,group.options.length);
        for (const option of group.options) assert.equal(found.options.find(value=>value.code===option.code).priceSatang,option.priceSatang);
      }
    }
  } finally { await db.close(); }
});
