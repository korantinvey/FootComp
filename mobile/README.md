# FootComp

Gestion des matchs de foot entre potes ou en club : groupes, inscriptions, capitaines, compos, score en direct, votes MVP et stats.

## Lancer

```bash
npm install
npx expo start
```

Scanne le QR code avec l'app **Expo Go** (iOS / Android).

## Organisation

- `src/domain/` : règles métier pures (permissions, score, validation des votes, stats)
- `src/data/store.ts` : stockage local (AsyncStorage). C'est la seule couche à remplacer pour brancher un backend.
- `src/ui/` : thème et composants
- `src/app/` : écrans (Expo Router)

## Mode local

Toutes les données sont sur le téléphone. « Changer de joueur » (pastille en haut de l'accueil) permet d'agir comme admin, capitaine ou votant.
