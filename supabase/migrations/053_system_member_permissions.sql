-- 053: выдать системным ролям права на удаление/восстановление сотрудников

update public.roles
   set permissions = (
     select array_agg(distinct permission order by permission)
     from unnest(permissions || array['team.remove', 'team.restore']) as permission
   )
 where key in ('admin', 'manager', 'deputy');
