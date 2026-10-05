import type { Group, MenuItem } from './domain.ts';
const noodle: Group = { code: 'noodle', name: 'เส้น', min: 1, max: 1, options: [
  ['sen-lek', 'เส้นเล็ก', 0], ['sen-yai', 'เส้นใหญ่', 0], ['sen-mee', 'เส้นหมี่', 0], ['bamee', 'บะหมี่', 0], ['woonsen', 'วุ้นเส้น', 0], ['mama', 'มาม่า', 500],
].map(([code, name, price]) => ({ code: String(code), name: String(name), priceSatang: Number(price) })) };
const broth: Group = { code: 'broth', name: 'น้ำซุป', min: 1, max: 1, options: [{ code: 'clear', name: 'น้ำใส', priceSatang: 0, defaultQuantity: 1 }, { code: 'tomyum', name: 'ต้มยำ', priceSatang: 0 }] };
const topping: Group = { code: 'topping', name: 'ท็อปปิ้งเพิ่ม', min: 0, max: 2, options: [{ code: 'minced-pork', name: 'หมูบด', priceSatang: 1000 }, { code: 'crispy-pork', name: 'หมูกรอบ', priceSatang: 2000 }] };
function dish(code: string, name: string, category: string, categoryName: string, normal: number, special: number | null, groups: Group[] = [], unit = 'ชาม', description = ''): MenuItem {
  return { code, name, category, categoryName, description, unit, available: true, variants: [{ code: 'normal', name: special ? 'ธรรมดา' : 'ปกติ', priceSatang: normal * 100 }, ...(special ? [{ code: 'special', name: 'พิเศษ', priceSatang: special * 100 }] : [])], groups, prepNotes: groups.length ? ['ไม่ใส่ผัก', 'ไม่ใส่กระเทียม'] : [] };
}
// Starter entries transcribed from the attached menu; owner must verify before live use.
export const starterCatalog: MenuItem[] = [
  dish('soft-pork-noodles', 'ชามโปรดหมูนุ่ม', 'noodles', 'ก๋วยเตี๋ยว', 50, 60, [noodle, broth, topping], 'ชาม', 'หมูนุ่มในน้ำซุป เลือกเส้นและน้ำใสหรือต้มยำ'),
  dish('braised-pork-noodles', 'ชามโปรดหมูตุ๋น', 'noodles', 'ก๋วยเตี๋ยว', 50, 60, [noodle, broth, topping], 'ชาม', 'หมูตุ๋น เลือกเส้นที่ชอบ'),
  dish('yentafo', 'ก๋วยเตี๋ยวเย็นตาโฟ', 'yentafo', 'เย็นตาโฟ', 60, 70, [noodle, topping], 'ชาม', 'เย็นตาโฟสูตรของร้าน'),
  dish('pork-soup', 'เกาเหลาหมู', 'soup-only', 'เกาเหลา', 60, 70, [broth, topping]),
  dish('yentafo-soup', 'เกาเหลาเย็นตาโฟ', 'soup-only', 'เกาเหลา', 70, 80, [topping]),
  dish('red-pork-rice', 'ข้าวหมูแดง', 'rice', 'ข้าวและบะหมี่', 50, 60, [], 'จาน'),
  dish('crispy-pork-rice', 'ข้าวหมูกรอบ', 'rice', 'ข้าวและบะหมี่', 60, 70, [], 'จาน'),
  dish('mixed-pork-rice', 'ข้าวหมูแดงหมูกรอบ', 'rice', 'ข้าวและบะหมี่', 60, 70, [], 'จาน'),
  dish('red-pork-bamee', 'บะหมี่หมูแดง', 'rice', 'ข้าวและบะหมี่', 50, 60),
  dish('crispy-pork-bamee', 'บะหมี่หมูกรอบ', 'rice', 'ข้าวและบะหมี่', 60, 70),
  dish('fried-wonton', 'เกี๊ยวกรอบทอด', 'snacks', 'ของทานเล่น', 25, null, [], 'จาน'),
  dish('water', 'น้ำเปล่า', 'drinks', 'เครื่องดื่ม', 10, null, [], 'ขวด'),
  dish('soft-drink', 'น้ำอัดลม', 'drinks', 'เครื่องดื่ม', 20, null, [], 'ขวด'),
  dish('grass-jelly', 'เฉาก๊วยโบราณ', 'desserts', 'ของหวาน', 25, null, [], 'ถ้วย'),
];
