-- Grunddata. Kör efter migreringen (Supabase → SQL Editor).
insert into public.settings (id, conference_name) values (1, 'Vinterkonferensen') on conflict (id) do nothing;

insert into public.committees (slug, name, color, sort) values
  ('styrgruppen',    'Styrgruppen',    '#1a237e', 0),
  ('konferencierer', 'Konferencierer', '#7c3aed', 1),
  ('koket',          'Köket',          '#0f766e', 2),
  ('fritids',        'Fritids',        '#15803d', 3),
  ('forelasningar',  'Föreläsningar',  '#1d4ed8', 4),
  ('ordning',        'Ordning',        '#475569', 5),
  ('all-around',     'All around',     '#0e7490', 6),
  ('gastbemotare',   'Gästbemötare',   '#a16207', 7)
on conflict (slug) do nothing;

-- Konferensdagar: ändra datumen! Fredag på arabiska, lördag–söndag på svenska.
insert into public.conference_days (date, default_lang, label) values
  ('2027-01-08', 'ar', '{"sv":"Dag 1","en":"Day 1","ar":"اليوم الأول"}'),
  ('2027-01-09', 'sv', '{"sv":"Dag 2","en":"Day 2","ar":"اليوم الثاني"}'),
  ('2027-01-10', 'sv', '{"sv":"Dag 3","en":"Day 3","ar":"اليوم الثالث"}')
on conflict (date) do nothing;

-- Första administratören (byt namn och e-post). Därefter läggs alla andra till i appen.
-- insert into public.volunteers (committee_id, full_name, email, is_lead)
-- select id, 'Ditt Namn', 'din@epost.se', true from public.committees where slug = 'styrgruppen';
