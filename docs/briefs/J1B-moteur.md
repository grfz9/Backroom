# Brief J1B — Agent Moteur

**Jalon 1, vague B.** Tu assembles le jeu. La vague précédente a livré le monde (`shared/src/world`,
niveau 0), le rendu, l'audio et l'interface, chacun derrière un contrat. Tu écris la simulation du joueur,
l'hôte de partie, les entrées, la prédiction, la caméra, et la racine de composition qui fait tourner le
tout : à la fin de ton travail, **on joue**.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` en entier (court) — surtout §1, §5, §6, §7.
- `docs/GDD.md` §2, §3.
- Contrats : `shared/src/constants.ts`, `shared/src/sim/types.ts`, `shared/src/protocol/messages.ts`,
  `shared/src/host/api.ts`, `shared/src/world/api.ts`, `client/src/core/contracts.ts`.
- Rapports de la vague A pour l'API réelle de chaque sous-système : `docs/reports/J1A-monde.md`,
  `J1A-rendu.md`, `J1A-audio.md`, `J1A-interface.md` (sections « Ce qui est livré »).

## Ta zone

- `shared/src/sim/**` sauf `types.ts` ; `shared/src/host/**` sauf `api.ts`.
- `client/src/main.ts`, `client/src/core/**` sauf `contracts.ts`, `settings.ts`, `save.ts`.
- `client/src/input/**`, `client/src/player/**` (nouveaux).
- `tools/e2e/00-smoke.e2e.mjs` et `tools/e2e/game-*.e2e.mjs`.
- Port de développement : **5204**.

Un autre agent écrit en parallèle la vue du monde (`client/src/world/`, maillage des chunks). Tant que son
travail n'est pas intégré, `createWorldView` est un stub : le brouillard et l'interface s'affichent mais
pas les murs. Valide donc ta logique par l'état du jeu (`window.__LIMINAL__.state()`), pas par l'image.

## Livrables

### 1. Déplacement partagé (`shared/src/sim/playerMove.ts`)

```ts
export function createPlayerMove(x: number, z: number, yaw: number, world: World): PlayerMove;
export function stepPlayerMove(m: PlayerMove, input: PlayerInput, world: World, env: MoveEnv, dt: number): void;
```

Fonction pure et déterministe, valeurs dans `PLAYER` (`constants.ts`) :

- Repère : avant = `(-sin(yaw), -cos(yaw))` en (x, z), droite = `(cos(yaw), -sin(yaw))`. Intention normalisée.
- Allures : course si `BTN_RUN`, intention vers l'avant, pas accroupi, pas épuisé, `env.canRun` ;
  accroupi si `BTN_CROUCH` ; sinon marche. Accélération et freinage (`accel`, `decel`) : un personnage
  lourd, qui ne glisse pas.
- Eau : jusqu'à −25 % de vitesse à 40 cm de profondeur, −50 % au-delà de 1 m.
- Collisions par `world.moveCircle` (rayon `PLAYER.radius`) ; la vitesse est annulée le long de la normale.
- `y` suit `world.floorYAt` avec un lissage court. `crouch` évolue en `PLAYER.crouchTime`.
- Endurance : consommation en course, délai puis récupération, `exhausted` jusqu'à `staminaRecover`.
- `stepDist` accumule la distance réellement parcourue ; `mode` reflète l'allure réelle (`idle` sous 0,2 m/s).
- `yaw` et `pitch` viennent de l'entrée (pitch borné à ±1,5). `env.frozen` : seule la vue change.

### 2. Simulation et hôte (`shared/src/sim/`, `shared/src/host/`)

- `GameSim` : état d'une partie sur un niveau — monde, joueurs, tick, temps, événements à diffuser, bruits
  du tick (calculés d'après `NOISE`, déjà, même si personne ne les écoute encore). Conçu pour accueillir
  au jalon 2 les entités, les objets et le script de niveau (voir ARCHITECTURE §5) : prévois les points
  d'extension, n'implémente pas ce qui n'est pas demandé.
- `createGameHost(opts: HostOptions): GameHost` (exporté de `shared/src/host/index.ts`) :
  - `connect` / `disconnect` / `receive` / `tick` selon `api.ts` ; ne lève jamais sur un message invalide ;
  - `start` (du premier joueur) : crée le monde avec `createWorld(getLevel(id), hashString(seedText))`,
    place les joueurs au `spawn`, envoie `level` à chacun ;
  - à chaque tick : une commande par joueur (file vide ⇒ répète la dernière sans avancer `ack` au-delà ;
    file de plus de 6 ⇒ en consomme deux), `stepPlayerMove`, puis toutes les `SNAPSHOT_EVERY` ticks un
    `snap` par joueur avec son `ack` ;
  - répond à `ping`.

### 3. Entrées (`client/src/input/`)

`createInput(): InputSystem` selon le contrat. Clavier par `KeyboardEvent.code` et `settings.keymap`
(ZQSD et WASD sont la même position physique : rien à détecter). Souris en pointer lock
(`movementX/Y`, filtre les sauts aberrants), sensibilité et inversion appliquées. Relâche tout à la perte
de focus. Empêche les raccourcis du navigateur gênants en jeu. Avec `?nolock=1`, se comporte comme
verrouillé sans pointer lock (tests).

### 4. Cœur du client (`client/src/core/`, `client/src/player/`, `client/src/main.ts`)

- **`LocalSession`** : un `GameHost` en mémoire, cadencé par un accumulateur à pas fixe (au plus 5 ticks
  de rattrapage par frame ; aucun tick si `paused`).
- **État client** : traite `level` (construit le `LevelRuntime` et son propre `World`) et `snap`
  (réconciliation du joueur local, tampons d'interpolation pour les autres joueurs et les entités).
- **Prédiction** : un `PlayerInput` par tick, envoyé par lots, appliqué localement avec
  `stepPlayerMove` ; à chaque `snap`, repartir de `self.move` et rejouer les commandes non acquittées ;
  petite erreur ⇒ correction lissée, grosse erreur ⇒ recalage. La position affichée est interpolée entre
  les deux derniers ticks ; **les angles de vue ne passent pas par les ticks** (souris sans latence).
- **Caméra** (`client/src/player/`) : hauteur des yeux selon `crouch`, **balancement de tête léger** piloté
  par `stepDist` (vertical et latéral, amplitude selon l'allure, multiplié par `settings.headBob`), roulis
  minime, respiration à l'arrêt, élargissement du champ en course, tout lissé. Émet les événements
  `step` au rythme des foulées (≈ 0,75 m en marche, 1,05 m en course, 0,5 m accroupi) avec
  `world.surfaceAt` et la profondeur d'eau.
- **`Game`** : machine d'états `title → loading → playing ⇄ paused → title`. Construit le `FrameState`
  chaque frame et appelle `render.render`, `audio.update`, `ui.update`. Branche les intentions de
  l'interface : `startSolo` (dans le même geste utilisateur : `audio.unlock()` et `input.requestLock()`),
  `resume`, `restart`, `quitToTitle`, `sound` → `audio.play`. Perte du pointer lock en jeu ⇒ pause (en solo
  la simulation se fige). Échec de reprise du verrou ⇒ rester en pause proprement. Action `fps` (F3) ⇒
  bascule `settings.showFps`. Les `AudioCue` deviennent des événements `subtitle` (`'sub.' + key`).
  Remplit `frame.perf`. Demande confirmation avant de fermer l'onglet en cours de partie.
- **Fond de l'écran titre** : le niveau 0 chargé avec une seed fixe, caméra posée au départ qui pivote
  très lentement, son d'ambiance audible dès le premier geste de l'utilisateur.
- **`main.ts`** : crée paramètres, interface, audio, rendu, entrées, jeu ; gère le redimensionnement, la
  visibilité de l'onglet (dt borné), les paramètres d'URL `debug`, `autostart`, `seed`, `level`, `nolock`,
  et `window.__LIMINAL__` tel que décrit dans ARCHITECTURE §7.

## Sensation recherchée

Un corps, pas une caméra flottante : démarrages et arrêts légèrement amortis, course qui se mérite,
accroupi nettement plus bas et plus lent, collisions qui glissent sans jamais accrocher ni trembler dans
les angles. Le balancement doit être perceptible mais ne jamais donner la nausée.

## Tests exigés

- Vitest : vitesses atteintes par allure, endurance (durée de sprint ≈ 7 s, verrou d'épuisement),
  accroupissement, glissement le long d'un mur dans le vrai niveau 0, déterminisme (mêmes entrées ⇒ même
  état), eau. `GameHost` : `start` ⇒ `level`, cadence des `snap`, règles de la file d'entrées, robustesse
  aux messages invalides. Prédiction : avec une session à latence artificielle (100 ms, gigue), la
  position prédite ne diverge pas et l'erreur de réconciliation reste nulle en déplacement normal.
- Navigateur, `tools/e2e/game-solo.e2e.mjs` (avec `?debug=1&nolock=1`) : saisir une seed et cliquer
  « Entrer » ⇒ écran `playing` ; avancer 2 s ⇒ la position change et reste dans une cellule ouverte ;
  courir vide l'endurance ; s'accroupir baisse la caméra ; pause puis reprise ; même seed ⇒ même point de
  départ et même empreinte de chunks ; aucune erreur console. Mets à jour `00-smoke` si nécessaire.

## Terminé quand

`npm run check` et `npm run e2e` sont verts ; `npm run dev` permet de jouer de l'écran titre jusqu'à la
marche dans le niveau ; `docs/reports/J1B-moteur.md` décrit l'architecture du cœur, l'API de debug et les
points d'extension prévus pour le jalon 2.
