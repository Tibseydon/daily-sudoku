(() => {
  const { $, esc, formatTime, formatPenalty, formatDay } = UI;
  const backend = createBackend();
  const LV = RULES.levels;
  const PEERS = [...Array(81).keys()].map(i => [...Array(81).keys()].filter(k => k !== i &&
    (Sudoku.ROW[k] === Sudoku.ROW[i] || Sudoku.COL[k] === Sudoku.COL[i] || Sudoku.BOX[k] === Sudoku.BOX[i])));

  let user = null;
  let currentView = null;
  let lastDay = parisToday();

  /* =========================================================== Navigation */

  let inRecovery = false;
  const loggedIn = () => !!user && !user.needsPseudo && !inRecovery;

  function showView(name) {
    if (!loggedIn()) name = 'auth';
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.body.classList.toggle('logged-out', !loggedIn());
    window.scrollTo({ top: 0 });
    if (name === 'home') renderHome();
    if (name === 'leaderboard') renderLeaderboard();
    if (name === 'history') renderHistory();
    if (name === 'rules') renderRules();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b && !b.closest('.modal')) showView(b.dataset.view);
  });

  function renderUserBox() {
    const box = $('#userBox');
    if (!user) { box.innerHTML = ''; return; }
    box.innerHTML = `<span class="avatar">${esc(user.pseudo[0].toUpperCase())}</span>
      <span class="pseudo">${esc(user.pseudo)}</span>
      <button class="btn btn-ghost btn-sm" id="logoutBtn" title="Se déconnecter">⎋</button>`;
    $('#logoutBtn').onclick = logout;
  }

  async function logout() {
    await backend.signOut();
    user = null;
    inRecovery = false;
    renderUserBox();
    showAuthPanel('authForm');
    showView('auth');
  }

  /* =========================================================== Connexion */

  const PSEUDO_RE = /^[\p{L}\p{N}_\-. ]{3,20}$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const AUTH_PANELS = ['authForm', 'authSent', 'resetForm', 'pseudoForm'];
  const PROVIDER_UI = {
    google: {
      label: 'Google',
      icon: `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`,
    },
    discord: {
      label: 'Discord',
      icon: `<svg viewBox="0 0 127.14 96.36" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"/></svg>`,
    },
    github: {
      label: 'GitHub',
      icon: `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
    },
  };

  function showAuthPanel(id) {
    AUTH_PANELS.forEach(p => $(`#${p}`).classList.toggle('hidden', p !== id));
  }

  function onLoggedIn(u) {
    user = u;
    renderUserBox();
    if (user.needsPseudo) {
      $('#pseudoForm [name=pseudo]').value = user.suggestion || '';
      $('#pseudoError').textContent = '';
      showAuthPanel('pseudoForm');
      showView('auth');
    } else {
      showView('home');
    }
  }

  /* Liste des règles de mot de passe, mise à jour à chaque frappe. */
  function bindPolicy(form, box, context) {
    const pw = form.querySelector('[name=password]'), cf = form.querySelector('[name=confirm]');
    let failed = false;
    const render = () => {
      const r = Password.check(pw.value, { confirm: cf.value, ...context() });
      const idle = !pw.value;
      const seg = [1, 2, 3, 4].map(k => `<i class="${!idle && r.score >= k ? 'on' : ''}"></i>`).join('');
      box.innerHTML = `<div class="pw-meter s${idle ? 0 : r.score}">${seg}<span>${idle ? 'Robustesse' : r.level}</span></div>
        <ul class="pw-rules${idle ? ' idle' : ''}">${r.rules.map(x => {
          const st = failed && x.id === 'words' ? 'ko' : x.ok === true ? 'ok' : x.ok === false ? 'ko' : 'wait';
          const label = failed && x.id === 'words' ? 'Dictionnaires indisponibles : recharge la page' : x.label;
          return `<li class="${st}">${esc(label)}</li>`;
        }).join('')}</ul>`;
      return r;
    };
    pw.addEventListener('input', render);
    cf.addEventListener('input', render);
    render();
    const load = () => Password.load().then(render, () => { failed = true; render(); });
    return { render, load };
  }

  function fillGenerated(form, policy) {
    Password.load().then(() => {
      const pw = Password.generate();
      if (!pw) return UI.toast('Réessaie la génération', 'error');
      form.querySelectorAll('[name=password], [name=confirm]').forEach(i => { i.value = pw; i.type = 'text'; });
      form.querySelectorAll('.pw-eye').forEach(b => (b.textContent = '🙈'));
      policy.render();
      UI.toast('Mot de passe généré : enregistre-le dans ton gestionnaire de mots de passe 🔐');
    }, () => UI.toast('Dictionnaires indisponibles : recharge la page', 'error'));
  }

  /* Vérifie la politique + les fuites connues avant d'envoyer un nouveau mot de passe. */
  async function passwordProblem(policy, password) {
    const r = policy.render();
    if (!r.ready) return 'Patiente une seconde : chargement des dictionnaires…';
    if (!r.valid) return 'Le mot de passe ne respecte pas encore toutes les règles ci-dessus.';
    const leaks = await Password.breachCount(password);
    if (leaks) return `Ce mot de passe apparaît dans ${leaks.toLocaleString('fr-FR')} fuite(s) de données connues : choisis-en un autre.`;
    return null;
  }

  let sentCtx = null;
  let resendTimer = null;
  function showSent(kind, email) {
    sentCtx = { kind, email };
    $('#sentTitle').textContent = kind === 'reset' ? 'Lien envoyé !' : 'Vérifie ta boîte mail';
    $('#sentText').innerHTML = kind === 'reset'
      ? `Si un compte existe pour <b>${esc(email)}</b>, tu vas recevoir un lien pour choisir un nouveau mot de passe.`
      : `Un lien de confirmation a été envoyé à <b>${esc(email)}</b>. Clique dessus pour activer ton compte, et tu seras connecté automatiquement.`;
    showAuthPanel('authSent');
    startResendCooldown();
  }
  function startResendCooldown(seconds = 60) {
    const btn = $('#resendBtn');
    clearInterval(resendTimer);
    let left = seconds;
    const upd = () => {
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? `Renvoyer l'email (${left} s)` : "Renvoyer l'email";
      if (left-- <= 0) clearInterval(resendTimer);
    };
    upd();
    resendTimer = setInterval(upd, 1000);
  }

  let authTab = 'signin';
  function setupAuth() {
    const demo = backend.mode === 'demo';
    const form = $('#authForm');
    const err = $('#authError');
    const signupPolicy = bindPolicy(form, $('#signupPolicy'), () => ({
      pseudo: form.querySelector('[name=pseudo]').value, email: form.querySelector('[name=email]').value,
    }));

    const apply = () => {
      const mode = demo ? 'demo' : authTab;
      form.querySelectorAll('[data-only]').forEach(el => el.classList.toggle('hidden', !el.dataset.only.split(' ').includes(mode)));
      document.querySelectorAll('#authTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === authTab));
      form.querySelector('[name=password]').autocomplete = authTab === 'signup' ? 'new-password' : 'current-password';
      $('#authSubmit').textContent = demo ? "C'est parti ! 🚀"
        : { signin: 'Me connecter 🚀', signup: 'Créer mon compte ✨', forgot: 'Envoyer le lien 📧' }[authTab];
      err.textContent = '';
      if (mode === 'signup') signupPolicy.load();
    };
    const setTab = tab => { authTab = tab; showAuthPanel('authForm'); apply(); };
    $('#authTabs').onclick = e => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); };
    $('#forgotLink').onclick = () => setTab('forgot');
    $('#backToSignin').onclick = () => setTab('signin');
    $('#sentBack').onclick = () => setTab('signin');
    $('#genPw').onclick = () => fillGenerated(form, signupPolicy);
    document.querySelectorAll('.pw-eye').forEach(b => (b.onclick = () => {
      const input = b.previousElementSibling;
      input.type = input.type === 'password' ? 'text' : 'password';
      b.textContent = input.type === 'password' ? '👁' : '🙈';
    }));
    apply();

    // Boutons Google / Discord / GitHub (uniquement ceux activés dans Supabase)
    backend.providers().then(list => {
      $('#oauthBox').classList.toggle('empty', !list.length);
      $('#oauthButtons').innerHTML = list.map(p => `<button type="button" class="oauth-btn ${p}" data-provider="${p}">
        ${PROVIDER_UI[p].icon}<span>Continuer avec ${PROVIDER_UI[p].label}</span></button>`).join('');
    });
    $('#oauthButtons').onclick = async e => {
      const b = e.target.closest('[data-provider]');
      if (!b) return;
      b.disabled = true;
      try { await backend.signInWithProvider(b.dataset.provider); }
      catch (ex) { err.textContent = ex.message; b.disabled = false; }
    };

    // Mini grille décorative
    const mini = $('.mini-board');
    const colors = Object.values(LV).map(l => l.color);
    mini.innerHTML = Array.from({ length: 81 }, (_, i) => {
      const show = (i * 37) % 7 < 3;
      return `<i style="${show ? `color:${colors[i % 4]}` : ''}">${show ? ((i * 5) % 9) + 1 : ''}</i>`;
    }).join('');

    form.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(form);
      const pseudo = (f.get('pseudo') || '').trim();
      const email = (f.get('email') || '').trim();
      const password = f.get('password') || '';
      const mode = demo ? 'demo' : authTab;
      err.textContent = '';
      if ((mode === 'demo' || mode === 'signup') && !PSEUDO_RE.test(pseudo)) {
        err.textContent = 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ - .)';
        return;
      }
      if (mode !== 'demo' && !EMAIL_RE.test(email)) { err.textContent = 'Adresse email invalide'; return; }
      if (mode === 'signin' && !password) { err.textContent = 'Entre ton mot de passe'; return; }
      $('#authSubmit').disabled = true;
      try {
        if (mode === 'signup') {
          const problem = await passwordProblem(signupPolicy, password);
          if (problem) { err.textContent = problem; return; }
        }
        if (mode === 'forgot') {
          await backend.sendPasswordReset(email);
          showSent('reset', email);
          return;
        }
        const res = mode === 'demo' ? await backend.signIn({ pseudo })
          : mode === 'signup' ? await backend.signUp({ email, password, pseudo })
          : await backend.signIn({ email, password });
        if (res?.needsConfirm) {
          form.reset();
          signupPolicy.render();
          showSent('signup', email);
        } else {
          form.reset();
          onLoggedIn(res);
        }
      } catch (ex) {
        // Compte pas encore confirmé : on propose directement de renvoyer l'email
        if (/Confirme ton email/.test(ex.message)) showSent('signup', email);
        else err.textContent = ex.message;
      } finally {
        $('#authSubmit').disabled = false;
      }
    };

    $('#resendBtn').onclick = async () => {
      if (!sentCtx) return;
      try {
        if (sentCtx.kind === 'reset') await backend.sendPasswordReset(sentCtx.email);
        else await backend.resendConfirmation(sentCtx.email);
        UI.toast('Email renvoyé 📬');
        startResendCooldown();
      } catch (ex) {
        UI.toast(ex.message, 'error');
      }
    };

    // Nouveau mot de passe après un lien "mot de passe oublié"
    const reset = $('#resetForm');
    const resetPolicy = bindPolicy(reset, $('#resetPolicy'), () => ({ email: user?.email || '', pseudo: user?.pseudo || '' }));
    $('#genPwReset').onclick = () => fillGenerated(reset, resetPolicy);
    reset.onsubmit = async e => {
      e.preventDefault();
      const password = reset.querySelector('[name=password]').value;
      const rerr = $('#resetError');
      rerr.textContent = '';
      $('#resetSubmit').disabled = true;
      try {
        const problem = await passwordProblem(resetPolicy, password);
        if (problem) { rerr.textContent = problem; return; }
        await backend.updatePassword(password);
        reset.reset();
        inRecovery = false;
        UI.toast('Mot de passe mis à jour ✅');
        onLoggedIn(user);
      } catch (ex) {
        rerr.textContent = ex.message;
      } finally {
        $('#resetSubmit').disabled = false;
      }
    };
    reset.startRecovery = () => { showAuthPanel('resetForm'); resetPolicy.load(); };

    // Choix du pseudo (première connexion sociale)
    $('#pseudoForm').onsubmit = async e => {
      e.preventDefault();
      const pseudo = $('#pseudoForm [name=pseudo]').value.trim();
      const perr = $('#pseudoError');
      if (!PSEUDO_RE.test(pseudo)) { perr.textContent = 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ - .)'; return; }
      try { onLoggedIn(await backend.setPseudo(pseudo)); }
      catch (ex) { perr.textContent = ex.message; }
    };
    $('#pseudoLogout').onclick = logout;
  }

  /* =========================================================== Accueil */

  async function renderHome() {
    const today = parisToday();
    const d = formatDay(today);
    $('#homeDate').textContent = `Grilles du ${d}`;
    $('#homeHello').innerHTML = `Salut ${esc(user.pseudo)} 👋`;
    let games = [];
    try { games = await backend.myGames(); } catch (e) { UI.toast(e.message, 'error'); }
    const todays = {};
    games.filter(g => g.day === today).forEach(g => (todays[g.level] = g));
    $('#homeProgress').textContent = `${Object.values(todays).filter(g => g.finished).length}/4`;

    $('#levelCards').innerHTML = [1, 2, 3, 4].map(n => {
      const l = LV[n], g = todays[n];
      let status, cta;
      if (!g) { status = '<span class="tag">✨ Nouvelle grille</span>'; cta = 'Jouer'; }
      else if (!g.finished) { status = '<span class="tag live">⏱ En cours</span>'; cta = 'Reprendre'; }
      else {
        status = `<span class="tag done">✅ ${formatTime(g.totalMs)}</span>
          <span class="lc-rank">#${g.pos}<small>/${g.n}</small></span>${UI.rewardBadges(g.pos, g.n, 22)}`;
        cta = 'Revoir';
      }
      const diff = [1, 2, 3, 4].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('');
      return `<button class="level-card${g?.finished ? ' finished' : ''}" style="--c:${l.color}" data-level="${n}">
        <span class="lc-glow"></span>
        <span class="lc-top"><span class="lc-emoji">${l.emoji}</span><span class="lc-diff" aria-label="Difficulté ${n} sur 4">${diff}</span></span>
        <span class="lc-num">Niveau ${n}</span>
        <span class="lc-name">${l.name}</span>
        <span class="lc-tagline">${l.tagline}</span>
        <span class="lc-status">${status}</span>
        <span class="lc-cta">${cta} →</span>
      </button>`;
    }).join('');
    document.querySelectorAll('.level-card').forEach(c => (c.onclick = () => {
      const n = +c.dataset.level;
      if (todays[n]) openLevel(n); else confirmStart(n);
    }));
  }

  function confirmStart(n) {
    const l = LV[n];
    UI.openModal(`<div class="confirm" style="--c:${l.color}">
      <div class="big-emoji">${l.emoji}</div>
      <h2>Niveau ${n} · ${l.name}</h2>
      <p>Le chrono démarre dès l'affichage de la grille et <b>continue même si tu quittes la page</b>. Prêt ?</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Pas encore</button>
      <button class="btn btn-primary" id="goBtn">Lancer le chrono ⏱</button></div></div>`);
    $('#goBtn').onclick = () => { UI.closeModal(); openLevel(n); };
  }

  function updateCountdown() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map(p => [p.type, p.value]));
    const left = 86400 - (+parts.hour * 3600 + +parts.minute * 60 + +parts.second);
    const pad = n => String(n).padStart(2, '0');
    $('#homeCountdown').textContent = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
    const today = parisToday();
    if (today !== lastDay) { lastDay = today; if (currentView === 'home') renderHome(); }
  }

  /* =========================================================== Jeu */

  const S = { selected: -1, notesMode: false, target: null, busy: false, values: [], notes: [], givens: [], solution: [], revealed: new Set() };
  const isLocked = i => !!S.givens[i] || S.revealed.has(i);
  const progKey = () => `sdj.prog.${user.id}.${S.day}.${S.level}`;

  function buildBoard() {
    $('#board').innerHTML = Array.from({ length: 9 }, (_, b) => `<div class="box">${Array.from({ length: 9 }, (_, k) => {
      const i = (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3);
      return `<button class="cell" data-i="${i}" role="gridcell" aria-label="Ligne ${Sudoku.ROW[i] + 1}, colonne ${Sudoku.COL[i] + 1}"></button>`;
    }).join('')}</div>`).join('');
    $('#board').onclick = e => { const c = e.target.closest('.cell'); if (c) onCellClick(+c.dataset.i); };
  }

  function buildNumpad() {
    $('#numpad').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="np" data-d="${d}">${d}<small></small></button>`).join('');
    $('#numpad').onclick = e => { const b = e.target.closest('.np'); if (b) inputDigit(+b.dataset.d); };
    $('#toolNotes').onclick = toggleNotes;
    $('#toolErase').onclick = erase;
    $('#targetCancel').onclick = () => { S.target = null; renderAll(); };
    $('#targetConfirm').onclick = () => { const cells = targetReveal(); if (cells.length) applyHint(S.target.type, cells); };
  }

  async function openLevel(level) {
    const l = LV[level];
    showView('game');
    $('#view-game').style.setProperty('--c', l.color);
    $('#gameLevel').innerHTML = `${l.emoji} Niveau ${level} · ${l.name}`;
    $('#boardLoading').classList.remove('hidden');
    $('#doneBar').classList.add('hidden');
    Object.assign(S, { level, ready: false, target: null, selected: -1, warnedFull: false, finished: false, penalty: 0, hints: [0, 0, 0, 0, 0] });
    renderAll();
    await new Promise(r => setTimeout(r, 30)); // laisse le spinner s'afficher

    const day = parisToday();
    const gen = Sudoku.generate(day, level);
    let st;
    try { st = await backend.startGame(level, gen.puzzle); }
    catch (e) { UI.toast(e.message, 'error'); showView('home'); return; }
    const solution = st.givens === gen.puzzle ? gen.solution : Sudoku.solve(st.givens);

    S.day = st.day;
    S.givens = st.givens.split('').map(Number);
    S.solution = solution.split('').map(Number);
    S.values = S.givens.slice();
    S.notes = new Array(81).fill(0);
    try {
      const saved = JSON.parse(localStorage.getItem(progKey()));
      if (saved) for (let i = 0; i < 81; i++) if (!S.givens[i]) { S.values[i] = saved.values[i] || 0; S.notes[i] = saved.notes[i] || 0; }
    } catch { /* pas de progression sauvegardée */ }
    applyState(st);
    S.ready = true;
    $('#boardLoading').classList.add('hidden');
    renderAll();
    if (S.finished) showDoneBar();
  }

  function applyState(st) {
    S.startedAt = st.startedAt;
    S.offset = st.serverNow - Date.now();
    S.penalty = st.penalty;
    S.hints = st.hints;
    S.revealed = new Set(st.revealed);
    S.finished = !!st.finishedAt;
    S.elapsedMs = st.elapsedMs;
    S.totalMs = st.totalMs;
    for (const i of S.revealed) { S.values[i] = S.solution[i]; S.notes[i] = 0; }
    if (S.finished) S.values = S.solution.slice();
  }

  function saveProgress() {
    try { localStorage.setItem(progKey(), JSON.stringify({ values: S.values, notes: S.notes })); } catch { /* stockage indisponible */ }
  }

  function tick() {
    if (currentView !== 'game' || !S.ready) return;
    const elapsed = S.finished ? S.elapsedMs : Date.now() + S.offset - S.startedAt;
    $('#timerValue').textContent = formatTime(elapsed + S.penalty * 1000);
    $('#timerPenalty').textContent = S.penalty ? `dont +${formatPenalty(S.penalty)}` : '';
  }

  function conflicts() {
    const bad = new Set();
    for (const unit of Sudoku.UNITS) {
      const seen = {};
      for (const i of unit) if (S.values[i]) (seen[S.values[i]] ||= []).push(i);
      for (const list of Object.values(seen)) if (list.length > 1) list.forEach(i => bad.add(i));
    }
    return bad;
  }

  function targetCells() {
    const t = S.target;
    if (!t || t.cell < 0) return [];
    const i = t.cell;
    if (t.type === 2) return [i];
    if (t.type === 4) return [...Array(81).keys()].filter(k => t.orient === 'row' ? Sudoku.ROW[k] === Sudoku.ROW[i] : Sudoku.COL[k] === Sudoku.COL[i]);
    if (t.type === 5) return [...Array(81).keys()].filter(k => Sudoku.BOX[k] === Sudoku.BOX[i]);
    return [];
  }
  // Cases effectivement révélées : rien si la zone est déjà entièrement juste
  function targetReveal() {
    const cells = targetCells();
    if (!cells.some(i => S.values[i] !== S.solution[i])) return [];
    return cells.filter(i => !isLocked(i));
  }

  let popCells = new Set();
  function renderBoard() {
    const sel = S.selected, selVal = sel >= 0 ? S.values[sel] : 0;
    const bad = conflicts();
    const preview = new Set(targetCells());
    document.querySelectorAll('#board .cell').forEach(el => {
      const i = +el.dataset.i, v = S.values[i];
      const peer = sel >= 0 && !S.target && PEERS[sel].includes(i);
      el.className = 'cell' +
        (S.givens[i] ? ' given' : S.revealed.has(i) ? ' revealed' : v ? ' user' : '') +
        (i === sel && !S.target ? ' selected' : '') + (peer ? ' peer' : '') +
        (!S.target && selVal && v === selVal && i !== sel ? ' same' : '') +
        (bad.has(i) && !S.finished ? ' conflict' : '') + (preview.has(i) ? ' preview' : '') +
        (S.target && S.target.cell === i ? ' aim' : '') + (popCells.has(i) ? ' pop' : '') + (S.finished ? ' solved' : '');
      if (v) el.textContent = v;
      else if (S.notes[i]) el.innerHTML = `<span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<i>${S.notes[i] & (1 << d) ? d : ''}</i>`).join('')}</span>`;
      else el.textContent = '';
    });
  }

  function renderNumpad() {
    const counts = Array(10).fill(0);
    S.values.forEach(v => counts[v]++);
    document.querySelectorAll('#numpad .np').forEach(b => {
      const d = +b.dataset.d, left = 9 - counts[d];
      b.classList.toggle('done', left <= 0);
      b.querySelector('small').textContent = left > 0 ? left : '✓';
      b.disabled = S.finished;
    });
    $('#toolNotes').classList.toggle('active', S.notesMode);
    $('#toolNotes').setAttribute('aria-pressed', S.notesMode);
    $('#numpad').classList.toggle('notes-mode', S.notesMode);
    $('#toolNotes').disabled = $('#toolErase').disabled = S.finished;
  }

  function renderHints() {
    $('#hints').innerHTML = RULES.hints.map(h => {
      const used = S.hints?.[h.type - 1] || 0, left = h.quota - used;
      const dots = Array.from({ length: h.quota }, (_, k) => `<i class="${k < left ? 'on' : ''}"></i>`).join('');
      return `<button class="hint${S.target?.type === h.type ? ' active' : ''}" data-type="${h.type}" ${left <= 0 || S.finished || !S.ready ? 'disabled' : ''}>
        <span class="hint-icon">${h.icon}</span>
        <span class="hint-body"><b>${h.name}</b><small>${h.desc}</small></span>
        <span class="hint-meta"><em>+${formatPenalty(h.penalty)}</em><span class="dots" aria-label="${left} restant(s)">${dots}</span></span>
      </button>`;
    }).join('');
    document.querySelectorAll('#hints .hint').forEach(b => (b.onclick = () => onHint(+b.dataset.type)));
  }

  function renderTargetBar() {
    const bar = $('#targetBar'), t = S.target;
    bar.classList.toggle('hidden', !t);
    if (!t) return;
    const h = RULES.hints[t.type - 1];
    let msg;
    if (t.type === 2) msg = t.cell < 0 ? '🎯 Clique sur la case à révéler' : '🎯 Case ciblée. On la révèle ?';
    if (t.type === 4) {
      if (t.cell < 0) msg = '📏 Clique sur une case vide pour viser sa <b>ligne</b>. Reclique dessus pour passer à la <b>colonne</b>.';
      else {
        const isRow = t.orient === 'row';
        msg = `📏 ${isRow ? 'Ligne' : 'Colonne'} ${(isRow ? Sudoku.ROW : Sudoku.COL)[t.cell] + 1} ciblée — reclique sur la case pour passer en ${isRow ? 'colonne' : 'ligne'}.`;
      }
    }
    if (t.type === 5) msg = t.cell < 0 ? '🧊 Clique sur une case du carré 3×3 à révéler' : `🧊 Carré ${Sudoku.BOX[t.cell] + 1} ciblé. On le révèle ?`;
    const can = targetReveal().length > 0;
    if (t.cell >= 0 && !can) msg += ' <span class="muted">(déjà complet et juste)</span>';
    $('#targetMsg').innerHTML = msg;
    $('#targetConfirm').disabled = !can || S.busy;
    $('#targetConfirm').textContent = `Révéler (+${formatPenalty(h.penalty)})`;
  }

  function renderAll() {
    renderBoard(); renderNumpad(); renderHints(); renderTargetBar(); tick();
  }

  function onCellClick(i) {
    if (S.finished || !S.ready) return;
    const t = S.target;
    if (!t) { S.selected = i; renderBoard(); return; }
    if (t.type === 2) {
      if (isLocked(i) || S.values[i] === S.solution[i]) return UI.toast('Choisis une case vide (ou fausse) 🎯');
      t.cell = i;
    } else if (t.type === 4) {
      if (isLocked(i) || S.values[i]) return UI.toast('Clique sur une case vide pour viser sa ligne 📏');
      if (t.cell === i) t.orient = t.orient === 'row' ? 'col' : 'row';
      else { t.cell = i; t.orient = 'row'; }
    } else if (t.type === 5) {
      t.cell = i;
    }
    S.selected = i;
    renderBoard(); renderTargetBar();
  }

  function inputDigit(d) {
    const i = S.selected;
    if (S.finished || S.target || !S.ready || i < 0 || isLocked(i)) return;
    if (S.notesMode) {
      if (S.values[i]) return;
      S.notes[i] ^= 1 << d;
    } else {
      S.values[i] = S.values[i] === d ? 0 : d;
      S.notes[i] = 0;
      if (S.values[i]) PEERS[i].forEach(k => (S.notes[k] &= ~(1 << d)));
    }
    saveProgress(); renderBoard(); renderNumpad(); checkComplete();
  }

  function erase() {
    const i = S.selected;
    if (S.finished || S.target || i < 0 || isLocked(i)) return;
    S.values[i] = 0; S.notes[i] = 0;
    saveProgress(); renderBoard(); renderNumpad();
  }

  function toggleNotes() { S.notesMode = !S.notesMode; renderNumpad(); }

  function onHint(type) {
    if (S.busy || S.finished) return;
    if (S.target?.type === type) { S.target = null; renderAll(); return; }
    const h = RULES.hints[type - 1];
    if (!h.target) {
      const pool = [...Array(81).keys()].filter(i => !isLocked(i) && S.values[i] !== S.solution[i]);
      if (!pool.length) return UI.toast('Plus rien à révéler !');
      const cells = pool.sort(() => Math.random() - 0.5).slice(0, type === 3 ? 3 : 1);
      S.target = null;
      applyHint(type, cells);
      return;
    }
    S.target = { type, cell: -1, orient: 'row' };
    const sel = S.selected;
    if (sel >= 0 && !isLocked(sel)) {
      if (type === 5 || (type === 2 && S.values[sel] !== S.solution[sel]) || (type === 4 && !S.values[sel])) S.target.cell = sel;
    }
    renderAll();
  }

  async function applyHint(type, cells) {
    const h = RULES.hints[type - 1];
    S.busy = true; renderTargetBar();
    try {
      const st = await backend.useHint(S.day, S.level, type, cells);
      applyState(st);
      popCells = new Set(cells);
      setTimeout(() => { popCells = new Set(); renderBoard(); }, 700);
      floatPenalty(`+${formatPenalty(h.penalty)}`);
      S.target = null;
    } catch (e) {
      UI.toast(e.message, 'error');
    }
    S.busy = false;
    saveProgress(); renderAll(); checkComplete();
  }

  function floatPenalty(text) {
    const f = document.createElement('span');
    f.className = 'penalty-float';
    f.textContent = text;
    $('#timer').appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  function checkComplete() {
    if (S.finished || S.busy) return;
    if (S.values.some(v => !v)) { S.warnedFull = false; return; }
    if (S.values.every((v, i) => v === S.solution[i])) finishGame();
    else if (!S.warnedFull) { S.warnedFull = true; UI.toast('Grille complète… mais il reste des erreurs 🤔', 'warn'); }
  }

  async function finishGame() {
    S.busy = true;
    try {
      const st = await backend.finishGame(S.day, S.level, S.values.join(''));
      applyState(st);
      S.busy = false;
      renderAll();
      const me = await myResult(S.day, S.level);
      UI.confetti();
      showResult(me);
      showDoneBar(me);
    } catch (e) {
      S.busy = false;
      UI.toast(e.message, 'error');
    }
  }

  async function myResult(day, level) {
    const lb = await backend.leaderboard(day, level);
    const me = lb.find(r => r.isMe);
    if (me) return me;
    return (await backend.myGames()).find(g => g.day === day && g.level === level);
  }

  function showResult(me) {
    const l = LV[S.level];
    const trophy = RULES.trophyFor(me?.pos), medal = RULES.medalFor(me?.pos, me?.n);
    const big = trophy ? UI.trophySVG(trophy, 96) : medal ? UI.medalSVG(medal, 80) : '';
    const reward = [trophy && `Trophée <b>${RULES.tiers[trophy].label}</b>`, medal && `Médaille <b>${RULES.tiers[medal].label}</b>`].filter(Boolean).join(' + ');
    const next = S.level < 4 ? S.level + 1 : null;
    UI.openModal(`<div class="result" style="--c:${l.color}">
      <div class="result-badge">${big}</div>
      <h2>${trophy ? 'Incroyable ! 🤩' : 'Bravo ! 🎉'}</h2>
      <p class="result-level">${l.emoji} Niveau ${S.level} · ${l.name}</p>
      <div class="result-score">${formatTime(S.totalMs)}</div>
      <div class="result-break"><span>⏱ Temps ${formatTime(S.elapsedMs)}</span><span>💡 Pénalités +${formatPenalty(S.penalty)}</span></div>
      ${me ? `<p class="result-rank">Rang <b>#${me.pos}</b> sur ${me.n}${reward ? ` · ${reward}` : ''}</p>` : ''}
      <p class="muted small">Classement provisoire : il évolue jusqu'à minuit.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="resLb">🏆 Classement</button>
        ${next ? `<button class="btn btn-primary" id="resNext">Niveau ${next} ${LV[next].emoji} →</button>` : `<button class="btn btn-primary" data-close id="resHome">🏠 Accueil</button>`}
      </div></div>`);
    $('#resLb').onclick = () => { UI.closeModal(); lb.level = S.level; lb.day = S.day; showView('leaderboard'); };
    if (next) $('#resNext').onclick = async () => {
      UI.closeModal();
      const started = (await backend.myGames()).some(g => g.day === S.day && g.level === next);
      if (started) openLevel(next); else { showView('home'); confirmStart(next); }
    };
    else $('#resHome').onclick = () => showView('home');
  }

  async function showDoneBar(me) {
    me ||= await myResult(S.day, S.level).catch(() => null);
    const bar = $('#doneBar');
    bar.innerHTML = `<span>✅ Terminée en <b>${formatTime(S.totalMs)}</b>${me ? ` · rang <b>#${me.pos}</b>/${me.n}` : ''}</span>
      ${me ? UI.rewardBadges(me.pos, me.n, 22) : ''}
      <button class="btn btn-primary btn-sm" id="doneLb">Classement →</button>`;
    bar.classList.remove('hidden');
    $('#doneLb').onclick = () => { lb.level = S.level; lb.day = S.day; showView('leaderboard'); };
  }

  document.addEventListener('keydown', e => {
    if (currentView !== 'game' || !$('#modal').classList.contains('hidden') || e.target.matches?.('input, textarea')) return;
    if (e.key === 'Escape' && S.target) { S.target = null; renderAll(); return; }
    if (/^[1-9]$/.test(e.key)) { inputDigit(+e.key); e.preventDefault(); return; }
    if (['Backspace', 'Delete', '0'].includes(e.key)) { erase(); e.preventDefault(); return; }
    if (e.key === 'n' || e.key === 'N') { toggleNotes(); return; }
    const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (mv && !S.finished) {
      e.preventDefault();
      let i = S.selected < 0 ? 40 : S.selected;
      if (mv === -1 && i % 9 === 0) i += 8; else if (mv === 1 && i % 9 === 8) i -= 8; else i = (i + mv + 81) % 81;
      if (S.target) onCellClick(i); else { S.selected = i; renderBoard(); }
    }
  });

  /* =========================================================== Classement */

  const lb = { level: 1, day: null };
  async function renderLeaderboard() {
    const today = parisToday();
    lb.day ||= today;
    const dateInput = $('#lbDate');
    dateInput.max = today;
    dateInput.value = lb.day;
    dateInput.onchange = () => { if (dateInput.value) { lb.day = dateInput.value > today ? today : dateInput.value; renderLeaderboard(); } };
    $('#lbLevels').innerHTML = [1, 2, 3, 4].map(n => `<button class="pill${n === lb.level ? ' active' : ''}" style="--c:${LV[n].color}" data-l="${n}">
      <i></i>${LV[n].emoji} ${LV[n].name}</button>`).join('');
    $('#lbLevels').onclick = e => { const p = e.target.closest('[data-l]'); if (p) { lb.level = +p.dataset.l; renderLeaderboard(); } };
    $('#lbNote').textContent = (lb.day === today ? `Classement provisoire du ${formatDay(lb.day)} : les médailles évoluent jusqu'à minuit.` : `Classement final du ${formatDay(lb.day)}.`) +
      (backend.mode === 'demo' ? ' (Mode démo : adversaires simulés.)' : '');

    let rows = [];
    try { rows = await backend.leaderboard(lb.day, lb.level); } catch (e) { UI.toast(e.message, 'error'); }
    $('#lbEmpty').classList.toggle('hidden', rows.length > 0);
    $('#lbTable').classList.toggle('hidden', rows.length === 0);

    const top = rows.slice(0, 4);
    const order = [1, 0, 2, 3].filter(k => top[k]);
    $('#podium').innerHTML = order.map(k => {
      const r = top[k], tier = RULES.trophyFor(r.pos);
      return `<div class="podium-step p${r.pos}${r.isMe ? ' me' : ''}">
        ${UI.trophySVG(tier, r.pos === 1 ? 64 : 50)}
        <span class="podium-name">${esc(r.pseudo)}</span>
        <span class="podium-time">${formatTime(r.totalMs)}</span>
        <span class="podium-block">${r.pos}<small>${RULES.tiers[tier].label}</small></span>
      </div>`;
    }).join('');

    $('#lbTable tbody').innerHTML = rows.map(r => `<tr class="${r.isMe ? 'me' : ''}">
      <td class="pos">${r.pos}</td>
      <td>${UI.rewardBadges(r.pos, r.n, 22)}</td>
      <td class="player">${esc(r.pseudo)}${r.isMe ? ' <span class="you">toi</span>' : ''}</td>
      <td class="num score">${formatTime(r.totalMs)}</td>
      <td class="num hide-sm">${formatTime(r.elapsedMs)}</td>
      <td class="num hide-sm">${r.penalty ? '+' + formatPenalty(r.penalty) : '—'}</td></tr>`).join('');
  }

  /* =========================================================== Historique */

  const chartState = { metric: 'time', levels: new Set([1, 2, 3, 4]), games: [] };

  async function renderHistory() {
    let games = [];
    try { games = await backend.myGames(); } catch (e) { UI.toast(e.message, 'error'); }
    chartState.games = games;
    const done = games.filter(g => g.finished);
    const today = parisToday();

    const playedDays = new Set(done.map(g => g.day));
    let streak = 0, d = playedDays.has(today) ? today : UI.addDays(today, -1);
    while (playedDays.has(d)) { streak++; d = UI.addDays(d, -1); }
    const best = done.length ? Math.min(...done.map(g => g.pos)) : null;
    const trophies = done.filter(g => RULES.trophyFor(g.pos)).length;
    $('#stats').innerHTML = [
      ['🧩', done.length, 'grilles terminées'],
      ['🗓️', playedDays.size, 'jours joués'],
      ['🔥', streak, `jour${streak > 1 ? 's' : ''} de série`],
      ['🥇', best ? `#${best}` : '—', 'meilleur rang'],
      ['🏆', trophies, `trophée${trophies > 1 ? 's' : ''}`],
    ].map(([i, v, l]) => `<div class="stat glass"><span>${i}</span><b>${v}</b><small>${l}</small></div>`).join('');

    const count = (fn, tier) => done.filter(g => fn(g) === tier).length;
    const tierItem = (svg, label, n) => `<div class="cab-item${n ? '' : ' zero'}">${svg}<span>${label}</span><b>×${n}</b></div>`;
    $('#cabinet').innerHTML =
      `<div class="cab-group"><h4>Trophées (top 4 du jour)</h4><div class="cab-row">${['gold', 'silver', 'bronze', 'chocolate']
        .map(t => tierItem(UI.trophySVG(t, 44), RULES.tiers[t].label, count(g => RULES.trophyFor(g.pos), t))).join('')}</div></div>
       <div class="cab-group"><h4>Médailles</h4><div class="cab-row">${['gold', 'silver', 'bronze', 'chocolate', 'finisher']
        .map(t => tierItem(UI.medalSVG(t, 36), RULES.tiers[t].label, count(g => RULES.medalFor(g.pos, g.n), t))).join('')}</div></div>`;

    $('#chartMetric').onclick = e => {
      const b = e.target.closest('[data-metric]'); if (!b) return;
      chartState.metric = b.dataset.metric;
      document.querySelectorAll('#chartMetric button').forEach(x => x.classList.toggle('active', x === b));
      drawChart();
    };
    $('#chartLevels').onclick = e => {
      const p = e.target.closest('[data-l]'); if (!p) return;
      const n = +p.dataset.l;
      if (chartState.levels.has(n) && chartState.levels.size > 1) chartState.levels.delete(n); else chartState.levels.add(n);
      drawChart();
    };
    drawChart();

    $('#histEmpty').classList.toggle('hidden', games.length > 0);
    $('#histTable').classList.toggle('hidden', games.length === 0);
    $('#histTable tbody').innerHTML = games.map(g => {
      const l = LV[g.level];
      const status = g.finished ? UI.rewardBadges(g.pos, g.n, 22) : `<span class="tag${g.day === today ? ' live' : ''}">${g.day === today ? '⏱ En cours' : 'Non terminée'}</span>`;
      return `<tr><td>${formatDay(g.day, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
        <td><span class="lvl-dot" style="--c:${l.color}"></span>${l.emoji} ${l.name}</td>
        <td class="num score">${g.finished ? formatTime(g.totalMs) : '—'}</td>
        <td class="num hide-sm">${g.penalty ? '+' + formatPenalty(g.penalty) : '—'}</td>
        <td class="num">${g.finished ? `#${g.pos}<small class="muted">/${g.n}</small>` : '—'}</td>
        <td>${status}</td></tr>`;
    }).join('');
  }

  function drawChart() {
    const { metric, levels, games } = chartState;
    $('#chartTitle').textContent = metric === 'time' ? 'Évolution de mon score' : 'Évolution de mon classement';
    $('#chartLevels').innerHTML = [1, 2, 3, 4].map(n => `<button class="pill${levels.has(n) ? ' active' : ''}" style="--c:${LV[n].color}" data-l="${n}"><i></i>${LV[n].name}</button>`).join('') +
      `<span class="muted small chart-hint">↓ plus bas = meilleur</span>`;
    const done = games.filter(g => g.finished);
    const today = parisToday();
    const first = done.length ? done.map(g => g.day).sort()[0] : today;
    let start = UI.addDays(today, -29);
    if (first > start) start = first;
    const days = [];
    for (let d = start; d <= today; d = UI.addDays(d, 1)) days.push(d);
    const series = [1, 2, 3, 4].filter(n => levels.has(n)).map(n => ({
      key: n, label: LV[n].name, color: LV[n].color,
      points: done.filter(g => g.level === n && g.day >= start)
        .map(g => ({ day: g.day, y: metric === 'time' ? g.totalMs / 1000 : (g.pos / g.n) * 100 })),
    }));
    UI.lineChart($('#chart'), series, {
      days: done.length ? days : [],
      formatY: metric === 'time' ? v => formatTime(v * 1000) : v => `top ${Math.round(v)} %`,
    });
  }

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (currentView === 'history') drawChart(); }, 150);
  });

  /* =========================================================== Règles */

  function renderRules() {
    const ranks = ['1er', '2e', '3e', '4e'];
    $('#rulesTrophies').innerHTML = ['gold', 'silver', 'bronze', 'chocolate'].map((t, k) =>
      `<div class="reward-row">${UI.trophySVG(t, 40)}<span><b>${RULES.tiers[t].label}</b><small>${ranks[k]} du jour</small></span></div>`).join('');
    const pct = { gold: 'Top 5 %', silver: 'Top 10 %', bronze: 'Top 15 %', chocolate: 'Top 20 %', finisher: 'Tous les autres' };
    $('#rulesMedals').innerHTML = Object.keys(pct).map(t =>
      `<div class="reward-row">${UI.medalSVG(t, 32)}<span><b>${RULES.tiers[t].label}</b><small>${pct[t]}</small></span></div>`).join('');
    $('#rulesHints').innerHTML = `<table class="table compact"><thead><tr><th>Indice</th><th>Effet</th><th class="num">Dispo</th><th class="num">Pénalité</th></tr></thead><tbody>${RULES.hints.map(h =>
      `<tr><td>${h.icon} <b>${h.name}</b></td><td>${h.desc}</td><td class="num">×${h.quota}</td><td class="num">+${formatPenalty(h.penalty)}</td></tr>`).join('')}</tbody></table>`;
  }

  /* =========================================================== Démarrage */

  async function boot() {
    const cfg = window.SDJ_CONFIG || {};
    $('#demoBanner').classList.toggle('hidden', backend.mode !== 'demo');
    if (cfg.SUPABASE_URL && backend.mode === 'demo') UI.toast('Supabase injoignable : passage en mode démo', 'error');
    buildBoard();
    buildNumpad();
    setupAuth();
    try { user = await backend.init(); } catch (e) { UI.toast(e.message, 'error'); }
    if (backend.urlError) { $('#authError').textContent = backend.urlError; UI.toast(backend.urlError, 'error'); }
    if (user && backend.recovery) {
      // Arrivée par le lien "mot de passe oublié" : on impose le choix d'un nouveau mot de passe
      inRecovery = true;
      renderUserBox();
      $('#resetForm').startRecovery();
      showView('auth');
    } else if (user) {
      onLoggedIn(user);
    } else {
      renderUserBox();
      showView('auth');
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);
    setInterval(tick, 250);
  }
  boot();
})();
