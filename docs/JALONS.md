# LIMINAL — Jalons et plan de production

Chaque jalon livre un **jeu jouable**. Un jalon se déroule en vagues : les agents d'une même vague
travaillent en parallèle dans des zones disjointes (worktrees git isolés) ; entre deux vagues le directeur
intègre, fait passer la QA, corrige, met à jour `PROGRESS.md` et pousse.

Définition commune de « terminé » pour un jalon : `npm run check` et `npm run e2e` verts, le jeu se lance
avec `npm run dev`, les points « à tester » de `PROGRESS.md` sont vérifiés par la QA (captures à l'appui).

## Jalon 1 — Seul dans les Couloirs

Un joueur seul dans le niveau 0 infini, avec l'ambiance complète (lumière, son, VHS).

| Vague | Agent | Mission |
|---|---|---|
| 1A | Monde | `World` complet (chunks, collisions, rayons, lumière), outils de génération et préfabs, niveau 0 |
| 1A | Rendu | Renderer, champ de lumière, matériaux et textures du niveau 0, lampe torche, post-traitement VHS, cadre des thèmes |
| 1A | Audio | Moteur audio, bourdonnement lié aux néons, pas, sons lointains, réverbération |
| 1A | Interface | Écran titre (seed, « Entrer »), pause (sensibilité, volume, VHS), HUD REC, compteur FPS, textes |
| 1B | Moteur | Déplacement partagé, `GameSim` et `GameHost` minimaux, session locale, entrées, prédiction, caméra, racine de composition |
| 1B | Monde (client) | `WorldView` : streaming et maillage des chunks, instancing des props et luminaires |
| 1C | QA | Tests navigateur du parcours complet, déterminisme, budgets de rendu, corrections |

**Terminé quand** : écran titre → seed → on marche, court, s'accroupit dans un labyrinthe infini et
déterministe ; néons qui grésillent, zones sombres, bourdonnement qui varie, pas, sons lointains, VHS,
brouillard ; pause avec réglages ; F3.

## Jalon 2 — La première entité

| Vague | Agent | Mission |
|---|---|---|
| 2A | Entités | Navigation (A*), perception, director, **le Rôdeur** |
| 2A | Moteur | Santé, dégâts, mort et réapparition, objets génériques (ramassage, porte, note, sortie), scripts de niveau, sortie du niveau 0 |
| 2A | Rendu | Vues d'entités (Rôdeur), vues d'objets, effets de dégâts et de mort |
| 2A | Audio | Sons d'entité, tension dynamique, battements de cœur, sons d'objets |
| 2A | Interface | Écran de mort, invites d'interaction, sous-titres, lecteur de notes |
| 2B | QA | Tests d'IA et de parcours (être tué, trouver la sortie), corrections |

**Terminé quand** : le Rôdeur rôde, enquête, traque et tue ; on meurt et on recommence ; les flèches à la
craie mènent à une sortie utilisable.

## Jalon 3 — À plusieurs

| Vague | Agent | Mission |
|---|---|---|
| 3A | Réseau | Serveur (salons, codes), `RemoteSession`, interpolation, vocal WebRTC de proximité |
| 3A | Moteur | Règles multijoueur de la simulation (sortie groupée, réapparition, spectateur), réconciliation |
| 3A | Rendu | Avatars des arpenteurs, faisceaux de lampe des autres |
| 3A | Interface | Créer / rejoindre un salon, liste des joueurs, réglages du micro |
| 3B | QA | Deux navigateurs dans le même salon, tests de protocole, corrections |

**Terminé quand** : deux à quatre joueurs se retrouvent avec un code, se voient, s'entendent en proximité,
meurent et réapparaissent, sortent ensemble.

## Jalon 4 — Niveaux 1 à 3, objets, santé mentale

| Vague | Agent | Mission |
|---|---|---|
| 4A | Moteur | Inventaire, lampe et pile, eau d'amande, craie, santé mentale, transitions entre niveaux, API de script complète |
| 4A | Rendu | Eau, modèles d'objets, distorsions de santé mentale |
| 4A | Audio | Hallucinations sonores, talkie, sons d'objets |
| 4A | Interface | Inventaire, carnet-carte à dessiner, digicode, objectif |
| 4B | Niveaux ×3 | Niveau 1 (parking), niveau 2 (bassins), niveau 3 (bureaux) : génération, script, thème, ambiance |
| 4B | Entités | L'Écouteuse, les Baigneurs, l'Éteint (logique, vues, sons) |
| 4C | QA | Parcours complet 0 → 3, corrections |

## Jalon 5 — Niveaux 4 à 7, entités restantes, énigmes coop

| Vague | Agent | Mission |
|---|---|---|
| 5A | Niveaux ×4 | Entrepôt, hôtel, dehors, le Seuil |
| 5A | Entités | L'Écho (imitation de voix), le Veilleur, le Brouillon |
| 5A | Réseau | Talkie longue portée, enregistrement des voix pour l'Écho |
| 5B | QA | Parcours complet 0 → 7 en solo et à deux, corrections |

## Jalon 6 — Lore, menus, sauvegarde, finition

| Vague | Agent | Mission |
|---|---|---|
| 6A | Narratif | Notes et cassettes (≈ 40), placement, voix synthétique |
| 6A | Interface | Menus complets, paramètres graphiques / audio / touches, archives, sauvegarde |
| 6A | Rendu | Préréglages de qualité, optimisation |
| 6A | Audio | Mixage final, nappes dynamiques |
| 6B | QA | Régression complète, performances, relecture finale |
