-- Verifikationssuite fuer das Lead-Radar-Schema.
-- Laeuft bewusst als Rolle `coach_app` (kein Superuser) — Superuser umgehen RLS,
-- ein Test als postgres wuerde also nichts beweisen.
--
-- Ausfuehren:  psql -v ON_ERROR_STOP=1 -f supabase/tests/lead_radar_test.sql
-- Erwartung:   laeuft komplett durch und endet mit "ALLE TESTS BESTANDEN".

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to warning;

-- Zwei Coachinnen anlegen und die Tabellenrechte vergeben (in Supabase
-- uebernimmt das die Plattform fuer die Rolle `authenticated`).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'coachin.a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'coachin.b@example.test')
on conflict do nothing;

grant select, insert, update, delete on public.leads, public.lead_interactions, public.lead_scores to coach_app;
grant select on public.lead_export_v to coach_app;

-- Bewusst KEIN Grant auf coach_instagram_konten: dort sollen ausschliesslich
-- die Rechte greifen, die die Migration der Rolle `authenticated` gibt.
insert into public.coach_instagram_konten (coach_id, ig_konto_id, access_token)
values ('11111111-1111-1111-1111-111111111111', '17841400000000000', 'geheim-darf-nie-in-den-browser')
on conflict do nothing;

-- Ab hier als normale Nutzerin, nicht als Superuser.
set role coach_app;

\echo '--- 1. Lead anlegen (Coachin A) ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.leads (id, coach_id, name, instagram_handle)
values ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Nora Fischer', 'nora.wandelt');

do $$
begin
  if (select count(*) from public.leads) <> 1 then
    raise exception 'FEHLGESCHLAGEN: Coachin A sollte genau 1 Lead sehen';
  end if;
end $$;
\echo '    OK: Lead angelegt und sichtbar'

\echo '--- 2. Consent-Gate: Interaktion OHNE Einwilligung muss scheitern ---'
do $$
begin
  begin
    insert into public.lead_interactions (coach_id, lead_id, typ)
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 'dm_antwort');
    raise exception 'FEHLGESCHLAGEN: Insert ohne Einwilligung wurde zugelassen!';
  exception when insufficient_privilege then
    null; -- erwartet: der Consent-Trigger wirft 42501
  end;
end $$;
\echo '    OK: ohne Einwilligung abgelehnt'

\echo '--- 3. Einwilligung setzt consent_at automatisch ---'
update public.leads set consent_tracking = true
where id = 'aaaa0000-0000-0000-0000-000000000001';

do $$
begin
  if (select consent_at from public.leads where id = 'aaaa0000-0000-0000-0000-000000000001') is null then
    raise exception 'FEHLGESCHLAGEN: consent_at wurde nicht gesetzt';
  end if;
end $$;
\echo '    OK: consent_at automatisch gesetzt'

\echo '--- 4. Mit Einwilligung: Interaktion wird angenommen, Gewicht per Default ---'
insert into public.lead_interactions (coach_id, lead_id, typ)
values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 'erstgespraech');

do $$
declare g integer;
begin
  select gewicht into g from public.lead_interactions
  where lead_id = 'aaaa0000-0000-0000-0000-000000000001' and typ = 'erstgespraech';
  if g <> 40 then
    raise exception 'FEHLGESCHLAGEN: Default-Gewicht fuer erstgespraech sollte 40 sein, war %', g;
  end if;
end $$;
\echo '    OK: Interaktion gespeichert, Default-Gewicht 40'

\echo '--- 5. Follow-Status nur mit Einwilligung speicherbar ---'
update public.leads set folgt_coach = true
where id = 'aaaa0000-0000-0000-0000-000000000001';
\echo '    OK: Follow-Status mit Einwilligung gesetzt'

\echo '--- 6. Widerruf loescht consent_at UND den Follow-Status ---'
update public.leads set consent_tracking = false
where id = 'aaaa0000-0000-0000-0000-000000000001';

do $$
declare r record;
begin
  select consent_at, folgt_coach into r from public.leads
  where id = 'aaaa0000-0000-0000-0000-000000000001';
  if r.consent_at is not null then
    raise exception 'FEHLGESCHLAGEN: consent_at nach Widerruf nicht geleert';
  end if;
  if r.folgt_coach is not null then
    raise exception 'FEHLGESCHLAGEN: folgt_coach nach Widerruf nicht geleert';
  end if;
end $$;
\echo '    OK: Widerruf raeumt abgeleitete Daten ab'

-- Fuer die folgenden Tests wieder einwilligen.
update public.leads set consent_tracking = true
where id = 'aaaa0000-0000-0000-0000-000000000001';

\echo '--- 7. RLS: Coachin B darf den Lead von Coachin A NICHT sehen ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  if (select count(*) from public.leads) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Cross-Tenant-Leak in leads!';
  end if;
  if (select count(*) from public.lead_interactions) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Cross-Tenant-Leak in lead_interactions!';
  end if;
end $$;
\echo '    OK: keine fremden Leads sichtbar'

\echo '--- 8. RLS: Coachin B kann den fremden Lead nicht aendern oder loeschen ---'
do $$
declare betroffen integer;
begin
  update public.leads set name = 'gekapert' where id = 'aaaa0000-0000-0000-0000-000000000001';
  get diagnostics betroffen = row_count;
  if betroffen <> 0 then
    raise exception 'FEHLGESCHLAGEN: fremder Lead wurde veraendert!';
  end if;

  delete from public.leads where id = 'aaaa0000-0000-0000-0000-000000000001';
  get diagnostics betroffen = row_count;
  if betroffen <> 0 then
    raise exception 'FEHLGESCHLAGEN: fremder Lead wurde geloescht!';
  end if;
end $$;
\echo '    OK: fremder Lead unveraendert'

\echo '--- 9. RLS: Coachin B kann keinen Lead auf fremde coach_id schreiben ---'
do $$
begin
  begin
    insert into public.leads (coach_id, name)
    values ('11111111-1111-1111-1111-111111111111', 'untergeschoben');
    raise exception 'FEHLGESCHLAGEN: Insert auf fremde coach_id wurde zugelassen!';
  exception when insufficient_privilege then
    null; -- erwartet: WITH CHECK der Policy schlaegt zu
  end;
end $$;
\echo '    OK: Insert auf fremde coach_id abgelehnt'

\echo '--- 10. Export-View (Art. 20) respektiert RLS ---'
do $$
begin
  if (select count(*) from public.lead_export_v) <> 0 then
    raise exception 'FEHLGESCHLAGEN: lead_export_v leakt fremde Zeilen — security_invoker pruefen!';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
begin
  if (select count(*) from public.lead_export_v) <> 1 then
    raise exception 'FEHLGESCHLAGEN: eigene Zeile fehlt im Export';
  end if;
end $$;
\echo '    OK: Export zeigt nur eigene Daten'

\echo '--- 11. Richtung: ausgehende Nachricht bekommt immer Gewicht 0 ---'
insert into public.lead_interactions (coach_id, lead_id, typ, richtung, gewicht)
values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 'dm_antwort', 'ausgehend', 99);

do $$
declare g integer;
begin
  select gewicht into g from public.lead_interactions
  where lead_id = 'aaaa0000-0000-0000-0000-000000000001' and richtung = 'ausgehend';
  if g <> 0 then
    raise exception 'FEHLGESCHLAGEN: ausgehende Interaktion sollte Gewicht 0 haben, war %', g;
  end if;
end $$;
\echo '    OK: ausgehend zaehlt nicht zum Score'

\echo '--- 12. Deduplizierung: dieselbe IG-Objekt-ID nur einmal ---'
insert into public.lead_interactions (coach_id, lead_id, typ, raw_ref)
values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 'kommentar', 'ig-comment-1');

do $$
begin
  begin
    insert into public.lead_interactions (coach_id, lead_id, typ, raw_ref)
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 'kommentar', 'ig-comment-1');
    raise exception 'FEHLGESCHLAGEN: doppelte Zustellung wurde akzeptiert!';
  exception when unique_violation then
    null; -- erwartet: der Unique-Index auf (coach_id, raw_ref) greift
  end;
end $$;
\echo '    OK: wiederholte Webhook-Zustellung hebt den Score nicht doppelt'

\echo '--- 13. Access-Token ist fuer angemeldete Nutzerinnen nicht lesbar ---'
do $$
begin
  begin
    perform access_token from public.coach_instagram_konten;
    raise exception 'FEHLGESCHLAGEN: access_token war lesbar!';
  exception when insufficient_privilege then
    null; -- erwartet: spaltenweiser REVOKE greift
  end;
end $$;
\echo '    OK: Token bleibt serverseitig'

\echo '--- 14. Loeschung (Art. 17) kaskadiert auf Interaktionen ---'
insert into public.lead_scores (coach_id, lead_id, score, stufe)
values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000001', 42, 'lauwarm');

select public.lead_delete_cascade('aaaa0000-0000-0000-0000-000000000001');

do $$
begin
  if (select count(*) from public.leads) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Lead nicht geloescht';
  end if;
  if (select count(*) from public.lead_interactions) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Interaktionen nicht mitgeloescht';
  end if;
  if (select count(*) from public.lead_scores) <> 0 then
    raise exception 'FEHLGESCHLAGEN: Scores nicht mitgeloescht';
  end if;
end $$;
\echo '    OK: Lead und alle abgeleiteten Daten entfernt'

reset role;
\echo ''
\echo '================================'
\echo '   ALLE TESTS BESTANDEN'
\echo '================================'
