# LIMINAL — Game Design Document

> Jeu d'horreur coopératif (1 à 4 joueurs) dans le navigateur. Vue à la première personne, caméscope VHS,
> exploration d'un « Intérieur » sans fin. Tout est généré par code : monde, textures, sons, créatures.

Ce document est la référence de conception. L'architecture technique est dans `ARCHITECTURE.md`,
le découpage en jalons dans `JALONS.md`, l'avancement dans `PROGRESS.md`.

---

## 1. Vision

**Pitch.** 1991. Le Bureau de Cartographie Intérieure (BCI) envoie des équipes d'arpenteurs filmer des
bâtiments qui ont « plus d'intérieur que d'extérieur ». Vous êtes l'équipe n° 12. Ce que vous voyez est la
bande de votre caméscope. Personne n'a revu l'équipe n° 7.

**Piliers.**

1. **L'ambiance avant tout.** Le jeu fait peur par ce qu'on entend et ce qu'on devine, pas par ce qu'on voit.
   Lumière plate des néons, brouillard, bourdonnement, silence soudain.
2. **Se perdre pour de vrai.** Aucun minimap, aucun marqueur d'objectif. On s'oriente avec ses yeux, sa
   craie, sa carte dessinée à la main et la voix des autres.
3. **Le bruit est une ressource.** Courir, parler dans son micro, patauger : tout s'entend. Chaque entité a
   une façon différente de percevoir, donc une façon différente d'être évitée.
4. **Ensemble mais séparés.** Les énigmes obligent à se disperser ; la voix ne porte qu'à quelques mètres.
5. **Un lieu qui apprend.** L'Intérieur copie les lieux humains de mémoire, mal. Ses créatures sont ses
   brouillons de personnes, faites avec les matériaux du niveau.

**Originalité.** On s'inspire du mythe collectif des Backrooms (espaces liminaux, néons, moquette), mais tous
les niveaux, entités, énigmes, noms et le lore du BCI sont propres à LIMINAL.

**Ton.** Sobre, administratif, froid. Pas de gore, pas de jump scare gratuit : la tension vient de l'attente.
Les rares moments violents sont brefs et sonores.

---

## 2. Boucle de jeu

**Macro (une partie).** Salon → choix du niveau débloqué et de la seed → descente niveau par niveau →
chaque niveau se termine par une sortie à trouver et à ouvrir → le niveau suivant est débloqué et sauvegardé.

**Méso (un niveau, 10 à 25 min).**

1. Arrivée : comprendre la règle du niveau (un indice visuel ou une note l'enseigne dans les 2 premières minutes).
2. Exploration : trouver les éléments nécessaires à la sortie (fusibles, vannes, code, badge…), des
   ressources (piles, eau d'amande) et des fragments de lore.
3. Pression : l'entité du niveau se manifeste, d'abord de loin, puis activement. La santé mentale s'érode.
4. Résolution : énigme de sortie, qui demande de se séparer ou de communiquer.
5. Fuite ou passage : la sortie s'ouvre, souvent en attirant le danger.

**Micro (30 secondes).** Écouter → décider (avancer, se cacher, éteindre la lampe, se taire) → se déplacer
en gérant son bruit et son endurance → observer un détail (flèche à la craie, néon mort, porte entrouverte).

**Échec.** Un joueur tué réapparaît après 20 s au dernier point sûr tant qu'un coéquipier est vivant ; il perd
ses objets consommables (ils restent au sol à l'endroit de sa mort). Si tous les joueurs sont morts en même
temps (ou en solo), le niveau recommence depuis son entrée avec la même seed.

---

## 3. Le joueur

| Action | Touche (physique) | Détail |
|---|---|---|
| Se déplacer | ZQSD / WASD (même position physique), flèches | 2,5 m/s |
| Courir | Maj | 4,9 m/s, endurance ≈ 7 s, récupération après 1,2 s |
| S'accroupir | Ctrl ou C | 1,2 m/s, silencieux, passe sous le regard derrière un meuble |
| Interagir | E | court ou maintenu selon l'objet |
| Lampe torche | F | consomme la pile |
| Carte | M | carnet à dessiner |
| Talkie | V (maintenir) | radio longue portée si on en possède un |
| Objets | 1–4, G pour lâcher | 4 emplacements |
| Pause | Échap | en solo la simulation s'arrête, pas en coop |
| FPS | F3 | compteur de performances |

- **Endurance.** Épuisé, on ne peut plus courir tant que la jauge n'est pas remontée à 30 %, et la
  respiration s'entend (bruit).
- **Bruit.** Chaque déplacement émet un rayon sonore : accroupi 1,5 m, marche 6 m, course 15 m ; ×1,8 dans
  l'eau. **La voix du joueur dans son micro compte** (jusqu'à 14 m) : les entités qui entendent vous
  entendent parler.
- **Santé (100).** Pas de régénération. L'eau d'amande rend 50. L'écran se désature et la respiration
  s'alourdit quand elle baisse ; pas de chiffre à l'écran.
- **Santé mentale (100).** Voir §8.
- **Se cacher.** Casiers, armoires, dessous de bureaux : invisible pour les entités qui voient, sauf si elles
  vous ont vu entrer.
- **Pas de saut, pas d'arme.** On ne se défend pas : on évite.

---

## 4. Objets

**Outils** (permanents, conservés d'un niveau à l'autre) :

| Objet | Où | Effet |
|---|---|---|
| Lampe torche | dès le départ | Cône de lumière. Pile : 6 min d'autonomie. Repousse l'Éteint, attire le Veilleur. |
| Talkie-walkie | Niveau 1 | Coop : voix à distance illimitée (grésillante) entre porteurs de talkie. Solo et coop : grésille quand une entité approche, capte parfois des fragments d'enregistrements. |
| Carnet-carte | Niveau 0 (près du départ) | Feuille quadrillée par niveau où l'on dessine à la souris. Affiche seulement le nombre de pas depuis la dernière ouverture et un cap approximatif. |
| Craie | Niveau 0 | Tracer une marque (flèche, croix, cercle) sur un mur ou le sol. Visible par tous, persistante pour la partie. |

**Consommables et objets de quête** (4 emplacements, lâchés à la mort) :

| Objet | Effet |
|---|---|
| Pile | Recharge la lampe à 100 %. |
| Eau d'amande | +50 santé, +25 santé mentale. Rare (1 à 3 par niveau). |
| Fusible | Objet de quête (niveaux 1, 3, 7). Un seul par emplacement : on n'en porte pas beaucoup. |
| Clé / badge | Ouvre une porte précise. |
| Cassette | Enregistrement de lore, s'écoute immédiatement puis rejoint les archives du menu. |

---

## 5. Les niveaux

Vue d'ensemble :

| # | Id | Nom | Ambiance | Structure | Entité principale | Sortie |
|---|---|---|---|---|---|---|
| 0 | `l0_halls` | Les Couloirs | moquette beige, papier peint jaune, néons | procédural infini | Le Rôdeur | Porte de service, suivre les flèches de l'équipe 7 |
| 1 | `l1_parking` | Niveau −2 | parking inondé, béton, sodium | procédural + noyau construit | L'Écouteuse | 3 fusibles pour le monte-charge |
| 2 | `l2_pools` | Les Bassins | carrelage blanc, eau, silence | procédural + salle des vannes | Les Baigneurs | 2 vannes simultanées, bonde au fond du grand bassin |
| 3 | `l3_offices` | Open Space | bureaux éteints, noir total | procédural + aile direction | L'Éteint | Disjoncteur + badge, cage d'escalier |
| 4 | `l4_warehouse` | L'Entrepôt | rayonnages géants, sodium, annonces | procédural + quai construit | L'Écho | Code à 4 chiffres réparti dans les allées |
| 5 | `l5_hotel` | Hôtel Terminus | couloirs d'hôtel qui se répètent | boucle + réception construite | Le Veilleur | Standard téléphonique, 3 appels |
| 6 | `l6_outside` | Dehors | lotissement de nuit sous un ciel peint | procédural + maquette construite | L'Éteint + Baigneurs (« Voisins ») | 3 maisons réelles, porte dans l'horizon |
| 7 | `l7_threshold` | Le Seuil | les archives du BCI, mal copiées | entièrement construit | Le Brouillon | 4 dispositifs, puis la fuite |

Règles communes : une sortie ne s'active que lorsque **tous les joueurs vivants** sont dans sa zone
(maintenir E ; un compteur « 2/3 arpenteurs » s'affiche). Les joueurs morts réapparaissent au niveau suivant.

### Niveau 0 — Les Couloirs (`l0_halls`)

- **Ambiance.** Moquette beige humide et tachée, papier peint jaunâtre à motifs, plafond en dalles avec
  néons encastrés. Plafond bas (2,6 m). Bourdonnement électrique permanent. Odeur de moquette mouillée
  (suggérée par les notes).
- **Génération.** Infini. Labyrinthe de couloirs étroits et de salles irrégulières, piliers carrés, culs-de-sac,
  parfois de très grandes salles vides à piliers alignés, parfois des zones sombres où la plupart des néons
  sont morts. Murs fins. Quelques détails rares : une prise électrique, une chaise seule, une tache au plafond.
- **Règles.** Aucune au début : c'est le niveau qui apprend à marcher, écouter et marquer son chemin. Le
  noir prolongé fait baisser la santé mentale.
- **Dangers.** Le Rôdeur apparaît après 3 minutes, d'abord en silhouette lointaine.
- **Sortie.** Des salles de service (construites à la main, toutes semblables : une porte métallique grise sous
  un bloc « SORTIE » vert qui grésille) existent à intervalles déterministes (environ une par zone de
  200 m, jamais à moins de 120 m du départ). L'équipe 7 a laissé des **flèches à la craie** sur les murs
  dans un rayon de 80 m autour de chaque sortie ; un tiers d'entre elles sont barrées et corrigées.
  Tous les joueurs vivants doivent être dans la salle.
- **Solo / coop.** Identique. En coop, la tentation est de se séparer pour chercher les flèches.
- **Lore.** Premières notes de l'équipe 7, carnet-carte et craie trouvés près du départ (un sac abandonné).

### Niveau 1 — Niveau −2 (`l1_parking`)

- **Ambiance.** Parking souterrain en béton, piliers numérotés, 15 à 40 cm d'eau noire, lampes au sodium
  orange espacées, grandes zones sans lumière. Gouttes, écho long, ventilation lointaine. Plafond 2,8 m avec
  gaines.
- **Génération.** Infini, trame régulière de travées et de piliers, rampes condamnées, murets, voitures
  bâchées (formes sous bâche, jamais de voiture visible), locaux techniques. Profondeur d'eau variable par zone.
- **Règles.** L'eau ralentit (−25 %) et multiplie le bruit par 1,8. Marcher accroupi dans l'eau est lent mais
  presque silencieux.
- **Dangers.** L'Écouteuse (1, puis 2 après le premier fusible). Aveugle : la lampe ne risque rien, la voix si.
- **Sortie.** Le **monte-charge** est visible dès l'arrivée, hors tension. Il faut **3 fusibles**, rangés dans
  trois locaux électriques situés à 80–120 m dans trois directions différentes (indiquées par un plan mural à
  côté du monte-charge). Un joueur ne porte qu'un fusible à la fois. Le monte-charge met 45 s à descendre en
  hurlant : il faut tenir à proximité sans bruit.
- **Solo / coop.** Coop : un fusible par joueur, donc séparation naturelle. Solo : trois allers-retours.
- **Lore.** Le premier talkie-walkie, dans la cabine du gardien.

### Niveau 2 — Les Bassins (`l2_pools`)

- **Ambiance.** Carrelage blanc du sol au plafond, eau turquoise éclairée par en dessous, lumière douce sans
  source visible, aucun bourdonnement. Seulement le clapotis et une réverbération immense. Le niveau le plus
  beau et le plus calme : la santé mentale y remonte lentement tant qu'aucun Baigneur n'a bougé.
- **Génération.** Infini. Salles voûtées, bassins peu profonds (40 cm) et profonds (1,4 m), passerelles,
  colonnes carrelées, toboggans murés, couloirs à demi immergés.
- **Règles.** Dans l'eau profonde on avance à 50 % de la vitesse. L'eau porte le son très loin.
- **Dangers.** Les Baigneurs : silhouettes de carrelage immobiles dans l'eau. Ils ne bougent que lorsque
  personne ne les regarde.
- **Sortie.** Vider le **grand bassin** : deux **vannes** dans deux salles opposées doivent être maintenues
  en même temps pendant 6 s. Le bassin se vide en 30 s et révèle une bonde ouverte. Pendant la vidange,
  toutes les lumières baissent, donc les Baigneurs avancent.
- **Solo / coop.** Coop : deux joueurs aux vannes, les autres surveillent les Baigneurs. Solo : la première
  vanne reste ouverte 40 s, il faut courir jusqu'à la seconde.
- **Lore.** Une note explique que l'équipe 7 a compté les Baigneurs : le nombre change entre deux comptages.

### Niveau 3 — Open Space (`l3_offices`)

- **Ambiance.** Plateau de bureaux des années 90, cloisons de box à mi-hauteur, moquette grise, faux
  plafond. **Noir total** : seuls les blocs de secours verts et quelques écrans cathodiques allumés sur de la
  neige éclairent. Des téléphones sonnent, une imprimante se met en route.
- **Génération.** Infini. Plateaux de box, salles de réunion vitrées, couloirs, locaux photocopie, cuisines.
- **Règles.** Sans lumière, la santé mentale chute vite. La lampe est vitale et les piles sont dans les tiroirs.
  Accroupi derrière une cloison, on est invisible.
- **Dangers.** L'Éteint : n'existe que dans le noir, éteint les lumières à son approche, recule devant le
  faisceau de la lampe mais use la pile deux fois plus vite quand on l'éclaire.
- **Sortie.** Trouver le **badge** dans le bureau de la direction (zone construite), remettre un **fusible**
  au **tableau électrique** pour alimenter le lecteur de badge de la cage d'escalier. Remettre le courant
  rallume une partie du plateau : des zones sûres, mais la sonnerie de tous les téléphones couvre vos pas
  comme ceux de l'Éteint.
- **Solo / coop.** Coop : le tableau doit être tenu enclenché par un joueur pendant qu'un autre badge (les
  deux lieux sont à 60 m). Solo : une minuterie de 50 s.
- **Lore.** Les postes de travail du BCI lui-même : l'Intérieur a commencé à copier l'agence.

### Niveau 4 — L'Entrepôt (`l4_warehouse`)

- **Ambiance.** Entrepôt logistique, rayonnages de 8 m qui se perdent dans le noir du plafond, sol béton
  peint, lampes au sodium en hauteur, bips de recul lointains, annonces au haut-parleur incompréhensibles.
- **Génération.** Infini. Allées numérotées par couleur, cellules, zones de palettes, cages grillagées,
  bureaux de quai vitrés.
- **Règles.** Les allées sont longues : la voix ne porte pas, le talkie devient nécessaire.
- **Dangers.** L'Écho : il répète des fragments de ce que les joueurs ont dit, depuis une autre allée, pour
  les attirer dans une cellule sans issue. En solo, il rejoue votre propre voix (ou une voix synthétique si
  le micro est coupé). Une Écouteuse patrouille aussi.
- **Sortie.** La porte sectionnelle du **quai** demande un **code à 4 chiffres**. Chaque chiffre est peint
  au sol au bout d'une allée de couleur ; l'**ordre des couleurs** n'est affiché que dans la cabine vitrée du
  chef de quai, d'où l'on ne voit pas les allées.
- **Solo / coop.** Coop : un joueur en cabine dicte l'ordre, les autres lisent les chiffres — et l'Écho
  répète de faux chiffres avec leurs voix. Solo : tout noter sur le carnet.
- **Lore.** Les palettes contiennent des meubles des niveaux précédents, encore emballés : le stock de
  l'Intérieur.

### Niveau 5 — Hôtel Terminus (`l5_hotel`)

- **Ambiance.** Hôtel années 70, moquette bordeaux à motifs, appliques murales chaudes, portes numérotées,
  musique d'ascenseur étouffée venant de nulle part.
- **Génération.** Une **réception** construite à la main, d'où partent 4 ailes. Chaque aile est un couloir
  qui se répète : avancer assez loin ramène au même tronçon (mêmes numéros de chambre), sauf un détail qui
  change à chaque boucle. Certaines chambres sont ouvertes.
- **Règles.** Les chambres ouvertes et les armoires sont des cachettes. Fermer une porte bloque la vue.
- **Dangers.** Le Veilleur : il fait sa ronde avec sa lanterne, ne perçoit que par la vue, mais sa vue porte
  loin dans les couloirs droits. Il faut se cacher à temps et retenir son souffle (ne pas parler).
- **Sortie.** L'ascenseur demande une **clé** enfermée dans le coffre de la réception. Le **standard
  téléphonique** de la réception allume un voyant pour la chambre qui « appelle » ; il faut décrocher dans
  cette chambre avant 60 s pour entendre un chiffre. Trois appels donnent les trois chiffres du coffre. Les
  sonneries attirent le Veilleur.
- **Solo / coop.** Coop : un joueur au standard annonce la chambre, les autres courent. Solo : 120 s.
- **Lore.** Le registre de l'hôtel porte les noms de l'équipe 7 — et, en dernière ligne, ceux des joueurs.

### Niveau 6 — Dehors (`l6_outside`)

- **Ambiance.** Un lotissement pavillonnaire de nuit : façades identiques, gazon synthétique, lampadaires.
  En regardant mieux, le ciel est un plafond peint dont on distingue les dalles, les étoiles sont des trous,
  le vent sort de haut-parleurs. Pas de bourdonnement : des grillons enregistrés qui bouclent mal.
- **Génération.** Infini. Rues en damier irrégulier, maisons-façades (certaines ont un intérieur d'une
  pièce), jardins clôturés, abribus. Une **maison-témoin** construite à la main contient la maquette.
- **Règles.** **Couvre-feu** : toutes les 4 minutes une sirène retentit, 20 s plus tard tous les
  lampadaires s'éteignent pendant 30 s. Il faut être à l'intérieur d'une maison (éclairée par une télévision).
- **Dangers.** L'Éteint pendant le couvre-feu. Les « Voisins » (des Baigneurs en matériaux de pavillon)
  debout derrière les fenêtres et dans les jardins.
- **Sortie.** Dans la maison-témoin, une **maquette** du lotissement montre par de petites lumières les
  **3 maisons « réelles »**. Dans chacune, un interrupteur. Les trois enclenchés, un projecteur s'allume :
  le ciel se révèle être un plafond et une porte de maintenance apparaît dans l'horizon peint.
- **Solo / coop.** Coop : un joueur lit la maquette et guide au talkie. Solo : dessiner le plan sur le carnet.
- **Lore.** Les boîtes aux lettres portent les noms des agents du BCI.

### Niveau 7 — Le Seuil (`l7_threshold`)

- **Ambiance.** Les archives du BCI telles que l'Intérieur s'en souvient : rayonnages de dossiers, mais les
  matériaux des 7 niveaux précédents se mélangent (carrelage qui devient moquette, néon dans l'eau). Le
  bourdonnement du niveau 0 revient, plus grave.
- **Structure.** Entièrement construit à la main. Un hall central et 4 ailes thématiques.
- **Règles.** Le Brouillon est présent dès l'entrée. Il marche lentement, en ligne droite, à travers les
  murs, vers le joueur le plus proche. On ne peut ni le semer ni l'arrêter : seulement s'en éloigner.
- **Sortie.** Activer **4 dispositifs**, un par aile, chacun rappelant un geste appris : poser un fusible,
  tenir une vanne, décrocher un téléphone, taper un code. Puis la **fuite** : un long couloir dont les néons
  s'éteignent derrière vous, le Brouillon accélérant, jusqu'à la porte finale.
- **Solo / coop.** Coop : les 4 ailes en parallèle, le Brouillon changeant de cible. Solo : enchaîner.
- **Fin.** La porte s'ouvre sur du blanc. Carton : « Bande n° 12 — fin de l'enregistrement », temps total,
  notes trouvées. Si toutes les notes ont été lues, une dernière ligne : la bande a été retrouvée dans un
  bâtiment où l'équipe 12 n'est jamais entrée.

---

## 6. Les entités

Principe de design : chaque entité est un **Brouillon**, une tentative de l'Intérieur de fabriquer une
personne avec les matériaux du niveau. Chacune a **un seul sens dominant** et donc **un contre-jeu clair**.
Toutes sont modélisées par code (primitives + shaders), jamais montrées en pleine lumière longtemps.

| Entité | Id | Matière | Perçoit | Contre-jeu | Dégâts |
|---|---|---|---|---|---|
| Le Rôdeur | `prowler` | papier peint décollé | vue + ouïe | rompre la ligne de vue, se taire | 50 par coup |
| L'Écouteuse | `listener` | béton et fers à béton | ouïe seule | marcher accroupi, se taire, lancer un bruit ailleurs | mortel au contact |
| Les Baigneurs | `bather` | carrelage blanc | — | les regarder | mortel au contact |
| L'Éteint | `unlit` | obscurité, tubes néon morts | — (sait où vous êtes dans le noir) | lumière | 35 par seconde de contact |
| L'Écho | `echo` | carton et ruban adhésif | ouïe | ne pas suivre les voix, vérifier au talkie | 50 par coup |
| Le Veilleur | `watchman` | moquette, laiton, lanterne | vue seule (longue portée) | se cacher, fermer les portes | mortel au contact |
| Le Brouillon | `draft` | géométrie inachevée, parasites vidéo | toujours | s'éloigner | mortel au contact |

### Le Rôdeur (`prowler`)
- **Apparence.** Silhouette de 2,4 m, voûtée sous le plafond, faite de lés de papier peint décollé. Immobile
  contre un mur, il est presque invisible.
- **États.** *Tapi* (immobile contre un mur) → *Ronde* (marche lente entre points) → *Enquête* (va vers le
  dernier bruit entendu) → *Traque* (court vers le joueur vu : 4,3 m/s, plus rapide que la marche, plus lent
  que la course) → *Recherche* (fouille 20 s autour de la dernière position connue) → *Ronde*.
- **Perception.** Vue : cône de 110°, 22 m, divisé par deux dans le noir, nul si le joueur est caché. Ouïe :
  rayon sonore du joueur.
- **Sons.** Froissement de papier quand il marche, déchirure quand il repère quelqu'un.
- **Montée en puissance.** Premières minutes : n'apparaît qu'en silhouette au bout d'un couloir et se retire.

### L'Écouteuse (`listener`)
- **Apparence.** Masse de béton humide sur de longues pattes en fers à béton, deux pavillons d'oreille en
  coffrage à la place du visage.
- **États.** *Dérive* (lente, erratique) → *Alerte* (s'immobilise, tourne les pavillons vers un bruit) →
  *Ruée* (fonce en ligne droite sur la source du bruit à 6 m/s, traverse l'eau sans ralentir) → *Écoute*
  (immobile 8 s sur place, le moindre bruit relance la ruée).
- **Perception.** Uniquement les bruits : pas, eau, voix au micro, objets, portes.
- **Contre-jeu.** Lâcher un objet ou déclencher une alarme de voiture ailleurs la détourne.
- **Sons.** Cliquetis métalliques, souffle d'air dans les pavillons.

### Les Baigneurs (`bather`)
- **Apparence.** Mannequins lisses couverts de petits carreaux blancs, joints noircis, pas de visage.
- **Règle.** Ne bougent que si **aucun joueur** ne les a dans son champ de vision (cône de la caméra, ligne
  de vue dégagée, et éclairage suffisant : dans le noir, on ne les « regarde » pas). Vitesse 3,5 m/s.
- **Détail cruel.** Cligner n'existe pas, mais la lampe qui s'éteint, un pilier ou un coéquipier qui passe
  devant suffisent.
- **Sons.** Aucun en mouvement. Un grincement de céramique à l'arrêt, juste derrière vous.

### L'Éteint (`unlit`)
- **Apparence.** Une absence : silhouette plus noire que le noir, deux tubes néon morts à la place des yeux
  qui s'allument faiblement quand il est tout près.
- **Règle.** N'existe que là où l'éclairement est faible. Il éteint les luminaires dans un rayon de 6 m
  autour de lui. En pleine lumière ou dans un faisceau de lampe, il se fige puis se dissout et réapparaît
  ailleurs dans le noir, à 15–25 m.
- **Perception.** Connaît la position de tout joueur situé dans le noir depuis plus de 4 s.
- **Sons.** Le silence : tous les sons d'ambiance s'atténuent quand il approche.

### L'Écho (`echo`)
- **Apparence.** Silhouette maigre en carton d'emballage et ruban adhésif brun, tête en haut-parleur de
  mégaphone. Fuit le regard.
- **Règle.** Se place hors de vue, à 12–20 m, de préférence dans un cul-de-sac, et rejoue un extrait de
  voix d'un joueur (« par ici », un rire, un chiffre). Attaque le joueur qui arrive seul au contact, puis fuit.
- **Perception.** Ouïe. Il enregistre ce qu'il entend.
- **Contre-jeu.** Les vrais coéquipiers ont un indicateur de voix sur le talkie ; l'Écho n'en a pas.

### Le Veilleur (`watchman`)
- **Apparence.** Uniforme de groom taillé dans la moquette de l'hôtel, boutons de laiton, une lanterne à la
  place de la tête. Sa lumière le précède dans les couloirs.
- **États.** *Ronde* sur un circuit fixe → *Soupçon* (s'arrête, balaie) → *Poursuite* (5,2 m/s) → *Fouille*
  (ouvre les portes et les armoires proches du dernier point de vue : une cachette vue en entrant ne
  protège pas).
- **Perception.** Vue seule, 35 m dans l'axe de sa lanterne, 60°. Ne voit pas à travers les portes fermées.
- **Sons.** Tintement de clés, pas réguliers sur la moquette : on l'entend venir.

### Le Brouillon (`draft`)
- **Apparence.** Forme humaine inachevée : faces manquantes, textures des autres niveaux, parasites VHS.
- **Règle.** Avance à 1,6 m/s en ligne droite vers le joueur vivant le plus proche, à travers tout. Pendant
  la fuite finale : 4,6 m/s. Sa proximité dégrade l'image du caméscope.

### Le Suiveur (hallucination, pas une entité réelle)
Quand la santé mentale est basse, chaque joueur voit pour lui seul une silhouette au bout des couloirs,
qui disparaît quand on approche. Elle ne fait aucun dégât mais fait douter des vraies entités.

---

## 7. Énigmes coopératives

Principes : (1) l'information et l'action sont à deux endroits différents ; (2) la voix de proximité ne
suffit pas, le talkie ou un aller-retour devient nécessaire ; (3) toujours faisable en solo, en plus long ou
avec une minuterie ; (4) la résolution fait du bruit ou de l'obscurité, donc attire le danger.

| Niveau | Énigme | Séparation | Communication |
|---|---|---|---|
| 1 | 3 fusibles dans 3 directions | un fusible par porteur | annoncer ce qu'on a trouvé |
| 2 | 2 vannes simultanées | deux salles opposées | compte à rebours commun |
| 3 | tableau tenu + badge | 60 m entre les deux | « c'est bon, badge ! » |
| 4 | code réparti par couleur | cabine sans vue / allées | dicter ordre et chiffres, démasquer l'Écho |
| 5 | standard téléphonique | réception / chambres | annoncer la chambre, rapporter le chiffre |
| 6 | maquette et maisons réelles | maison-témoin / rues | guider à distance |
| 7 | 4 dispositifs en parallèle | 4 ailes | prévenir de la position du Brouillon |

---

## 8. Santé mentale

Jauge 0–100, propre à chaque joueur, invisible : on la lit à ses effets.

**Baisse** : obscurité (−1,2/s dans le noir complet), isolement en coop (plus de 25 m de tout coéquipier :
−0,25/s), entité visible (−2/s), traque (−3/s), règles de niveau. **Hausse** : lumière et calme (+0,3/s),
coéquipier proche (+0,2/s), eau d'amande (+25), niveau 2 au calme.

| Palier | Effets (cumulatifs) |
|---|---|
| < 75 | Sons trompeurs : pas derrière soi, porte au loin, souffle. Le grain VHS augmente. |
| < 50 | Distorsion : aberration chromatique forte, léger gondolement de l'image, néons qui semblent vaciller alors qu'ils sont stables. Le Suiveur apparaît. Chuchotements. |
| < 25 | Mensonges : faux blocs SORTIE, sous-titres erronés (« [quelqu'un respire derrière vous] »), fausse voix de coéquipier, battements de cœur. L'horodatage du caméscope déraille. |
| 0 | La santé baisse de 2/s et les entités sont attirées vers le joueur. |

---

## 9. Lore

Raconté uniquement par l'environnement, des **notes** (feuilles dactylographiées, carnets) et des
**cassettes** (voix synthétique traitée + sous-titres). Environ 40 fragments, 4 à 6 par niveau.

Fils narratifs :

1. **Le BCI.** Une agence administrative banale qui mesure l'impossible avec des formulaires. Ton de
   circulaire interne.
2. **L'équipe 7.** Quatre arpenteurs dont on suit la descente. Leurs flèches à la craie, puis leurs
   désaccords, puis une seule écriture.
3. **L'Intérieur apprend.** Les niveaux profonds copient des lieux de plus en plus récents et de plus en
   plus proches du BCI lui-même. Les entités sont de plus en plus humaines.
4. **Vous.** Indices discrets que l'équipe 12 a déjà été copiée : noms au registre de l'hôtel, boîtes aux
   lettres, la fin.

Les notes lues sont conservées dans les archives du menu principal (sauvegarde).

---

## 10. Coopération

- **Salon.** Un joueur crée un salon et partage un **code à 5 lettres**. Jusqu'à 4 joueurs. L'hôte choisit le
  niveau (parmi ceux qu'il a débloqués) et la seed. On peut jouer seul sans serveur.
- **Vocal de proximité.** Micro ouvert ou appui pour parler. La voix est spatialisée, s'atténue jusqu'à
  18 m, est étouffée par les murs et réverbérée selon le niveau. Les entités l'entendent.
- **Talkie.** Maintenir V : voix sans limite de distance entre porteurs, filtrée et grésillante.
- **Avatars.** Arpenteurs en combinaison grise avec caméscope à l'épaule (voyant rouge), faisceau de lampe
  visible.
- **Mort.** Caméra de spectateur sur un coéquipier pendant 20 s, puis réapparition au dernier point sûr.
- **Rejoindre en cours.** Possible : le nouveau joueur apparaît près de l'hôte.

---

## 11. Progression et sauvegarde

Sauvegarde locale (navigateur) : niveaux débloqués, meilleur temps par niveau, notes et cassettes trouvées,
paramètres, outils acquis. Terminer un niveau débloque le suivant pour **tous** les joueurs présents.
Rejouer un niveau avec une autre seed donne un autre plan mais la même énigme.

---

## 12. Direction artistique

- **Caméscope VHS.** Grain, aberration chromatique légère, vignettage, lignes de balayage, léger
  bavement des couleurs, décrochages horizontaux rares, bande de bruit en bas d'image. Horodatage en coin :
  `REC ●  14:03:27  17 MAI 1991  BANDE 12`. L'intensité est réglable.
- **Lumière.** Plate et fatiguée. Jamais de soleil. Chaque niveau a une température : jaune malade (0),
  orange sodium (1, 4), blanc bleuté (2), vert secours (3), ambre chaud (5), bleu nuit (6).
- **Brouillard.** On ne voit jamais à plus de 25–35 m. Le fond se perd dans la couleur du niveau, pas dans
  le noir, sauf niveaux sombres.
- **Géométrie.** Simple, orthogonale, répétitive. La peur vient de la répétition et des petites anomalies.
- **Textures.** Toutes dessinées sur canvas ou en shader : taches, salissures et usure obligatoires — rien
  de propre.
- **Interface.** Typographie de caméscope (monospace), blanc cassé, presque rien à l'écran.

## 13. Direction sonore

- **Tout est synthétisé** (Web Audio) : oscillateurs, bruit filtré, enveloppes, convolution avec des
  réponses impulsionnelles générées.
- **Le bourdonnement.** Signature du niveau 0 : 50 Hz et harmoniques, battements lents, il varie avec les
  néons proches et se coupe quand un tube claque.
- **Pas.** Différents par surface (moquette, béton, carrelage, eau) et par allure. Ils servent d'instrument
  de mesure au joueur : on doit s'entendre faire du bruit.
- **Sons lointains.** Coups, grincements, portes, quelque chose qu'on traîne : spatialisés, rares, jamais
  expliqués.
- **Musique.** Pas de mélodie. Des nappes graves qui montent avec le danger et le niveau de santé mentale.
- **Silence.** L'arme principale : couper l'ambiance avant un événement.
- **Sous-titres.** Tous les sons importants ont un sous-titre entre crochets avec une indication de direction.

## 14. Interface et accessibilité

Écran titre minimal (seed, « Entrer »), salon, pause (sensibilité, volumes, intensité VHS, graphismes,
touches), archives du lore. HUD : horodatage REC, jauge d'endurance qui n'apparaît qu'à l'usage, invite
d'interaction, emplacements d'objets qui s'effacent, sous-titres. Options : intensité VHS jusqu'à zéro,
balancement de caméra réglable, sous-titres, réaffectation des touches, AZERTY/QWERTY automatique.

---

## 15. Journal des décisions d'ambiguïté

Chaque fois qu'un choix était ouvert, on a retenu l'option la plus immersive et la plus inquiétante.

| # | Question | Décision | Pourquoi |
|---|---|---|---|
| 1 | Minimap ou marqueurs d'objectif ? | Aucun. Flèches à la craie de l'équipe 7 et carnet à dessiner. | Se perdre est le cœur du jeu. |
| 2 | Le micro du joueur compte-t-il comme du bruit ? | Oui. | Chuchoter pour de vrai devant son écran est l'effet le plus fort du genre. |
| 3 | Barres de santé et de santé mentale ? | Aucune : effets visuels et sonores seulement. | On doute de son propre état. |
| 4 | Peut-on se défendre ? | Non. | La fuite et la cachette font plus peur que le combat. |
| 5 | Jeu en solo : serveur requis ? | Non, la simulation tourne dans l'onglet. | Jouer tout de suite, sans installation. |
| 6 | L'entité du niveau 0 dès l'arrivée ? | Non, après 3 minutes, d'abord en silhouette. | Le calme inquiète plus que l'attaque. |
| 7 | Les entités sont-elles des monstres ? | Des brouillons de personnes faits des matériaux du niveau. | Cohérence et étrangeté. |
| 8 | Voix des enregistrements sans asset audio ? | Synthèse par formants, traitée « bande magnétique », sous-titrée. | Reste 100 % généré et dérangeant. |
| 9 | Ctrl pour s'accroupir (Ctrl+W ferme l'onglet) ? | Ctrl **et** C, plus une confirmation avant fermeture en jeu. | Éviter de perdre une partie. |
| 10 | Que voit-on d'un niveau en arrivant ? | La sortie verrouillée, quand c'est possible (niveau 1). | Savoir où aller sans pouvoir y aller. |
