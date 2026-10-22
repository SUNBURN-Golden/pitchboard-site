-- Pitchboard members: one row per signed-in user (Google sign-in only).
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  newsletter_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.members enable row level security;

create policy "members read own" on public.members
  for select to authenticated using ((select auth.uid()) = id);
create policy "members insert own" on public.members
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "members update own" on public.members
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Email always comes from the auth record, never from the browser.
create or replace function public.members_set_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.id);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists members_set_email on public.members;
create trigger members_set_email before insert or update on public.members
  for each row execute function public.members_set_email();

revoke all on public.members from anon;
grant select, insert, update on public.members to authenticated;
