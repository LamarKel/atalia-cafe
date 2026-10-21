-- Formulario de contacto (página Contacto). Los mensajes los crea solo el Worker (service_role), después de
-- verificar Turnstile y el límite por correo; el equipo los lee en el panel → Mensajes y el admin cambia el
-- estado (nuevo → respondido → archivado) y las notas internas. Lo que escribió el cliente no se cambia.
-- El aviso por correo va a la regla notifications.contact_recipients (packages/shared/rules, sin migración).

begin;

-- Código corto y aleatorio, como las cotizaciones pero con prefijo MS- (mensaje)
create or replace function public.gen_contact_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 caracteres, sin 0/O ni 1/I/L
  candidate text;
  b int;
begin
  loop
    candidate := 'MS-';
    while length(candidate) < 9 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      if b < 248 then -- 248 = 31 * 8, descarta el sesgo del módulo
        candidate := candidate || substr(alphabet, (b % 31) + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.contact_messages m where m.code = candidate);
  end loop;
  return candidate;
end;
$$;

create table public.contact_messages (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  store_id       uuid references public.stores (id) on delete set null,
  name           text not null check (length(name) between 2 and 80),
  email          text not null check (length(email) between 3 and 254),
  phone          text check (phone is null or length(phone) between 7 and 20),
  language       text not null default 'en' check (language in ('en', 'es')),
  topic          text not null check (topic in ('general', 'order', 'catering', 'feedback', 'other')),
  message        text not null check (length(message) between 10 and 2000),
  status         text not null default 'new' check (status in ('new', 'answered', 'archived')),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- El default va aparte: la función consulta la tabla, que ya tiene que existir.
alter table public.contact_messages alter column code set default public.gen_contact_code();

create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
-- Para el límite de mensajes por correo en el Worker
create index contact_messages_email_idx on public.contact_messages (lower(email), created_at desc);
create index contact_messages_store_idx on public.contact_messages (store_id);

create trigger contact_messages_updated_at before update on public.contact_messages
  for each row execute function public.set_updated_at();

create trigger contact_messages_audit after insert or update or delete on public.contact_messages
  for each row execute function public.audit_row();

-- Desde el panel solo se cambian el estado y las notas internas.
create or replace function public.contact_messages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editable constant text[] := array['status', 'internal_notes', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'contact_field_not_editable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contact_messages_guard before update on public.contact_messages
  for each row execute function public.contact_messages_guard();

alter table public.contact_messages enable row level security;

-- Sin políticas de insert para anon/authenticated: los mensajes entran solo por el Worker.
create policy staff_read on public.contact_messages for select to authenticated using (private.is_admin());
create policy admin_update on public.contact_messages for update to authenticated
  using (private.has_admin_role('admin')) with check (private.has_admin_role('admin'));

commit;
