# TANZEN — Phase 7 : Décisions à valider par le Product Owner

**Statut : accompagne une mission d'implémentation réelle.** Les sujets ci-dessous n'ont **pas** été implémentés dans le cadre de la Phase 7 (`docs/PHASE_07_FINANCE_CREDIT.md`), conformément à la règle absolue « ne pas inventer de règle financière, de taux, de règle de calcul, de statut ou de workflow » et « utiliser uniquement les permissions RBAC existantes ».

---

## Résolution actée dans cette phase (pas une nouvelle question)

### 0. `Loan.status` — sujet BLOQUANT de `docs/PHASE_02_DECISIONS_A_VALIDER.md` §3, désormais tranché

Le prompt de la Phase 7 fixe explicitement la liste validée `PENDING, ACTIVE, REPAID, DEFAULTED`, correspondant à l'option (b) laissée ouverte dans `docs/PHASE_02_DECISIONS_A_VALIDER.md` §3. `src/mocks/finance/loans.ts` a été migré en conséquence (`overdue → active`, le retard restant visible au niveau du remboursement via `Repayment.status = 'late'`, déjà utilisé par `L-005`/`RP-009` ; `closed` retiré, aucune donnée mock ne l'utilisait). Documenté ici pour traçabilité, ce n'est **pas** une question ouverte.

---

## Sujets BLOQUANT

### 1. Transactions — création, annulation, validation (UC50-10, UC50-12, UCX4-02, UCX4-03)

- **Problème** : le catalogue RBAC (`src/mocks/rbac.mocks.ts`) n'expose que `transactions.read` et `transactions.export` — aucune permission `transactions.create`/`update`/`cancel`. Le bouton « Nouveau mouvement » existant (`TransactionsList`, `AccountDetail`) est décoratif (aucun `onClick`), et le seul gate qui lui est déjà appliqué (`transactions.export`) est sémantiquement incorrect pour une action de création — un défaut préexistant, non introduit par cette phase.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC50-10/12, UCX4-02/03 ; lecture directe du catalogue RBAC.
- **Analyse** : créer une permission `transactions.create`/`cancel` résoudrait le blocage techniquement, mais constituerait une invention de permission — explicitement interdite par la règle absolue (« ne pas créer arbitrairement de nouvelles permissions »). Impossible de trancher sans validation du Product Owner sur le nom et la granularité de la ou des permissions à ajouter au catalogue.
- **Décision proposée** : **Question à trancher : quelle(s) permission(s) ajouter au catalogue RBAC pour couvrir la création/l'annulation de transactions ?** Options : (a) une seule `transactions.create` couvrant création et annulation ; (b) `transactions.create` + `transactions.cancel` séparées, cohérent avec la granularité déjà en place ailleurs (`applications.create`/`applications.approve`) ; (c) aucune nouvelle permission, la création de transaction restant un effet de bord d'autres actions déjà permissionnées (ex. décaissement de prêt, remboursement) plutôt qu'une action directe de l'utilisateur.
- **Impact frontend** : une fois la permission tranchée, `TransactionsList`/`AccountDetail` pourront recevoir un vrai formulaire de création, suivant le même pattern que Repayments/Guarantors/Distributions livrés dans cette phase.
- **Statut** : **BLOQUANT** — non implémenté, boutons décoratifs laissés inchangés (ni supprimés, ni câblés sur un permission incorrecte).

### 2. Comptes — modifier / désactiver (UC50-07, UC50-08)

- **Problème** : le catalogue RBAC n'expose que `accounts.read`/`accounts.create` — aucune `accounts.update`.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC50-07/08 ; lecture directe du catalogue RBAC.
- **Décision proposée** : **Question à trancher : ajouter `accounts.update` au catalogue RBAC ?** Sans elle, aucune modification/désactivation de compte n'est implémentable dans le respect de la règle RBAC de cette phase.
- **Statut** : **BLOQUANT**.

### 3. Auto-création du `Loan` au décaissement d'une `Application`

- **Problème** : le bouton « Décaisser » de `ApplicationDetail` (déjà fonctionnel, non touché par cette phase) transitionne l'étape de la demande vers `stageDisbursed` mais **ne crée aucun `Loan` lié**. Dans les données mock, les 3 demandes déjà `stageDisbursed` (AP-001/002/003) ont chacune un `Loan` correspondant, mais celui-ci a été créé séparément (formulaire manuel `LoanCreate`), pas par l'action de décaissement elle-même. Décaisser une nouvelle demande aujourd'hui ne produit donc pas de prêt.
- **Sources** : lecture directe de `ApplicationDetail`/`advanceApplicationStage` (`credit.service.ts`) — aucune création de `Loan` dans cette fonction ; `Loan.applicationId` existe comme FK, confirmant l'intention de liaison.
- **Analyse** : créer automatiquement le `Loan` au décaissement nécessiterait un `interestRate` — champ absent du modèle `Application` (`creditScore`, `monthlyIncome`, `existingLoans` y figurent, pas de taux). L'auto-remplir avec une valeur par défaut (ex. celle du formulaire manuel `LoanCreate`, actuellement 12%) reviendrait à inventer un taux, explicitement interdit par la règle absolue.
- **Décision proposée** : **Question à trancher : d'où doit provenir le taux d'intérêt lors de l'auto-création du prêt au décaissement ?** Options : (a) ajouter un champ `interestRate` à `Application`, renseigné dès la soumission ou lors de la décision d'octroi (UCX3-14) ; (b) introduire une entité `LoanPolicy`/barème de taux par type de prêt (cohérent avec UC60-03 « Gérer les politiques de prêt », non implémenté non plus) ; (c) garder la création manuelle actuelle (statu quo), le décaissement restant uniquement une transition d'étape.
- **Impact frontend** : une fois tranché, le pipeline `stageDisbursed` pourrait appeler `creditService.createLoan` automatiquement.
- **Statut** : **BLOQUANT** — non implémenté, le comportement actuel (décaissement = transition d'étape uniquement, prêt créé séparément) reste inchangé.

---

## Hors périmètre (rappel, pas une nouvelle décision)

- **Journal / grand livre / compte de résultat / balance / situation financière** (UC50-01, UC50-13 à UC50-19) — cohérent avec la décision canonique déjà actée dans `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` : pas de modèle comptable en partie double (`Journal`/`transaction_lines`). Ces UC dépendent structurellement d'une entité `Journal` déjà écartée — non re-questionné ici.
- **Détection automatique de retard et calcul de pénalités** (UC70-19, UCX3-16/17/18) — acteur « Planificateur » (job planifié automatique), hors périmètre d'une implémentation UI manuelle.
- **UC60-03 « Gérer les politiques de prêt »** (`LoanPolicy`) — mentionné au sujet 3 ci-dessus comme option de résolution possible, mais aucune UC dédiée n'a été construite dans cette phase (dépend de la décision du sujet 3).

---

## Synthèse

3 sujets **BLOQUANT** (Transactions, Comptes — modifier/désactiver, auto-création du prêt au décaissement), tous causés par des lacunes du catalogue RBAC ou du modèle `Application`/`Loan` que la règle absolue de cette phase interdit de combler par invention. 1 résolution actée (`Loan.status`, close le sujet 3 de `PHASE_02_DECISIONS_A_VALIDER.md`). Aucun de ces sujets n'affecte les fonctionnalités livrées dans cette phase (Repayments, Guarantors, Distributions, clôture de prêt) — elles s'appuient exclusivement sur des permissions et des champs déjà existants.
