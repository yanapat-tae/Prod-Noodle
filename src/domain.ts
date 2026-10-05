export type Channel = 'dine_in' | 'takeaway' | 'grabfood' | 'lineman';
export type Status = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
export interface Variant { code: string; name: string; priceSatang: number }
export interface Option { code: string; name: string; priceSatang: number; defaultQuantity?: number }
export interface Group { code: string; name: string; min: number; max: number; options: Option[] }
export interface MenuItem {
  code: string; name: string; category: string; categoryName: string; description: string;
  unit: string; available: boolean; variants: Variant[]; groups: Group[]; prepNotes: string[];
}
export interface SelectedOption { groupCode: string; optionCode: string; quantity: number }
export interface CartInput { itemCode: string; variantCode: string; quantity: number; options: SelectedOption[]; notes: string[] }
export interface Line extends CartInput { id: string; name: string; variantName: string; unit: string; optionNames: string[]; unitSatang: number; totalSatang: number }
export interface Order {
  id: string; channel: Channel; tableNumber: number | null; queueNumber: number | null;
  visitId: string | null; status: Status; lines: Line[]; totalSatang: number;
  createdAt: string; paidAt: string | null; paymentMethod: string | null;
  refundedAt: string | null; refundedSatang: number;
}
export interface CustomerSession { token: string; tableNumber: number | null; channel: 'dine_in' | 'takeaway'; visitId: string | null }
export interface Staff { token: string; id: string; name: string; role: 'owner' | 'admin' }
export interface DeliverySummary { date: string; channel: 'grabfood' | 'lineman'; grossSatang: number; discountSatang: number; refundSatang: number; orderCount: number | null }
export const channelNames: Record<Channel, string> = { dine_in: 'ทานที่ร้าน', takeaway: 'กลับบ้าน', grabfood: 'GrabFood', lineman: 'LINE MAN' };
export const statusNames: Record<Status, string> = { new: 'ออเดอร์ใหม่', preparing: 'กำลังทำ', ready: 'พร้อมเสิร์ฟ / รับ', served: 'ส่งมอบแล้ว', cancelled: 'ยกเลิก' };
export function money(satang: number) { return (satang / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท'; }
export function businessDate(value: string | Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function thaiTime(value: string) { return new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }); }
export function orderLabel(order: Order) { return order.channel === 'dine_in' ? `โต๊ะ ${order.tableNumber}` : order.channel === 'takeaway' ? `T-${String(order.queueNumber).padStart(2, '0')}` : channelNames[order.channel]; }
export class DomainError extends Error { code: number; constructor(message: string, code = 400) { super(message); this.code = code; } }
export function priceLine(catalog: MenuItem[], input: CartInput): Line {
  if (!input || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 20) throw new DomainError('กรุณาเลือกจำนวนระหว่าง 1–20');
  const item = catalog.find(m => m.code === input.itemCode);
  if (!item?.available) throw new DomainError('เมนูนี้ยังไม่พร้อมขาย กรุณาเลือกเมนูอื่น');
  const variant = item.variants.find(v => v.code === input.variantCode);
  if (!variant) throw new DomainError('กรุณาเลือกขนาดอาหาร');
  if (!Array.isArray(input.options) || !Array.isArray(input.notes) || input.options.length > 20 || input.notes.length > 5) throw new DomainError('ตัวเลือกอาหารไม่ถูกต้อง');
  const seen = new Set<string>(); let extra = 0; const names: string[] = [];
  for (const selected of input.options) {
    const key = selected.groupCode + ':' + selected.optionCode;
    if (seen.has(key) || selected.quantity !== 1) throw new DomainError('ตัวเลือกซ้ำหรือจำนวนตัวเลือกไม่ถูกต้อง');
    seen.add(key);
    const group = item.groups.find(g => g.code === selected.groupCode);
    const option = group?.options.find(o => o.code === selected.optionCode);
    if (!option) throw new DomainError('เมนูนี้ไม่รองรับตัวเลือกที่เลือก');
    extra += option.priceSatang; names.push(option.name);
  }
  for (const group of item.groups) {
    const count = input.options.filter(o => o.groupCode === group.code).length;
    if (count < group.min || count > group.max) throw new DomainError(`กรุณาเลือก${group.name}${group.max === 1 ? ' 1 อย่าง' : 'ตามจำนวนที่กำหนด'}`);
  }
  if (new Set(input.notes).size !== input.notes.length || input.notes.some(n => !item.prepNotes.includes(n))) throw new DomainError('หมายเหตุนี้ยังไม่รองรับ กรุณาแจ้งพนักงาน');
  const unitSatang = variant.priceSatang + extra;
  return { ...input, id: crypto.randomUUID(), name: item.name, variantName: variant.name, unit: item.unit, optionNames: names, unitSatang, totalSatang: unitSatang * input.quantity };
}
export function canTransition(from: Status, to: Status) {
  return ({ new: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['served', 'cancelled'], served: [], cancelled: [] } as Record<Status, string[]>)[from].includes(to);
}
export function parseBaht(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new DomainError('กรุณาใส่จำนวนเงินบาท เช่น 150 หรือ 150.50');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 100_000_000) throw new DomainError('จำนวนเงินเกินขอบเขต');
  return amount;
}
export function validateSummary(summary: DeliverySummary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summary.date) || Number.isNaN(Date.parse(summary.date)) || new Date(summary.date).toISOString().slice(0, 10) !== summary.date) throw new DomainError('วันที่ไม่ถูกต้อง');
  if (!['grabfood', 'lineman'].includes(summary.channel)) throw new DomainError('ช่องทางไม่ถูกต้อง');
  for (const amount of [summary.grossSatang, summary.discountSatang, summary.refundSatang]) if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000) throw new DomainError('ยอดเงินไม่ถูกต้อง');
  if (summary.discountSatang > summary.grossSatang) throw new DomainError('ส่วนลดมากกว่ายอดขาย');
  if (summary.orderCount !== null && (!Number.isInteger(summary.orderCount) || summary.orderCount < 0 || summary.orderCount > 10000)) throw new DomainError('จำนวนออเดอร์ไม่ถูกต้อง');
}
export function salesReport(orders: Order[], summaries: DeliverySummary[], date: string) {
  const matches = (value: string) => date.length === 7 ? value.startsWith(date) : value === date;
  const selected = summaries.filter(s => matches(s.date));
  const paid = orders.filter(o => o.paidAt && matches(businessDate(o.paidAt)) && !selected.some(s => s.channel === o.channel && s.date === businessDate(o.paidAt!)));
  const refunds = orders.filter(o => o.refundedAt && matches(businessDate(o.refundedAt)) && !selected.some(s => s.channel === o.channel && s.date === businessDate(o.refundedAt!)));
  const gross = paid.reduce((s, o) => s + o.totalSatang, 0) + selected.reduce((s, v) => s + v.grossSatang - v.discountSatang, 0);
  const refund = refunds.reduce((s, o) => s + o.refundedSatang, 0) + selected.reduce((s, v) => s + v.refundSatang, 0);
  const count = selected.some(s => s.orderCount === null) ? null : paid.length + selected.reduce((s, v) => s + (v.orderCount ?? 0), 0);
  const channels = (Object.keys(channelNames) as Channel[]).map(channel => ({ channel, name: channelNames[channel], value: paid.filter(o => o.channel === channel).reduce((s, o) => s + o.totalSatang, 0) + selected.filter(s => s.channel === channel).reduce((s, v) => s + v.grossSatang - v.discountSatang, 0) }));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: String(hour).padStart(2, '0') + ':00', value: 0 }));
  const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23' });
  for (const order of paid) hourly[Number(hourFormat.format(new Date(order.paidAt!)))].value += order.totalSatang / 100;
  const quantities = new Map<string, { name: string; quantity: number }>();
  for (const order of paid) for (const line of order.lines) { const current = quantities.get(line.itemCode) ?? { name: line.name, quantity: 0 }; current.quantity += line.quantity; quantities.set(line.itemCode, current); }
  const top = [...quantities.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  return { gross, refund, net: gross - refund, count, average: count ? gross / count : null, channels, hourly, top, detailGross: paid.reduce((s, o) => s + o.totalSatang, 0), hasDailySummary: selected.length > 0 };
}
export function csvCell(value: unknown) {
  let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
