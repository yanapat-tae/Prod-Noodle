import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
const env = { APP_ORIGIN: 'https://restaurant.example' };
globalThis.Deno = { env: { get: name => env[name] }, serve: handler => { listener = handler; } };
const { serve, token, staff, rpc, HttpError } = await import('../supabase/functions/_shared/http.ts');
const request = (path = '/customer-api/orders', options = {}) => new Request('https://edge.example/functions/v1' + path, options);
function capture(handler = async () => ({ ok: true })) { serve('customer-api', handler); return listener; }

test('Edge rejects oversized streams before reading the entire body or invoking handler', async () => {
  let handled = false, cancelled = false, pulls = 0;
  const handler = capture(async () => { handled = true; return {}; });
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(30000)); if (pulls === 10) controller.close(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const result = await handler(request('/customer-api/orders', { method: 'POST', body, duplex: 'half' }));
  assert.equal(result.status, 413);
  assert.equal(handled, false);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 3, 'must stop once the byte limit is exceeded');
});

test('Edge limits actual UTF-8 bytes, independent of declared size', async () => {
  const handler = capture();
  assert.equal((await handler(request('/customer-api/orders', { method: 'POST', body: JSON.stringify({ text: 'ก'.repeat(17000) }), headers: { 'Content-Length': '1' } }))).status, 413);
  const accepted = await handler(request('/customer-api/orders', { method: 'POST', body: JSON.stringify({ text: 'ก'.repeat(16000) }) }));
  assert.equal(accepted.status, 200);
});

test('Edge rejects route prefix lookalikes', async () => {
  const handler = capture();
  assert.equal((await handler(request('/customer-api-evil/orders'))).status, 404);
  assert.equal((await handler(request('/other/customer-api/orders'))).status, 404);
});

test('Bearer parsing requires the scheme and supports its case-insensitive form', () => {
  assert.equal(token(request(undefined, { headers: { Authorization: 'abc' } })), '');
  assert.equal(token(request(undefined, { headers: { Authorization: 'Basic abc' } })), '');
  assert.equal(token(request(undefined, { headers: { Authorization: 'bEaReR abc' } })), 'abc');
  assert.equal(token(request(undefined, { headers: { Authorization: 'Bearer abc extra' } })), '');
});

test('Edge rejects CORS mismatch, malformed JSON and unsupported methods before handler', async () => {
  let calls = 0;
  const handler = capture(async () => { calls++; return {}; });
  const mismatch = await handler(request(undefined, { headers: { Origin: 'https://other.example' } }));
  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await handler(request(undefined, { method: 'DELETE' }))).status, 405);
  for (const body of ['{', 'null', '[]', '"text"']) assert.equal((await handler(request(undefined, { method: 'POST', body }))).status, 400);
  const preflight = await handler(request(undefined, { method: 'OPTIONS', headers: { Origin: env.APP_ORIGIN } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.APP_ORIGIN);
  assert.equal(calls, 0);
});

function database({ authError = null, user = { id: 'test-user' }, profile = { is_active: true, role: 'admin' }, profileError = null } = {}) {
  return { auth: { getUser: async () => ({ data: { user }, error: authError }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: profileError }) }) }) }) };
}
test('Staff guard fails closed for missing/invalid identity, inactive profiles and owner actions', async () => {
  await assert.rejects(() => staff(database(), request()), e => e instanceof HttpError && e.status === 401);
  const signed = request(undefined, { headers: { Authorization: 'Bearer test-token' } });
  await assert.rejects(() => staff(database({ authError: {} }), signed), e => e.status === 401);
  await assert.rejects(() => staff(database({ user: null }), signed), e => e.status === 401);
  await assert.rejects(() => staff(database({ profile: null }), signed), e => e.status === 403);
  await assert.rejects(() => staff(database({ profile: { is_active: false, role: 'owner' } }), signed), e => e.status === 403);
  await assert.rejects(() => staff(database(), signed, true), e => e.status === 403);
  assert.equal(await staff(database(), signed), 'test-user');
  assert.equal(await staff(database({ profile: { is_active: true, role: 'owner' } }), signed, true), 'test-user');
});

test('Unexpected handler/database errors do not expose internals', async () => {
  const result = await capture(async () => { throw new Error('synthetic-private-detail'); })(request());
  assert.equal(result.status, 500);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await result.text()).includes('synthetic-private-detail'));
  await assert.rejects(() => rpc({ rpc: async () => ({ error: { code: 'XX000', message: 'synthetic-private-detail' } }) }, 'test'), e => e.status === 500 && !e.message.includes('synthetic-private-detail'));
});
