-- Таблиця для збереження даних планера (один користувач)
-- Виконайте цей SQL у Supabase → SQL Editor

create table if not exists planner_store (
  id text primary key default 'main',
  theme jsonb not null default '{"bg": "#1B2027"}'::jsonb,
  months jsonb not null default '{}'::jsonb,
  recurring jsonb not null default '[]'::jsonb,
  recurring_done jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Міграція для існуючої таблиці
alter table planner_store add column if not exists recurring jsonb not null default '[]'::jsonb;
alter table planner_store add column if not exists recurring_done jsonb not null default '{}'::jsonb;
alter table planner_store add column if not exists updated_at timestamptz not null default now();

-- Початковий запис
insert into planner_store (id, theme, months)
values ('main', '{"bg": "#1B2027"}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- RLS (безпечно перезапускати)
alter table planner_store enable row level security;

drop policy if exists "Allow anon read planner_store" on planner_store;
drop policy if exists "Allow anon update planner_store" on planner_store;
drop policy if exists "Allow anon insert planner_store" on planner_store;

create policy "Allow anon read planner_store"
  on planner_store for select
  to anon
  using (true);

create policy "Allow anon update planner_store"
  on planner_store for update
  to anon
  using (true)
  with check (true);

create policy "Allow anon insert planner_store"
  on planner_store for insert
  to anon
  with check (true);
