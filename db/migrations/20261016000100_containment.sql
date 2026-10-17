-- 0001 · Contención de seguridad
-- Neutraliza lo que la v2 dejó abierto al rol public/anon (ver docs/DATABASE.md §1.2), sin borrar nada:
-- cada política queda con USING (false) / WITH CHECK (false), o sea, no deja pasar a nadie.
-- Idempotente: en un proyecto nuevo no encuentra nada que cambiar.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and tablename = 'objects' and policyname in (
             'Allow public uploads', 'Allow public updates', 'Allow public deletes',
             'Public Upload', 'Public Update', 'Public Delete', 'Public Access',
             'Authenticated Delete', 'admin upload 16wiy3a_0', 'public read 16wiy3a_0'))
  loop
    if r.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (false)', r.policyname, r.schemaname, r.tablename);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (false)', r.policyname, r.schemaname, r.tablename);
    else
      execute format('alter policy %I on %I.%I using (false) with check (false)', r.policyname, r.schemaname, r.tablename);
    end if;
  end loop;
end $$;

-- Funciones SECURITY DEFINER de la v2 fuera del alcance de anon/authenticated (si existen)
do $$
begin
  if to_regprocedure('public.verify_admin_password(text, text)') is not null then
    revoke execute on function public.verify_admin_password(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.validate_promo_code(text, numeric)') is not null then
    revoke execute on function public.validate_promo_code(text, numeric) from public, anon, authenticated;
  end if;
end $$;
