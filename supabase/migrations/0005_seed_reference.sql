-- ============================================================================
-- 0005_seed_reference.sql — guardrail defaults + bootstrap helper
--
-- Tự chứa & IDEMPOTENT (chạy lại bao nhiêu lần cũng an toàn):
--   1. Tạo organization mặc định nếu bảng organizations đang TRỐNG
--      (nếu bạn đã tự tạo org thì dùng org đó, không tạo trùng)
--   2. Gắn guardrail settings (spec §5.6) cho MỌI organization hiện có
--   3. Cài hàm bootstrap_first_user() — sau khi tạo user trong
--      Authentication → Users, chạy:
--        select public.bootstrap_first_user();
--      để user đầu tiên thành OWNER + có client đầu tiên + full access.
-- ============================================================================

-- 1) Organization mặc định — chỉ tạo khi chưa có tổ chức nào
insert into public.organizations (name, status)
select 'Amazon Ops (Default)', 'active'
where not exists (select 1 from public.organizations);

-- 2) Guardrail defaults cho mọi organization (spec §5.6, admin chỉnh được sau)
insert into public.platform_settings (organization_id, key, value, description)
select o.id, v.key, v.value, v.description
from public.organizations o
cross join (values
  ('min_clicks_for_recommendation', '10'::jsonb,   'Số click tối thiểu để một search term/campaign đủ điều kiện tạo recommendation'),
  ('acos_alert_threshold',          '0.35'::jsonb, 'Ngưỡng ACOS vượt mức cần cảnh báo'),
  ('budget_utilization_alert',      '0.9'::jsonb,  'Tỷ lệ dùng ngân sách để cảnh báo campaign sắp hết budget'),
  ('daily_budget_approval_limit',   '50'::jsonb,   'Mức tăng ngân sách hàng ngày (USD) cần approval'),
  ('bid_min',                       '0.35'::jsonb, 'Giới hạn dưới bid (USD) — guardrail cứng'),
  ('bid_max',                       '9.99'::jsonb, 'Giới hạn trên bid (USD) — guardrail cứng'),
  ('data_freshness_max_days',       '7'::jsonb,    'Số ngày tối đa kể từ khi source data được capture trước khi gắn nhãn cũ')
) as v(key, value, description)
on conflict (organization_id, key) do nothing;

-- 3) Bootstrap helper ---------------------------------------------------------
--    Dùng MỘT LẦN khi setup: user đầu tiên trong Authentication sẽ trở thành
--    owner của organization, được cấp full access client đầu tiên.
--    Sau đó hãy thêm thành viên mới qua Settings / SQL thông thường.

create or replace function public.bootstrap_first_user(client_name text default 'Client đầu tiên')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
  v_client_id uuid;
begin
  -- Organization: dùng org cũ nhất, tạo mới nếu trống
  select id into v_org_id from public.organizations order by created_at asc limit 1;
  if v_org_id is null then
    insert into public.organizations (name, status)
    values ('Amazon Ops (Default)', 'active')
    returning id into v_org_id;
  end if;

  -- User: auth user cũ nhất (user đầu tiên bạn tạo trong dashboard)
  select u.id,
         u.email,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.email, 'Owner')
    into v_user_id, v_user_email, v_user_name
  from auth.users u
  order by u.created_at asc
  limit 1;

  if v_user_id is null then
    return 'CHUA SAN SANG: chua co user nao trong Authentication → Users. ' ||
           'Tao user (email + password) roi chay lai: select public.bootstrap_first_user();';
  end if;

  -- Profile (thường đã có nhờ trigger on_auth_user_created; tạo bù nếu thiếu)
  insert into public.profiles (id, full_name, email, status)
  values (v_user_id, v_user_name, v_user_email, 'active')
  on conflict (id) do nothing;

  -- Owner membership (chạy lại thì kích hoạt lại membership)
  insert into public.organization_members (organization_id, user_id, role, department, status)
  values (v_org_id, v_user_id, 'owner', 'management', 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', role = 'owner';

  -- Client đầu tiên: dùng client cũ nhất nếu đã có
  if exists (select 1 from public.client_accounts) then
    select id into v_client_id from public.client_accounts order by created_at asc limit 1;
  else
    insert into public.client_accounts (organization_id, name, status, marketplace, owner_user_id)
    values (v_org_id, client_name, 'onboarding', 'US', v_user_id)
    returning id into v_client_id;
  end if;

  -- Full access vào client
  insert into public.user_client_access (user_id, client_account_id, access_level, allowed_departments)
  values (v_user_id, v_client_id, 'full', '{}')
  on conflict (user_id, client_account_id) do nothing;

  return format(
    'OK: user %s bay gio la OWNER cua org %s va co full access client %s. ' ||
    'Dang nhap app bang email/password de bat dau.',
    v_user_email, v_org_id, v_client_id
  );
end;
$$;

-- Hàm này có quyền gán role owner — không cho API roles gọi
revoke execute on function public.bootstrap_first_user(text) from public, anon, authenticated;
