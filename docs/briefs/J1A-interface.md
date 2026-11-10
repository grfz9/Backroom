# Brief J1A — Agent Interface

**Jalon 1, vague A.** Tu construis tout ce que le joueur lit : écran titre, pause, paramètres, et le HUD
minimaliste d'un caméscope de 1991. Presque rien à l'écran, mais chaque élément doit avoir l'air de sortir
d'une bande VHS administrative.

## À lire

- `docs/AGENTS.md` (règles communes).
- `docs/ARCHITECTURE.md` §1, §7 (« Contrats », « Interface », « Outils de test »), §10.
- `docs/GDD.md` §1, §3 (touches), §12, §14.
- Contrats : `client/src/core/contracts.ts` (`UISystem`, `UIIntent`, `AppScreen`, `ScreenInfo`,
  `FrameState`, `Settings`, `SettingsStore`), `shared/src/sim/types.ts` (`GameEvent`).

## Ta zone

- `client/src/ui/**`, `client/src/i18n/**` (nouveaux).
- `client/src/core/settings.ts` (tu en deviens propriétaire, garde l'API `SettingsStore`),
  `client/src/core/save.ts` (nouveau).
- `client/dev/ui.html`, `client/dev/ui.ts` (banc d'essai), `tools/e2e/ui-*.mjs`.
- Port de développement : **5203**.

## Contexte de la vague

Le moteur de jeu (vague suivante) t'utilisera ainsi : `init(root, settings)` ; `setScreen(...)` à chaque
changement d'état ; `update(frame)` à chaque frame ; il s'abonne à `onIntent`. Tu ne connais ni le rendu
ni l'audio. Pour un son de menu, émets l'intention `{ type: 'sound', id: 'ui.hover' | 'ui.click' }`.
Ton interface est un calque DOM au-dessus du canvas WebGL : le fond des menus doit laisser voir l'image.

## Livrables

### 1. `createUI(): UISystem` (`client/src/ui/index.ts`)

DOM et CSS natifs, aucune bibliothèque, aucune police ni image externe. Les intentions sont émises de
façon **synchrone** dans le gestionnaire du clic ou de la touche.

### 2. Écrans

- **Titre** (`title`). Minimaliste : le mot LIMINAL (typographie monospace très espacée, léger dédoublement
  chromatique et tremblement de bande en CSS), une ligne « BUREAU DE CARTOGRAPHIE INTÉRIEURE — ÉQUIPE 12 »,
  un champ **seed** (vide ⇒ une seed lisible est générée et affichée, du type `moquette-417` ; la dernière
  seed jouée est proposée), le bouton **« Entrer »** (la touche Entrée fonctionne), un accès aux paramètres,
  un rappel discret des touches. Intention : `{ type: 'startSolo', seedText }`.
- **Chargement** (`loading`) : « LECTURE DE LA BANDE… », nom du niveau, seed.
- **Pause** (`paused`) : « PAUSE ‖ », avec directement visibles les trois réglages demandés —
  **sensibilité de la souris**, **volume**, **intensité de l'effet VHS** — puis Reprendre, Paramètres,
  Recommencer, Quitter vers le titre. Affiche le niveau et la seed (bouton copier).
- **Paramètres** (accessible du titre et de la pause), en onglets : Jeu (sensibilité, inverser Y, champ de
  vision, balancement de caméra, sous-titres), Vidéo (intensité VHS, qualité, échelle de rendu, compteur
  FPS), Audio (général, ambiance, effets), Contrôles (liste des touches, en lecture seule pour ce jalon).
  Tout changement s'applique immédiatement via `settings.set`. Bouton de réinitialisation.
- **Mort** (`dead`) et **Fin** (`ended`) : écrans sobres et fonctionnels (ils seront enrichis au jalon 2).

Navigation au clavier possible partout (Tab, Entrée, Échap pour revenir).

### 3. HUD (écran `playing`)

- **Incrustation caméscope** : « REC » avec point rouge clignotant, l'horodatage
  `14:03:27  17 MAI 1991` et `BANDE 12`. L'heure de départ dépend de la seed et avance avec `frame.time`
  (elle se fige quand le temps de jeu se fige). Indicateur de pile de caméscope décoratif, mention `SP`.
- **Endurance** : une ligne fine en bas, visible seulement quand `frame.local.stamina < 1`, qui s'efface
  ensuite ; elle change d'aspect si `exhausted`.
- **Invite d'interaction** : si `frame.local.target` existe, « [E] … » selon le type, avec progression
  pour les actions maintenues.
- **Sous-titres** : chaque événement `{ e: 'subtitle', key, x, z }` affiche le texte `t(key)` quelques
  secondes, avec une flèche indiquant la direction de la source par rapport à la caméra. Désactivables.
- **Messages** : événements `toast` et `objective`.
- **Compteur de performances** (`settings.showFps`) : FPS, ms par frame, appels de dessin, triangles,
  chunks, position, seed.
- Le HUD ne doit rien allouer ni toucher le DOM quand rien ne change (compare avant d'écrire).
- L'intensité VHS des éléments d'interface (tremblement, dédoublement) suit `settings.vhsIntensity`.

### 4. Textes (`client/src/i18n/`)

`t(key, args?)` et le dictionnaire `fr.ts`. **Aucune chaîne visible en dur** ailleurs. Inclus : tous les
libellés ; les noms des 8 niveaux (`level.<id>.name`, voir GDD §5) ; les sous-titres des sons du jalon,
avec la convention `sub.<SoundId>` : `sub.amb.knock` « [Coups sourds au loin] », `sub.amb.creak`,
`sub.amb.slam`, `sub.amb.drag`, `sub.amb.steps`, `sub.amb.murmur`, `sub.amb.hum_drop`, `sub.light.zap`.
Clé absente ⇒ la clé est renvoyée et un avertissement unique est émis.
Affiche les vraies légendes de touches quand `navigator.keyboard.getLayoutMap` existe (ZQSD sur AZERTY),
sinon « ZQSD / WASD ».

### 5. Paramètres et sauvegarde

- `settings.ts` : garde l'API, valide et borne les valeurs chargées, migre proprement une ancienne version.
- `save.ts` : `createSaveStore()` — dernière seed jouée pour ce jalon ; prévois dès maintenant la forme
  des données futures (niveaux débloqués, meilleurs temps, notes trouvées) avec une clé versionnée.

### 6. Banc d'essai (`client/dev/ui.html`)

Une page qui affiche ton interface sur un fond qui simule l'image du jeu, avec des boutons pour changer
d'écran et une boucle de faux `FrameState` (endurance qui varie, sous-titres, messages).

## Points d'attention

- Appuyer sur Échap fait sortir le navigateur du pointer lock : c'est le moteur qui passera alors à
  l'écran de pause. Ne suppose pas que tu captes Échap en jeu.
- Après une sortie par Échap, le navigateur refuse de reprendre le pointer lock pendant environ une
  seconde : « Reprendre » doit rester cliquable et l'écran ne doit pas se bloquer si la reprise échoue.
- `Ctrl+W` ferme l'onglet : le rappel des touches indique « Ctrl ou C » pour s'accroupir.

## Tests exigés

- Vitest : `t()` et clés manquantes, formatage de l'horodatage, génération de seed lisible, bornage des
  paramètres, sauvegarde avec un faux `localStorage`, calcul de la direction d'un sous-titre.
- Un test navigateur `tools/e2e/ui-harness.e2e.mjs` : chaque écran s'affiche sans erreur console ; cliquer
  « Entrer » émet `startSolo` avec la seed saisie ; déplacer un curseur modifie le paramètre ; capture de
  chaque écran. **Regarde les captures** et corrige ce qui est laid ou illisible.

## Terminé quand

`npm run check` et ton test navigateur sont verts ; `docs/reports/J1A-interface.md` décrit chaque écran
(d'après les captures) et liste les clés de texte que les autres agents peuvent utiliser.
