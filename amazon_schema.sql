-- ==============================================================
-- Multi‑tenant Amazon Operations schema for Vexim
-- Supports Organization → Client → Seller Account → SKU hierarchy
-- RBAC via Row‑Level Security (RLS) and JWT claims (role, client_id)
-- ==============================================================

-- 1️⃣ Extensions
create extension if not exists "pgcrypto";

-- 2️⃣ Enums
create enum org_role '{"admin","operator","viewer","auditor"}';
create enum marketplace '{"US","EU","JP","DE","UK"}';

-- 3️⃣ Organizations (top‑level tenant)
create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz default timezone('utc'::text, now())
);

-- 4️⃣ Clients (Vexim customers under an org)
create table clients (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations on delete cascade,
    name text not null,
    created_at timestamptz default timezone('utc'::text, now())
);

-- 5️⃣ Seller‑Central accounts (one seller can have several marketplaces)
create table seller_accounts (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients on delete cascade,
    amazon_id text not null,                 -- seller‑central merchant ID
    marketplace marketplace not null,        -- which marketplace this row belongs to
    is_default boolean not null default false,
    created_at timestamptz default timezone('utc'::text, now())
);

-- 6️⃣ Profiles (auth.users + optional role / client assignment)
create table profiles (
    id uuid primary key references auth.users on delete cascade,
    email text not null,
    org_role org_role not null default 'viewer',
    client_id uuid references clients,       -- NULL → org‑wide reports only
    created_at timestamptz default timezone('utc'::text, now())
);

-- 7️⃣ Amazon SKUs (the core unit all modules operate on)
create table amazon_skus (
    id uuid primary key default gen_random_uuid(),
    seller_account_id uuid references seller_accounts on delete cascade,
    asin text not null,                      -- Amazon ASIN (unique per marketplace)
    sku text not null,                       -- internal SKU
    price_cents integer not null,
    cost_cents integer not null,            -- COGS (landed cost)
    created_at timestamptz default timezone('utc'::text, now()),
    updated_at timestamptz default timezone('utc'::text, now())
);

-- 8️⃣ Recommendations (price, reorder, listing) – the decision objects
create table recommendations (
    id uuid primary key default gen_random_uuid(),
    sku_id uuid references amazon_skus on delete cascade,
    recommendation_type text not null
        check (value in ('PRICE','REORDER','LISTING')),
    suggested_value jsonb not null,          -- e.g. { "price_cents": 2999 } or { "qty": 150 }
    margin_before_cents numeric(12,2),
    margin_after_cents numeric(12,2),
    risk_score integer not null check (risk_score between 0 and 100),
    status text not null check (value in ('DRAFT','PENDING_APPROVAL','APPROVED','EXECUTED','FAILED')),
    approved_by uuid references profiles(id),
    approved_at timestamptz,
    executed_at timestamptz,
    execution_error text,
    created_at timestamptz default timezone('utc'::text, now()),
    updated_at timestamptz default timezone('utc'::text, now())
);

-- 9️⃣ Action log (audit trail – append‑only)
create table action_log (
    id uuid primary key default gen_random_uuid(),
    recommendation_id uuid references recommendations on delete set null,
    actor uuid references profiles(id),
    action_type text not null
        check (value in ('APPROVE','REJECT','EXECUTE','UNDO')),
    payload jsonb,                 -- what was sent to Amazon API
    result text not null check (value in ('SUCCESS','FAILURE','PENDING')),
    created_at timestamptz default timezone('utc'::text, now())
);

-- 10️⃣ Row‑Level Security policies (RBAC)

-- --------------------------------------------------------------
-- 7.1 Enable RLS on all tables we care about
-- --------------------------------------------------------------
alter table organizations enable row level security;
alter table clients enable row level security;
alter table seller_accounts enable row level security;
alter table profiles enable row level security;
alter table amazon_skus enable row level security;
alter table recommendations enable row level security;
alter table action_log enable row level security;

-- --------------------------------------------------------------
-- 7.2 Policies – simplified view (full policies can be added later)
-- --------------------------------------------------------------

-- 7.2.1 Organizations – only org admins can see/manage
create policy "orgs_admin_select" on organizations
    using ( exists (select 1 from profiles where id = auth.uid() and org_role = 'admin') );

create policy "orgs_admin_insert" on organizations
    with check ( exists (select 1 from profiles where id = auth.uid() and org_role = 'admin') );

create policy "orgs_admin_update" on organizations
    using ( exists (select 1 from profiles where id = auth.uid() and org_role = 'admin') );

-- 7.2.2 Clients – users can see clients belonging to their org
create policy "clients_select_by_org" on clients
    using ( exists (select 1 from profiles p
                join organizations o on o.id = p.client_id
                where o.id = client_id and p.id = auth.uid()) );

create policy "clients_insert_by_org" on clients
    with check ( exists (select 1 from profiles where id = auth.uid() and org_role = 'admin') );

-- 7.2.3 Seller accounts – users can see only those under their client
create policy "seller_accounts_select_by_client" on seller_accounts
    using ( exists (select 1 from profiles where id = auth.uid() and client_id = seller_accounts.client_id) );

create policy "seller_accounts_insert_by_client" on seller_accounts
    with check ( exists (select 1 from profiles where id = auth.uid() and org_role in ('admin','operator')) );

-- 7.2.4 Profiles – users can read their own row, admins can manage
create policy "profiles_self" on profiles
    using ( id = auth.uid() );

create policy "profiles_admin" on profiles
    using ( exists (select 1 from profiles where id = auth.uid() and org_role = 'admin') );

-- 7.2.5 Amazon SKUs – sellers see only their own SKUs
create policy "skus_select_by_seller" on amazon_skus
    using ( exists (select 1 from seller_accounts sa
                  join profiles p on p.id = auth.uid()
                  where sa.id = amazon_skus.seller_account_id
                  and sa.client_id = p.client_id) );

create policy "skus_insert_by_seller" on amazon_skus
    with check ( exists (select 1 from seller_accounts sa
                     join profiles p on p.id = auth.uid()
                     where sa.id = amazon_skus.seller_account_id
                     and sa.client_id = p.client_id) );

-- 7.2.6 Recommendations – read/write based on role and seller scope
create policy "rec_select_by_scope" on recommendations
    using ( exists (select 1 from amazon_skus sk
                  join seller_accounts sa on sa.id = sk.seller_account_id
                  join profiles p on p.id = auth.uid()
                  where sk.id = recommendations.sku_id
                  and sa.client_id = p.client_id) );

create policy "rec_write_by_operator_or_admin" on recommendations
    using ( exists (select 1 from profiles where id = auth.uid()
                  and org_role in ('admin','operator')) )
    with check ( exists (select 1 from profiles where id = auth.uid()
                  and org_role in ('admin','operator')) );

-- 7.2.7 Action log – read for viewers/auditors, insert by actor only
create policy "action_log_select" on action_log
    using ( exists (select 1 from profiles where id = auth.uid()
                  and org_role in ('admin','viewer','auditor')) );

create policy "action_log_insert" on action_log
    with check ( auth.role() = 'authenticated' );

-- --------------------------------------------------------------
-- 11️⃣ Helper trigger – auto‑set recommendation status based on risk_score
-- --------------------------------------------------------------
create or replace function assign_recommendation_status()
returns trigger as $$
begin
    if new.risk_score <= 30 then
        new.status := 'DRAFT';                     -- operator can auto‑apply
    elsif new.risk_score <= 70 then
        new.status := 'PENDING_APPROVAL';         -- operator approval needed
    else
        new.status := 'PENDING_APPROVAL';         -- admin will approve
    end if;
    return new;
end;
$$ language plpgsql;

create trigger set_recommendation_status
    before insert or update on recommendations
    for each row execute function assign_recommendation_status();