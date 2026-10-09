import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { requestJson, RequestFailure } from '../src/http.ts';

test('network retries require an idempotency key for writes and retain the exact request', async () => {
  const requests: { body: string; key: string | undefined }[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({ body, key: req.headers['idempotency-key'] as string | undefined });
    if (requests.length === 1) { req.socket.destroy(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"one-order"}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const port = (server.address() as { port: number }).port;
    const result = await requestJson<{ id: string }>('http://127.0.0.1:' + port,
      { method: 'POST', headers: { 'Idempotency-Key': 'same-key' }, body: '{"lines":[1]}' }, 'same-key');
    assert.equal(result.id, 'one-order'); assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
    requests.length = 0;
    await assert.rejects(() => requestJson('http://127.0.0.1:' + port, { method: 'POST', body: '{"newMenu":1}' }),
      (error: unknown) => error instanceof RequestFailure && error.uncertain);
    assert.equal(requests.length, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
