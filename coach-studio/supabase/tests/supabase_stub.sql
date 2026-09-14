-- Supabase-Stub fuer lokale Migrationstests.
-- Bildet nach, was Supabase bereitstellt: das auth-Schema, auth.users und
-- auth.uid(), sowie die Rolle `authenticated`. Superuser umgehen RLS, deshalb
-- laufen alle Tests bewusst als NICHT-Superuser.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Entspricht Supabases Implementierung: liest die sub-Claim des JWT aus den
-- Session-Settings. Im Test setzen wir sie mit set_config().
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'coach_app') then
    -- Nicht-Superuser-Login-Rolle: nur so greift RLS ueberhaupt.
    create role coach_app login;
  end if;
end
$$;

grant usage on schema auth to authenticated, coach_app;
grant select on auth.users to authenticated, coach_app;
grant usage on schema public to authenticated, coach_app;

-- coach_app erbt die Rechte von `authenticated`. Dadurch testet die Suite die
-- echten Grants aus den Migrationen (inklusive spaltenweiser Entzuege) statt
-- eigens im Test vergebener Rechte.
grant authenticated to coach_app;
