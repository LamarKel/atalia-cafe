-- Cotizaciones de eventos (PLAN.md RF-Q01–Q05). Las crea solo el Worker (service_role); el equipo las lee
-- y el admin cambia el estado y las notas internas. Sin DROP/DELETE (CLAUDE.md, Base de datos).

-- Código corto y aleatorio, igual que los pedidos pero con prefijo CT- (cotización)
create or replace function public.gen_quote_code()
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
    candidate := 'CT-';
    while length(candidate) < 9 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      if b < 248 then -- 248 = 31 * 8, descarta el sesgo del módulo
        candidate := candidate || substr(alphabet, (b % 31) + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.quote_requests q where q.code = candidate);
  end loop;
  return candidate;
end;
$$;

create table public.quote_requests (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  store_id       uuid references public.stores (id) on delete set null,
  customer_name  text not null check (length(customer_name) between 2 and 80),
  customer_email text not null check (length(customer_email) between 3 and 254),
  customer_phone text not null check (length(customer_phone) between 7 and 20),
  language       text not null default 'en' check (language in ('en', 'es')),
  event_date     date not null,
  event_type     text not null check (length(event_type) between 1 and 40),
  guests         int not null check (guests between 1 and 5000),
  -- Productos de interés: [{ "product_id": uuid, "name": text }] con el nombre de ese momento
  products       jsonb not null default '[]'::jsonb check (jsonb_typeof(products) = 'array'),
  notes          text check (notes is null or length(notes) <= 2000),
  status         text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- El default va aparte: la función consulta la tabla, que ya tiene que existir.
alter table public.quote_requests alter column code set default public.gen_quote_code();

create index quote_requests_created_idx on public.quote_requests (created_at desc);
create index quote_requests_status_idx on public.quote_requests (status, created_at desc);
-- Para el límite de solicitudes por correo en el Worker (RF-Q04)
create index quote_requests_email_idx on public.quote_requests (lower(customer_email), created_at desc);

create trigger quote_requests_updated_at before update on public.quote_requests
  for each row execute function public.set_updated_at();

create trigger quote_requests_audit after insert or update or delete on public.quote_requests
  for each row execute function public.audit_row();

-- Desde el admin solo se cambian el estado y las notas internas; lo que escribió el cliente no se toca.
create or replace function public.quote_requests_guard()
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
    raise exception 'quote_field_not_editable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger quote_requests_guard before update on public.quote_requests
  for each row execute function public.quote_requests_guard();

alter table public.quote_requests enable row level security;

-- Sin políticas de insert para anon/authenticated: las solicitudes entran solo por el Worker (RF-Q04).
create policy staff_read on public.quote_requests for select to authenticated using (public.is_admin());
create policy admin_update on public.quote_requests for update to authenticated
  using (public.has_admin_role('admin')) with check (public.has_admin_role('admin'));
