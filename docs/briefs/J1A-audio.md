# Brief J1A — Agent Audio

**Jalon 1, vague A.** Dans LIMINAL, la peur passe d'abord par l'oreille. Tu construis le moteur audio et
toute la bande-son du niveau 0, **entièrement synthétisée** avec la Web Audio API : aucun fichier son.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` §1, §7 (« Audio »), §10.
- `docs/GDD.md` §3 (bruit, endurance), §5 « Niveau 0 », §13 « Direction sonore ».
- Contrats : `client/src/core/contracts.ts` (`AudioSystem`, `AudioCue`, `FrameState`, `LevelRuntime`,
  `Settings`), `shared/src/sim/types.ts` (`GameEvent`, `SoundId`), `shared/src/world/api.ts`
  (`fixturesNear`, `fixtureLevel`), `shared/src/world/types.ts` (`Fixture`, `SurfaceKind`).

## Ta zone

- `client/src/audio/**` (nouveau).
- `client/dev/audio.html`, `client/dev/audio.ts` (banc d'essai), `tools/e2e/audio-*.mjs`.
- Port de développement : **5202**.

## Contexte de la vague

L'implémentation de `World` arrive en parallèle : code contre l'interface, et utilise dans ton banc d'essai
un faux monde qui ne fournit que `fixturesNear` et `fixtureLevel`. Le moteur de jeu t'appellera ainsi :
`init(settings)` au démarrage, `unlock()` dans le clic sur « Entrer », `loadLevel(level)`, puis
`update(frame)` à chaque frame.

## Livrables

### 1. `createAudioSystem(): AudioSystem` (`client/src/audio/index.ts`)

- Un seul `AudioContext`. Bus : ambiance, effets, voix (réservé), maître ; limiteur en sortie. Les volumes
  suivent `settings` (`volumeMaster`, `volumeAmbience`, `volumeSfx`) en direct.
- Le graphe doit pouvoir se construire sur n'importe quel `BaseAudioContext`, donc aussi sur un
  `OfflineAudioContext` pour les tests.
- Auditeur placé sur `frame.camera` (position et orientation ; yaw 0 regarde vers −Z, yaw positif tourne à
  gauche). Spatialisation par `PannerNode` HRTF.
- Réverbération par convolution avec une réponse impulsionnelle **générée** selon
  `level.def.audio.reverb` et `reverbTime` (niveau 0 : moquette, court et mat).
- `frame.paused` : l'ambiance est étouffée (filtre passe-bas et −12 dB), pas coupée.
- `play(id, vol)` pour les sons non spatialisés ; `onCue(cb)` pour signaler tes sons d'ambiance importants.
- Ne lève jamais d'exception vers l'appelant ; un `SoundId` inconnu donne un avertissement unique et un
  son de repli discret.

### 2. Le bourdonnement des néons (la signature du jeu)

- **Fond** : ton de salle fait de 50 Hz et d'harmoniques (100, 150, 200 Hz…) légèrement désaccordés qui
  battent lentement, plus un souffle filtré. Son niveau et sa couleur suivent la somme des néons proches :
  `fixturesNear(x, z, 14)` pondérés par la distance, par `type.hum` et par `fixtureLevel(f, frame.time,
  level.power)`.
- **Sources ponctuelles** : les 4 néons bourdonnants les plus proches ont chacun une voix spatialisée
  (grésillement de ballast). Son gain suit `fixtureLevel` en temps réel : quand un tube bégaie, on
  l'entend bégayer, avec un claquement sec à chaque rallumage. Réattribution des voix sans clic.
- **Zone sombre** : quand les néons sont morts autour du joueur, le bourdonnement se retire et laisse un
  grave sourd, presque rien. Ce silence doit être inconfortable.

### 3. Les pas

Déclenchés par les événements `{ e: 'step' }` de `frame.events` (le moteur les synthétise à la bonne
cadence). Un son différent par `surface` (toutes les valeurs de `SurfaceKind` ; soigne `carpet`,
`concrete`, `tile`) et par `mode` :

- `walk` : feutré, net ; `run` : plus fort, plus sec, plus de médiums ; `crouch` : à peine un frottement.
- `wet > 0` : clapotis superposé, proportionnel.
- Variations aléatoires à chaque pas (hauteur, filtre, alternance gauche/droite légère) : jamais deux fois
  le même son.
- Les pas du joueur local (`pl === frame.local.id`) sont proches et non spatialisés ; ceux des autres sont
  spatialisés à leur position.
- **Respiration** : essoufflement synthétique quand `frame.local.stamina` passe sous 0,35, lourd si
  `exhausted`, qui se calme progressivement.

### 4. Les sons lointains inexpliqués

Un ordonnanceur déclenche, toutes les 25 à 90 secondes (jamais deux fois de suite le même), un événement
spatialisé à 20–45 m dans une direction quelconque, filtré par la distance et envoyé dans la réverbération :

`amb.knock` (2 à 4 coups sourds), `amb.creak` (grincement métallique long), `amb.slam` (porte qui claque),
`amb.drag` (quelque chose de lourd qu'on traîne), `amb.steps` (course brève, étouffée), `amb.murmur`
(presque une voix, inintelligible), `amb.hum_drop` (tous les néons baissent une seconde).

Chaque déclenchement appelle le rappel de `onCue` avec `{ key, x, z }`. La fréquence et la liste viennent du
préréglage d'ambiance du niveau.

### 5. Registre de sons ponctuels et préréglages

- Registre `SoundId → synthèse` utilisé par les événements `{ e: 'sound' }` (spatialisés) et par `play()`.
  Pour ce jalon : les `amb.*` ci-dessus, `light.zap` (claquement de tube), `ui.hover`, `ui.click`,
  `ui.enter` (enclenchement de cassette et moteur de caméscope qui démarre), `ui.pause`, `vhs.glitch`.
- Préréglages d'ambiance : `client/src/audio/ambiences/<clé>.ts`, choisis par
  `level.def.audio.ambience`. Fournis `l0_halls` et documente le format pour les 7 niveaux suivants.

### 6. Banc d'essai (`client/dev/audio.html`)

Une page avec des boutons pour chaque son, des curseurs (nombre de néons, clignotement, zone sombre,
allure de marche, endurance) et une boucle qui fabrique de faux `FrameState`.

## Tests exigés

Tu ne peux pas écouter : **mesure**.

- Vitest pour la logique pure (ordonnanceur, attribution des voix, tables de paramètres, repli).
- Un test navigateur `tools/e2e/audio-offline.e2e.mjs` qui charge le banc d'essai, rend hors ligne
  (`OfflineAudioContext`) plusieurs scènes et analyse le signal :
  - bourdonnement : énergie dominante autour de 50/100 Hz, RMS plus élevé avec des néons proches que sans ;
  - pas : `run` plus fort que `walk` plus fort que `crouch` ; `carpet` plus sourd que `tile` (centre de
    gravité spectral) ;
  - chaque son ponctuel du registre : non silencieux, durée finie, pas de `NaN`, crête sous 1,0 ;
  - mixage complet (bourdonnement + pas + un son lointain) : aucune saturation.
- Le test échoue sur toute erreur console.

## Terminé quand

`npm run check` et ton test navigateur sont verts ; `docs/reports/J1A-audio.md` donne les mesures, décrit
chaque son (recette de synthèse en une ligne) et le format des préréglages d'ambiance.
