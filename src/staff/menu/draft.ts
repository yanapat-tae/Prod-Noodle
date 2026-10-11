import type { Group, MenuItem, Option, Variant } from '../../domain.ts';
import { parseBaht } from '../../domain.ts';
import { defaultCopy, menuDefinition, validateMenuDefinition } from '../../menu-admin.ts';
import type { MenuCategory, MenuDefinition } from '../../menu-admin.ts';
import { validateMenuName } from '../../menu-management.ts';
export interface DraftVariant extends Omit<Variant, 'priceSatang'> {
  price: string;
}
export interface DraftOption extends Omit<Option, 'priceSatang'> {
  price: string;
}
export interface DraftGroup extends Omit<Group, 'options'> {
  options: DraftOption[];
}
export interface MenuDraft extends Omit<MenuDefinition, 'variants' | 'groups' | 'prepNotes'> {
  variants: DraftVariant[];
  groups: DraftGroup[];
  prepNotes: string;
  revision: number;
}
export function newDraft(category: string): MenuDraft {
  return {
    code: 'menu-' + crypto.randomUUID(),
    name: '',
    category,
    description: '',
    unit: 'ชาม',
    available: true,
    variants: [{ code: 'normal', name: 'ปกติ', price: '' }],
    groups: [],
    prepNotes: '',
    copy: { ...defaultCopy },
    revision: 0,
  };
}
export function draftGroup(group?: Group): DraftGroup {
  return group
    ? {
        ...structuredClone(group),
        options: group.options.map((o) => ({
          code: o.code,
          name: o.name,
          enabled: o.enabled !== false,
          defaultQuantity: o.defaultQuantity ?? 0,
          price: String(o.priceSatang / 100),
        })),
      }
    : {
        code: 'group-' + crypto.randomUUID(),
        name: '',
        min: 0,
        max: 1,
        enabled: true,
        limitsByVariant: {},
        options: [newOption()],
      };
}
export function newOption(): DraftOption {
  return {
    code: 'option-' + crypto.randomUUID(),
    name: '',
    price: '0',
    enabled: true,
    defaultQuantity: 0,
  };
}
export function editDraft(item: MenuItem): MenuDraft {
  const menu = menuDefinition(item);
  return {
    ...menu,
    variants: menu.variants.map((v) => ({
      code: v.code,
      name: v.name,
      price: String(v.priceSatang / 100),
    })),
    groups: menu.groups.map(draftGroup),
    prepNotes: menu.prepNotes.join('\n'),
    revision: item.revision ?? 1,
  };
}
export function definitionFromDraft(draft: MenuDraft, categories: MenuCategory[]): MenuDefinition {
  const { revision: _revision, ...menu } = draft;
  return validateMenuDefinition(
    {
      ...menu,
      name: validateMenuName(menu.name),
      variants: menu.variants.map(({ price, ...v }) => ({ ...v, priceSatang: parseBaht(price) })),
      groups: menu.groups.map((g) => ({
        ...g,
        options: g.options.map(({ price, ...o }) => ({ ...o, priceSatang: parseBaht(price) })),
      })),
      prepNotes: menu.prepNotes
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean),
    },
    categories,
  );
}
export function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items],
    target = index + delta;
  if (target >= 0 && target < next.length)
    [next[index], next[target]] = [next[target], next[index]];
  return next;
}
