# Rapport d'implémentation — Finalisation Finance & Tontines

Date : 2026-09-12 · Branche : `feature/finance-position-engine` (non poussée, non committée — voir « État git » en fin de rapport).

## Méthode

Audit du code réel avant toute modification (aucune fonctionnalité déjà verte
n'a été réimplémentée), puis implémentation progressive en respectant l'ordre
de dépendance : moteur financier → UI, cycle de vie du prêt, ordre de passage
des tontines, intégration Tontine↔Finance, vérification Distribution, revue
RBAC/multi-tenant, tests, audit final. Validation (`tsc --noEmit`, `eslint`,
`vitest run`, `vite build`) exécutée après chaque étape significative — voir
détail des commandes et résultats en fin de rapport.

## Avant / Après

Décompte portant sur les fonctionnalités Finance + Tontines directement
concernées par ce mandat (20 lignes ; les fonctionnalités déjà 🟢 non listées
ici — comptes, transactions, LoanRule CRUD, adhésions/périodes/occurrences,
etc. — restent 🟢, inchangées et vérifiées non régressées par la suite
complète de tests).

### Avant

```
🟢 6   🟡 5   🟠 3   🔴 6      (total 20)
```

### Après

```
🟢 16   🟡 2   🟠 1   🔴 1      (total 20)
```

| # | Fonctionnalité | Avant | Après |
|---|---|---|---|
| 1 | Comptes financiers (CRUD + solde) | 🟢 | 🟢 (préservé) |
| 2 | Adhésion à un compte | 🟢 | 🟢 (préservé) |
| 3 | Saisie de transaction (journal) | 🟢 | 🟢 (préservé) |
| 4 | Catégorisation des transactions | 🟢 | 🟢 (préservé) |
| 5 | Moteur « solde à l'instant T » → UI | 🟡 | 🟢 |
| 6 | Position financière d'un membre → UI | 🟡 | 🟢 |
| 7 | Écritures d'ouverture/clôture d'exercice → UI | 🟡 | 🟡 (non traité, voir Lacunes) |
| 8 | Report à nouveau → UI | 🟡 | 🟡 (non traité, voir Lacunes) |
| 9 | Demande de prêt (workflow réel) | 🔴 | 🟢 |
| 10 | Règles d'éligibilité (LoanRule appliqué au service) | 🟠 | 🟢 |
| 11 | Décaissement (Loan réel, atomique) | 🟠 | 🟢 |
| 12 | Suivi des remboursements (atomique, anti-dépassement) | 🟡 | 🟢 |
| 13 | Calcul des intérêts | 🔴 | 🟢 |
| 14 | Distributions | 🟠 | 🟠 (préservé, décision documentée) |
| 15 | Tontines — fonctionnalités existantes (création, adhésion, contributions, opérations) | 🟢 | 🟢 (préservé) |
| 16 | Ordre de passage automatique des bénéficiaires | 🔴 | 🟢 |
| 17 | Intégration cotisations → Finance | 🔴 | 🟢 |
| 18 | Intégration réceptions/distributions → Finance | 🔴 | 🟢 |
| 19 | Permutation de bénéficiaires | 🟢 | 🟢 (préservé, non modifié) |
| 20 | Clôture de période (`PeriodStatus.TERMINATED`) | 🔴 | 🔴 (non traité, hors périmètre) |

Méthode de calcul : chaque ligne = une unité, comme dans l'audit initial.
Taux d'implémentation du périmètre traité : 16/20 = 80 % en 🟢 strict (contre
30 % avant ce mandat), 18/20 = 90 % en 🟢+🟡.

---

## Finance

### Fonctionnalités ajoutées
- Décaissement de prêt réel : `creditService.disburseLoan` (chemin
  demande→approbation) et `creditService.createLoanTransaction` (chemin
  direct) — créent un véritable `Loan` (jamais une simple transaction),
  atomiquement avec la `Transaction` et les `Guarantor`.
- Demande de prêt avec approbation préalable : `creditService.submitLoanApplication`
  + `applyLoanApplicationDecision`, branchées sur le moteur de workflow
  générique existant (WD-001), jamais utilisé pour créer une nouvelle demande
  à l'exécution avant ce mandat.
- Calcul des intérêts : `src/lib/finance/loan-terms.ts` (`computeLoanTerms`),
  formules FIXED/FLAT (intérêt simple) et REDUCING (amortissement dégressif
  standard), documentées et testées (9 cas).
- Remboursement atomique et sécurisé : `creditService.createRepaymentTransaction`,
  garde anti-dépassement, transition automatique vers `'repaid'`.
- Page « Position financière » (`/finance/position`) : branche le moteur
  `balanceAsOf`/`memberFinancialPosition` (jusque-là invisible) à une UI réelle.
- Écrans « Demandes de crédit » et « Prêts » (liste/détail/création),
  réintroduits avec le nouveau cycle de vie réel.

### Fonctionnalités finalisées
- `maxActiveLoans` bloque réellement la création d'un prêt (client ET
  service) — avant ce mandat, seul un bandeau d'avertissement existait.
- Les règles de la `LoanRule` (montant, garants, approbation) sont désormais
  vérifiées côté service (`resolveActiveLoanRule` + validations dans
  `submitLoanApplication`/`createLoanTransaction`/`disburseLoan`) — un appel
  direct au service ne peut plus les contourner.

### Fichiers modifiés/ajoutés
- Ajoutés : `src/lib/finance/loan-terms.ts` (+ test), `src/lib/finance/loan-terms.test.ts`,
  `src/services/credit.service.test.ts` (étendu), `src/features/finance/finance-position-page.test.tsx`.
- Modifiés : `src/services/credit.service.ts` (réécrit, +250 lignes),
  `src/services/finance.service.ts` (extraction `insertTransaction`),
  `src/mocks/finance/applications.ts` (+ `memberId`/`accountId`/`pendingGuarantors`),
  `src/mocks/finance/transactions.ts` (+ `loanId`), `src/lib/finance/index.ts`,
  `src/features/finance/finance-module.tsx` (+~350 lignes : écrans Crédit/Prêts,
  page Position, correctif `maxActiveLoans`), `src/features/finance/finance-module-routes.test.tsx`
  (mis à jour pour refléter la réintroduction documentée des écrans Crédit),
  `src/features/finance/transaction-repayment.test.tsx` (spy adapté au nouveau
  chemin atomique), `src/features/operations/operations-module.tsx` (dispatch
  du domaine `credit` + bouton « Décaisser »), `src/locales/{fr,en}/index.ts`.

### Tests ajoutés
- `loan-terms.test.ts` : 9 cas (formules d'intérêt).
- `credit.service.test.ts` : +26 cas (garde-fous remboursement, cycle de vie
  demande→approbation→décaissement, chemin direct atomique, chemin
  remboursement atomique).
- `finance-position-page.test.tsx` : 3 cas (cohérence UI/moteur, position
  membre, point d'entrée depuis Comptes).

### Règles métier (résumé)
Voir `docs/FINANCE_TONTINES_IMPLEMENTATION.md` §2 pour le détail complet
(formules, transitions, permissions).

### Exemple concret
```
Règle (LR-002, T-002, AC-004) : montant 30 000–1 500 000, 1 prêt actif max,
1 garant requis, approbation requise, taux 10 % FLAT/18 mois.

1. Khadija Mbaye (M-007, aucun prêt actif) soumet une demande de 200 000 F
   avec un garant → Application(stageSubmitted) + WorkflowRequest(WD-001) créés.
2. Étape 1 approuvée → Application passe stageReview.
3. Étape 2 (décision finale) approuvée → Application passe stageApproved.
4. Un gestionnaire clique « Décaisser » (Opérations → Workflows) →
   creditService.disburseLoan crée la Transaction (PRET, 200 000 F, débit du
   compte AC-004) PUIS le Loan (interestAmount calculé via FLAT/18 mois/10%,
   totalRepayable, monthlyPayment) PUIS le Guarantor → transaction.loanId lie
   les deux → Application passe stageDisbursed.
5. Une seconde tentative de décaissement de la même demande est refusée.
```

---

## Tontines

### Fonctionnalités ajoutées
- `tontineTurnsService.suggestNextBeneficiary` : algorithme de rotation par
  ordre d'adhésion (documenté, choisi faute de règle sourcée), gère membres
  suspendus, nouveaux adhérents, occurrences déjà servies, fin de cycle.
- `tontineTurnsService.listRotationOrder` : vue d'ensemble de l'ordre de
  passage d'une période.
- Intégration Tontine ↔ Finance : `Tontine.accountId` (nouveau champ optionnel)
  + `postTontineTransaction` — une cotisation MONEY crée une Transaction
  EPARGNE, une réception MONEY crée une Transaction AUTRES/DISTRIBUTION,
  uniquement pour les tontines explicitement rattachées à une caisse.

### Fonctionnalités finalisées
- Le dialogue « Ajouter un bénéficiaire » pré-remplit désormais le sélecteur
  avec la suggestion de rotation (jamais imposée).
- Le formulaire de création de tontine permet de rattacher une caisse Finance
  (`accountId`), validée tenant-scopée.

### Fichiers modifiés/ajoutés
- Ajoutés : `src/services/tontine-rotation.test.ts` (11 cas),
  `src/services/tontine-finance-integration.test.ts` (5 cas).
- Modifiés : `src/services/tontine-turns.service.ts` (+~150 lignes :
  `suggestNextBeneficiary`, `listRotationOrder`, `postTontineTransaction`,
  `resolveTontineAccount`, intégration dans `recordContributionPayment`/
  `recordReception`), `src/services/tontines.service.ts` (`accountId` +
  validation de rattachement), `src/mocks/tontines/tontines.ts` (+ `accountId`),
  `src/features/tontines/tontines-module.tsx` (sélecteur de caisse liée),
  `src/features/tontines/tontine-operations-module.tsx` (suggestion de
  bénéficiaire), `src/locales/{fr,en}/index.ts`.

### Règles métier (résumé)
Voir `docs/FINANCE_TONTINES_IMPLEMENTATION.md` §3/§4.

### Exemple concret
```
Tontine « Épargne collective » (MONEY, rattachée à la caisse CS-001-ÉPG,
AC-002, T-001), Période 2026, 4 adhérents (A, B, C, D, par ordre d'adhésion).

1. Occurrence #1 : suggestNextBeneficiary propose A (le plus ancien).
   Un gestionnaire coche « payé » pour chaque adhérent → 4 cotisations créées,
   4 Transactions EPARGNE créées, le solde de CS-001-ÉPG augmente de 4×montant.
2. A est désigné bénéficiaire (suggestion suivie), reçoit 150 000 F →
   1 Transaction AUTRES/DISTRIBUTION créée, le solde de CS-001-ÉPG diminue de
   150 000 F.
3. Occurrence #2 : suggestNextBeneficiary propose B (A déjà servi cette
   période) — jamais A à nouveau tant que C et D n'ont pas été servis.
4. Après B, C, D servis : suggestNextBeneficiary renvoie cycleComplete: true.
   Un nouveau cycle nécessite une nouvelle Période (mécanisme déjà existant).
```

---

## Intégration Finance ↔ Tontines

Flux mis en place, dans les deux sens attendus par le mandat :

```
Cotisation Tontine  → recordContributionPayment → postTontineTransaction → insertTransaction → Compte (EPARGNE, crédit)
Réception Tontine   → recordReception            → postTontineTransaction → insertTransaction → Compte (AUTRES/DISTRIBUTION, débit)
```

Le module Tontines **alimente** désormais le moteur financier au lieu de
maintenir un calcul strictement parallèle — objectif majeur du mandat atteint,
de façon rétrocompatible (une tontine non rattachée à une caisse continue de
fonctionner exactement comme avant ce mandat) et testée (5 tests dédiés
couvrant le cas nominal, la rétrocompatibilité, et le cas GOODS).

---

## Tests exécutés et résultats

```
npx tsc --noEmit -p tsconfig.app.json   → 0 erreur
npx eslint src                          → 0 erreur (18 warnings pré-existants, react-refresh, sans rapport)
npx vitest run                          → 68 fichiers, 1080 tests, 100% passants
npm run build (tsc -b && vite build)    → succès
```

Décompte des tests ajoutés par ce mandat : 9 (loan-terms) + 26 (credit.service)
+ 3 (finance-position-page) + 11 (tontine-rotation) + 5 (tontine-finance-integration)
= **54 nouveaux tests**, tous passants, en plus des tests existants adaptés
(2 tests modifiés dans `transaction-repayment.test.tsx` pour refléter le
nouveau chemin atomique documenté, 5 tests modifiés + 5 ajoutés dans
`finance-module-routes.test.tsx` pour refléter la réintroduction documentée
des écrans Crédit).

Aucune fonctionnalité verte n'est devenue jaune ou rouge : la suite complète
(1080 tests) inclut l'intégralité des tests pré-existants, tous toujours
passants.

Une flakiness a été observée une fois sur `transaction-create.test.tsx`
lors d'une exécution combinée à d'autres fichiers, puis absente en isolation
et lors d'une seconde exécution combinée — comportement connu et déjà
documenté avant ce mandat (mémoire projet : sur-souscription des workers de
test sous charge complète, sans rapport avec un état partagé réel). Non lié à
ce mandat, non traité ici (piste déjà explorée et abandonnée précédemment).

---

## Fonctionnalités passées au vert

Demande de prêt (workflow réel), règles d'éligibilité appliquées au service,
décaissement réel et atomique, calcul des intérêts, suivi des remboursements
sécurisé, moteur de solde/position branché à l'UI, ordre de passage des
bénéficiaires de tontine, intégration cotisations→Finance, intégration
réceptions→Finance. Détail ligne par ligne dans le tableau Avant/Après.

## Fonctionnalités restant non vertes (documentées, raisons précises)

- **Écritures d'ouverture/clôture d'exercice → UI** (🟡) : moteur complet et
  testé (`src/lib/finance/closing.ts`, `carry-forward.ts`,
  `finance-position.service.ts`), mais aucun bouton déclencheur n'a été
  ajouté dans ce mandat — priorité donnée au cycle de vie du prêt et à
  l'intégration Tontine↔Finance, explicitement désignée « objectif majeur ».
  Raison technique : nécessiterait de déterminer où logiquement l'exposer
  (écran Exercices fiscaux de Paramètres, hors du périmètre Finance/Tontines
  déjà très large de ce mandat) — décision produit à valider avant
  implémentation plutôt qu'un ajout précipité.
- **Clôture de période de tontine (`PeriodStatus.TERMINATED`)** (🔴) :
  identifiée dans l'audit initial mais non demandée explicitement dans les
  phases de ce mandat (rotation / intégration Finance / préservation de la
  permutation / vérification Distribution) — non traitée pour rester dans le
  périmètre donné.
- **Distributions** (🟠, statu quo assumé) : décision documentée de ne pas
  réintégrer ce modèle orphelin dans le nouveau flux de réception de tontine,
  pour rester cohérent avec le mandat antérieur « Transactions = journal
  central ». Voir `docs/FINANCE_TONTINES_IMPLEMENTATION.md` §5.
- **RBAC au niveau service** (limite systémique, pré-existante) : aucun
  service — ancien ou nouveau — ne vérifie de permission en son sein ; le
  contrôle d'accès reste appliqué uniquement au niveau des composants React.
  Corriger ce point toucherait l'ensemble des services du projet, bien
  au-delà du périmètre Finance/Tontines.

## Risques et décisions métier nécessitant attention

1. **Deux moteurs de calcul de solde coexistent** (`resolveAccount`, utilisé
   par l'UI, et `balanceAsOf`, maintenant exposé via la page Position) — ils
   s'accordent mathématiquement (testé), mais leur coexistence reste une dette
   technique à résorber lors d'une future consolidation.
2. **`interestPart` reste toujours 0** dans le remboursement décidé
   automatiquement depuis le formulaire de transaction (`finance-module.tsx`) —
   c'est un choix pré-existant à ce mandat (aucune saisie séparée
   principal/intérêt n'existe dans ce formulaire) ; le calcul d'intérêt réel
   n'intervient qu'à la création du prêt (`totalRepayable`), pas à chaque
   remboursement individuel. Une évolution future pourrait vouloir ventiler
   chaque remboursement entre principal et intérêt selon un tableau
   d'amortissement — non demandé par ce mandat, non inventé ici.
3. **Distribution vs Transaction(AUTRES/DISTRIBUTION)** : deux notions de
   « distribution » coexistent désormais dans le code (l'entité orpheline et
   la sous-catégorie de transaction, cette dernière maintenant réellement
   alimentée par les réceptions de tontine) — nommage à clarifier auprès des
   utilisateurs métier si source de confusion.
4. **`docs/FINANCE_TONTINES_IMPLEMENTATION.md`** documente en détail les
   formules et décisions d'architecture — à faire valider par un profil
   métier (taux d'intérêt, définition exacte de « prêt actif ») avant mise en
   production réelle.

## État git

Toutes les modifications de ce mandat sont dans l'arbre de travail de la
branche `feature/finance-position-engine`, **non commitées** (conformément à
la consigne de ne committer que sur demande explicite). `git status`/`git diff`
permettent de revoir l'intégralité du delta avant tout commit.
