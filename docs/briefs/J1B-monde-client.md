# Brief J1B — Agent Monde (client)

**Jalon 1, vague B.** Le monde logique existe (`shared/src/world`, niveau 0) et le moteur de rendu aussi
(matériaux, éclairage, post-traitement). Il manque le pont entre les deux : transformer les chunks en
géométrie, les charger et décharger autour du joueur, sans jamais faire tomber le nombre d'images par
seconde. C'est toi qui rends le labyrinthe visible.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` §1, §3, §7 (« Rendu » : vue du monde, convention d'UV, éclairage, budgets), §10.
- `docs/reports/J1A-rendu.md` et `client/src/render/api.ts` : **l'API de rendu que tu consommes**
  (`RenderContext`, `MaterialLibrary`, `ModelLibrary`, `WorldView`, attributs de géométrie attendus,
  modulation de la luminosité des luminaires).
- `docs/reports/J1A-monde.md` : ce que fournit `World`.
- Contrats : `shared/src/world/types.ts`, `shared/src/world/api.ts`, `shared/src/constants.ts`,
  `client/src/core/contracts.ts` (`FrameState`, `LevelRuntime`).

## Ta zone

- `client/src/world/**` (tu remplaces le stub `index.ts`).
- `client/dev/world.html`, `client/dev/world.ts` (banc d'essai), `tools/e2e/world-*.e2e.mjs`.
- Port de développement : **5205**.

Un autre agent écrit en parallèle le cœur du jeu (boucle, joueur, caméra). Tu n'en dépends pas : ton banc
d'essai utilise le vrai `createRenderSystem()`, le vrai `createWorld()` sur le niveau 0, et de faux
`FrameState` (caméra qui avance toute seule ou pilotée au clavier).

## Livrables

### 1. `createWorldView(ctx, level): WorldView` (`client/src/world/index.ts`)

**Streaming**

- Rayon de chargement déduit de `level.def.fog.far` (ce qui est derrière le brouillard n'existe pas).
  Rayon de déchargement plus grand d'un chunk (hystérésis) pour éviter le va-et-vient.
- Au premier `update`, les chunks autour de la caméra sont construits immédiatement (pas de vide au
  départ). Ensuite, file triée par distance et **budget de temps par frame** (≈ 3 ms) : jamais de saccade
  en marchant ou en courant.
- Libère géométries et instances des chunks déchargés. Appelle `level.world.prune` de temps en temps.

**Maillage d'un chunk** — une géométrie fusionnée par matériau, UV en mètres :

- sols et plafonds, en fusionnant les cellules coplanaires de même matériau en grands rectangles ;
- murs d'arête : épaisseur réelle, deux faces, dessus si le mur est bas, chants visibles aux extrémités
  libres ; ouvertures de porte avec linteau et jambages ; jonctions en L, T et croix propres (pas de trou,
  pas de faces qui se battent) ;
- faces des cellules solides vues depuis les cellules ouvertes voisines (matériau `sideMat` du bloc) ;
- contremarches entre cellules de hauteurs de sol différentes ; pas de plafond si `ceilY` est `null` ;
- surfaces d'eau quand `waterY` est défini (matériau demandé au thème ; clé `<niveau>.water`).

Le maillage est une fonction pure (données du chunk et voisins → tableaux de sommets) testable sans WebGL.

**Props et luminaires**

- `InstancedMesh` par clé de modèle, **mutualisés entre tous les chunks chargés** pour tenir le budget
  d'appels de dessin ; rotation et petites variations tirées de l'octet `variant`.
- Luminaires : la luminosité de chaque instance suit `world.fixtureLevel(f, frame.time, level.power)`.
  Seuls les luminaires non stables sont réévalués à chaque frame.

**Objets de gameplay**

- Affiche les objets des chunks chargés d'après leur `model` (pour ce jalon : portes de sortie et flèches à
  la craie du niveau 0, avec la variante barrée), plus `level.added`. Reflète `level.objectState(id)` et se
  met à jour quand `level.objectsVersion` change. Structure pensée pour accueillir au jalon 2 les
  ramassables, portes animées et notes.

### 2. Budgets à tenir (mesurés, notés dans le rapport)

Au point de départ et en traversant le niveau 0 sur 3 seeds :

- ≤ 150 appels de dessin, ≤ 400 000 triangles ;
- construction d'un chunk (génération + maillage + envoi) ≤ 6 ms en moyenne sur cette machine ;
- aucune allocation par frame quand aucun chunk ne change.

### 3. Banc d'essai (`client/dev/world.html`)

Le vrai niveau 0 rendu avec le vrai moteur : caméra automatique qui parcourt les couloirs en évitant les
murs (ou vol libre au clavier), `?seed=…`, `?shot=N` pour des points de vue fixes. Affiche les compteurs.

## Exigence de qualité

Fais des captures à plusieurs endroits (couloir étroit, grande salle à piliers, zone sombre, porte de
sortie avec son bloc vert, flèche à la craie) et **regarde-les**. Cherche les défauts typiques : fissures
lumineuses entre les murs, faces manquantes, textures étirées ou à l'envers, murs sans épaisseur aux
portes, néons mal alignés dans la trame du plafond, scintillement entre faces superposées. Corrige-les.
Si un défaut vient du moteur de rendu (hors de ta zone), décris-le précisément dans ton rapport.

## Tests exigés

- Vitest : maillage — une cellule isolée, une pièce fermée, un mur avec ouverture, un mur bas, une marche,
  un bloc solide ; nombre de triangles attendu, normales vers l'intérieur des pièces, UV en mètres,
  aucun triangle dégénéré ; fusion des rectangles ; logique de streaming (quels chunks charger et
  décharger pour une trajectoire donnée, hystérésis).
- Navigateur, `tools/e2e/world-harness.e2e.mjs` : le banc se charge sans erreur console, les budgets du §2
  sont respectés à 3 positions, captures enregistrées, l'image n'est pas vide.

## Terminé quand

`npm run check` et ton test navigateur sont verts ; les captures sont décrites dans
`docs/reports/J1B-monde-client.md`, avec les mesures de budget.
