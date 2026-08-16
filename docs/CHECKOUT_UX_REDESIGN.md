# Checkout — refonte UX/UI (2026-08-16)

Mission : rendre `/checkout?plan=standard` plus soft, moderne, premium et
cohérent avec le site vitrine, **sans** modifier la logique fonctionnelle
(récupération du plan, validation, navigation vers `/payment`, services).

## Avant modification — inspection

**EXISTANT / À CONSERVER** :
- `useSearchParams` + `plans.find((p) => p.code === planCode)` pour résoudre
  le plan depuis `?plan=` — inchangé.
- `TenantForm` / `validateTenant` / `useTenantFormValues`
  (`src/features/organization/tenant-form.tsx`), partagés avec
  `PlatformTenantCreate`/`TenantEdit` — inchangés fonctionnellement.
- `handleContinue` → `navigate('/payment', { state: {...} })` — inchangé,
  même payload.
- Le système i18n (`useLocale()`/`t()`), déjà utilisé partout sur la page.
- Le cas « plan invalide » (`plans.length > 0 && !plan`) → écran dédié.

**PROBLÈME UX identifié** :
- Le formulaire réutilisé (`TenantForm`) rend des `Input`/`Button` shadcn/ui
  (palette `--primary`, `rounded-md`, `h-9`) tandis que le reste de la page
  utilise la palette `landing-*` (`rounded-xl`, `h-11`, accent vert) — rupture
  visuelle nette au milieu de la page, entre la section "Administrateur
  initial" et "Informations de l'organisation".
- Aucune indication de parcours (l'utilisateur ne sait pas où il en est dans
  la souscription).
- Layout mono-colonne, plan récapitulé dans un simple bandeau au-dessus du
  formulaire — pas de hiérarchie "info dominante / résumé compact".
- Header identique à la landing (nav marketing complète + CTA "Get Started")
  pendant une étape qui devrait être un tunnel concentré.
- Aucune zone de réassurance.
- `plan.description` provenait d'une correction précédente (audit i18n same
  session) mais n'était pas encore exploité comme "avantage" dans un résumé.

## Améliorations réalisées

1. **En-tête de page** : eyebrow + titre + sous-titre reformulés (copie plus
   douce), et un indicateur d'étapes purement visuel (Informations →
   Vérification → Paiement, `<ol aria-label=…>`, étape courante marquée
   `aria-current="step"` + texte `sr-only`). N'ajoute aucune route/étape
   réelle — représentation du parcours uniquement.
2. **Layout deux colonnes** (desktop) : formulaire dominant à gauche,
   résumé du plan + réassurance sticky (`lg:sticky lg:top-24`) à droite.
   Sur mobile, l'ordre DOM place le résumé avant le formulaire (résumé →
   formulaire → CTA, conforme à la maquette de la mission) ; `lg:order-*`
   inverse visuellement pour le desktop. Compromis assumé : sur desktop,
   l'ordre de tabulation clavier suit l'ordre DOM (résumé puis formulaire)
   et non l'ordre visuel — trade-off standard (Stripe/Shopify checkout font
   pareil), accepté ici car la mission classe Responsive (§5) au-dessus
   d'Accessibilité (§6) dans ses priorités explicites (règle finale, section
   23).
3. **Résumé du plan** : uniquement des données déjà présentes dans `Plan`
   (`name`, `priceMonthly` via `formatNumber(locale)`, `description[locale]`,
   `maxUsers`) — rien d'inventé. `plan.description` (ajouté lors de l'audit
   i18n précédent) et `maxUsers` servent d'« avantages » avec les clés i18n
   déjà utilisées sur `/pricing` (`pricingMaxUsers`/`pricingUnlimitedUsers`).
   Skeleton `animate-pulse` pendant le chargement du plan (latence mock de
   300 ms) pour éviter un flash de colonne vide.
4. **Formulaire** : `TenantForm` reçoit une nouvelle prop optionnelle
   `tone?: 'admin' | 'checkout'` (défaut `'admin'`, rétrocompatible à 100 %
   — Platform Administration ne passe jamais cette prop et reçoit exactement
   le même rendu qu'avant). En tone `'checkout'` : inputs plus hauts et plus
   doux (`h-11 rounded-xl border-slate-200 bg-slate-50`, focus ring accent),
   sections sans `fieldset` encadré (nouveau composant privé `SoftSection`,
   titre `h3` + `aria-labelledby` au lieu de `fieldset`/`legend` — groupement
   sémantique équivalent), CTA final agrandi et coloré accent avec icône
   flèche. Aucun champ ajouté/retiré/réordonné (seul l'ordre visuel des
   champs Contact a été laissé strictement identique à l'original).
5. **CTA** : bouton "Continuer vers le paiement →" agrandi
   (`h-12`, pleine largeur sur mobile), couleur accent dominante, état
   `disabled`/hover hérités du composant `Button` partagé. Sur mobile,
   `flex-col-reverse` place le CTA au-dessus du lien secondaire "Retour aux
   tarifs" pour rester la première action visible.
6. **Réassurance** : nouvelle carte sous le résumé du plan, 3 lignes
   honnêtes (aucune fausse promesse de "paiement sécurisé par X" — le
   provider réel est BACKEND PENDING) : "Vos informations sont protégées",
   "Vous pourrez gérer votre abonnement depuis TANZEN", "Prochaine étape : le
   paiement".
7. **Header minimal en tunnel** : `Navbar` masque désormais la navigation
   marketing et les CTA "Se connecter"/"Commencer" quand `pathname` commence
   par `/checkout` (logo + sélecteur de langue uniquement). Le Footer reste
   inchangé (renforce "je suis toujours sur TANZEN").
8. **Dark mode** : non ajouté. Vérifié que le site vitrine (`landing-*`,
   couleurs hex fixes dans `tailwind.config.js`) ne supporte pas le dark
   mode aujourd'hui — uniquement l'app Enterprise (tokens `hsl(var(--x))`) le
   supporte. Ajouter un dark mode isolé au Checkout aurait violé "ne pas
   introduire une palette indépendante" (mission §14).

## Fichiers modifiés

- `src/features/public/checkout-page.tsx` — refonte complète du layout.
- `src/features/public/components/navbar.tsx` — header minimal conditionnel
  sur `/checkout`.
- `src/features/organization/tenant-form.tsx` — prop `tone` additive,
  rétrocompatible.
- `src/mocks/platform/plans.ts` — (fait lors de l'audit i18n précédent la
  même session) `description` bilingue `{ fr, en }`, réutilisé ici comme
  "avantage" dans le résumé.
- `src/locales/{fr,en}/index.ts` — nouvelles clés `checkoutStepInformation`,
  `checkoutStepVerification`, `checkoutStepPayment`, `checkoutStepperLabel`,
  `checkoutStepCurrent`, `checkoutPlanSummarySubtitle`,
  `checkoutReassuranceProtected`, `checkoutReassuranceManage`,
  `checkoutReassuranceNextStep` ; `checkoutTitle`/`checkoutSubtitle`
  reformulés (FR/EN alignés).

## Fichiers créés

- `docs/CHECKOUT_UX_REDESIGN.md` (ce document).

## Responsive

Testé à 375 / 390 / 414 / 768 / 1024 / 1280 / 1440 px (Playwright,
`document.documentElement.scrollWidth > clientWidth`) : **aucun overflow
horizontal** à aucune largeur.

## i18n

`npm run i18n:check` : 0 clé manquante FR/EN. FR et EN testés en direct
(bascule immédiate, sans rechargement, via le sélecteur du header minimal),
y compris le formatage des nombres (`35 000` FR vs `35,000` EN).

## Tests effectués (navigateur réel, Playwright + dev server)

- [x] Plan `standard` correctement récupéré et affiché (nom, prix, avantages)
- [x] Formulaire fonctionnel (saisie, focus, sections)
- [x] Validation fonctionnelle (`This field is required.` / `Ce champ est
      obligatoire.` inline, soumission bloquée si champs requis vides)
- [x] Bouton fonctionnel (soumission réussie → navigue vers `/payment`)
- [x] Navigation existante conservée (`/pricing` via "Retour aux tarifs",
      `/payment` via le CTA, payload `navigate` identique)
- [x] FR fonctionne / EN fonctionne / bascule FR↔EN immédiate
- [x] Mobile 375 / 390 / 414 px, tablette 768/1024, desktop 1280/1440 px
- [x] Aucun overflow horizontal, aucun texte coupé (vérifié par capture
      d'écran à chaque largeur)
- [x] Cas plan invalide (`?plan=doesnotexist`) → écran dédié conservé
- [x] Aucune erreur console à aucune étape

Non re-testé dans ce passage (aucun changement dans ce périmètre) : refresh
mid-formulaire (comportement inchangé, l'état du formulaire n'a jamais été
persistant), dark mode (absent du site vitrine, cf. section ci-dessus).

## Validation technique

```
npm run typecheck   → clean
npm run lint        → 0 erreur, 16 warnings préexistants (react-refresh/only-export-components, sans lien avec cette mission)
npm run test         → 125/125 tests passants (aucune régression Platform Administration)
npm run build        → succès (même warning préexistant sur la taille du chunk principal, sans lien avec cette mission)
```

## Problèmes restants / hors périmètre

- Le bouton menu mobile (`Menu` icon) de la `Navbar` n'a jamais eu de
  logique d'ouverture (pré-existant, hors périmètre de cette mission) — sans
  incidence sur `/checkout` puisque la nav marketing y est masquée.
- Le chunk JS principal dépasse 500 kB après minification (warning Vite
  préexistant, non lié à cette page).
