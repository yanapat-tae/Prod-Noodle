// Bounded live test: eight orders with five dishes each. Credentials stay ignored.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { priceLine } from '../src/domain.ts';

const action = process.argv[2];
const sha = value => createHash('sha256').update(value).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const percentile = (values, fraction) => values.length ? Math.round([...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction) - 1]) : null;
async function http(base, origin, path, { method = 'GET', body, token, key } = {}) {
  const start = performance.now();
  try {
    const response = await fetch(base + '/functions/v1/' + path, { method,
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(process.env.TABLE_TEST_PUBLIC_KEY ? { apikey: process.env.TABLE_TEST_PUBLIC_KEY } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    return { ok: response.ok, status: response.status, elapsedMs: Math.round(performance.now() - start), data };
  } catch (error) {
    // Never include request headers, token or body in reports/logs.
    return { ok: false, status: null, elapsedMs: Math.round(performance.now() - start), error: error.name + ': ' + error.message };
  }
}
if (action === 'prepare') {
  const base = process.env.TABLE_TEST_BASE_URL?.replace(/\/$/, '');
  const origin = process.env.TABLE_TEST_ORIGIN;
  if (!base?.startsWith('https://') || !origin?.startsWith('https://')) throw new Error('Set TABLE_TEST_BASE_URL and TABLE_TEST_ORIGIN to the authorized project/frontend.');
  const menuResponse = await http(base, origin, 'public-api/menu');
  if (!menuResponse.ok || !Array.isArray(menuResponse.data)) throw new Error('Menu preflight failed: ' + (menuResponse.status ?? menuResponse.error));
  const menu = menuResponse.data;
  const dishes = menu.filter(item => item.available && ['noodles', 'soup-only', 'rice', 'snacks'].includes(item.category) && !/^(extra-|plain-rice)/.test(item.code));
  if (dishes.length < 5) throw new Error('Need five available food dishes.');
  const runId = 'tables-' + new Date().toISOString().replace(/[-:.]/g, '').slice(0,15) + '-' + randomUUID().slice(0,8);
  const dir = resolve('.local-data/table-tests', runId); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tables = Array.from({ length: 8 }, (_, index) => {
    const tableNumber = index + 1;
    const lines = Array.from({ length: 5 }, (_, dishIndex) => {
      const item = dishes[(index * 3 + dishIndex) % dishes.length];
      const options = item.groups.flatMap(group => {
        const defaults = group.options.filter(option => option.defaultQuantity);
        const choices = defaults.length ? defaults.slice(0, group.max) : group.min ? group.options.slice(0, group.min) : [];
        return choices.map(option => ({ groupCode: group.code, optionCode: option.code, quantity: 1 }));
      });
      return { itemCode: item.code, variantCode: item.variants[dishIndex % item.variants.length].code, quantity: 1, options, notes: [], freeNote: runId + ' — ทดสอบระบบ ไม่ต้องทำอาหาร — โต๊ะ ' + tableNumber };
    });
    const priced = lines.map(line => priceLine(menu, line));
    return { tableNumber, token: randomBytes(32).toString('hex'), key: randomUUID(), payload: { lines, expectedTotalSatang: priced.reduce((sum,line) => sum + line.totalSatang, 0) }, menuNames: priced.map(line => line.name) };
  });
  save(join(dir,'private.json'), { runId, base, origin, preparedAt: new Date().toISOString(), menuCount: menu.length, tables });
  const values = tables.map(table => '(' + table.tableNumber + ", '" + sha(table.token) + "')").join(',\n');
  const sql = `-- Creates bounded test customer sessions using existing QR hashes; no QR rotation.\nwith clients(table_number, new_hash) as (values ${values})\nselect c.table_number, public.customer_bootstrap(q.token_hash,c.new_hash,null) as session\nfrom clients c join public.restaurant_tables t on t.table_number=c.table_number\njoin public.qr_entrypoints q on q.table_id=t.id and q.kind='dine_in' and q.is_active\norder by c.table_number;\n`;
  writeFileSync(join(dir,'bootstrap.sql'), sql, { mode: 0o600 });
  console.log(JSON.stringify({ runId, privateFile: join(dir,'private.json'), bootstrapSql: join(dir,'bootstrap.sql'), plannedOrders: 8, linesPerOrder: 5, plannedLines: 40 }));
} else if (action === 'run') {
  if (process.env.TABLE_TEST_ALLOW_WRITE !== 'EIGHT_TABLES_AUTHORIZED') throw new Error('Set TABLE_TEST_ALLOW_WRITE=EIGHT_TABLES_AUTHORIZED after authorization for eight live test orders.');
  const path = resolve(process.argv[3] ?? '');
  if (!path.startsWith(resolve('.local-data/table-tests') + '/')) throw new Error('Use the ignored private.json created by prepare.');
  const test = JSON.parse(readFileSync(path, 'utf8'));
  if (test.tables.length !== 8 || test.tables.some(t => t.payload.lines.length !== 5)) throw new Error('Invalid bounded plan.');
  const preflightStart = performance.now();
  const preflight = await fetch(test.base + '/functions/v1/customer-api/orders', { method: 'OPTIONS', headers: { Origin: test.origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type,idempotency-key' }, signal: AbortSignal.timeout(20000) });
  const cors = { status: preflight.status, elapsedMs: Math.round(performance.now() - preflightStart), originCorrect: preflight.headers.get('Access-Control-Allow-Origin') === test.origin,
    headersCorrect: ['authorization','apikey','content-type','idempotency-key'].every(name => preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(',').map(value=>value.trim()).includes(name)) };
  if (cors.status !== 204 || !cors.originCorrect || !cors.headersCorrect) throw new Error('CORS preflight failed; no test orders submitted.');
  const sessions = await Promise.all(test.tables.map(async table => ({ tableNumber: table.tableNumber, response: await http(test.base,test.origin,'customer-api/orders',{token:table.token}) })));
  if (sessions.some(session => !session.response.ok)) {
    console.log(JSON.stringify({ error:'Session preflight failed; no orders submitted', statuses:sessions.map(s=>({table:s.tableNumber,status:s.response.status,error:s.response.error??s.response.data?.error})) }));process.exitCode=1;
  } else {
    const startedAt = new Date().toISOString(), start = performance.now();
    const submissions = await Promise.all(test.tables.map(async table => {
      const launchMs = performance.now() - start;
      const response = await http(test.base,test.origin,'customer-api/orders',{method:'POST',body:table.payload,token:table.token,key:table.key});
      return { tableNumber:table.tableNumber, launchMs:Number(launchMs.toFixed(2)), response };
    }));
    const burstMs = Math.round(performance.now() - start);
    // Identical retries, including uncertain responses: same payload/session/key.
    const retries = await Promise.all(test.tables.map(async table => ({ tableNumber:table.tableNumber,response:await http(test.base,test.origin,'customer-api/orders',{method:'POST',body:table.payload,token:table.token,key:table.key}) })));
    const reads = await Promise.all(test.tables.map(async table => ({ tableNumber:table.tableNumber,response:await http(test.base,test.origin,'customer-api/orders',{token:table.token}) })));
    const results = submissions.map(submission => {
      const table = test.tables.find(t=>t.tableNumber===submission.tableNumber), retry = retries.find(t=>t.tableNumber===submission.tableNumber).response, read = reads.find(t=>t.tableNumber===submission.tableNumber).response;
      const order = submission.response.ok ? submission.response.data : retry.ok ? retry.data : null;
      const matched = Array.isArray(read.data) ? read.data.filter(order=>order.lines.some(line=>line.freeNote?.includes(test.runId))) : [];
      return { table:table.tableNumber, menuNames:table.menuNames, expectedTotalSatang:table.payload.expectedTotalSatang, launchMs:submission.launchMs, submitStatus:submission.response.status, submitMs:submission.response.elapsedMs, submitError:submission.response.error??(!submission.response.ok ? submission.response.data?.error : null), retryStatus:retry.status, retryMs:retry.elapsedMs, retrySameId:!!order&&retry.ok&&retry.data.id===order.id, orderId:order?.id??null, returnedTable:order?.tableNumber??null, lineCount:order?.lines.length??0, totalCorrect:order?.totalSatang===table.payload.expectedTotalSatang, customerReadStatus:read.status, customerReadCount:matched.length, notesCorrect:!!order&&order.lines.every(line=>line.freeNote?.includes(test.runId)) };
    });
    const timings = submissions.filter(s=>s.response.ok).map(s=>s.response.elapsedMs);
    const report = { runId:test.runId, environment:test.base, frontend:test.origin, startedAt, finishedAt:new Date().toISOString(), cors, concurrency:8, plannedOrders:8, plannedLines:40, burstMs, launchSpreadMs:Number((Math.max(...results.map(r=>r.launchMs))-Math.min(...results.map(r=>r.launchMs))).toFixed(2)), successfulInitialRequests:timings.length, uniqueReturnedOrders:new Set(results.map(r=>r.orderId).filter(Boolean)).size, metrics:{p50ms:percentile(timings,.5),p95ms:percentile(timings,.95),maxMs:percentile(timings,1)}, results };
    save(join(resolve(path,'..'),'report.json'), report);
    console.log(JSON.stringify(report,null,2));
    if (results.some(r=>r.submitStatus!==200||!r.retrySameId||r.returnedTable!==r.table||r.lineCount!==5||!r.totalCorrect||r.customerReadCount!==1||!r.notesCorrect)) process.exitCode=1;
  }
} else throw new Error('Usage: prepare | run .local-data/table-tests/RUN/private.json');
