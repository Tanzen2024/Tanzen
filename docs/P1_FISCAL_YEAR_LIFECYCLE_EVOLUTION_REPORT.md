# Évolution du cycle de vie des exercices fiscaux — Rapport final

Mandat : « Évolution du cycle de vie des exercices fiscaux et des objets clôturables », 2026-09-16. Branche `feature/finance-position-engine`.

## A — Documentation consultée

Répertoire `docs/` exploré intégralement (liste complète produite en phase de recherche). Documents pertinents, tous lus en entier ou en grande partie :

- `docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md` — audit baseline (avant toute décision de ce mandat).
- `docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md` + `..._DECISION_GATE_CLOSURE.md` — décisions D-FY-01 à D-FY-06.
- `docs/P1_GLOBAL_FISCAL_YEAR_CONTEXT_TRANSFER_IMPLEMENTATION_REPORT.md` — remplacement de la réouverture directe par un workflow demande→approbation (§24-BIS).
- `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE*.md` + `..._IMPLEMENTATION_REPORT.md` — décisions D-FY-07/D-FY-08 (permission `fiscalYears.approve` distincte, blocage auto-approbation).
- `docs/FINANCE_TONTINES_IMPLEMENTATION.md` / `docs/IMPLEMENTATION_FINANCE_TONTINES_REPORT.md` — signalent explicitement que le moteur de clôture financière (`src/lib/finance/closing.ts`, `carry-forward.ts`) existe mais n'était jamais appelé par la clôture d'exercice.
- `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` — règles d'isolation tenant appliquées.
- `docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md` — vocabulaire `MemberStatus` figé (`active`/`inactive`/`suspended`/`exited`, `pending` retiré).
- `docs/P0_RBAC_AUDIT.md` / rapports associés — convention de permissions `resource.action`.

`docs/AUDIT_PHASE_01.md` a été identifié comme décrivant un autre codebase (`tanzen-frontend-claude`) et écarté comme non pertinent pour l'état actuel de `tanzen-frontend`.

## B — État actuel (avant ce mandat)

La quasi-totalité du modèle demandé était déjà implémentée et validée par un cycle de décisions PO documenté (D-FY-01 à D-FY-08) :

- `FiscalYear.status: 'open' | 'closed' | 'upcoming'`, `isCurrent` indépendant du statut.
- Réouverture = workflow demande → approbation (`WD-005`), justification obligatoire, blocage auto-approbation appliqué **côté service**, jamais une mutation directe.
- Audit déjà branché sur le journal central unique `auditEvents`.
- Permissions `fiscalYears.read` / `fiscalYears.manage` / `fiscalYears.approve` déjà en place.
- Sélecteur d'exercice déjà unique (header uniquement, pas de doublon sidebar).
- Un moteur complet de clôture/report comptable (`ClosingEntry`/`OpeningEntry`, immuable, supersession plutôt qu'édition en place) existait mais n'était **jamais appelé** par la clôture d'exercice — gap documenté dans le code lui-même.

Les gaps réels identifiés (et comblés par ce mandat) :
1. Clôture sans intégration au moteur financier ni signalement des opérations en attente.
2. Aucune prorogation possible après création (`endDate` non modifiable).
3. Réouverture sans aucune vérification des dépendances (exercice suivant, report à nouveau déjà appliqué).
4. `closed_at`/`closed_by` absents de l'entité (choix D-FY-06 : traçabilité 100% par l'audit).
5. Règle transverse de réouverture appliquée nulle part ailleurs que l'exercice fiscal.

## C — Modèle cible retenu

```ts
type FiscalYear = {
  startDate: string;      // déjà existant — date de début réelle
  endDate: string;        // déjà existant — RÉUTILISÉ comme date de fin PRÉVUE (jamais un indicateur de clôture)
  status: 'open' | 'closed' | 'upcoming';
  isCurrent: boolean;     // déjà existant, indépendant de status (D-FY-03)
  closedAt: string | null;   // NOUVEAU — cache d'affichage uniquement
  closedBy: string | null;   // NOUVEAU — cache d'affichage uniquement
  createdAt: string;
  meetingSchedule?: MeetingScheduleConfig;
};
```

**Décision actée avec l'utilisateur** (question posée explicitement, car elle contredisait D-FY-06 tel quel) : `closedAt`/`closedBy` sont ajoutés comme **champs dénormalisés en cache**, écrits uniquement en même temps que l'événement d'audit `fiscalYears.close` / `fiscalYears.reopened`, jamais éditables indépendamment. L'audit reste la source de vérité complète (historique multi-transitions) ; ces deux champs ne représentent que l'état de clôture **courant**. Aucun renommage d'`endDate` en `planned_end_date` : le champ existant remplit déjà exactement ce rôle (distinct de `closedAt`), un renommage aurait été un changement non nécessaire (règle §37).

## D — Migration (mocks, pas de vraie base de données dans ce frontend)

- `src/mocks/settings/fiscal-years.ts` : ajout de `closedAt`/`closedBy` au type et à chacun des 12 enregistrements de seed (`null` — aucune clôture historique réelle n'a jamais été tracée avant ce mandat, même logique que `createdAt`).
- `src/lib/finance/__fixtures__/factories.ts` et 2 fichiers de test (`fiscal-years.test.ts`, `fiscal-year-create-dialog.test.tsx`) : leurs fabriques `makeYear`/`makeFiscalYear` mises à jour pour les nouveaux champs obligatoires.
- Correctif connexe trouvé et corrigé : l'identifiant généré par `createFiscalYear` (`FY-${tenantId}-${Date.now()}`) pouvait entrer en collision entre deux créations survenant dans la même milliseconde (même défaut déjà corrigé ailleurs dans ce fichier pour `workflowService.createRequest`) — suffixe aléatoire ajouté.

## E — Clôture (validations)

`settingsService.closeCurrentFiscalYear` (réécrite) :
1. Vérifie qu'un exercice courant `open` existe pour le tenant (`NO_CURRENT_YEAR` sinon).
2. Appelle `financePositionService.closeFiscalYear` — crée les `ClosingEntry FINAL` de chaque caisse du tenant. `ALREADY_CLOSED` (clôture financière déjà faite séparément) est traité comme une précondition déjà satisfaite, jamais un échec (idempotence). Tout autre refus bloque la clôture (`FINANCE_CLOSING_FAILED`).
3. Recense les opérations en attente sur la période `[startDate, endDate]` (`Application` en `stageSubmitted`/`stageReview`, `Distribution`/`Transaction` `pending`) — **signalées dans le résultat et dans l'audit, jamais bloquantes**. Un blocage dur aurait été une règle métier inventée (aucune décision PO en ce sens) et aurait cassé un scénario déjà légitime dans ce codebase (une distribution en attente peut coexister avec la clôture gouvernance).
4. Flip `status: 'closed'`, `isCurrent: false`, pose `closedAt`/`closedBy`, audit `fiscalYears.close` (inchangé, action déjà existante).

`Loan.status === 'pending'` n'est délibérément pas vérifié : cette valeur du type n'est jamais assignée par `credit.service.ts` (un `Loan` n'existe qu'à partir du décaissement, toujours `status: 'active'`) — un contrôle sur une valeur qui ne peut jamais survenir n'aurait été qu'un faux sentiment de sécurité.

## F — Réouverture (validations)

Le workflow demande → approbation existant (D-FY-05/07/08) est conservé intégralement. Ajout :
- `computeReopenWarnings` (dans `requestFiscalYearReopen`) calcule des **avertissements non bloquants**, attachés à la `WorkflowRequest` (nouveau champ générique `warnings?: string[]`) :
  - `NEXT_YEAR_ACTIVE` — un exercice suivant existe déjà (`open` ou `closed`) pour ce tenant.
  - `CARRY_FORWARD_APPLIED` — un report à nouveau a déjà été appliqué depuis cet exercice vers le suivant (recalculer la clôture après réouverture désynchroniserait `closing(N)`/`opening(N+1)` tant que le report n'est pas rejoué).
- Visibles par le demandeur et l'approbateur dans l'écran Operations existant (`WorkflowDetail`).
- **Aucun blocage dur** n'a été ajouté : aucune décision PO n'existe pour transformer ces avertissements en interdictions, et les mécanismes de correction déjà présents (`recomputeClosingEntry`, `verifyCarryForwardIntegrity`) existent précisément pour ce scénario — inventer un blocage aurait contredit la marche à suivre déjà choisie par ce projet.
- `applyFiscalYearReopenDecision` remet `closedAt`/`closedBy` à `null` sur approbation (l'historique complet reste dans l'audit — jamais effacé, cf. mandat §25/§26).

## G — Objets clôturables (audit complet)

| Objet | Clôturable ? | Réouvrable ? | Décision |
|---|---|---|---|
| Exercice fiscal | Oui | Oui (workflow) | Référence — renforcée par ce mandat |
| **Compte (Account)** | Oui (`deleteAccount` → `inactive` si mouvements) | **Non → ajouté** | `reactivateAccount` (nouveau) |
| Transaction | Oui (`cancelTransaction`) | Non | Exclu (§H) |
| Prêt (Loan) | Oui (`closeLoan`, si `outstanding===0`) | Non | Exclu (§H) |
| Distribution | Oui (`approveDistribution`) | Non | Exclu (§H) |
| Occurrence de tontine | Oui (`closeOccurrence`) | Non | Exclu (§H) |
| Application (demande de prêt) | Oui (`stageRejected`/`stageDisbursed`) | Non | Exclu (§H) |
| AccountMembership | Oui (`removeAccountMembers` → `ended`) | Non (nouvelle ligne) | Exclu (§H) |

## H — Objets exclus et pourquoi

- **Transaction** : l'annulation (`cancelTransaction`) n'est pas une clôture au sens du mandat (§12) — restaurer une transaction annulée réécrirait un fait comptable déjà consommé par d'autres calculs de solde.
- **Prêt** : `closed`/`repaid` constate un remboursement intégral — une *complétion*, pas une clôture administrative réversible. Rouvrir un prêt soldé n'a aucun sens métier documenté.
- **Distribution** : l'approbation matérialise un versement déjà effectué ; une réouverture reviendrait à annuler un mouvement d'argent réel — hors périmètre de ce mandat, nécessiterait une opération financière inverse explicite.
- **Occurrence de tontine** : `closeOccurrence` exige que tous les bénéficiaires aient reçu leur tour (`allBeneficiariesReceived`) ; rouvrir casserait cet invariant sans qu'aucune décision produit n'existe pour le gérer.
- **Application** : `stageRejected`/`stageDisbursed` sont des issues de workflow, pas des clôtures administratives.
- **AccountMembership** : le modèle « jamais de suppression, toujours une nouvelle ligne » (`addAccountMembers` après `removeAccountMembers`) est déjà l'équivalent fonctionnel d'une réouverture — en ajouter une seconde dupliquerait ce mécanisme existant.

**Compte** a été le seul candidat retenu pour une extension : `reactivateAccount(tenantId, accountId)`, gardée par la permission déjà existante `accounts.manage`, auditée (`finance.account.reactivated`), refuse si le compte n'existe pas ou n'est pas `inactive`.

## I — Audit

Aucun second système d'audit créé. Toutes les nouvelles actions écrivent dans le journal canonique unique `auditEvents` (`src/mocks/audit/audit-events.ts`) :
- `fiscalYears.extend` (prorogation, `before`/`after` sur `endDate`).
- `finance.account.reactivated`.
- Les actions déjà existantes (`fiscalYears.close`, `.reopened`, `.reopenRequested`, etc.) sont inchangées dans leur nommage, enrichies de contexte (`pendingApplications`/`pendingDistributions`/`pendingTransactions` sur `fiscalYears.close` quand il y en a).

## J — Permissions

Aucune nouvelle permission créée. `extendFiscalYearEndDate` et `reactivateAccount` réutilisent respectivement `fiscalYears.manage` et `accounts.manage`, déjà existantes et déjà exclues de `role-viewer`.

## K — Frontend

- `src/features/settings/settings-module.tsx` : `closeMutation` adaptée au nouveau type de retour discriminé (message d'erreur distinct selon le motif de refus) ; affichage de `closedAt`/`closedBy` sur un exercice clôturé ; nouvelle action « Proroger » (dialog date unique) sur un exercice non clôturé.
- `src/features/operations/operations-module.tsx` : affichage des avertissements de réouverture (`request.warnings`) dans l'écran d'approbation existant.
- `src/features/finance/finance-module.tsx` : bouton « Réactiver » sur un compte `inactive` (liste et fiche détail), même emplacement/permission que l'action de désactivation existante.
- Sélecteur d'exercice (header) : **inchangé** — déjà conforme au mandat (instance unique, pas de doublon sidebar).

## L — Tests

- `npx tsc --noEmit -p tsconfig.app.json` : ✅ 0 erreur.
- `npm run lint` : ✅ 0 erreur (18 avertissements pré-existants, hors périmètre de ce mandat).
- `npx vitest run` (suite complète) : ✅ **1124/1124 tests passés**, 73 fichiers.
- `npm run build` : ✅ build production réussi.
- Nouveaux tests ajoutés : `settingsService.closeCurrentFiscalYear` (intégration financière, idempotence `ALREADY_CLOSED`, opérations en attente signalées sans blocage), `extendFiscalYearEndDate` (succès, refus `NOT_AN_EXTENSION`/`CLOSED`/`OVERLAPS_NEXT_YEAR`), avertissements de `requestFiscalYearReopen`, remise à `null` de `closedAt`/`closedBy` par `applyFiscalYearReopenDecision`, `financeService.reactivateAccount` (succès, refus compte actif, refus tenant croisé).
- Deux tests existants adaptés au nouveau type de retour de `closeCurrentFiscalYear` (`settings.service.test.ts`, `finance-position.service.test.ts`) sans changement de leur intention.

## M — Risques restants

- **D-FY-02 (classification FY-scoped des domaines) reste tranchée nulle part** — les « opérations en attente » de la clôture sont donc détectées par plage de dates plutôt que par un lien `fiscalYearId` explicite. Fonctionnellement correct pour les données de seed actuelles, mais une décision produit future sur D-FY-02 pourrait vouloir remplacer cette heuristique par une relation explicite.
- Les avertissements de réouverture restent **non bloquants** par choix documenté ; si l'organisation souhaite un jour un blocage dur (ex. interdire toute réouverture tant qu'un report à nouveau n'a pas été « dérejoué »), cela nécessite une nouvelle décision PO explicite — volontairement non inventée ici.
- Le moteur financier (`closeFiscalYear`/`carryForward`/`recomputeClosingEntry`) reste accessible uniquement via les services (`financePositionService`) — aucun écran dédié « Report à nouveau » n'existe encore dans Finance ; seule la clôture d'exercice (Paramètres) le déclenche désormais automatiquement à la clôture.
- 10 membres fictifs ajoutés à `src/mocks/organization/members.ts` (M-009 à M-018) pour la demande annexe du mandat — répartis sur les 5 tenants existants, couvrant les 4 valeurs de `MemberStatus` dont `exited` (absent du seed jusqu'ici).
