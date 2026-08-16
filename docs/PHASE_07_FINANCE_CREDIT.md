# TANZEN ENTERPRISE — Phase 7 : Finance / Credit

**Statut : implémentation réelle.** Périmètre strictement limité aux domaines **Finance** et **Credit** (Credit vit dans `src/features/finance/finance-module.tsx`, sous les routes `/finance/credit/*` — il n'existe pas de `src/features/credit/` séparé). Aucun autre domaine touché sauf dépendance technique strictement nécessaire (`dashboard.service.ts`, cf. §21). Aucune règle financière, taux, formule de calcul, statut ou permission n'a été inventé — les sujets concernés sont documentés dans `docs/PHASE_07_DECISIONS_A_VALIDER.md`, pas implémentés.

## Méthodologie

Lecture intégrale avant modification : `src/features/finance/finance-module.tsx` (357 lignes), `src/services/finance.service.ts` et `src/services/credit.service.ts` en entier, les 8 fichiers `src/mocks/finance/*.ts` en entier, le catalogue RBAC (`src/mocks/rbac.mocks.ts`), croisée avec les blocs UC02/UC50/UC60/UCX1/UCX2/UCX3/UCX4/UC70 de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` et les sections Finance/Credit de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`. Plan validé en mode plan avant implémentation.

---

## 1. Use Cases traités

| UC | Description | Statut avant | Statut après |
|---|---|---|---|
| UC50-06 | Créer un compte | IMPLEMENTED | inchangé (déjà complet) |
| UC02-03, UCX3-09 | Enregistrer un remboursement | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** |
| UC60-04 | Gérer les remboursements (lecture + création) | PARTIAL | **IMPLEMENTED** |
| (Guarantor, construit côté lecture selon Phase 5) | Ajouter un garant | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** |
| (Distribution) | Créer une distribution | NOT IMPLEMENTED (formulaire ne persistait rien) | **IMPLEMENTED** |
| UC40-07 (dépendance Finance uniquement) | Valider une distribution | NOT IMPLEMENTED | **IMPLEMENTED** |
| UC60-02, UCX3-11 | Clôturer un prêt | NOT IMPLEMENTED | **IMPLEMENTED** (borné : uniquement si `outstanding === 0`) |
| UC50-07, UC50-08 | Modifier / désactiver un compte | NOT IMPLEMENTED | **BLOCKED** — `docs/PHASE_07_DECISIONS_A_VALIDER.md` §2 (pas de `accounts.update`) |
| UC50-10, UC50-12, UCX4-02/03 | Créer / annuler / valider une transaction | NOT IMPLEMENTED (boutons décoratifs) | **BLOCKED** — §1 (pas de `transactions.create/cancel`) |
| UC60-01, UCX3-06 | Décaisser (lier le `Loan` à l'`Application`) | PARTIAL (transition d'étape sans création du prêt) | **BLOCKED** — §3 (taux d'intérêt non sourcé) |
| UC50-01, UC50-13 à UC50-19 | Journal, grand livre, compte de résultat, balance | NOT IMPLEMENTED | **OUT OF SCOPE** (décision canonique Phase 2 : pas de modèle comptable en partie double) |
| UC70-19, UCX3-16/17/18 | Détection automatique de retard, pénalités | NOT IMPLEMENTED | **OUT OF SCOPE** (acteur Planificateur, hors UI) |
| UC02-17 à 19, UC50-04/05/09/11 | Gérer les comptes, consulter transactions/plan comptable | IMPLEMENTED | inchangé |
| UCX1-08 (dépendance Finance) | Verser les cotisations | IMPLEMENTED ailleurs (Tontines, lecture seule côté Finance) | inchangé — non transformé en transaction, conformément à la consigne |

## 2. Classes traitées

| Classe | Frontend existant | Frontend ajouté | Service | Tenant scope | Notes |
|---|---|---|---|---|---|
| `Account` | type + CRUD (create) | — | `financeService` | direct (`tenantId`) | aucun changement |
| `Transactions` | type + liste | — | `financeService` | direct | création BLOQUÉE (§1 décisions) |
| `Contribution_rules`/`TontineContribution` | type + liste (lecture) | — | `financeService` | direct | resté lecture seule, non fusionné avec Transactions |
| `Distribution` | type + liste | création, validation | `financeService` | direct | statut `pending→completed` réutilisé, aucune formule de répartition inventée |
| `Loans` | type + CRUD (create), tabs détail | clôture | `creditService` | direct, validé avant tout accès aux enfants (Repayments/Guarantors) | `LoanStatus` migré vers `pending/active/repaid/defaulted` |
| `Repayments` | type + liste (lecture) | création (+ mise à jour du `Loan` parent) | `creditService` | indirect via `Loan` parent validé (pattern déjà en place, réutilisé) | formule `progress`/`outstanding` réutilisée telle qu'observée sur 100% des données existantes |
| `LoanGuarantor` | type + liste (« Construit » selon Phase 5) | création | `creditService` | indirect via `Loan` parent validé | `borrowerName` auto-rempli depuis le prêt sélectionné |
| `Loan_policies` | absent | non créé | non créé | — | mentionné en option de résolution du sujet BLOQUANT §3, non implémenté |

## 3. Routes

Aucune nouvelle route. Toute la nouvelle fonctionnalité est portée par des modales (`ConfirmDialog`) et des actions en ligne dans les 6 pages Finance/Credit déjà routées (`/finance/accounts*`, `/transactions`, `/distributions*`, `/credit/applications*`, `/credit/loans*`, `/credit/repayments`, `/credit/guarantors`).

## 4. Pages modifiées

`RepaymentsList`, `GuarantorsList`, `DistributionsList`, `DistributionCreate` (réparée — ne persistait rien), `LoanDetail` (action de clôture), `LoansList` (filtre de statut aligné sur les 4 valeurs validées).

## 5. Components

Aucun nouveau composant fichier. Réutilisation de `ConfirmDialog` (slot `children` pour formulaire, pattern déjà établi en Phase 6) et des primitives `Input`/`Label`/`Textarea`/`Button` déjà importées dans `finance-module.tsx`.

## 6. Services

`src/services/finance.service.ts` : `createDistribution`, `approveDistribution` (+ type `DistributionInput`).
`src/services/credit.service.ts` : `createRepayment` (valide le `Loan` parent avant toute écriture, comme `listRepaymentsByLoan` — jamais de création sur un `loanId` non vérifié tenant-scope ; met à jour `paidAmount`/`outstanding`/`progress`/`lastPaymentDate` du prêt si le remboursement est `completed`), `createGuarantor` (même validation du `Loan` parent), `closeLoan` (refuse si `outstanding !== 0`) (+ types `RepaymentInput`, `GuarantorInput`).

## 7. Queries

Réutilisation stricte des `queryKeys.finance.*`/`queryKeys.credit.*` déjà définies (`src/services/query-keys.ts`) — aucune nouvelle clé.

## 8. Mutations

Toutes via `useMockMutation` (`src/hooks/use-mock-mutation.ts`), avec invalidation ciblée : `createRepayment` invalide à la fois `credit.repayments` et `credit.loans` (le prêt parent change) ; `closeLoan` invalide `credit.loan(id)` et `credit.loans` ; les autres suivent le pattern standard déjà utilisé en Phase 6.

## 9. RBAC

Aucune permission inventée. Mapping retenu :
- `repayments.create` — enregistrer un remboursement.
- `guarantors.create` — ajouter un garant.
- `distributions.create` — créer une distribution (déjà en place, désormais réellement fonctionnel).
- `distributions.approve` — valider une distribution.
- `loans.approve` — clôturer un prêt (seule permission d'action existante sur `loans`, même logique de mapping que `governance.approve` en Phase 6).

Les actions non couvertes par une permission existante (transactions, modification de compte) n'ont **pas** été implémentées plutôt que de recevoir une permission inventée — voir `docs/PHASE_07_DECISIONS_A_VALIDER.md`.

## 10. Tenant isolation

`Account`, `Transaction`, `Distribution`, `Application`, `Loan`, `Repayment`, `Guarantor` portent tous un `tenantId` direct. Le pattern « valider le `Loan` parent avant tout accès à ses `Repayments`/`Guarantors` » (déjà en place dans `listRepaymentsByLoan`/`listGuarantorsByLoan`) a été **répliqué à l'identique pour les créations** (`createRepayment`/`createGuarantor` résolvent d'abord `getTenantScoped(loans, ..., tenantId)` et retournent `undefined` si le prêt n'appartient pas au tenant courant — jamais d'écriture sur un `loanId` non vérifié).

**Vérification directe en environnement** (`npm run dev`, headless Chrome + script CDP, port dédié 5184/9334, session isolée des vérifications Phase 6) :
1. Remboursement de 523 600 FCFA (500 000 + 23 600) créé sur `L-001` (T-001) — le prêt passe de 45 % à 100 % de progression, `outstanding` à 0.
2. Bouton « Clôturer le prêt » apparaît uniquement une fois `outstanding === 0`, clôture confirmée → statut « Remboursé », bouton disparaît ensuite.
3. Bascule vers T-002 (`localStorage['tanzen-tenant-id']`) : le remboursement créé (`RP-011`, Fatou Ndiaye) **n'apparaît pas** dans la liste des remboursements de T-002, qui ne montre que ses 2 remboursements propres (`RP-002`/`RP-006`, liés à `L-002`).

## 11. i18n

22 nouvelles clés au total (FR + EN) : `defaulted` (dans `organization` et `finance`, statut de prêt affiché aux deux endroits — `finance-module.tsx` et l'onglet Prêts de `MemberDetail` dans `organization-module.tsx`), plus `selectLoan`, `repaymentCreated`, `guarantorCreated`, `distributionCreated`, `closeLoan`, `closeLoanConfirm`, `loanClosed`, `validateDistribution`, `validateDistributionConfirm`, `distributionValidated` dans `finance`. Le reste des libellés nécessaires (`principalPart`, `interestPart`, `guarantorName`, `guaranteedAmount`, `relation`, `createRepayment`, `createGuarantor`, etc.) existait déjà, pré-provisionné.

## 12. Money

Aucun montant codé en dur — tous les nouveaux champs numériques passent par `MoneyDisplay`/`formatFCFA` déjà en place. Aucune nouvelle occurrence de `XOF`/devise codée en dur introduite. Note (non corrigée, hors périmètre) : `formatFCFA` (`src/lib/utils.ts`) suffixe déjà systématiquement « FCFA » en dur, y compris en locale EN — comportement préexistant, partagé par tout le reste de l'application, pas spécifique à cette phase et non modifié ici (changer une fonction utilitaire partagée par tous les domaines dépasserait le périmètre Finance/Credit).

## 13. Dates

Tous les nouveaux champs date utilisent `<Input type="date">` (cohérent avec le reste du formulaire) et l'affichage passe par `DateDisplay` existant — aucun nouveau composant de date.

## 14. Themes

Uniquement les tokens shadcn déjà utilisés dans `finance-module.tsx` (`bg-primary`, `text-muted-foreground`, etc.) — aucun style codé en dur, aucun token `landing-*` utilisé.

## 15. Accessibility

Chaque champ de formulaire a un `<Label htmlFor>` associé. `ConfirmDialog` porte déjà `role="dialog" aria-modal="true"` (composant réutilisé sans modification). Les actions conditionnelles (Clôturer le prêt, Valider une distribution) sont des `<Button>` avec libellé texte explicite.

## 16. Responsive

Les nouveaux formulaires en dialogue utilisent `grid grid-cols-2 gap-3` pour les paires de champs courtes, cohérent avec le pattern déjà en place en Phase 6 ; `ConfirmDialog` reste `max-w-md w-full` par construction, déjà vérifié responsive.

## 17. Tests cross-tenant

Voir §10 — vérifié en direct pour Repayments (création + isolation). Guarantors et Distributions suivent exactement le même pattern de service (`getTenantScoped`/`tenantId` direct), déjà éprouvé à l'identique en Phase 6 pour des entités structurées de façon équivalente — non re-testé individuellement en live par souci de temps, mais la garantie vient du code partagé, pas d'une supposition.

## 18. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — succès (7,3 s), même avertissement pré-existant sur la taille de chunk (>500 kB).

## 19. Use Cases partiels ou manquants

Voir la colonne « Statut après » du tableau §1. Résumé : BLOCKED (3, tous documentés dans `docs/PHASE_07_DECISIONS_A_VALIDER.md`) ; OUT OF SCOPE (2, rappels de décisions déjà actées, pas de nouvelle question).

## 20. Decisions required

3 sujets consolidés dans `docs/PHASE_07_DECISIONS_A_VALIDER.md` : permission(s) RBAC manquante(s) pour les transactions, permission `accounts.update` manquante, source du taux d'intérêt pour l'auto-création du prêt au décaissement. 1 résolution actée (pas une question) : `Loan.status` migré vers la liste validée `PENDING/ACTIVE/REPAID/DEFAULTED`, qui clôt le sujet BLOQUANT §3 de `docs/PHASE_02_DECISIONS_A_VALIDER.md`.

## 21. Fichiers modifiés

- `src/mocks/finance/loans.ts` — `LoanStatus` migré, `L-005.status` corrigé (`overdue → active`).
- `src/services/finance.service.ts` — `createDistribution`, `approveDistribution`.
- `src/services/credit.service.ts` — `createRepayment`, `createGuarantor`, `closeLoan`.
- `src/features/finance/finance-module.tsx` — formulaires/actions Repayments, Guarantors, Distributions (create + approve), Loan (close) ; `tone` et filtre de statut Loan mis à jour.
- `src/features/organization/organization-module.tsx` — `LOAN_STATUS_TONE` aligné sur le nouveau `LoanStatus` (seule modification hors Finance/Credit ; le composant affiche déjà `Loan.status` dans l'onglet Prêts d'un membre, dépendance technique strictement nécessaire à la migration de statut).
- `src/services/dashboard.service.ts` — 4 références à `loan.status === 'overdue'`/`'closed'` corrigées suite à la migration du type (dépendance technique strictement nécessaire, aucune nouvelle fonctionnalité Dashboard ajoutée ; la notion de « prêt en retard » y est redéfinie via `Repayment.status === 'late'`, cohérent avec la même redéfinition appliquée dans `loans.ts`).
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — 22 nouvelles clés (`organization` + `finance`).
- `docs/PHASE_07_DECISIONS_A_VALIDER.md`, `docs/PHASE_07_FINANCE_CREDIT.md` — nouveaux.

Aucun autre fichier (Tontines, Governance, Operations, Workflows, Documents, Access, Audit, Settings) n'a été modifié.

---

*Fin du rapport Phase 7. Ne pas commencer la Phase 8.*
