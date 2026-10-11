import { DomainError, selectionLimits } from './domain.ts';
import type { CustomerCopy, Group, MenuItem, Variant } from './domain.ts';

export interface MenuCategory { code: string; name: string }
export interface MenuAdminCatalog { items: MenuItem[]; categories: MenuCategory[] }
export interface MenuDefinition {
  code: string; name: string; category: string; description: string; unit: string;
  available: boolean; copy: CustomerCopy; variants: Variant[]; groups: Group[]; prepNotes: string[];
}
export type MenuMutation =
  | { kind: 'save'; menu: MenuDefinition; expectedRevision: number }
  | { kind: 'archive' | 'restore'; code: string; expectedRevision: number }
  | { kind: 'reorder'; category: string; entries: { code: string; revision: number }[] };

export const defaultCopy: CustomerCopy = {
  variantLabel: 'ขนาดอาหาร', instructions: 'เลือกแบบที่ชอบ ก่อนเพิ่มลงตะกร้า',
  notesLabel: 'หมายเหตุถึงครัว', notesPlaceholder: 'เช่น ไม่เอาหมึกกรอบ แยกน้ำซุป',
};
export function menuDefinition(item: MenuItem): MenuDefinition {
  return structuredClone({ code: item.code, name: item.name, category: item.category,
    description: item.description, unit: item.unit, available: item.available,
    copy: { ...defaultCopy, ...item.copy }, variants: item.variants, prepNotes: item.prepNotes,
    groups: item.groups.map(group => ({ ...group, enabled: group.enabled !== false,
      limitsByVariant: group.limitsByVariant ?? {}, options: group.options.map(option => ({
        ...option, enabled: option.enabled !== false, defaultQuantity: option.defaultQuantity ?? 0,
      })) })),
  });
}
function fail(message = 'ข้อมูลเมนูไม่ถูกต้อง'): never { throw new DomainError(message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) fail('มีข้อมูลเมนูที่ไม่รองรับ');
  return result;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.includes('\0')) fail();
  const result = value.trim();
  if ((!empty && !result) || Array.from(result).length > max) fail('กรุณาตรวจข้อความเมนูและความยาว');
  return result;
}
function code(value: unknown): string {
  const result = text(value, 80);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(result)) fail('รหัสเมนูหรือตัวเลือกไม่ถูกต้อง');
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail('จำนวนหรือราคาไม่ถูกต้อง');
  return value;
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') fail(); return value; }
function array(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('จำนวนรายการเมนูไม่ถูกต้อง');
  return value;
}
function unique(values: string[]) { if (new Set(values).size !== values.length) fail('รหัสหรือรายการซ้ำกัน'); }
function limits(value: unknown) {
  const data = object(value, ['min', 'max']);
  const min = integer(data.min, 0, 20), max = integer(data.max, 0, 20);
  if (min > max) fail('จำนวนขั้นต่ำต้องไม่เกินจำนวนสูงสุด');
  return { min, max };
}
export function validateMenuDefinition(value: unknown, categories: MenuCategory[]): MenuDefinition {
  const data = object(value, ['code', 'name', 'category', 'description', 'unit', 'available', 'copy', 'variants', 'groups', 'prepNotes']);
  const category = code(data.category);
  if (!categories.some(item => item.code === category)) fail('ไม่พบหมวดหมู่เมนู');
  const copy = object(data.copy, Object.keys(defaultCopy));
  const variants = array(data.variants, 1, 8).map(value => {
    const variant = object(value, ['code', 'name', 'priceSatang']);
    return { code: code(variant.code), name: text(variant.name, 80), priceSatang: integer(variant.priceSatang, 1, 100000) };
  });
  unique(variants.map(v => v.code));
  const groups = array(data.groups, 0, 8).map(value => {
    const group = object(value, ['code', 'name', 'min', 'max', 'options', 'enabled', 'limitsByVariant']);
    const base = limits({ min: group.min, max: group.max });
    const overrides = object(group.limitsByVariant ?? {}, variants.map(v => v.code));
    const options = array(group.options, 1, 20).map(value => {
      const option = object(value, ['code', 'name', 'priceSatang', 'defaultQuantity', 'enabled']);
      return { code: code(option.code), name: text(option.name, 120), priceSatang: integer(option.priceSatang, 0, 100000),
        defaultQuantity: integer(option.defaultQuantity ?? 0, 0, 1), enabled: boolean(option.enabled ?? true) };
    });
    unique(options.map(o => o.code));
    if (options.some(o => !o.enabled && o.defaultQuantity)) fail('ตัวเลือกเริ่มต้นต้องเปิดใช้งาน');
    const result: Group = { code: code(group.code), name: text(group.name, 120), ...base, enabled: boolean(group.enabled ?? true),
      limitsByVariant: Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, limits(value)])), options };
    if (result.enabled) for (const variant of variants) {
      const bound = selectionLimits(result, variant.code);
      if (bound.min > options.filter(o => o.enabled).length) fail('ตัวเลือกที่เปิดใช้ไม่พอตามจำนวนขั้นต่ำ');
      if (options.reduce((sum, o) => sum + o.defaultQuantity, 0) > bound.max) fail('ตัวเลือกเริ่มต้นเกินจำนวนสูงสุด');
    }
    return result;
  });
  unique(groups.map(g => g.code));
  for (const variant of variants) {
    const count = groups.filter(g => g.enabled).reduce((sum, g) => sum + Math.max(selectionLimits(g, variant.code).min, g.options.reduce((n, o) => n + (o.defaultQuantity ?? 0), 0)), 0);
    if (count > 20) fail('ตัวเลือกขั้นต่ำและค่าเริ่มต้นรวมกันต้องไม่เกิน 20 อย่าง');
  }
  const prepNotes = array(data.prepNotes, 0, 5).map(value => text(value, 80));
  unique(prepNotes);
  return { code: code(data.code), name: text(data.name, 120), category, description: text(data.description, 500, true),
    unit: text(data.unit, 20), available: boolean(data.available), variants, groups, prepNotes,
    copy: { variantLabel: text(copy.variantLabel, 120), instructions: text(copy.instructions, 500, true),
      notesLabel: text(copy.notesLabel, 120), notesPlaceholder: text(copy.notesPlaceholder, 500, true) } };
}
export function publicCatalog(items: MenuItem[]): MenuItem[] {
  const categoryOrder = new Map<string, number>();
  for (const item of items) if (!categoryOrder.has(item.category)) categoryOrder.set(item.category, item.categorySortOrder ?? categoryOrder.size);
  return items.map((item, index) => ({ item, index })).filter(({ item }) => !item.archived)
    .sort((a, b) => categoryOrder.get(a.item.category)! - categoryOrder.get(b.item.category)! || (a.item.sortOrder ?? a.index) - (b.item.sortOrder ?? b.index))
    .map(({ item }) => structuredClone({ ...item, groups: item.groups.filter(g => g.enabled !== false).map(g => ({ ...g, options: g.options.filter(o => o.enabled !== false) })) }));
}
export function applyMenuMutation(items: MenuItem[], categories: MenuCategory[], value: unknown): MenuItem[] {
  const kind = object(value, ['kind', 'menu', 'expectedRevision', 'code', 'category', 'entries']).kind;
  const data = object(value, kind === 'save' ? ['kind', 'menu', 'expectedRevision'] : kind === 'reorder' ? ['kind', 'category', 'entries'] : ['kind', 'code', 'expectedRevision']);
  const result = structuredClone(items);
  const conflict = (): never => { throw new DomainError('เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก', 409); };
  if (kind === 'reorder') {
    const category = code(data.category);
    if (!categories.some(c => c.code === category)) fail('ไม่พบหมวดหมู่เมนู');
    const entries = array(data.entries, 0, 1000).map(value => {
      const entry = object(value, ['code', 'revision']);
      return { code: code(entry.code), revision: integer(entry.revision, 1, Number.MAX_SAFE_INTEGER) };
    });
    unique(entries.map(e => e.code));
    const current = result.filter(item => item.category === category && !item.archived);
    if (current.length !== entries.length || current.some(item => !entries.some(e => e.code === item.code && e.revision === (item.revision ?? 1)))) conflict();
    entries.forEach((entry, index) => { const item = current.find(item => item.code === entry.code)!; item.sortOrder = index; item.revision = (item.revision ?? 1) + 1; });
  } else if (kind === 'save') {
    const menu = validateMenuDefinition(data.menu, categories);
    const expected = integer(data.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const index = result.findIndex(item => item.code === menu.code);
    const existing = result[index];
    if (expected !== (existing ? existing.revision ?? 1 : 0)) conflict();
    const updated: MenuItem = { ...existing, ...menu, categoryName: categories.find(c => c.code === menu.category)!.name,
      revision: expected + 1, archived: existing?.archived ?? false,
      sortOrder: existing?.category === menu.category ? existing.sortOrder : Math.max(-1, ...result.filter(i => i.category === menu.category).map((i, n) => i.sortOrder ?? n)) + 1 };
    if (index < 0) result.push(updated); else result[index] = updated;
  } else if (kind === 'archive' || kind === 'restore') {
    const itemCode = code(data.code), expected = integer(data.expectedRevision, 1, Number.MAX_SAFE_INTEGER);
    const item = result.find(item => item.code === itemCode);
    if (!item || (item.revision ?? 1) !== expected) conflict();
    item!.archived = kind === 'archive'; item!.revision = expected + 1;
  } else fail('คำสั่งจัดการเมนูไม่ถูกต้อง');
  return result;
}
