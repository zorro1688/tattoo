create or replace function inkfirst_private.apply_credit_event_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.credits_delta <= 0 then
    return new;
  end if;

  if new.owner_user_id is not null then
    insert into public.user_entitlements (
      user_id,
      paid_credits_remaining,
      high_resolution_downloads_unlocked,
      active_plan
    ) values (
      new.owner_user_id,
      new.credits_delta,
      new.high_resolution_unlocked,
      new.plan
    )
    on conflict (user_id) do update set
      paid_credits_remaining = public.user_entitlements.paid_credits_remaining + excluded.paid_credits_remaining,
      high_resolution_downloads_unlocked = public.user_entitlements.high_resolution_downloads_unlocked or excluded.high_resolution_downloads_unlocked,
      active_plan = excluded.active_plan;
  elsif new.anonymous_client_id is not null then
    insert into public.anonymous_clients (
      id,
      paid_credits_remaining,
      high_resolution_downloads_unlocked
    ) values (
      new.anonymous_client_id,
      new.credits_delta,
      new.high_resolution_unlocked
    )
    on conflict (id) do update set
      paid_credits_remaining = public.anonymous_clients.paid_credits_remaining + excluded.paid_credits_remaining,
      high_resolution_downloads_unlocked = public.anonymous_clients.high_resolution_downloads_unlocked or excluded.high_resolution_downloads_unlocked;
  end if;

  return new;
end;
$$;

drop trigger if exists credit_events_apply_entitlement on public.credit_events;
create trigger credit_events_apply_entitlement
after insert on public.credit_events
for each row execute function inkfirst_private.apply_credit_event_entitlement();
