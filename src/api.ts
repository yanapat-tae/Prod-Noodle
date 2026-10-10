import { createClient } from '@supabase/supabase-js';
import type { CartInput, CustomerSession, DeliverySummary, MenuItem, Order, Staff, Status, TakeawayDetails } from './domain.ts';
import type { NewMenuInput } from './menu-management.ts';
import { businessDate, salesReport } from './domain.ts';
import { demoQr, qrLinks } from './staff/qr.ts';
import type { QrEntry, StoredQr } from './staff/qr.ts';
import { requestJson } from './http.ts';
import { orderUpdates } from './staff/order-updates.ts';
export const mode = import.meta.env.VITE_APP_MODE === 'supabase' ? 'supabase' : 'demo';
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
export const supabase = mode === 'supabase' && url && key ? createClient(url, key) : null;
const staffStorage = 'prod-demo-staff';
export interface StaffState { orders: Order[]; visits: Record<string, { id: string }>; summaries: DeliverySummary[] }
async function call<T>(path: string, body?: unknown, token?: string, idempotencyKey?: string): Promise<T> {
  if (mode === 'supabase' && !supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase กรุณาตรวจ .env.local');
  const group = path.startsWith('/staff') ? 'staff-api' : path.startsWith('/customer/session') || path === '/menu' ? 'public-api' : 'customer-api';
  const target = mode === 'demo' ? '/api' + path : url + '/functions/v1/' + group + path;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (mode === 'supabase') headers.apikey = key;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return requestJson<T>(target, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }, idempotencyKey);
}
async function staffToken(identity: Staff) {
  if (!supabase) return identity.token;
  const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error('กรุณาเข้าสู่ระบบใหม่'); return data.session.access_token;
}
function mapOrder(o: any): Order {
  const refunds = (o.payment_transactions ?? []).filter((p: any) => p.kind === 'refund' && p.status === 'succeeded');
  return { id: o.id, channel: o.channel, tableNumber: o.restaurant_tables?.table_number ?? null, queueNumber: o.queue_number, visitId: o.table_session_id, status: o.fulfillment_status, takeaway: o.takeaway_details ?? null,
    totalSatang: Number(o.total_satang), createdAt: o.created_at, paidAt: o.paid_at, paymentMethod: (o.payment_transactions ?? []).find((p: any) => p.kind === 'capture' && p.status === 'succeeded')?.method ?? null,
    refundedAt: refunds[refunds.length - 1]?.posted_at ?? null, refundedSatang: refunds.reduce((s: number, p: any) => s + Number(p.amount_satang), 0),
    lines: (o.order_items ?? []).map((l: any) => ({ id: l.id, itemCode: l.menu_items?.code ?? '', variantCode: l.menu_variants?.code ?? '', name: l.menu_name_snapshot, variantName: l.variant_name_snapshot, unit: l.unit_snapshot ?? l.menu_items?.unit ?? 'ชาม', quantity: l.quantity,
      unitSatang: Number(l.base_unit_satang) + Number(l.options_unit_satang), totalSatang: Number(l.line_net_satang), optionNames: (l.order_item_options ?? []).map((v: any) => v.option_name_snapshot), options: [], notes: l.notes ? l.notes.split(' · ') : [], freeNote: l.free_note ?? '' })) };
}
const orderSelect = '*,restaurant_tables(table_number),payment_transactions(*),order_items(*,menu_items(code,unit),menu_variants(code),order_item_options(*))';
async function profile(token: string, userId: string): Promise<Staff> {
  const { data, error } = await supabase!.from('admins').select('*').eq('auth_user_id', userId).single();
  if (error || !data?.is_active) { await supabase!.auth.signOut(); throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงาน'); }
  return { token, id: userId, name: data.display_name, role: data.role };
}
export const api = {
  menu: () => call<MenuItem[]>('/menu'),
  bootstrap: (entry: string, oldToken?: string) => call<CustomerSession>('/customer/session', { entry }, oldToken),
  customerOrders: (session: CustomerSession) => call<Order[]>('/orders', undefined, session.token),
  createOrder: (session: CustomerSession, lines: CartInput[], total: number, requestKey: string, takeaway?: TakeawayDetails) => call<Order>('/orders', { lines, expectedTotalSatang: total, takeaway }, session.token, requestKey),
  async login(account: string, password: string) {
    if (!supabase) { if (mode === 'supabase') throw new Error('ยังไม่ได้ตั้งค่า Supabase'); const staff = await call<Staff>('/staff/login', { account, pin: password }); localStorage.setItem(staffStorage, JSON.stringify(staff)); return staff; }
    const { data, error } = await supabase.auth.signInWithPassword({ email: account, password }); if (error) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return profile(data.session!.access_token, data.user!.id);
  },
  async restoreStaff() {
    if (supabase) { const { data } = await supabase.auth.getSession(); return data.session ? profile(data.session.access_token, data.session.user.id) : null; }
    const stored = localStorage.getItem(staffStorage); if (!stored) return null;
    try { const identity = JSON.parse(stored); return await call<Staff>('/staff/me', undefined, identity.token); } catch { localStorage.removeItem(staffStorage); return null; }
  },
  async logout(identity: Staff) { if (supabase) await supabase.auth.signOut(); else await call('/staff/logout', {}, identity.token); localStorage.removeItem(staffStorage); },
  async state(identity: Staff): Promise<StaffState> {
    if (!supabase) return call<StaffState>('/staff/state', undefined, identity.token);
    const visits = await supabase.from('table_sessions').select('id,restaurant_tables(table_number)').is('closed_at', null);
    if (visits.error) throw new Error('โหลดข้อมูลโต๊ะไม่สำเร็จ');
    const ids = (visits.data ?? []).map(v => v.id);
    const activeFilter = 'fulfillment_status.in.(new,preparing,ready),and(payment_status.in.(unpaid,partially_paid),fulfillment_status.neq.cancelled),business_date.eq.' + businessDate() + (ids.length ? ',table_session_id.in.(' + ids.join(',') + ')' : '');
    const [orders, summaries] = await Promise.all([
      supabase.from('orders').select(orderSelect).or(activeFilter).order('created_at', { ascending: false }),
      supabase.from('delivery_daily_sales').select('*').order('sales_date', { ascending: false }).limit(365),
    ]);
    if (orders.error || visits.error || summaries.error) throw new Error('โหลดข้อมูลร้านไม่สำเร็จ กรุณาลองใหม่');
    if ((orders.data?.length ?? 0) >= 1000) throw new Error('รายการหน้าร้านเกินขอบเขตรุ่นทดลอง กรุณาตรวจข้อมูลก่อนใช้งานต่อ');
    return { orders: (orders.data ?? []).map(mapOrder), visits: Object.fromEntries((visits.data ?? []).map((v: any) => [v.restaurant_tables.table_number, { id: v.id }])), summaries: (summaries.data ?? []).map((s: any) => ({ date: s.sales_date, channel: s.channel, grossSatang: Number(s.gross_satang), discountSatang: Number(s.discount_satang), refundSatang: Number(s.refund_satang), orderCount: s.paid_order_count })) };
  },
  watch(identity: Staff, refresh: (order?: Order) => void) {
    if (!supabase) { const timer = setInterval(() => { if (!document.hidden) refresh(); }, 1000); return () => clearInterval(timer); }
    let connected = false, active = true;
    const updates = orderUpdates(async id => {
      const { data, error } = await supabase!.from('orders').select(orderSelect).eq('id', id).single();
      if (error) throw error;
      return mapOrder(data);
    }, refresh);
    const channel = supabase.channel('staff-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      const deleted = payload.eventType === 'DELETE';
      void updates.receive(deleted ? payload.old.id : payload.new.id, deleted);
    }).on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => { if (active) refresh(); }).subscribe(status => { connected = status === 'SUBSCRIBED'; if (active && connected) refresh(); });
    const timer = setInterval(() => { if (!connected && !document.hidden) refresh(); }, 30000);
    return () => { active = false; updates.dispose(); clearInterval(timer); void supabase!.removeChannel(channel); };
  },
  async posOrder(identity: Staff, lines: CartInput[], total: number, channel: string, tableNumber: number | null, requestKey: string, takeaway?: TakeawayDetails) { return call<Order>('/staff/orders', { lines, expectedTotalSatang: total, channel, tableNumber, takeaway }, await staffToken(identity), requestKey); },
  async status(identity: Staff, id: string, status: Status) { return call<Order>(`/staff/orders/${id}/status`, { status }, await staffToken(identity)); },
  async pay(identity: Staff, id: string, method: string) { return call<Order>(`/staff/orders/${id}/pay`, { method }, await staffToken(identity)); },
  async refund(identity: Staff, id: string) { return call<Order>(`/staff/orders/${id}/refund`, {}, await staffToken(identity)); },
  async close(identity: Staff, table: number) { return call(`/staff/tables/${table}/close`, {}, await staffToken(identity)); },
  async delivery(identity: Staff, summaries: DeliverySummary[]) { return call('/staff/delivery', { summaries }, await staffToken(identity), crypto.randomUUID()); },
  async createMenu(identity: Staff, input: NewMenuInput) { return call<MenuItem>('/staff/menu/create', input, await staffToken(identity)); },
  async editMenu(identity: Staff, code: string, prices: Record<string, number>, available: boolean, name?: string) { return call('/staff/menu', { code, prices, available, ...(name === undefined ? {} : { name }) }, await staffToken(identity)); },
  async report(identity: Staff, period: string): Promise<ReturnType<typeof salesReport>> {
    if (!supabase) { const state = await this.state(identity); return salesReport(state.orders, state.summaries, period); }
    const from = period.length === 7 ? period + '-01' : period;
    const end = new Date(from + 'T00:00:00Z'); if (period.length === 7) end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + 1);
    const { data, error } = await supabase.rpc('staff_sales_report', { p_from: from, p_to: end.toISOString().slice(0, 10) }); if (error) throw new Error('โหลดรายงานไม่สำเร็จ'); return data;
  },
  async qr(identity: Staff): Promise<QrEntry[]> {
    if (mode === 'demo') return demoQr(identity, location.origin + '/');
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
    const { data, error } = await supabase.rpc('owner_qr_entries');
    if (error) throw new Error(error.code?.startsWith('PT') ? error.message : 'โหลด QR ไม่สำเร็จ กรุณาลองใหม่');
    return qrLinks(data as StoredQr[], location.origin + '/');
  },
  async rotateQr(identity: Staff, entry: QrEntry, requestKey: string): Promise<QrEntry> {
    if (mode === 'demo') return demoQr(identity, location.origin + '/', entry).find(value => value.key === entry.key)!;
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
    const { data, error } = await supabase.rpc('owner_rotate_qr', { p_entry_key: entry.key, p_expected_revision: entry.revision, p_request_key: requestKey });
    if (error) throw new Error(error.code?.startsWith('PT') ? error.message : 'ยังยืนยันการเปลี่ยน QR ไม่ได้ กรุณาโหลด QR เดิมเพื่อตรวจสอบ หรือลองปุ่มเดิมอีกครั้ง');
    return qrLinks([data as StoredQr], location.origin + '/')[0];
  },
  async accounts(_identity: Staff): Promise<{ id: string; name: string; role: string; active: boolean; slot: number }[]> {
    if (!supabase) return Array.from({ length: 4 }, (_, i) => ({ id: 'demo-' + (i + 1), name: i ? 'พนักงาน ' + i : 'เจ้าของร้าน', role: i ? 'admin' : 'owner', active: true, slot: i + 1 }));
    const { data, error } = await supabase.from('admins').select('*').order('account_slot'); if (error) throw new Error('โหลดบัญชีไม่สำเร็จ'); return (data ?? []).map(a => ({ id: a.auth_user_id, name: a.display_name, role: a.role, active: a.is_active, slot: a.account_slot }));
  },
};
