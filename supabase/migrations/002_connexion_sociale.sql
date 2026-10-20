-- =====================================================================
--  Migration 002 — connexion Google / Discord / GitHub
--  À exécuter une fois dans Supabase : SQL Editor → New query → Run.
--  (Déjà inclus dans schema.sql pour une installation neuve.)
-- =====================================================================

-- Les joueurs qui arrivent par Google / Discord / GitHub choisissent leur pseudo à la première connexion
alter table public.profiles add column if not exists pseudo_chosen boolean not null default false;
update public.profiles set pseudo_chosen = true where not pseudo_chosen and pseudo !~ '^joueur_[0-9a-f]{8}$';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pseudo text := nullif(trim(new.raw_user_meta_data->>'pseudo'), '');
begin
  if v_pseudo ~ '^[[:alnum:]_. -]{3,20}$'
     and not exists (select 1 from public.profiles where lower(pseudo) = lower(v_pseudo)) then
    insert into public.profiles (id, pseudo, pseudo_chosen) values (new.id, v_pseudo, true);
  else
    -- Connexion sociale (ou pseudo pris entre-temps) : pseudo provisoire, à choisir dans le jeu
    insert into public.profiles (id, pseudo, pseudo_chosen)
    values (new.id, 'joueur_' || substr(replace(new.id::text, '-', ''), 1, 8), false);
  end if;
  return new;
end $$;

create or replace function public.set_pseudo(p_pseudo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v text := trim(p_pseudo);
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if v is null or v !~ '^[[:alnum:]_. -]{3,20}$' then
    raise exception 'Pseudo invalide : 3 à 20 caractères (lettres, chiffres, _ - .)';
  end if;
  if exists (select 1 from public.profiles where lower(pseudo) = lower(v) and id <> auth.uid()) then
    raise exception 'Ce pseudo est déjà pris 😕';
  end if;
  insert into public.profiles (id, pseudo, pseudo_chosen) values (auth.uid(), v, true)
    on conflict (id) do update set pseudo = excluded.pseudo, pseudo_chosen = true;
  return v;
end $$;

grant execute on function public.set_pseudo(text) to authenticated;
