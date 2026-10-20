/* Deux backends exposant la même interface :
   - SupabaseBackend : comptes, chrono et pénalités calculés côté serveur, classement partagé.
   - LocalBackend    : mode démo hors-ligne (localStorage) avec des adversaires simulés.
   Forme normalisée d'une partie :
   { day, level, givens, startedAt, serverNow, finishedAt, penalty, hints:[5], revealed:[], elapsedMs, totalMs } */

function parisToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Adresse de retour après un lien email ou une connexion Google / Discord / GitHub
const redirectUrl = () => location.origin + location.pathname;

// Fournisseurs de connexion sociale affichés quand ils sont activés dans Supabase
const OAUTH_PROVIDERS = ['google'];

class SupabaseBackend {
  constructor(url, key) {
    this.mode = 'online';
    this.url = url;
    this.key = key;
    // Flux "implicit" : les liens reçus par email fonctionnent même s'ils sont ouverts sur un autre appareil
    this.sb = window.supabase.createClient(url, key, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } });
    this.user = null;
    this.recovery = /type=recovery/.test(location.hash + location.search);
    this.urlError = readUrlError();
    this.sb.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') this.recovery = true; });
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    // Nettoie l'URL (jetons ou erreurs renvoyés par un lien email / OAuth)
    if (/access_token|error|type=/.test(location.hash) || /[?&](code|error)=/.test(location.search)) {
      history.replaceState(null, '', location.pathname);
    }
    if (!data.session) return null;
    return this._loadProfile(data.session.user);
  }

  async _loadProfile(authUser) {
    let { data, error } = await this.sb.from('profiles').select('pseudo, pseudo_chosen').eq('id', authUser.id).maybeSingle();
    if (error) {
      // Base pas encore migrée (colonne pseudo_chosen absente) : on considère le pseudo comme choisi
      ({ data } = await this.sb.from('profiles').select('pseudo').eq('id', authUser.id).maybeSingle());
      if (data) data.pseudo_chosen = true;
    }
    this.user = {
      id: authUser.id,
      email: authUser.email,
      pseudo: data?.pseudo || 'Joueur',
      needsPseudo: !data || data.pseudo_chosen === false,
      suggestion: suggestPseudo(authUser),
    };
    return this.user;
  }

  async providers() {
    try {
      const res = await fetch(`${this.url}/auth/v1/settings`, { headers: { apikey: this.key } });
      const { external = {} } = await res.json();
      return OAUTH_PROVIDERS.filter(p => external[p]);
    } catch {
      return [];
    }
  }

  async signInWithProvider(provider) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } });
    if (error) throw new Error(translateAuthError(error));
  }

  async signUp({ email, password, pseudo }) {
    const free = await this._rpc('pseudo_available', { p_pseudo: pseudo });
    if (!free) throw new Error('Ce pseudo est déjà pris 😕');
    const { data, error } = await this.sb.auth.signUp({
      email, password, options: { data: { pseudo }, emailRedirectTo: redirectUrl() },
    });
    if (error) throw new Error(translateAuthError(error));
    if (!data.session) return { needsConfirm: true };
    return this._loadProfile(data.user);
  }

  async resendConfirmation(email) {
    const { error } = await this.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw new Error(translateAuthError(error));
  }

  async signIn({ email, password }) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error));
    return this._loadProfile(data.user);
  }

  async sendPasswordReset(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) throw new Error(translateAuthError(error));
  }

  async updatePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(translateAuthError(error));
    this.recovery = false;
  }

  async setPseudo(pseudo) {
    try {
      this.user.pseudo = await this._rpc('set_pseudo', { p_pseudo: pseudo });
    } catch (e) {
      if (/set_pseudo/.test(e.message)) throw new Error('Base de données à mettre à jour : exécute supabase/migrations/002_connexion_sociale.sql');
      throw e;
    }
    this.user.needsPseudo = false;
    return this.user;
  }

  async signOut() { await this.sb.auth.signOut(); this.user = null; }

  async _rpc(name, args) {
    const { data, error } = await this.sb.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  _norm(g) {
    return {
      day: g.day, level: g.level, givens: g.givens,
      startedAt: Date.parse(g.started_at), serverNow: Date.parse(g.server_now),
      finishedAt: g.finished_at ? Date.parse(g.finished_at) : null,
      penalty: g.penalty_s, hints: g.hints, revealed: g.revealed || [],
      elapsedMs: g.elapsed_ms, totalMs: g.total_ms,
    };
  }

  async startGame(level, givens) { return this._norm(await this._rpc('start_game', { p_level: level, p_givens: givens })); }
  async useHint(day, level, type, cells) { return this._norm(await this._rpc('use_hint', { p_day: day, p_level: level, p_type: type, p_cells: cells })); }
  async finishGame(day, level, grid) { return this._norm(await this._rpc('finish_game', { p_day: day, p_level: level, p_grid: grid })); }

  async leaderboard(day, level) {
    const rows = await this._rpc('leaderboard', { p_day: day, p_level: level });
    return rows.map(r => ({
      pos: Number(r.pos), n: Number(r.n), pseudo: r.pseudo, totalMs: r.total_ms, elapsedMs: r.elapsed_ms,
      penalty: r.penalty_s, hints: r.hints, isMe: r.is_me,
    }));
  }

  async myGames() {
    const rows = await this._rpc('my_games', {});
    return rows.map(r => ({
      day: r.day, level: r.level, finished: !!r.finished_at, totalMs: r.total_ms, elapsedMs: r.elapsed_ms,
      penalty: r.penalty_s, hints: r.hints, pos: r.pos ? Number(r.pos) : null, n: r.n ? Number(r.n) : null,
    }));
  }
}

function translateAuthError(err) {
  const code = err.code || '';
  const m = (err.message || String(err)).toLowerCase();
  if (code === 'invalid_credentials' || m.includes('invalid login')) return 'Email ou mot de passe incorrect';
  if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return 'Confirme ton email avant de te connecter : clique sur le lien reçu 📬';
  if (code === 'user_already_exists' || m.includes('already registered')) return 'Un compte existe déjà avec cet email';
  if (code === 'same_password') return "Le nouveau mot de passe doit être différent de l'ancien";
  if (code === 'weak_password' || m.includes('password should')) return 'Mot de passe refusé : il ne respecte pas les règles de sécurité';
  if (code === 'email_address_invalid' || m.includes('invalid format')) return 'Adresse email invalide';
  if (code === 'provider_disabled' || m.includes('provider is not enabled')) return "Ce mode de connexion n'est pas encore activé";
  if (code.includes('rate_limit') || m.includes('rate limit')) return 'Trop de tentatives, réessaie dans quelques minutes';
  return err.message || String(err);
}

// Erreur renvoyée dans l'URL par un lien email expiré ou une connexion sociale annulée
function readUrlError() {
  const params = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
  const desc = (params.get('error_description') || '').replace(/\+/g, ' ');
  const code = params.get('error_code') || params.get('error') || '';
  if (!desc && !code) return null;
  console.warn('[auth] retour en erreur :', code, desc);
  if (/exchange external code/i.test(desc)) return 'Google a refusé la connexion : le Client Secret enregistré dans Supabase est probablement incorrect.';
  if (/saving new user|database error/i.test(desc)) return 'Erreur de la base de données à la création du compte. Réessaie dans un instant.';
  if (/expired|otp/i.test(desc + code)) return 'Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau.';
  if (/access_denied|denied|cancel/i.test(desc + code)) return 'Connexion refusée ou annulée. Si Google affiche « accès bloqué », ajoute ton adresse dans les utilisateurs de test.';
  return `Connexion impossible : ${desc || code}`;
}

// Propose un pseudo à partir du profil Google / Discord / GitHub
function suggestPseudo(authUser) {
  const meta = authUser.user_metadata || {};
  const candidates = [meta.pseudo, meta.user_name, meta.preferred_username, meta.custom_claims?.global_name,
    meta.full_name, meta.name, authUser.email?.split('@')[0]];
  for (const c of candidates) {
    const clean = String(c || '').replace(/[^\p{L}\p{N}_\-. ]/gu, '').trim().slice(0, 20);
    if (clean.length >= 3) return clean;
  }
  return '';
}

/* ---------------------------------------------------------------- Mode démo */

const BOT_NAMES = ['SudoKing', 'GrillePain', 'NeufSurNeuf', 'CaseDépart', 'LogicLuna', 'Chiffronaute', 'MiniMax',
  'ZenMaster', 'PixelPanda', 'LeCarré', 'Calculette', 'MadameNeuf', 'Blocus', 'Tetrix', 'CroissantLogique',
  'LaFourmi', 'Kakuro', 'Numérobis', 'Hiboux', 'Matrix9', 'Sudokette', 'PetitPois', 'Capitaine3x3', 'Ninja81',
  'Tournesol', 'Biscotte', 'CaféCrème', 'LaTortue', 'Flash', 'Galaxie', 'Moustache', 'Origami', 'Popcorn',
  'Réglisse', 'Saturne', 'Trampoline', 'Ukulélé', 'Vanille', 'Wombat', 'Yéti', 'Zigzag', 'Anis', 'Bretzel'];
const BOT_BASE_S = { 1: 330, 2: 600, 3: 1000, 4: 1700 };

class LocalBackend {
  constructor() {
    this.mode = 'demo';
    this.key = 'sdj.local.v1';
    this.state = this._load();
    this.user = this.state.user;
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || { user: null, games: {} }; }
    catch { return { user: null, games: {} }; }
  }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch { /* stockage indisponible */ } }

  async init() { return this.user; }
  async signIn({ pseudo }) {
    this.user = this.state.user = { id: 'local', pseudo };
    this._save();
    return this.user;
  }
  async signUp(args) { return this.signIn(args); }
  async signOut() { this.user = this.state.user = null; this._save(); }
  async providers() { return []; }

  _out(g) { return { ...g, hints: [...g.hints], revealed: [...g.revealed], serverNow: Date.now() }; }

  async startGame(level, givens) {
    const day = parisToday();
    const k = `${day}|${level}`;
    if (!this.state.games[k]) {
      this.state.games[k] = { day, level, givens, startedAt: Date.now(), finishedAt: null, penalty: 0,
        hints: [0, 0, 0, 0, 0], revealed: [], elapsedMs: null, totalMs: null };
      this._save();
    }
    return this._out(this.state.games[k]);
  }

  async useHint(day, level, type, cells) {
    const g = this.state.games[`${day}|${level}`];
    if (!g) throw new Error('Partie introuvable');
    if (g.finishedAt) throw new Error('Partie déjà terminée');
    const h = RULES.hints[type - 1];
    if (g.hints[type - 1] >= h.quota) throw new Error("Plus d'indice de ce type disponible");
    g.hints[type - 1]++;
    g.penalty += h.penalty;
    g.revealed = [...new Set([...g.revealed, ...cells])];
    this._save();
    return this._out(g);
  }

  async finishGame(day, level, grid) {
    const g = this.state.games[`${day}|${level}`];
    if (!g) throw new Error('Partie introuvable');
    if (!g.finishedAt) {
      if (!Sudoku.isValidSolution(grid, g.givens)) throw new Error('Grille incorrecte');
      g.finishedAt = Date.now();
      g.elapsedMs = g.finishedAt - g.startedAt;
      g.totalMs = g.elapsedMs + g.penalty * 1000;
      this._save();
    }
    return this._out(g);
  }

  _bots(day, level) {
    const rng = Sudoku.mulberry32(Sudoku.seedFrom(`bots|${day}|${level}`));
    const count = 22 + Math.floor(rng() * 40);
    const names = Sudoku.shuffle([...BOT_NAMES], rng);
    const bots = [];
    for (let i = 0; i < count; i++) {
      const skill = 0.45 + rng() * rng() * 2.6;
      const hints = [0, 0, 0, 0, 0].map((_, t) => (rng() < 0.12 * skill ? 1 : 0));
      const penalty = hints.reduce((s, used, t) => s + used * RULES.hints[t].penalty, 0);
      const elapsedMs = Math.round(BOT_BASE_S[level] * skill * 1000);
      bots.push({ pseudo: names[i % names.length] + (i >= names.length ? i : ''), elapsedMs, penalty, hints,
        totalMs: elapsedMs + penalty * 1000, finishedAt: i, isMe: false });
    }
    return bots;
  }

  async leaderboard(day, level) {
    const rows = this._bots(day, level);
    const mine = this.state.games[`${day}|${level}`];
    if (mine?.finishedAt) {
      rows.push({ pseudo: this.user?.pseudo || 'Moi', elapsedMs: mine.elapsedMs, penalty: mine.penalty,
        hints: mine.hints, totalMs: mine.totalMs, finishedAt: -1, isMe: true });
    }
    rows.sort((a, b) => a.totalMs - b.totalMs || a.finishedAt - b.finishedAt);
    return rows.map((r, i) => ({ ...r, pos: i + 1, n: rows.length }));
  }

  async myGames() {
    const out = [];
    for (const g of Object.values(this.state.games)) {
      let pos = null, n = null;
      if (g.finishedAt) {
        const lb = await this.leaderboard(g.day, g.level);
        const me = lb.find(r => r.isMe);
        pos = me.pos; n = me.n;
      }
      out.push({ day: g.day, level: g.level, finished: !!g.finishedAt, totalMs: g.totalMs, elapsedMs: g.elapsedMs,
        penalty: g.penalty, hints: g.hints, pos, n });
    }
    return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.level - b.level));
  }
}

function createBackend() {
  const cfg = window.SDJ_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) {
    return new SupabaseBackend(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }
  return new LocalBackend();
}
