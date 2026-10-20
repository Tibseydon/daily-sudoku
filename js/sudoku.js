/* Moteur Sudoku : génération déterministe (même grille pour tous chaque jour),
   résolution par bitmasks, vérification d'unicité et solveur "singles" pour noter la difficulté. */
const Sudoku = (() => {
  const ROW = [], COL = [], BOX = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9);
    COL[i] = i % 9;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  const UNITS = [];
  for (let u = 0; u < 9; u++) {
    UNITS.push([...Array(81).keys()].filter(i => ROW[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => COL[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => BOX[i] === u));
  }
  const ALL = 0x3fe; // bits 1..9

  const popcount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const digitsOf = m => { const d = []; for (let v = 1; v <= 9; v++) if (m & (1 << v)) d.push(v); return d; };

  function seedFrom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* Compte les solutions (jusqu'à `limit`) ; renvoie aussi la première trouvée. */
  function solveCount(grid, limit = 2, rng = null) {
    const g = grid.slice();
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const b = 1 << v;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & b) return { count: 0, solution: null };
      rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
    }
    let count = 0, solution = null;
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & ALL;
        const n = popcount(m);
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!solution) solution = g.slice(); return count >= limit; }
      if (bestN === 0) return false;
      const ds = digitsOf(bestMask);
      if (rng) shuffle(ds, rng);
      const r = ROW[best], c = COL[best], x = BOX[best];
      for (const d of ds) {
        const b = 1 << d;
        g[best] = d; rows[r] |= b; cols[c] |= b; boxes[x] |= b;
        if (rec()) return true;
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[x] &= ~b;
      }
      return false;
    }
    rec();
    return { count, solution };
  }

  /* ------------------------------------------------------------------ Solveur « humain »
     Résout la grille uniquement par déduction, comme un joueur, sans jamais deviner.
     Chaque technique a un niveau ; le solveur renvoie le niveau le plus élevé dont il a eu besoin.
       1 : singletons (nu et caché)
       2 : candidats verrouillés (pointage / réclamation)
       3 : paires et triplets (nus et cachés)
       4 : X-Wing, Swordfish, XY-Wing
     Une grille résolue ainsi a forcément une solution unique (chaque déduction est valable pour toute solution). */
  const BOXES = UNITS.filter((_, k) => k % 3 === 2);
  const LINES = UNITS.filter((_, k) => k % 3 !== 2);
  const ROWS = UNITS.filter((_, k) => k % 3 === 0);
  const COLS = UNITS.filter((_, k) => k % 3 === 1);
  const PEERS = [...Array(81).keys()].map(i => [...Array(81).keys()].filter(k => k !== i &&
    (ROW[k] === ROW[i] || COL[k] === COL[i] || BOX[k] === BOX[i])));
  const SEES = new Uint8Array(81 * 81);
  PEERS.forEach((ps, i) => ps.forEach(k => (SEES[i * 81 + k] = 1)));

  function combos(arr, k, start = 0, acc = [], out = []) {
    if (acc.length === k) { out.push(acc.slice()); return out; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); combos(arr, k, i + 1, acc, out); acc.pop(); }
    return out;
  }

  const TECHNIQUES = ['', 'singletons', 'candidats verrouillés', 'paires / triplets', 'X-Wing / Swordfish / XY-Wing'];

  function logicSolve(puzzle, maxLevel = 4) {
    const g = (typeof puzzle === 'string' ? puzzle.split('').map(Number) : puzzle.slice());
    const cand = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let used = 0;
      for (const p of PEERS[i]) if (g[p]) used |= 1 << g[p];
      cand[i] = ~used & ALL;
    }
    const place = (i, d) => {
      g[i] = d; cand[i] = 0;
      const b = ~(1 << d);
      for (const p of PEERS[i]) cand[p] &= b;
    };
    const elim = (cells, bits) => {
      let changed = false;
      for (const i of cells) if (!g[i] && (cand[i] & bits)) { cand[i] &= ~bits; changed = true; }
      return changed;
    };
    const where = (unit, d) => unit.filter(i => !g[i] && (cand[i] & (1 << d)));

    const nakedSingle = () => {
      for (let i = 0; i < 81; i++) if (!g[i] && popcount(cand[i]) === 1) { place(i, digitsOf(cand[i])[0]); return true; }
      return false;
    };
    const hiddenSingle = () => {
      for (const unit of UNITS) for (let d = 1; d <= 9; d++) {
        const w = where(unit, d);
        if (w.length === 1) { place(w[0], d); return true; }
      }
      return false;
    };
    const lockedCandidates = () => {
      for (const box of BOXES) for (let d = 1; d <= 9; d++) {
        const w = where(box, d);
        if (w.length < 2) continue;
        const b = 1 << d, bx = BOX[w[0]];
        if (w.every(i => ROW[i] === ROW[w[0]]) && elim(ROWS[ROW[w[0]]].filter(i => BOX[i] !== bx), b)) return true;
        if (w.every(i => COL[i] === COL[w[0]]) && elim(COLS[COL[w[0]]].filter(i => BOX[i] !== bx), b)) return true;
      }
      for (const line of LINES) for (let d = 1; d <= 9; d++) {
        const w = where(line, d);
        if (w.length < 2 || !w.every(i => BOX[i] === BOX[w[0]])) continue;
        if (elim(BOXES[BOX[w[0]]].filter(i => !line.includes(i)), 1 << d)) return true;
      }
      return false;
    };
    const nakedSubsets = () => {
      for (const k of [2, 3]) for (const unit of UNITS) {
        const cells = unit.filter(i => !g[i] && popcount(cand[i]) <= k);
        for (const set of combos(cells, k)) {
          const union = set.reduce((m, i) => m | cand[i], 0);
          if (popcount(union) === k && elim(unit.filter(i => !set.includes(i)), union)) return true;
        }
      }
      return false;
    };
    const hiddenSubsets = () => {
      for (const k of [2, 3]) for (const unit of UNITS) {
        const digits = [];
        for (let d = 1; d <= 9; d++) { const n = where(unit, d).length; if (n >= 2 && n <= k) digits.push(d); }
        for (const set of combos(digits, k)) {
          const cells = [...new Set(set.flatMap(d => where(unit, d)))];
          if (cells.length !== k) continue;
          const keep = set.reduce((m, d) => m | (1 << d), 0);
          let changed = false;
          for (const i of cells) if (cand[i] & ~keep) { cand[i] &= keep; changed = true; }
          if (changed) return true;
        }
      }
      return false;
    };
    const fish = () => {
      for (const k of [2, 3]) for (let d = 1; d <= 9; d++) {
        const b = 1 << d;
        for (const [base, cover, pos] of [[ROWS, COLS, COL], [COLS, ROWS, ROW]]) {
          const lines = base.map(u => where(u, d).reduce((m, i) => m | (1 << pos[i]), 0)).map((m, idx) => ({ m, idx }))
            .filter(x => popcount(x.m) >= 2 && popcount(x.m) <= k);
          for (const set of combos(lines, k)) {
            const union = set.reduce((m, x) => m | x.m, 0);
            if (popcount(union) !== k) continue;
            const chosen = new Set(set.map(x => x.idx));
            const targets = [];
            for (let c = 0; c < 9; c++) if (union & (1 << c)) {
              for (const i of cover[c]) if (!chosen.has(pos === COL ? ROW[i] : COL[i])) targets.push(i);
            }
            if (elim(targets, b)) return true;
          }
        }
      }
      return false;
    };
    const xyWing = () => {
      const bi = [];
      for (let i = 0; i < 81; i++) if (!g[i] && popcount(cand[i]) === 2) bi.push(i);
      for (const p of bi) {
        const pincers = bi.filter(x => SEES[p * 81 + x] && cand[x] !== cand[p] && popcount(cand[x] & cand[p]) === 1);
        for (const x of pincers) for (const y of pincers) {
          if (x >= y) continue;
          const c = cand[x] & ~cand[p];
          if ((cand[y] & ~cand[p]) !== c || (cand[x] & cand[p]) === (cand[y] & cand[p])) continue;
          const targets = [];
          for (let i = 0; i < 81; i++) if (i !== x && i !== y && SEES[x * 81 + i] && SEES[y * 81 + i]) targets.push(i);
          if (elim(targets, c)) return true;
        }
      }
      return false;
    };

    const steps = [[1, nakedSingle], [1, hiddenSingle], [2, lockedCandidates], [3, nakedSubsets], [3, hiddenSubsets], [4, fish], [4, xyWing]];
    let hardest = 0;
    for (;;) {
      if (g.every(v => v)) return { solved: true, hardest, grid: g };
      if (g.some((v, i) => !v && !cand[i])) return { solved: false, hardest, grid: g };
      let progress = false;
      for (const [lvl, fn] of steps) {
        if (lvl > maxLevel) break;
        if (fn()) { hardest = Math.max(hardest, lvl); progress = true; break; }
      }
      if (!progress) return { solved: false, hardest, grid: g };
    }
  }

  /* Paramètres par niveau :
     clues   : nombre d'indices visé (on retire des chiffres tant que la grille reste faisable)
     maxTech : technique la plus difficile autorisée
     minTech : technique minimale exigée, pour que le niveau soit vraiment plus dur que le précédent */
  const LEVEL_SPEC = {
    1: { clues: 40, maxTech: 1, minTech: 1 },
    2: { clues: 30, maxTech: 2, minTech: 1 },
    3: { clues: 26, maxTech: 3, minTech: 2 },
    4: { clues: 17, maxTech: 4, minTech: 3 },
  };

  function generate(day, level) {
    const spec = LEVEL_SPEC[level];
    let best = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rng = mulberry32(seedFrom(`sudoku-du-jour|${day}|${level}|${attempt}`));
      const solution = solveCount(new Array(81).fill(0), 1, rng).solution;
      const puzzle = solution.slice();
      let clues = 81;
      for (const i of shuffle([...Array(81).keys()], rng)) {
        if (clues <= spec.clues) break;
        const v = puzzle[i];
        puzzle[i] = 0;
        if (logicSolve(puzzle, spec.maxTech).solved) clues--; else puzzle[i] = v;
      }
      const { hardest } = logicSolve(puzzle, spec.maxTech);
      const found = { puzzle: puzzle.join(''), solution: solution.join(''), clues, technique: hardest };
      if (hardest >= spec.minTech) return found;
      if (!best || hardest > best.technique) best = found;
    }
    return best;
  }

  /* Niveau de technique nécessaire pour résoudre une grille par pure logique (5 = impossible sans deviner). */
  function rate(givens) {
    const r = logicSolve(givens, 4);
    return r.solved ? r.hardest : 5;
  }

  function solve(givens) {
    const g = typeof givens === 'string' ? givens.split('').map(Number) : givens;
    const s = solveCount(g, 1).solution;
    return s ? s.join('') : null;
  }

  function isValidSolution(grid, givens) {
    if (!/^[1-9]{81}$/.test(grid)) return false;
    for (let i = 0; i < 81; i++) if (givens[i] !== '0' && givens[i] !== grid[i]) return false;
    return UNITS.every(u => new Set(u.map(i => grid[i])).size === 9);
  }

  return { ROW, COL, BOX, UNITS, LEVEL_SPEC, TECHNIQUES, generate, solve, solveCount, logicSolve, rate, isValidSolution, seedFrom, mulberry32, shuffle };
})();
