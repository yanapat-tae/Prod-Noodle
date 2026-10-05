-- Independent parameterized queries, not a migration.
-- $1 = inclusive Bangkok sales date; $2 = exclusive end date.
-- All monetary results are in satang. Preserve NULL for unknown counts.

-- KPI totals for a day or date range.
select sum(gross_satang - discount_satang) as sales_before_refunds_satang,
  sum(refund_satang) as refunds_satang,
  sum(net_sales_satang) as net_sales_satang,
  case when bool_and(paid_order_count is not null) then sum(paid_order_count) end as paid_order_count,
  case when bool_and(paid_order_count is not null) and sum(paid_order_count) > 0
    then sum(gross_satang - discount_satang) / sum(paid_order_count)
  end as average_order_satang
from public.sales_events
where sales_date >= $1::date and sales_date < $2::date;

-- Hourly chart: NULL hour remains an explicit unknown bucket for summaries.
select sales_hour, sum(gross_satang - discount_satang) as sales_satang,
  sum(refund_satang) as refund_satang
from public.sales_events
where sales_date >= $1::date and sales_date < $2::date
group by sales_hour order by sales_hour nulls last;

-- Channel donut uses sales before refunds; refunds/net are separate fields.
select channel, sum(gross_satang - discount_satang) as donut_sales_satang,
  sum(refund_satang) as refund_satang, sum(net_sales_satang) as net_sales_satang
from public.sales_events
where sales_date >= $1::date and sales_date < $2::date
group by channel;

-- Top 10 by units sold, with returns reported separately. Summary imports have
-- no item facts and must show a coverage label in the UI.
select q.menu_item_id, m.name,
  sum(greatest(q.quantity_delta, 0)) as sold_quantity,
  -sum(least(q.quantity_delta, 0)) as refunded_quantity,
  sum(q.quantity_delta) as net_quantity
from public.menu_quantity_events q join public.menu_items m on m.id = q.menu_item_id
where q.sales_date >= $1::date and q.sales_date < $2::date
group by q.menu_item_id, m.name
having sum(greatest(q.quantity_delta, 0)) > 0
order by sold_quantity desc, m.name limit 10;

-- Revenue coverage: sale records only, no negative refund events in denominator.
select sum(case when sales_hour is not null then gross_satang - discount_satang else 0 end)
    / nullif(sum(gross_satang - discount_satang), 0)::numeric as hourly_revenue_coverage,
  sum(case when has_menu_detail then gross_satang - discount_satang else 0 end)
    / nullif(sum(gross_satang - discount_satang), 0)::numeric as menu_revenue_coverage
from public.sales_events
where sales_date >= $1::date and sales_date < $2::date and source_kind <> 'refund';
