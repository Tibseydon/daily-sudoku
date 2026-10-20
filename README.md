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
   Si ta base a été créée avant l'ajout de la connexion sociale, exécute aussi [`supabase/migrations/002_connexion_sociale.sql`](supabase/migrations/002_connexion_sociale.sql).
3. Dans **Project Settings → API**, récupère :
   - le **Project URL** (`https://xxxx.supabase.co`) ;
   - la clé publique **anon / publishable**. N'utilise jamais la clé `service_role` ni la clé `secret`.
4. Colle ces deux valeurs dans [`js/config.js`](js/config.js).
5. **Authentication → URL Configuration** :
   - *Site URL* : `https://tibseydon.github.io/daily-sudoku/` ;
   - *Redirect URLs* : ajoute `https://tibseydon.github.io/daily-sudoku/` et `http://localhost:8080/` (pour tester en local).
6. **Authentication → Sign In / Providers → Email** : laisse **Confirm email** activé (obligatoire pour la politique de sécurité). Dans la section **Password**, règle :
   - *Minimum password length* : `12` ;
   - *Password requirements* : **Lowercase, uppercase letters, digits and symbols**.

   Ainsi, le serveur refuse lui aussi les mots de passe faibles, même si quelqu'un contourne le site.

> La clé publique est faite pour être visible dans le code du site. La sécurité repose sur les règles RLS du schéma : un joueur ne peut rien écrire directement. Le chrono, les pénalités et la vérification de la grille sont gérés par le serveur.

### Connexion avec Google

Le bouton « Continuer avec Google » n'apparaît que lorsque Google est activé dans Supabase (**Authentication → Sign In / Providers → Google**).

1. Dans la [Google Cloud Console](https://console.cloud.google.com), ouvre **Google Auth Platform** (ou *APIs & Services*) et configure l'écran de consentement (*External*).
2. Ouvre ensuite **Clients → Create client → Web application** et renseigne :
   - *Authorized JavaScript origins* : `https://tibseydon.github.io` ;
   - *Authorized redirect URIs* : `https://yirqnldregtrbigwdmid.supabase.co/auth/v1/callback`.
3. Colle le *Client ID* (`….apps.googleusercontent.com`) et le *Client Secret* (`GOCSPX-…`) **du même client** dans le fournisseur Google de Supabase.
4. Tant que l'app est en mode *Testing*, seuls les comptes listés dans **Audience → Test users** peuvent se connecter. Clique sur **Publish app** pour ouvrir la connexion à tout le monde.

À la première connexion, le joueur choisit son pseudo. Une suggestion est proposée à partir de son profil Google.

> L'erreur « Unable to exchange external code » signifie que Google refuse le *Client Secret* enregistré dans Supabase, ou que le Client ID et le secret ne viennent pas du même client.

### Sécurité des mots de passe (inscription par email)

- 12 caractères minimum, avec au moins 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.
- Aucun mot des dictionnaires français et anglais : mots courants, Wikipédia, 50 000 mots de passe courants, liste Diceware. Le contrôle vaut aussi pour un mot écrit en leetspeak (`S0l3il`), à l'envers ou caché au milieu du mot de passe.
- Ni le pseudo ni l'email dans le mot de passe, et une robustesse zxcvbn « forte » au minimum.
- Refus des mots de passe déjà apparus dans une fuite de données ([Have I Been Pwned](https://haveibeenpwned.com/Passwords), en k-anonymat : le mot de passe ne quitte jamais le navigateur).
- Confirmation obligatoire par email, avec un bouton pour renvoyer l'email et une procédure de mot de passe oublié soumise aux mêmes règles.
- Un générateur propose un mot de passe aléatoire qui respecte toutes les règles.

### 2. Hébergement : GitHub Pages

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
Le site est en ligne à l'adresse **https://tibseydon.github.io/daily-sudoku/**.

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
js/password.js        Politique de mot de passe (dictionnaires, fuites, générateur)
js/sudoku.js          Génération déterministe, solveur, vérification
js/backend.js         Supabase + mode démo (même interface)
js/ui.js              Médailles/trophées SVG, confettis, graphique
js/app.js             Navigation, jeu, classement, historique
supabase/schema.sql   Tables, sécurité RLS, fonctions serveur
supabase/migrations/  Mises à jour à appliquer sur une base existante
```

## ⚙️ Fonctionnement

- **Grilles du jour** : générées par une graine `date + niveau`, donc tout le monde reçoit la même grille. La première version enregistrée en base fait foi pour la journée. Toutes les grilles ont une solution unique. Les niveaux 1 et 2 se résolvent avec les techniques de base. Le niveau 4 a le minimum d'indices possible (environ 22 à 25).
- **Chrono** : il démarre côté serveur à l'ouverture de la grille et continue même si on quitte la page. On ne peut faire qu'une partie par grille.
- **Médailles du jour** : elles sont provisoires et évoluent jusqu'à minuit, au fur et à mesure que d'autres joueurs terminent.
- Les quotas et pénalités des indices sont définis à deux endroits, `js/rules.js` et la fonction `use_hint` de `schema.sql`. Il faut les modifier ensemble.
