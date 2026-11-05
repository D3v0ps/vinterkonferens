-- Vinterkonferensen – databas, behörigheter (RLS) och fillagring.
-- Behörighet bygger på tabellen volunteers:
--   * finns din e-post i en kommitté  → du är volontär (ser interna sidor)
--   * is_lead = true                  → kommittéansvarig (redigerar sin kommitté)
--   * medlem i kommittén 'styrgruppen' → admin (redigerar allt)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabeller
create table public.settings (
  id int primary key default 1 check (id = 1),
  conference_name text not null default 'Vinterkonferensen',
  tagline jsonb not null default '{}',
  venue text not null default '',
  contact text not null default '',
  kitchen_info jsonb not null default '{}',
  fritids_info jsonb not null default '{}',
  fritids_price jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.conference_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  default_lang text not null default 'sv' check (default_lang in ('sv', 'en', 'ar')),
  label jsonb not null default '{}'
);

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  color text not null default '#334155',
  sort int not null default 0
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees on delete cascade,
  full_name text not null,
  email text check (email is null or email = lower(email)),
  phone text,
  is_lead boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (committee_id, email)
);
create index on public.volunteers (lower(email));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees on delete cascade,
  audience text not null default 'internal' check (audience in ('internal', 'external')),
  page text not null default 'home' check (page in ('home', 'program', 'kids', 'kitchen')),
  title jsonb not null default '{}',
  body jsonb not null default '{}',
  pinned boolean not null default false,
  published boolean not null default true,
  author_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees on delete cascade,
  date date not null,
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  title text not null,
  location text,
  notes text,
  volunteer_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.shifts (committee_id, date);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  kind text not null default 'lecture' check (kind in ('lecture', 'preshow', 'prayer', 'activity', 'break', 'meal', 'other')),
  audience text not null default 'adults' check (audience in ('adults', 'kids', 'all')),
  title jsonb not null default '{}',
  description jsonb not null default '{}',
  speaker text,
  room text,
  language text check (language in ('sv', 'en', 'ar')),
  capacity int,
  published boolean not null default true,
  feedback_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.sessions (starts_at);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  answers jsonb not null default '{}',
  comment text check (char_length(comment) <= 500),
  device_id text not null check (char_length(device_id) <= 64),
  lang text not null default 'sv',
  created_at timestamptz not null default now(),
  unique (session_id, device_id)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null default '{}',
  description jsonb not null default '{}',
  category text not null default 'food' check (category in ('food', 'coffee', 'drinks', 'snacks', 'dessert')),
  price numeric(10, 2),
  available boolean not null default true,
  tags text[] not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees on delete set null,
  title text not null,
  body text,
  transcript text,
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  kind text not null default 'text' check (kind in ('text', 'image', 'audio', 'document', 'video', 'other')),
  author_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees on delete set null,
  store_name text not null,
  store_address text,
  store_url text,
  contact_name text,
  contact_phone text,
  purchased_on date not null default current_date,
  discount_total numeric(10, 2) not null default 0,
  discount_note text,
  paid_by text,
  receipt_path text unique,
  receipt_name text,
  notes text,
  author_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases on delete cascade,
  name text not null,
  brand text,
  quantity numeric(12, 3) not null default 1,
  unit text,
  unit_price numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  link text,
  category text,
  storage_location text,
  status text not null default 'in_stock' check (status in ('in_stock', 'used', 'returned', 'lent')),
  created_at timestamptz not null default now()
);
create index on public.purchase_items (purchase_id);

create table public.flow_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions on delete cascade,
  area text not null check (area in ('hall', 'kitchen')),
  checkpoint text not null check (checkpoint in ('start_plus_5', 'midpoint', 'end_minus_5', 'extra', 'queue')),
  count int not null check (count >= 0),
  counted_at timestamptz not null default now(),
  note text,
  author_name text,
  created_by uuid default auth.uid()
);
create index on public.flow_counts (session_id);

create table public.kitchen_events (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('guest', 'food', 'coffee', 'tea', 'drink', 'snack')),
  quantity int not null default 1 check (quantity > 0),
  occurred_at timestamptz not null default now(),
  author_name text,
  created_by uuid default auth.uid()
);
create index on public.kitchen_events (occurred_at);

create sequence public.kids_reg_number start 101;

create table public.kids_registrations (
  id uuid primary key default gen_random_uuid(),
  reg_number int not null unique default nextval('public.kids_reg_number'),
  guardian_name text not null,
  guardian_phone text not null,
  guardian_email text,
  children jsonb not null default '[]',
  days date[] not null default '{}',
  pickup_names text,
  notes text,
  photo_consent boolean not null default false,
  status text not null default 'registered' check (status in ('registered', 'paid', 'checked_in', 'checked_out', 'cancelled')),
  paid boolean not null default false,
  amount numeric(10, 2),
  paid_at timestamptz,
  checked_in_at timestamptz,
  lang text not null default 'sv',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- behörighetsfunktioner
create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from volunteers where email = my_email() and my_email() <> '')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from volunteers v join committees c on c.id = v.committee_id
    where c.slug = 'styrgruppen' and v.email = my_email() and my_email() <> ''
  )
$$;

create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from volunteers where committee_id = cid and email = my_email() and my_email() <> '')
$$;

create or replace function public.is_lead(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from volunteers where committee_id = cid and is_lead and email = my_email() and my_email() <> '')
$$;

create or replace function public.is_member_of(slugs text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from volunteers v join committees c on c.id = v.committee_id
    where c.slug = any (slugs) and v.email = my_email() and my_email() <> ''
  )
$$;

create or replace function public.is_lead_of(slugs text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from volunteers v join committees c on c.id = v.committee_id
    where c.slug = any (slugs) and v.is_lead and v.email = my_email() and my_email() <> ''
  )
$$;

-- ---------------------------------------------------------------- RLS
alter table public.settings enable row level security;
alter table public.conference_days enable row level security;
alter table public.committees enable row level security;
alter table public.volunteers enable row level security;
alter table public.posts enable row level security;
alter table public.shifts enable row level security;
alter table public.sessions enable row level security;
alter table public.feedback enable row level security;
alter table public.menu_items enable row level security;
alter table public.notes enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.flow_counts enable row level security;
alter table public.kitchen_events enable row level security;
alter table public.kids_registrations enable row level security;

-- Offentligt läsbart (besökarsidan)
create policy "read settings" on public.settings for select using (true);
create policy "admin settings" on public.settings for all using (is_admin()) with check (is_admin());

create policy "read days" on public.conference_days for select using (true);
create policy "admin days" on public.conference_days for all using (is_admin()) with check (is_admin());

create policy "read committees" on public.committees for select using (true);
create policy "admin committees" on public.committees for all using (is_admin()) with check (is_admin());

create policy "read sessions" on public.sessions for select using (published or is_staff());
create policy "edit sessions" on public.sessions for all
  using (is_lead_of(array['forelasningar', 'konferencierer', 'fritids']))
  with check (is_lead_of(array['forelasningar', 'konferencierer', 'fritids']));

create policy "read menu" on public.menu_items for select using (true);
create policy "edit menu" on public.menu_items for all using (is_member_of(array['koket'])) with check (is_member_of(array['koket']));

create policy "read posts" on public.posts for select
  using ((audience = 'external' and published) or is_staff());
create policy "insert posts" on public.posts for insert
  with check (case when committee_id is null then is_admin() else is_lead(committee_id) end);
create policy "update posts" on public.posts for update
  using (case when committee_id is null then is_admin() else is_lead(committee_id) end)
  with check (case when committee_id is null then is_admin() else is_lead(committee_id) end);
create policy "delete posts" on public.posts for delete
  using (case when committee_id is null then is_admin() else is_lead(committee_id) end);

-- Volontärer och scheman
create policy "staff read volunteers" on public.volunteers for select using (is_staff());
create policy "lead edit volunteers" on public.volunteers for all using (is_lead(committee_id)) with check (is_lead(committee_id));

create policy "staff read shifts" on public.shifts for select using (is_staff());
create policy "lead edit shifts" on public.shifts for all using (is_lead(committee_id)) with check (is_lead(committee_id));

-- Betyg: vem som helst får lämna, bara volontärer läser
create policy "anyone rates" on public.feedback for insert
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.feedback_enabled and s.published));
create policy "staff read feedback" on public.feedback for select using (is_staff());
create policy "admin delete feedback" on public.feedback for delete using (is_admin());

-- Anteckningar
create policy "staff read notes" on public.notes for select using (is_staff());
create policy "staff add notes" on public.notes for insert with check (is_staff());
create policy "own notes update" on public.notes for update using (created_by = auth.uid() or is_admin());
create policy "own notes delete" on public.notes for delete using (created_by = auth.uid() or is_admin());

-- Inköp & inventarier
create policy "staff read purchases" on public.purchases for select using (is_staff());
create policy "staff add purchases" on public.purchases for insert with check (is_staff());
create policy "edit purchases" on public.purchases for update using (created_by = auth.uid() or is_lead(committee_id));
create policy "delete purchases" on public.purchases for delete using (created_by = auth.uid() or is_lead(committee_id));

create policy "staff read items" on public.purchase_items for select using (is_staff());
create policy "add items" on public.purchase_items for insert with check (
  exists (select 1 from public.purchases p where p.id = purchase_id and (p.created_by = auth.uid() or is_lead(p.committee_id)))
);
-- Alla volontärer får uppdatera förvaringsplats/status i inventarielistan; övriga kolumner spärras av triggern nedan
create policy "staff update items" on public.purchase_items for update using (is_staff()) with check (is_staff());
create policy "delete items" on public.purchase_items for delete using (
  exists (select 1 from public.purchases p where p.id = purchase_id and (p.created_by = auth.uid() or is_lead(p.committee_id)))
);

create or replace function public.guard_purchase_item_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Utan inloggad användare (service role, SQL-editorn) gäller ingen spärr; RLS stoppar redan anon
  if auth.uid() is null or (to_jsonb(new) - 'storage_location' - 'status') = (to_jsonb(old) - 'storage_location' - 'status') then
    return new;
  end if;
  if not exists (select 1 from purchases p where p.id = old.purchase_id and (p.created_by = auth.uid() or is_lead(p.committee_id)))
     or not exists (select 1 from purchases p where p.id = new.purchase_id and (p.created_by = auth.uid() or is_lead(p.committee_id))) then
    raise exception 'Bara den som registrerade inköpet eller kommitténs ansvarige får ändra produktraden' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger purchase_items_guard before update on public.purchase_items
  for each row execute function public.guard_purchase_item_update();

-- Flödesräkning
create policy "staff read counts" on public.flow_counts for select using (is_staff());
create policy "staff add counts" on public.flow_counts for insert with check (is_staff());
create policy "staff fix counts" on public.flow_counts for update using (is_staff());
create policy "own counts delete" on public.flow_counts for delete using (created_by = auth.uid() or is_admin());

create policy "staff read kitchen" on public.kitchen_events for select using (is_staff());
create policy "staff add kitchen" on public.kitchen_events for insert with check (is_staff());
create policy "own kitchen delete" on public.kitchen_events for delete using (created_by = auth.uid() or is_admin());

-- Fritids (anmälan sker via funktionen register_kids nedan)
create policy "fritids read" on public.kids_registrations for select using (is_member_of(array['fritids', 'gastbemotare']));
create policy "fritids update" on public.kids_registrations for update using (is_member_of(array['fritids', 'gastbemotare']));
create policy "fritids delete" on public.kids_registrations for delete using (is_lead_of(array['fritids']));

-- ---------------------------------------------------------------- fritidsanmälan (öppen för alla)
create or replace function public.register_kids(payload jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  kids jsonb;
  ds date[];
  dj jsonb := case when jsonb_typeof(payload -> 'days') = 'array' then payload -> 'days' else '[]' end;
begin
  if coalesce(trim(payload ->> 'guardian_name'), '') = '' or coalesce(trim(payload ->> 'guardian_phone'), '') = '' then
    raise exception 'Namn och telefon krävs';
  end if;
  if coalesce(jsonb_typeof(payload -> 'children'), '') <> 'array' or jsonb_array_length(payload -> 'children') = 0
     or jsonb_array_length(payload -> 'children') > 10 then
    raise exception 'Minst ett barn krävs';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload -> 'children') c
    where jsonb_typeof(c) <> 'object'
       or jsonb_typeof(c -> 'name') is distinct from 'string'
       or trim(c ->> 'name') = ''
       or char_length(trim(c ->> 'name')) > 120
       or case jsonb_typeof(c -> 'age')
            when 'number' then (c ->> 'age')::numeric not between 0 and 17 or (c ->> 'age')::numeric % 1 <> 0
            when 'null' then false
            else c -> 'age' is not null
          end
       or case jsonb_typeof(c -> 'allergies')
            when 'string' then char_length(trim(c ->> 'allergies')) > 300
            when 'null' then false
            else c -> 'allergies' is not null
          end
  ) then
    raise exception 'Ogiltiga uppgifter om barnen';
  end if;
  select jsonb_agg(jsonb_build_object(
           'name', trim(c ->> 'name'),
           'age', case when jsonb_typeof(c -> 'age') = 'number' then (c ->> 'age')::numeric::int end,
           'allergies', coalesce(trim(c ->> 'allergies'), '')
         ) order by ord)
    into kids
    from jsonb_array_elements(payload -> 'children') with ordinality t(c, ord);
  if coalesce(jsonb_typeof(payload -> 'days'), 'null') not in ('array', 'null')
     or exists (select 1 from jsonb_array_elements(dj) d where jsonb_typeof(d) <> 'string' or (d #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Ogiltiga dagar';
  end if;
  begin
    ds := array(select distinct x::date from jsonb_array_elements_text(dj) x order by 1);
  exception when others then
    raise exception 'Ogiltiga dagar';
  end;
  insert into kids_registrations (guardian_name, guardian_phone, guardian_email, children, days, pickup_names, notes, photo_consent, lang)
  values (
    left(trim(payload ->> 'guardian_name'), 120),
    left(trim(payload ->> 'guardian_phone'), 40),
    nullif(left(trim(payload ->> 'guardian_email'), 120), ''),
    kids,
    ds,
    nullif(left(payload ->> 'pickup_names', 300), ''),
    nullif(left(payload ->> 'notes', 1000), ''),
    coalesce((payload ->> 'photo_consent')::boolean, false),
    coalesce(nullif(payload ->> 'lang', ''), 'sv')
  )
  returning reg_number into n;
  return n;
end;
$$;
grant execute on function public.register_kids(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- fillagring
insert into storage.buckets (id, name, public, file_size_limit)
values ('notes', 'notes', false, 52428800), ('receipts', 'receipts', false, 20971520)
on conflict (id) do nothing;

create policy "staff read files" on storage.objects for select
  using (bucket_id in ('notes', 'receipts') and public.is_staff());
create policy "staff upload files" on storage.objects for insert
  with check (bucket_id in ('notes', 'receipts') and public.is_staff());
create policy "staff delete files" on storage.objects for delete
  using (bucket_id in ('notes', 'receipts') and (owner = auth.uid() or public.is_admin()));
-- Den som får ändra inköpet får också ta bort dess kvitto
create policy "purchase editors delete receipts" on storage.objects for delete
  using (bucket_id = 'receipts' and exists (
    select 1 from public.purchases p
    where p.receipt_path = storage.objects.name
      and (p.created_by = auth.uid() or public.is_lead(p.committee_id))
  ));
