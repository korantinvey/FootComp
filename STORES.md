# Publication sur les stores : checklist

## Déjà en place dans l'app
- [x] Conditions d'utilisation et politique de confidentialité, dans l'app (Mon compte, paywall, écran d'accueil)
- [x] Pages web correspondantes générées dans `legal-site/` (`npm run legal` dans `mobile/`)
- [x] Suppression du compte depuis l'app (Mon compte → Supprimer mon compte)
- [x] Paywall : prix, durée, renouvellement automatique, résiliation, liens CGU / confidentialité, « Restaurer mes achats »
- [x] Contact support (email) dans l'app
- [x] Identifiants : `com.footcomp.app` (iOS et Android), déclaration de chiffrement iOS
- [x] Aucune publicité, aucun traceur

## À compléter par toi
| Quoi | Où |
|---|---|
| Nom de l'éditeur, statut + SIRET, adresse, email de contact, hébergeur | `mobile/src/legal/legal.json` → `publisher` |
| Prix de l'abonnement | `mobile/src/ui/premium.tsx` → `PRICE_LABEL` |
| Héberger `legal-site/` (GitHub Pages, Netlify…) et reporter les URLs | `mobile/src/legal/index.ts` → `LEGAL_URLS` |
| Lien de téléchargement de l'app (page qui redirige vers le bon store) | `mobile/src/ui/invite.ts` → `DOWNLOAD_URL` |
| Vérifier que `com.footcomp.app` te convient (non modifiable après publication) | `mobile/app.json` |
| Faire relire les textes légaux (idéalement par un juriste) | `mobile/src/legal/legal.json` |

## Comptes à créer
- Apple Developer Program : 99 $/an
- Google Play Console : 25 $ une fois
- Expo (EAS Build) : gratuit

## Encore à développer avant de publier
1. **Backend** : comptes, groupes partagés, vraies invitations (aujourd'hui tout est sur un seul téléphone)
2. **Achats intégrés** avec RevenueCat, à la place de la simulation dans `mobile/src/app/paywall.tsx`
3. **Development build** EAS (les achats intégrés ne marchent pas dans Expo Go)
4. Icône, écran de démarrage, captures d'écran des stores
5. Questionnaires des stores : « App Privacy » (Apple) et « Sécurité des données » (Google), à remplir d'après la politique de confidentialité
