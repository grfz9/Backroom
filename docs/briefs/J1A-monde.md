# Brief J1A — Agent Monde

**Jalon 1, vague A.** Tu construis le monde logique de LIMINAL : la grille, les collisions, la lumière de
gameplay, les outils de génération, et le premier niveau infini. Tout ton code est dans `shared/` :
TypeScript pur, sans DOM, sans Node, sans Three.js. D'autres agents (rendu, audio, moteur) consomment ton API.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` §1, §3, §4, §9, §10.
- `docs/GDD.md` §5 « Niveau 0 — Les Couloirs » et §12.
- Contrats : `shared/src/constants.ts`, `shared/src/math/rng.ts`, `shared/src/world/types.ts`,
  `shared/src/world/api.ts`, `shared/src/levels/types.ts`, `shared/src/levels/registry.ts`.

## Ta zone

- `shared/src/world/**` sauf `types.ts` et `api.ts` (tu remplaces le stub `index.ts`).
- `shared/src/gen/**` (nouveau).
- `shared/src/levels/index.ts` et `shared/src/levels/l0_halls/**` (nouveau).
- `tools/world/**` (nouveau, scripts de visualisation).

## Livrables

### 1. `World` (`shared/src/world/`)

Implémente exactement l'interface `World` et exporte depuis `shared/src/world/index.ts` :

```ts
export function createWorld(level: LevelDef, seed: number): World;
export function createLightField(world: World, size: number): LightField;
```

- **Chunks** : génération à la demande via `level.createGenerator(seed)`, cache, `prune`. Les requêtes par
  cellule traversent les frontières de chunks ; garde un accès rapide au dernier chunk consulté.
- **Arêtes** : `wallAt` pour les 4 directions (S et E se lisent chez le voisin). `edgeBlocked` : voisin
  solide, mur bloquant sans ouverture, porte fermée, ou marche de plus de 0,6 m.
- **`moveCircle`** : cylindre contre boîtes — cellules solides, murs d'arête (épaisseur `thickness` ou
  `WALL_THICKNESS`), murs à ouverture (deux jambages ; l'ouverture est bouchée si la porte est fermée),
  props (cercle ou boîte, rotation par quarts de tour depuis l'octet `variant`), marches hautes.
  Glissement le long des obstacles, pas de tremblement dans les coins, **aucun passage à travers un mur**
  pour un déplacement jusqu'à 1 m par appel (sous-pas), résultat déterministe.
- **`raycast`** en 3D : parcours de grille (DDA). Un mur ne bloque que si la hauteur du rayon au point de
  croisement est entre son bas et son haut ; une ouverture laisse passer sous sa hauteur si la porte est
  ouverte ; un prop bloque sous sa hauteur. Modes `'sight'` et `'move'`.
- **Luminaires** : `fixturesInChunk`, `fixturesNear`, et `fixtureLevel(f, time, power)` — **fonction pure de
  `(f.seed, time)`**, sans état, identique sur toutes les machines :
  - stable : 1 ;
  - clignotant : allumé la plupart du temps, avec des épisodes irréguliers (toutes les 2 à 9 s, durée
    0,15 à 1,5 s) de bégaiement rapide entre ~0,05 et 1, et de rares coupures franches d'une seconde ;
  - mourant : presque éteint (~0,03), avec de rares éclairs brefs ;
  - mort : 0 ; groupe d'alimentation coupé : 0.
  Le résultat doit *ressembler* à un tube fluorescent fatigué, pas à un stroboscope régulier.
- **`lightAt`** : ambiance du niveau + luminaires proches, atténuation avec la distance et occlusion par
  les murs. Sert aux règles d'obscurité et aux entités.
- **`LightField`** : grille RGB par cellule centrée sur un point. La lumière se propage de cellule en
  cellule à partir de chaque luminaire et **ne traverse pas** les arêtes qui bloquent la vue ni les cellules
  solides ; elle contourne un peu les angles (éclairage indirect), s'atténue jusqu'à `radius` cellules ;
  ajoute l'ambiance du niveau. Les cloisons basses ne l'arrêtent pas. Objectif : mise à jour d'une grille
  96×96 en moins de 2 ms en moyenne (mets en cache l'empreinte statique de chaque luminaire ; seule
  l'intensité change dans le temps).

### 2. Outils de génération (`shared/src/gen/`)

Une petite boîte à outils que les 7 autres niveaux réutiliseront :

- un **canevas de grille** inscriptible en coordonnées monde (cellules, arêtes dans les 4 directions,
  props, luminaires, zones, objets) qui sait se découper en `ChunkData` ;
- un **cache de régions** : générer une région de N×N cellules d'un bloc, de façon pure, et servir les
  chunks qui la recouvrent ; outils pour décider des connexions entre régions voisines par hash de la
  frontière commune ;
- des **préfabs** : définition par code et par plan ASCII lisible, rotation par quarts de tour, tamponnage
  dans un canevas, déclaration de portes de raccordement, objets attachés ;
- utilitaires : bruit de valeur 2D lissé déterministe, parcours en largeur, test d'accessibilité.

### 3. Niveau 0 — Les Couloirs (`shared/src/levels/l0_halls/`)

Un `LevelDef` enregistré dans `shared/src/levels/index.ts`. Suis le GDD ; précisions :

- **Sensation recherchée** : un labyrinthe de bureaux vides sans logique. Couloirs étroits (1 cellule),
  salles irrégulières en L ou à recoins, ouvertures sans porte, culs-de-sac, piliers carrés, et de temps en
  temps une **très grande salle vide** à piliers alignés (jusqu'à 20×20 cellules) ou un long couloir droit
  de 30 m. Les murs sont **fins** (arêtes), pas des blocs. De la variété d'une région à l'autre (dense,
  ouvert, quadrillé), décidée par un bruit basse fréquence.
- **Zones sombres** (`zone = 1`) : poches où la plupart des néons sont morts.
- **Néons** : dalles lumineuses au plafond selon une trame régulière (environ une cellule sur deux dans
  chaque direction, alignées). En zone normale ≈ 78 % stables, 12 % clignotants, 4 % mourants, 6 % morts ;
  en zone sombre ≈ 70 % morts. Jamais de grande zone parfaitement uniforme.
- **Départ** : `spawn()` donne le centre d'une petite salle éclairée et sûre près de l'origine.
- **Sorties** : des salles de service (préfab) placées de façon déterministe, environ une par zone de
  200 m, jamais à moins de 120 m du départ. Chacune contient un objet `exit` (`model: 'l0.exit_door'`,
  `tag: 'exit'`) sous un bloc lumineux `exit_sign`. Dans un rayon de 80 m autour d'une sortie, des objets
  `marker` (`model: 'l0.chalk_arrow'`) sont posés sur des murs, à 1,4 m de haut, orientés vers la sortie ;
  un tiers porte `data: { crossed: 1 }` (flèche barrée puis corrigée).
- **Garanties** : toute cellule ouverte est accessible depuis le départ ; chaque sortie est atteignable.

**Palettes — ces clés sont un contrat avec l'agent Rendu, utilise-les telles quelles :**

| Palette | Id | `name` | Clés et valeurs |
|---|---|---|---|
| cells | 0 | `void` | solide, `sideMat: 'l0.wallpaper'` |
| cells | 1 | `carpet` | `floorMat: 'l0.carpet'`, `ceilMat: 'l0.ceiling'`, `sideMat: 'l0.wallpaper'`, `ceilY: 2.6`, surface `carpet` |
| cells | 2 | `carpet_damp` | comme 1 avec `floorMat: 'l0.carpet_damp'` (taches d'humidité, plutôt en zone sombre) |
| cells | 3 | `service` | `floorMat: 'l0.concrete'`, `ceilMat: 'l0.ceiling'`, `sideMat: 'l0.service_wall'`, surface `concrete` |
| walls | 1 | `wallpaper` | plein, `mat: 'l0.wallpaper'` |
| walls | 2 | `wallpaper_b` | plein, `mat: 'l0.wallpaper_b'` (second motif, par régions) |
| walls | 3 | `doorway` | `mat: 'l0.wallpaper'`, ouverture 0,95 × 2,05 m |
| walls | 4 | `service_wall` | plein, `mat: 'l0.service_wall'` |
| walls | 5 | `service_doorway` | `mat: 'l0.service_wall'`, ouverture 0,95 × 2,05 m |
| props | 1 | `pillar` | `model: 'l0.pillar'`, boîte 0,3 × 0,3 (demi-côtés), hauteur 2,6, bloque la vue |
| props | 2 | `chair` | `model: 'l0.chair'`, cercle r 0,3, hauteur 0,9, rotation libre, très rare |
| lights | 1 | `neon` | `model: 'l0.neon_panel'`, couleur `[1.0, 0.93, 0.70]`, intensité 1, rayon 4,5, `hum: 1` |
| lights | 2 | `exit_sign` | `model: 'l0.exit_sign'`, couleur `[0.25, 1.0, 0.45]`, intensité 0,35, rayon 2, `hum: 0.3` |

Ambiance : `ambient { color: [1.0, 0.93, 0.70], level: 0.05 }`, `fog { color: [0.20, 0.17, 0.08],
near: 5, far: 34 }`, `audio { ambience: 'l0_halls', reverb: 0.22, reverbTime: 0.9 }`. Pas de script ni de
director pour ce jalon.

### 4. Visualisation (`tools/world/`)

Un script Node (`npx tsx tools/world/dump.ts <seed> [rayon]`) qui écrit un plan ASCII d'une zone autour du
départ (murs, piliers, néons et leur mode, zones sombres, sorties, flèches). **Regarde tes labyrinthes** et
itère jusqu'à ce qu'ils soient intéressants à parcourir : c'est un livrable de game design, pas seulement
de code.

## Tests exigés (Vitest, à côté du code)

- Déterminisme : deux mondes neufs de même seed donnent des chunks identiques octet par octet, quel que
  soit l'ordre de génération ; deux seeds différentes donnent des mondes différents.
- Cohérence : `edgeBlocked(ix, iz, E) === edgeBlocked(ix+1, iz, W)` (et N/S) sur une grande zone, y
  compris aux frontières de chunks et de régions.
- Accessibilité : depuis le départ, parcours en largeur sur un rayon de 5 chunks — au moins 97 % des
  cellules ouvertes atteintes ; la sortie la plus proche est atteinte ; le tout sur 5 seeds.
- Collisions : on ne traverse ni mur, ni cellule solide, ni pilier, y compris en biais dans un coin et par
  pas de 1 m ; on glisse le long d'un mur ; on passe une ouverture de porte ; une porte fermée bloque.
- Rayons : mur plein bloque ; ouverture laisse passer ; cloison basse bloque en dessous et pas au-dessus.
- Lumière : `fixtureLevel` dans [0, 1], déterministe, 0 si mort ou hors tension ; statistiques d'un tube
  clignotant plausibles (allumé plus de 70 % du temps) ; `lightAt` plus fort sous un néon que loin ;
  `LightField` : pas de fuite à travers un mur plein, cohérent avec `lightAt` à ±30 %.
- Performance (seuils larges) : 200 chunks en moins de 1,5 s ; `LightField` 96×96 en moins de 5 ms.

## Terminé quand

- `npm run check` est vert, tous les tests ci-dessus existent et passent.
- Le plan ASCII de 3 seeds montre couloirs, salles irrégulières, grandes salles à piliers, culs-de-sac,
  zones sombres, sorties et flèches — tu les as regardés et décris ce que tu vois dans le rapport.
- Ton rapport `docs/reports/J1A-monde.md` documente l'API de `shared/src/gen/` (pour les futurs niveaux).
