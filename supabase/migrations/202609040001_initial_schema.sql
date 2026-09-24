create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('admin', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.application_stage as enum ('待投递', '已投递', '笔试', '面试', 'Offer', '已拒绝', '已放弃');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(btrim(email))),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  invited_by uuid not null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  delivered_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_invited_by_member_fkey
    foreign key (workspace_id, invited_by)
    references public.workspace_members (workspace_id, user_id) on delete restrict,
  constraint invitations_state_consistency check (
    (status = 'accepted') = (accepted_at is not null)
    and (status <> 'accepted' or delivered_at is not null)
  )
);

create unique index invitations_one_pending_email_per_workspace_key
  on public.invitations (workspace_id, email)
  where status = 'pending';
create index invitations_email_status_idx on public.invitations (email, status);

create table public.applications (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  company text not null check (btrim(company) <> ''),
  role text not null check (btrim(role) <> ''),
  location text not null default '',
  stage public.application_stage not null default '待投递',
  applied_on date,
  next_step text not null default '',
  deadline timestamptz,
  job_url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_company_length_check
    check (char_length(btrim(company)) between 1 and 120),
  constraint applications_role_length_check
    check (char_length(btrim(role)) between 1 and 120),
  constraint applications_location_length_check
    check (char_length(location) <= 120),
  constraint applications_next_step_length_check
    check (char_length(next_step) <= 240),
  constraint applications_notes_length_check
    check (char_length(notes) <= 5000),
  constraint applications_job_url_scheme_check
    check (job_url is null or job_url ~* '^https?://'),
  constraint applications_owner_member_fkey
    foreign key (workspace_id, owner_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

create index applications_workspace_owner_stage_deadline_idx
  on public.applications (workspace_id, owner_id, stage, deadline);

create table public.edit_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  grantee_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint edit_grants_distinct_participants check (owner_id <> grantee_id),
  constraint edit_grants_owner_member_fkey
    foreign key (workspace_id, owner_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade,
  constraint edit_grants_grantee_member_fkey
    foreign key (workspace_id, grantee_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

create index edit_grants_active_lookup_idx
  on public.edit_grants (workspace_id, owner_id, grantee_id, expires_at)
  where revoked_at is null;

create function public.set_applications_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.prevent_application_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workspace_id <> old.workspace_id or new.owner_id <> old.owner_id then
    raise exception 'Application workspace and owner cannot be changed';
  end if;
  return new;
end;
$$;

create trigger applications_prevent_identity_change
before update on public.applications
for each row execute function public.prevent_application_identity_change();

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_applications_updated_at();

create function public.is_workspace_member(workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = workspace
      and member.user_id = auth.uid()
  );
$$;

create function public.is_workspace_admin(workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = workspace
      and member.user_id = auth.uid()
      and member.role = 'admin'
  );
$$;

create function public.can_read_owner(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members viewer
    join public.workspace_members record_owner
      on record_owner.workspace_id = viewer.workspace_id
    where viewer.user_id = auth.uid()
      and record_owner.user_id = owner
  );
$$;

create function public.has_active_edit_grant(owner uuid, grantee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select grantee = auth.uid()
    and exists (
      select 1
      from public.edit_grants edit_grant
      where edit_grant.owner_id = owner
        and edit_grant.grantee_id = grantee
        and edit_grant.revoked_at is null
        and edit_grant.expires_at > now()
    );
$$;

create function public.has_active_edit_grant_in_workspace(workspace uuid, owner uuid, grantee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select grantee = auth.uid()
    and exists (
      select 1
      from public.edit_grants edit_grant
      where edit_grant.workspace_id = workspace
        and edit_grant.owner_id = owner
        and edit_grant.grantee_id = grantee
        and edit_grant.revoked_at is null
        and edit_grant.expires_at > now()
    );
$$;

create function public.can_edit_owner(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = owner
    or public.has_active_edit_grant(owner, auth.uid());
$$;

create function public.can_edit_application(workspace uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_workspace_member(workspace)
    and (
      auth.uid() = owner
      or public.has_active_edit_grant_in_workspace(workspace, owner, auth.uid())
    );
$$;

create function public.can_delete_owner(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = owner;
$$;

create function public.create_edit_grant_for(
  p_workspace uuid,
  p_grantee uuid,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  validation_now timestamptz := clock_timestamp();
  locked_now timestamptz;
  created_grant_id uuid;
begin
  if actor is null then
    raise exception 'authenticated_member_required';
  end if;

  if p_grantee = actor then
    raise exception 'self_grant_not_allowed';
  end if;

  if p_expires_at is null
    or p_expires_at <= validation_now
    or p_expires_at > validation_now + interval '30 days' then
    raise exception 'invalid_grant_expiry';
  end if;

  if not exists (
    select 1 from public.workspace_members member
    where member.workspace_id = p_workspace and member.user_id = actor
  ) then
    raise exception 'grant_owner_is_not_a_workspace_member';
  end if;

  if not exists (
    select 1 from public.workspace_members member
    where member.workspace_id = p_workspace and member.user_id = p_grantee
  ) then
    raise exception 'grant_grantee_is_not_a_workspace_member';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_workspace::text || ':' || actor::text || ':' || p_grantee::text, 0)
  );

  locked_now := clock_timestamp();
  if p_expires_at <= locked_now
    or p_expires_at > locked_now + interval '30 days' then
    raise exception 'invalid_grant_expiry';
  end if;

  update public.edit_grants existing_grant
    set revoked_at = locked_now
    where existing_grant.workspace_id = p_workspace
      and existing_grant.owner_id = actor
      and existing_grant.grantee_id = p_grantee
      and existing_grant.revoked_at is null
      and existing_grant.expires_at > locked_now;

  insert into public.edit_grants (
    workspace_id, owner_id, grantee_id, expires_at, created_at
  ) values (
    p_workspace, actor, p_grantee, p_expires_at, locked_now
  ) returning id into created_grant_id;

  return created_grant_id;
end;
$$;

create function public.revoke_edit_grant_for(workspace uuid, grant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  revoked_grant_id uuid;
begin
  if actor is null then
    raise exception 'authenticated_member_required';
  end if;

  update public.edit_grants owned_grant
    set revoked_at = statement_timestamp()
    where owned_grant.id = grant_id
      and owned_grant.workspace_id = workspace
      and owned_grant.owner_id = actor
      and owned_grant.revoked_at is null
    returning id into revoked_grant_id;

  if revoked_grant_id is null then
    raise exception 'grant_not_owned_or_inactive';
  end if;

  return revoked_grant_id;
end;
$$;

revoke all on function public.set_applications_updated_at() from public;
revoke all on function public.prevent_application_identity_change() from public;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_admin(uuid) from public;
revoke all on function public.can_read_owner(uuid) from public;
revoke all on function public.has_active_edit_grant(uuid, uuid) from public;
revoke all on function public.has_active_edit_grant_in_workspace(uuid, uuid, uuid) from public;
revoke all on function public.can_edit_owner(uuid) from public;
revoke all on function public.can_edit_application(uuid, uuid) from public;
revoke all on function public.can_delete_owner(uuid) from public;
revoke all on function public.create_edit_grant_for(uuid, uuid, timestamptz) from public;
revoke all on function public.revoke_edit_grant_for(uuid, uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_admin(uuid) to authenticated, service_role;
grant execute on function public.can_read_owner(uuid) to authenticated, service_role;
grant execute on function public.has_active_edit_grant(uuid, uuid) to service_role;
grant execute on function public.has_active_edit_grant_in_workspace(uuid, uuid, uuid) to service_role;
grant execute on function public.can_edit_owner(uuid) to service_role;
grant execute on function public.can_edit_application(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_delete_owner(uuid) to authenticated, service_role;
grant execute on function public.create_edit_grant_for(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.revoke_edit_grant_for(uuid, uuid) to authenticated, service_role;

revoke all on table public.profiles, public.workspaces, public.workspace_members,
  public.invitations, public.applications, public.edit_grants from anon;
grant select on table public.profiles, public.workspaces, public.workspace_members to authenticated;
grant select, insert, update, delete on table public.invitations, public.applications to authenticated;
grant select on table public.edit_grants to authenticated;
grant all privileges on table public.profiles, public.workspaces, public.workspace_members,
  public.invitations, public.applications, public.edit_grants to service_role;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations enable row level security;
alter table public.applications enable row level security;
alter table public.edit_grants enable row level security;

create policy "workspace members can read related profiles"
on public.profiles for select to authenticated
using (id = auth.uid() or public.can_read_owner(id));

create policy "members can read workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "members can read workspace membership"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "admins can read invitations"
on public.invitations for select to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "admins can create invitations"
on public.invitations for insert to authenticated
with check (public.is_workspace_admin(workspace_id));

create policy "admins can update invitations"
on public.invitations for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "admins can delete invitations"
on public.invitations for delete to authenticated
using (public.is_workspace_admin(workspace_id));

create policy "workspace members can read applications"
on public.applications for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "owners and active grantees can create applications"
on public.applications for insert to authenticated
with check (public.can_edit_application(workspace_id, owner_id));

create policy "owners and active grantees can update applications"
on public.applications for update to authenticated
using (public.can_edit_application(workspace_id, owner_id))
with check (public.can_edit_application(workspace_id, owner_id));

create policy "owners can delete applications"
on public.applications for delete to authenticated
using (public.can_delete_owner(owner_id));

create policy "grant participants can read grants"
on public.edit_grants for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (owner_id = auth.uid() or grantee_id = auth.uid())
);

create policy "owners can issue grants"
on public.edit_grants for insert to authenticated
with check (
  owner_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

create policy "owners can update grants they issued"
on public.edit_grants for update to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

create policy "owners can delete grants they issued"
on public.edit_grants for delete to authenticated
using (owner_id = auth.uid());

create function public.accept_pending_invitation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitations%rowtype;
  candidate_invitation_id uuid;
  candidate_workspace_id uuid;
  current_user_id uuid := auth.uid();
  claim_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  account_email text;
  account_email_confirmed_at timestamptz;
begin
  if current_user_id is null or claim_email = '' then
    raise exception 'A signed-in user with an email claim is required';
  end if;

  select lower(btrim(email)), email_confirmed_at
    into account_email, account_email_confirmed_at
    from auth.users
    where id = current_user_id;

  if account_email is null or account_email <> claim_email then
    raise exception 'Authenticated email does not match the user account';
  end if;

  if account_email_confirmed_at is null then
    raise exception 'Authenticated email is not verified';
  end if;

  select id, workspace_id
    into candidate_invitation_id, candidate_workspace_id
    from public.invitations
    where email = claim_email
      and status = 'pending'
      and delivered_at is not null
      and expires_at > now()
    order by created_at
    limit 1;

  if not found then
    raise exception 'No valid pending invitation exists for this user';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(candidate_workspace_id::text || ':' || claim_email, 0)
  );

  select *
    into invitation
    from public.invitations
    where id = candidate_invitation_id
      and workspace_id = candidate_workspace_id
      and email = claim_email
      and status = 'pending'
      and delivered_at is not null
      and expires_at > now()
    for update;

  if not found then
    raise exception 'No valid pending invitation exists for this user';
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    current_user_id,
    account_email,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), split_part(account_email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invitation.workspace_id, current_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

create function public.create_pending_invitation_for(
  workspace uuid,
  inviter uuid,
  invited_email text,
  invite_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_workspace_id uuid := workspace;
  requested_inviter_id uuid := inviter;
  normalized_email text := lower(btrim(invited_email));
  invitation_id uuid;
begin
  if normalized_email = ''
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'invalid_invitation_email';
  end if;

  if invite_expires_at <= now()
    or invite_expires_at > now() + interval '14 days' then
    raise exception 'invalid_invitation_expiry';
  end if;

  if not exists (
    select 1
    from public.workspace_members member
    join auth.users account on account.id = member.user_id
    where member.workspace_id = requested_workspace_id
      and member.user_id = requested_inviter_id
      and member.role = 'admin'
      and account.email_confirmed_at is not null
  ) then
    raise exception 'inviter_is_not_a_verified_workspace_admin';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(requested_workspace_id::text || ':' || normalized_email, 0)
  );

  if exists (
    select 1
    from public.profiles profile
    join public.workspace_members member on member.user_id = profile.id
    where member.workspace_id = requested_workspace_id
      and profile.email = normalized_email
  ) then
    raise exception 'existing_workspace_member';
  end if;

  update public.invitations
    set status = 'expired', accepted_at = null
    where workspace_id = requested_workspace_id
      and email = normalized_email
      and status = 'pending'
      and expires_at <= now();

  update public.invitations
    set status = 'revoked', accepted_at = null
    where workspace_id = requested_workspace_id
      and email = normalized_email
      and status = 'pending'
      and delivered_at is null
      and created_at <= now() - interval '5 minutes';

  if exists (
    select 1
    from public.invitations
    where workspace_id = requested_workspace_id
      and email = normalized_email
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'active_pending_invitation_exists';
  end if;

  insert into public.invitations (
    workspace_id, invited_by, email, status, expires_at, delivered_at
  ) values (
    requested_workspace_id, requested_inviter_id, normalized_email, 'pending', invite_expires_at, null
  ) returning id into invitation_id;

  return invitation_id;
end;
$$;

create function public.bootstrap_workspace_for(
  initial_user_id uuid,
  initial_email text,
  workspace_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_email text;
  account_email_confirmed_at timestamptz;
  normalized_email text := lower(btrim(initial_email));
  new_workspace_id uuid;
begin
  if normalized_email = '' or btrim(workspace_name) = '' then
    raise exception 'Email and workspace name are required';
  end if;

  select lower(btrim(email)), email_confirmed_at
    into account_email, account_email_confirmed_at
    from auth.users
    where id = initial_user_id;

  if account_email is null or account_email <> normalized_email then
    raise exception 'Initial user and email must match an authenticated user';
  end if;

  if account_email_confirmed_at is null then
    raise exception 'Initial user email is not verified';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.bootstrap_workspace_for'));

  if exists (select 1 from public.workspaces) then
    raise exception 'The initial workspace has already been created';
  end if;

  insert into public.profiles (id, email, display_name)
  values (initial_user_id, account_email, split_part(account_email, '@', 1))
  on conflict (id) do update
    set email = excluded.email;

  insert into public.workspaces (name, created_by)
  values (btrim(workspace_name), initial_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, initial_user_id, 'admin');

  return new_workspace_id;
end;
$$;

revoke all on function public.accept_pending_invitation() from public, anon;
revoke all on function public.bootstrap_workspace_for(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_pending_invitation_for(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.accept_pending_invitation() to authenticated, service_role;
grant execute on function public.bootstrap_workspace_for(uuid, text, text) to service_role;
grant execute on function public.create_pending_invitation_for(uuid, uuid, text, timestamptz) to service_role;
