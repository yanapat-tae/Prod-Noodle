import { DomainError } from './domain.ts';
import type { Order } from './domain.ts';
export interface BillPaymentInput { method: string; confirmed: boolean; expectedOrderIds: string[]; expectedTotalSatang: number }
export interface BillReceipt { id: string; billId: string; totalSatang: number; method: string; paidAt: string; orders: Order[] }
export interface StoredBillReceipt { actor: string; anchor: string; input: BillPaymentInput; receipt: BillReceipt }
export function billRounds(orders: Order[], anchor: Order): Order[] {
  return orders.filter(o => (anchor.visitId ? o.visitId === anchor.visitId : o.id === anchor.id) && !o.salesDeletedAt && o.status !== 'cancelled').sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function prepareBillPayment(orders: Order[], stored: Record<string, StoredBillReceipt>, actor: string, anchorId: string, key: string, input: BillPaymentInput): StoredBillReceipt {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) throw new DomainError('คำขอไม่มีรหัสอ้างอิง');
  if (!input || !['cash','promptpay','thai_chuay_thai'].includes(input.method) || input.confirmed !== true || !Number.isSafeInteger(input.expectedTotalSatang) || input.expectedTotalSatang <= 0 || !Array.isArray(input.expectedOrderIds) || !input.expectedOrderIds.length || new Set(input.expectedOrderIds).size !== input.expectedOrderIds.length) throw new DomainError('กรุณายืนยันรับเงินหรือตรวจรายการโอนก่อนบันทึก');
  if (orders.some(o => (o.id === anchorId || input.expectedOrderIds.includes(o.id)) && o.salesDeletedAt)) throw new DomainError('รายการนี้ถูกลบจากยอดขายแล้ว',409);
  const previous = stored[key];
  if (previous) {
    if (previous.actor !== actor || previous.anchor !== anchorId || JSON.stringify(previous.input) !== JSON.stringify(input)) throw new DomainError('รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว',409);
    return structuredClone(previous);
  }
  const anchor = orders.find(o => o.id === anchorId);
  if (!anchor) throw new DomainError('ไม่พบออเดอร์',404);
  const billId = anchor.visitId ?? anchor.id;
  const existing = Object.values(stored).find(s => s.receipt.billId === billId);
  const sameIds = (a: string[],b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (existing) {
    if (existing.input.method !== input.method || existing.input.expectedTotalSatang !== input.expectedTotalSatang || !sameIds(existing.input.expectedOrderIds,input.expectedOrderIds)) throw new DomainError('บิลชำระแล้ว กรุณาโหลดรายละเอียดล่าสุด',409);
    return structuredClone(existing);
  }
  const due = billRounds(orders,anchor).filter(o => !o.paidAt);
  const total = due.reduce((s,o) => s+o.totalSatang,0);
  if (total !== input.expectedTotalSatang || !sameIds(due.map(o=>o.id),input.expectedOrderIds)) throw new DomainError('รายการหรือยอดบิลเปลี่ยน กรุณาโหลดบิลล่าสุดก่อนรับเงิน',409);
  const paidAt = new Date().toISOString();
  return { actor, anchor: anchorId, input: structuredClone(input), receipt: { id:key, billId,totalSatang:total,method:input.method,paidAt,orders:due.map(o => ({...structuredClone(o),paidAt,paymentMethod:input.method,billPaymentId:key})) } };
}
