# Brief J1A — Agent Rendu

**Jalon 1, vague A.** Tu donnes son image à LIMINAL : un caméscope VHS de 1991 qui filme des couloirs à la
moquette humide sous des néons fatigués. L'ambiance est la priorité absolue du projet. Tu construis le
moteur de rendu, l'éclairage, les matériaux et textures procéduraux du niveau 0, et le post-traitement.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` §1, §3, §7 (surtout « Rendu »), §10.
- `docs/GDD.md` §5 « Niveau 0 », §12 « Direction artistique ».
- Contrats : `client/src/core/contracts.ts` (`RenderSystem`, `FrameState`, `LevelRuntime`, `Settings`),
  `shared/src/world/types.ts`, `shared/src/world/api.ts` (`World`, `LightField`), `shared/src/constants.ts`.

## Ta zone

- `client/src/render/**`, `client/src/themes/**` (nouveaux).
- `client/src/world/index.ts` : **stub uniquement** (voir §5), remplacé à la vague suivante.
- `client/dev/render.html`, `client/dev/render.ts` (banc d'essai), `tools/e2e/render-*.mjs`.
- Port de développement : **5201**.

## Contexte de la vague

En parallèle, l'agent Monde implémente `createWorld` et `createLightField` (pour l'instant des stubs qui
lèvent une erreur dans `shared/src/world/index.ts`). Le maillage des chunks (`WorldView`) sera fait à la
vague suivante par un autre agent, **avec ton API**. Tu travailles donc sur un **banc d'essai** : une scène
de test construite à la main avec tes matériaux, et un `LightField` factice (un objet qui respecte
l'interface, avec quelques néons dont un qui clignote).

## Livrables

### 1. `createRenderSystem(): RenderSystem` (`client/src/render/index.ts`)

- `WebGLRenderer` sans antialiasing, `powerPreference: 'high-performance'`, ratio de pixels plafonné,
  résolution interne = taille × `settings.renderScale` × facteur de qualité (low 0,6 / medium 0,8 / high 1).
- Caméra pilotée par `frame.camera` : ordre de rotation `'YXZ'`, `rotation.y = yaw`, `rotation.x = pitch`,
  `rotation.z = roll`, `fov`.
- `loadLevel(level)` : choisit le thème du niveau, crée le champ de lumière avec
  `createLightField(level.world, 96)`, applique brouillard et ambiance de `level.def`, puis crée la vue du
  monde via `createWorldView(ctx, level)` importé de `client/src/world/index.ts`.
- `render(frame)` : met à jour caméra, éclairage (champ de lumière ~15 Hz), lampe torche, vue du monde,
  uniforms du post-traitement, puis dessine. Aucune allocation par frame.
- `getStats()` : appels de dessin, triangles (`renderer.info`), chunks.
- Réagit à `settings.subscribe` (qualité, échelle, intensité VHS, FOV).

### 2. Éclairage par champ de lumière (`client/src/render/lighting/`)

- Le `LightField` (RGB par cellule) est envoyé dans une `DataTexture` flottante à filtrage linéaire.
  Tous les matériaux de surface l'échantillonnent à la position monde du fragment, **décalée le long de la
  normale** (un mur prend la lumière de la pièce qu'il regarde, pas celle de derrière).
- Façonnage : la lumière vient du plafond, donc léger dégradé vertical sur les murs ; assombrissement doux
  aux jonctions sol/mur et mur/plafond (occlusion ambiante simulée) ; les couleurs ne sont jamais brûlées.
- **Lampe torche** : cône calculé dans le shader de surface (position et direction en uniforms, bord doux,
  atténuation avec la distance, léger retard sur le mouvement de la caméra), actif si
  `frame.local?.flashlight`, intensité modulée par `battery`.
- Brouillard exponentiel à la couleur `level.def.fog`, opaque à `fog.far`.
- Les matériaux de surface doivent accepter les géométries fusionnées **et** l'instancing.

### 3. Matériaux et textures du niveau 0 (`client/src/themes/l0_halls/`)

Tout est dessiné par code sur canvas (512 px, mipmaps, anisotropie, répétition, UV en **mètres**). Rien de
propre : chaque texture a ses taches, sa crasse, son usure. Ajoute une variation à grande échelle en espace
monde pour casser la répétition du motif.

| Clé | Description |
|---|---|
| `l0.carpet` | moquette rase beige-jaune, fibres, taches sombres, zones piétinées |
| `l0.carpet_damp` | la même, détrempée : auréoles brunes, plus sombre |
| `l0.wallpaper` | papier peint jaunâtre à motif répété (petits losanges ou chevrons sur rayures verticales), plinthe sombre en bas, salissures en haut, traces d'eau, joints de lés visibles |
| `l0.wallpaper_b` | second motif (damier floral très délavé), même palette |
| `l0.ceiling` | dalles de faux plafond 60 × 60 cm mouchetées, profilés en T, quelques dalles tachées ou décalées |
| `l0.concrete` | sol de béton peint gris, usé |
| `l0.service_wall` | parpaings peints en gris-vert, écaillés |

Modèles (géométrie + matériau, utilisables en `InstancedMesh`) :

| Clé | Description |
|---|---|
| `l0.pillar` | pilier carré 0,6 m habillé de papier peint, plinthe |
| `l0.chair` | chaise de bureau simple (primitives) |
| `l0.neon_panel` | dalle lumineuse 1,2 × 0,6 m encastrée au plafond, diffuseur strié, cadre. Émissive ; **la couleur d'instance module sa luminosité** (0 = éteinte, on voit alors le diffuseur gris) |
| `l0.exit_sign` | bloc « SORTIE » vert, texte dessiné sur canvas, émissif, modulé de la même façon |
| `l0.exit_door` | porte métallique grise avec barre anti-panique et cadre |
| `l0.chalk_arrow` | flèche à la craie sur fond transparent (plan à plaquer sur un mur) ; variante barrée |

Clé inconnue ⇒ matériau ou boîte de substitution magenta et un `console.warn` unique par clé.

### 4. Post-traitement VHS (`client/src/render/post/`)

La scène est rendue dans une cible, puis une passe plein écran fait, dans cet ordre de principe : halo des
sources lumineuses (bloom léger à basse résolution, coupé en qualité `low`), bavement horizontal de la
chrominance, aberration chromatique radiale légère, ondulation horizontale de la bande, décrochages
rares (bandes qui se déchirent une fraction de seconde), bande de bruit de commutation de têtes en bas
d'image, grain animé, lignes de balayage discrètes, vignettage, étalonnage (noirs relevés, dominante
jaune-verte, saturation réduite), conversion sRGB.

- Piloté par `settings.vhsIntensity` : à 0, il ne reste que l'étalonnage et la conversion.
- Expose des uniforms pour plus tard : `glitch` (0..1, secousse violente), `sanity` (0..1), `damage`.
- L'horodatage REC n'est **pas** ton affaire (c'est l'interface, en DOM).

### 5. API pour l'agent de la vague suivante (`client/src/render/api.ts`)

Définis et documente les types que la vue du monde utilisera :

```ts
export interface RenderContext { scene; materials: MaterialLibrary; models: ModelLibrary; theme: Theme; ... }
export interface MaterialLibrary { get(key: string): THREE.Material }
export interface ModelLibrary { get(key: string): ModelDef }
export interface WorldView { update(frame: FrameState): void; dispose(): void; readonly chunks: number }
export interface Theme { ... }   // ce qu'un pack de niveau fournit
```

et crée le stub `client/src/world/index.ts` :
`export function createWorldView(ctx: RenderContext, level: LevelRuntime): WorldView` qui ne dessine rien.
Précise dans ton rapport : les attributs de géométrie attendus (position, normal, uv en mètres…), comment
moduler la luminosité d'une instance de luminaire, comment enregistrer un thème.

### 6. Banc d'essai (`client/dev/render.html`)

Une scène de test : un couloir, une salle à piliers, une zone sombre, un néon qui clignote, une porte de
sortie, une flèche à la craie ; caméra qui avance lentement, ou fixe avec `?shot=N` pour les captures.
Il doit suffire à juger l'image sans le reste du jeu.

## Exigence de qualité

Fais des captures (`tools/e2e/lib.mjs`), **regarde-les**, et itère. Critère : quelqu'un qui voit une capture
doit reconnaître aussitôt un couloir liminal filmé au caméscope — lumière jaune plate, moquette douteuse,
plafond bas, fond qui se perd dans la brume, image sale. Pas une démo technique grise. Vérifie aussi une
zone sombre éclairée à la lampe torche, et le rendu à `vhsIntensity` 0, 0,7 et 1.

## Tests exigés

- Vitest pour la logique pure (calculs d'uniforms, facteurs de qualité, registres de clés).
- Un test navigateur `tools/e2e/render-harness.e2e.mjs` : le banc se charge sans erreur console, des frames
  sont rendues, captures enregistrées ; l'image n'est ni noire ni uniforme (statistiques de pixels).
- Mesures notées dans le rapport pour la scène de test : appels de dessin, triangles, temps CPU par frame.

## Terminé quand

`npm run check` et ton test navigateur sont verts ; les captures du banc d'essai (au moins 4 points de vue)
sont décrites dans `docs/reports/J1A-rendu.md` ; l'API du §5 est documentée.
