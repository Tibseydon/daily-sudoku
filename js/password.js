/* Politique de mot de passe (inscription par email et réinitialisation).
   - 12 caractères min., 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
     (mêmes règles que le réglage « Password requirements » de Supabase, qui les applique côté serveur).
   - Aucun mot des dictionnaires français et anglais (mots courants, Wikipédia, mots de passe
     courants, liste Diceware), y compris écrit en leetspeak (P@ssw0rd), à l'envers ou caché dans le mot de passe.
   - Robustesse zxcvbn « forte » minimum, ni pseudo ni email dans le mot de passe.
   - Vérification à l'envoi dans la base des mots de passe ayant fuité (Have I Been Pwned, k-anonymat :
     seuls les 5 premiers caractères du hash SHA-1 quittent le navigateur).
   Les dictionnaires (~2 Mo) sont chargés à la demande, uniquement sur les formulaires concernés. */
const Password = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@zxcvbn-ts/';
  const PACKAGES = ['core@4.2.0', 'language-common@4.1.3', 'language-en@4.1.1', 'language-fr@4.1.2'];
  // Caractères spéciaux acceptés par Supabase
  const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';
  const LEET = { 0: 'o', 1: 'i', '!': 'i', '|': 'l', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b', 9: 'g', '€': 'e' };
  const MIN_WORD = 4;

  let loading = null;
  let factory = null;
  let words = null;

  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Chargement impossible'));
    document.head.appendChild(s);
  });

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function load() {
    if (factory) return Promise.resolve();
    loading ||= PACKAGES.reduce((p, pkg) => p.then(() => loadScript(`${CDN}${pkg}/dist/zxcvbn-ts.js`)), Promise.resolve())
      .then(() => {
        const z = window.zxcvbnts;
        const dictionary = { ...z['language-common'].dictionary, ...z['language-en'].dictionary, ...z['language-fr'].dictionary };
        factory = new z.core.ZxcvbnFactory({
          dictionary,
          graphs: z['language-common'].adjacencyGraphs,
          translations: z['language-fr'].translations,
        });
        // Dictionnaire de blocage : tous les mots sauf prénoms et noms de famille
        words = new Set();
        for (const [name, list] of Object.entries(dictionary)) {
          if (/^(firstnames|lastnames)/.test(name)) continue;
          for (const w of list) {
            const n = norm(String(w));
            if (n.length >= MIN_WORD && /^[a-z]+$/.test(n)) words.add(n);
          }
        }
      })
      .catch(e => { loading = null; throw e; });
    return loading;
  }

  /* Cherche tout mot du dictionnaire (≥ 4 lettres) caché dans le mot de passe, en clair, en leetspeak ou à l'envers. */
  function findWords(pw) {
    if (!words) return [];
    const found = new Set();
    const base = norm(pw);
    const variants = [
      [...base].map(c => LEET[c] || c).join(''),
      [...base].map(c => (c === '1' ? 'l' : LEET[c] || c)).join(''),
    ];
    for (const v of variants) {
      for (const s of [v, [...v].reverse().join('')]) {
        for (const run of s.match(/[a-z]+/g) || []) {
          for (let i = 0; i < run.length; i++) {
            for (let j = i + MIN_WORD; j <= run.length; j++) {
              const sub = run.slice(i, j);
              if (words.has(sub)) found.add(sub);
            }
          }
        }
      }
    }
    return [...found].sort((a, b) => b.length - a.length);
  }

  function personalParts({ pseudo, email }) {
    const parts = [];
    if (pseudo) parts.push(norm(pseudo).replace(/[^a-z0-9]/g, ''));
    if (email) parts.push(...norm(email.split('@')[0]).split(/[^a-z0-9]+/));
    return parts.filter(p => p.length >= 3);
  }

  const LEVELS = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Excellent'];

  function check(pw, { confirm = null, pseudo = '', email = '' } = {}) {
    const ready = !!factory;
    const found = ready ? findWords(pw) : [];
    const personal = personalParts({ pseudo, email }).find(p => norm(pw).includes(p));
    const score = ready && pw ? factory.check(pw, [pseudo, email].filter(Boolean)).score : 0;
    const rules = [
      { id: 'len', ok: pw.length >= 12, label: '12 caractères minimum' },
      { id: 'upper', ok: /[A-Z]/.test(pw), label: '1 majuscule' },
      { id: 'lower', ok: /[a-z]/.test(pw), label: '1 minuscule' },
      { id: 'digit', ok: /[0-9]/.test(pw), label: '1 chiffre' },
      { id: 'symbol', ok: [...pw].some(c => SYMBOLS.includes(c)), label: '1 caractère spécial ( ! @ # $ % & * ? … )' },
      {
        id: 'words', ok: ready ? pw.length > 0 && !found.length : null,
        label: !ready ? 'Aucun mot du dictionnaire (chargement des dictionnaires…)'
          : found.length ? `Aucun mot du dictionnaire : « ${found[0]} » trouvé` : 'Aucun mot du dictionnaire (FR / EN)',
      },
      { id: 'personal', ok: pw.length > 0 && !personal, label: 'Ne contient ni ton pseudo ni ton email' },
      { id: 'strength', ok: ready ? score >= 3 : null, label: `Robustesse forte${ready && pw ? ` (actuelle : ${LEVELS[score].toLowerCase()})` : ''}` },
    ];
    if (confirm !== null) rules.push({ id: 'match', ok: confirm.length > 0 && confirm === pw, label: 'Confirmation identique' });
    return { rules, score, level: LEVELS[score], ready, valid: rules.every(r => r.ok === true) };
  }

  /* Nombre d'apparitions du mot de passe dans des fuites connues (0 si inconnu ou service injoignable). */
  async function breachCount(pw) {
    try {
      const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
      const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
      if (!res.ok) return 0;
      const line = (await res.text()).split('\n').find(l => l.startsWith(hex.slice(5)));
      return line ? parseInt(line.split(':')[1], 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /* Génère un mot de passe aléatoire (crypto) qui respecte toute la politique. */
  function generate(length = 16) {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?-_+='];
    const all = sets.join('');
    const rnd = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
    for (let attempt = 0; attempt < 200; attempt++) {
      const chars = sets.map(s => s[rnd(s.length)]);
      while (chars.length < length) chars.push(all[rnd(all.length)]);
      for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
      const pw = chars.join('');
      if (check(pw).rules.every(r => r.ok !== false)) return pw;
    }
    return null;
  }

  return { load, check, breachCount, generate, isReady: () => !!factory };
})();
