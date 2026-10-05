-- Step 1 design baseline for Supabase PostgreSQL 15+.
-- Requires Supabase auth.users, auth.uid(), and anon/authenticated/service_role.
-- Application transactions and authorization are specified in README.md.
begin;

create type public.order_channel as enum ('dine_in', 'takeaway', 'grabfood', 'lineman');
create type public.fulfillment_status as enum ('new', 'preparing', 'ready', 'served', 'cancelled');
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded');

-- Supabase Auth owns credentials. Four unique slots enforce four staff accounts.
create table public.admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  account_slot smallint not null unique check (account_slot between 1 and 4),
  display_name text not null,
  role text not null check (role in ('owner', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number smallint not null unique check (table_number between 1 and 8),
  label text not null,
  is_active boolean not null default true
);

create table public.qr_entrypoints (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dine_in', 'takeaway')),
  table_id uuid unique references public.restaurant_tables(id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'dine_in' and table_id is not null)
      or (kind = 'takeaway' and table_id is null))
);

-- A visit survives multiple orders, but the next party gets a new visit.
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.admins(auth_user_id) on delete set null,
  unique (id, table_id),
  check (closed_at is null or closed_at >= opened_at)
);
create unique index one_open_visit_per_table
  on public.table_sessions(table_id) where closed_at is null;

-- Opaque, short-lived customer identity; a printed QR is only an entry point.
create table public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  entrypoint_id uuid not null references public.qr_entrypoints(id),
  table_session_id uuid references public.table_sessions(id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id),
  code text not null unique,
  name text not null,
  description text,
  aliases text[] not null default '{}',
  image_path text,
  is_active boolean not null default true,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.menu_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id),
  code text not null,
  name text not null,
  price_satang bigint not null check (price_satang >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  unique (menu_item_id, code),
  unique (id, menu_item_id)
);
create unique index one_default_variant_per_item
  on public.menu_variants(menu_item_id) where is_default;

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);
create table public.menu_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.option_groups(id),
  code text not null,
  name text not null,
  aliases text[] not null default '{}',
  price_delta_satang bigint not null check (price_delta_satang >= 0),
  is_active boolean not null default true,
  unique (group_id, code),
  unique (id, group_id)
);
create table public.menu_item_option_groups (
  menu_item_id uuid not null references public.menu_items(id),
  group_id uuid not null references public.option_groups(id),
  min_selections smallint not null default 0,
  max_selections smallint not null default 1,
  primary key (menu_item_id, group_id),
  check (min_selections >= 0 and max_selections >= min_selections)
);
create table public.menu_item_options (
  menu_item_id uuid not null,
  group_id uuid not null,
  option_id uuid not null,
  price_override_satang bigint check (price_override_satang >= 0),
  default_quantity smallint not null default 0 check (default_quantity >= 0),
  max_quantity smallint not null default 1 check (max_quantity > 0),
  primary key (menu_item_id, option_id),
  foreign key (menu_item_id, group_id)
    references public.menu_item_option_groups(menu_item_id, group_id),
  foreign key (option_id, group_id) references public.menu_options(id, group_id),
  check (default_quantity <= max_quantity)
);

create table public.delivery_import_batches (
  id uuid primary key default gen_random_uuid(),
  channel public.order_channel not null check (channel in ('grabfood', 'lineman')),
  input_mode text not null check (input_mode in ('order_detail', 'daily_summary')),
  source text not null check (source in ('api', 'csv', 'manual')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  imported_by uuid references public.admins(auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel, content_hash)
);

create table public.daily_queue_counters (
  business_date date primary key,
  last_value integer not null check (last_value > 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  channel public.order_channel not null,
  source text not null check (source in ('qr', 'pos', 'delivery_api', 'delivery_csv')),
  input_method text not null default 'manual' check (input_method in ('manual', 'voice')),
  table_id uuid references public.restaurant_tables(id),
  table_session_id uuid,
  customer_session_id uuid references public.customer_sessions(id),
  business_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  queue_number integer check (queue_number > 0),
  external_order_id text,
  import_batch_id uuid references public.delivery_import_batches(id),
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  fulfillment_status public.fulfillment_status not null default 'new',
  payment_status public.payment_status not null default 'unpaid',
  gross_satang bigint not null check (gross_satang >= 0),
  discount_satang bigint not null default 0 check (discount_satang >= 0),
  total_satang bigint generated always as (gross_satang - discount_satang) stored,
  platform_fee_satang bigint check (platform_fee_satang >= 0), -- NULL = unknown.
  items_complete boolean not null default true,
  notes text,
  created_by uuid references public.admins(auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  foreign key (table_session_id, table_id) references public.table_sessions(id, table_id),
  check (discount_satang <= gross_satang),
  check ((channel = 'dine_in' and table_id is not null and table_session_id is not null)
      or (channel <> 'dine_in' and table_id is null and table_session_id is null)),
  check ((channel = 'takeaway' and queue_number is not null)
      or (channel <> 'takeaway' and queue_number is null)),
  check (external_order_id is null or channel in ('grabfood', 'lineman')),
  check (source not in ('delivery_api', 'delivery_csv')
      or (channel in ('grabfood', 'lineman') and external_order_id is not null)),
  check ((payment_status in ('paid', 'partially_refunded', 'refunded')) = (paid_at is not null))
);
create unique index unique_takeaway_queue on public.orders(business_date, queue_number)
  where channel = 'takeaway';
create unique index unique_delivery_order on public.orders(channel, external_order_id)
  where external_order_id is not null;
create index orders_kitchen_idx on public.orders(fulfillment_status, created_at);
create index orders_table_visit_idx on public.orders(table_session_id);
create index orders_paid_idx on public.orders(paid_at, channel) where paid_at is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  menu_item_id uuid not null references public.menu_items(id),
  variant_id uuid not null,
  menu_name_snapshot text not null,
  variant_name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 20),
  base_unit_satang bigint not null check (base_unit_satang >= 0),
  options_unit_satang bigint not null default 0 check (options_unit_satang >= 0),
  discount_satang bigint not null default 0 check (discount_satang >= 0),
  line_gross_satang bigint generated always as
    ((base_unit_satang + options_unit_satang) * quantity) stored,
  line_net_satang bigint generated always as
    ((base_unit_satang + options_unit_satang) * quantity - discount_satang) stored,
  notes text,
  unique (id, order_id),
  foreign key (variant_id, menu_item_id) references public.menu_variants(id, menu_item_id),
  check (discount_satang <= (base_unit_satang + options_unit_satang) * quantity)
);
create index order_items_order_idx on public.order_items(order_id);
create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id),
  option_id uuid not null references public.menu_options(id),
  group_name_snapshot text not null,
  option_name_snapshot text not null,
  quantity smallint not null check (quantity > 0), -- Per bowl, not for the whole line.
  unit_price_satang bigint not null check (unit_price_satang >= 0),
  unique (order_item_id, option_id)
);

-- Append-only financial ledger once an entry succeeds; fees/payouts are not sales.
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('capture', 'refund')),
  method text not null check (method in ('cash', 'promptpay', 'card', 'delivery_platform')),
  amount_satang bigint not null check (amount_satang > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  original_capture_id uuid,
  provider_reference text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  recorded_by uuid references public.admins(auth_user_id) on delete set null,
  unique (id, order_id),
  foreign key (original_capture_id, order_id) references public.payment_transactions(id, order_id),
  check ((kind = 'capture' and original_capture_id is null)
      or (kind = 'refund' and original_capture_id is not null)),
  check ((status = 'succeeded') = (posted_at is not null))
);
create unique index unique_provider_transaction
  on public.payment_transactions(method, provider_reference) where provider_reference is not null;
create index payments_order_idx on public.payment_transactions(order_id, status);
create index payments_refund_date_idx on public.payment_transactions(posted_at)
  where kind = 'refund' and status = 'succeeded';
create table public.refund_items (
  refund_transaction_id uuid not null,
  order_item_id uuid not null,
  order_id uuid not null,
  quantity integer not null check (quantity > 0),
  primary key (refund_transaction_id, order_item_id),
  foreign key (refund_transaction_id, order_id) references public.payment_transactions(id, order_id),
  foreign key (order_item_id, order_id) references public.order_items(id, order_id)
);

create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  previous_status public.fulfillment_status,
  next_status public.fulfillment_status not null,
  actor_id uuid references public.admins(auth_user_id) on delete set null,
  actor_name_snapshot text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_status_events(order_id, created_at);

-- Exactly one reporting source per delivery channel/day. Detail may coexist in
-- storage with a summary, but views include only the explicitly selected source.
create table public.delivery_day_coverage (
  channel public.order_channel not null check (channel in ('grabfood', 'lineman')),
  sales_date date not null,
  reporting_mode text not null check (reporting_mode in ('order_detail', 'daily_summary')),
  is_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (channel, sales_date)
);
create table public.delivery_daily_sales (
  channel public.order_channel not null,
  sales_date date not null,
  import_batch_id uuid not null references public.delivery_import_batches(id),
  gross_satang bigint not null check (gross_satang >= 0),
  discount_satang bigint not null default 0 check (discount_satang >= 0),
  refund_satang bigint not null default 0 check (refund_satang >= 0),
  net_sales_satang bigint generated always as (gross_satang - discount_satang - refund_satang) stored,
  paid_order_count integer check (paid_order_count >= 0), -- NULL means unknown.
  platform_fee_satang bigint check (platform_fee_satang >= 0), -- NULL = unknown.
  payout_satang bigint check (payout_satang >= 0),
  primary key (channel, sales_date),
  foreign key (channel, sales_date) references public.delivery_day_coverage(channel, sales_date),
  check (discount_satang <= gross_satang)
);

create function public.next_takeaway_queue(p_business_date date)
returns integer language sql set search_path = '' as $$
  insert into public.daily_queue_counters(business_date, last_value)
  values (p_business_date, 1)
  on conflict (business_date) do update
    set last_value = public.daily_queue_counters.last_value + 1
  returning last_value;
$$;

-- Staff use read-only RLS subscriptions; all writes go through guarded server APIs.
create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a where a.auth_user_id = auth.uid() and a.is_active
  );
$$;
revoke all on function public.is_staff() from public, anon, authenticated;
grant execute on function public.is_staff() to authenticated, service_role;
revoke all on function public.next_takeaway_queue(date) from public, anon, authenticated;
grant execute on function public.next_takeaway_queue(date) to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'admins', 'restaurant_tables', 'qr_entrypoints', 'table_sessions', 'customer_sessions',
    'menu_categories', 'menu_items', 'menu_variants', 'option_groups', 'menu_options',
    'menu_item_option_groups', 'menu_item_options', 'delivery_import_batches',
    'daily_queue_counters', 'orders', 'order_items', 'order_item_options',
    'payment_transactions', 'refund_items', 'order_status_events',
    'delivery_day_coverage', 'delivery_daily_sales'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy staff_read on public.%I for select to authenticated using ((select public.is_staff()))', t);
  end loop;
end;
$$;
grant usage, select on sequence public.order_status_events_id_seq to service_role;
-- QR hashes, customer session hashes, counters, and import source hashes stay server-only.
grant select on public.admins, public.restaurant_tables, public.table_sessions,
  public.menu_categories, public.menu_items, public.menu_variants, public.option_groups,
  public.menu_options, public.menu_item_option_groups, public.menu_item_options,
  public.orders, public.order_items, public.order_item_options, public.payment_transactions,
  public.refund_items, public.order_status_events, public.delivery_day_coverage,
  public.delivery_daily_sales to authenticated;

-- Fact grain: one paid order, one succeeded refund, or one delivery daily summary.
-- A paid order is counted once even if payment is split into multiple captures.
create view public.sales_events with (security_invoker = true) as
select 'order'::text as source_kind, o.id::text as source_id,
  o.id as order_id, null::uuid as refund_transaction_id,
  (o.paid_at at time zone 'Asia/Bangkok')::date as sales_date,
  extract(hour from o.paid_at at time zone 'Asia/Bangkok')::integer as sales_hour,
  o.channel, o.gross_satang, o.discount_satang, 0::bigint as refund_satang,
  o.total_satang as net_sales_satang, 1::bigint as paid_order_count,
  o.items_complete as has_menu_detail
from public.orders o
where o.paid_at is not null and (
  o.channel in ('dine_in', 'takeaway') or exists (
    select 1 from public.delivery_day_coverage c where c.channel = o.channel
    and c.sales_date = (o.paid_at at time zone 'Asia/Bangkok')::date
    and c.reporting_mode = 'order_detail'
  )
)
union all
select 'refund', p.id::text, o.id, p.id, (p.posted_at at time zone 'Asia/Bangkok')::date,
  extract(hour from p.posted_at at time zone 'Asia/Bangkok')::integer,
  o.channel, 0::bigint, 0::bigint, p.amount_satang, -p.amount_satang, 0::bigint, false
from public.payment_transactions p join public.orders o on o.id = p.order_id
where p.kind = 'refund' and p.status = 'succeeded' and o.paid_at is not null and (
  o.channel in ('dine_in', 'takeaway') or exists (
    select 1 from public.delivery_day_coverage c where c.channel = o.channel
    and c.sales_date = (p.posted_at at time zone 'Asia/Bangkok')::date
    and c.reporting_mode = 'order_detail'
  )
)
union all
select 'daily_summary', s.channel::text || ':' || s.sales_date::text, null::uuid, null::uuid,
  s.sales_date, null::integer, s.channel, s.gross_satang, s.discount_satang,
  s.refund_satang, s.net_sales_satang, s.paid_order_count::bigint, false
from public.delivery_daily_sales s join public.delivery_day_coverage c
  on c.channel = s.channel and c.sales_date = s.sales_date
where c.reporting_mode = 'daily_summary';

create view public.sales_daily with (security_invoker = true) as
select sales_date, channel, sum(gross_satang) as gross_satang,
  sum(discount_satang) as discount_satang, sum(refund_satang) as refund_satang,
  sum(net_sales_satang) as net_sales_satang,
  case when bool_and(paid_order_count is not null) then sum(paid_order_count) end as paid_order_count,
  case when bool_and(paid_order_count is not null) and sum(paid_order_count) > 0
    then (sum(gross_satang) - sum(discount_satang)) / sum(paid_order_count)
  end as average_order_satang
from public.sales_events group by sales_date, channel;

create view public.menu_quantity_events with (security_invoker = true) as
select e.sales_date, e.channel, i.menu_item_id, i.menu_name_snapshot,
  i.quantity::bigint as quantity_delta
from public.sales_events e join public.order_items i on i.order_id = e.order_id
where e.source_kind = 'order'
union all
select e.sales_date, e.channel, i.menu_item_id, i.menu_name_snapshot, -r.quantity::bigint
from public.sales_events e join public.refund_items r on r.refund_transaction_id = e.refund_transaction_id
join public.order_items i on i.id = r.order_item_id
where e.source_kind = 'refund';

revoke all on public.sales_events, public.sales_daily, public.menu_quantity_events from anon, authenticated;
grant select on public.sales_events, public.sales_daily, public.menu_quantity_events to authenticated, service_role;

-- Enable publication only for tables staff need to receive; refetch after reconnect.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

commit;
