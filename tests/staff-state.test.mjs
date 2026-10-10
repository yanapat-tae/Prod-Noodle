import test from 'node:test';
import assert from 'node:assert/strict';
import { StaffStateSync } from '../src/staff/state-sync.ts';
import { orderUpdates } from '../src/staff/order-updates.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const state = (orders) => ({ orders, visits: {}, summaries: [] });

test('Concurrent refresh requests coalesce without keeping an action busy through continuous polling', async () => {
  const reads = [],
    published = [];
  const sync = new StaffStateSync(
    () => {
      const request = deferred();
      reads.push(request);
      return request.promise;
    },
    (value) => published.push(value),
    assert.fail,
  );
  const first = sync.refresh(),
    second = sync.refresh(),
    third = sync.refresh();
  assert.equal(reads.length, 1);
  reads[0].resolve(state([{ id: 'old' }]));
  await Promise.all([first, second, third]);
  assert.equal(reads.length, 2);
  reads[1].resolve(state([{ id: 'latest' }]));
  await Promise.resolve();
  assert.deepEqual(published.at(-1), state([{ id: 'latest' }]));
  assert.equal(reads.length, 2);
});

test('Disposing a staff session ignores pending failures and cancels queued refreshes', async () => {
  const request = deferred(),
    published = [],
    errors = [];
  let reads = 0;
  const sync = new StaffStateSync(
    () => {
      reads++;
      return request.promise;
    },
    (value) => published.push(value),
    (error) => errors.push(error),
  );
  const pending = sync.refresh();
  void sync.refresh();
  sync.dispose();
  request.reject(new Error('old login'));
  await pending;
  sync.accept({ id: 'old' });
  await sync.refresh();
  assert.equal(reads, 1);
  assert.deepEqual(published, []);
  assert.deepEqual(errors, []);
});

test('Out-of-order Realtime reads cannot regress status, but different orders update independently', async () => {
  const requests = [],
    received = [];
  const updates = orderUpdates(
    () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    (value) => received.push(value),
  );
  const old = updates.receive('A'),
    other = updates.receive('B'),
    recent = updates.receive('A');
  requests[2].resolve({ id: 'A', status: 'served' });
  await recent;
  requests[1].resolve({ id: 'B', status: 'new' });
  await other;
  requests[0].resolve({ id: 'A', status: 'preparing' });
  await old;
  assert.deepEqual(received, [
    { id: 'A', status: 'served' },
    { id: 'B', status: 'new' },
  ]);
});

test('Delete, stale failures, and stopped subscriptions cannot reinsert an old order', async () => {
  const requests = [],
    received = [];
  const updates = orderUpdates(
    () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    (value) => received.push(value),
  );
  const beforeDelete = updates.receive('A');
  await updates.receive('A', true);
  requests[0].resolve({ id: 'A', status: 'new' });
  await beforeDelete;
  const failed = updates.receive('B'),
    latest = updates.receive('B');
  requests[2].resolve({ id: 'B', status: 'served' });
  await latest;
  requests[1].reject(new Error('stale'));
  await failed;
  const beforeStop = updates.receive('C');
  updates.dispose();
  requests[3].resolve({ id: 'C' });
  await beforeStop;
  await updates.receive('D');
  assert.deepEqual(received, [undefined, { id: 'B', status: 'served' }]);
  assert.equal(requests.length, 4);
});
