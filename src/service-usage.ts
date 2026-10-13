export interface RawServiceUsage {
  checkedAt: string;
  databaseBytes: number | null;
  storageBytes: number | null;
  storageComplete: boolean;
  snapshots: { provider: string; observedAt: string; payload: Record<string, unknown> }[];
  demo?: boolean;
}
export interface UsageMetric {
  id: string; label: string; used: number | null; limit: number | null;
  unit: 'bytes' | 'count'; status: 'available' | 'unavailable' | 'unlimited' | 'not_used';
  period: string; source: string; updatedAt: string | null; stale: boolean; note: string;
}
export interface UsageProvider { id: 'supabase' | 'cloudflare'; name: string; href: string; metrics: UsageMetric[] }
export interface ServiceUsageReport { checkedAt: string | null; demo: boolean; providers: UsageProvider[] }

const quantity = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const time = (value: unknown): number => typeof value === 'string' ? Date.parse(value) : NaN;
const observed = (value: unknown, now: Date): string | null => Number.isFinite(time(value)) && time(value) <= now.getTime() ? value as string : null;

export function usageProgress(metric: UsageMetric): { percent: number | null; barPercent: number; remaining: number | null; severity: 'normal' | 'warning' | 'danger' | 'unknown' } {
  if (metric.status !== 'available' || metric.used === null || metric.limit === null || metric.limit <= 0) return { percent: null, barPercent: 0, remaining: null, severity: 'unknown' };
  const percent = metric.used / metric.limit * 100;
  return { percent, barPercent: Math.min(percent, 100), remaining: Math.max(0, metric.limit - metric.used), severity: percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'normal' };
}

export function serviceUsageReport(raw: RawServiceUsage, now = new Date()): ServiceUsageReport {
  const checkedAt = observed(raw.checkedAt, now);
  const current = (id: string, label: string, used: unknown, limit: number, source: string, note = ''): UsageMetric => {
    const amount = checkedAt ? quantity(used) : null;
    return { id, label, used: amount, limit, unit: 'bytes', status: amount === null ? 'unavailable' : 'available', period: 'พื้นที่สะสม · ไม่รีเซ็ตทุกเดือน', source, updatedAt: checkedAt, stale: Boolean(checkedAt && now.getTime() - time(checkedAt) > 86400_000), note };
  };
  const billing = (id: string, label: string, limit: number, unit: 'bytes' | 'count', period = 'ตามรอบบิลขององค์กร'): UsageMetric => ({ id, label, used: null, limit, unit, status: 'unavailable', period, source: 'Supabase Usage', updatedAt: null, stale: false, note: 'ยังดึงรายงาน Usage นี้ไม่ได้ · ตรวจค่าจริงผ่านปุ่มเปิดรายงาน Supabase' });
  const supabase: UsageProvider = { id: 'supabase', name: 'Supabase', href: 'https://supabase.com/dashboard/org/hnkfnogfzbiuulodvxjj/usage', metrics: [
    current('database', 'ฐานข้อมูล', raw.databaseBytes, 500_000_000, 'ขนาดฐานข้อมูล PostgreSQL', 'รวมข้อมูลและดัชนีทุกฐานข้อมูลในโครงการ'),
    current('storage', 'รูปและไฟล์', raw.storageComplete === true ? raw.storageBytes : null, 1_000_000_000, 'ขนาดไฟล์ใน Supabase Storage', raw.storageComplete === true ? '' : 'ข้อมูลขนาดไฟล์ยังไม่ครบ'),
    billing('functions', 'การเรียก API / Edge Functions', 500_000, 'count'),
    billing('egress', 'ข้อมูลส่งออก ไม่ใช้แคช', 5_000_000_000, 'bytes'),
    billing('cached-egress', 'ข้อมูลส่งออก ใช้แคช', 5_000_000_000, 'bytes'),
    billing('realtime-messages', 'ข้อความ Realtime', 2_000_000, 'count'),
    billing('realtime-connections', 'การเชื่อมต่อ Realtime สูงสุด', 200, 'count'),
  ] };
  const snapshot = (Array.isArray(raw.snapshots) ? raw.snapshots : []).filter(s => s.provider === 'cloudflare').sort((a, b) => time(b.observedAt) - time(a.observedAt))[0];
  const updatedAt = observed(snapshot?.observedAt, now);
  const payload = snapshot?.payload ?? {};
  const stale = Boolean(updatedAt && now.getTime() - time(updatedAt) > 86400_000);
  const start = time(payload.periodStart), end = time(payload.periodEnd);
  const inPeriod = Boolean(updatedAt && Number.isFinite(start) && Number.isFinite(end) && end > start && start <= time(updatedAt) && time(updatedAt) < end && start <= now.getTime() && now.getTime() < end);
  const cloudMetric = (id: string, label: string, value: unknown, limit: number, monthly = false): UsageMetric => {
    const used = updatedAt && (!monthly || inPeriod) ? quantity(value) : null;
    return { id, label, used, limit, unit: 'count', status: used === null ? 'unavailable' : 'available', period: monthly && inPeriod ? `${new Date(start).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' })} · เดือนปฏิทิน UTC` : monthly ? 'เดือนปฏิทินปัจจุบัน · UTC' : 'รวมทั้งบัญชี · ไม่รีเซ็ตทุกเดือน', source: 'Cloudflare Pages API', updatedAt, stale, note: id === 'builds' ? 'นับ Build ที่เริ่มแล้วจากประวัติทุกโครงการในบัญชี รวม Preview และ Build ที่ไม่ผ่าน · ไม่รวมประวัติที่ถูกลบ' : 'นับโครงการ Pages ทั้งบัญชี' };
  };
  const cloudflare: UsageProvider = { id: 'cloudflare', name: 'Cloudflare', href: 'https://dash.cloudflare.com/a40b7e1a8b9d034c0461a2d0bdcd2b7e/pages/view/prod-noodle', metrics: [
    cloudMetric('builds', 'การสร้างเว็บ / Builds', payload.builds, 500, true),
    cloudMetric('projects', 'โครงการ Pages', payload.projects, 100),
    { id: 'static-requests', label: 'การเปิดหน้าเว็บและรูปแบบ Static', used: null, limit: null, unit: 'count', status: 'unlimited', period: 'ไม่จำกัดจำนวนครั้ง', source: 'Cloudflare Pages Free', updatedAt: null, stale: false, note: 'การเปิดเว็บของลูกค้าไม่ใช่การ Build เว็บ' },
    { id: 'pages-functions', label: 'Pages Functions ของเว็บร้าน', used: null, limit: null, unit: 'count', status: updatedAt && payload.usesFunctions === false ? 'not_used' : 'unavailable', period: 'โครงการ prod-noodle', source: 'Cloudflare Pages API', updatedAt, stale, note: updatedAt && payload.usesFunctions === false ? 'เว็บร้านใช้ Supabase เป็น API จึงไม่ได้ใช้ Pages Functions' : 'ยังไม่มีข้อมูลการตั้งค่า Functions ของเว็บร้าน' },
  ] };
  return { checkedAt, demo: raw.demo === true, providers: [supabase, cloudflare] };
}

export function demoServiceUsage(now = new Date()): RawServiceUsage {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { checkedAt: now.toISOString(), databaseBytes: 30_000_000, storageBytes: 0, storageComplete: true, demo: true, snapshots: [{ provider: 'cloudflare', observedAt: now.toISOString(), payload: { builds: 40, projects: 1, usesFunctions: false, periodStart: start.toISOString(), periodEnd: end.toISOString() } }] };
}
