-- 多言語対応：世帯（グループ／個人トーク）ごとに話す言葉を持つ。null はまだ決まっていない（日本語で話し、最初に話しかけた人の LINE の言語設定に合わせる）。
alter table households add column if not exists language text check (language in ('ja', 'en', 'fr', 'ko', 'zh'));
