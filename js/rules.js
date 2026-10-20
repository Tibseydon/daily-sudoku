/* Règles du jeu partagées par l'interface et les deux backends.
   ⚠️ Les quotas et pénalités sont dupliqués dans supabase/schema.sql (use_hint) : garder les deux synchronisés. */
const RULES = {
  levels: {
    1: { name: 'Facile',    emoji: '🌱', color: '#199e70', tagline: 'Pour se réveiller en douceur' },
    2: { name: 'Moyen',     emoji: '🌊', color: '#3987e5', tagline: 'Ça commence à chauffer' },
    3: { name: 'Difficile', emoji: '🔥', color: '#d95926', tagline: 'Café obligatoire' },
    4: { name: 'Extrême',   emoji: '💀', color: '#d55181', tagline: 'Seuls les braves' },
  },
  hints: [
    { type: 1, icon: '🎲', name: 'Coup de dés',   desc: '1 chiffre révélé au hasard',           penalty: 20,  quota: 3, target: null },
    { type: 2, icon: '🎯', name: 'Viseur',        desc: 'Révèle la case de ton choix',          penalty: 25,  quota: 3, target: 'cell' },
    { type: 3, icon: '✨', name: 'Triple éclair', desc: '3 chiffres révélés au hasard',         penalty: 45,  quota: 2, target: null },
    { type: 4, icon: '📏', name: 'Laser',         desc: 'Révèle une ligne ou une colonne',      penalty: 90,  quota: 1, target: 'line' },
    { type: 5, icon: '🧊', name: 'Bloc',          desc: 'Révèle un carré 3×3 au choix',         penalty: 105, quota: 1, target: 'box' },
  ],
  tiers: {
    gold:      { label: 'Or',       c1: '#fde68a', c2: '#d97706' },
    silver:    { label: 'Argent',   c1: '#f1f5f9', c2: '#8a9bb0' },
    bronze:    { label: 'Bronze',   c1: '#fdba74', c2: '#b45309' },
    chocolate: { label: 'Chocolat', c1: '#b07a4f', c2: '#4a2a14' },
    finisher:  { label: 'Finisher', c1: '#99f6e4', c2: '#0f766e' },
  },
  // Top 4 du jour (par niveau) → trophée
  trophyFor(pos) { return ['gold', 'silver', 'bronze', 'chocolate'][pos - 1] || null; },
  // Médaille selon le percentile : top 5 % or, 10 % argent, 15 % bronze, 20 % chocolat, sinon finisher
  medalFor(pos, n) {
    if (!pos || !n) return null;
    if (pos <= Math.ceil(n * 0.05)) return 'gold';
    if (pos <= Math.ceil(n * 0.10)) return 'silver';
    if (pos <= Math.ceil(n * 0.15)) return 'bronze';
    if (pos <= Math.ceil(n * 0.20)) return 'chocolate';
    return 'finisher';
  },
};
