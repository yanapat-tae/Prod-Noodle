import { channelNames, DomainError, orderLabel, statusNames } from './domain.ts';
import type { DeliverySummary, Order } from './domain.ts';
export interface SalesRecord { kind: 'order' | 'summary'; id: string; version: string; label: string; date: string; totalSatang: number; paid: boolean; detail: string }
export interface SalesHistory { records: SalesRecord[] }
export interface SalesDeletion { records: Pick<SalesRecord, 'kind' | 'id' | 'version'>[]; reason: string }
export interface SalesDeletionResult { ok: true; count: number }
export function salesHistory(orders: Order[], summaries: DeliverySummary[]): SalesHistory {
 const records: SalesRecord[] = [
  ...orders.filter(o => !o.salesDeletedAt).map(o => ({ kind: 'order' as const, id: o.id, version: JSON.stringify([o.status,o.paidAt,o.paymentMethod,o.refundedAt,o.refundedSatang,o.totalSatang]), label: orderLabel(o), date: o.createdAt, totalSatang: o.totalSatang, paid: Boolean(o.paidAt), detail: statusNames[o.status] + ' · ' + o.lines.map(l => `${l.name} × ${l.quantity}`).join(', ') })),
  ...summaries.filter(s => !s.salesDeletedAt).map(s => ({ kind: 'summary' as const, id: s.channel + ':' + s.date, version: JSON.stringify([s.grossSatang,s.discountSatang,s.refundSatang,s.orderCount,s.salesRevision ?? null]), label: channelNames[s.channel] + ' · สรุปรายวัน', date: s.date + 'T00:00:00+07:00', totalSatang: s.grossSatang - s.discountSatang, paid: true, detail: 'ยอดรวมรายวัน' })),
 ];
 if (records.length > 1000) throw new DomainError('ประวัติเกิน 1,000 รายการ กรุณาติดต่อผู้ดูแลเพื่อแบ่งช่วงข้อมูล', 409);
 return { records: records.sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)) };
}
export function validateSalesDeletion(value: SalesDeletion, history: SalesHistory) {
 if (!value || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.trim().length > 500 || !Array.isArray(value.records) || value.records.length < 1 || value.records.length > 1000) throw new DomainError('กรุณาเลือกรายการและระบุเหตุผลการลบ');
 const seen = new Set<string>();
 for (const r of value.records) {
  if (!r || !['order','summary'].includes(r.kind) || typeof r.id !== 'string' || typeof r.version !== 'string') throw new DomainError('รายการลบไม่ถูกต้อง');
  const key = r.kind + ':' + r.id;
  if (seen.has(key)) throw new DomainError('รายการลบซ้ำ'); seen.add(key);
  if (!history.records.some(current => current.kind === r.kind && current.id === r.id && current.version === r.version)) throw new DomainError('รายการเปลี่ยนไปแล้ว กรุณาโหลดประวัติใหม่ก่อนลบ', 409);
 }
}
interface DeletionReceipt { actor: string; payload: SalesDeletion; result: SalesDeletionResult; at: string }
interface SalesState { orders: Order[]; summaries: DeliverySummary[]; visits: Record<string, { id: string }>; salesDeletions?: Record<string, DeletionReceipt> }
export function applySalesDeletion<T extends SalesState>(state: T, actor: string, key: string, payload: SalesDeletion): { state: T; result: SalesDeletionResult } {
 if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) throw new DomainError('คำขอไม่มีรหัสอ้างอิง');
 const previous = state.salesDeletions?.[key];
 if (previous) {
  if (previous.actor !== actor || JSON.stringify(previous.payload) !== JSON.stringify(payload)) throw new DomainError('รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว', 409);
  return { state, result: previous.result };
 }
 validateSalesDeletion(payload, salesHistory(state.orders, state.summaries));
 const next = structuredClone(state), at = new Date().toISOString();
 for (const record of payload.records) {
  if (record.kind === 'order') next.orders.find(o => o.id === record.id)!.salesDeletedAt = at;
  else next.summaries.find(s => s.channel + ':' + s.date === record.id)!.salesDeletedAt = at;
 }
 for (const [table, visit] of Object.entries(next.visits)) {
  if (next.orders.some(o => o.visitId === visit.id && o.salesDeletedAt) && !next.orders.some(o => o.visitId === visit.id && !o.salesDeletedAt)) delete next.visits[table];
 }
 const result = { ok: true as const, count: payload.records.length };
 next.salesDeletions ??= {}; next.salesDeletions[key] = { actor, payload: structuredClone(payload), result, at };
 return { state: next, result };
}
