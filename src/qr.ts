import type { Staff } from './domain.ts';
export interface QrEntry { key: string; label: string; url: string; revision: number }
export interface StoredQr { key: string; label: string; token: string; revision: number }
const demoStorage = 'prod-demo-qr-revisions';
const points = [...Array.from({ length: 8 }, (_, i) => ({ key: 'table-' + (i + 1), label: 'โต๊ะ ' + (i + 1), table: String(i + 1) })),
  { key: 'takeaway-front', label: 'กลับบ้าน · หน้าร้าน', table: 'takeaway' },
  { key: 'takeaway-remote', label: 'กลับบ้าน · สั่งล่วงหน้า / LINE', table: 'takeaway' }];
export function qrLinks(entries: StoredQr[], base: string): QrEntry[] {
  return entries.map(({ token, ...entry }) => ({ ...entry, url: base + '?qr=' + token }));
}
// Browser-only examples; production tokens/revocations live in PostgreSQL.
export function demoQr(identity: Staff, base: string, rotate?: QrEntry): QrEntry[] {
  if (identity.role !== 'owner') throw new Error('เฉพาะเจ้าของร้านเท่านั้น');
  let saved: Record<string, { revision: number; nonce: string }> = {};
  try { saved = JSON.parse(localStorage.getItem(demoStorage) ?? '{}'); } catch { /* Recover illustrative links only. */ }
  if (rotate) {
    if (!points.some(point => point.key === rotate.key)) throw new Error('ไม่พบจุดสั่งอาหาร');
    if ((saved[rotate.key]?.revision ?? 1) !== rotate.revision) throw new Error('QR เปลี่ยนไปแล้ว กรุณาโหลดใหม่');
    saved[rotate.key] = { revision: rotate.revision + 1, nonce: crypto.randomUUID() };
    localStorage.setItem(demoStorage, JSON.stringify(saved));
  }
  return points.map(point => ({ key: point.key, label: point.label, revision: saved[point.key]?.revision ?? 1,
    url: base + '?table=' + point.table + (point.table === 'takeaway' ? '&source=' + point.key : '') + (saved[point.key] ? '&revision=' + saved[point.key].nonce : '') }));
}
