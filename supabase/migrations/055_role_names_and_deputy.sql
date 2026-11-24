-- 055: «Руководитель» и «Зам руководителя» в системе ролей

update public.roles set name = 'Руководитель' where key = 'manager';
update public.roles set name = 'Зам руководителя' where key = 'deputy';

update public.roles
   set permissions = (
     select array_agg(distinct permission order by permission)
     from unnest(permissions || array['tasks.manageAny', 'invites.create', 'team.remove', 'team.restore']) as permission
   )
 where key = 'deputy';
