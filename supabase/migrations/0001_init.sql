-- 冷蔵庫管理ツール 初期スキーマ
-- データは「世帯（household）」単位。LINEグループ1つ = 1世帯。

create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  line_group_id text unique not null,
  notify_morning time not null default '08:00',
  notify_evening time not null default '17:00',
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  line_user_id text not null,
  display_name text,
  created_at timestamptz not null default now(),
  unique (household_id, line_user_id)
);

create type storage_place as enum ('fridge', 'freezer', 'pantry');

-- 食材マスタ：一般的な目安日数（購入日からの日数）
create table food_master (
  id serial primary key,
  name text unique not null,
  aliases text[] not null default '{}',
  category text not null,
  default_storage storage_place not null default 'fridge',
  fridge_days int,
  freezer_days int,
  pantry_days int,
  source text not null default 'seed' -- seed | ai
);

create type receipt_status as enum ('draft', 'confirmed');

create table receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid references members(id),
  store_name text,
  purchased_on date not null default current_date,
  total_yen int,
  image_path text,
  status receipt_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  line_no int not null,
  raw_text text not null,
  food_name text,                    -- 正規化した名前（例：鶏むね肉）
  food_master_id int references food_master(id),
  is_food boolean not null default true,
  quantity numeric not null default 1,
  price_yen int,                     -- 値引き後の金額
  confidence real not null default 1, -- 0〜1。低い行を確認画面で強調
  storage storage_place
);

create type item_status as enum ('active', 'used_up', 'discarded');

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  receipt_line_id uuid references receipt_lines(id) on delete set null,
  food_master_id int references food_master(id),
  name text not null,
  storage storage_place not null default 'fridge',
  quantity numeric not null default 1,
  price_yen int,
  purchased_on date not null default current_date,
  expires_on date,
  remaining_pct int not null default 100 check (remaining_pct in (0, 25, 50, 100)),
  status item_status not null default 'active',
  closed_at timestamptz,
  remaining_pct_at_close int,        -- 捨てたときの残量（ロス費 = price_yen × これ / 100）
  created_at timestamptz not null default now()
);
create index on inventory_items (household_id, status, expires_on);

create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  reason text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- すべてサーバー（service role）経由で読み書きする。クライアントから直接は触らせない。
alter table households enable row level security;
alter table members enable row level security;
alter table food_master enable row level security;
alter table receipts enable row level security;
alter table receipt_lines enable row level security;
alter table inventory_items enable row level security;
alter table shopping_list enable row level security;
