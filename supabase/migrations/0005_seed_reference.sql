-- ============================================================================
-- 0005_seed_reference.sql — platform defaults & guardrail thresholds
-- Run after creating an organization; replace :org_id or use the SQL editor.
-- ============================================================================

-- Guardrails configurable by admin (spec §5.6):
--  min_clicks_for_recommendation : recommendation needs at least N clicks
--  acos_alert_threshold          : ACOS above this raises an anomaly
--  budget_utilization_alert      : campaign spend vs budget alert ratio
--  daily_budget_approval_limit   : max budget increase without extra approval
--  bid_min / bid_max             : hard bid guardrails
--  data_freshness_max_days       : sources older than N days are flagged stale
insert into public.platform_settings (organization_id, key, value, description)
values
  ('00000000-0000-0000-0000-000000000001', 'min_clicks_for_recommendation', '10',
   'Số click tối thiểu để một search term/campaign đủ điều kiện tạo recommendation'),
  ('00000000-0000-0000-0000-000000000001', 'acos_alert_threshold', '0.35',
   'Ngưỡng ACOS vượt mức cần cảnh báo'),
  ('00000000-0000-0000-0000-000000000001', 'budget_utilization_alert', '0.9',
   'Tỷ lệ dùng ngân sách để cảnh báo campaign sắp hết budget'),
  ('00000000-0000-0000-0000-000000000001', 'daily_budget_approval_limit', '50',
   'Mức tăng ngân sách hàng ngày (USD) cần approval'),
  ('00000000-0000-0000-0000-000000000001', 'bid_min', '0.35',
   'Giới hạn dưới bid (USD) — guardrail cứng'),
  ('00000000-0000-0000-0000-000000000001', 'bid_max', '9.99',
   'Giới hạn trên bid (USD) — guardrail cứng'),
  ('00000000-0000-0000-0000-000000000001', 'data_freshness_max_days', '7',
   'Số ngày tối đa kể từ khi source data được capture trước khi gắn nhãn cũ')
on conflict (organization_id, key) do nothing;
