# 🧩 Sudoku du Jour

Chaque jour à minuit (heure de Paris), **4 nouvelles grilles de sudoku**, identiques pour tous les joueurs :
🌱 Facile · 🌊 Moyen · 🔥 Difficile · 💀 Extrême.

Le score d'une grille, c'est le temps de résolution plus les pénalités des indices utilisés. Le plus bas gagne.

## Récompenses (par jour et par niveau)

| Trophées | | Médailles | |
|---|---|---|---|
| 🏆 Or | 1er | 🥇 Or | top 5 % |
| 🏆 Argent | 2e | 🥈 Argent | top 10 % |
| 🏆 Bronze | 3e | 🥉 Bronze | top 15 % |
| 🏆 Chocolat | 4e | 🍫 Chocolat | top 20 % |
| | | 🎽 Finisher | tous les autres |

## Indices

| Indice | Effet | Dispo | Pénalité |
|---|---|---|---|
| 🎲 Coup de dés | 1 chiffre révélé au hasard | ×3 | +20 s |
| 🎯 Viseur | Révèle la case choisie | ×3 | +25 s |
| ✨ Triple éclair | 3 chiffres révélés au hasard | ×2 | +45 s |
| 📏 Laser | Révèle une ligne ou une colonne | ×1 | +1 min 30 |
| 🧊 Bloc | Révèle un carré 3×3 | ×1 | +1 min 45 |

Pour le Laser, clique sur une case vide pour viser sa ligne, puis reclique sur la même case pour passer à la colonne (et inversement).

---

## 🚀 Mise en ligne (gratuite)

### 1. Base de données : Supabase

1. Crée un compte sur [supabase.com](https://supabase.com), puis un **nouveau projet** (région Europe, par exemple Paris ou Francfort).
2. Ouvre **SQL Editor → New query**, colle tout le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis clique sur **Run**.
3. Dans **Project Settings → API**, récupère :
   - le **Project URL** (`https://xxxx.supabase.co`) ;
   - la clé publique **anon / publishable**. N'utilise jamais la clé `service_role` ni la clé `secret`.
4. Colle ces deux valeurs dans [`js/config.js`](js/config.js).
5. (Optionnel) **Authentication → Sign In / Providers → Email** : tu peux désactiver *Confirm email* pour que les joueurs jouent sans confirmer leur email.
6. **Authentication → URL Configuration** : mets l'adresse de ton site dans *Site URL* (par exemple `https://<ton-pseudo>.github.io/sudoku-du-jour/`). C'est là que pointent les liens de confirmation par email.

> La clé publique est faite pour être visible dans le code du site. La sécurité repose sur les règles RLS du schéma : un joueur ne peut rien écrire directement. Le chrono, les pénalités et la vérification de la grille sont gérés par le serveur.

### 2. Hébergement : GitHub Pages

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
Le site sera ensuite disponible à l'adresse `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

## 🧪 Mode démo

Si `js/config.js` est vide, le jeu tourne en **mode démo**, sans serveur. Les scores restent dans le navigateur et les adversaires du classement sont simulés. C'est pratique pour tester.

Pour lancer le site en local :

```bash
python -m http.server 8080
```

Ouvre ensuite http://localhost:8080.

## 🗂️ Structure

```
index.html            Page unique (toutes les vues)
css/style.css         Thème visuel
js/config.js          Clés Supabase (vide = mode démo)
js/rules.js           Niveaux, indices, paliers de médailles
js/sudoku.js          Génération déterministe, solveur, vérification
js/backend.js         Supabase + mode démo (même interface)
js/ui.js              Médailles/trophées SVG, confettis, graphique
js/app.js             Navigation, jeu, classement, historique
supabase/schema.sql   Tables, sécurité RLS, fonctions serveur
```

## ⚙️ Fonctionnement

- **Grilles du jour** : générées par une graine `date + niveau`, donc tout le monde reçoit la même grille. La première version enregistrée en base fait foi pour la journée. Toutes les grilles ont une solution unique. Les niveaux 1 et 2 se résolvent avec les techniques de base. Le niveau 4 a le minimum d'indices possible (environ 22 à 25).
- **Chrono** : il démarre côté serveur à l'ouverture de la grille et continue même si on quitte la page. On ne peut faire qu'une partie par grille.
- **Médailles du jour** : elles sont provisoires et évoluent jusqu'à minuit, au fur et à mesure que d'autres joueurs terminent.
- Les quotas et pénalités des indices sont définis à deux endroits, `js/rules.js` et la fonction `use_hint` de `schema.sql`. Il faut les modifier ensemble.
