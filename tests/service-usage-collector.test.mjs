import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCloudflareUsage } from '../scripts/sync-service-usage.mjs';
const now = new Date('2026-10-13T04:00:00Z');
const build = (id, created = '2026-10-10T04:00:00Z', started = created) => ({ id, created_on: created, stages: [{ name: 'build', started_on: started, status: 'failure' }] });
const response = (result, page = 1, total = result.length, perPage = 25) => ({ success: true, result, result_info: { page, count: result.length, total_count: total, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } });

test('collector covers all projects/pages, counts started failed builds and deduplicates deployment IDs', async () => {
  const calls = [];
  const snapshot = await collectCloudflareUsage({ accountId: 'account', now, fetchJson: async path => {
    calls.push(path);
    if (!path.includes('/deployments')) return response([{ name: 'one', uses_functions: false }, { name: 'two', uses_functions: true }], 1, 2, 10);
    if (path.includes('/one/') && path.includes('page=1')) return response([build('a'), build('b'), ...Array.from({ length: 23 }, (_, i) => build('old-' + i, '2026-09-30T04:00:00Z'))], 1, 28);
    if (path.includes('/one/')) return response([build('b'), build('old', '2026-09-30T04:00:00Z'), build('cancelled', undefined, null)], 2, 28);
    return response([build('c')]);
  }, projectName: 'one' });
  assert.equal(snapshot.builds, 3);
  assert.equal(snapshot.projects, 2);
  assert.equal(snapshot.usesFunctions, false);
  assert.equal(snapshot.periodStart, '2026-10-01T00:00:00.000Z');
  assert.equal(snapshot.periodEnd, '2026-11-01T00:00:00.000Z');
  assert.equal(calls.filter(p => p.includes('/deployments')).length, 3);
  assert.equal(JSON.stringify(snapshot).includes('Bearer'), false);
});
test('API errors and incomplete pagination never publish partial counts', async () => {
  for (const response of [{ success: false, errors: [{ code: 10000 }] }, { success: true, result: [], result_info: { page: 1, total_pages: 5000 } }, { success: true, result: [] }]) {
    await assert.rejects(() => collectCloudflareUsage({ accountId: 'account', now, projectName: 'one', fetchJson: async () => response }));
  }
});
test('builds are counted by actual build start time, not deployment creation time', async () => {
  const snapshot = await collectCloudflareUsage({ accountId: 'account', now, projectName: 'one', fetchJson: async path => path.includes('/deployments') ? response([build('a', '2026-09-30T23:59:00Z', '2026-10-01T00:01:00Z'), build('future', '2026-11-01T01:00:00Z')]) : response([{ name: 'one', uses_functions: false }], 1, 1, 10) });
  assert.equal(snapshot.builds, 1);
});
test('successful but truncated pages and changing advertised totals fail rather than publishing a complete count', async () => {
  for (const truncated of [response([], 1, 12), response([build('a')], 1, 12)]) {
    await assert.rejects(() => collectCloudflareUsage({ accountId: 'account', now, projectName: 'one', fetchJson: async path => path.includes('/deployments') ? truncated : response([{ name: 'one', uses_functions: false }], 1, 1, 10) }), /pagination/);
  }
  await assert.rejects(() => collectCloudflareUsage({ accountId: 'account', now, projectName: 'one', fetchJson: async path => {
    if (!path.includes('/deployments')) return response([{ name: 'one', uses_functions: false }], 1, 1, 10);
    if (path.includes('page=1')) return response(Array.from({ length: 25 }, (_, i) => build(String(i))), 1, 30);
    return response(Array.from({ length: 5 }, (_, i) => build('next-' + i)), 2, 31);
  } }), /pagination/);
});
