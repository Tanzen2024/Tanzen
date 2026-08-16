# TANZEN — Audit Phase 01 (complet)

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié pour produire ce rapport. Ce document est le seul fichier créé par cette mission. Les diagrammes et documents sources font autorité ; le code frontend existant n'est ni corrigé ni jugé « faux » ici — il est inventorié tel quel, avec ses écarts.

Étiquettes utilisées : **EXISTANT** (présent et cohérent) · **PARTIEL** (présent mais incomplet, ou présent à un niveau de source et absent à un autre) · **ABSENT** (aucune trace) · **CONFLIT** (deux sources — ou une source et le code — se contredisent) · **À VALIDER** (décision métier ou d'architecture requise avant de trancher).

Une passe partielle a été réalisée plus tôt dans la session (5/21 Use Cases lus, résumé publié en artifact). Le présent document ré-examine l'intégralité des sources listées ci-dessous et ne recopie aucune conclusion sans re-vérification directe.

**Note sur le périmètre analysé** : les sources documentaires (Use Cases, diagrammes de classes, diagrammes de séquence, documents de décision) proviennent de `tanzen-frontend-claude/docs` — identiques (mêmes 21 Use Cases, mêmes 14 diagrammes de classes/séquence, vérifié par comparaison de tailles de fichiers) à celles présentes dans `tanzen-frontend/docs`. Le code frontend comparé (`src/`) est celui de `tanzen-frontend-claude/src`, conformément au périmètre demandé pour cette mission. Ce rapport est déposé dans `tanzen-frontend/docs/` pour rester visible dans l'espace de travail ouvert.

---

## 1. Inventaire

### 1.1 Sources documentaires lues intégralement

| Type | Nombre | Détail |
|---|---|---|
| Diagrammes Use Case (PNG) | **21/21** | UC-00, UC01–UC03, UC10, UC20, UC30, UC-40, UC50, UC-60, UC70, UC-80, UC90, UC-100 (×2 : Integration Core et Workflow Core), UC-110, UCX1–UCX3, UC-X4, UC-X5 |
| Diagrammes de classes (PNG) | **7/7** | Tontines · Administration_et_Multi-tenant · Membres_et_Bureau-Exécutif · Gouvernance_et_Documents · Caisses_et_Cotisations · Crédit · Réunions_et_présences |
| Diagrammes de séquence (PNG) | **7/7** | DSEC Login & Tenant-Resolution · DSEQ Achats_tontines · DSEQ CLOSURE ANNUELLE · DSEQ PROSPECT · DSEQ PRÊT_REMBOURSEMENT · DSEQ REDISTRIBUTION_DES_INTÉRÊTS · DSEQ TONTINE_DRAW_ENGINE |
| Diagramme d'architecture globale | **1/1** | Architecture_globale_TANZEN.png (vue de synthèse par module, avec 2 annotations manuscrites « Fusionnés ») |
| Documents de décision/analyse Markdown | **15/15** | TANZEN_DECISION_MASTER, _01_FINANCE_LOANS, _02_REPORTING, _03_DICTIONARY, _04_API_SECURITY, _05_FUTURE, CROSS_CUTTING_DECISIONS, FRONTEND_DECISIONS, API_CONVENTION, GLOBAL_CLARIFICATION_ANALYSIS, REPORTING_ANALYSIS, DICTIONARY_V2_CHANGE_PLAN, TONTINE_CYCLE_DECISION, TONTINE_CYCLE_FINAL_ANALYSIS, TONTINE_CYCLE_PROPOSAL |
| Fichiers sources bruts non ré-extraits ici | 2 | `dictionnaire_donnees.xlsx` et les 2 `.docx` — leur contenu est déjà exhaustivement extrait et cité dans les 15 documents de décision ci-dessus ; non ré-ouverts directement pour éviter une double extraction, les décisions citant systématiquement fiche/SF d'origine |

### 1.2 Frontend (`src/`)

| Catégorie | Nombre | Détail |
|---|---|---|
| Domaines `features/` construits | 7 | `identity`, `member`, `tontine`, `finance`, `loan`, `workflow`, `notification` |
| Pages construites (`BUILT_ROUTES`) | 12 | `/administration/users`, `/administration/roles`, `/administration/modules`, `/members`, `/meetings`, `/tontines`, `/tontines/cycles`, `/finance/accounts`, `/finance/transactions`, `/loans`, `/workflows`, `/notifications` |
| Entrées de navigation totales (`nav-items.ts`) | 17 | dont 2 marquées `status: "soon"` (`/finance/budgets`, `/reporting/kpi`) et 3 pointant vers des `PlaceholderPage` (`/dashboard`, `/reporting`, `/administration/audit`) |
| Fichiers de types (`types.ts`) | 6 | identity, member, tontine, loan, finance, notification, + workflow (7) |
| Services API (`api/*.ts`) | ~20 fichiers | 1 à 3 par domaine construit |
| Mocks (`mocks/*.mocks.ts`) | 8 | financeCore, identity, identityAdmin, loanCore, memberCore, notificationCore, tontineCore, workflowCore, + `mockCrudStore.ts` (fabrique générique) |
| Stores Zustand | 4 | `authStore`, `permissionStore`, `tenantStore`, `toastStore` (+ `uiStore`) |
| Domaines `features/` **absents** | 5 (sur 12 domaines techniques listés dans `TANZEN_FRONTEND_DECISIONS.md` §2) | `platform`, `audit`, `integration`, `reporting`, `administration` (au sens Exploitation) — et implicitement `governance` (jamais listé nulle part dans le code, absent aussi des 12 domaines techniques nommés) |

### 1.3 Entités recensées (toutes sources confondues, dédupliquées par nom logique)

**≈ 62 entités/tables distinctes** apparaissent à travers les 7 diagrammes de classes détaillés (32), le diagramme d'architecture globale (+13 nouvelles), les encarts « Tables concernées » des 21 Use Cases (+35 nouvelles, dont beaucoup ne recoupent aucun diagramme de classes), et les 6 tables citées uniquement dans les documents de décision (`budgets`, `dashboards`, etc., déjà `GAP` confirmé). Le détail est en §3.

---

## 2. Cartographie (matrice de traçabilité)

*Colonnes : SOURCE (diagramme/doc) → MODULE → ENTITÉS PRINCIPALES → USE CASES → WORKFLOWS (séquence) → DIAGRAMME DE CLASSES → DIAGRAMME DE SÉQUENCE → ROUTE FRONTEND → TYPE FRONTEND → SERVICE FRONTEND.*

| Module | Entités (classes) | Use Cases | Séquences | Classes (DC) | Séquences (DSEQ) | Route(s) frontend | Type(s) frontend | Service(s) frontend |
|---|---|---|---|---|---|---|---|---|
| Platform Core | Tenant, Users, Plans, Subscriptions, Payments, Backups, Audit_logs | UC-00, UC01, UC-10 | PROSPECT | DC_Administration_et_Multi-tenant | DSEQ_PROSPECT | *(aucune — `features/platform/` absent)* | *(aucun)* | *(aucun)* |
| Identity Core | Users, Roles, Permissions, Modules, Role_permissions, Users_roles | UC-00, UC-10, UC20 | DSEC Login | *(inclus dans Administration_et_Multi-tenant, partiel : `role` en colonne directe, pas de tables roles/permissions visibles)* | DSEC_Login_&_Tenant-Resolution | `/administration/users`, `/administration/roles`, `/administration/modules` | `identity/types.ts` | `userService`, `roleService`, `moduleService`, `permissionCatalogService` |
| Member Core | Member, Meeting, Attendance | UC-00, UC02, UCX1 | *(aucune séquence dédiée)* | DC_Réunions_et_présences (Member/Meeting/Attendance), Member présent aussi dans Tontines/Gouvernance/Crédit/Caisses | *(aucune)* | `/members`, `/meetings` | `member/types.ts` | `memberService`, `meetingService`, `attendanceService` |
| Gouvernance (Bureau Exécutif) | Position, BoardMember, Mandate, FiscalYear | UC30, UC-X5 | *(aucune)* | DC_Membres_et_Bureau-Exécutif | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Gouvernance (Assemblées/Votes/Documents) | General_assemblies, Votes, Vote_options, Member_votes, Documents | UC30, UC90, UC-X5 | *(aucune)* | DC_Gouvernance_et_Documents | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Tontine Core | Tontine, TontineCycle, CycleMember, TontineDraw, TontineBid, DrawWinner | UC-40, UCX2 | DSEQ_Achats_tontines, DSEQ_TONTINE_DRAW_ENGINE | DC_Tontines | idem | `/tontines`, `/tontines/cycles` | `tontine/types.ts` | `tontineService`, `cycleService`, `cycleMemberService` |
| Tontine Core — Positions/Paiements | TontinePosition, PositionPayment | UC-40 (achat), UCX2 | DSEQ_Achats_tontines | **ABSENT du DC détaillé** (présent seulement dans Architecture_globale) | DSEQ_Achats_tontines | **ABSENT** | **ABSENT** | **ABSENT** |
| Finance/Accounting Core | Account, Member_account, Contribution_rule, Transaction, Financial_category | UC02, UC50, UC-X4 | DSEQ_CLOSURE_ANNUELLE, DSEQ_REDISTRIBUTION | DC_Caisses_et_Cotisations | idem | `/finance/accounts`, `/finance/transactions` | `finance/types.ts` | `accountService`, `memberAccountService`, `transactionService` |
| Finance — comptabilité en partie double | journals, transaction_lines, account_balances | UC-X4 | DSEQ_CLOSURE_ANNUELLE | **ABSENT de tout DC** | idem | **ABSENT** | **ABSENT** | **ABSENT** |
| Credit Core | Loan_policy, Loan, Repayment | UC-60, UCX3 | DSEQ_PRÊT_REMBOURSEMENT | DC_Crédit | idem | `/loans` | `loan/types.ts` | `loanService`, `repaymentService` |
| Credit Core — Garanties | LoanGuarantor | UC-60 (« Tables concernées » cite `loan_guarantors`) | *(aucune séquence ne montre de garant)* | **ABSENT du DC_Crédit** | **ABSENT** | `/loans` (dialogue intégré) | `loan/types.ts` (`LoanGuarantor`) | `loanGuarantorService` |
| Risk & Penalty Core | Penalty (+ règles de risque) | UC70, UCX3 | *(aucune)* | **ABSENT de tout DC** (cité seulement dans Architecture_globale sous Credit Core) | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Workflow Core | Workflow, WorkflowStep, WorkflowRequest, WorkflowAction, WorkflowDelegation, WorkflowCondition | UC-100 (Workflow Core) | *(aucune séquence dédiée)* | **ABSENT de tout DC** (uniquement documenté en spec technique) | *(aucune)* | `/workflows` | `workflow/types.ts` | `workflowService`, `workflowRequestService`, `workflowActionService`, `workflowStepService` |
| Communication Core | Notification, Announcement, NotificationTemplate, NotificationPreference | UC-80 | *(aucune)* | **ABSENT de tout DC** | *(aucune)* | `/notifications` | `notification/types.ts` | `notificationService` |
| Document Core | Document, catégories, versions, signatures | UC90 | *(aucune)* | DC_Gouvernance_et_Documents (Documents seul) | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Integration Core | api_clients, api_tokens, webhooks, sync_jobs, integration_logs | UC-100 (Integration Core) | *(aucune)* | **ABSENT** | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Infrastructure/Exploitation | activity_logs, scheduled_jobs, job_executions, imports, exports, system_settings | UC03, UC-110 | *(aucune)* | **ABSENT** | *(aucune)* | **ABSENT** | **ABSENT** | **ABSENT** |
| Reporting & Analytics | *(aucune table)* | UC02 (volet Reporting) | *(aucune)* | **ABSENT** | *(aucune)* | `/reporting` (placeholder), `/reporting/kpi` (soon) | **ABSENT** | **ABSENT** |

---

## 3. Entités

### 3.1 Entités confirmées par au moins un diagramme de classes détaillé (32)

Tenant/Tenants · Tontine · TontineCycle · CycleMember · Member/Members · TontineDraw · TontineBid · DrawWinner · Users · Plans · Subscriptions · Payments · Backups · Audit_logs · Position · BoardMember · Mandate · FiscalYear · Documents · General_assemblies · Votes · Vote_options (mal étiqueté « VARCHAR(255) » dans le rendu du PNG Gouvernance, confirmé par son nom réel dans Architecture_globale et UC-X5) · Member_votes · Accounts · Member_accounts · Contribution_rules · Transactions · Financial_categories · Loan_policies · Loans · Repayments · Meetings · Attendances.

Statut : **EXISTANT** pour l'ensemble — toutes confirmées par un diagramme technique précis, avec colonnes/types/contraintes CHECK détaillés.

### 3.2 Entités visibles uniquement dans le diagramme d'architecture globale (13, absentes des 7 DC détaillés)

| Entité | Domaine (Architecture_globale) | Statut |
|---|---|---|
| Tontine_members | Tontine Core | **PARTIEL** — probablement = `CycleMember`, nommage différent |
| Tontine_contributions | Tontine Core | **PARTIEL** — cité aussi dans UC-40 « Tables concernées », absent de DC_Tontines |
| Tontine_draw_engine | Tontine Core | **PARTIEL** — fusionné avec `TontineDraws` selon l'annotation manuscrite « Fusionnés » |
| Tontine_positions | Tontine Core | **CONFLIT** — pivot central de DSEQ_Achats_tontines et DSEQ_TONTINE_DRAW_ENGINE, absent de DC_Tontines |
| Position_payments | Finance Core | **CONFLIT** — idem, `status = PAID` visible en séquence, absent de DC_Caisses_et_Cotisations |
| Profit_distribution | Finance Core | **PARTIEL** — cité aussi comme `profit_distributions` dans UC-40, absent de tout DC |
| Guarantors | Credit Core | **CONFLIT** — nommé `loan_guarantors` dans UC-60 et implémenté en frontend, absent de DC_Crédit |
| Penalties | Credit Core (ici) vs Risk & Penalty Core (UC-70) | **CONFLIT** de rattachement en plus d'être absent de tout DC |
| Reporting Engine | Cross-Cutting Services | **ABSENT** — service conceptuel, aucune table |
| File Storage | Cross-Cutting Services | **ABSENT** — service conceptuel, aucune table |
| Sync Engine | Cross-Cutting Services | **ABSENT** — service conceptuel, aucune table |
| Audit Service | Cross-Cutting Services | **PARTIEL** — le service est conceptuel mais `audit_logs` existe bien dans DC_Administration |
| Notifications (SMS/EMAIL/**WHATSAPP**) | Cross-Cutting Services | **CONFLIT** — WhatsApp cité explicitement dans le libellé du bloc, absent des enums `channel` (§9) |

### 3.3 Entités citées uniquement dans les encarts « Tables concernées » des Use Cases (absentes de tout diagramme de classes ET de l'architecture globale)

| Domaine UC | Tables citées, absentes ailleurs |
|---|---|
| UC-40 Tontine Core | `cycle_closures`, `profit_distributions` |
| UC-60 Credit Core | `loan_disbursements`, `loan_installments`, `loan_interest_accruals`, `loan_penalties` (en plus de `loan_guarantors`, §3.2) |
| UC-80 Communication Core | `notification_templates`, `notification_preferences`, `notification_logs`, `notification_settings`, `email_queue`, `sms_queue`, `push_queue` (`announcements`/`notifications` seuls recoupent un domaine ailleurs documenté) |
| UC-100 Integration Core | `api_clients`, `api_tokens`, `webhooks`, `sync_jobs`, `integration_logs` |
| UC-110 Infrastructure Core | `activity_logs`, `scheduled_jobs`, `job_executions`, `imports`, `exports`, `system_settings` (`audit_logs`/`notification_logs`/`backups` seuls recoupent un domaine ailleurs documenté) |
| UC-X4 Cycle Comptable | `journals`, `transaction_lines`, `account_balances`, `fiscal_years` (les 3 premières : aucune trace ailleurs — comptabilité en partie double non modélisée) |
| UC-X5 Cycle de Gouvernance | `agenda_items`, `meeting_minutes` (en plus de `meetings`/`general_assemblies`/`attendances`/`votes`/`vote_options`/`member_votes`/`announcements`/`notifications`, déjà connus) |

Statut de toutes ces tables : **ABSENT** — ni diagramme de classes, ni dictionnaire de données (`dictionnaire_donnees.xlsx`, tel que synthétisé par les 15 documents de décision, qui ne recensent que 59 tables) ne les documente. Elles apparaissent uniquement comme intention fonctionnelle dans les Use Cases.

### 3.4 Entités frontend sans support diagramme confirmé

| Entité frontend | Fichier | Statut |
|---|---|---|
| `LoanGuarantor` | `features/loan/types.ts`, `loanGuarantorService.ts`, `LoanGuarantorsDialog.tsx` | **PARTIEL** — nommé dans UC-60 (`loan_guarantors`), absent de DC_Crédit et de toute séquence |
| `IdentityPermission`/`IdentityRole`/`IdentityModule` | `features/identity/types.ts` | **EXISTANT** — confirmé par DC_Administration (`USERS.role` en colonne) **et** en tension avec le modèle RBAC dynamique attendu (voir §9, C-09) |
| `Cycle` (statut `PROVISIONAL`) | `features/tontine/types.ts` | **CONFLIT** assumé par le code lui-même (commentaire en tête de fichier) — voir §9 |

---

## 4. Relations

Relations structurellement confirmées par au moins un diagramme de classes ou de séquence :

```
Tenant 1──N Tontine 1──N TontineCycle 1──N CycleMember N──1 Member
                                    │
                                    ├──N TontineDraw N──N DrawWinner
                                    └──N TontineBid

Tenant 1──N Member 1──N Member_account N──1 Account 1──N Transaction N──1 Financial_category
                                                              │
Tenant 1──N Account 1──N Contribution_rule                    │
                                                                │
Tenant 1──N Member 1──N Loan N──1 Account, Loan N──N Repayment  (via Loan)
Tenant 1──N Account 1──N Loan_policy

Tenant 1──N Member 1──N BoardMember N──1 Position, BoardMember 1──N Mandate N──1 FiscalYear

Tenant 1──N Documents
Tenant 1──N General_assemblies 1──N Votes 1──N Vote_options, Votes N──N Member_votes N──1 Member

Tenant 1──N Meeting 1──N Attendance N──1 Member

Tenant 1──N Users, 1──N Plans──1──N Subscriptions 1──N Payments, 1──N Backups, 1──N Audit_logs
```

Relations **absentes/non modélisées** malgré leur nécessité fonctionnelle évidente :
- `TontinePosition`/`PositionPayment` → aucun FK visible dans un diagramme de classes (uniquement en séquence).
- `LoanGuarantor` → `Loan`/`Member` : relation nommée en UC uniquement, jamais dessinée.
- `Penalty` → aucune table source de rattachement stable (Credit Core dans Architecture_globale, Risk & Penalty Core en UC-70 — deux rattachements concurrents, cf. §9 C-11).
- Toute relation impliquant les ~35 tables du §3.3 : par construction, aucune (elles n'existent dans aucun schéma).
- Relation `tenant_id` sur les entités frontend : **absente** — voir §9 C-12 (multi-tenant).

---

## 5. Use Cases

| ID | Titre | Acteurs | Constat principal |
|---|---|---|---|
| UC-00 | TANZEN Platform (vue globale) | Super Admin, Membre, Admin Tenant | 11 domaines fonctionnels nommés : Platform, Governance, Tontine, Communication, Document, Credit, Accounting, Risk & Penalty, Identity, Infrastructure, Integration Core |
| UC-01 | Platform Package | Administrateur Tenant, Super Administrateur, Service Email/SMS, Service de Paiement, Planificateur | Tenants, Plans, Abonnements, Utilisateurs plateforme, Monitoring |
| UC-02 | Business Package | Administrateur Tenant, Membre | Prêts, Membres/Familles/Groupes, Tontines, Réunions, Communication, Finance, Reporting |
| UC-03 | Infrastructure Package | Utilisateur, Planificateur, Service Monitoring, Admin Tenant, Super Admin, services externes | Authentification, Documentaire, Tâches planifiées, Surveillance, Journalisation, Sauvegarde, Cache |
| UC-10 | Platform Core | Super Admin, Utilisateur, Admin Tenant | Organisations, Modules, Authentification, Abonnements, Rôles & permissions |
| UC-20 | Identity Core | Utilisateur, Administrateur Tenant, Super Administrateur | Authentification, Profil, Utilisateurs, Rôles, Permissions |
| UC-30 | Governance Core | Super Administrateur, Administrateur Tenant, Membre | Bureau Exécutif, Assemblées Générales, Exercice, Organisation, **Postes, Mandats, Comités, Statuts & Règlement** |
| UC-40 | Tontine Core | Admin Tenant, Membre | Cycles/cotisations/tirages **manuels en V1** ; encart « Tables concernées » cite `cycle_closures`/`profit_distributions` (absentes de tout DC) |
| UC50 | Accounting Core | Administrateur Tenant, **Trésorier, Commissaire aux Comptes, Président** | États comptables, grand livre, journal — acteurs nommés directement (cf. §9 C-08) |
| UC-60 | Credit Core | Admin Tenant, Membre | 8 tables citées, dont 5 absentes de tout diagramme de classes |
| UC70 | Risk & Penalty Core | Administrateur Tenant, Trésorier, Président, Commissaire aux Comptes, Planificateur | Règles de pénalité, Sanctions, Gestion du risque (score), Retards détectés automatiquement |
| UC-80 | Communication Core | Système TANZEN, Admin Tenant, Membre | 9 tables citées, cohérentes avec Notification Core sauf absence totale de WhatsApp |
| UC90 | Document Core | Administrateur Tenant, Trésorier, **Secrétaire**, Président, Membre | Classification, Partage, **Versioning, Signature électronique** — aucun champ de version/signature dans `Documents` (DC) |
| UC-100 (Integration) | Integration Core | Admin Tenant, Service Externe, Système TANZEN | 8 tables citées, aucune dans le dictionnaire hormis `sync_jobs` |
| UC-100 (Workflow) | Workflow Core | Administrateur Tenant, Membre | Cohérent avec la spec technique déjà exhaustivement documentée (40 endpoints) |
| UC-110 | Infrastructure Core | Système TANZEN, Super Admin, Admin Tenant | 9 tables citées, 6 absentes du dictionnaire |
| UCX1 | Cycle de vie d'un membre | Candidat, Trésorier, Secrétaire, Administrateur Tenant, Président | Processus d'adhésion complet (candidature → étude → validation → compte) **sans aucune table `membership_request` nulle part** |
| UCX2 | Cycle complet d'une tontine | Admin Tenant, Trésorier, Planificateur, Président, Membre, **Secretary** (anglicisme isolé) | Ouverture, tirage, distribution des bénéfices — recoupe les tables `cycle_closures`/`profit_distributions` non modélisées |
| UCX3 | Cycle de vie d'un prêt | Membre, Trésorier, Président, **Comité de Crédit**, Planificateur | Acteur « Comité de Crédit » jamais vu ailleurs ; réutilise les 5 tables absentes de UC-60 |
| UC-X4 | Cycle Comptable | Admin Tenant, Système TANZEN | Comptabilité en partie double explicitement décrite, `journals`/`transaction_lines`/`account_balances` absentes de tout le reste du corpus |
| UC-X5 | Cycle de Gouvernance | Admin Tenant, Membre, Système TANZEN | Réunions/AG/votes centralisés, `agenda_items`/`meeting_minutes` absentes de tout DC |

**Constat transversal** : 7 des 21 diagrammes (UC-40, UC50, UC-60, UC-80, UC-100×2, UC-110, UC-X4, UC-X5 — soit en réalité 8) portent un encart « Tables concernées » qui **dépasse systématiquement** le contenu des diagrammes de classes correspondants, parfois de façon très large (UC-60 : 8 tables citées, 3 seulement recoupent un DC ; UC-110 : 9 tables citées, 3 recoupent un DC).

---

## 6. Workflows

Workflows tracés par au moins un diagramme de séquence :

1. **Login & résolution de tenant** (DSEC) — `User → Auth Service → Platform DB` (vérification credentials) + `Auth Service → Tenant Resolver → Platform DB` (config/statut du tenant) → JWT + contexte tenant retourné à l'utilisateur, `LOGIN_SUCCESS` journalisé dans `Audit Log`. **EXISTANT côté séquence, ABSENT côté frontend** (`useBootstrapSession.ts` simule la session sans passer par ce flux, et n'appelle jamais `tenantStore.setTenant`, cf. §9 C-12).
2. **Achat de position tontine** (DSEQ_Achats_tontines) — `Member → Tontine → TontinePosition → PositionPayment → Account/Transaction`, avec `status = PAID` sur `TontinePosition`. **ABSENT côté frontend** (aucun écran d'achat de position, `Tontine.isPurchasable` existe dans le type mais aucun flux d'achat n'est implémenté).
3. **Clôture annuelle** (DSEQ_CLOSURE_ANNUELLE) — `Closing Engine` orchestrant `Tenants`/`Accounts`/`Loans`/`Repayments`/`Transactions`/`AuditLog`/`Backup`/`Members`, avec calcul de redistribution. **ABSENT côté frontend** (aucun écran/service de clôture d'exercice).
4. **Prospect → Tenant actif** (DSEQ_PROSPECT) — site vitrine → création tenant (`pending`) → abonnement → paiement → activation (`active`) → journalisation. **ABSENT côté frontend** (pas de domaine `platform`).
5. **Prêt → remboursement** (DSEQ_PRÊT_REMBOURSEMENT) — `Member → Loan (validate eligibility via Loan_policies) → disburse funds → Account`, puis `Member → Repayment → update loan status`. **EXISTANT côté frontend** (`LoansPage`, `RepaymentsDialog`), sans étape de garant visible dans la séquence source elle-même (cohérent avec l'absence de `Guarantors` dans DC_Crédit).
6. **Redistribution des intérêts** (DSEQ_REDISTRIBUTION) — `Fiscal Engine` calcule les intérêts générés, répartit par membre, crédite via `Transactions`. **ABSENT côté frontend**.
7. **Moteur de tirage tontine** (DSEQ_TONTINE_DRAW_ENGINE) — `Tontine_draw_engine → Tontines → Tontine_positions (fetch paid positions) → Tontine_draws → Draw_winners (assign payout)`. **ABSENT côté frontend** (le tirage n'est pas implémenté ; `TontineDraw`/`DrawWinner` n'ont ni type ni service frontend).

Workflows documentés uniquement par les Use Cases (aucune séquence dédiée) : adhésion membre (UCX1), cycle de gouvernance complet (UC-X5), cycle comptable en partie double (UC-X4), cycle de vie du prêt élargi avec comité de crédit (UCX3).

---

## 7. Frontend existant

| Domaine | Pages | CRUD | Particularités |
|---|---|---|---|
| Identity | Users, Roles, Modules | Complet | Catalogue de permissions géré en propre onglet (`PermissionsCatalogTab`) — au-delà de ce que documente le dictionnaire (aucun catalogue fermé, cf. `TANZEN_CROSS_CUTTING_DECISIONS.md` §3) |
| Member | Members, Meetings (+ Attendance en dialogue) | Complet | Pas d'écran Bureau/Postes/Mandats (assumé hors périmètre par commentaire de code) |
| Tontine | Tontines, Cycles (+ CycleMembers en dialogue) | Complet sur le périmètre couvert | Pas de Draws/Bids/Positions/DrawWinners ; `Cycle` marqué `PROVISIONAL` dans le code lui-même |
| Finance | Accounts, Transactions (+ MemberAccounts en dialogue) | Complet sur le périmètre couvert | Pas de Budget malgré une entrée de nav `status: "soon"` |
| Loan | Loans (+ Repayments, LoanGuarantors en dialogue) | Complet | `LoanGuarantor` implémenté malgré son absence du DC_Crédit |
| Workflow | WorkflowRequests (inbox) | Lecture + actions (approve/reject/return/cancel), pas de CRUD de configuration | Cohérent avec le commentaire de code : Workflow/WorkflowStep en lecture seule assumée |
| Notification | Notifications (centre de lecture) | Lecture seule, pas de suppression | Cohérent avec l'absence de `deleted_at` sur `notifications` |

Infrastructure transverse construite : `apiClient` (fetch unique, `X-Correlation-Id`, `Authorization: Bearer`, **aucun header tenant**), `apiConfig`/`apiError`/`apiTypes`, `PermissionGate` + `usePermissionStore` (RBAC dynamique, `hasPermission`), `useTenantStore` (**jamais alimenté**), `AppShell`/`Sidebar`/`Topbar`, système de composants UI complet (`Table`, `Dialog`, `Badge`, `Tabs`, etc.), stratégie mock respectée (`MockBanner` visible dès que `USE_MOCKS` est actif, `Mock<Domaine>Service` par domaine).

---

## 8. Fonctionnalités absentes

Absences confirmées, classées par gravité fonctionnelle :

**Domaines entiers sans aucune trace dans `src/`** :
- Gouvernance (Bureau Exécutif : Position/BoardMember/Mandate/FiscalYear ; Assemblées : General_assemblies/Votes/Vote_options/Member_votes ; Documents).
- Platform Core (Tenants en tant qu'écran de gestion, Plans, Subscriptions, Payments).
- Audit (lecture du `audit_logs`, malgré une entrée de navigation `/administration/audit`).
- Reporting (malgré deux entrées de navigation, `/reporting` et `/reporting/kpi`).
- Integration Core, Infrastructure/Exploitation technique, Risk & Penalty Core (hors `LoanGuarantor`/pénalités intégrées ponctuellement au Loan Core).
- Document Core (classification, versioning, signature électronique).

**Sous-fonctions absentes à l'intérieur de domaines par ailleurs construits** :
- Tontine : achat de position, tirage, cotisations formelles (`tontine_contributions`), clôture de cycle, distribution des bénéfices.
- Finance : budgets (nav `soon`), comptabilité en partie double (journals/transaction_lines), exercices fiscaux, catégories financières en propre écran.
- Loan : moteur de calcul d'intérêts/pénalités/scoring (bloqué par absence de formule dans les sources, pas par un oubli frontend), décaissements/échéanciers en tant qu'entités propres.

**Cause de l'absence** : dans la quasi-totalité des cas documentés dans le code (commentaires de tête de fichier `types.ts`), l'absence est **volontaire et tracée** — soit parce qu'aucune table source stable n'existe (`boards`, budgets, reporting), soit parce qu'une formule métier manque (intérêts, pénalités, scoring), jamais un simple oubli de développement.

---

## 9. Conflits

### Conflits d'énumérations (frontend vs diagramme de classes)

| # | Champ | Frontend (`types.ts`) | Diagramme de classes | Gravité |
|---|---|---|---|---|
| C-01 | `Member.status` | `ACTIVE, INACTIVE, SUSPENDED, EXITED` (4) | `CHECK(active, inactive)` (2) — DC_Tontines, DC_Réunions, DC_Gouvernance | **BLOQUANT** |
| C-02 | `Meeting.status` | `PLANNED, DONE, CANCELLED, POSTPONED` | `CHECK(planned, ongoing, completed, cancelled)` — DC_Réunions | Élevé |
| C-03 | `Attendance.status` | `PRESENT, ABSENT, LATE, EXCUSED` (4, avec EXCUSED) | `CHECK(present, absent, late)` (3, sans EXCUSED) — DC_Réunions | Élevé |
| C-04 | `Tontine.status` | `ACTIVE, PAUSED, CLOSED` | `ENUM(draft, active, completed, cancelled)` — DC_Tontines | Élevé |
| C-05 | `Cycle.status` (`TontineCycle`) | `DRAFT, OPEN, SUSPENDED, CLOSED` (assumé `PROVISIONAL` par le code lui-même) | `ENUM(planned, active, completed, cancelled)` — DC_Tontines | **BLOQUANT**, déjà signalé par le code |
| C-06 | `CycleMember.status` | `ACTIVE, INACTIVE, EXITED, SUSPENDED` | `ENUM(active, withdrawn, excluded)` — DC_Tontines | Élevé |
| C-07 | `Loan.status` | `PENDING, ACTIVE, CLOSED` | `CHECK(pending, active, repaid, defaulted)` — DC_Crédit | **BLOQUANT** |
| C-08bis | `Repayment.method` | réutilise `PaymentMethod` = `CASH, MOBILE_MONEY, BANK, CARD` | `CHECK(cash, bank, mobile_money)` (sans CARD) — DC_Crédit | Moyen |
| C-09bis | `MemberAccount.role` | `OWNER, CO_OWNER, GUARANTOR, CONTRIBUTOR` | `CHECK(member, leader, treasurer, admin)` — DC_Caisses_et_Cotisations | **BLOQUANT** (ensembles disjoints) |
| C-10bis | `Transaction.type` | `INCOME, EXPENSE, TRANSFER, COTISATION, LOAN_DISBURSEMENT, LOAN_REPAYMENT` | `CHECK(income, expense, transfer, tontine, penalty, adjustment)` — DC_Caisses_et_Cotisations | **BLOQUANT** (ensembles disjoints) |
| C-11bis | `Account.accountRole`/`accountCategory` | `accountRole: STANDARD, TONTINE_PURCHASE, LOAN_FUND, SAVINGS` (champ séparé) | `account_category CHECK(tontine, savings, loan_pool, social_fund, school_fund, operational)` — un seul champ dans le DC | Moyen (mapping de champ, pas seulement de valeurs) |

### Conflits structurels (source vs source, ou source vs code)

| # | Sujet | Constat | Gravité |
|---|---|---|---|
| C-08 | **Rôles métier nommés comme acteurs** | Les documents de décision (`TANZEN_CROSS_CUTTING_DECISIONS.md` §4.1) affirment, recherche exhaustive à l'appui, que Président/Trésorier/Secrétaire n'apparaissent **jamais** comme acteur dans les 2 144 titres de la spec fonctionnelle — seulement comme exemple dans la description de `positions`. **Or les diagrammes Use Case eux-mêmes (UC50, UC70, UC90, UCX1, UCX2, UCX3) utilisent Trésorier, Président, Secrétaire et « Comité de Crédit » comme acteurs UML nommés**, de façon répétée sur 6 diagrammes différents. C'est une contradiction directe entre deux sources de même niveau (analyse textuelle de la SF vs diagrammes UML), non résolue par les documents de décision qui n'ont pas croisé les UC. | **BLOQUANT** pour la décision « ne coder aucun rôle en dur » (§4.2 de `TANZEN_FRONTEND_DECISIONS.md`) — si les UC sont pris au pied de la lettre, un catalogue de rôles nommés est bien attendu |
| C-09 | **`USERS.role` en colonne directe vs RBAC dynamique** | DC_Administration_et_Multi-tenant montre `USERS.role VARCHAR(20) CHECK(owner, admin, manager, treasurer, secretary, member)` — un rôle unique, codé en dur, par colonne directe sur `users`. Ceci coexiste dans le même schéma avec le modèle RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`) documenté ailleurs et implémenté côté frontend (`PermissionGate`, `usePermissionStore`). Les deux mécanismes ne sont pas rapprochés dans aucune source. | **BLOQUANT** — détermine si l'autorisation réelle passe par `users.role` (rôle unique, fermé, 6 valeurs) ou par le RBAC N:N déjà construit côté frontend |
| C-10 | **`tenants.organization_type` : valeurs définies dans les diagrammes, « NON DÉFINIE » selon les documents de décision** | 4 diagrammes de classes distincts (Administration, Membres, Gouvernance, Caisses, Crédit, Réunions — en réalité les 6 qui portent `Tenants`) montrent tous `CHECK(association, tontine, cooperative, church, company, community, other)`. Les documents de décision (`TANZEN_DECISION_03_DICTIONARY.md`) affirment que ces valeurs sont **non spécifiées** dans le dictionnaire. Les diagrammes de classes (dérivés du même dictionnaire) montrent pourtant un CHECK complet et cohérent sur 6 occurrences indépendantes. | Élevé — incohérence entre deux lectures de la même source (dictionnaire) |
| C-11 | **Rattachement de `Penalty`/`penalties`** | Architecture_globale place `Penalties` sous **Credit Core**. UC-70 en fait un **domaine autonome, « Risk & Penalty Core »**, transverse (règles applicables à Tontine/Loan/Meetings/Documents/System selon `source_module`, déjà documenté dans les décisions). Aucune source ne tranche le rattachement définitif. | Moyen |
| C-12 | **Isolation multi-tenant frontend** | `useTenantStore.setTenant` n'est **jamais appelé** nulle part dans `src/` (recherche exhaustive). `apiClient.ts` ne transmet **aucun header/paramètre de tenant** sur les requêtes. Aucun type frontend (`Member`, `Tontine`, `Loan`, `Account`, `Transaction`…) ne porte de champ `tenantId`, alors que **toutes** les entités des 7 diagrammes de classes portent un `tenant_id NOT NULL`. Seul `authStore.CurrentUser.tenantId` existe, jamais lu ni propagé. | **BLOQUANT** pour toute mise en production multi-tenant réelle (le filtrage reste — comme voulu par la doctrine sécurité — uniquement backend, mais le frontend n'a même pas l'affichage/le contexte) |
| C-13 | **`TontinePosition`/`PositionPayment` présents en séquence, absents en classes** | DSEQ_Achats_tontines et DSEQ_TONTINE_DRAW_ENGINE font de `Tontine_positions`/`Position_payments` le pivot du parcours d'achat et de tirage, avec état explicite (`mark status = PAID`). Absents des 7 diagrammes de classes détaillés ; seulement listés (noms) dans Architecture_globale. | **BLOQUANT** — confirmé, c'était l'hypothèse de départ de cette mission |
| C-14 | **`LoanGuarantor` sans diagramme de classes source** | Implémenté en frontend (type, service, dialogue), nommé `loan_guarantors` dans l'encart « Tables concernées » de UC-60, mais absent de DC_Crédit et de DSEQ_PRÊT_REMBOURSEMENT. | Confirmé — élevé, non bloquant (le frontend fonctionne sur mock) |
| C-15 | **WhatsApp** | Documenté fonctionnellement (4 SF), cité explicitement dans le libellé du bloc Notifications d'Architecture_globale (« SMS/EMAIL/WHATSAPP »), mais absent des enums `channel` dans tous les diagrammes de classes concernés et des `notification_preferences`. Le frontend (`NotificationChannel`) exclut correctement WhatsApp, cohérent avec la décision actée. | Confirmé, non bloquant (déjà hors périmètre V1 assumé) |
| C-16 | **Collision de nom « Administration & Exploitation »** | Déjà documentée en détail dans `TANZEN_CROSS_CUTTING_DECISIONS.md` §6 : 1 seule table (`backups`) commune entre le domaine technique (9 tables) et le volume fonctionnel homonyme (208 SF, 20 sous-modules). Confirmé indépendamment par UC-03/UC-110 (Infrastructure Package/Core) qui listent des tables presque entièrement différentes de celles d'Administration (UC-01/UC-10). | Élevé, déjà connu |
| C-17 | **WorkflowRequest vs Gouvernance/Votes** | `WorkflowModule` (type frontend) inclut la valeur `"GOVERNANCE"`, laissant supposer qu'un workflow d'approbation peut porter sur une entité de Gouvernance — alors que le domaine Gouvernance est **entièrement absent** du frontend (§8) et qu'aucune séquence ni Use Case ne montre de lien direct Workflow ↔ Vote/Assemblée. Valeur d'enum orpheline, sans entité destinataire construite. | Moyen |
| C-18 | **`accountCategory` texte libre vs `account_category` CHECK** | Le commentaire du type frontend `Account` affirme explicitement que `accountCategory` « n'a aucune liste de valeurs confirmée dans le dictionnaire… texte libre » — alors que **tous** les diagrammes de classes montrant `Accounts` (Caisses_et_Cotisations, Crédit) portent un `CHECK(tontine, savings, loan_pool, social_fund, school_fund, operational)` explicite sur ce même champ. | Élevé — le frontend sous-estime la contrainte réellement documentée dans les diagrammes |

---

## 10. Doublons potentiels

| # | Doublon | Preuve | Statut |
|---|---|---|---|
| D-01 | `tontine_cycles` / `cycle_members` (dictionnaire) | Déjà exhaustivement documenté (`TANZEN_FRONTEND_DECISIONS.md` §7, `TANZEN_TONTINE_CYCLE_DECISION.md`) : fiche ST-022 identique mot pour mot à ST-021 dans le dictionnaire Excel. **Nuance apportée par cet audit** : le diagramme de classes `DC_TANZEN_Tontines.png` ne montre **aucune trace de ce doublon** — `TontineCycle` y est un entité autonome avec ses propres champs (`cycle_code`, `start_date`, `end_date`, `member_count`, `contribution_amount`, `total_draws`, `status`), clairement distincte de `CycleMember`. Le diagramme de classes semble donc représenter un état déjà corrigé/cible, alors que le dictionnaire Excel source porte encore l'anomalie. Ceci **contredit partiellement** l'hypothèse du code frontend (`Cycle` marqué `PROVISIONAL` à cause de ce doublon) : si le diagramme de classes fait foi, `TontineCycle` a déjà une structure propre. | **CONFLIT entre sources** (diagramme vs dictionnaire), pas un doublon confirmé au niveau diagramme |
| D-02 | `BoardMember` + `Mandate` | Annotation manuscrite rouge « Fusionnés » entourant ces deux entités dans DC_Membres_et_Bureau-Exécutif **et** dans Architecture_globale. Suggère une fusion prévue/déjà actée entre les deux, non reflétée dans les colonnes actuelles (elles restent deux tables distinctes avec FK entre elles dans les deux diagrammes). | **À VALIDER** — l'intention de fusion n'est pas exécutée dans le diagramme lui-même |
| D-03 | `TontineDraw` + `Tontine_draw_engine` | Même annotation manuscrite « Fusionnés » dans Architecture_globale. `Tontine_draw_engine` n'apparaît nulle part comme table de données (c'est un orchestrateur dans DSEQ_TONTINE_DRAW_ENGINE), donc la fusion suggérée est probablement conceptuelle (le moteur produit des lignes `TontineDraw`) plutôt qu'un doublon de table réel. | **À VALIDER**, faible risque |
| D-04 | `members_accounts` / « member_accounts » (nommage) | Déjà documenté dans `TANZEN_DECISION_03_DICTIONARY.md` (titre interne de fiche incohérent, cosmétique). | Confirmé, faible gravité |
| D-05 | `member_votes` / « members_votes » (nommage) | Idem, cosmétique. | Confirmé, faible gravité |
| D-06 | Contenu croisé `workflow_actions` / `workflow_delegations` | Déjà documenté (`TANZEN_DECISION_03_DICTIONARY.md`) : la fiche `workflow_actions` documente des événements de délégation. | Confirmé |
| D-07 | `Vote_options` mal rendu en « VARCHAR(255) » dans le PNG Gouvernance | Défaut de rendu du diagramme lui-même (le nom de la table est devenu son premier champ affiché) — confirmé être `vote_options` par recoupement avec Architecture_globale et UC-X5 (« Tables concernées »). Pas un doublon métier, mais un défaut du fichier source à signaler au producteur des diagrammes. | Défaut de diagramme, sans ambiguïté une fois recoupé |
| D-08 | `Meetings` sous deux groupements différents | UC-02/nav-items.ts classent Réunions sous « Organisation »/Member Core ; Architecture_globale classe `MEETINGS`/`ATTENDANCES` sous « Governance Module ». Pas un doublon de données mais un doublon de classification qui pourrait produire deux implémentations concurrentes si des équipes différentes travaillent séparément sur Member Core et Governance Core. | À surveiller |

---

## 11. Décisions nécessaires

Cette section consolide les décisions déjà identifiées par les 15 documents existants (non répétées en détail — s'y référer) et **ajoute** celles révélées par le croisement diagrammes/UC/frontend de cette mission.

### Déjà identifiées ailleurs (rappel, voir `TANZEN_GLOBAL_CLARIFICATION_ANALYSIS.md` §33 pour le détail complet)
1. Formule de calcul des intérêts de prêt — **bloquant**.
2. Formule de pénalité — bloquant pour le calcul automatique.
3. Formules des 12 KPI Reporting — bloquant pour tout KPI réel.
4. Structure définitive de `tontine_cycles` (doublon dictionnaire) — bloquant, **nuancé par D-01 ci-dessus**.
5. Statut du cycle (valeurs d'enum) — bloquant, **le diagramme de classes propose déjà `planned/active/completed/cancelled`, à confronter à la proposition `DRAFT/OPEN/SUSPENDED/CLOSED` du frontend**.
6. Workflow des Adhésions (Tontine) — bloquant pour l'écran Adhésions.
7. Tour = Tirage ou entités séparées — bloquant pour le modèle `Draw`/`Turn`.
8. Fournisseur WhatsApp et 3 lacunes de modèle de données — bloquant pour WhatsApp uniquement.
9. Catalogue de permissions/rôles à peupler — non bloquant (RBAC dynamique fonctionne vide).

### Nouvelles décisions révélées par cette mission

10. **Arbitrage `USERS.role` (colonne unique) vs RBAC dynamique** (C-09) — les deux mécanismes coexistent dans les sources sans qu'aucune ne précise lequel prévaut à l'exécution. Bloquant pour l'implémentation réelle de l'autorisation.
11. **Statut des rôles métier nommés** (C-08) — les diagrammes UML Use Case utilisent Président/Trésorier/Secrétaire/Comité de Crédit comme acteurs sur 6 diagrammes ; les documents de décision affirment le contraire à partir de la seule spec fonctionnelle textuelle. Ce croisement n'avait pas été fait avant cette mission. Faut-il un catalogue de rôles nommés au moins pour l'affichage (labels UI), même si le RBAC réel reste dynamique ?
12. **`TontinePosition`/`PositionPayment`** — à concevoir comme tables de premier ordre (elles pilotent tout le parcours d'achat de tontine et le moteur de tirage d'après les séquences) ; actuellement absentes de tout schéma de données formel.
13. **`LoanGuarantor`** — confirmer le schéma exact (`loan_guarantors`, nommé en UC-60) puisque le frontend l'a déjà implémenté sur la base d'une hypothèse propre, sans diagramme de classes de référence.
14. **Comptabilité en partie double** (`journals`/`transaction_lines`/`account_balances`, UC-X4) — actuellement, `Account.balance` est un champ déclaré modifiable directement côté frontend (assumé dans le commentaire de `finance/types.ts`) ; UC-X4 décrit au contraire un principe strict de partie double avec lignes Débit/Crédit. Écart de principe comptable à trancher avant tout moteur de calcul de solde.
15. **`organization_type`** — les diagrammes de classes montrent un CHECK à 7 valeurs cohérent sur 6 occurrences ; à confirmer si cette liste peut être adoptée telle quelle malgré le statut « NON DÉFINIE » des documents de décision (C-10).
16. **Isolation tenant frontend** (C-12) — même en écartant tout rôle de sécurité pour le frontend, l'absence totale de tout `tenantId` dans les types et l'apiClient limite déjà l'affichage multi-tenant (ex. sélecteur de tenant pour un Super Admin). À dimensionner dès la Phase Platform Core.
17. **Rattachement de `Penalty`** (C-11) — Credit Core ou Risk & Penalty Core, domaine autonome ou transverse.

---

## 12. Ordre recommandé d'implémentation

Fondé sur (a) l'ordre déjà proposé dans `TANZEN_FRONTEND_DECISIONS.md` (Annexe) et `TANZEN_GLOBAL_CLARIFICATION_ANALYSIS.md` §34-35, (b) le niveau réel de couverture croisée observé dans cette mission.

**Déjà construit, stable** : Identity Core, Member Core (Members/Meetings/Attendances), Tontine Core (Tontines/Cycles/CycleMembers, hors Positions/Draws), Finance Core (Accounts/Transactions/MemberAccounts, hors comptabilité en partie double), Loan Core (Loans/Repayments/Guarantors, hors moteur de calcul), Workflow Core (inbox), Notification Core (centre de lecture).

1. **Résoudre C-09 (USERS.role vs RBAC) et C-08 (rôles nommés)** avant tout développement d'écran d'administration des rôles au-delà de ce qui existe — risque de reconstruire deux fois le même écran sous deux modèles différents.
2. **Concevoir `TontinePosition`/`PositionPayment`** comme prochaine itération du Tontine Core — c'est la fonctionnalité la plus documentée en séquence (2 diagrammes dédiés) qui reste totalement absente du frontend ; probablement le gap le plus rentable à combler.
3. **Concevoir le moteur de tirage** (`TontineDraw`/`TontineBid`/`DrawWinner`) — dépend du point 2 (les positions payées sont le pré-requis du tirage selon DSEQ_TONTINE_DRAW_ENGINE).
4. **Platform Core** (Tenants/Plans/Subscriptions/Payments) — nécessaire pour que `useTenantStore` ait une source réelle à consommer (résout une partie de C-12) ; aligné avec DSEQ_PROSPECT déjà entièrement documenté.
5. **Gouvernance (Bureau Exécutif : Position/BoardMember/Mandate/FiscalYear)** — domaine entièrement documenté (DC dédié + UC30) et entièrement absent du frontend ; dépendant de la clarification C-02 (fusion BoardMember/Mandate suggérée par l'annotation « Fusionnés »).
6. **Gouvernance (Assemblées/Votes/Documents)** — même domaine fonctionnel, séparable techniquement du point 5.
7. **Confirmer et documenter `LoanGuarantor`** — travail de clarification léger (le frontend existe déjà), pas de nouveau développement.
8. **Comptabilité en partie double (Finance)** — dépend de la décision #14 de la section 11 ; actuellement `Account.balance` fonctionne sur un modèle plus simple que celui décrit par UC-X4.
9. **Audit (lecture de `audit_logs`)** — table déjà bien documentée (DC_Administration), aucune inconnue de schéma, juste jamais construite malgré une entrée de navigation déjà présente.
10. **Reporting V1** (rapports simples par domaine) — dépend de la disponibilité des données des points 1 à 9, cohérent avec la recommandation déjà actée dans les documents de décision existants (agrégation directe, pas de Data Mart).
11. **Risk & Penalty Core / Document Core / Integration Core / Infrastructure Exploitation** — différer : chacun dépend soit d'un rattachement de domaine non tranché (Penalty, C-11), soit d'un volume de tables absentes largement supérieur à ce qui est confirmé (5 à 9 tables par domaine sans aucun diagramme de classes), cohérent avec le statut `EXPLOITATION_BACKEND_REQUIRED`/`REPORTING_BACKEND_REQUIRED` déjà proposé ailleurs.

---

*Fin du rapport. Aucun fichier autre que `docs/AUDIT_PHASE_01.md` n'a été créé ou modifié.*
