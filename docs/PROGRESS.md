# LIMINAL — Suivi de production

Registre tenu par le directeur technique. C'est la mémoire du projet : en cas de doute, ce fichier et
`git log` font foi.

## Lancer le jeu

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173. Vérifications : `npm run check` (types + tests), `npm run e2e` (navigateur).

## État des jalons

| Jalon | État |
|---|---|
| Phase 0 — conception, contrats, socle | ✅ terminé |
| 1 — Seul dans les Couloirs | 🔧 en cours (vague 1A) |
| 2 — La première entité | à faire |
| 3 — À plusieurs | à faire |
| 4 — Niveaux 1 à 3, objets, santé mentale | à faire |
| 5 — Niveaux 4 à 7, entités, énigmes coop | à faire |
| 6 — Lore, menus, sauvegarde, finition | à faire |

## Journal

### Phase 0 — terminé
- `docs/GDD.md`, `docs/ARCHITECTURE.md`, `docs/JALONS.md`, `docs/AGENTS.md`.
- Contrats : `shared/src/constants.ts`, `math/rng.ts`, `world/types.ts`, `world/api.ts`, `levels/types.ts`,
  `sim/types.ts`, `protocol/messages.ts`, `host/api.ts`, `client/src/core/contracts.ts`.
- Socle : Vite 8 + Three.js 0.187 + TypeScript 7, Vitest, Playwright (`tools/e2e/`), page de test WebGL.
- Vérifié : `npm run typecheck`, `npm test` (4 tests), `npm run e2e` (smoke) verts.

### Jalon 1 — en cours
- Vague 1A lancée : Monde, Rendu, Audio, Interface.

## Décisions du directeur (rulings)

| # | Décision | Raison | Coût si c'est faux |
|---|---|---|---|
| 1 | Un seul `package.json` à la racine, pas de workspaces npm | moins de pièces mobiles pour des agents en worktrees | à convertir si le serveur doit être déployé seul |
| 2 | Murs fins sur les arêtes de cellules (pas de blocs pleins uniquement) | look fidèle des couloirs, cloisons de bureaux, portes | générateurs et collisions un peu plus complexes |
| 3 | Solo = `GameHost` en mémoire dans l'onglet, même protocole que le réseau | un seul chemin de code, pas de serveur pour jouer seul | aucun, sauf surcoût CPU négligeable |
| 4 | Éclairage par champ de lumière en texture, pas de lumière dynamique par néon | 60 FPS sur GPU intégré, scintillement qui éclaire vraiment la pièce | éclairage moins « physique » |
| 5 | Agents organisés par discipline pour les systèmes, par niveau (vertical) pour le contenu des jalons 4–5 | évite les désaccords de clés entre logique et visuel d'un niveau | zones de fichiers par niveau à surveiller |
| 6 | Contrats des jalons 2+ marqués DRAFT et figés au début de chaque jalon | ne pas sur-concevoir à l'aveugle | petite révision de types à chaque jalon |

## Problèmes connus

Aucun pour l'instant.
