// HTML preview only: all state belongs to this browser, never to the shop's DB.
import { starterCatalog, catalogVersion, upgradeSavedCatalog } from '../src/catalog.ts';
import { businessDate, canTransition, DomainError, priceLine, salesReport, validateSummary, validateTakeaway } from '../src/domain.ts';
import type { CartInput, CustomerSession, DeliverySummary, MenuItem, Order, Staff, Status, TakeawayDetails } from '../src/domain.ts';
import { validateNewMenu, menuFromInput } from '../src/menu-management.ts';
import type { NewMenuInput } from '../src/menu-management.ts';
export const mode = 'demo';
export const supabase = null;
export interface StaffState { orders: Order[]; visits: Record<string, { id: string }>; summaries: DeliverySummary[] }
interface StoredSession extends CustomerSession { sessionId: string; entry: string }
interface PreviewOrder extends Order { customerSessionId: string | null }
interface State extends StaffState { catalogVersion?: number; menuRequests?: Record<string, string>; catalog: MenuItem[]; orders: PreviewOrder[]; sessions: Record<string, StoredSession>; requests: Record<string, { signature: string; orderId: string }>; counters: Record<string, number> }
const STORAGE = 'prod-standalone-html-v1';
const STAFF_STORAGE = 'prod-standalone-html-staff';
const ENTRY_STORAGE = 'prod-standalone-html-entry';
export let persistent = true;
export function safeStorage(kind: 'localStorage' | 'sessionStorage') {
  try { const storage = window[kind]; const probe = 'prod-html-storage-probe'; storage.setItem(probe, '1'); storage.removeItem(probe); return storage; }
  catch {
    persistent = false; const data = new Map<string, string>();
    const fallback: Storage = { get length() { return data.size; }, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: index => [...data.keys()][index] ?? null };
    // Keep drafts usable even in a file viewer that blocks browser storage.
    Object.defineProperty(window, kind, { configurable: true, value: fallback }); return fallback;
  }
}
const local = safeStorage('localStorage'); safeStorage('sessionStorage');
let entry = new URLSearchParams(location.search).get('table') ?? local.getItem(ENTRY_STORAGE) ?? '1';
if (!/^(?:[1-8]|takeaway)$/.test(entry)) entry = '1';
export function activeEntry() { return entry; }
export function selectEntry(value: string) {
  if (!/^(?:[1-8]|takeaway)$/.test(value)) return;
  entry = value; local.setItem(ENTRY_STORAGE, value); location.hash = '#menu'; window.dispatchEvent(new Event('prod-html-context'));
}
function sampleState(): State {
  const catalog = structuredClone(starterCatalog); const orders: PreviewOrder[] = []; const today = businessDate();
  const sampleCodes = ['soft-pork-noodles','two-pork-noodles','red-pork-rice','water','crispy-pork-rice','yentafo','grass-jelly','red-pork-rice','soft-pork-noodles'];
  for (const [index, code] of sampleCodes.entries()) {
    const item = catalog.find(m => m.code === code)!;
    const input: CartInput = { itemCode: code, variantCode: 'normal', quantity: index % 3 === 0 ? 2 : 1, options: item.groups.filter(g => g.min).map(g => ({ groupCode: g.code, optionCode: g.options.find(o => o.defaultQuantity)?.code ?? g.options[0].code, quantity: 1 })), notes: [] };
    const line = priceLine(catalog, input); line.notes = ['รายการตัวอย่าง'];
    const at = `${today}T${String(8 + index).padStart(2, '0')}:15:00+07:00`;
    orders.push({ id: crypto.randomUUID(), channel: index % 2 ? 'takeaway' : 'dine_in', tableNumber: index % 2 ? null : index % 8 + 1, queueNumber: index % 2 ? Math.ceil(index / 2) : null, visitId: null, customerSessionId: null, status: 'served', lines: [line], totalSatang: line.totalSatang, createdAt: at, paidAt: at, paymentMethod: 'cash', refundedAt: null, refundedSatang: 0 });
  }
  const visits: State['visits'] = { '3': { id: crypto.randomUUID() }, '4': { id: crypto.randomUUID() } };
  for (const [table, status] of [[3, 'preparing'], [4, 'new']] as const) {
    const item = catalog[table === 3 ? 0 : 1];
    const line = priceLine(catalog, { itemCode: item.code, variantCode: 'normal', quantity: 1, options: [{ groupCode: 'noodle', optionCode: 'sen-lek', quantity: 1 }, { groupCode: 'broth', optionCode: 'clear', quantity: 1 }], notes: [] }); line.notes = ['รายการตัวอย่าง'];
    orders.push({ id: crypto.randomUUID(), channel: 'dine_in', tableNumber: table, queueNumber: null, visitId: visits[table].id, customerSessionId: null, status, lines: [line], totalSatang: line.totalSatang, createdAt: new Date().toISOString(), paidAt: null, paymentMethod: null, refundedAt: null, refundedSatang: 0 });
  }
  return { catalogVersion, catalog, orders, visits, sessions: {}, requests: {}, counters: { [today]: 4 }, summaries: [
    { date: today, channel: 'grabfood', grossSatang: 150000, discountSatang: 10000, refundSatang: 0, orderCount: 10 },
    { date: today, channel: 'lineman', grossSatang: 120000, discountSatang: 5000, refundSatang: 0, orderCount: 8 },
  ] };
}
function restore(): State { try { const raw = local.getItem(STORAGE); if (raw) { const saved: State = JSON.parse(raw); if (saved.catalogVersion !== catalogVersion) { saved.catalog = upgradeSavedCatalog(saved.catalog); saved.catalogVersion = catalogVersion; } return saved; } } catch { /* Start with clearly marked sample data. */ } return sampleState(); }
let data = restore();
function save() { try { local.setItem(STORAGE, JSON.stringify(data)); } catch { persistent = false; } window.dispatchEvent(new Event('prod-html-data')); }
const copy = <T,>(value: T): T => structuredClone(value);
const profiles = Array.from({ length: 4 }, (_, i) => ({ id: 'html-' + (i + 1), name: i ? 'พนักงาน ' + i : 'เจ้าของร้าน (ตัวอย่าง)', role: i ? 'admin' as const : 'owner' as const, token: 'html-preview-' + (i + 1) }));
function checkStaff(staff: Staff, owner = false) { if (!profiles.some(p => p.id === staff.id) || (owner && staff.role !== 'owner')) throw new DomainError('เฉพาะเจ้าของร้านเท่านั้น'); }
function checkSession(session: CustomerSession) { const current = data.sessions[session.token]; if (!current || (current.visitId && data.visits[current.tableNumber!]?.id !== current.visitId)) throw new DomainError('รอบโต๊ะปิดแล้ว กรุณาเลือกโต๊ะอีกครั้ง'); return current; }
function create(payload: { lines: CartInput[]; expectedTotalSatang: number; channel: string; tableNumber: number | null; takeaway?: TakeawayDetails }, key: string, scope: string, customerId: string | null): Order {
  const signature = JSON.stringify({ payload, scope }); const previous = data.requests[key];
  if (previous) { if (previous.signature !== signature) throw new DomainError('รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว'); return copy(data.orders.find(o => o.id === previous.orderId)!); }
  if (!Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 30) throw new DomainError('กรุณาเพิ่มอาหารลงตะกร้า');
  if (!['dine_in', 'takeaway'].includes(payload.channel)) throw new DomainError('ช่องทางไม่ถูกต้อง');
  const lines = payload.lines.map(input => priceLine(data.catalog, input)); const total = lines.reduce((s, l) => s + l.totalSatang, 0);
  if (total !== payload.expectedTotalSatang) throw new DomainError('ราคาเปลี่ยน กรุณาตรวจตะกร้าอีกครั้ง');
  if (payload.channel !== 'takeaway' && payload.takeaway != null) throw new DomainError('ข้อมูลกลับบ้านใช้เฉพาะออเดอร์กลับบ้าน');
  const takeaway = payload.takeaway == null ? null : validateTakeaway(payload.takeaway);
  const table = payload.channel === 'dine_in' ? payload.tableNumber : null;
  if (table !== null && (!Number.isInteger(table) || table < 1 || table > 8)) throw new DomainError('เลขโต๊ะไม่ถูกต้อง');
  if (table && !data.visits[table]) data.visits[table] = { id: crypto.randomUUID() };
  const date = businessDate(); const queue = payload.channel === 'takeaway' ? (data.counters[date] ?? 0) + 1 : null;
  const order: PreviewOrder = { id: crypto.randomUUID(), takeaway, channel: payload.channel as 'dine_in' | 'takeaway', tableNumber: table, queueNumber: queue, visitId: table ? data.visits[table].id : null, customerSessionId: customerId, status: 'new', lines, totalSatang: total, createdAt: new Date().toISOString(), paidAt: null, paymentMethod: null, refundedAt: null, refundedSatang: 0 };
  if (queue) data.counters[date] = queue;
  data.orders.push(order); data.requests[key] = { signature, orderId: order.id }; save(); return copy(order);
}
function findOrder(id: string) { const order = data.orders.find(o => o.id === id); if (!order) throw new DomainError('ไม่พบออเดอร์'); return order; }
export function resetPreview() { data = sampleState(); local.removeItem(STAFF_STORAGE); save(); window.dispatchEvent(new Event('prod-html-reset')); }
window.addEventListener('storage', event => { if (event.key === STORAGE) { data = restore(); window.dispatchEvent(new Event('prod-html-data')); } });
export const api = {
  activeEntry,
  async menu() { return copy(data.catalog); },
  async bootstrap(value: string, oldToken?: string): Promise<CustomerSession> {
    if (!/^(?:[1-8]|takeaway)$/.test(value)) throw new DomainError('เลขโต๊ะไม่ถูกต้อง');
    if (oldToken && data.sessions[oldToken]?.entry === value) { try { return copy(checkSession(data.sessions[oldToken])); } catch { /* New visit. */ } }
    const table = value === 'takeaway' ? null : Number(value);
    if (table && !data.visits[table]) data.visits[table] = { id: crypto.randomUUID() };
    const session: StoredSession = { token: crypto.randomUUID(), sessionId: crypto.randomUUID(), entry: value, channel: table ? 'dine_in' : 'takeaway', tableNumber: table, visitId: table ? data.visits[table].id : null };
    data.sessions[session.token] = session; save(); return copy(session);
  },
  async customerOrders(session: CustomerSession) { const current = checkSession(session); return copy(data.orders.filter(o => o.customerSessionId === current.sessionId)); },
  async createOrder(session: CustomerSession, lines: CartInput[], total: number, key: string, takeaway?: TakeawayDetails) { const current = checkSession(session); return create({ lines, expectedTotalSatang: total, channel: current.channel, tableNumber: current.tableNumber, takeaway }, key, current.sessionId, current.sessionId); },
  async login(account: string, password: string) { if (password !== '1234') throw new DomainError('รหัสทดลองคือ 1234'); const profile = profiles.find((p, i) => account === 'demo-' + (i + 1)); if (!profile) throw new DomainError('บัญชีไม่ถูกต้อง'); local.setItem(STAFF_STORAGE, JSON.stringify(profile)); return copy(profile); },
  async restoreStaff(): Promise<Staff> { try { const raw = local.getItem(STAFF_STORAGE); if (raw) return JSON.parse(raw); } catch { /* Use preview owner. */ } return copy(profiles[0]); },
  async logout(_identity: Staff) { local.removeItem(STAFF_STORAGE); },
  async state(identity: Staff): Promise<StaffState> { checkStaff(identity); return copy({ orders: data.orders, visits: data.visits, summaries: data.summaries }); },
  watch(_identity: Staff, refresh: (order?: Order) => void) { const update = () => refresh(); window.addEventListener('prod-html-data', update); return () => window.removeEventListener('prod-html-data', update); },
  async posOrder(identity: Staff, lines: CartInput[], total: number, channel: string, tableNumber: number | null, key: string, takeaway?: TakeawayDetails) { checkStaff(identity); return create({ lines, expectedTotalSatang: total, channel, tableNumber, takeaway }, key, identity.id, null); },
  async status(identity: Staff, id: string, status: Status) { checkStaff(identity); const order = findOrder(id); if (order.status !== status) { if (!canTransition(order.status, status)) throw new DomainError('สถานะเปลี่ยนไปแล้ว'); if (status === 'cancelled' && order.paidAt && !order.refundedAt) throw new DomainError('กรุณาคืนเงินก่อนยกเลิก'); order.status = status; save(); } return copy(order); },
  async pay(identity: Staff, id: string, method: string) { checkStaff(identity); const order = findOrder(id); if (order.status === 'cancelled' || !['cash','promptpay'].includes(method)) throw new DomainError('รับชำระรายการนี้ไม่ได้'); if (!order.paidAt) { order.paidAt = new Date().toISOString(); order.paymentMethod = method; save(); } return copy(order); },
  async refund(identity: Staff, id: string) { checkStaff(identity, true); const order = findOrder(id); if (!order.paidAt) throw new DomainError('ยังไม่ได้ชำระ'); if (!order.refundedAt) { order.refundedAt = new Date().toISOString(); order.refundedSatang = order.totalSatang; save(); } return copy(order); },
  async close(identity: Staff, table: number) { checkStaff(identity); const visit = data.visits[table]; if (visit && data.orders.some(o => o.visitId === visit.id && (!['served','cancelled'].includes(o.status) || (o.status !== 'cancelled' && !o.paidAt)))) throw new DomainError('กรุณาส่งมอบและเคลียร์การชำระเงินก่อนปิดโต๊ะ'); delete data.visits[table]; save(); return { ok: true }; },
  async delivery(identity: Staff, summaries: DeliverySummary[]) { checkStaff(identity, true); summaries.forEach(validateSummary); for (const summary of summaries) { const index = data.summaries.findIndex(s => s.date === summary.date && s.channel === summary.channel); if (index < 0) data.summaries.push(copy(summary)); else data.summaries[index] = copy(summary); } save(); return { ok: true }; },
  async createMenu(identity: Staff, value: NewMenuInput) {
    checkStaff(identity, true); const input = validateNewMenu(value, data.catalog); const signature = JSON.stringify(input);
    const existing = data.catalog.find(m => m.code === input.code);
    if (existing) { if (data.menuRequests?.[input.code] !== signature) throw new DomainError('รหัสเมนูนี้ถูกใช้แล้ว', 409); return copy(existing); }
    const item = menuFromInput(input, data.catalog); data.catalog.push(item); data.menuRequests ??= {}; data.menuRequests[input.code] = signature; save(); return copy(item);
  },
  async editMenu(identity: Staff, code: string, prices: Record<string, number>, available: boolean) { checkStaff(identity, true); const item = data.catalog.find(m => m.code === code); if (!item) throw new DomainError('ไม่พบเมนู'); if (item.variants.some(v => !Number.isSafeInteger(prices[v.code]) || prices[v.code] < 1 || prices[v.code] > 100000)) throw new DomainError('ราคาไม่ถูกต้อง'); item.available = available; for (const variant of item.variants) variant.priceSatang = prices[variant.code]; save(); return copy(item); },
  async report(identity: Staff, period: string) { checkStaff(identity); return salesReport(data.orders, data.summaries, period); },
  async qr(identity: Staff) { checkStaff(identity, true); return [...Array.from({ length: 8 }, (_, i) => ({ label: 'โต๊ะ ' + (i + 1), url: location.href.split(/[?#]/)[0] + '?table=' + (i + 1) })), { label: 'กลับบ้าน', url: location.href.split(/[?#]/)[0] + '?table=takeaway' }]; },
  async accounts(identity: Staff) { checkStaff(identity, true); return profiles.map((p, i) => ({ ...p, active: true, slot: i + 1 })); },
};
