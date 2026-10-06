begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);
create temp table catalog_test_results (result text);
grant select, insert on catalog_test_results to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-owner@example.com','',now(),'{}','{}',now(),now()),
('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-member@example.com','',now(),'{}','{}',now(),now()),
('10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','authenticated','authenticated','catalog-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.profiles (id,email,display_name) values
('10000000-0000-4000-8000-000000000010','catalog-owner@example.com','Owner'),
('10000000-0000-4000-8000-000000000020','catalog-member@example.com','Member'),
('10000000-0000-4000-8000-000000000099','catalog-outsider@example.com','Outsider');
insert into public.workspaces (id,name,created_by) values
('10000000-0000-4000-8000-000000000100','Catalog test workspace','10000000-0000-4000-8000-000000000010'),
('10000000-0000-4000-8000-000000000101','Other test workspace','10000000-0000-4000-8000-000000000099');
insert into public.workspace_members (workspace_id,user_id,role) values
('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000010','admin'),
('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000020','member'),
('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000099','admin');
insert into public.companies (id,workspace_id,name,website,created_by) values
('10000000-0000-4000-8000-000000000200','10000000-0000-4000-8000-000000000100','Catalog duplicate','https://example.com','10000000-0000-4000-8000-000000000010'),
('10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000101','Outside company',null,'10000000-0000-4000-8000-000000000099');
insert into public.applications (id,workspace_id,owner_id,company,role,stage) values
('10000000-0000-4000-8000-000000000300','10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000010','Catalog duplicate','Engineer','面试');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000020","role":"authenticated"}';
insert into catalog_test_results select is(public.archive_workspace_company('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000200'), '10000000-0000-4000-8000-000000000200'::uuid, 'ordinary member can remove another member-created shared company');
insert into catalog_test_results select ok((select archived_at is not null from public.companies where id='10000000-0000-4000-8000-000000000200'), 'company is soft deleted');
insert into catalog_test_results select is((select count(*) from public.applications where id='10000000-0000-4000-8000-000000000300'),1::bigint,'another member application is retained');
insert into catalog_test_results select is((select website from public.companies where id='10000000-0000-4000-8000-000000000200'),'https://example.com','historical website is retained');
insert into catalog_test_results select is(public.archive_workspace_company('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000200'), '10000000-0000-4000-8000-000000000200'::uuid, 'repeated deletion is idempotent');
insert into catalog_test_results select is(public.upsert_workspace_company('10000000-0000-4000-8000-000000000100','Catalog duplicate',null), '10000000-0000-4000-8000-000000000200'::uuid, 'editing historical records reuses archived company');
insert into catalog_test_results select ok((select archived_at is not null from public.companies where id='10000000-0000-4000-8000-000000000200'), 'upsert does not resurrect deleted duplicate');
insert into catalog_test_results select is(public.archive_workspace_company('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000201'), null::uuid, 'foreign company ID cannot be modified in current workspace');
insert into catalog_test_results select throws_ok($$select public.archive_workspace_company('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000201')$$, 'P0001', 'Workspace membership required', 'cannot delete from foreign workspace');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000099","role":"authenticated"}';
insert into catalog_test_results select throws_ok($$select public.archive_workspace_company('10000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000200')$$, 'P0001', 'Workspace membership required', 'outsider cannot delete shared company');
reset role;
select result from catalog_test_results union all select * from finish();
rollback;
