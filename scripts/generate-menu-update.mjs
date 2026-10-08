// Generate a one-time catalog migration into an empty file created by the CLI.
// Never regenerate an applied migration; create a new file first.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { starterCatalog, menuCategories } from '../src/catalog.ts';
const draft = process.argv[2] === '--draft';
const target = process.argv[draft ? 3 : 2];
if (!target || !resolve(target).startsWith((draft ? '/tmp' : resolve('supabase/migrations')) + '/') || readFileSync(target, 'utf8').trim()) {
  throw new Error('Pass an empty CLI-created migration file, or --draft /tmp/file.sql for verification before MCP deployment.');
}
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = ['-- Owner-authorized menu photo transcription. Prices corrected for future orders only.',
  '-- Existing order item snapshots and retired menu rows remain intact.', 'begin;', 'select pg_advisory_xact_lock(814208);'];
for (const c of menuCategories) sql.push(`insert into public.menu_categories(code,name,sort_order) values(${q(c.code)},${q(c.name)},${c.sortOrder}) on conflict(code) do update set name=excluded.name,sort_order=excluded.sort_order,is_active=true;`);
for (const item of starterCatalog) {
  sql.push(`insert into public.menu_items(category_id,code,name,description,unit,prep_notes) select id,${q(item.code)},${q(item.name)},${q(item.description)},${q(item.unit)},array[${item.prepNotes.map(q).join(',')}]::text[] from public.menu_categories where code=${q(item.category)} on conflict(code) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,unit=excluded.unit,prep_notes=excluded.prep_notes,is_active=true;`);
  for (const [i,v] of item.variants.entries()) sql.push(`insert into public.menu_variants(menu_item_id,code,name,price_satang,is_default) select id,${q(v.code)},${q(v.name)},${v.priceSatang},${i===0} from public.menu_items where code=${q(item.code)} on conflict(menu_item_id,code) do update set name=excluded.name,price_satang=excluded.price_satang,is_active=true,is_default=excluded.is_default;`);
  for (const g of item.groups) {
    sql.push(`insert into public.option_groups(code,name) values(${q(g.code)},${q(g.name)}) on conflict(code) do update set name=excluded.name;`);
    sql.push(`insert into public.menu_item_option_groups(menu_item_id,group_id,min_selections,max_selections) select m.id,g.id,${g.min},${g.max} from public.menu_items m,public.option_groups g where m.code=${q(item.code)} and g.code=${q(g.code)} on conflict(menu_item_id,group_id) do update set min_selections=excluded.min_selections,max_selections=excluded.max_selections;`);
    for (const o of g.options) {
      sql.push(`insert into public.menu_options(group_id,code,name,price_delta_satang) select id,${q(o.code)},${q(o.name)},${o.priceSatang} from public.option_groups where code=${q(g.code)} on conflict(group_id,code) do update set name=excluded.name,price_delta_satang=excluded.price_delta_satang,is_active=true;`);
      sql.push(`insert into public.menu_item_options(menu_item_id,group_id,option_id,default_quantity) select m.id,g.id,o.id,${o.defaultQuantity??0} from public.menu_items m,public.option_groups g,public.menu_options o where m.code=${q(item.code)} and g.code=${q(g.code)} and o.group_id=g.id and o.code=${q(o.code)} on conflict(menu_item_id,option_id) do update set default_quantity=excluded.default_quantity,price_override_satang=null;`);
    }
  }
}
sql.push("-- The trial-only braised-pork dish is absent from the supplied real menu; keep its history.",
  "update public.menu_items set is_active=false where code='braised-pork-noodles';",
  "update public.menu_categories set is_active=false where code='yentafo' and not exists(select 1 from public.menu_items where category_id=public.menu_categories.id and is_active);", 'commit;');
writeFileSync(target, sql.join('\n') + '\n');
console.log(`Prepared ${starterCatalog.length} real menu entries in ${target}.`);
