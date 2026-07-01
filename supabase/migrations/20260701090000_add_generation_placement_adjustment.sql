alter table public.generations
add column if not exists placement_adjustment jsonb;
