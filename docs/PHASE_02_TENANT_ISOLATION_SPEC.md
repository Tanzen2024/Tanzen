# TANZEN — Phase 02 : Spécification d'isolation multi-tenant

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce document. C'est le seul fichier créé par cette mission.

## Portée de ce document

Ce document détaille et durcit l'architecture tenant déjà verrouillée en §4 de `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (Décision 1 du Product Owner : `User → tenantId → TenantContext/tenantStore → API → Backend`). Il ne la contredit pas — il l'opérationnalise en règles vérifiables, surface par surface, et fixe les tests obligatoires qu'une implémentation future devra satisfaire. **Rien ici n'est implémenté aujourd'hui** : `AUDIT_PHASE_01.md` (C-12) et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (§9 point 7) constataient déjà que `tenantStore` n'est jamais alimenté et qu'aucun header tenant n'est transmis — ce document reste une cible normative pour une future phase d'implémentation, pas une description de l'existant.

---

## 1. Règle fondamentale

L'application est **strictement tenant-scoped**. Un utilisateur tenant-scoped ne voit que les données de son tenant courant.

```
Utilisateur connecté
        ↓
tenantId = T-001
        ↓
Application
        ↓
UNIQUEMENT T-001
```

Les données de tout autre tenant (T-002, T-003, …) ne doivent **jamais** apparaître dans : listes, compteurs, dashboards, recherches, filtres, selects, notifications, documents, rapports — ni être accessibles par modification manuelle de l'URL, ni en appelant directement un service frontend.

## 2. Détermination du tenant courant

```
User
 ↓
tenantId
 ↓
TenantContext / tenantStore
 ↓
API
 ↓
Backend vérifie l'autorisation
```

Toutes les requêtes métier doivent être filtrées par `tenantId`. Ce schéma reprend exactement l'architecture verrouillée en §4 de `PHASE_02_MODELE_CANONIQUE_FINAL.md` — ce document en précise les conséquences opérationnelles ci-dessous.

## 3. Interdiction d'exposition des autres tenants

- Ne pas afficher un écran global « Tous les tenants » à un utilisateur tenant-scoped.
- Ne pas afficher : un `TenantSwitcher` vers des tenants non autorisés, une liste de tous les tenants, le `tenantId` d'un autre tenant, ou des données agrégées provenant de plusieurs tenants.
- Un `TenantSwitcher`, s'il existe, doit afficher **uniquement** les tenants auxquels l'utilisateur est réellement autorisé à accéder.
- Si l'utilisateur ne peut accéder qu'à un seul tenant : ne pas afficher de sélecteur permettant de découvrir l'existence d'autres tenants.

## 4. Accès direct par URL

Une URL comme `/tontines/TON-002`, `/finance/accounts/A-002`, `/credit/loans/L-002`, `/organization/members/M-002` ne doit jamais permettre d'accéder à une ressource d'un autre tenant.

Le service doit vérifier `resource.tenantId === currentTenantId` avant de retourner la ressource. Si la ressource appartient à un autre tenant :
- ne pas retourner la donnée ;
- retourner `null`/`Not Found` selon le contrat existant ;
- afficher 404/Not Found ;
- ne révéler aucune information sur l'existence de la ressource.

**Ne jamais** retourner `403 + "Cette ressource appartient au tenant T-002"` — cela révélerait l'existence d'une ressource cross-tenant. Le 404 doit être indiscernable entre « la ressource n'existe pas » et « elle existe mais appartient à un autre tenant ».

## 5. Listes

Toutes les listes doivent être tenant-scoped : `listTenants()`, `listMembers()`, `listAccounts()`, `listTransactions()`, `listLoans()`, `listRepayments()`, `listGuarantors()`, `listTontines()`, `listCycles()`, `listCycleMembers()`, `listPositions()`, `listPositionPayments()`, `listDraws()`, `listWinners()`, `listWorkflows()`, `listNotifications()`, `listDocuments()`, `listAuditLogs()`. Aucune fonction ne doit retourner les données de plusieurs tenants pour un utilisateur tenant-scoped.

*Note de cohérence avec le modèle canonique* : `listPositions()`/`listPositionPayments()` portent sur `TontinePosition`/`PositionPayment`, dont le schéma physique reste à spécifier (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §9 point 1) — la question de savoir si ces tables porteront un `tenant_id` direct ou indirect (via `tontine_id`) reste également ouverte (§9 point 3). Cette spec d'isolation s'appliquera à ces entités quelle que soit la réponse retenue ; elle n'a pas vocation à trancher cette question de schéma.

## 6. Dashboard

Le Dashboard doit être calculé uniquement à partir des données du tenant courant. KPI, graphiques, statistiques et agrégations doivent respecter `tenantId = currentTenantId`. Aucune statistique globale multi-tenant ne doit apparaître pour un utilisateur tenant-scoped.

## 7. Recherche

La recherche globale doit être tenant-scoped. Une recherche sur « Jean » ne doit retourner que les données de Jean appartenant au tenant courant.

## 8. Notifications

Les notifications doivent respecter simultanément `tenantId` **et** `userId`. Un utilisateur ne doit jamais voir les notifications d'un autre tenant.

## 9. Documents

Les documents doivent être filtrés par tenant. Un document d'un autre tenant ne doit jamais apparaître dans les listes, la recherche, l'historique, le téléchargement, ni le détail.

## 10. Audit

Un utilisateur tenant-scoped ne voit que les événements d'audit de son tenant. Les logs d'un autre tenant sont totalement invisibles.

## 11. RBAC et isolation tenant — deux conditions simultanées

Le RBAC ne remplace pas l'isolation tenant. Il faut satisfaire **simultanément** :

```
Tenant scope
+
Permission
```

Exemple : `permission = finance.accounts.read` **ET** `resource.tenantId = currentTenantId`. Les deux conditions sont obligatoires — l'une ne dispense jamais de l'autre.

*Cohérence avec le modèle déjà verrouillé* : le RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`) est déjà scopé par `tenant_id` sur chacune de ces tables (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2, §5) — un rôle défini pour un tenant ne doit jamais être appliqué dans le contexte d'un autre tenant. Cette règle en est le corollaire côté vérification d'accès aux ressources métier.

## 12. Responsabilité backend

Le frontend ne constitue pas la sécurité finale — il doit transmettre le contexte nécessaire (`tenantId`, credentials). Le backend doit systématiquement vérifier :

```
authenticatedUser
+
authorizedTenant
+
resource.tenantId
+
permission
```

## 13. Principe absolu

> Pour un utilisateur tenant-scoped : si la donnée n'appartient pas au tenant courant, elle n'existe pas du point de vue de l'application.

## 14. Tests obligatoires

Une future implémentation devra couvrir au minimum :

1. Utilisateur T-001 → données T-001 visibles.
2. Utilisateur T-001 → données T-002 invisibles.
3. URL directe vers une ressource T-002 → `NotFound`.
4. Recherche → uniquement T-001.
5. Dashboard → uniquement T-001.
6. Notifications → uniquement T-001.
7. Documents → uniquement T-001.
8. Audit → uniquement T-001.
9. Changement de tenant autorisé → purge/rechargement correct des données en cache.
10. Aucun tenant non autorisé dans le `TenantSwitcher`.
11. Aucune donnée cross-tenant après `refresh`.
12. Aucune donnée cross-tenant après navigation back/forward.

---

## Lien avec le modèle canonique

Cette spécification ne modifie aucune décision déjà verrouillée dans `PHASE_02_MODELE_CANONIQUE_FINAL.md` — elle en durcit l'application. Rappels de cohérence :

- L'architecture de propagation (§2 ci-dessus) est identique à celle du §4 du modèle canonique — aucune divergence.
- La règle « le frontend n'est pas l'autorité de sécurité, le backend reste juge final » (§12 ci-dessus) reprend telle quelle la doctrine déjà actée (`AUDIT_PHASE_01.md` C-12, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4).
- Le statut d'implémentation reste inchangé : cette spec est une cible, pas un constat — le contexte tenant n'est toujours câblé nulle part dans le code (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §9 point 7, non affecté par ce document).
- Aucune contradiction identifiée entre cette spécification et le reste du modèle verrouillé.

Aucun fichier de `src/` n'a été modifié. ATTENDS TA VALIDATION.
