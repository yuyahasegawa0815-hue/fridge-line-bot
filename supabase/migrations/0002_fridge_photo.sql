-- 冷蔵庫の中の写真からの登録。レシートと同じ「確認待ち → 登録」の流れを使う。
alter table receipts add column if not exists kind text not null default 'receipt' check (kind in ('receipt', 'fridge'));
-- 写真から見た残量の目安（冷蔵庫の写真のときだけ）
alter table receipt_lines add column if not exists remaining_pct int check (remaining_pct in (25, 50, 100));
