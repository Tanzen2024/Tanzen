# Finalisation Finance & Tontines — documentation technique

Date : 2026-09-12 · Branche : `feature/finance-position-engine` · Statut : implémenté, testé (1080 tests, `npm run test`), typecheck/lint/build propres.

Ce document décrit les règles métier, entrées/sorties, erreurs, transitions et
permissions des fonctionnalités ajoutées ou finalisées lors de ce mandat. Il
complète (sans le remplacer) le rapport d'implémentation
(`docs/IMPLEMENTATION_FINANCE_TONTINES_REPORT.md`).

Rappel de contexte : TANZEN n'a pas de backend réel. Toute donnée vit dans des
tableaux TypeScript en mémoire (`src/mocks/**`), exposés par des services
(`src/services/*.service.ts`) qui simulent un appel réseau via `mockRequest()`.
Rien de ce mandat n'a introduit de backend — l'objectif était de finaliser la
logique métier et l'architecture pour qu'elle soit facilement branchable à un
backend réel le moment venu.

---

## 1. Moteur financier → UI (Priorité 1)

### `balanceAsOf` / `memberFinancialPosition`

- **Entrée** : `financePositionService.balanceAsOf(tenantId, scope, asOfDate)` où
  `scope` est `{kind:'ACCOUNT', accountId}` ou `{kind:'TENANT_ALL_ACCOUNTS'}` ;
  `financePositionService.memberFinancialPosition(tenantId, scope, asOfDate)` où
  `scope` est `{kind:'MEMBER_ALL_ACCOUNTS', memberId}` ou `{kind:'MEMBER_ACCOUNT', memberId, accountId}`.
- **Sortie** : `BalanceResult` (`total`, `byAccount[]`, `outOfScope`) ou
  `MemberFinancialPosition` (`savings`, `otherMovements`, `credit.outstanding`,
  `distributions`, `estimatedNetPosition`).
- **Erreurs** : aucune levée — un scope invalide renvoie `outOfScope: true` et
  des totaux à 0, jamais une exception.
- **Impact financier** : lecture seule, aucune mutation.
- **Permissions** : route `/finance/position` gardée par `accounts.read`.
- **UI** : nouvelle page `FinancePosition` (`finance-module.tsx`), accessible
  depuis le bouton « Position financière » de la page Comptes. Deux blocs :
  solde d'une caisse à une date, et position consolidée d'un adhérent.
- **Cohérence garantie** : `balance.test.ts` contient une régression qui
  prouve `balanceAsOf(ACCOUNT).byAccount[0].balance === resolveAccount(...).balance` ;
  `finance-position-page.test.tsx` reproduit cette preuve au niveau UI en
  comparant l'affichage réel au calcul `resolveAccount()`.
- **Non traité dans ce mandat** : le déclenchement UI de `closeFiscalYear`/
  `carryForward` (écritures d'ouverture/de clôture) n'a pas été ajouté — le
  moteur (`src/lib/finance/closing.ts`, `carry-forward.ts`) reste complet et
  testé mais toujours sans bouton déclencheur. Voir « Lacunes restantes » dans
  le rapport d'implémentation.

---

## 2. Cycle de vie du prêt (Priorités 2)

### Décision d'architecture (documentée, cf. mandat §17 « inspecter avant d'inventer »)

Le modèle existant porte déjà deux objets pertinents :
- `Application` (`stage`: `stageSubmitted → stageReview → stageApproved|stageRejected → stageDisbursed`) ;
- `Loan` (`status`: `pending | active | repaid | defaulted`).

Plutôt que d'inventer une machine à états unique sur `Loan`, ce mandat
**réutilise `Application` pour le PRÉ-décaissement** (demande, instruction,
décision) et ne crée le `Loan` réel (principal/intérêts/échéancier) **qu'au
décaissement** — cohérent avec le moteur de position financière déjà existant
(`memberLoanSummary` ne compte un prêt que via `disbursementDate`, jamais un
état « demandé »). `LoanStatus.pending` reste réservé/non utilisé : `Application`
couvre déjà tous les états pré-décaissement.

Le moteur d'approbation générique existant (`workflowService`, `WD-001` déjà
défini avec 2 étapes : `applications.approve` puis `loans.approve`) est
**réutilisé tel quel** — c'est le premier domaine où il crée réellement une
nouvelle demande à l'exécution (`credit`), au même titre que `settings`
(réouverture d'exercice) et `tontines` (permutation de bénéficiaire) déjà
câblés.

### Deux chemins de création, un seul moteur de validation/décaissement

| | Chemin « demande approuvée » | Chemin « enregistrement direct » |
|---|---|---|
| Entrée UI | `/finance/credit/applications/create` | Formulaire de transaction, catégorie PRET |
| Fonction | `creditService.submitLoanApplication` | `creditService.createLoanTransaction` |
| Approbation | Workflow WD-001 (2 étapes), `disburseLoan` décaisse ensuite | Case à cocher « approuvé » (attestation d'une approbation déjà faite hors ligne) |
| Résultat | `Application` + `WorkflowRequest`, puis `Loan`+`Transaction`+`Guarantor` au décaissement | `Application`(`stageDisbursed`) + `Loan` + `Transaction` + `Guarantor` immédiatement |

Les deux chemins appliquent **exactement la même validation** (montant dans
les bornes de la `LoanRule`, `maxActiveLoans`, garants si requis, compte/membre
du tenant) et le même calcul d'intérêts (`computeLoanTerms`).

### Règle `maxActiveLoans`

```
countActiveLoans(tenantId, memberId) = nombre de Loan{tenantId, memberId, status:'active'}
```
Bloque désormais réellement la création (`if (countActiveLoans(...) >= rule.maxActiveLoans) return undefined/false`),
côté service ET côté formulaire (`validateTransactionForm`, avant ce mandat
seul un bandeau d'avertissement existait, jamais de blocage réel).

### Calcul des intérêts (`src/lib/finance/loan-terms.ts`)

- `FIXED`/`FLAT` : intérêt simple sur le capital initial —
  `interestAmount = principal × (taux/100) × périodes`, où « périodes »
  convertit `durationMonths` vers l'unité de `LoanRule.interestPeriod`
  (`MONTHLY` → tel quel, `YEARLY` → /12, `WEEKLY` → ×4.345, `DAILY` → ×30).
- `REDUCING` : amortissement dégressif standard à mensualité constante,
  `mensualité = principal × r / (1 − (1+r)⁻ⁿ)`.
- Tous les montants sont arrondis à l'entier (FCFA, pas de sous-unité ailleurs
  dans le modèle). 9 tests (`loan-terms.test.ts`) couvrent taux nul, FIXED≡FLAT,
  conversion de période, dégressif < forfaitaire au même taux, dates.

### Décaissement — atomicité

`disburseLoan`/`createLoanTransaction` valident **tout** (règle, montant,
garants, approbation) **avant** d'appeler `financeService.createTransaction`
(en interne, `insertTransaction` — voir §4). Si la validation échoue, **rien**
n'est créé (ni `Transaction`, ni `Application`, ni `Loan`, ni `Guarantor`). Si
la transaction réussit, `Loan`+`Guarantor` sont créés et `transaction.loanId`
relie les deux (nouveau champ optionnel sur `Transaction`).

### Remboursement

`createRepaymentTransaction` (nouveau, atomique) et `createRepayment`
(historique, conservé) partagent désormais la même mutation
`applyRepaymentToLoan`, qui :
- refuse un montant négatif ou nul ;
- refuse un remboursement qui dépasserait `totalRepayable` (« interdire les
  incohérences », absent avant ce mandat) ;
- fait passer `Loan.status` à `'repaid'` dès que `outstanding` atteint 0
  (absent avant ce mandat — le statut restait `'active'` indéfiniment).

### Permissions

`applications.create` (soumettre une demande), `applications.approve` +
`loans.approve` (les 2 étapes du workflow, déjà existantes), `loans.create`
(décaisser — c'est l'action qui crée réellement le `Loan`), `loans.read`
(consulter), `repayments.create` (remboursement, déjà existante),
`guarantors.create` (déjà existante). Aucune permission n'a été inventée —
toutes existaient déjà dans `rbac.mocks.ts` avant ce mandat.

---

## 3. Ordre de passage des bénéficiaires (Priorité 3)

### Décision d'architecture (documentée, mandat §17)

Aucune règle de tirage/rotation n'existait. Algorithme retenu, documenté dans
le code (`tontine-turns.service.ts`, `suggestNextBeneficiary`) : **rotation
par ordre d'adhésion** (ROSCA classique) — au sein d'une Période, l'Occurrence
suivante propose l'adhésion active la plus anciennement arrivée
(`joinedAt` croissant, `id` en cas d'égalité) qui n'a pas encore été
bénéficiaire d'une Occurrence de cette Période.

```
suggestNextBeneficiary(tenantId, occurrenceId)
  → { adhesionId, memberName, cycleComplete: false }   // un candidat existe
  → { cycleComplete: true }                             // tous déjà servis
  → null                                                 // occurrence/tenant introuvable
```

- Membre suspendu (adhésion clôturée) : exclu (`isAdhesionActiveAt`, déjà
  utilisée partout ailleurs — aucune nouvelle règle).
- Nouvel adhérent en cours de période : entre dans le pool dès que son
  adhésion est active à la date de référence de l'occurrence.
- Nouveau cycle : une nouvelle Période réinitialise naturellement le pool
  (aucune boucle automatique, cohérent avec `createPeriod`/`generateOccurrences`
  qui ne transitionnent jamais automatiquement une période).
- **Suggestion, jamais assignation automatique** : `addBeneficiaries` accepte
  toujours n'importe quelle adhésion valide, y compris différente de la
  suggestion — un gestionnaire garde la main.

`listRotationOrder(tenantId, periodId)` expose la vue d'ensemble (toutes les
adhésions dans l'ordre de rotation, avec le numéro d'occurrence qui les a déjà
servies, ou `null`).

**UI** : le dialogue « Ajouter un bénéficiaire » (`tontine-operations-module.tsx`)
pré-remplit le sélecteur avec la suggestion dès son ouverture, et affiche un
message explicite si le tour est terminé — le champ reste un `<select>`
librement modifiable.

**Non traité** : la clôture formelle d'une Période (`PeriodStatus.TERMINATED`,
déjà défini dans le modèle mais jamais assigné) n'a pas été implémentée — hors
périmètre explicite de ce mandat (rotation/intégration/permutation).

---

## 4. Intégration Tontine ↔ Finance (objectif majeur)

### Rattachement Tontine → Compte

`Tontine.accountId?: string` (nouveau champ optionnel, additif) référence un
`Account` du même tenant. Validé à l'écriture (`tontines.service.ts`,
`isValidAccountLink`) ; toujours effacé si la tontine repasse `GOODS`
(cohérent avec `currency`/`purchaseMode`/`contributionAmount`, déjà traités
ainsi). **Rétrocompatible à 100%** : une tontine sans `accountId` (toutes les
tontines seedées avant ce mandat) continue de fonctionner exactement comme
avant — aucune Transaction Finance n'est jamais générée pour elle.

### Flux

```
Cotisation (MONEY, tontine liée)  → Transaction EPARGNE (crédit)   → solde du compte augmente
Réception  (MONEY, tontine liée)  → Transaction AUTRES/DISTRIBUTION (débit) → solde du compte diminue
```

Implémenté dans `recordContributionPayment`/`recordReception`
(`tontine-turns.service.ts`), via une nouvelle fonction interne
`postTontineTransaction`. Ne poste **jamais** pour :
- une tontine `GOODS` (aucun flux monétaire à faire transiter) ;
- une tontine non rattachée (`accountId` absent) ;
- un montant nul/négatif (ex. bascule « annuler le paiement », qui nette via
  un montant négatif — aucun concept de transaction négative/d'avoir n'existe
  dans le journal Finance ; en inventer un aurait été une règle non sourcée).

Best-effort et non bloquant : la mutation Tontine (contribution/réception)
réussit toujours indépendamment du résultat de la transaction Finance — la
Tontine reste la source de vérité de son propre état, la Transaction est un
reflet côté Finance.

### Détail technique : pourquoi une fonction séparée (`insertTransaction`)

`recordContributionPayment`/`recordReception` sont des factories **synchrones**
enveloppées par `mockRequest` (comme presque tout le reste du projet).
`financeService.createTransaction` est **asynchrone** (même si son délai est
généralement nul en test). Appeler une fonction async depuis une factory sync
casserait la coercion `undefined → null` de `mockRequest` pour **toutes** les
branches existantes de ces deux fonctions (piège découvert et documenté dans
le code, cf. `finance.service.ts`, commentaire sur `insertTransaction`). La
logique pure de `createTransaction` a donc été extraite dans une fonction
exportée `insertTransaction(tenantId, input)`, appelée directement et
synchrone par `tontine-turns.service.ts` — comportement de
`financeService.createTransaction` strictement inchangé pour tous ses appelants
existants.

### Permissions

Aucune nouvelle permission — les mutations restent gardées par
`contributions.manage`/`beneficiaries.manage`, déjà en place.

---

## 5. Distribution — vérification (pas de suppression)

`financeService.{listDistributions, createDistribution, approveDistribution}`
et le modèle `Distribution` sont **conservés inchangés**. Constat (recherche
exhaustive dans le code) :
- `createDistribution`/`approveDistribution` ne sont appelés par aucune UI
  (seulement par leurs propres tests) — inchangé par ce mandat.
- `listDistributions` alimente un unique sélecteur en lecture seule dans le
  formulaire de transaction générique (catégorie AUTRES/DISTRIBUTION), pour
  rattacher une transaction à un enregistrement `Distribution` existant à
  titre de référence.

**Décision (documentée)** : ne pas supprimer, ne pas réintégrer dans le
nouveau flux de réception de tontine. Le paiement réel d'un bénéficiaire de
tontine liée à une caisse crée directement une `Transaction`
(AUTRES/DISTRIBUTION) — jamais un `Distribution` séparé — pour rester cohérent
avec le mandat antérieur « Transactions = journal financier central », qui a
délibérément retiré les entités secondaires redondantes avec le journal.
Créer un `Distribution` en plus aurait réintroduit exactement la duplication
que ce mandat antérieur avait supprimée.

---

## 6. Multi-tenant et permissions — revue

Toutes les nouvelles fonctions de service (`credit.service.ts`,
`tontine-turns.service.ts`, `tontines.service.ts`) filtrent systématiquement
par `tenantId` (`getTenantScoped` ou filtre explicite `.tenantId === tenantId`),
même pattern que l'existant. Aucune nouvelle fuite cross-tenant possible n'a
été introduite (vérifié par les tests d'isolation dans
`tontine-finance-integration.test.ts`, `tontine-rotation.test.ts`,
`credit.service.test.ts`).

**Limite connue, non corrigée par ce mandat** (systémique, pré-existante,
touche l'ensemble du projet, pas seulement le code ajouté ici) : aucun service
— ancien ou nouveau — ne vérifie de permission en son sein ; le RBAC n'est
appliqué qu'au niveau des composants React (`PermissionGate`/`PermissionRoute`).
Corriger ce point demanderait de modifier la quasi-totalité des services du
projet, bien au-delà du périmètre Finance/Tontines de ce mandat — documenté ici
plutôt que traité partiellement.
