-- Rayons database. Run once in Supabase → SQL Editor (it is safe to run again).
--
-- Mail and events stay in Google. This holds what Google can't: projects, their notes and
-- uploaded files, and the Google account connection (tokens encrypted, server-only).

create extension if not exists pgcrypto;

-- Projects --------------------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Rolled up from the project's mail and events by the server; never set by hand.
  tags text[] not null default '{}',
  unread_count integer not null default 0,
  -- The Gmail label "Rayons/Projects/<name>" that marks this project's conversations.
  gmail_label_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

drop policy if exists "Projects are private" on public.projects;
create policy "Projects are private" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Files uploaded to a project. Mail attachments are read from Gmail and not copied here.

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  size bigint not null,
  mime_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_id_idx on public.project_files (project_id);

alter table public.project_files enable row level security;

drop policy if exists "Files are private" on public.project_files;
create policy "Files are private" on public.project_files
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- A project is "recently active" when you change it, or when the server says mail or an event
-- joined it (by setting updated_at itself). Refreshed counts and tags don't count.
create or replace function public.touch_project() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at is not distinct from old.updated_at
     and (new.name, new.notes, new.status) is distinct from (old.name, old.notes, old.status) then
    new.updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_project();

-- Google accounts --------------------------------------------------------------------------------
-- The browser may read which account is connected (to show it); only the server writes.

create table if not exists public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_sub text not null unique,
  email text not null,
  name text,
  picture text,
  scopes text[] not null default '{}',
  -- Gmail label ids for the four tags: {"admin": "Label_12", …}
  tag_labels jsonb not null default '{}',
  -- 'reconnect' when Google refused the stored token (revoked access, changed password…).
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_accounts_user_id_idx on public.google_accounts (user_id);

alter table public.google_accounts enable row level security;

drop policy if exists "See your own Google account" on public.google_accounts;
create policy "See your own Google account" on public.google_accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists google_accounts_touch on public.google_accounts;
create trigger google_accounts_touch before update on public.google_accounts
  for each row execute function public.touch_updated_at();

-- Tokens, encrypted with TOKEN_ENCRYPTION_KEY by the api/ functions. No policies: only the
-- server's secret key can read or write this table.

create table if not exists public.google_tokens (
  account_id uuid primary key references public.google_accounts on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz
);

alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;

-- Contacts: people you can write to. Imported from Google Contacts, or remembered from mail
-- you opened ("seen") and wrote ("sent"), so typing a name in To finds them. Forgetting one
-- hides it; writing to them again brings it back.

create table if not exists public.contacts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  email text not null check (email = lower(email)),
  name text not null default '',
  source text not null default 'mail' check (source in ('google', 'mail')),
  photo_url text,
  sent_count integer not null default 0,
  seen_count integer not null default 0,
  last_seen timestamptz not null default now(),
  hidden boolean not null default false,
  primary key (user_id, email)
);

alter table public.contacts enable row level security;

drop policy if exists "Your own contacts" on public.contacts;
create policy "Your own contacts" on public.contacts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Adds or counts people in one call. Runs as the caller, so row-level security applies.
create or replace function public.remember_contacts(people jsonb, sent boolean default false)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.contacts as c (user_id, email, name, sent_count, seen_count, last_seen)
  select distinct on (lower(p->>'email'))
    auth.uid(), lower(p->>'email'), coalesce(p->>'name', ''), case when sent then 1 else 0 end, case when sent then 0 else 1 end, now()
  from jsonb_array_elements(people) as p
  where lower(p->>'email') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  order by lower(p->>'email')
  on conflict (user_id, email) do update set
    name = case when excluded.name <> '' and c.source = 'mail' then excluded.name else c.name end,
    sent_count = c.sent_count + excluded.sent_count,
    seen_count = c.seen_count + excluded.seen_count,
    last_seen = now(),
    hidden = c.hidden and not sent;
$$;

revoke all on function public.remember_contacts(jsonb, boolean) from public, anon;
grant execute on function public.remember_contacts(jsonb, boolean) to authenticated;

-- Grants ----------------------------------------------------------------------------------------
-- Newer Supabase projects don't grant table access automatically. Grant exactly what's needed;
-- row-level security still limits signed-in people to their own rows.

revoke all on public.projects, public.project_files, public.google_accounts, public.google_tokens, public.contacts from anon, authenticated;
grant select, insert, update, delete on public.projects, public.project_files, public.contacts to authenticated;
grant select on public.google_accounts to authenticated;
grant select, insert, update, delete on public.projects, public.project_files, public.google_accounts, public.google_tokens, public.contacts to service_role;

-- Storage: a private bucket, one folder per person ("<user id>/<project id>/<file>"). --------

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "Project files: read own" on storage.objects;
create policy "Project files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Project files: add own" on storage.objects;
create policy "Project files: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Project files: delete own" on storage.objects;
create policy "Project files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
