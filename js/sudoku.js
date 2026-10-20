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

  /* Résout uniquement avec "naked singles" + "hidden singles" (techniques de base). */
  function solvableBySingles(grid) {
    const g = grid.slice();
    let progress = true;
    const cand = i => {
      let used = 0;
      for (let k = 0; k < 81; k++) {
        if (g[k] && (ROW[k] === ROW[i] || COL[k] === COL[i] || BOX[k] === BOX[i])) used |= 1 << g[k];
      }
      return ~used & ALL;
    };
    while (progress) {
      progress = false;
      const masks = g.map((v, i) => (v ? 0 : cand(i)));
      for (let i = 0; i < 81; i++) {
        if (!g[i] && popcount(masks[i]) === 1) { g[i] = digitsOf(masks[i])[0]; progress = true; }
      }
      if (progress) continue;
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const b = 1 << d;
          if (unit.some(i => g[i] === d)) continue;
          const spots = unit.filter(i => !g[i] && (masks[i] & b));
          if (spots.length === 1) { g[spots[0]] = d; progress = true; }
        }
      }
    }
    return g.every(v => v);
  }

  // Nombre d'indices visés par niveau (1 facile → 4 extrême)
  const TARGET_CLUES = { 1: 40, 2: 32, 3: 27, 4: 17 };

  function generate(day, level) {
    const rng = mulberry32(seedFrom(`sudoku-du-jour|${day}|${level}`));
    const solution = solveCount(new Array(81).fill(0), 1, rng).solution;
    const puzzle = solution.slice();
    const order = shuffle([...Array(81).keys()], rng);
    let clues = 81;
    for (const i of order) {
      if (clues <= TARGET_CLUES[level]) break;
      const v = puzzle[i];
      puzzle[i] = 0;
      let ok = solveCount(puzzle, 2).count === 1;
      if (ok && level <= 2) ok = solvableBySingles(puzzle);
      if (ok) clues--; else puzzle[i] = v;
    }
    return { puzzle: puzzle.join(''), solution: solution.join(''), clues };
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

  return { ROW, COL, BOX, UNITS, generate, solve, isValidSolution, seedFrom, mulberry32, shuffle };
})();
