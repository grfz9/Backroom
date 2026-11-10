# LIMINAL

Jeu d'horreur coopératif (1 à 4 joueurs) dans le navigateur, inspiré du mythe des espaces liminaux.
Three.js + TypeScript côté client, Node.js + WebSocket côté serveur, voix de proximité en WebRTC.
Tout est généré par code : monde, textures, sons, créatures. Aucun asset externe.

## Lancer

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173.

## Vérifier

```bash
npm run check
```

```bash
npm run e2e
```

`npm run check` lance la vérification des types et les tests unitaires ; `npm run e2e` lance les tests
navigateur (Playwright ; hors de l'environnement de développement d'origine, installer le navigateur une
fois avec `npx playwright install chromium`).

## Documentation

| Document | Contenu |
|---|---|
| [`docs/GDD.md`](docs/GDD.md) | Game design : niveaux, entités, objets, lore, direction artistique et sonore |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modules, contrats, protocole réseau, formats de données |
| [`docs/JALONS.md`](docs/JALONS.md) | Jalons et plan de production |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Avancement, comment tester chaque jalon, problèmes connus |
| [`docs/AGENTS.md`](docs/AGENTS.md) | Règles de travail des agents de production |

## Structure

```
client/   rendu, audio, interface, entrées (Vite + Three.js)
server/   salons et simulation autoritaire (Node.js + ws)
shared/   simulation déterministe partagée : monde, génération, niveaux, entités, protocole
tools/    tests navigateur et outils de développement
docs/     conception et suivi
```
