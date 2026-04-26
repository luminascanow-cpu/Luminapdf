create table if not exists public.payment_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_unlocked boolean not null default false,
  last_order_id text,
  last_payment_id text,
  unlocked_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.payment_access enable row level security;

create policy "Users can read own payment access"
on public.payment_access
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.touch_payment_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists payment_access_touch_updated_at on public.payment_access;

create trigger payment_access_touch_updated_at
before update on public.payment_access
for each row
execute function public.touch_payment_access_updated_at();
