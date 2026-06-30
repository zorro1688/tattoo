alter table public.generations
add column if not exists local_generation_id text;

create unique index if not exists generations_local_generation_id_idx
on public.generations(local_generation_id)
where local_generation_id is not null;
