begin;
create table public.service_usage_snapshots (
 provider text primary key check (provider in ('supabase','cloudflare')),
 observed_at timestamptz not null default now(),
 payload jsonb not null check (jsonb_typeof(payload)='object')
);
alter table public.service_usage_snapshots enable row level security;
revoke all on public.service_usage_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.service_usage_snapshots to service_role;

create function public.owner_service_usage(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare database_bytes bigint; storage_bytes bigint; unknown_sizes bigint; snapshots jsonb;
begin
 perform public.require_actor(p_actor,true);
 select sum(pg_catalog.pg_database_size(datname))::bigint into database_bytes from pg_catalog.pg_database;
 if pg_catalog.to_regclass('storage.objects') is not null then
  execute $sql$select coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,15}$' then (metadata->>'size')::bigint end),0)::bigint,
    count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,15}$')::bigint from storage.objects$sql$
   into storage_bytes,unknown_sizes;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'observedAt',observed_at,'payload',payload) order by provider),'[]'::jsonb)
 into snapshots from public.service_usage_snapshots;
 return jsonb_build_object('checkedAt',clock_timestamp(),'databaseBytes',database_bytes,
  'storageBytes',case when unknown_sizes=0 then storage_bytes else null end,
  'storageComplete',coalesce(unknown_sizes=0,false),'snapshots',snapshots);
end $$;
revoke all on function public.owner_service_usage(uuid) from public,anon,authenticated;
grant execute on function public.owner_service_usage(uuid) to service_role;
commit;
