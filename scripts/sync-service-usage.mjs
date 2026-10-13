import { pathToFileURL } from 'node:url';

async function pages(fetchJson, base, perPage = 25) {
  const records = [];
  let expectedTotal = null, expectedPages = null;
  for (let page = 1; page <= 100; page++) {
    const response = await fetchJson(`${base}?page=${page}&per_page=${perPage}`);
    const info = response?.result_info;
    if (response?.success !== true || !Array.isArray(response.result) || !info || info.page !== page || !Number.isInteger(info.total_pages) || info.total_pages < 0 || info.total_pages > 100 || !Number.isInteger(info.total_count) || info.total_count < 0 || info.per_page !== perPage || info.count !== response.result.length) throw new Error('Cloudflare pagination incomplete');
    const pageCount = Math.ceil(info.total_count / perPage);
    if (info.total_pages !== pageCount && !(pageCount === 0 && info.total_pages === 1)) throw new Error('Cloudflare pagination totals inconsistent');
    expectedTotal ??= info.total_count; expectedPages ??= info.total_pages;
    if (info.total_count !== expectedTotal || info.total_pages !== expectedPages || response.result.length !== Math.min(perPage, Math.max(0, expectedTotal - (page - 1) * perPage))) throw new Error('Cloudflare pagination changed or truncated');
    records.push(...response.result);
    if (page >= info.total_pages) {
      if (records.length !== expectedTotal) throw new Error('Cloudflare pagination incomplete');
      return records;
    }
  }
  throw new Error('Cloudflare pagination limit reached');
}

export async function collectCloudflareUsage({ accountId, projectName, now = new Date(), fetchJson }) {
  const base = `/accounts/${encodeURIComponent(accountId)}/pages/projects`;
  // Pages project lists accept at most 10 records per page on the current API.
  const projects = await pages(fetchJson, base, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const seen = new Set(); let builds = 0;
  for (const project of projects) {
    if (typeof project.name !== 'string' || !project.name) throw new Error('Cloudflare project metadata incomplete');
    const deployments = await pages(fetchJson, `${base}/${encodeURIComponent(project.name)}/deployments`);
    for (const deployment of deployments) {
      if (typeof deployment.id !== 'string' || !Array.isArray(deployment.stages)) throw new Error('Cloudflare deployment metadata incomplete');
      const identity = project.name + ':' + deployment.id;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const build = deployment.stages.find(stage => stage.name === 'build');
      const started = typeof build?.started_on === 'string' ? Date.parse(build.started_on) : NaN;
      if (started >= start.getTime() && started < end.getTime() && started <= now.getTime()) builds++;
    }
  }
  const project = projects.find(p => p.name === projectName);
  return { observedAt: now.toISOString(), periodStart: start.toISOString(), periodEnd: end.toISOString(), builds, projects: projects.length, usesFunctions: typeof project?.uses_functions === 'boolean' ? project.uses_functions : null };
}

const required = name => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
async function requestJson(url, token, body) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
export async function syncServiceUsage({ publish = true } = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? 'a40b7e1a8b9d034c0461a2d0bdcd2b7e';
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? 'emjktqzcvgjwtsgysljy';
  const snapshot = await collectCloudflareUsage({ accountId, projectName: 'prod-noodle', fetchJson: path => requestJson('https://api.cloudflare.com/client/v4' + path, required('CLOUDFLARE_API_TOKEN')) });
  if (publish) {
    const literal = JSON.stringify(snapshot).replaceAll("'", "''");
    const date = snapshot.observedAt.replaceAll("'", "''");
    await requestJson(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, required('SUPABASE_ACCESS_TOKEN'), { query: `INSERT INTO public.service_usage_snapshots(provider,observed_at,payload) VALUES('cloudflare','${date}'::timestamptz,'${literal}'::jsonb) ON CONFLICT(provider) DO UPDATE SET observed_at=EXCLUDED.observed_at,payload=EXCLUDED.payload WHERE service_usage_snapshots.observed_at <= EXCLUDED.observed_at;` });
  }
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await syncServiceUsage({ publish: !process.argv.includes('--read-only') }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
