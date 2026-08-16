# TANZEN ENTERPRISE — Phase 9 : Operations / Workflows / Documents / Notifications

**Statut : implémentation réelle.** Périmètre strictement limité aux domaines **Operations, Workflows, Documents, Notifications**. Aucune dépendance technique hors périmètre n'a été nécessaire cette fois (contrairement aux phases précédentes) — tous les fichiers modifiés appartiennent à ces quatre domaines. Aucun workflow, statut, permission, règle d'approbation ou relation métier n'a été inventé — les sujets concernés sont documentés dans `docs/PHASE_09_DECISIONS_A_VALIDER.md`, pas implémentés.

## Méthodologie

Lecture intégrale avant modification : `src/features/operations/operations-module.tsx` (361 lignes), `src/services/{workflow,document,notification}.service.ts` en entier, `src/mocks/operations/*.ts`, le catalogue RBAC, croisée avec les blocs UC02/UC80/UC90/UC100W/UCX1/UCX2/UCX3/UCX5 de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` et les sections Documents/Meetings-Attendances de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`. Plan validé en mode plan avant implémentation.

---

## 1. Use Cases traités

| UC | Description | Statut avant | Statut après |
|---|---|---|---|
| UC100W-06 à 12 (lecture) | Consulter demandes/historique, valider/rejeter/retourner | IMPLEMENTED | inchangé |
| — (§3 mandat) | Approbateur déterminé par permission réelle (`listMyApprovals`) | IMPLEMENTED | inchangé, confirmé conforme |
| UC100W-10 | Annuler une demande | NOT IMPLEMENTED (statut `cancelled` prévu dans le type mais aucune action) | **IMPLEMENTED** (limite documentée — voir §9) |
| — | Délégation d'approbation | NOT IMPLEMENTED (bouton décoratif) | **BLOCKED** (`docs/PHASE_09_DECISIONS_A_VALIDER.md` §1 — aucun UC ne la nomme) |
| UC100W-06 | Soumettre une nouvelle demande | NOT IMPLEMENTED | **DECISION REQUIRED** (§4 décisions — deux mécanismes d'approbation coexistent déjà) |
| UC90-13 | Téléverser un document | NOT IMPLEMENTED (formulaire ne persistait rien) | **IMPLEMENTED** |
| UC90-08 | Supprimer un document | NOT IMPLEMENTED (`documents.delete` inutilisé) | **IMPLEMENTED** |
| UC90-06 | Partager un document | PARTIAL (lecture seule) | **BLOCKED** (§2 décisions — pas de permission) |
| UC90-07, UC90-09 | Restaurer / Archiver un document | NOT IMPLEMENTED | **BLOCKED** (§3 décisions — pas de statut) |
| UC90-01/03/04 | Gérer les catégories de documents | NOT IMPLEMENTED | **DECISION REQUIRED** (§5 décisions) |
| UC90-10/11/20/21 | Consulter/télécharger/rechercher/filtrer un document | IMPLEMENTED | inchangé |
| UC90-14 à 19 | Versioning, soumission, validation, rejet, signature électronique | NOT IMPLEMENTED | **NOT IMPLEMENTED** (aucun modèle de statut d'approbation sur `DocumentRecord`) |
| UC02-12/13/14, UCX1-13, UCX2-19 | Réunions, présences | NOT IMPLEMENTED | **OUT OF SCOPE** (aucune route/service Operations ne les couvre ; le seul UI Réunions existant vit sous Gouvernance, déjà traité Phase 6) |
| UC02-15 | Envoyer une notification | NOT IMPLEMENTED | **NOT IMPLEMENTED** (dépendrait du domaine Access & Security, hors périmètre) |
| UC02-16, UC80-03 | Consulter les notifications, gérer les notifications (lecture membre) | IMPLEMENTED | inchangé |
| — (§9 mandat) | `markAsRead` protégé par `tenantId` ET `userId` | IMPLEMENTED | inchangé, confirmé conforme |
| UC80-01/02/04/05 | Journaux d'envoi, modèles, annonces, préférences | NOT IMPLEMENTED | **OUT OF SCOPE** (aucune trace dans le code, pas de source suffisante pour juger de la priorité dans cette phase) |
| UC02-20/21/22, UC10-05 | Export, tableaux de bord, rapports | NOT IMPLEMENTED (Operations) | **OUT OF SCOPE** (le tableau de bord principal vit sous `/dashboard`, hors du module Operations, déjà existant et non retouché) |

## 2. Classes

| Classe | Domaine | Frontend existant | Modifié | Service | Tenant scope | Notes |
|---|---|---|---|---|---|---|
| `WorkflowDefinition` | Workflows | type + liste (lecture) | — | `workflowService` | direct (`tenantId`) | pas de classe `WorkflowCondition` créée — aucun UI ne l'exerce (UC100W-05 non implémenté, pas de gap signalé) |
| `WorkflowRequest`/`WorkflowStep` | Workflows | type + liste + détail + actions | annulation ajoutée | `workflowService` | direct (`tenantId`) | absente de tout diagramme de classes (confirmé Phase 5 §5) — cohérent, aucune classe inventée pour combler ce vide |
| `WorkflowDelegation` | Workflows | type + liste (lecture) | — | `workflowService` | direct (`tenantId`) | création BLOQUÉE (§1 décisions) |
| `Document` (`DocumentRecord`) | Documents | type + liste + détail + upload (décoratif) | création + suppression réelles | `documentService` | direct (`tenantId`) | seule classe du périmètre dessinée sur un diagramme (`DC_Gouvernance_et_Documents`) |
| `Notification` | Notifications | type + liste + marquage lu | — | `notificationService` | direct (`tenantId` + `userId` simultanés) | conforme au mandat, rien à modifier |

## 3. Routes

Aucune nouvelle route. `/operations/workflows`, `/operations/workflows/:id`, `/operations/notifications`, `/operations/documents` déjà routées et protégées par le système de navigation existant (aucun `window.location.pathname`/`pathname.split()` introduit ou préexistant).

## 4. Pages

`DocumentsPage` (upload réel + suppression), `WorkflowDetail` (action d'annulation).

## 5. Components

Aucun nouveau fichier composant. Nouveau composant interne `EntityPicker` (dans `operations-module.tsx`, non exporté) qui charge dynamiquement la vraie liste d'entités correspondant au type sélectionné (`organizationService.listMembers`, `creditService.listLoans`, `tontinesService.listTontines`/`listCyclesByTontine`, `organizationService.listAssemblies`) — jamais un `entityId` inventé.

## 6. Services

`src/services/document.service.ts` : `create` (pousse un `DocumentRecord`, `shared: false` par défaut, `uploadedAt` = date du jour), `remove` (suppression définitive, tenant-scopée). `src/services/workflow.service.ts` : `cancelRequest` (même garde que `submitAction` — n'agit que sur une étape `pending`, statut cible `cancelled` déjà dans `WorkflowStatus`).

## 7. Queries

Réutilisation stricte des `queryKeys.operations.*`/`queryKeys.members.*`/`queryKeys.credit.*`/`queryKeys.tontines.*`/`queryKeys.governance.*` déjà définies — aucune nouvelle clé.

## 8. Mutations

`useMockMutation` pour la création/suppression de documents (invalidation de `queryKeys.operations.documents`). L'annulation de demande réutilise le `useMutation` déjà en place dans `WorkflowDetail` (mutationFn étendue pour brancher vers `cancelRequest` quand l'action est `'cancel'`), sans dupliquer le mécanisme d'invalidation existant.

## 9. Workflows

`listMyApprovals` détermine déjà l'approbateur par permission réelle (`userPermissions.includes(step.approverPermission)`), confirmé conforme au mandat — rien à corriger. **Annulation de demande (UC100W-10)** : le Use Case cite deux acteurs (« Administrateur Tenant, Membre »), mais `WorkflowRequest.requestedBy` n'est qu'un libellé d'affichage (`string`), pas un lien vers `Users.id` — impossible de déterminer fiablement si l'utilisateur courant *est* le demandeur sans inventer cette relation. L'action a donc été gardée par la même `step.approverPermission` que Approuver/Rejeter/Retourner, couvrant le cas « Administrateur Tenant » ; l'auto-annulation par le demandeur lui-même reste non couverte et documentée comme telle, pas simulée silencieusement.

## 10. Documents

Upload réécrit pour lire les propriétés réelles du fichier choisi (`File.name`/`File.type`/taille arrondie en Ko) au lieu d'un nom saisi à la main en doublon de l'input fichier (bug de conception du formulaire précédent). Le sélecteur d'entité liée charge la vraie liste d'entités du tenant courant selon le type choisi (membre, prêt, tontine, cycle — sélection en deux temps tontine puis cycle —, assemblée), garantissant un `entityId`/`entityLabel` réels. Suppression définitive, tenant-scopée côté service (`documents.tenantId === tenantId` vérifié avant toute suppression).

## 11. Notifications

Aucune modification — `markAsRead`/`markAllAsRead` vérifient déjà simultanément `tenantId` et `userId`, conforme au mandat (§9). Envoi de notification (UC02-15) non implémenté — nécessiterait un sélecteur d'utilisateurs réels du domaine Access & Security, hors périmètre de cette phase (noté dans la matrice §1, pas dans les décisions car ce n'est pas une ambiguïté mais une dépendance hors périmètre).

## 12. RBAC

Aucune permission inventée. `documents.create` (déjà utilisé, upload désormais réellement fonctionnel), `documents.delete` (existait dans le catalogue, jamais utilisé avant cette phase — désormais câblé). L'annulation de demande réutilise `step.approverPermission` (aucune permission dédiée créée). Aucune comparaison directe de rôle nulle part.

## 13. Tenant isolation

`documentService`/`workflowService` valident déjà le tenant avant toute lecture/écriture (`getTenantScoped`, ou filtre direct `tenantId` pour `remove`). Les nouvelles mutations suivent ce pattern à l'identique.

**Vérification directe en environnement** (`npm run dev`, headless Chrome + CDP) :
1. Upload d'un fichier réel (`test-upload.txt`, injecté via `DOM.setFileInputFiles`, aucune saisie manuelle de métadonnées) lié à un membre réel du tenant courant → nouvelle ligne `test-upload.txt · Fatou Ndiaye · Contrat · Membre · 1 Ko` confirmée dans le tableau.
2. Suppression du document créé → ligne disparue (7 → 6 lignes), confirmée.
3. Bascule vers T-002 (`localStorage['tanzen-tenant-id']`) : la page Documents ne montre que les 3 documents propres à T-002 (`DOC-007/008/009`) — recherche exhaustive de « Fatou Ndiaye » (membre T-001) dans la page : absente.

## 14. i18n

12 nouvelles clés (FR + EN) dans la section `operations` : `fieldRequired`, `selectEntity`, `selectFile`, `documentCreated`, `deleteDocument`, `deleteDocumentConfirm`, `documentDeleted`, `cancelRequest`, `cancelRequestConfirm`, `requestCancelled`. Le reste des libellés nécessaires (statuts, types, catégories) existait déjà, pré-provisionné.

## 15. Themes

Uniquement les tokens shadcn déjà utilisés dans le module — aucun style codé en dur.

## 16. Accessibility

Chaque nouveau champ a un `<Label htmlFor>` associé (input fichier compris, via un `<label>` cliquable englobant). Le bouton de suppression dans la table porte un `aria-label` explicite (`deleteDocument`). `ConfirmDialog` conserve `role="dialog" aria-modal="true"`.

## 17. Responsive

Le sélecteur d'entité « cycle » (tontine + cycle) utilise `grid sm:grid-cols-2`, cohérent avec le pattern déjà établi dans les phases précédentes pour les paires de champs courtes ; aucun nouveau composant de mise en page.

## 18. Cross-tenant tests

Voir §13. Documents testés en direct (création + suppression + bascule de tenant). Workflow requests héritent de la même garantie structurelle (`getTenantScoped`, déjà éprouvée dans `submitAction` et répliquée à l'identique dans `cancelRequest`) — non re-testée en live par souci de temps, la garantie venant du code partagé déjà vérifié en Phases 6 à 8, pas d'une supposition.

## 19. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — succès (7,1 s), même avertissement pré-existant sur la taille de chunk.

## 20. Missing / Partial Use Cases

Voir colonne « Statut après » du tableau §1. BLOCKED (3 : délégation, partage de document, restauration/archivage) ; DECISION REQUIRED (2 : soumission de nouvelle demande, catégories dynamiques) ; NOT IMPLEMENTED sans décision dédiée (versioning/validation/signature de document, envoi de notification — hétérogènes ou hors périmètre) ; OUT OF SCOPE (réunions/présences, journaux/modèles/annonces/préférences de notification, export/rapports).

## 21. Decisions required

5 sujets consolidés dans `docs/PHASE_09_DECISIONS_A_VALIDER.md` : délégation d'approbation non sourcée, permission de partage de document manquante, statut d'archivage de document non spécifié, coexistence des deux mécanismes d'approbation (générique vs ad hoc par domaine), catalogue de catégories de documents dynamique.

## 22. Fichiers modifiés

- `src/services/document.service.ts` — `create`, `remove`.
- `src/services/workflow.service.ts` — `cancelRequest`.
- `src/features/operations/operations-module.tsx` — `EntityPicker` (nouveau), `DocumentUploadForm` réécrit, `DocumentsPage` (mutations create/delete, action de suppression table + panneau de prévisualisation), `WorkflowDetail` (action d'annulation).
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — nouvelles clés dans la section `operations`.
- `docs/PHASE_09_DECISIONS_A_VALIDER.md`, `docs/PHASE_09_OPERATIONS_WORKFLOWS_DOCUMENTS.md` — nouveaux.

Aucun autre fichier (Finance, Credit, Tontines, Governance, Access, Audit, Settings) n'a été modifié.

---

*Fin du rapport Phase 9. Ne pas commencer la Phase 10.*
