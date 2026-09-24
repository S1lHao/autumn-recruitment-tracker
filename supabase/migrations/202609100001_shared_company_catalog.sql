create table if not exists public.companies (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  website text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_length_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint companies_website_scheme_check
    check (website is null or website ~* '^https?://'),
  constraint companies_workspace_name_key unique (workspace_id, normalized_name)
);

create index if not exists companies_workspace_name_idx
  on public.companies (workspace_id, name);

create or replace function public.set_companies_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_companies_updated_at();

create or replace function public.prevent_company_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id
    or new.workspace_id <> old.workspace_id
    or new.created_by <> old.created_by then
    raise exception 'Company identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_prevent_identity_change on public.companies;
create trigger companies_prevent_identity_change
before update on public.companies
for each row execute function public.prevent_company_identity_change();

alter table public.companies enable row level security;

drop policy if exists "workspace members can read companies" on public.companies;
create policy "workspace members can read companies"
on public.companies for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create companies" on public.companies;
create policy "workspace members can create companies"
on public.companies for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "workspace members can update companies" on public.companies;
create policy "workspace members can update companies"
on public.companies for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

revoke all on table public.companies from anon;
grant select, insert, update on table public.companies to authenticated;
grant all privileges on table public.companies to service_role;

insert into public.companies (workspace_id, name, created_by)
select distinct on (application.workspace_id, lower(btrim(application.company)))
  application.workspace_id,
  btrim(application.company),
  application.owner_id
from public.applications application
order by application.workspace_id, lower(btrim(application.company)), application.updated_at desc
on conflict (workspace_id, normalized_name) do nothing;

create or replace function public.upsert_workspace_company(
  target_workspace_id uuid,
  company_name text,
  company_website text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  company_id uuid;
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace membership required';
  end if;

  insert into public.companies (workspace_id, name, website, created_by)
  values (
    target_workspace_id,
    btrim(company_name),
    nullif(btrim(company_website), ''),
    auth.uid()
  )
  on conflict (workspace_id, normalized_name) do update
  set website = coalesce(excluded.website, companies.website)
  returning id into company_id;

  return company_id;
end;
$$;

revoke all on function public.set_companies_updated_at() from public;
revoke all on function public.prevent_company_identity_change() from public;
revoke all on function public.upsert_workspace_company(uuid, text, text) from public;
grant execute on function public.upsert_workspace_company(uuid, text, text) to authenticated, service_role;
