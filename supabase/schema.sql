-- =====================================================================
--  Sudoku du Jour — schéma Supabase
--  À exécuter une fois dans Supabase : SQL Editor → New query → Run.
--  Le script est ré-exécutable (create or replace / if not exists).
--
--  Principe anti-triche : le client ne peut RIEN écrire directement.
--  Le chrono démarre côté serveur (start_game), les pénalités sont ajoutées
--  côté serveur (use_hint) et la grille est vérifiée côté serveur (finish_game).
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  pseudo     text not null check (char_length(pseudo) between 3 and 20),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_pseudo_lower on public.profiles (lower(pseudo));

create table if not exists public.puzzles (
  day        date     not null,
  level      smallint not null check (level between 1 and 4),
  givens     text     not null check (givens ~ '^[0-9]{81}$'),
  created_at timestamptz not null default now(),
  primary key (day, level)
);

create table if not exists public.games (
  id          bigint generated always as identity primary key,
  user_id     uuid     not null references public.profiles(id) on delete cascade,
  day         date     not null,
  level       smallint not null check (level between 1 and 4),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  penalty_s   int   not null default 0,
  hints       int[] not null default '{0,0,0,0,0}',   -- utilisations par type d'indice (1..5)
  revealed    int[] not null default '{}',            -- cases (0..80) révélées par indices
  elapsed_ms  int,                                    -- temps réel
  total_ms    int,                                    -- temps réel + pénalités (score)
  unique (user_id, day, level),
  foreign key (day, level) references public.puzzles(day, level)
);
create index if not exists games_ranking on public.games (day, level, total_ms, finished_at)
  where finished_at is not null;

-- ---------- Sécurité (RLS) : lecture publique, aucune écriture directe -

alter table public.profiles enable row level security;
alter table public.puzzles  enable row level security;
alter table public.games    enable row level security;

drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select using (true);
drop policy if exists "grilles lisibles" on public.puzzles;
create policy "grilles lisibles" on public.puzzles for select using (true);
drop policy if exists "parties lisibles" on public.games;
create policy "parties lisibles" on public.games for select using (true);

-- ---------- Création automatique du profil à l'inscription -------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, pseudo)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'pseudo'), ''), 'joueur_' || substr(new.id::text, 1, 8)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions utilitaires --------------------------------------

create or replace function public.paris_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function public.pseudo_available(p_pseudo text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(pseudo) = lower(trim(p_pseudo)));
$$;

create or replace function public._game_json(g public.games) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'day', g.day, 'level', g.level, 'givens', p.givens,
    'started_at', g.started_at, 'server_now', now(), 'finished_at', g.finished_at,
    'penalty_s', g.penalty_s, 'hints', g.hints, 'revealed', g.revealed,
    'elapsed_ms', g.elapsed_ms, 'total_ms', g.total_ms)
  from public.puzzles p where p.day = g.day and p.level = g.level;
$$;
revoke execute on function public._game_json(public.games) from public, anon, authenticated;

-- ---------- Démarrer (ou reprendre) la partie du jour ------------------
-- La grille est générée de façon déterministe par le client (même graine pour tous) ;
-- la première version enregistrée fait foi pour la journée.

create or replace function public.start_game(p_level int, p_givens text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_day   date := public.paris_today();
  v_clues int;
  g       public.games;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if p_level not between 1 and 4 then raise exception 'Niveau invalide'; end if;

  if not exists (select 1 from public.puzzles where day = v_day and level = p_level) then
    if p_givens is null or p_givens !~ '^[0-9]{81}$' then raise exception 'Grille invalide'; end if;
    v_clues := 81 - (length(p_givens) - length(replace(p_givens, '0', '')));
    if v_clues not between 17 and 50 then raise exception 'Grille invalide'; end if;
    insert into public.puzzles (day, level, givens) values (v_day, p_level, p_givens)
      on conflict do nothing;
  end if;

  insert into public.games (user_id, day, level) values (v_uid, v_day, p_level)
    on conflict (user_id, day, level) do nothing;
  select * into g from public.games where user_id = v_uid and day = v_day and level = p_level;
  return public._game_json(g);
end $$;

-- ---------- Utiliser un indice (quota + pénalité côté serveur) ---------

create or replace function public.use_hint(p_day date, p_level int, p_type int, p_cells int[]) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_quota int[] := '{3,3,2,1,1}';
  v_pen   int[] := '{20,25,45,90,105}';   -- secondes
  g       public.games;
begin
  select * into g from public.games
    where user_id = auth.uid() and day = p_day and level = p_level for update;
  if not found then raise exception 'Partie introuvable'; end if;
  if g.finished_at is not null then raise exception 'Partie déjà terminée'; end if;
  if p_type not between 1 and 5 then raise exception 'Indice invalide'; end if;
  if g.hints[p_type] >= v_quota[p_type] then raise exception 'Plus d''indice de ce type disponible'; end if;
  if coalesce(array_length(p_cells, 1), 0) not between 1 and 9
     or exists (select 1 from unnest(p_cells) x where x < 0 or x > 80) then
    raise exception 'Cases invalides';
  end if;

  update public.games
     set hints[p_type] = hints[p_type] + 1,
         penalty_s     = penalty_s + v_pen[p_type],
         revealed      = (select array_agg(distinct x) from unnest(revealed || p_cells) x)
   where id = g.id
  returning * into g;
  return public._game_json(g);
end $$;

-- ---------- Terminer : vérification de la grille + calcul du score -----

create or replace function public.finish_game(p_day date, p_level int, p_grid text) returns json
language plpgsql security definer set search_path = public as $$
declare
  g        public.games;
  v_givens text;
  v_ms     int;
  i        int;
  u        int;
begin
  select * into g from public.games
    where user_id = auth.uid() and day = p_day and level = p_level for update;
  if not found then raise exception 'Partie introuvable'; end if;
  if g.finished_at is not null then return public._game_json(g); end if;
  if p_grid is null or p_grid !~ '^[1-9]{81}$' then raise exception 'Grille incomplète'; end if;

  select givens into v_givens from public.puzzles where day = p_day and level = p_level;
  for i in 1..81 loop
    if substr(v_givens, i, 1) <> '0' and substr(v_givens, i, 1) <> substr(p_grid, i, 1) then
      raise exception 'Grille incorrecte';
    end if;
  end loop;
  for u in 0..8 loop
    if (select count(distinct substr(p_grid, u * 9 + k + 1, 1)) from generate_series(0, 8) k) <> 9
    or (select count(distinct substr(p_grid, k * 9 + u + 1, 1)) from generate_series(0, 8) k) <> 9
    or (select count(distinct substr(p_grid, ((u / 3) * 3 + k / 3) * 9 + (u % 3) * 3 + k % 3 + 1, 1))
          from generate_series(0, 8) k) <> 9 then
      raise exception 'Grille incorrecte';
    end if;
  end loop;

  v_ms := (extract(epoch from (now() - g.started_at)) * 1000)::int;
  update public.games
     set finished_at = now(), elapsed_ms = v_ms, total_ms = v_ms + penalty_s * 1000
   where id = g.id
  returning * into g;
  return public._game_json(g);
end $$;

-- ---------- Classement d'un jour / niveau ------------------------------

create or replace function public.leaderboard(p_day date, p_level int)
returns table (pos bigint, n bigint, pseudo text, total_ms int, elapsed_ms int, penalty_s int, hints int[], is_me boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by g.total_ms, g.finished_at),
         count(*) over (),
         p.pseudo, g.total_ms, g.elapsed_ms, g.penalty_s, g.hints,
         g.user_id = auth.uid()
    from public.games g
    join public.profiles p on p.id = g.user_id
   where g.day = p_day and g.level = p_level and g.finished_at is not null
   order by g.total_ms, g.finished_at
   limit 500;
$$;

-- ---------- Historique du joueur connecté (avec rang du jour) ----------

create or replace function public.my_games()
returns table (day date, level smallint, started_at timestamptz, finished_at timestamptz,
               total_ms int, elapsed_ms int, penalty_s int, hints int[], pos bigint, n bigint)
language sql stable security definer set search_path = public as $$
  with mine as (
    select g.day, g.level from public.games g where g.user_id = auth.uid()
  ), ranked as (
    select g.id,
           row_number() over (partition by g.day, g.level order by g.total_ms, g.finished_at) as rk,
           count(*)     over (partition by g.day, g.level) as cnt
      from public.games g
      join mine m on m.day = g.day and m.level = g.level
     where g.finished_at is not null
  )
  select g.day, g.level, g.started_at, g.finished_at, g.total_ms, g.elapsed_ms, g.penalty_s, g.hints, r.rk, r.cnt
    from public.games g
    left join ranked r on r.id = g.id
   where g.user_id = auth.uid()
   order by g.day desc, g.level;
$$;

-- ---------- Droits ------------------------------------------------------

grant select on public.profiles, public.puzzles, public.games to anon, authenticated;
grant execute on function public.pseudo_available(text), public.leaderboard(date, int), public.paris_today()
  to anon, authenticated;
grant execute on function public.start_game(int, text), public.use_hint(date, int, int, int[]),
  public.finish_game(date, int, text), public.my_games() to authenticated;
