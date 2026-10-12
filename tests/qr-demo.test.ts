import test from 'node:test';
import assert from 'node:assert/strict';
import { demoQr } from '../src/staff/qr.ts';

test('Demo staff can display the owner QR links but cannot rotate them', (t) => {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const owner = { id: 'demo-1', token: 'demo-owner', name: 'Owner', role: 'owner' as const };
  const staff = { id: 'demo-2', token: 'demo-staff', name: 'Staff', role: 'admin' as const };
  const first = demoQr(owner, 'https://example.test/');
  assert.equal(first.length, 10);
  assert.deepEqual(demoQr(staff, 'https://example.test/'), first);
  assert.throws(() => demoQr(staff, 'https://example.test/', first[0]), /เฉพาะเจ้าของร้าน/);
  assert.deepEqual(demoQr(owner, 'https://example.test/'), first);
  const rotated = demoQr(owner, 'https://example.test/', first[0]);
  assert.notEqual(rotated[0].url, first[0].url);
  assert.deepEqual(demoQr(staff, 'https://example.test/'), rotated);
});
