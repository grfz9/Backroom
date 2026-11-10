# LIMINAL — Architecture technique

Référence technique du projet. Conception du jeu : `GDD.md`. Règles de travail des agents : `AGENTS.md`.

## 1. Principes

1. **Une seule simulation, partagée.** Toute la logique de jeu (génération, collisions, déplacement,
   IA, objets, énigmes) vit dans `shared/` : du TypeScript pur, sans DOM ni Node, qui tourne à l'identique
   dans le navigateur, sur le serveur et dans les tests.
2. **Le solo est un serveur dans l'onglet.** Un `GameHost` (une « salle ») fait autorité. En solo le client en
   instancie un en mémoire (`LocalSession`) ; en coop le serveur Node en héberge un par salon
   (`RemoteSession` via WebSocket). Le client ne voit qu'une interface `Session` et le même protocole.
3. **Déterminisme par seed.** Un monde est une fonction pure de `(niveau, seed)`. Client et hôte génèrent
   chacun leurs chunks : on ne transmet jamais de géométrie, seulement la seed et l'état dynamique.
4. **Rendu, audio et interface sont des lecteurs.** Chaque frame, le cœur construit un `FrameState` en
   lecture seule ; les sous-systèmes le consomment sans se connaître entre eux.
5. **Un niveau = un pack de contenu** vertical : définition logique, thème visuel, ambiance sonore.
6. **Zéro asset.** Textures sur canvas ou en shader, modèles en primitives, sons en Web Audio.

```
                         ┌──────────────── shared/ ────────────────┐
                         │ math · world · gen · levels · sim       │
                         │ entities · nav · protocol · host        │
                         └───────▲───────────────────────▲─────────┘
                                 │                       │
   ┌────────────── client/ ──────┴──────┐     ┌──────────┴── server/ ──────────┐
   │ input ─┐                           │     │ HTTP statique + WebSocket      │
   │ Session┼─ core/Game ─ FrameState ─┬┼─►   │ salons (code à 5 lettres)      │
   │ (local │    │                     ││     │ 1 GameHost par salon, 60 Hz    │
   │  ou    │    ├─► render (+ world,  ││     │ relais de signalisation WebRTC │
   │  ws)   │    │      themes)        ││     └────────────────────────────────┘
   │        │    ├─► audio             ││
   │        │    └─► ui ── UIIntent ───┘│
   └────────────────────────────────────┘
```

## 2. Arborescence et zones de propriété

Un seul `package.json` à la racine (pas de workspaces : moins de pièces mobiles), trois dossiers de code.

| Chemin | Rôle | Agent propriétaire |
|---|---|---|
| `shared/src/constants.ts`, `**/types.ts`, `**/api.ts`, `protocol/messages.ts`, `math/rng.ts` | **Contrats** | Directeur |
| `client/src/core/contracts.ts` | **Contrats client** | Directeur |
| `shared/src/world/` (hors contrats), `shared/src/gen/` | Monde : chunks, requêtes, collisions, lumière, outils de génération, préfabs | Monde |
| `shared/src/levels/<id>/` | Définition, générateur et script d'un niveau | Niveaux (L0 : Monde) |
| `shared/src/sim/` (hors contrats), `shared/src/host/` | Déplacement, GameSim, GameHost | Moteur |
| `shared/src/entities/`, `shared/src/nav/` | IA, perception, pathfinding, director | Entités |
| `shared/src/lore/` | Textes des notes et cassettes | Niveaux / narratif |
| `client/src/main.ts`, `client/src/core/` (hors contrats et settings), `client/src/input/`, `client/src/player/` | Racine de composition, boucle, session locale, prédiction, caméra | Moteur |
| `client/src/world/` | Streaming et maillage des chunks, vues d'objets | Monde |
| `client/src/render/` | Renderer, éclairage, matériaux, textures, post-traitement, vues d'entités | Rendu |
| `client/src/themes/<id>/` | Thème visuel d'un niveau | Rendu (L0), puis Niveaux |
| `client/src/audio/` | Moteur audio, synthèse, ambiances | Audio |
| `client/src/ui/`, `client/src/i18n/`, `client/src/core/settings.ts`, `client/src/core/save.ts` | Menus, HUD, textes, sauvegarde | Interface |
| `client/src/net/`, `server/` | Session distante, vocal WebRTC, serveur | Réseau |
| `tools/e2e/`, tests transverses | Tests navigateur, perfs | QA |
| `docs/` (hors `reports/`) | Conception, suivi | Directeur |

Alias d'import : `@shared/...` → `shared/src/...` (client et serveur). À l'intérieur de `shared/`, imports relatifs.

## 3. Modèle du monde

Défini dans `shared/src/world/types.ts` (à lire : il est commenté).

- **Grille 2,5D.** Cellules carrées de `CELL = 2 m`. Chunks de `CHUNK = 16` cellules (32 m).
  X = est, Z = sud, Y = haut ; le nord est −Z.
- **Une cellule** a un type (`CellType` : solide ou ouverte, hauteur de sol, hauteur de plafond ou ciel, niveau
  d'eau, surface, matériaux).
- **Murs fins sur les arêtes.** Chaque cellule possède ses arêtes Nord et Ouest (`wallN`, `wallW`). L'arête
  Sud de `(x,z)` est l'arête Nord de `(x,z+1)`. Un `WallType` peut être plein, à mi-hauteur (cloison de box),
  transparent (vitre), ou percé d'une ouverture de porte.
- **Un prop par cellule** (pilier, meuble…) avec empreinte de collision et hauteur (couverture).
- **Un luminaire par cellule** (`LightType`) avec un mode (stable, clignotant, mourant, mort) et un groupe
  d'alimentation (0 = toujours alimenté, 1–15 = commandé par le script du niveau).
- **Objets de gameplay** par chunk (`WorldObjectDef`) : ramassables, notes, portes, leviers, prises, digicodes,
  sorties, cachettes, déclencheurs, marqueurs. Un objet a un `state` numérique dont la valeur initiale est
  dans la définition ; **l'état vivant est dans la simulation**, jamais dans le chunk.
- **Palettes.** Les octets des chunks sont des indices dans les tableaux `cells`, `walls`, `props`, `lights`
  du `LevelDef`. Les clés de matériaux et de modèles (`floorMat`, `model`…) sont de simples chaînes que le
  thème du client résout ; une clé inconnue donne un matériau de substitution voyant et un avertissement.

**API de requête** (`shared/src/world/api.ts`, interface `World`) : `getChunk`, requêtes par cellule
(`cellAt`, `wallAt`, `edgeBlocked`…), requêtes continues (`floorYAt`, `waterDepthAt`, `surfaceAt`),
physique (`moveCircle`, `raycast` 3D pour les murs bas, `hasLineOfSight`), lumière (`fixturesNear`,
`fixtureLevel`, `lightAt`) et portes dynamiques (`setDoor`). `LightField` fournit une grille d'éclairement
par cellule centrée sur un point, avec occlusion par les murs, pour le rendu.

## 4. Génération procédurale

- **Pureté.** `ChunkGenerator.generate(cx, cz)` ne dépend que de `(seed, cx, cz)` — jamais de l'ordre des
  appels, de l'heure ou de `Math.random()`. Tout hasard vient de `shared/src/math/rng.ts`.
- **Cohérence entre chunks.** Les structures plus grandes qu'un chunk (salles, couloirs, sites) se décident
  sur une **grille de régions** plus grossière, mise en cache dans le générateur. Les connexions entre régions
  voisines se décident par un hash de leur frontière commune, pour que les deux côtés soient d'accord.
- **Zones construites à la main.** Un `Prefab` est une petite grille (cellules, arêtes, props, luminaires,
  objets) écrite par code ou depuis un plan ASCII ; le générateur le **tamponne** à des emplacements
  déterministes (« sites »), en raccordant ses portes au labyrinthe. Un niveau peut être infini avec des
  sites (L0–L6) ou entièrement construit (L7 : tout le reste est solide).
- **Garanties testées.** Même seed ⇒ chunks identiques octet pour octet ; ordre de génération indifférent ;
  accessibilité depuis le point d'apparition ; la sortie est atteignable.

## 5. Simulation

- **Pas fixe.** `TICK_RATE = 60` Hz, `DT = 1/60`. Une commande `PlayerInput` par tick et par joueur.
- **Déplacement** (`shared/src/sim/playerMove.ts`) : `stepPlayerMove(move, input, world, env, dt)` — fonction
  déterministe partagée (accélération, glissement le long des murs via `world.moveCircle`, accroupi,
  endurance, eau, suivi de la hauteur du sol). Le client prédit avec, l'hôte fait autorité avec.
- **`GameSim`** (`shared/src/sim/`) : état d'une partie sur un niveau — joueurs, entités, objets, drapeaux,
  alimentation des lumières, bruits du tick, événements à diffuser. Ordre d'un tick : commandes des
  joueurs → déplacement → interactions → script du niveau → director et entités → santé / santé mentale →
  collecte des événements.
- **Bruit.** Chaque tick, les joueurs et les objets produisent des `NoiseEvent {x, z, radius}` (constantes
  `NOISE`). Les entités qui entendent lisent cette liste, avec atténuation par les murs.
- **Lumière de gameplay.** `world.lightAt(x, z, time, power)` : même modèle que le rendu, pour les règles
  d'obscurité et les entités liées à la lumière. Le scintillement est déterministe (`fixtureLevel`).
- **Scripts de niveau.** `LevelScript` (crochets `init`, `tick`, `interact`, `code`, `trigger`, `canExit`)
  agit à travers `ScriptCtx` : drapeaux, états d'objets, alimentation, apparition d'entités, événements,
  objectif, fin de niveau. Les scripts n'accèdent jamais à l'état interne de la simulation.
- **Entités.** Un comportement par `EntityKind` (`shared/src/entities/<kind>.ts`) : machine à états,
  perception (vue = cône + `hasLineOfSight` + lumière ; ouïe = bruits), navigation (`shared/src/nav/` : A* sur
  la grille, lissage). Le **director** applique les `DirectorRule` du niveau (apparition hors de vue autour
  des joueurs, disparition au loin).

## 6. Réseau

Types : `shared/src/protocol/messages.ts`. Messages JSON, identiques en mémoire (solo) et sur WebSocket.

| Sens | Message | Rôle |
|---|---|---|
| C→H | `hello` | créer ou rejoindre un salon |
| C→H | `lobby`, `start` | réglages du salon, lancement (hôte) |
| C→H | `input` | commandes de tick, par lots |
| C→H | `act` | action ponctuelle (interagir, lampe, objet, code, craie) |
| C→H | `rtc` | signalisation WebRTC, relayée |
| H→C | `welcome`, `lobby` | identité, état du salon |
| H→C | `level` | charger un niveau : id, seed, états d'objets, joueurs |
| H→C | `snap` | instantané 20 Hz : soi (privé), autres joueurs, entités, événements, deltas |
| H→C | `objects`, `rtc`, `pong`, `error` | divers |

- **Autorité.** L'hôte simule tout. Le client prédit **uniquement son propre déplacement** et se réconcilie :
  à chaque instantané il repart de `self.move`, rejoue ses commandes non acquittées (`ack`), et lisse l'écart.
- **File d'entrées.** L'hôte consomme une commande par tick et par joueur ; file vide → répète la dernière ;
  file trop longue → en consomme deux pour rattraper.
- **Interpolation.** Autres joueurs et entités sont affichés avec ~100 ms de retard, interpolés entre deux
  instantanés.
- **Vocal.** WebRTC en maillage complet (≤ 4 pairs), signalisation relayée par le WebSocket. Chaque flux
  distant passe dans un `PannerNode` placé sur l'avatar (proximité), ou dans une chaîne « radio » pour le
  talkie. Le niveau du micro local est envoyé dans `PlayerInput.voice`.
- **Serveur** (`server/`) : `http` + `ws`. Salons à code de 5 lettres, 4 joueurs max, un `GameHost` par salon
  cadencé à 60 Hz, nettoyage des salons vides, service des fichiers du client construit (`dist/client`).
  En développement, Vite relaie `/ws` vers le serveur.

## 7. Client

**Boucle** (`client/src/core/`) — à chaque frame :

1. lire les entrées ; pour chaque tick écoulé : fabriquer un `PlayerInput`, l'envoyer, prédire ;
2. `session.update(dt)` puis traiter `session.poll()` (niveau, instantanés, événements) ;
3. interpoler, calculer la caméra (hauteur des yeux, balancement, secousses), synthétiser les pas ;
4. construire le `FrameState` ; appeler `render.render(frame)`, `audio.update(frame)`, `ui.update(frame)`.

**Contrats** (`client/src/core/contracts.ts`) : `FrameState`, `LevelRuntime`, `Settings`, et les interfaces
`RenderSystem`, `AudioSystem`, `UISystem`, `InputSystem`, `Session`. Les sous-systèmes ne s'importent
jamais entre eux. L'interface remonte des `UIIntent`, appelés de façon synchrone dans le gestionnaire
d'événement DOM (nécessaire pour le pointer lock et le démarrage de l'audio).

**Machine d'états de l'application** : `title → loading → playing ⇄ paused`, `playing → dead → playing`,
`playing → ended → title`. Perte du pointer lock en jeu ⇒ pause.

**Rendu** (`client/src/render/`, `client/src/world/`, `client/src/themes/`)

- **Vue du monde.** Un `WorldView` charge les chunks dans un rayon autour de la caméra et décharge au-delà
  (avec hystérésis), en étalant la construction sur plusieurs frames. Par chunk : **une géométrie fusionnée
  par matériau** (sols, plafonds, murs, contremarches) ; props et luminaires en **`InstancedMesh`**.
- **Convention d'UV.** Les UV sont en **mètres** (u horizontal, v vertical ou second axe au sol). Les
  matériaux règlent leur répétition en « mètres par motif ».
- **Éclairage.** Pas de `PointLight` par néon. Un **champ de lumière** (`LightField`, une valeur RGB par
  cellule, avec occlusion par les murs) est mis à jour ~15 fois par seconde autour de la caméra, envoyé dans
  une texture, et échantillonné par tous les shaders de surface à la position monde du fragment (décalée le
  long de la normale). Le scintillement d'un néon modifie donc réellement la pièce. Seule la **lampe
  torche** est une vraie lumière dynamique (cône calculé dans le shader). Les dalles lumineuses sont des
  instances émissives dont l'intensité suit `fixtureLevel`.
- **Brouillard** exponentiel à la couleur du niveau ; rien n'est visible au-delà de `fog.far`, ce qui borne
  le rayon de chargement.
- **Thème** (`client/src/themes/<id>/`) : fabrique les matériaux et modèles d'un niveau à partir de leurs
  clés, et donne l'humeur du post-traitement.
- **Post-traitement VHS** : rendu dans une cible à résolution réduite si besoin, puis une passe plein écran
  (grain, aberration chromatique, vignettage, lignes de balayage, bavement, décrochages), pilotée par
  `settings.vhsIntensity`, la santé mentale et les événements.
- **Budgets** (PC portable moyen, GPU intégré) : ≤ 150 appels de dessin, ≤ 400 000 triangles visibles,
  ≤ 4 ms de CPU par frame hors rendu, aucune allocation par frame dans les chemins chauds.

**Audio** (`client/src/audio/`) : un `AudioContext`, bus maître / ambiance / effets / voix, réverbération par
convolution avec réponse impulsionnelle générée. Bourdonnement piloté par les luminaires proches
(`world.fixturesNear` + `fixtureLevel`), pas depuis `frame.events`, sons lointains aléatoires spatialisés,
boucles d'entités, registre de sons ponctuels indexé par `SoundId` (convention `domaine.nom`).

**Interface** (`client/src/ui/`) : DOM et CSS au-dessus du canvas, textes dans `client/src/i18n/fr.ts`.

**Outils de test intégrés.** Paramètres d'URL : `?debug=1` expose `window.__LIMINAL__` ; `?autostart=1`
lance directement une partie solo ; `?seed=…`, `?level=…` ; `?nolock=1` permet de jouer sans pointer lock
(indispensable en navigateur headless). L'objet de debug expose au minimum :

```ts
window.__LIMINAL__ = {
  frames: number,                       // compteur de frames rendues
  state(): { screen, level, seedText, x, y, z, yaw, pitch, mode, stamina, chunks, perf, ... },
  start(seedText: string, level?: LevelId): void,
  setInput(o: { mx?, mz?, yaw?, pitch?, buttons? } | null): void,   // forcer les entrées
  teleport(x: number, z: number, yaw?: number): void,
}
```

## 8. Format des données de niveau et d'entité

- **Niveau** : `LevelDef` (`shared/src/levels/types.ts`) — palettes, ambiance lumineuse, brouillard, profil
  audio, `createGenerator(seed)`, `spawn(seed)`, `createScript()`, `director`. Enregistré dans
  `shared/src/levels/index.ts` via `registerLevel`.
- **Chunk** : `ChunkData` — tableaux `Uint8Array` de 256 octets (`cell`, `wallN`, `wallW`, `prop`, `light`,
  `lightFlags`, `variant`, `zone`) et la liste `objects`.
- **Entité** : état répliqué `EntityNet {id, kind, x, y, z, yaw, st, anim, tgt, fx}` ; l'état interne (cible,
  chemin, minuteries) reste côté simulation. Le rendu et l'audio choisissent modèle, animation et sons
  d'après `kind`, `st`, `anim`, `fx`.
- **Sauvegarde** : `localStorage`, clé versionnée `liminal.save.v1`.

## 9. Tests et qualité

| Étage | Outil | Quoi |
|---|---|---|
| Unitaires | Vitest (Node) | hash et RNG, génération (déterminisme, accessibilité), collisions, déplacement, IA, protocole |
| Intégration | Vitest | une partie complète sur un `GameHost` sans navigateur ; deux clients simulés et réconciliation |
| Navigateur | Playwright (`tools/e2e/`, `npm run e2e`) | le jeu se lance, on entre, on marche, captures d'écran, aucune erreur console, budgets de rendu |

Commandes : `npm run typecheck`, `npm test`, `npm run e2e`, `npm run check` (typecheck + tests).
**Règle d'or : `npm run check` est vert sur chaque commit.**

## 10. Conventions

- TypeScript strict. Pas de `enum` (objets `as const` et unions). Pas de `any` implicite.
- Identifiants et commentaires de code en anglais ; documents et textes du jeu en français.
- Aucune dépendance ajoutée sans validation du directeur. Dépendances actuelles : `three` (rendu),
  `ws` (serveur WebSocket) ; développement : `vite`, `typescript`, `vitest`, `tsx`, `playwright`, types.
- `shared/` n'importe ni `three`, ni le DOM, ni Node.
- Pas d'allocation dans les boucles par frame ou par tick quand c'est évitable (réutiliser vecteurs et tableaux).
