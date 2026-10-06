-- Catalog removal is reversible and never deletes members' application records.
alter table public.companies add column if not exists archived_at timestamptz;

create or replace function public.archive_workspace_company(
  target_workspace_id uuid,
  target_company_id uuid
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

  update public.companies
  set archived_at = coalesce(archived_at, now())
  where workspace_id = target_workspace_id and id = target_company_id
  returning id into company_id;

  return company_id;
end;
$$;

revoke all on function public.archive_workspace_company(uuid, uuid) from public;
grant execute on function public.archive_workspace_company(uuid, uuid) to authenticated;

-- upsert_workspace_company intentionally leaves archived_at unchanged:
-- editing an old application must not resurrect a removed duplicate name.
