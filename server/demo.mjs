import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { starterCatalog, catalogVersion, upgradeSavedCatalog } from '../src/catalog.ts';
import { DomainError, priceLine, canTransition, businessDate, validateSummary, validateTakeaway } from '../src/domain.ts';
import { validateNewMenu, menuFromInput, validateMenuName } from '../src/menu-management.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
const staffProfiles = Array.from({ length: 4 }, (_, i) => ({ id: 'demo-' + (i + 1), name: i ? 'พนักงาน ' + i : 'เจ้าของร้าน', role: i ? 'admin' : 'owner' }));
export function createDemoServer({ dataPath = resolve('.local-data/demo.json') } = {}) {
  let state = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : { catalog: structuredClone(starterCatalog), orders: [], visits: {}, customers: {}, counters: {}, summaries: [], requests: {}, events: [] };
  if (state.catalogVersion !== catalogVersion) { state.catalog = upgradeSavedCatalog(state.catalog, state.catalogVersion); state.catalogVersion = catalogVersion; }
  const staffTokens = new Map();
  const persist = () => { mkdirSync(dirname(dataPath), { recursive: true }); writeFileSync(dataPath + '.tmp', JSON.stringify(state)); renameSync(dataPath + '.tmp', dataPath); };
  const newToken = () => randomBytes(24).toString('hex');
  const session = (token) => { const customer = state.customers[sha(token ?? '')]; if (!customer || customer.expires < Date.now() || (customer.visitId && state.visits[customer.tableNumber]?.id !== customer.visitId)) throw new DomainError('รอบโต๊ะหมดอายุ กรุณาสแกน QR ใหม่', 401); return customer; };
  const staff = (token, owner = false) => { const identity = staffTokens.get(token); if (!identity || identity.expires < Date.now()) throw new DomainError('กรุณาเข้าสู่ระบบพนักงาน', 401); if (owner && identity.role !== 'owner') throw new DomainError('เฉพาะเจ้าของร้านเท่านั้น', 403); return identity; };
  const createOrder = (payload, actor, key) => {
    if (!/^[0-9a-f-]{36}$/i.test(key ?? '')) throw new DomainError('คำขอไม่มีรหัสอ้างอิง');
    const hash = sha(JSON.stringify(payload)); const scope = actor.id ?? actor.sessionId;
    const previous = state.requests[key];
    if (previous) { if (previous.hash !== hash || previous.scope !== scope) throw new DomainError('รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว', 409); return state.orders.find(o => o.id === previous.orderId); }
    if (!Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 30) throw new DomainError('กรุณาเพิ่มอาหารลงตะกร้า');
    const lines = payload.lines.map(input => priceLine(state.catalog, input));
    const total = lines.reduce((s, l) => s + l.totalSatang, 0);
    if (total !== payload.expectedTotalSatang) throw new DomainError('ราคาเปลี่ยน กรุณาตรวจตะกร้าอีกครั้ง', 409);
    const channel = actor.role ? payload.channel : actor.channel;
    if (!['dine_in', 'takeaway'].includes(channel)) throw new DomainError('ช่องทางออเดอร์ไม่ถูกต้อง');
    if (channel !== 'takeaway' && payload.takeaway != null) throw new DomainError('ข้อมูลกลับบ้านใช้เฉพาะออเดอร์กลับบ้าน');
    const takeaway = payload.takeaway == null ? null : validateTakeaway(payload.takeaway);
    const tableNumber = channel === 'dine_in' ? (actor.role ? payload.tableNumber : actor.tableNumber) : null;
    if (channel === 'dine_in' && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 8)) throw new DomainError('เลขโต๊ะไม่ถูกต้อง');
    if (tableNumber && !state.visits[tableNumber]) state.visits[tableNumber] = { id: randomUUID(), openedAt: new Date().toISOString() };
    const date = businessDate();
    const queueNumber = channel === 'takeaway' ? (state.counters[date] ?? 0) + 1 : null;
    const order = { id: randomUUID(), channel, takeaway, tableNumber, queueNumber, visitId: tableNumber ? state.visits[tableNumber].id : null, customerSessionId: actor.sessionId ?? null, status: 'new', lines, totalSatang: total, createdAt: new Date().toISOString(), paidAt: null, paymentMethod: null, refundedAt: null, refundedSatang: 0 };
    if (queueNumber) state.counters[date] = queueNumber;
    state.orders.push(order); state.requests[key] = { hash, scope, orderId: order.id };
    state.events.push({ orderId: order.id, status: 'new', actor: actor.name ?? 'ลูกค้า', at: order.createdAt }); persist(); return order;
  };
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    const json = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      let body = {}; if (req.method !== 'GET') { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 50000) throw new DomainError('คำขอมีขนาดใหญ่เกินไป', 413); } if (raw) { try { body = JSON.parse(raw); } catch { throw new DomainError('คำขอไม่ถูกต้อง'); } } }
      if (req.method === 'GET' && path === '/api/menu') return json(200, state.catalog);
      if (req.method === 'POST' && path === '/api/customer/session') {
        if (token) { try { const current = session(token); return json(200, { ...current, token }); } catch { /* Start a new visit/session after expiry. */ } }
        const tableNumber = body.entry === 'takeaway' ? null : Number(body.entry);
        if (tableNumber !== null && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 8)) throw new DomainError('QR ไม่ถูกต้อง');
        if (tableNumber && !state.visits[tableNumber]) state.visits[tableNumber] = { id: randomUUID(), openedAt: new Date().toISOString() };
        const customer = { sessionId: randomUUID(), channel: tableNumber ? 'dine_in' : 'takeaway', tableNumber, visitId: tableNumber ? state.visits[tableNumber].id : null, expires: Date.now() + 4 * 3600_000 };
        const fresh = newToken(); state.customers[sha(fresh)] = customer; persist(); return json(200, { ...customer, token: fresh });
      }
      if (req.method === 'POST' && path === '/api/staff/login') {
        if (body.pin !== (process.env.DEMO_STAFF_PIN ?? '1234')) throw new DomainError('รหัสทดลองไม่ถูกต้อง', 401);
        const profile = staffProfiles.find(p => p.id === body.account); if (!profile) throw new DomainError('บัญชีไม่ถูกต้อง');
        const fresh = newToken(); staffTokens.set(fresh, { ...profile, expires: Date.now() + 12 * 3600_000 }); return json(200, { ...profile, token: fresh });
      }
      if (req.method === 'GET' && path === '/api/staff/me') return json(200, { ...staff(token), token });
      if (req.method === 'POST' && path === '/api/staff/logout') { staffTokens.delete(token); return json(200, { ok: true }); }
      if (req.method === 'POST' && path === '/api/orders') { const customer = session(token); return json(201, createOrder(body, customer, req.headers['idempotency-key'])); }
      if (req.method === 'GET' && path === '/api/orders') { const customer = session(token); return json(200, state.orders.filter(o => o.customerSessionId === customer.sessionId)); }
      if (req.method === 'GET' && path === '/api/staff/state') { staff(token); return json(200, { orders: state.orders, visits: state.visits, summaries: state.summaries }); }
      if (req.method === 'POST' && path === '/api/staff/orders') return json(201, createOrder(body, staff(token), req.headers['idempotency-key']));
      const orderMatch = path.match(/^\/api\/staff\/orders\/([0-9a-f-]+)\/(status|pay|refund)$/i);
      if (req.method === 'POST' && orderMatch) {
        const identity = staff(token, orderMatch[2] === 'refund'); const order = state.orders.find(o => o.id === orderMatch[1]); if (!order) throw new DomainError('ไม่พบออเดอร์', 404);
        if (orderMatch[2] === 'status') { if (order.status !== body.status) { if (!canTransition(order.status, body.status)) throw new DomainError('สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาโหลดใหม่', 409); if (body.status === 'cancelled' && order.paidAt && !order.refundedAt) throw new DomainError('กรุณาคืนเงินก่อนยกเลิก'); order.status = body.status; state.events.push({ orderId: order.id, status: body.status, actor: identity.name, at: new Date().toISOString() }); } }
        if (orderMatch[2] === 'pay') { if (order.status === 'cancelled') throw new DomainError('ออเดอร์ยกเลิกแล้ว'); if (!['cash', 'promptpay'].includes(body.method)) throw new DomainError('วิธีชำระไม่ถูกต้อง'); if (!order.paidAt) { order.paidAt = new Date().toISOString(); order.paymentMethod = body.method; } }
        if (orderMatch[2] === 'refund') { if (!order.paidAt) throw new DomainError('ออเดอร์ยังไม่ชำระ'); if (!order.refundedAt) { order.refundedAt = new Date().toISOString(); order.refundedSatang = order.totalSatang; } }
        persist(); return json(200, order);
      }
      const close = path.match(/^\/api\/staff\/tables\/(\d+)\/close$/);
      if (req.method === 'POST' && close) { staff(token); const table = Number(close[1]); const visit = state.visits[table]; if (!visit) throw new DomainError('โต๊ะปิดแล้ว'); const orders = state.orders.filter(o => o.visitId === visit.id); if (orders.some(o => !['served', 'cancelled'].includes(o.status) || (o.status !== 'cancelled' && !o.paidAt))) throw new DomainError('กรุณาส่งมอบและเคลียร์การชำระเงินก่อนปิดโต๊ะ'); delete state.visits[table]; persist(); return json(200, { ok: true }); }
      if (req.method === 'POST' && path === '/api/staff/delivery') { staff(token, true); const summaries = body.summaries; if (!Array.isArray(summaries) || !summaries.length || summaries.length > 100) throw new DomainError('รายการนำเข้าไม่ถูกต้อง'); summaries.forEach(validateSummary); for (const s of summaries) { const index = state.summaries.findIndex(v => v.date === s.date && v.channel === s.channel); if (index >= 0) state.summaries[index] = s; else state.summaries.push(s); } persist(); return json(200, { ok: true, count: summaries.length }); }
      if (req.method === 'POST' && path === '/api/staff/menu/create') {
        staff(token, true); const input = validateNewMenu(body, state.catalog); const signature = JSON.stringify(input);
        const existing = state.catalog.find(m => m.code === input.code);
        if (existing) { if (state.menuRequests?.[input.code] !== signature) throw new DomainError('รหัสเมนูนี้ถูกใช้แล้ว', 409); return json(201, existing); }
        const item = menuFromInput(input, state.catalog); state.catalog.push(item); state.menuRequests ??= {}; state.menuRequests[input.code] = signature; persist(); return json(201, item);
      }
      if (req.method === 'POST' && path === '/api/staff/menu') { staff(token, true); const item = state.catalog.find(m => m.code === body.code); if (!item) throw new DomainError('ไม่พบเมนู'); const newName = Object.hasOwn(body, 'name') ? validateMenuName(body.name) : item.name; if (body.prices) { for (const v of item.variants) { const price = body.prices[v.code]; if (!Number.isSafeInteger(price) || price < 1 || price > 100_000) throw new DomainError('ราคาไม่ถูกต้อง'); } for (const v of item.variants) v.priceSatang = body.prices[v.code]; } item.name = newName; if (typeof body.available === 'boolean') item.available = body.available; persist(); return json(200, item); }
      json(404, { error: 'ไม่พบหน้าที่ต้องการ' });
    } catch (error) { json(error instanceof DomainError ? error.code : 500, { error: error instanceof DomainError ? error.message : 'ระบบขัดข้อง กรุณาลองใหม่' }); }
  });
}
if (process.argv[1] === new URL(import.meta.url).pathname) { const server = createDemoServer(); server.listen(Number(process.env.DEMO_PORT ?? 4174), '127.0.0.1', () => console.log('Demo API: http://127.0.0.1:4174 — local trial data only')); }
