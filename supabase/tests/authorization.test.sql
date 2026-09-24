begin;

select plan(58);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'deadline'
  ),
  'timestamp with time zone',
  'applications deadline stores a timestamp with time zone'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'grantee@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'teammate@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'outsider@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'unverified@example.com', '', null, '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'unverified-bootstrap@example.com', '', null, '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'accepted@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plain-member@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000010', 'owner@example.com', 'Owner'),
  ('00000000-0000-0000-0000-000000000020', 'grantee@example.com', 'Active grantee'),
  ('00000000-0000-0000-0000-000000000030', 'teammate@example.com', 'Ordinary teammate'),
  ('00000000-0000-0000-0000-000000000070', 'plain-member@example.com', 'Plain member'),
  ('00000000-0000-0000-0000-000000000099', 'outsider@example.com', 'Outsider');

insert into public.workspaces (id, name, created_by) values
  ('00000000-0000-0000-0000-000000000100', 'Test workspace', '00000000-0000-0000-0000-000000000010');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'admin'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000020', 'member'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000030', 'member'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000070', 'member');

insert into public.applications (id, workspace_id, owner_id, company, role, stage) values
  ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Original company', 'Engineer', '待投递');

insert into public.edit_grants (id, workspace_id, owner_id, grantee_id, expires_at) values
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030', now() - interval '1 hour');

select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', repeat('c', 121), 'Engineer', '待投递')$$,
  'application company cannot exceed 120 characters'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', repeat('r', 121), '待投递')$$,
  'application role cannot exceed 120 characters'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, location, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', repeat('l', 121), '待投递')$$,
  'application location cannot exceed 120 characters'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, next_step, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', repeat('n', 241), '待投递')$$,
  'application next step cannot exceed 240 characters'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, notes, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', repeat('n', 5001), '待投递')$$,
  'application notes cannot exceed 5000 characters'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, job_url, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', 'javascript:alert(1)', '待投递')$$,
  'javascript application URLs are rejected'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, job_url, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', 'data:text/html,no', '待投递')$$,
  'data application URLs are rejected'
);
select throws_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, job_url, stage)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', 'ftp://example.com', '待投递')$$,
  'ftp application URLs are rejected'
);
select lives_ok(
  $$insert into public.applications (workspace_id, owner_id, company, role, job_url, stage) values
    ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', 'HTTPS://example.com/jobs/1', '待投递'),
    ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Company', 'Engineer', 'http://example.com/jobs/2', '待投递')$$,
  'http and https application URLs are accepted'
);

insert into public.invitations (id, workspace_id, email, invited_by, expires_at, delivered_at) values
  ('00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000000100', 'unverified@example.com', '00000000-0000-0000-0000-000000000010', now() + interval '1 hour', now()),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000100', 'owner@example.com', '00000000-0000-0000-0000-000000000010', now() + interval '1 hour', null),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000100', 'accepted@example.com', '00000000-0000-0000-0000-000000000010', now() + interval '1 hour', now());

select throws_ok(
  $$insert into public.invitations (workspace_id, email, invited_by, status, expires_at, accepted_at)
    values ('00000000-0000-0000-0000-000000000100', 'invalid-accepted-at@example.com', '00000000-0000-0000-0000-000000000010', 'pending', now() + interval '1 hour', now())$$,
  'non-accepted invitations cannot have accepted_at'
);

select throws_ok(
  $$insert into public.invitations (workspace_id, email, invited_by, status, expires_at, accepted_at)
    values ('00000000-0000-0000-0000-000000000100', 'undelivered-accepted@example.com', '00000000-0000-0000-0000-000000000010', 'accepted', now() + interval '1 hour', now())$$,
  'accepted invitations must have been delivered'
);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', true);
select ok(public.is_workspace_member('00000000-0000-0000-0000-000000000100'), 'teammate is a workspace member');
select ok(exists (select 1 from public.applications where owner_id = '00000000-0000-0000-0000-000000000010'), 'teammate can read owner records');
select lives_ok(
  $$select public.upsert_workspace_company(
    '00000000-0000-0000-0000-000000000100',
    'Shared Company',
    'https://shared.example.com'
  )$$,
  'workspace member can add a company to the shared catalog'
);
select is(
  (select website from public.companies where normalized_name = 'shared company'),
  'https://shared.example.com',
  'workspace member can read the shared company website'
);
select lives_ok(
  $$select public.upsert_workspace_company(
    '00000000-0000-0000-0000-000000000100',
    'SHARED COMPANY',
    null
  )$$,
  'same company can be reused without requiring another website'
);
select is(
  (select count(*) from public.companies where normalized_name = 'shared company'),
  1::bigint,
  'company names are unique per workspace regardless of case'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
select ok(not exists (select 1 from public.applications where owner_id = '00000000-0000-0000-0000-000000000010'), 'outsider cannot read owner records');
select ok(not exists (select 1 from public.companies), 'outsider cannot read the shared company catalog');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
select lives_ok(
  $$insert into public.applications (id, workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000220', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Owner insert', 'Engineer', '待投递')$$,
  'owner can insert an application for themselves'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000020', true);
select lives_ok(
  $$insert into public.applications (id, workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Granted insert', 'Engineer', '待投递')$$,
  'active grantee can insert an application for the owner'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000070', true);
select throws_like(
  $$insert into public.applications (id, workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Denied insert', 'Engineer', '待投递')$$,
  'new row violates row-level security policy',
  'ordinary workspace member without a grant cannot insert for the owner'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', true);
select throws_like(
  $$insert into public.applications (id, workspace_id, owner_id, company, role, stage)
    values ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Expired insert', 'Engineer', '待投递')$$,
  'new row violates row-level security policy',
  'expired grantee cannot insert for the owner'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
update public.applications set company = 'Owner edited' where id = '00000000-0000-0000-0000-000000000200';
select is((select company from public.applications where id = '00000000-0000-0000-0000-000000000200'), 'Owner edited', 'owner can edit own records');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', true);
update public.applications set company = 'Ordinary teammate edited' where id = '00000000-0000-0000-0000-000000000200';
select is((select company from public.applications where id = '00000000-0000-0000-0000-000000000200'), 'Owner edited', 'ordinary teammate cannot edit without grant');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000020', true);
update public.applications set company = 'Active grantee edited' where id = '00000000-0000-0000-0000-000000000200';
select is((select company from public.applications where id = '00000000-0000-0000-0000-000000000200'), 'Active grantee edited', 'active grant owner 0010 to grantee 0020 accepted');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', true);
update public.applications set company = 'Expired grantee edited' where id = '00000000-0000-0000-0000-000000000200';
select is((select company from public.applications where id = '00000000-0000-0000-0000-000000000200'), 'Active grantee edited', 'expired grant owner 0010 to grantee 0030 rejected');

delete from public.applications where id = '00000000-0000-0000-0000-000000000200';
select ok(exists (select 1 from public.applications where id = '00000000-0000-0000-0000-000000000200'), 'non-owner current actor cannot delete owner 0010');

select throws_like(
  $$insert into public.edit_grants (workspace_id, owner_id, grantee_id, expires_at)
    values ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', now() + interval '1 hour')$$,
  '%permission denied for table edit_grants%',
  'authenticated clients cannot bypass the atomic grant RPC with a direct insert'
);

select ok(
  (
    select strpos(definition, 'perform pg_advisory_xact_lock')
      < strpos(definition, 'locked_now := clock_timestamp()')
      and strpos(definition, 'locked_now := clock_timestamp()')
        < strpos(definition, 'p_expires_at <= locked_now')
    from pg_proc procedure
    cross join lateral (select pg_get_functiondef(procedure.oid) as definition) source
    where procedure.oid = 'public.create_edit_grant_for(uuid,uuid,timestamp with time zone)'::regprocedure
  ),
  'grant RPC rechecks expiry against wall-clock time after acquiring the pair lock'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
select throws_like(
  $$select public.create_edit_grant_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000020',
    now() + interval '30 days 1 second'
  )$$,
  '%invalid_grant_expiry%',
  'grant RPC rejects expiries beyond 30 days'
);
select throws_like(
  $$select public.create_edit_grant_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000010',
    now() + interval '1 hour'
  )$$,
  '%self_grant_not_allowed%',
  'grant RPC rejects self grants'
);
select throws_like(
  $$select public.create_edit_grant_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000099',
    now() + interval '1 hour'
  )$$,
  '%grant_grantee_is_not_a_workspace_member%',
  'grant RPC rejects a grantee outside the workspace'
);
select lives_ok(
  $$select public.create_edit_grant_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000020',
    now() + interval '7 days'
  )$$,
  'owner replaces an active grant within one RPC transaction'
);
select ok(
  (select revoked_at is not null from public.edit_grants where id = '00000000-0000-0000-0000-000000000210'),
  'replacement transaction revokes the previous active grant'
);
select is(
  (select count(*)::integer from public.edit_grants
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and owner_id = '00000000-0000-0000-0000-000000000010'
      and grantee_id = '00000000-0000-0000-0000-000000000020'
      and revoked_at is null and expires_at > now()),
  1,
  'replacement transaction leaves exactly one active grant for the pair'
);
select ok(
  exists (select 1 from public.edit_grants
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and owner_id = '00000000-0000-0000-0000-000000000010'
      and grantee_id = '00000000-0000-0000-0000-000000000020'
      and revoked_at is null and expires_at > now()),
  'grant RPC always derives the owner from auth uid'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000020', true);
select throws_like(
  format(
    'select public.revoke_edit_grant_for(%L::uuid, %L::uuid)',
    '00000000-0000-0000-0000-000000000100',
    (select id from public.edit_grants
      where owner_id = '00000000-0000-0000-0000-000000000010'
        and grantee_id = '00000000-0000-0000-0000-000000000020'
        and revoked_at is null and expires_at > now())
  ),
  '%grant_not_owned_or_inactive%',
  'a grantee cannot revoke the owner grant'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
select lives_ok(
  format(
    'select public.revoke_edit_grant_for(%L::uuid, %L::uuid)',
    '00000000-0000-0000-0000-000000000100',
    (select id from public.edit_grants
      where owner_id = '00000000-0000-0000-0000-000000000010'
        and grantee_id = '00000000-0000-0000-0000-000000000020'
        and revoked_at is null and expires_at > now())
  ),
  'only the owner can revoke their active grant'
);
select is(
  (select count(*)::integer from public.edit_grants
    where owner_id = '00000000-0000-0000-0000-000000000010'
      and grantee_id = '00000000-0000-0000-0000-000000000020'
      and revoked_at is null and expires_at > now()),
  0,
  'owner revocation leaves no active grant for the pair'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000040', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000040","email":"unverified@example.com","role":"authenticated"}',
  true
);
select throws_like(
  'select public.accept_pending_invitation()',
  'Authenticated email is not verified',
  'unverified account cannot accept an invitation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000010","email":"owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
select throws_like(
  'select public.accept_pending_invitation()',
  'No valid pending invitation exists for this user',
  'undelivered invitation cannot be accepted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000060","email":"accepted@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000060', true);
select lives_ok(
  'select public.accept_pending_invitation()',
  'verified user can accept a delivered pending invitation'
);

reset role;
select ok(
  not exists (
    select 1
    from public.workspace_members
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and user_id = '00000000-0000-0000-0000-000000000040'
  ),
  'unverified account does not gain membership'
);
select is(
  (select status::text from public.invitations where id = '00000000-0000-0000-0000-000000000300'),
  'pending',
  'unverified account invitation remains pending'
);
select ok(
  exists (
    select 1
    from public.workspace_members
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and user_id = '00000000-0000-0000-0000-000000000060'
  ),
  'accepted invitation creates workspace membership'
);
select ok(
  exists (
    select 1
    from public.invitations
    where id = '00000000-0000-0000-0000-000000000304'
      and status = 'accepted'
      and accepted_at is not null
  ),
  'accepted invitation records accepted status and timestamp'
);

set local role service_role;
select throws_like(
  $$select public.create_pending_invitation_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000010',
    'teammate@example.com',
    now() + interval '7 days'
  )$$,
  'existing_workspace_member',
  'existing workspace member is rejected atomically'
);
select ok(
  not exists (
    select 1 from public.invitations
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and email = 'teammate@example.com'
      and status = 'pending'
  ),
  'existing workspace member RPC rejection creates no pending invitation'
);
insert into public.invitations (id, workspace_id, email, invited_by, expires_at, delivered_at) values
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000100', 'retry@example.com', '00000000-0000-0000-0000-000000000010', now() - interval '1 hour', now() - interval '2 hours');
select lives_ok(
  $$select public.create_pending_invitation_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000010',
    'retry@example.com',
    now() + interval '7 days'
  )$$,
  'expired delivered invitation can be replaced'
);
select is(
  (select status::text from public.invitations where id = '00000000-0000-0000-0000-000000000302'),
  'expired',
  'expired pending invitation is transitioned before retry'
);
select ok(
  exists (
    select 1 from public.invitations
    where workspace_id = '00000000-0000-0000-0000-000000000100'
      and email = 'retry@example.com'
      and status = 'pending'
      and delivered_at is null
  ),
  're-invite creates an undelivered pending invitation'
);
insert into public.invitations (id, workspace_id, email, invited_by, expires_at, delivered_at) values
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000100', 'active@example.com', '00000000-0000-0000-0000-000000000010', now() + interval '1 hour', now());
select throws_like(
  $$select public.create_pending_invitation_for(
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000010',
    'active@example.com',
    now() + interval '7 days'
  )$$,
  'active_pending_invitation_exists',
  'active delivered invitation blocks duplicate creation'
);
select throws_like(
  $$select public.bootstrap_workspace_for(
    '00000000-0000-0000-0000-000000000050',
    'unverified-bootstrap@example.com',
    'Unverified bootstrap workspace'
  )$$,
  'Initial user email is not verified',
  'unverified account cannot bootstrap a workspace'
);

reset role;
select ok(
  not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000050'),
  'unverified bootstrap account does not get a profile'
);
select ok(
  not exists (select 1 from public.workspaces where name = 'Unverified bootstrap workspace'),
  'unverified bootstrap account does not create a workspace'
);
select ok(
  not exists (select 1 from public.workspace_members where user_id = '00000000-0000-0000-0000-000000000050'),
  'unverified bootstrap account does not get membership'
);

select * from finish();
rollback;
