import type { Group, MenuItem } from './domain.ts';

// Menu photo supplied by the owner; corrected label: หมูแผ่น. Prices are baht below.
export const menuCategories = [
  { code: 'noodles', name: 'ก๋วยเตี๋ยว', sortOrder: 1 },
  { code: 'soup-only', name: 'เกาเหลา', sortOrder: 2 },
  { code: 'rice', name: 'ข้าวและบะหมี่', sortOrder: 3 },
  { code: 'snacks', name: 'ของทานเล่น / เพิ่มพิเศษ', sortOrder: 4 },
  { code: 'drinks', name: 'เครื่องดื่ม', sortOrder: 5 },
  { code: 'desserts', name: 'ของหวาน', sortOrder: 6 },
];
const noodle: Group = { code: 'noodle', name: 'เส้น', min: 1, max: 1, options: [
  ['sen-lek', 'เส้นเล็ก', 0], ['sen-yai', 'เส้นใหญ่', 0], ['sen-mee', 'เส้นหมี่', 0], ['bamee', 'บะหมี่', 0], ['woonsen', 'วุ้นเส้น', 0], ['mama', 'มาม่า', 500],
].map(([code, name, price]) => ({ code: String(code), name: String(name), priceSatang: Number(price) })) };
const broth: Group = { code: 'broth', name: 'น้ำซุป', min: 1, max: 1, options: [
  { code: 'clear', name: 'น้ำใส', priceSatang: 0, defaultQuantity: 1 }, { code: 'tomyum', name: 'ต้มยำ', priceSatang: 0 },
] };
const serving: Group = { code: 'serving', name: 'น้ำ / แห้ง', min: 0, max: 1, options: [
  { code: 'soup', name: 'น้ำ', priceSatang: 0, defaultQuantity: 1 }, { code: 'dry', name: 'แห้ง', priceSatang: 0 },
] };
const topping: Group = { code: 'topping', name: 'เพิ่มพิเศษ', min: 0, max: 4, options: [
  { code: 'pork-slices', name: 'หมูแผ่น', priceSatang: 1000 },
  { code: 'minced-pork', name: 'หมูท่วม', priceSatang: 1000 },
  { code: 'crispy-pork', name: 'หมูกรอบ', priceSatang: 2000 },
  { code: 'soft-boiled-egg', name: 'ไข่ยางมะตูม', priceSatang: 1000 },
] };
const porkChoice: Group = { code: 'extra-pork-kind', name: 'เลือกหมูเพิ่ม', min: 1, max: 1, options: [
  { code: 'slices', name: 'หมูแผ่น', priceSatang: 0, defaultQuantity: 1 }, { code: 'minced', name: 'หมูท่วม', priceSatang: 0 },
] };
function dish(code: string, name: string, category: string, normal: number, special: number | null, groups: Group[] = [], unit = 'ชาม', description = ''): MenuItem {
  return { code, name, category, categoryName: menuCategories.find(c => c.code === category)!.name, description, unit, available: true,
    variants: [{ code: 'normal', name: special ? 'ธรรมดา' : 'ปกติ', priceSatang: normal * 100 }, ...(special ? [{ code: 'special', name: 'พิเศษ', priceSatang: special * 100 }] : [])],
    groups, prepNotes: ['noodles', 'soup-only', 'rice'].includes(category) ? ['ไม่ใส่ผัก', 'ไม่ใส่กระเทียม'] : [] };
}
const noodleGroups = [noodle, broth, serving, topping];
export const starterCatalog: MenuItem[] = [
  dish('soft-pork-noodles', 'ชามโปรดหมูแผ่น', 'noodles', 50, 60, noodleGroups),
  dish('minced-pork-noodles', 'ชามโปรดหมูท่วม', 'noodles', 60, 70, noodleGroups),
  dish('two-pork-noodles', 'ชามโปรดสองหมู', 'noodles', 60, 70, noodleGroups),
  dish('pork-only-noodles', 'ชามโปรดหมูล้วน', 'noodles', 50, 60, noodleGroups),
  dish('crispy-pork-egg-noodles', 'ชามโปรดหมูกรอบพร้อมไข่ยางมะตูม', 'noodles', 80, 90, noodleGroups),
  dish('mixed-dry-noodles', 'ชามโปรดก๋วยเตี๋ยวเส้นคลุก', 'noodles', 60, 70, [noodle, topping]),
  dish('red-pork-noodles', 'ชามโปรดหมูแดง', 'noodles', 50, 60, noodleGroups),
  dish('shrimp-wonton-noodles', 'ชามโปรดเกี๊ยวกุ้ง', 'noodles', 50, 60, noodleGroups),
  dish('yentafo', 'ก๋วยเตี๋ยวเย็นตาโฟ', 'noodles', 60, 70, [noodle, serving, topping]),
  dish('yentafo-extra-pork', 'ก๋วยเตี๋ยวเย็นตาโฟเพิ่มหมูแผ่น', 'noodles', 70, 80, [noodle, serving, topping]),
  dish('yentafo-tomyum', 'ก๋วยเตี๋ยวเย็นตาโฟต้มยำ', 'noodles', 70, 80, [noodle, serving, topping]),
  dish('yentafo-hotpot', 'เย็นตาโฟหม้อไฟ', 'noodles', 179, null, [topping], 'หม้อ', 'รอประมาณ 2–3 นาที'),
  dish('pork-soup', 'เกาเหลาหมู', 'soup-only', 60, 70, [broth, topping]),
  dish('yentafo-soup', 'เกาเหลาเย็นตาโฟ', 'soup-only', 70, 80, [topping]),
  dish('red-pork-rice', 'ข้าวหมูแดง', 'rice', 50, 60, [topping], 'จาน'),
  dish('crispy-pork-rice', 'ข้าวหมูกรอบ', 'rice', 60, 70, [topping], 'จาน'),
  dish('mixed-pork-rice', 'ข้าวหมูแดงหมูกรอบ', 'rice', 60, 70, [topping], 'จาน'),
  dish('red-pork-bamee', 'บะหมี่หมูแดง', 'rice', 50, 60, [serving, topping]),
  dish('crispy-pork-bamee', 'บะหมี่หมูกรอบ', 'rice', 60, 70, [serving, topping]),
  dish('mixed-pork-bamee', 'บะหมี่หมูแดงหมูกรอบ', 'rice', 60, 70, [serving, topping]),
  dish('boiled-meatballs', 'ลูกชิ้นรวมลวกจิ้ม', 'snacks', 70, null, [], 'จาน'),
  dish('boiled-pork-slices', 'หมูแผ่นลวกจิ้ม', 'snacks', 60, null, [], 'จาน'),
  dish('grilled-meatballs', 'ลูกชิ้นปิ้ง', 'snacks', 10, null, [], 'ไม้'),
  dish('fried-spring-rolls', 'เปาะเปี๊ยะทอด', 'snacks', 50, null, [], 'จาน'),
  dish('fried-wonton', 'เกี๊ยวกรอบทอด', 'snacks', 25, null, [], 'จาน'),
  dish('wonton-salad', 'ยำเกี๊ยวกรอบทรงเครื่อง', 'snacks', 60, null, [], 'จาน'),
  dish('extra-pork', 'เพิ่มหมูแผ่น / หมูท่วม', 'snacks', 10, null, [porkChoice], 'ที่'),
  dish('extra-crispy-pork', 'เพิ่มหมูกรอบ', 'snacks', 20, null, [], 'ที่'),
  dish('extra-egg', 'เพิ่มไข่ยางมะตูม', 'snacks', 10, null, [], 'ฟอง'),
  dish('plain-rice', 'ข้าวเปล่า', 'snacks', 10, null, [], 'จาน'),
  dish('longan-juice', 'น้ำลำไย', 'drinks', 25, null, [], 'แก้ว'),
  dish('chrysanthemum-tea', 'น้ำเก๊กฮวย', 'drinks', 25, null, [], 'แก้ว'),
  dish('butterfly-pea-lime', 'น้ำอัญชันมะนาว', 'drinks', 25, null, [], 'แก้ว'),
  dish('soft-drink', 'น้ำอัดลม', 'drinks', 20, null, [], 'ขวด'),
  dish('water', 'น้ำเปล่า', 'drinks', 10, null, [], 'ขวด'),
  dish('ice', 'น้ำแข็งเปล่า', 'drinks', 2, null, [], 'แก้ว'),
  dish('grass-jelly', 'เฉาก๊วยโบราณ', 'desserts', 25, null, [], 'ถ้วย'),
  { ...dish('mahachai-ice-cream', 'ไอศกรีมมหาชัยพร้อมเครื่อง', 'desserts', 30, 40, [], 'ถ้วย'), variants: [{code:'normal',name:'เล็ก',priceSatang:3000},{code:'special',name:'ใหญ่',priceSatang:4000}] },
];

// Upgrade local demos once without dropping orders, custom menus or owner price edits.
export const catalogVersion = 2;
export function upgradeSavedCatalog(previous: MenuItem[]): MenuItem[] {
  const currentCodes = new Set(starterCatalog.map(item => item.code));
  const current = starterCatalog.map(source => {
    const item = structuredClone(source);
    const old = previous.find(value => value.code === item.code);
    if (old) {
      item.available = old.available;
      item.variants = item.variants.map(variant => ({ ...variant, priceSatang: old.variants.find(v => v.code === variant.code)?.priceSatang ?? variant.priceSatang }));
    }
    return item;
  });
  return [...current, ...previous.filter(item => !currentCodes.has(item.code) && item.code !== 'braised-pork-noodles').map(item => structuredClone(item))];
}
