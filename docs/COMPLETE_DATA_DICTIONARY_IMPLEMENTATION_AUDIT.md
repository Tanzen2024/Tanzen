# TANZEN — Audit complet d'implémentation du dictionnaire de données (59 feuilles)

**Type** : audit en lecture seule. **Aucun fichier de code n'a été créé, modifié, déplacé ou supprimé** dans `tanzen-frontend`, `tanzen-commercial` ou `tanzen-mobile` pour produire ce document. Seuls des documents ont été écrits sous `docs/`.

**Date** : 2026-08-16 · **Périmètre** : `tanzen-commercial`, `tanzen-frontend`, `tanzen-mobile`.

---

## 1. Executive Summary

59 feuilles du dictionnaire de données canonique ont été confrontées à quatre sources indépendantes : la documentation de conception (PHASE_02 à PHASE_12, DECISION_*/ARCHITECTURE_*/FIX_*, MOBILE_PHASE_*), les diagrammes UML (7 diagrammes de classes, 20 diagrammes de cas d'usage), et le code réellement présent dans les trois projets.

Résultat global : **24 feuilles pleinement implémentées, 23 partiellement, 6 absentes, 3 dépendantes d'un backend inexistant, 3 bloquées par une décision produit non prise**. Le socle Organisation/Membres/Gouvernance/Crédit/Tontines/Workflows est solide côté Web (tanzen-frontend). Le RBAC est cohérent mais statique (rôles/permissions non administrables). La couche Commercial/Platform (créée dans une mission antérieure de cette même session) couvre Plans/Abonnements/Paiements/Facturation/Audit mais reste un mock sans fournisseur de paiement réel. Le Mobile n'a implémenté que Bootstrap + Auth/RBAC + Sync infra + Organisation (Phase 4A) ; Membres (Phase 4B) est à l'état d'analyse, tout le reste du dictionnaire est hors périmètre mobile à ce stade.

Deux limites structurelles traversent l'ensemble de l'audit et ne sont pas des bugs à corriger : (1) **aucun backend réel n'existe** — les trois projets sont des mocks en mémoire/SQLite locale, donc toute feuille impliquant une écriture serveur partagée (files de notification, sauvegardes, synchronisation multi-appareil réelle) est structurellement `BACKEND_PENDING` ; (2) **plusieurs décisions produit sont ouvertes depuis les phases précédentes** (mécanisme d'authentification, fournisseur de paiement, CRUD des rôles/permissions, délégation d'approbation) et n'ont pas été retranchées ici, conformément au mandat.

---

## 2. Méthodologie

1. Extraction complète et fidèle du dictionnaire Excel (`dictionnaire_donnees.xlsx`, 59 feuilles) via lecture directe du zip/XML (aucun outil GUI, fichier jamais modifié) — dump exhaustif de chaque champ, contrainte, description technique/métier, et pour les feuilles 53-59 (workflows) des sections règles métier (RM-xxx), sécurité, API, événements, journalisation.
2. Lecture intégrale de la documentation de conception existante dans `tanzen-frontend/docs/` (PHASE_02 à PHASE_12, FIX_*, DECISION_*, ARCHITECTURE_*, COMMERCIAL_TENANT_*) et `tanzen-mobile/docs/` (MOBILE_PHASE_01 à 04B), via deux agents de recherche parallèles (répartition par domaine) pour la partie Web/Commercial, et une inspection directe et ciblée du code + de la documentation restante pour Mobile après l'échec d'un troisième agent (limite de session API atteinte en cours de tâche).
3. Cross-référencement avec les 7 diagrammes de classes et 20 diagrammes de cas d'usage (`docs/Diagrammes de classes/`, `docs/USES CASES/`) déjà cités nommément dans la documentation existante — aucun UC ni classe n'a été inventé ; toute mention non retrouvée dans une source est signalée comme telle plutôt que supposée.
4. Vérification directe du code (`grep`/lecture de fichiers) pour trancher les points ambigus : enums de statut (`TenantStatus`, `MemberStatus`), présence/absence d'une entité `LoanPolicy`/`loan_rules`, permissions RBAC effectivement présentes dans `rbac.mocks.ts`, structure des tables SQLite mobiles (`src/database/schema/*.ts`), moteur de synchronisation mobile (`src/sync/*.ts`), écrans mobiles réellement montés (`app/(tenant)/*.tsx`).
5. Application stricte de la règle de priorité des sources (section 6) pour toute divergence rencontrée — jamais de nouvelle décision prise, uniquement des constats documentés avec leur source.

---

## 3. Sources utilisées

**tanzen-frontend/docs/** : PHASE_02_MODELE_CANONIQUE_FINAL.md, PHASE_02_DECISIONS_CANONIQUES.md, PHASE_04_USE_CASE_CLASSIFICATION.md, PHASE_05_CLASS_DIAGRAM_ANALYSIS.md, PHASE_06 (+ _DECISIONS_A_VALIDER), PHASE_07 (×2), PHASE_08 (×2), PHASE_09, PHASE_10, PHASE_11, PHASE_12_INTEGRATION_TESTS_REGRESSION.md, FIX_TENANT_SWITCHER_ISOLATION.md, FIX_TENANT_APP_SINGLE_TENANT.md, FIX_LOGOUT_TENANT_APP.md, FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md, COMMERCIAL_TENANT_MIGRATION_REPORT.md, COMMERCIAL_TENANT_SEPARATION.md, TENANT_APPLICATION_ARCHITECTURE.md, COMMERCIAL_PLATFORM_ARCHITECTURE.md, `Diagrammes de classes/` (7 PNG), `USES CASES/` (20 PNG), `_audit_excel_dump.txt` (dump de travail généré pour cet audit).

**tanzen-mobile/docs/** : MOBILE_BACKEND_DEPENDENCIES.md, MOBILE_PHASE_01_BOOTSTRAP(+_REPORT), MOBILE_PHASE_02_AUTH_TENANT_RBAC(+_REPORT), MOBILE_PHASE_03_OFFLINE_SYNC(+_REPORT), MOBILE_PHASE_04A_ORGANIZATION(+_DECISIONS_A_VALIDER+_REPORT), MOBILE_PHASE_04B_MEMBERS_ANALYSIS.md, MOBILE_PHASE_04B_MEMBERS_DECISIONS_A_VALIDER.md.

**Code inspecté directement** : `tanzen-frontend/src/mocks/**`, `src/services/rbac.mocks.ts`, `src/mocks/organization/{tenants,members}.ts`, `src/mocks/finance/loans.ts` ; `tanzen-mobile/src/database/schema/{organization,member,sync}.ts`, `src/database/migrations/*.ts`, `src/repositories/*.ts`, `src/sync/*.ts`, `src/permissions/permission-context.tsx`, `src/auth/*.ts`, `app/(tenant)/*.tsx`. Connaissance directe de `tanzen-commercial` (construite dans des missions précédentes de cette même session : Plans/Abonnements/Paiements/Facturation/Audit plateforme).

---

## 4. Architecture actuelle (constat)

Trois projets indépendants, sans backend partagé :

- **tanzen-commercial** — Public (landing, pricing, checkout, paiement) + Administration Plateforme (`/platform/*` : dashboard, tenants, plans, abonnements, paiements, facturation, audit).
- **tanzen-frontend** — Application Tenant uniquement (Organisation, Membres, Gouvernance, Finance, Crédit, Tontines, Opérations/Workflows, Notifications, Accès/RBAC, Audit, Paramètres) + `/login` minimal.
- **tanzen-mobile** — Expo/React Native, offline-first, SQLite locale + moteur de synchronisation (outbox/pull/push/résolution de conflits), périmètre fonctionnel actuel : Bootstrap, Auth/Tenant/RBAC, Organisation (Phase 4A).

Chaque projet possède sa propre copie en mémoire des données mock (`tanzen-frontend`/`tanzen-commercial`) ou sa propre base SQLite locale (`tanzen-mobile`) — **aucune synchronisation réelle entre eux** : un tenant créé via le tunnel Checkout de `tanzen-commercial` n'apparaît pas automatiquement dans `tanzen-frontend`.

## 5. Architecture cible (rappel, non remise en cause par cet audit)

Séparation Public/Commercial → Platform Administration → Tenant Application (Web) → Tenant Application (Mobile), avec un backend réel à terme comme source de vérité unique portant : le registre des tenants, l'authentification, la facturation, la synchronisation multi-appareil. Cette cible est déjà documentée dans `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` et `TENANT_APPLICATION_ARCHITECTURE.md` ; cet audit ne la redéfinit pas, il mesure l'écart entre elle et l'état actuel.

## 6. Règles de priorité appliquées en cas de divergence

1. Décision explicitement validée par le PO.
2. `PHASE_02_MODELE_CANONIQUE_FINAL.md`.
3. Cas d'usage classifiés et validés (`PHASE_04_USE_CASE_CLASSIFICATION.md`).
4. Diagrammes de classes/séquences.
5. Implémentation actuelle (code).
6. Dictionnaire Excel — **ne provoque jamais automatiquement une nouvelle implémentation** ; il sert de référentiel de champs, pas d'ordre de développement.

---

## 7. Audit des 59 feuilles — table maîtresse

Colonnes : **#**, **Feuille**, **Contexte**, **Domaine**, **Entité(s) code**, **Code existant**, **Projet(s)**, **Use Cases**, **Statut**, **Doublon**, **Contradiction**, **Décision existante**, **Backend**, **Action future**, **Priorité**.

| # | Feuille | Contexte | Domaine | Entité code | Code existant | Projet | Use Cases | Statut | Doublon | Contradiction | Décision existante | Backend | Action future | Priorité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | tenants | COMMERCIAL+PLATFORM+TENANT(ro) | Multi-tenant | `Tenant` (`mocks/organization/tenants.ts`) | CRUD complet (Commercial), lecture seule (Tenant, via `TenantContext`) | Commercial, Frontend | UC-01, UCX2-01..04 | IMPLEMENTED | Oui (mock partagé, dupliqué à l'identique, décision documentée) | Oui (enum statut) | Séparation Commercial/Tenant (Mission 4) | Non | CONSOLIDER (aligner l'enum statut sur Excel) | MEDIUM |
| 2 | tenant_settings | TENANT | Multi-tenant | Profil Organisation (partiel) | Sous-ensemble (nom, logo, contact, langue) | Frontend | UCX2-05 | PARTIALLY_IMPLEMENTED | Oui (chevauche 30/36, voir Doublons) | Non | — | Non | COMPLÉTER | LOW |
| 3 | locations | TENANT | Multi-tenant | Champs adresse embarqués | Pas d'entité hiérarchique dédiée | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 4 | users | TRANSVERSAL | Auth | `currentUser` mock, `authService` | Session locale simulée, pas d'authentification réelle | Commercial, Frontend, Mobile | UC-00, UC01-11..14 | DECISION_REQUIRED | Non | Oui (NC-01, voir §12) | — | Oui | DÉCISION REQUISE (mécanisme d'auth) | CRITICAL |
| 5 | members | TENANT+MOBILE(partiel) | Membres | `Member` | CRUD Web complet ; Mobile : analyse seule (Phase 4B) | Frontend (complet), Mobile (absent) | UCX1-* | PARTIALLY_IMPLEMENTED | Non | Non | `EXITED` verrouillé mais non atteignable dans l'UI | Non | COMPLÉTER | HIGH |
| 6 | positions | TENANT | Gouvernance | `Position` | Catalogue statique, non administrable | Frontend | UC02-* | DECISION_REQUIRED | Non | Non | Catalogue figé (décision antérieure) | Non | DÉCISION REQUISE | MEDIUM |
| 7 | board_mandates | TENANT | Gouvernance | `BoardMandate` | Implémenté | Frontend | UC02-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 8 | accounts | TENANT | Finance | `Account` | Implémenté | Frontend | UC03-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 9 | members_accounts | TENANT | Finance | Jonction Member↔Account | Implémenté | Frontend | UC03-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 10 | loans | TENANT | Crédit | `Loan` | Implémenté, statut verrouillé `PENDING\|ACTIVE\|REPAID\|DEFAULTED` | Frontend | UC04-* | IMPLEMENTED | Non | Non | Enum statut verrouillé (à respecter) | Non | AUCUNE | — |
| 11 | repayments | TENANT | Crédit | `Repayment` | Implémenté | Frontend | UC04-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 12 | penalties | TENANT | Crédit | Pénalités (simplifiées) | Calcul de base, pas de moteur de règles distinct | Frontend | UC04-* | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | COMPLÉTER | LOW |
| 13 | loan_guarantors | TENANT | Crédit | — | Aucune entité garant distincte | Frontend | — | MISSING | Non | Non | — | Non | DÉCISION REQUISE | MEDIUM |
| 14 | loan_rules | TENANT | Crédit | — (`interestRate` inline sur `Loan`) | Confirmé absent par grep (`LoanPolicy`/`loan_rules` : 0 occurrence) | Frontend | — | MISSING | Oui (mésappariement de nom avec `LoanPolicy` des docs, voir §11) | Non | — | Non | DÉCISION REQUISE puis IMPLÉMENTER | MEDIUM |
| 15 | contribution_rules | TENANT | Finance | Règles embarquées dans Tontine/cycle | Pas d'entité standalone | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 16 | fiscal_years | TENANT | Finance | — | Aucune entité Exercice fiscal | Frontend | — | MISSING | Non | Non | — | Non | DÉCISION REQUISE | MEDIUM |
| 17 | financial_categories | TENANT | Finance | Catégories de filtre (transactions) | Partiel, pas de gestion CRUD dédiée | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 18 | meetings | TENANT | Réunions | `Meeting` | Implémenté | Frontend | UC05-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 19 | attendances | TENANT | Réunions | Compteur agrégé | Pas de structure par membre | Frontend | UC05-* | PARTIALLY_IMPLEMENTED | Non | Non | Connu depuis Phase 6-8 | Non | COMPLÉTER | HIGH |
| 20 | tontines | TENANT | Tontines | `Tontine` | Implémenté | Frontend | UCX2-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 21 | cycle_members | TENANT | Tontines | Inscription (admin uniquement) | UCX2-03 fait, UCX1-10 (auto-inscription) absent | Frontend | UCX1-10, UCX2-03 | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | DÉCISION REQUISE | MEDIUM |
| 22 | tontine_cycles | TENANT | Tontines | `TontineCycle` | Implémenté, statuts verrouillés `DRAFT\|OPEN\|SUSPENDED\|CLOSED` | Frontend | UCX2-* | IMPLEMENTED | Non | Non | `CLOSED` terminal, réouverture non autorisée sans nouvelle décision | Non | DÉCISION REQUISE (réouverture) | LOW |
| 23 | tontine_contributions | TENANT | Tontines | `TontineContribution` | Implémenté (absent du diagramme de classes — lacune du diagramme, pas du code) | Frontend | UCX2-* | IMPLEMENTED | Non | Oui (diagramme incomplet vs code) | — | Non | AUCUNE | — |
| 24 | tontine_draws | TENANT | Tontines | `TontineDraw` | Implémenté | Frontend | UCX2-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 25 | draw_winners | TENANT | Tontines | `DrawWinner` | Implémenté | Frontend | UCX2-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 26 | transactions | TENANT | Finance | `Transaction` | Implémenté, mais permissions `transactions.create`/`cancel` absentes du catalogue RBAC | Frontend | UC03-* | PARTIALLY_IMPLEMENTED | Non | Non | Connu depuis Phase 9/10 | Non | COMPLÉTER (RBAC) | HIGH |
| 27 | audit_logs | TRANSVERSAL | Audit | `AuditEvent` (Tenant) + `PlatformAuditEvent` (Platform) | Implémenté séparément dans les deux portées | Frontend, Commercial | UC-* | IMPLEMENTED | Oui (deux implémentations parallèles, portées différentes — pas un doublon accidentel) | Non | — | Non | AUCUNE | — |
| 28 | notifications | TENANT | Notifications | `Notification` | Implémenté | Frontend | UC06-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 29 | notification_templates | TENANT | Notifications | Gabarits (partiel) | Sous-ensemble | Frontend | UC06-* | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | COMPLÉTER | LOW |
| 30 | notification_preferences | TENANT | Notifications | Préférences (partiel) | Sous-ensemble | Frontend | UC06-* | PARTIALLY_IMPLEMENTED | Oui (chevauche 2/36) | Non | — | Non | COMPLÉTER | LOW |
| 31 | notification_logs | TENANT | Notifications | Historique (partiel) | Sous-ensemble | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 32 | email_queue | BACKEND | Notifications | — | Aucun envoi réel | — | — | BACKEND_PENDING | Non | Non | — | Oui | BACKEND REQUIS | MEDIUM |
| 33 | sms_queue | BACKEND | Notifications | — | Aucun envoi réel | — | — | BACKEND_PENDING | Non | Non | — | Oui | BACKEND REQUIS | MEDIUM |
| 34 | push_queue | BACKEND | Notifications | — | Aucun envoi réel | — | — | BACKEND_PENDING | Non | Non | — | Oui | BACKEND REQUIS | MEDIUM |
| 35 | announcements | TENANT | Notifications | Partiel (via Notifications) | Pas d'entité distincte confirmée | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 36 | notification_settings | TENANT | Notifications | Partiel | Chevauche 2/30 | Frontend | — | PARTIALLY_IMPLEMENTED | Oui (chevauche 2/30, voir Doublons) | Non | — | Non | CONSOLIDER | LOW |
| 37 | sync_jobs | MOBILE+BACKEND | Sync | `SyncEngine`, `OutboxRepository`, `PullService`, `PushService` (mobile) | Moteur client complet ; aucune contrepartie serveur | Mobile | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Oui (volet serveur) | BACKEND REQUIS | HIGH |
| 38 | documents | TENANT | Documents | `Document` | CRUD de base ; partage et restauration/archivage bloqués | Frontend | UC07-* | PARTIALLY_IMPLEMENTED | Non | Non | Partage/restauration BLOQUANT (Phase 9/10) | Non | DÉCISION REQUISE | MEDIUM |
| 39 | general_assemblies | TENANT | Gouvernance | `GeneralAssembly` | Implémenté | Frontend | UCX5-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 40 | votes | TENANT | Gouvernance | `Vote` | Implémenté | Frontend | UCX5-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 41 | vote_options | TENANT | Gouvernance | `VoteOption` | Implémenté | Frontend | UCX5-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 42 | member_votes | TENANT | Gouvernance | `MemberVote` | Implémenté, traçabilité/secret du scrutin non confirmés | Frontend | UCX5-* | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 43 | plans | COMMERCIAL/PLATFORM | Commercial | `Plan` | Implémenté (mocks + UI + `plans.read`) | Commercial | — | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 44 | payments | COMMERCIAL/PLATFORM | Commercial | `Payment` | Implémenté (Checkout, Platform Payments) ; fournisseur de paiement réel absent | Commercial | — | PARTIALLY_IMPLEMENTED | Non | Non | Fournisseur de paiement BLOQUANT (Phase 9/10) | Oui | DÉCISION REQUISE | HIGH |
| 45 | backups | BACKEND/INFRA | Infrastructure | — | Aucune | — | — | MISSING | Non | Non | — | Oui | BACKEND REQUIS | LOW |
| 46 | subscriptions | COMMERCIAL/PLATFORM | Commercial | `Subscription` | Implémenté (mocks + UI + `subscriptions.read`) ; activation réelle du tenant absente | Commercial | — | PARTIALLY_IMPLEMENTED | Non | Non | Mécanisme d'activation BLOQUANT (Phase 9/10) | Oui | DÉCISION REQUISE | HIGH |
| 47 | modules | COMMERCIAL/PLATFORM | Commercial | — | Aucune entité de feature-flagging par plan | Commercial | — | MISSING | Non | Non | — | Non | DÉCISION REQUISE | MEDIUM |
| 48 | roles | TENANT+PLATFORM | RBAC | `SystemRole` | Catalogue statique (`role-admin/manager/viewer`), non administrable | Frontend, Commercial | — | DECISION_REQUIRED | Non | Non | CRUD des rôles BLOQUANT (Phase 9/10) | Non | DÉCISION REQUISE | HIGH |
| 49 | users_roles | TRANSVERSAL | RBAC | Affectation simple (mock `currentUser`) | Pas de gestion many-to-many via UI | Frontend, Commercial | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | DÉCISION REQUISE | MEDIUM |
| 50 | permissions | TRANSVERSAL | RBAC | `permissionCatalog` | Implémenté, y compris `plans.read/subscriptions.read/payments.read/billing.read/platformAudit.read` (confirmés présents par grep) | Frontend, Commercial | — | IMPLEMENTED | Non | Non | CRUD des permissions BLOQUANT (catalogue figé) | Non | DÉCISION REQUISE (pour CRUD) | MEDIUM |
| 51 | role_permissions | TRANSVERSAL | RBAC | Mapping statique | Implémenté (statique, par décision) | Frontend, Commercial | — | IMPLEMENTED | Non | Non | Statique par décision antérieure | Non | AUCUNE | — |
| 52 | templates | TENANT | Workflows | Gabarits (workflow/document/notification) | Partiel | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | À ANALYSER | LOW |
| 53 | workflows | TENANT | Workflows | `Workflow` (`workflow.service.ts`) | Implémenté (confirmé par citation directe de code) | Frontend | UC08-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 54 | workflow_steps | TENANT | Workflows | `WorkflowStep` | Implémenté | Frontend | UC08-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 55 | workflow_step_approvers | TENANT | Workflows | `WorkflowStepApprover` | Implémenté hors délégation | Frontend | UC08-* | PARTIALLY_IMPLEMENTED | Non | Non | Délégation d'approbation BLOQUANT (Phase 9/10) | Non | DÉCISION REQUISE | HIGH |
| 56 | workflow_requests | TENANT | Workflows | `WorkflowRequest` | Implémenté | Frontend | UC08-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 57 | workflow_actions | TENANT | Workflows | `WorkflowAction` | Implémenté | Frontend | UC08-* | IMPLEMENTED | Non | Non | — | Non | AUCUNE | — |
| 58 | workflow_delegations | TENANT | Workflows | — | Absent (cf. 55) | Frontend | — | MISSING | Non | Non | Délégation d'approbation BLOQUANT | Non | DÉCISION REQUISE puis IMPLÉMENTER | HIGH |
| 59 | workflow_conditions | TENANT | Workflows | Routage conditionnel de base | Partiel vs moteur RM-* complet du dictionnaire | Frontend | — | PARTIALLY_IMPLEMENTED | Non | Non | — | Non | COMPLÉTER | MEDIUM |

---

## 8. Matrice des statuts (synthèse)

Voir tableau de comptage exact dans `COMPLETE_DATA_DICTIONARY_EXECUTIVE_SUMMARY.md`. Rappel : IMPLEMENTED=24, PARTIALLY_IMPLEMENTED=23, MISSING=6, BACKEND_PENDING=3, DECISION_REQUIRED=3, autres catégories=0 en statut primaire (DUPLICATE/CONFLICT traités en colonnes transversales, cf. §11/§12).

## 9. Matrice par domaine (15 domaines)

| Domaine | Feuilles | IMPLEMENTED | PARTIAL | MISSING | BACKEND_PENDING | DECISION_REQUIRED |
|---|---|---|---|---|---|---|
| Multi-tenant/Admin | 1,2,3 | 1 | 2 | 0 | 0 | 0 |
| Auth/Users | 4 | 0 | 0 | 0 | 0 | 1 |
| Membres | 5 | 0 | 1 | 0 | 0 | 0 |
| Gouvernance (bureau) | 6,7 | 1 | 0 | 0 | 0 | 1 |
| Finance/Comptes | 8,9 | 2 | 0 | 0 | 0 | 0 |
| Crédit | 10-14 | 2 | 1 | 2 | 0 | 0 |
| Contributions/Fiscal | 15-17 | 0 | 2 | 1 | 0 | 0 |
| Réunions | 18,19 | 1 | 1 | 0 | 0 | 0 |
| Tontines | 20-25 | 5 | 1 | 0 | 0 | 0 |
| Transactions/Audit | 26,27 | 1 | 1 | 0 | 0 | 0 |
| Notifications | 28-36 | 1 | 5 | 0 | 3 | 0 |
| Sync/Documents | 37,38 | 0 | 2 | 0 | 0 | 0 |
| Gouvernance (AG/votes) | 39-42 | 3 | 1 | 0 | 0 | 0 |
| Commercial/Platform | 43-47 | 1 | 2 | 2 | 0 | 0 |
| RBAC | 48-51 | 2 | 1 | 0 | 0 | 1 |
| Workflows | 52-59 | 4 | 3 | 1 | 0 | 0 |

## 10. Matrice par projet

| Projet | Feuilles couvertes (au moins partiellement) | Feuilles absentes |
|---|---|---|
| **tanzen-frontend** (Tenant) | 1(ro),2,3,4,5,6,7,8,9,10,11,12,13(absent),14(absent),15,16(absent),17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,35,36,37(client),38,39,40,41,42,48,49,50,51,52,53,54,55,56,57,58(absent),59 | 13,14,16,45,47,58 |
| **tanzen-commercial** (Platform) | 1,27,43,44,46,48,49,50,51 | 32,33,34,45,47 (partiel) |
| **tanzen-mobile** | 1(via Organization),4(auth stub),5(Phase4A org seulement),37(client seul) | tout le reste (Finance/Crédit/Tontines/Opérations/Notifications/Audit/Settings hors périmètre mobile à ce jour) |
| **Backend (aucun projet)** | — | 4(réel),32,33,34,37(serveur),44(fournisseur),45,46(activation) |

## 11. Doublons — matrice (3 items)

| # | Item | Nature | Feuilles concernées | Verdict |
|---|---|---|---|---|
| D1 | `tenants.ts` dupliqué à l'identique | Doublon intentionnel et documenté (pas de monorepo/backend partagé) | 1 | Accepté, à réévaluer si un backend réel apparaît |
| D2 | `tenant_settings` / `notification_preferences` / `notification_settings` | Chevauchement conceptuel entre trois feuilles distinctes du dictionnaire mais un seul espace « Paramètres » côté code | 2, 30, 36 | À CONSOLIDER (clarifier la frontière au niveau modèle canonique, pas juste au niveau UI) |
| D3 | `loan_rules` (Excel) vs `LoanPolicy` (docs PHASE_02/05/06/07) | Mésappariement de nom, probablement la même entité fonctionnelle (« Core Credit Policy Engine ») désignée différemment par deux sources | 14 | À CONSOLIDER (choisir un nom canonique unique avant toute implémentation) |

## 12. Contradictions — matrice (4 items)

| # | Item | Source A | Source B | Verdict (priorité §6) |
|---|---|---|---|---|
| C1 | Enum `Tenant.status` | Code : `active\|inactive\|pending` (3 valeurs) | Excel : `ACTIVE\|SUSPENDED\|ARCHIVED\|PENDING` (4 valeurs, aucun recouvrement sur `SUSPENDED`/`ARCHIVED`/`inactive`) | Le code (source 5) prévaut tant qu'aucune décision (source 1) ne tranche ; à documenter comme écart connu, pas à corriger ici |
| C2 | Enum `Member.status` | Décision canonique : `EXITED` est une valeur verrouillée | Code : type `MemberStatus` ne définit même pas `EXITED` ; seule la transition `ACTIVE⇄SUSPENDED` est câblée dans l'UI | Écart implémentation vs décision canonique — `COMPLÉTER`, pas un vrai conflit de règle (la règle de sortie elle-même reste `DECISION_REQUIRED`, cf. D-4B-03) |
| C3 | Règle TenantSwitcher | `FIX_TENANT_SWITCHER_ISOLATION.md` (plus ancien) : dropdown autorisé pour les utilisateurs `scope: platform` | `FIX_TENANT_APP_SINGLE_TENANT.md` (plus récent) : aucun dropdown pour aucune portée ; `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §13 semble reformuler la règle la PLUS ANCIENNE | `FIX_TENANT_APP_SINGLE_TENANT.md` fait autorité (le plus récent et le code actuel l'implémente) ; `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §13 est à corriger dans une prochaine passe documentaire (hors périmètre de cet audit lecture seule) |
| C4 | `USERS.tenant_id` (NC-01) | Diagrammes de classes : colonne `NOT NULL` (obligatoire) | UC-00, UC01-11..14 : le Super Admin plateforme n'a explicitement AUCUN tenant | Aucune classe `PlatformUser` n'existe pour résoudre l'écart — **CRITIQUE**, `DECISION_REQUISE` avant toute implémentation d'authentification réelle |

## 13. Décisions déjà validées (à respecter, non rouvertes)

1. `Loan.status = PENDING\|ACTIVE\|REPAID\|DEFAULTED` (pas de `OVERDUE`, pas de `CLOSED`).
2. `TontineCycle.status = DRAFT\|OPEN\|SUSPENDED\|CLOSED`, `CLOSED` terminal sans réouverture.
3. `SystemRole` (accès) et `PositionRole` (fonction de gouvernance) sont strictement distincts et ne doivent jamais être fusionnés.
4. Aucun `TenantSwitcher` pour aucune portée (`FIX_TENANT_APP_SINGLE_TENANT.md`, supersède `FIX_TENANT_SWITCHER_ISOLATION.md`).
5. `role_permissions` est un mapping statique par décision (pas un manque, un choix).
6. Séparation physique Commercial/Tenant en deux projets indépendants (Mission 4 de cette session), avec duplication documentée plutôt que monorepo.

## 14. Décisions requises — matrice (17 items, triés par domaine)

| # | Décision | Domaine | Feuilles | Priorité |
|---|---|---|---|---|
| 1 | Mécanisme d'authentification réel | Auth | 4 | CRITICAL |
| 2 | Résolution NC-01 (`USERS.tenant_id` vs Super Admin sans tenant / `PlatformUser`) | Auth | 4 | CRITICAL |
| 3 | Fournisseur de paiement réel | Commercial | 44 | HIGH |
| 4 | Mécanisme d'activation d'un tenant après paiement | Commercial | 46 | HIGH |
| 5 | CRUD des rôles | RBAC | 48 | HIGH |
| 6 | CRUD des permissions | RBAC | 50 | MEDIUM |
| 7 | Délégation d'approbation | Workflows | 55, 58 | HIGH |
| 8 | Partage de document | Documents | 38 | MEDIUM |
| 9 | Restauration/archivage de document | Documents | 38 | MEDIUM |
| 10 | Périmètre du domaine Billing/Subscriptions/Payments/Plans (Platform) | Commercial | 43,44,46,47 | MEDIUM |
| 11 | Catalogue de postes/comités dynamique | Gouvernance | 6 | MEDIUM |
| 12 | Modélisation garant de prêt | Crédit | 13 | MEDIUM |
| 13 | Nom canonique `loan_rules`/`LoanPolicy` + modélisation | Crédit | 14 | MEDIUM |
| 14 | FK manquante `members↔users` (self-service membre) | Membres/Mobile | 5, 4 | MEDIUM (D-4B-01) |
| 15 | Modélisation familles/groupes de membres (UC02-06/07) | Membres | 5 | LOW (D-4B-02) |
| 16 | Règle de transition vers `EXITED` | Membres | 5 | MEDIUM (D-4B-03) |
| 17 | Workflow de candidature/adhésion (statut « en cours ») | Membres | 5 | LOW (D-4B-04) |

Complémentaires déjà connues mais de portée plus locale : auto-inscription tontine (UCX1-10, feuille 21), réouverture d'un cycle `CLOSED` (feuille 22), feature-flagging par plan / feuille `modules` (feuille 47).

## 15. Backend Pending — matrice

| Fonction | Feuilles | Nature du manque |
|---|---|---|
| Files de notification (email/SMS/push) | 32,33,34 | Aucun envoi réel, mock uniquement |
| Synchronisation serveur mobile | 37 | Moteur client complet, aucune contrepartie serveur |
| Sauvegardes | 45 | Aucune infrastructure |
| Authentification réelle (mots de passe, sessions serveur) | 4 | Session locale simulée uniquement |
| Fournisseur de paiement | 44 | Aucune intégration réelle |
| Activation réelle d'un tenant | 46 | Aucun déclenchement automatique post-paiement |
| Registre tenant partagé entre Commercial et Frontend | 1 | Deux copies mock non synchronisées |
| Restauration/archivage de documents | 38 | Dépend d'un stockage serveur réel |
| CRUD rôles/permissions persistant | 48,50 | Catalogue actuellement figé côté code, pas en base |
| Historique de notifications durable | 31 | Mock non persistant |
| Exercices fiscaux (calculs consolidés multi-période) | 16 | Nécessiterait une clôture serveur |
| Workflow delegations (audit trail durable) | 58 | Dépend d'un stockage serveur réel |

## 16. Tenant Isolation — matrice (constat, non corrigé)

| Aspect | État constaté | Source |
|---|---|---|
| Résolution du tenant courant (Web) | `TenantContext` résout exactement un tenant depuis `currentUser.tenantId`, ignore le localStorage | `FIX_TENANT_APP_SINGLE_TENANT.md` |
| Sélecteur de tenant (Web) | Absent pour toutes les portées (voir C3 ci-dessus pour l'historique de la règle) | `FIX_TENANT_APP_SINGLE_TENANT.md` |
| Isolation en synchronisation (Mobile) | `assertTenantMatch()` (`src/sync/tenant-guard.ts`) rejette tout enregistrement dont le `tenantId` diverge, appliqué à l'outbox (défensif) et au pull (obligatoire) | Lecture directe du code |
| Portée `getTenantScoped()` (Web) | Utilisé par tous les services métier tenant-scopés | Connaissance directe (Mission 4) |
| Incohérence documentaire | `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §13 restate une règle supersédée (voir C3) | Constat, non corrigé ici |

## 17. Commercial/Platform Layer — matrice

| Feuille | État | Détail |
|---|---|---|
| 43 plans | IMPLEMENTED | Mocks + UI Platform + `plans.read` |
| 44 payments | PARTIALLY_IMPLEMENTED | Checkout + Platform Payments, pas de fournisseur réel |
| 46 subscriptions | PARTIALLY_IMPLEMENTED | Mocks + UI, pas d'activation automatique |
| 47 modules | MISSING | Pas de feature-flagging par plan |
| 27 (volet Platform) audit_logs | IMPLEMENTED | `PlatformAuditEvent` distinct de l'audit tenant |
| RBAC Platform (50/51, sous-ensemble) | IMPLEMENTED | `plans.read/subscriptions.read/payments.read/billing.read/platformAudit.read` confirmés présents dans `rbac.mocks.ts` — **note** : une doc antérieure (Phase 9/10) rapportait ces permissions absentes ; le code actuel (postérieur, mission « Commercial/Platform layer ») les a depuis ajoutées — le code prévaut (règle §6) |

## 18. Mobile — matrice

Statuts propres au mobile (5 valeurs mandatées) — **distincts** du statut primaire de la table maîtresse (§7), qui reflète surtout le Web.

| Phase mobile | Feuilles couvertes | Statut mobile |
|---|---|---|
| Phase 1 — Bootstrap | infra (pas de feuille dédiée) | IMPLEMENTED |
| Phase 2 — Auth/Tenant/RBAC | 4 (partiel), isolation tenant | IMPLEMENTED (session stub) / BACKEND_PENDING (auth réelle) |
| Phase 3 — Offline Sync | 37 | IMPLEMENTED (client) / BACKEND_PENDING (serveur) |
| Phase 4A — Organisation | 1 (profil tenant), 2 (partiel) | IMPLEMENTED |
| Phase 4B — Membres | 5 | MISSING (analyse + décisions seulement, aucun écran, aucune table membres au-delà du schéma `member.ts` déjà scaffoldé) |
| Gouvernance, Finance, Crédit, Tontines, Opérations, Notifications, Audit, Settings | 6-42, 52-59 | OUT_OF_SCOPE (aucune phase mobile ne les couvre à ce jour) |

Écrans réellement montés (`app/(tenant)/*.tsx`) : `index.tsx` (accueil), `organization.tsx` — confirme qu'aucun écran Membres/Finance/Tontines n'existe encore côté mobile, cohérent avec le statut Phase 4B ci-dessus.

Constat mobile-spécifique notable : le schéma `member.ts` mobile ne porte aucune colonne `user_id`, et le schéma `users` canonique (Web) ne porte aucune colonne `member_id` — confirme D-4B-01 (aucune FK canonique membre↔utilisateur, le self-service membre reste non implémentable tel quel sur aucune plateforme).

## 19. Dépendances (déduites, non inventées)

- **44 (payments)** dépend de **3 (décision fournisseur)** avant toute implémentation réelle du volet transactionnel.
- **46 (subscriptions)** dépend de **44** pour une activation automatique déclenchée par un paiement réel.
- **58 (workflow_delegations)** dépend de **7 (décision délégation)** avant implémentation.
- **13/14 (loan_guarantors/loan_rules)** dépendent l'une de l'autre conceptuellement : un garant n'a de sens que si une règle de crédit référence des conditions distinctes de l'emprunt lui-même.
- **5 (members, volet Mobile)** dépend de **14 (FK membre↔utilisateur)** pour tout scénario de self-service, et de **16 (règle EXITED)** pour la sortie de membre.
- **37 (sync_jobs, volet serveur)** est un prérequis de tout **BACKEND_PENDING** mobile listé en §15/§18 — sans backend de synchronisation, aucune autre feuille mobile ne peut dépasser le stade client-seul.
- **1 (tenants, registre partagé)** est un prérequis pour supprimer le doublon D1 (§11) — tant qu'aucun backend commun n'existe, la duplication reste la seule option.

## 20. Priorités (justifiées)

| Priorité | Items | Justification |
|---|---|---|
| CRITICAL | Décisions #1, #2 (§14) | Bloquent toute authentification réelle sur les trois projets ; NC-01 est une incohérence de modélisation non résolue |
| HIGH | Feuilles 5,19,26,44,46,48,55,58 ; décisions #3,#4,#5,#7 | Fonctionnalités visibles utilisateur déjà partiellement construites mais bloquées sur un point précis, ou lacune connue et documentée depuis plusieurs phases (attendance, RBAC transactions) |
| MEDIUM | Feuilles 2,6,13,14,16,21,22,32-34,37,38,47,49,50,59 ; décisions #6,#8,#9,#10,#11,#12,#13,#14,#16 | Lacunes réelles mais sans blocage utilisateur immédiat, ou dépendantes d'un backend non prioritaire à ce stade |
| LOW | Feuilles 3,12,15,17,29,30,31,35,36,42,45,52 ; décisions #15,#17 | Compléments d'UI ou de modélisation sans impact fonctionnel majeur constaté |
| DECISION_REQUIRED (transversal) | Toutes les feuilles listées en §14 | Aucune implémentation ne doit précéder la décision, conformément au mandat |

## 21. Recommandations

1. Ne pas construire tant que les 2 décisions CRITICAL (§14 #1, #2) ne sont pas tranchées — elles conditionnent l'architecture d'authentification des trois projets.
2. Prioriser les compléments HIGH qui ne nécessitent aucune décision préalable : structurer `attendances` par membre (19) et ajouter les permissions RBAC manquantes sur `transactions` (26) sont des `COMPLÉTER` purs, sans blocage.
3. Traiter le doublon D2 (§11) et la feuille `tenant_settings`/`notification_settings`/`notification_preferences` dans une seule passe de clarification du modèle canonique plutôt que trois correctifs séparés.
4. Corriger `FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §13 (C3, §12) dans une prochaine passe documentaire pour éviter qu'un futur lecteur applique la règle supersédée.
5. Le volet Mobile ne devrait pas être étendu au-delà de Phase 4B (Membres) tant que D-4B-01 (FK membre↔utilisateur) n'est pas tranchée, sous peine de devoir remodéliser après coup.

## 22. Conclusion

Le socle fonctionnel Tenant (Organisation, Gouvernance, Finance, Crédit, Tontines, Workflows, Notifications, RBAC de base) est majoritairement construit et cohérent avec les décisions canoniques déjà prises. Les écarts identifiés se répartissent en trois familles claires : des compléments UI/permissions sans risque (COMPLÉTER), des entités jamais modélisées nulle part (loan_guarantors, loan_rules, fiscal_years, modules, workflow_delegations — MISSING), et un noyau de décisions produit non prises qui bloquent structurellement l'authentification, la facturation réelle et la gouvernance des accès (DECISION_REQUIRED). Le Mobile est loin derrière le Web par construction (roadmap phasée volontaire, pas un retard signalé) et ne couvre à ce jour que Bootstrap/Auth/Sync-infra/Organisation. Aucune de ces constatations n'appelle une correction immédiate : conformément au mandat, ce document est un audit, pas un plan d'exécution.
