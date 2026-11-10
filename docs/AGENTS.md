# LIMINAL — Règles de travail des agents

Tu es un agent spécialisé du studio. Le directeur technique t'a confié **un brief** (`docs/briefs/…`).
Lis ce fichier en entier, puis ton brief, puis seulement les documents et fichiers que le brief cite.

## 1. Ce que tu lis

1. Ce fichier.
2. Ton brief : mission, zone de fichiers, contrats, définition de « terminé ».
3. Les sections du `docs/GDD.md` et de `docs/ARCHITECTURE.md` que ton brief indique (pas tout).
4. Les fichiers de contrat cités. Ils sont commentés : ce sont eux qui font foi, pas ta mémoire.

## 2. Ta zone

- Tu ne crées et ne modifies **que** les fichiers de la zone listée dans ton brief.
- Tu ne modifies **jamais** un fichier de contrat : `shared/src/constants.ts`, `shared/src/math/rng.ts`,
  tout `types.ts` et `api.ts` de `shared/`, `shared/src/protocol/messages.ts`,
  `client/src/core/contracts.ts`, ni `package.json`, ni les configurations à la racine.
- Si un contrat te bloque ou te semble faux : **n'improvise pas autour**. Fais au mieux dans ta zone, et
  décris précisément le changement souhaité dans ton rapport (section « Demandes de changement de contrat »).
  Le directeur tranche et prévient les autres agents.
- Aucune dépendance npm nouvelle. Si tu en as vraiment besoin, demande-la dans ton rapport.
- Tu ne lances **pas** de sous-agents.

## 3. Environnement

- Tu travailles dans un worktree git isolé. S'il n'a pas de `node_modules`, crée le lien :
  `ln -s /home/user/Backroom/node_modules node_modules` (ne lance pas `npm install`).
- Commandes : `npm run typecheck`, `npm test`, `npm run e2e`, `npm run check` (typecheck + tests).
- Serveur de développement : `npx vite --port <PORT> --strictPort` avec **le port indiqué dans ton brief**
  (d'autres agents tournent en même temps). Arrête tout processus que tu as lancé avant de finir.
- Tests navigateur : Playwright + Chromium headless sont installés. Utilise les aides de
  `tools/e2e/lib.mjs` (`launchBrowser`, `openPage`, `startVite`, `shot`). WebGL y tourne en logiciel
  (SwiftShader) : c'est lent, ne mesure jamais de vrais FPS, mesure appels de dessin, triangles, temps CPU.
  Le pointer lock n'existe pas en headless : utilise `?nolock=1` et l'API `window.__LIMINAL__`
  (voir `ARCHITECTURE.md` §7).
- Tu peux regarder une capture d'écran avec ton outil de lecture de fichiers : **fais-le** pour tout ce qui
  est visuel. Un rendu que personne n'a regardé n'est pas terminé.
- Fichiers temporaires : dans `tools/e2e/out/` (ignoré par git) ou dans le dossier temporaire du système.

## 4. Qualité attendue

- Le projet compile et se lance **à chaque commit** : `npm run check` vert. Tu ne livres jamais de code cassé.
- Écris les tests avec le code (logique de `shared/` : test d'abord). Teste le comportement, pas l'implémentation.
- Déterminisme : dans `shared/`, tout hasard passe par `shared/src/math/rng.ts`. Jamais `Math.random()`,
  jamais `Date.now()`.
- Performance : 60 FPS sur un portable moyen. Pas d'allocation par frame dans les chemins chauds, instancing
  et géométries fusionnées, pas de lumière dynamique par néon.
- Aucun asset externe : ni image, ni son, ni police, ni CDN. Tout est généré par code.
- Code lisible, commenté là où le « pourquoi » n'est pas évident. Identifiants et commentaires en anglais,
  textes du jeu en français.
- Pas de `TODO` laissé à la place d'une fonctionnalité demandée. Si tu ne peux pas finir quelque chose,
  dis-le dans le rapport plutôt que de livrer un simulacre.
- Vérifie avant de déclarer terminé : relance les commandes et lis leur sortie, ne suppose pas.

Skills utiles si ton environnement les propose : `mes-skills:test-driven-development` (logique),
`mes-skills:systematic-debugging` (bug coriace), `mes-skills:verification-before-completion` (avant de
conclure), `composio-skills:webapp-testing` (tests navigateur).

## 5. Git

- Travaille sur la branche de ton worktree. **Un commit par tâche terminée**, message clair à l'impératif,
  préfixé par ta zone : `world: …`, `engine: …`, `render: …`, `audio: …`, `ui: …`, `net: …`, `levels: …`,
  `entities: …`, `qa: …`.
- Termine chaque message de commit par ces deux lignes :

  ```
  Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GfgmowCVfyab4rQpFj3sdp
  ```

- Ne pousse pas (`git push`), ne change pas de branche, ne réécris pas l'historique. Le directeur intègre.
- Tout ton travail doit être **committé** à la fin : un worktree avec des changements non committés est perdu.

## 6. Ton rapport

Écris `docs/reports/<nom-du-brief>.md` (committé avec le reste) :

1. **Statut** : `TERMINÉ`, `TERMINÉ AVEC RÉSERVES` ou `BLOQUÉ`.
2. **Ce qui est livré** : fonctionnalités, fichiers principaux, API publique de ta zone (signatures).
3. **Preuves** : commandes lancées et résultat (nombre de tests, captures regardées et ce qu'on y voit).
4. **Décisions** prises quand le brief était ambigu.
5. **Demandes de changement de contrat** (s'il y en a) : fichier, changement exact, raison.
6. **Problèmes connus et suites conseillées**.

Ta réponse finale au directeur est **courte** (15 lignes maximum) : statut, branche et dernier commit,
résumé des tests en une ligne, réserves éventuelles. Le détail est dans le rapport.
