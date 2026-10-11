import type { Group, MenuItem } from './domain.ts';

export const iceCreamGroups: Group[] = [
  {
    code: 'ice-toppings',
    name: 'เลือกเครื่อง',
    min: 0,
    max: 4,
    limitsByVariant: { normal: { min: 0, max: 3 }, special: { min: 0, max: 4 } },
    options: [
      ['mung-bean', 'ถั่วทอง'],
      ['candied-pumpkin', 'ฟักทองเชื่อม'],
      ['candied-sweet-potato', 'มันเชื่อม'],
      ['attap-seed', 'ลูกชิด'],
      ['candied-pineapple', 'สับปะรดเชื่อม'],
    ].map(([code, name]) => ({ code, name, priceSatang: 0 })),
  },
  {
    code: 'ice-peanuts',
    name: 'ถั่วลิสง',
    min: 1,
    max: 1,
    options: [
      { code: 'include', name: 'ถั่วลิสง (ใส่ให้อยู่แล้ว)', priceSatang: 0, defaultQuantity: 1 },
      { code: 'omit', name: 'ไม่ใส่ถั่วลิสง', priceSatang: 0 },
    ],
  },
];
export const friedEggGroup: Group = {
  code: 'basil-extras',
  name: 'เพิ่มพิเศษ',
  min: 0,
  max: 1,
  options: [{ code: 'fried-egg', name: 'เพิ่มไข่ดาว', priceSatang: 1000 }],
};
export function withRequestedOptions(item: MenuItem): MenuItem {
  const groups =
    item.code === 'mahachai-ice-cream'
      ? iceCreamGroups
      : [
            'menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef',
            'menu-cea2ec9a-f037-475c-885e-a4dd03a537da',
          ].includes(item.code)
        ? [friedEggGroup]
        : [];
  return {
    ...item,
    groups: [
      ...item.groups,
      ...structuredClone(
        groups.filter((g) => !item.groups.some((existing) => existing.code === g.code)),
      ),
    ],
  };
}
