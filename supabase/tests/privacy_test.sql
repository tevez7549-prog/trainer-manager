\set ON_ERROR_STOP 1
-- people: 01 owner, 02 admin, 03 operator, 04 trainer1, 05 trainer2, 06 client1, 07 client2, 08 outsider, 09 superadmin
insert into auth.users(id,email,phone,raw_user_meta_data) select ('00000000-0000-0000-0000-0000000000'||lpad(i::text,2,'0'))::uuid, 'u'||i||'@t.test', '08100000'||lpad(i::text,2,'0'), jsonb_build_object('display_name','user'||i) from generate_series(1,9) i;
update profiles set is_super_admin=true where id='00000000-0000-0000-0000-000000000009';
select uid, display_name, phone_norm from profiles order by uid limit 3;

create function pg_temp.as_user(n int) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'), false); end $$;

-- owner creates gym (closed Sundays)
select pg_temp.as_user(1); set role authenticated;
insert into gyms(id,name,closed_weekdays,walkin_price,created_by) values ('aaaaaaaa-0000-0000-0000-000000000001','FitLab','{0}',100,'00000000-0000-0000-0000-000000000001');
insert into gym_staff(gym_id,user_id,role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','admin'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','operator'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','trainer'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','trainer');
reset role;

-- operator registers members (one no-app with a phone that signs up later)
select pg_temp.as_user(3); set role authenticated;
insert into members(gym_id,profile_id,name,phone) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','client1','0810000006'),
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','client2','0810000007'),
 ('aaaaaaaa-0000-0000-0000-000000000001',null,'noapp','089-777-0000');
insert into memberships(member_id,gym_id,plan_name,start_date,end_date,price,pay_method,sold_by)
 select id, gym_id, '1 เดือน', '2026-10-12', calc_end_date(gym_id,'2026-10-12',1), 1200, 'cash', auth.uid() from members where name='client1';
insert into checkins(gym_id,member_id,by_staff,client_ref) select gym_id,id,auth.uid(),'bbbbbbbb-0000-0000-0000-000000000001' from members where name='client1';
reset role;
select 'calc_end_date 1 month from Mon 12 Oct, Sundays closed =', end_date from memberships;
-- offline double sync is rejected
select pg_temp.as_user(3); set role authenticated;
do $$ begin insert into checkins(gym_id,member_id,client_ref) select gym_id,id,'bbbbbbbb-0000-0000-0000-000000000001' from members where name='client1'; raise notice 'FAIL duplicate accepted'; exception when unique_violation then raise notice 'OK duplicate offline check-in rejected'; end $$;
reset role;

-- trainers link their trainees, client meals
select pg_temp.as_user(1); set role authenticated; -- owner assigns client1 to trainer1
insert into trainer_clients(id,trainer_id,client_id,member_id,gym_id) select 'cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006',id,gym_id from members where name='client1';
reset role;
select pg_temp.as_user(5); set role authenticated;
insert into trainer_clients(id,trainer_id,client_id,gym_id) values ('cccccccc-0000-0000-0000-000000000002',auth.uid(),'00000000-0000-0000-0000-000000000007','aaaaaaaa-0000-0000-0000-000000000001');
reset role;
select pg_temp.as_user(6); set role authenticated;
insert into meals(user_id,name) values (auth.uid(),'มื้อเช้า'); insert into progress_photos(user_id,angle,storage_path) values (auth.uid(),'front','x');
reset role;
select pg_temp.as_user(7); set role authenticated;
insert into meals(user_id,name) values (auth.uid(),'มื้อเช้า');
reset role;

-- who sees what
create temp table res(who text, meals int, photos int, members int, profiles int, appts int);
grant all on res to authenticated;
do $$ declare n int; lbl text[] := array['owner','admin','operator','trainer1','trainer2','client1','client2','outsider','superadmin']; begin
 for n in 1..9 loop
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'),false);
  execute 'set local role authenticated';
  insert into res select lbl[n],(select count(*) from meals),(select count(*) from progress_photos),(select count(*) from members),(select count(*) from profiles),(select count(*) from trainer_clients);
  execute 'reset role';
 end loop; end $$;
select * from res;

-- PT package + ledger
select pg_temp.as_user(4); set role authenticated;
insert into pt_packages(id,trainer_client_id,gym_id,label,sessions_total,end_date,price,sold_by) values ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','10 ครั้ง',10,'2026-12-31',8000,auth.uid());
insert into pt_package_ledger(package_id,delta,kind,by_user) values ('dddddddd-0000-0000-0000-000000000001',-1,'session',auth.uid());
do $$ begin insert into pt_package_ledger(package_id,delta,kind,by_user) values ('dddddddd-0000-0000-0000-000000000001',2,'bonus',auth.uid()); raise notice 'FAIL bonus without reason'; exception when check_violation then raise notice 'OK manual edit without reason rejected'; end $$;
insert into pt_package_ledger(package_id,delta,kind,reason,by_user) values ('dddddddd-0000-0000-0000-000000000001',1,'bonus','แถมวันเกิด',auth.uid());
select 'sessions_left (10 -1 +1) =', sessions_left from pt_package_status;
reset role;
select pg_temp.as_user(5); set role authenticated;
do $$ begin insert into pt_package_ledger(package_id,delta,kind,by_user) values ('dddddddd-0000-0000-0000-000000000001',-1,'session',auth.uid()); raise notice 'FAIL trainer2 cut trainer1 package'; exception when insufficient_privilege then raise notice 'OK trainer2 cannot touch trainer1 package'; end $$;
reset role;

-- client cannot make themselves super admin
select pg_temp.as_user(6); set role authenticated;
do $$ begin update profiles set is_super_admin=true where id=auth.uid(); raise notice 'FAIL self-promote'; exception when others then raise notice 'OK self-promote blocked: %', sqlerrm; end $$;
reset role;

-- trainer removes trainee like unfriending → loses access, account stays
select pg_temp.as_user(4); set role authenticated;
update trainer_clients set status='removed', removed_at=now() where id='cccccccc-0000-0000-0000-000000000001';
select 'trainer1 meals after removing client1 =', count(*) from meals;
reset role;
select 'client1 profile still exists =', count(*) from profiles where id='00000000-0000-0000-0000-000000000006';

-- no-app member links when they sign up with the same phone
insert into auth.users(id,email,phone) values ('00000000-0000-0000-0000-000000000010','new@t.test','66897770000');
select 'noapp member linked =', profile_id is not null from members where name='noapp';

-- member status view as operator
select pg_temp.as_user(3); set role authenticated;
select name, status, end_date from member_status order by name;
reset role;

-- holiday 31 Dec - 2 Jan pushes expiry by open days
select pg_temp.as_user(1); set role authenticated;
insert into gym_holidays(id,gym_id,name,start_date,end_date) values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','ปีใหม่','2026-11-01','2026-11-03');
select 'holiday applied to memberships =', apply_holiday('eeeeeeee-0000-0000-0000-000000000001');
select 'new end date =', end_date from memberships;
reset role;

-- phone normalisation
select norm_phone('081-234-5678') a, norm_phone('+66 81 234 5678') b, norm_phone('0044 20 7946 0000') c, norm_phone('020 7946 0000','44') d, norm_phone('') e;
select name, phone, phone_norm from members order by name;
