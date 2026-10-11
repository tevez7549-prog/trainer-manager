-- Deleting an account keeps the records that person made (sales, check-ins, appointments ...);
-- only the "who did it" column becomes empty. Before this, any account that had ever done
-- counter or trainer work could not be deleted.
alter table appointments drop constraint appointments_created_by_fkey, add constraint appointments_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table body_measurements drop constraint body_measurements_created_by_fkey, add constraint body_measurements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table checkins drop constraint checkins_by_staff_fkey, add constraint checkins_by_staff_fkey foreign key (by_staff) references public.profiles(id) on delete set null;
alter table gym_holidays drop constraint gym_holidays_created_by_fkey, add constraint gym_holidays_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table gyms drop constraint gyms_created_by_fkey, add constraint gyms_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table invites drop constraint invites_accepted_by_fkey, add constraint invites_accepted_by_fkey foreign key (accepted_by) references public.profiles(id) on delete set null;
alter table member_freezes drop constraint member_freezes_created_by_fkey, add constraint member_freezes_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table members drop constraint members_created_by_fkey, add constraint members_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table memberships drop constraint memberships_sold_by_fkey, add constraint memberships_sold_by_fkey foreign key (sold_by) references public.profiles(id) on delete set null;
alter table nutrition_targets drop constraint nutrition_targets_set_by_fkey, add constraint nutrition_targets_set_by_fkey foreign key (set_by) references public.profiles(id) on delete set null;
alter table pt_package_ledger drop constraint pt_package_ledger_by_user_fkey, add constraint pt_package_ledger_by_user_fkey foreign key (by_user) references public.profiles(id) on delete set null;
alter table pt_packages drop constraint pt_packages_sold_by_fkey, add constraint pt_packages_sold_by_fkey foreign key (sold_by) references public.profiles(id) on delete set null;
alter table reschedule_requests drop constraint reschedule_requests_decided_by_fkey, add constraint reschedule_requests_decided_by_fkey foreign key (decided_by) references public.profiles(id) on delete set null;
alter table walkins drop constraint walkins_by_staff_fkey, add constraint walkins_by_staff_fkey foreign key (by_staff) references public.profiles(id) on delete set null;
alter table workouts drop constraint workouts_created_by_fkey, add constraint workouts_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
