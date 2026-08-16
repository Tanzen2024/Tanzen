# TANZEN — Phase 9 : Décisions à valider par le Product Owner

**Statut : accompagne une mission d'implémentation réelle.** Les sujets ci-dessous n'ont **pas** été implémentés dans le cadre de la Phase 9 (`docs/PHASE_09_OPERATIONS_WORKFLOWS_DOCUMENTS.md`), conformément à la règle absolue « ne pas inventer de workflow, de statut, de permission, de règle d'approbation ou de relation métier ». Seules les décisions réellement non résolues figurent ici.

---

## Sujets BLOQUANT

### 1. Délégation d'approbation

- **Problème** : `DelegationsTab` affiche un bouton « Créer une délégation » (gated `workflows.manage`) sans `onClick` — l'entité `WorkflowDelegation` existe intégralement dans les mocks (`fromUserId/toUserId/domain/startDate/endDate/active/reason`) et l'onglet l'affiche déjà en lecture, mais **aucun Use Case ne nomme la délégation** : recherche exhaustive de « déléguer »/« délégation » dans `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` — aucune occurrence.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (aucun UC Workflows, UC100W-01 à 12, ne mentionne de délégation) ; lecture directe de `src/mocks/operations/delegations.ts`.
- **Analyse** : c'est une capacité pré-construite non sourcée, de la même famille que `TontineBid` (Phase 8) — le modèle de données et l'UI existent, mais rien dans les Use Cases ne documente les règles (qui peut déléguer à qui, une délégation nécessite-t-elle elle-même une approbation, que se passe-t-il en cas de délégations en cascade ou qui se chevauchent). Construire le formulaire de création inventerait ces règles.
- **Décision proposée** : **Question à trancher : la délégation d'approbation est-elle une fonctionnalité réellement attendue, et si oui, quelles sont ses règles (portée, durée, validation) ?** Si confirmée, un Use Case dédié doit être spécifié avant implémentation.
- **Statut** : **BLOQUANT** — bouton laissé inchangé (ni supprimé, ni câblé).

### 2. Partage de document (bascule `shared`)

- **Problème** : `DocumentRecord.shared: boolean` existe et un onglet « Partagés » l'exploite déjà en lecture (UC90-06 « Partager un document » est un UC confirmé), mais le catalogue RBAC (`documents.read/create/delete/download`) n'expose **aucune** permission `documents.share`/`documents.update` pour autoriser la bascule.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC90-06 ; lecture directe du catalogue RBAC.
- **Décision proposée** : **Question à trancher : ajouter quelle permission au catalogue RBAC pour le partage de documents ?** (`documents.share` dédiée, ou `documents.update` plus générique couvrant aussi UC90-12 « Modifier les métadonnées »).
- **Statut** : **BLOQUANT**.

### 3. Restaurer / Archiver un document

- **Problème** : UC90-07 (« Restaurer un document ») et UC90-09 (« Archiver un document ») sont des UC confirmés, mais `DocumentRecord` n'a ni champ `archived`/`deleted` ni permission dédiée — la suppression construite dans cette phase (§ rapport) est une suppression définitive (`documents.delete`), pas une mise en corbeille récupérable.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC90-07/09 ; lecture directe du type `DocumentRecord`.
- **Décision proposée** : **Question à trancher : un document supprimé doit-il d'abord passer par un état « archivé »/« corbeille » restaurable, plutôt qu'une suppression immédiate et définitive ?** Nécessite l'ajout d'un champ de statut non inventé ici.
- **Statut** : **BLOQUANT — entité/statut non spécifié.**

---

## Sujets nécessitant un arbitrage d'architecture

### 4. Soumettre une nouvelle demande de workflow (UC100W-06)

- **Problème** : `workflows.create` existe dans le catalogue RBAC mais n'est utilisé nulle part. Construire un formulaire générique « créer une demande de workflow sur n'importe quelle entité » nécessiterait de décider quelles entités/domaines sont éligibles à passer par `workflowService` — or les Phases 6 et 7 ont déjà câblé des mécanismes d'approbation ad hoc **indépendants** de `workflowService` pour Applications (`applications.approve`), Distributions (`distributions.approve`) et Gouvernance (`governance.approve`), sans jamais créer de `WorkflowRequest`. Deux mécanismes d'approbation coexistent donc déjà dans le frontend sans articulation documentée.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC100W-06 ; lecture directe de `src/services/workflow.service.ts` (aucune fonction de création) et croisement avec `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`/`docs/PHASE_07_FINANCE_CREDIT.md` (mécanismes d'approbation déjà livrés hors `workflowService`).
- **Décision proposée** : **Question à trancher : le système `workflowService` générique doit-il remplacer à terme les approbations ad hoc par domaine, ou coexister durablement avec elles pour des cas différents ?** Cette clarification est un préalable à toute implémentation de la création de demandes — sans elle, choisir où et comment brancher un formulaire de création serait arbitraire.
- **Statut** : **DECISION REQUIRED.**

### 5. Catégories de documents dynamiques (UC90-01/03/04)

- **Problème** : « Créer/Modifier/Supprimer une catégorie » sont des UC confirmés, mais `DocumentCategory` est une union TypeScript fixe (`idDocument/contract/statement/minutes/report/other`), pas un catalogue par tenant — même famille de problème que le catalogue de postes (`PositionRole`) déjà documentée en Phase 6.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC90-01/03/04 ; lecture directe du type `DocumentCategory`.
- **Statut** : **DECISION REQUIRED** — nécessite de spécifier si les catégories doivent devenir un catalogue configurable par tenant avant toute UI de gestion.

---

## Hors périmètre (rappel, pas une nouvelle décision)

- **Validation/rejet/signature électronique/versioning de document** (UC90-14 à 19) — aucun champ de statut d'approbation sur `DocumentRecord`, et `WorkflowRequest.entityType` n'inclut pas `'document'`. Non implémenté ; pas assez homogène pour une décision unique actionnable, simplement recensé dans la matrice de couverture du rapport.
- **Envoyer une notification** (UC02-15) — `notificationService` n'a pas de fonction de création, et l'écran nécessiterait un sélecteur de destinataires réels relevant du domaine Access & Security (utilisateurs système), explicitement hors périmètre de cette phase. Non implémenté, noté dans la matrice de couverture — ce n'est pas une ambiguïté au sens strict, seulement une dépendance hors périmètre.

---

## Synthèse

3 sujets **BLOQUANT** (délégation non sourcée, partage de document sans permission, restauration/archivage sans modèle de statut), 2 sujets **DECISION REQUIRED** touchant à l'architecture (coexistence des deux mécanismes d'approbation, catalogue de catégories dynamique). Aucun n'a été résolu par supposition.
