-- Verifikationssuite fuer coach-begleiter.
-- Laeuft bewusst als Rolle `coach_app` (kein Superuser) — Superuser umgehen
-- RLS, ein Test als postgres wuerde also nichts beweisen.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to warning;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'coachin.a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'coachin.b@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'nicht.coachin@example.test')
on conflict do nothing;

-- A und B sind zugelassene Coachinnen; die dritte Person hat bewusst KEIN
-- coach_profile — an ihr wird unten geprueft, dass Coach-Begleiter dieselbe
-- Zulassungsschranke respektiert wie coach-studio.
insert into public.coach_profile (coach_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

grant select, insert, update, delete on
  public.termine, public.coach_challenge_teilnahme, public.hausaufgaben
  to coach_app;
grant select on public.challenges to coach_app;

-- Eine smile2go-weite Challenge, wie sie serverseitig (Service-Role) angelegt wird.
insert into public.challenges (id, titel, start_at, ende_at) values
  ('c0000000-0000-0000-0000-000000000001', 'Sichtbarkeits-Woche',
   now() - interval '2 days', now() + interval '5 days')
on conflict do nothing;

set role coach_app;

\echo '--- 1. Coachin A legt einen eigenen Termin an ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.termine (id, coach_id, titel, start_at, ort) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Mentoring-Call', now() + interval '1 day', 'Zoom');

do $$
begin
  if (select count(*) from public.termine) <> 1 then
    raise exception 'FEHLGESCHLAGEN: Coachin A sollte genau ihren eigenen Termin sehen';
  end if;
end $$;
\echo '    OK: Termin angelegt und sichtbar'

\echo '--- 2. RLS: Coachin B sieht den Termin von A nicht ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  if (select count(*) from public.termine) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Cross-Tenant-Leak in termine!';
  end if;
end $$;
\echo '    OK: keine fremden Termine sichtbar'

\echo '--- 3. RLS: Coachin B kann keinen Termin auf fremde coach_id schreiben ---'
do $$
begin
  begin
    insert into public.termine (coach_id, titel, start_at) values
      ('11111111-1111-1111-1111-111111111111', 'untergeschoben', now());
    raise exception 'FEHLGESCHLAGEN: Insert auf fremde coach_id wurde zugelassen!';
  exception when insufficient_privilege then
    null; -- erwartet
  end;
end $$;
\echo '    OK: Insert auf fremde coach_id abgelehnt'

\echo '--- 4. Challenges sind smile2go-weit sichtbar (beide Coachinnen) ---'
do $$
begin
  if (select count(*) from public.challenges) <> 1 then
    raise exception 'FEHLGESCHLAGEN: Coachin B sollte die globale Challenge sehen';
  end if;
end $$;
\echo '    OK: Challenge fuer Coachin B sichtbar'

\echo '--- 5. Coachin B kann Challenges nicht selbst anlegen ---'
do $$
begin
  begin
    insert into public.challenges (titel, start_at, ende_at) values
      ('Selbst angelegt', now(), now() + interval '1 day');
    raise exception 'FEHLGESCHLAGEN: Coachin B konnte eine Challenge anlegen!';
  exception when insufficient_privilege then
    null; -- erwartet: keine INSERT-Policy fuer authenticated
  end;
end $$;
\echo '    OK: Challenges bleiben serverseitig verwaltet'

\echo '--- 6. Teilnahme macht eine Challenge persoenlich ---'
insert into public.coach_challenge_teilnahme (coach_id, challenge_id) values
  ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-000000000001');

do $$
begin
  if (select count(*) from public.coach_challenge_teilnahme) <> 1 then
    raise exception 'FEHLGESCHLAGEN: Teilnahme von B nicht sichtbar fuer B selbst';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  if (select count(*) from public.coach_challenge_teilnahme) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Coachin A sieht die Teilnahme von B!';
  end if;
end $$;
\echo '    OK: Teilnahme ist pro Coachin isoliert'

\echo '--- 7. Hausaufgabe: anlegen, erledigen, RLS-Isolation ---'
insert into public.hausaufgaben (id, coach_id, titel, faellig_am) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Workbook Kapitel 3', current_date + 2);

update public.hausaufgaben set erledigt_at = now()
where id = 'e0000000-0000-0000-0000-000000000001';

do $$
declare erledigt timestamptz;
begin
  select erledigt_at into erledigt from public.hausaufgaben
  where id = 'e0000000-0000-0000-0000-000000000001';
  if erledigt is null then
    raise exception 'FEHLGESCHLAGEN: Hausaufgabe wurde nicht als erledigt markiert';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
begin
  if (select count(*) from public.hausaufgaben) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Cross-Tenant-Leak in hausaufgaben!';
  end if;
end $$;
\echo '    OK: Hausaufgabe erledigt, RLS isoliert'

\echo '--- 8. Ohne coach_profile: keine Zeile in irgendeiner Tabelle ---'
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

do $$
begin
  if (select count(*) from public.termine) <> 0 then
    raise exception 'FEHLGESCHLAGEN: nicht zugelassene Person sieht Termine';
  end if;
  if (select count(*) from public.challenges) <> 0 then
    raise exception 'FEHLGESCHLAGEN: nicht zugelassene Person sieht Challenges';
  end if;
  if (select count(*) from public.hausaufgaben) <> 0 then
    raise exception 'FEHLGESCHLAGEN: nicht zugelassene Person sieht Hausaufgaben';
  end if;

  begin
    insert into public.termine (coach_id, titel, start_at) values
      ('33333333-3333-3333-3333-333333333333', 'sollte scheitern', now());
    raise exception 'FEHLGESCHLAGEN: nicht zugelassene Person konnte einen Termin anlegen';
  exception when insufficient_privilege then
    null; -- erwartet: dieselbe Zulassungsschranke wie coach-studio
  end;
end $$;
\echo '    OK: Coach-Begleiter respektiert dieselbe Zulassungsschranke wie coach-studio'

reset role;
\echo ''
\echo '================================'
\echo '   ALLE TESTS BESTANDEN'
\echo '================================'
