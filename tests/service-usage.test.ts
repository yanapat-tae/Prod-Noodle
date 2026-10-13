import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceUsageReport, usageProgress, demoServiceUsage, type RawServiceUsage } from '../src/service-usage.ts';

const now = new Date('2026-10-13T04:00:00Z');
const raw = (): RawServiceUsage => ({ checkedAt: now.toISOString(), databaseBytes: 29_732_725, storageBytes: 0, storageComplete: true, snapshots: [{ provider: 'cloudflare', observedAt: now.toISOString(), payload: { builds: 40, projects: 1, usesFunctions: false, periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-11-01T00:00:00Z' } }] });
const metric = (input: RawServiceUsage, id: string, clock = now) => serviceUsageReport(input, clock).providers.flatMap(p => p.metrics).find(m => m.id === id)!;

test('both providers distinguish measured zero, unsupported billing, unlimited requests and unused functions', () => {
  const report = serviceUsageReport(raw(), now);
  assert.deepEqual(report.providers.map(p => p.id), ['supabase', 'cloudflare']);
  assert.equal(metric(raw(), 'database').used, 29_732_725);
  assert.equal(usageProgress(metric(raw(), 'database')).percent, 5.946545);
  assert.equal(metric(raw(), 'storage').used, 0);
  assert.equal(usageProgress(metric(raw(), 'storage')).percent, 0);
  assert.equal(metric(raw(), 'functions').used, null);
  assert.equal(usageProgress(metric(raw(), 'functions')).percent, null);
  assert.equal(metric(raw(), 'static-requests').status, 'unlimited');
  assert.equal(metric(raw(), 'pages-functions').status, 'not_used');
});
test('unknown provider data and partial Storage metadata never become zero', () => {
  const input = { ...raw(), storageComplete: false, snapshots: [] };
  assert.equal(metric(input, 'storage').used, null);
  assert.equal(metric(input, 'builds').used, null);
  assert.equal(metric(input, 'projects').used, null);
  assert.equal(metric(input, 'pages-functions').status, 'unavailable');
});
test('invalid numbers and future measurements are unavailable', () => {
  for (const databaseBytes of [-1, NaN, Infinity]) assert.equal(metric({ ...raw(), databaseBytes }, 'database').used, null);
  const input = raw(); input.snapshots[0].observedAt = '2026-10-14T04:00:00Z';
  assert.equal(metric(input, 'builds').used, null);
  assert.equal(metric({ ...raw(), checkedAt: 'not a date' }, 'database').used, null);
});
test('previous-month builds are unavailable and old total snapshots are marked stale', () => {
  const input = raw(); input.snapshots[0].observedAt = '2026-10-10T04:00:00Z';
  assert.equal(metric(input, 'builds').stale, true);
  const nextMonth = new Date('2026-11-02T04:00:00Z');
  assert.equal(metric(input, 'builds', nextMonth).used, null);
  assert.equal(metric(input, 'projects', nextMonth).used, 1);
  assert.equal(metric(input, 'projects', nextMonth).stale, true);
});
test('warning thresholds and exceeded percentages remain visible while only the bar is clamped', () => {
  for (const [used, severity] of [[400_000_000, 'warning'], [475_000_000, 'danger'], [600_000_000, 'danger']] as const) {
    const progress = usageProgress(metric({ ...raw(), databaseBytes: used }, 'database'));
    assert.equal(progress.severity, severity);
    assert.equal(progress.percent, used / 500_000_000 * 100);
    assert.equal(progress.barPercent, Math.min(progress.percent!, 100));
  }
  assert.equal(usageProgress(metric(raw(), 'functions')).severity, 'unknown');
});
test('demo is explicitly marked synthetic and uses no hosted snapshot', () => {
  const demo = demoServiceUsage(now);
  assert.equal(demo.demo, true);
  assert.equal(serviceUsageReport(demo, now).demo, true);
});
