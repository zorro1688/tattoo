grant usage on schema public to service_role;

grant select, insert, update, delete on table public.anonymous_clients to service_role;
grant select, insert, update, delete on table public.generations to service_role;
grant select, insert, update, delete on table public.generation_assets to service_role;
grant select, insert, update, delete on table public.credit_events to service_role;
grant select, insert, update, delete on table public.billing_events to service_role;
grant select, insert, update, delete on table public.user_entitlements to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
