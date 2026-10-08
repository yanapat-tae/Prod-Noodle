import type { Group, MenuItem, Variant } from './domain.ts';
import { DomainError } from './domain.ts';

export interface NewMenuInput {
  code: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  variants: Variant[];
  optionGroupCodes: string[];
  prepNotes: string[];
}

function record(input: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) {
    throw new DomainError(`${label}ไม่ถูกต้อง`);
  }
  return input as Record<string, unknown>;
}

function text(input: unknown, label: string, maximum: number, minimum = 1): string {
  if (typeof input !== 'string') throw new DomainError(`${label}ไม่ถูกต้อง`);
  const value = input.trim();
  const length = [...value].length;
  if (length < minimum || length > maximum) throw new DomainError(`${label}ต้องมี ${minimum}–${maximum} ตัวอักษร`);
  return value;
}

function code(input: unknown, label: string): string {
  if (typeof input !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input)) throw new DomainError(`${label}ไม่ถูกต้อง`);
  return input;
}

export function validateNewMenu(input: unknown, catalog: MenuItem[]): NewMenuInput {
  const value = record(input, ['code', 'name', 'category', 'description', 'unit', 'variants', 'optionGroupCodes', 'prepNotes'], 'ข้อมูลเมนู');
  const menuCode = code(value.code, 'รหัสเมนู');
  const name = text(value.name, 'ชื่อเมนู', 120);
  if (typeof value.category !== 'string' || !catalog.some(item => item.category === value.category)) throw new DomainError('กรุณาเลือกหมวดหมู่ที่มีอยู่');
  const description = text(value.description, 'คำอธิบายเมนู', 500, 0);
  const unit = text(value.unit, 'หน่วยขาย', 20);
  if (!Array.isArray(value.variants) || value.variants.length < 1 || value.variants.length > 8) throw new DomainError('กรุณากำหนดขนาดอาหาร 1–8 ขนาด');
  const variantCodes = new Set<string>();
  const variants = Array.from(value.variants, inputVariant => {
    const variant = record(inputVariant, ['code', 'name', 'priceSatang'], 'ขนาดอาหาร');
    const variantCode = code(variant.code, 'รหัสขนาดอาหาร');
    if (variantCodes.has(variantCode)) throw new DomainError('รหัสขนาดอาหารซ้ำ');
    variantCodes.add(variantCode);
    const variantName = text(variant.name, 'ชื่อขนาดอาหาร', 60);
    if (typeof variant.priceSatang !== 'number' || !Number.isInteger(variant.priceSatang) || variant.priceSatang <= 0 || variant.priceSatang > 100000) {
      throw new DomainError('ราคาอาหารต้องมากกว่า 0 และไม่เกิน 1,000 บาท');
    }
    return { code: variantCode, name: variantName, priceSatang: variant.priceSatang };
  });
  const availableGroups = new Set(catalog.flatMap(item => item.groups.map(group => group.code)));
  if (!Array.isArray(value.optionGroupCodes) || value.optionGroupCodes.length > 8) throw new DomainError('เลือกกลุ่มตัวเลือกได้ไม่เกิน 8 กลุ่ม');
  const optionGroupCodes = Array.from(value.optionGroupCodes, group => {
    if (typeof group !== 'string' || !availableGroups.has(group)) throw new DomainError('กรุณาเลือกกลุ่มตัวเลือกที่มีอยู่');
    return group;
  });
  if (new Set(optionGroupCodes).size !== optionGroupCodes.length) throw new DomainError('กลุ่มตัวเลือกซ้ำ');
  if (!Array.isArray(value.prepNotes) || value.prepNotes.length > 5) throw new DomainError('กำหนดหมายเหตุได้ไม่เกิน 5 ข้อ');
  const prepNotes = Array.from(value.prepNotes, note => text(note, 'หมายเหตุ', 80));
  if (new Set(prepNotes).size !== prepNotes.length) throw new DomainError('หมายเหตุซ้ำ');
  return { code: menuCode, name, category: value.category, description, unit, variants, optionGroupCodes, prepNotes };
}

export function menuGroupTemplates(catalog: MenuItem[]): Map<string, Group> {
  const templates = new Map<string, Group>();
  for (const item of [...catalog].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)) {
    for (const group of item.groups) if (!templates.has(group.code)) templates.set(group.code, group);
  }
  return templates;
}

export function menuFromInput(input: NewMenuInput, catalog: MenuItem[]): MenuItem {
  const { optionGroupCodes, ...menu } = validateNewMenu(input, catalog);
  const categoryName = catalog.find(item => item.category === menu.category)!.categoryName;
  const templates = menuGroupTemplates(catalog);
  return { ...menu, categoryName, available: true, groups: optionGroupCodes.map(code => structuredClone(templates.get(code)!)) };
}
