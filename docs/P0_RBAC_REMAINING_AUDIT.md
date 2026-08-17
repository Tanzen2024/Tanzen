# TANZEN FRONTEND — P0 RBAC — Audit read-only des sujets restants : `permissions` / `role_permissions` / `users_roles`

**Statut : audit, strictement lecture seule.** Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `locales/` n'a été modifié, créé ou supprimé pour produire ce document. `git status` confirmé identique avant/après (voir §18). D1/D2/D3 (RBAC, verrouillées) ne sont pas rouvertes.

---

## 1. Résumé exécutif

Le P0 RBAC (`docs/P0_RBAC_IMPLEMENTATION_REPORT.md`) a rendu `roles` tenant-scopé, construit son CRUD dans `tanzen-frontend`, et sécurisé `users ↔ roles` côté service. Cette mission vérifie si `permissions`, `role_permissions` et `users_roles` nécessitent une implémentation supplémentaire. **Conclusion : non, pour les Use Cases réellement validés** — les représentations dénormalisées déjà en place (`SystemRole.permissions`, `SystemUser.roleIds`) restent fonctionnellement suffisantes, aucun CRUD `permissions` n'est demandé par les sources (Platform-only, hors périmètre `tanzen-frontend`), et aucune entité de jonction propre n'est requise par un Use Case non déjà satisfait.

**Mais cette mission a eu accès direct, pour la première fois dans cette série d'audits RBAC, aux fiches canoniques exactes de `roles`/`permissions`/`role_permissions`/`users_roles`/`modules`** (`docs/audit/excel_dictionary_dump.txt`, fiches #47-51 — non consultées de cette manière par `docs/P0_RBAC_AUDIT.md`, qui s'appuyait sur des résumés de phases antérieures). Ceci révèle **une contradiction substantielle et jusqu'ici non détectée** : le catalogue de permissions du code (`permissionCatalog`, `mocks/rbac.mocks.ts`) utilise 3 suffixes d'action (`manage`, `revoke`, `download`) absents de la contrainte `CHECK` canonique sur `permissions.action` (qui n'autorise que `CREATE, READ, UPDATE, DELETE, APPROVE, EXPORT, IMPORT`) — 13 permissions sur 78 concernées. Voir §12/§22 (C-RBAC-08) et `docs/P0_RBAC_REMAINING_DECISIONS_A_VALIDER.md` (D-RBAC-01). Non bloquant pour l'existant, mais une vraie divergence à trancher.

Cette mission a également confirmé, par relecture directe du code livré par le P0 RBAC, **un gap de sécurité réel** (non un nouveau bug introduit, un angle mort du mandat D3 tel qu'implémenté) : la garde service-side ajoutée pour D3 (`rolesBelongToTenant`) vérifie uniquement la cohérence tenant, jamais `role.scope` — la garde anti-élévation de privilège (« un acteur `scope:tenant` ne peut pas s'auto-accorder un rôle `scope:platform` ») reste **uniquement côté UI** (`RolePicker`), contournable par un appel direct au service. Voir §20.

---

## 2. État post-P0 RBAC (rappel, non réaudité en détail — voir `docs/P0_RBAC_IMPLEMENTATION_REPORT.md`)

`roles` : tenant-scopé, CRUD complet dans `tanzen-frontend`, 149/149 tests, 12/12 Playwright. `users ↔ roles` : `RolePicker` (UI) + `rolesBelongToTenant` (service) — tenant vérifié aux deux niveaux, scope vérifié uniquement UI (voir §20). `role.service.ts` : aucun paramètre `scope`, isolation stricte par construction.

---

## 3. Audit `permissions`

### 3.1 Modèle canonique (fiche #50, `docs/audit/excel_dictionary_dump.txt` lignes 1261-1281)

| Champ | Type | Contrainte |
|---|---|---|
| `id` | BIGINT | PK |
| `uuid` | CHAR(36) | NOT NULL, UNIQUE |
| `module_id` | BIGINT | **FK → modules.id** |
| `code` | VARCHAR(150) | NOT NULL, ex. `loans.create` |
| `action` | VARCHAR(50) | NOT NULL, `CHECK IN ('CREATE','READ','UPDATE','DELETE','APPROVE','EXPORT','IMPORT')` |
| `name` | VARCHAR(150) | NOT NULL |
| `description` | TEXT | nullable |
| `created_at` | TIMESTAMP | — |
| `created_by`/`updated_by` | BIGINT | FK → users.id, nullable |

Contraintes : `UNIQUE(uuid)`, `UNIQUE(code)`, `UNIQUE(module_id, action)`, `CHECK(action IN [7 valeurs])`, `CHECK(module_id NOT NULL)`, `CHECK(code LIKE '%.%')`. **Aucun `tenant_id`** — catalogue global, confirmé (cohérent avec toutes les analyses antérieures). **Aucun champ `scope`** dans la fiche.

**Point structurant non capturé par les audits précédents** : `module_id` est une **FK vers une table `modules` distincte** (fiche #47 : `id, uuid, code, name, description, is_active, created_at, updated_at, created_by, updated_by` — catalogue global lui aussi, pas de `tenant_id`), pas un préfixe de chaîne libre. Le modèle canonique normalise `permissions.module` en une véritable entité, avec son propre `is_active` (activation/désactivation d'un module entier).

### 3.2 Code réel

Recherche exhaustive (`permission`, `Permission`, `permission.service`, `PermissionContext`, `PermissionGate`, `can(`, `hasPermission`, `rbac`) dans `src/` :

| Élément | Fichier | Statut |
|---|---|---|
| Catalogue | `mocks/rbac.mocks.ts` (`permissionCatalog: Permission[]`, 78 entrées) | **Réellement fonctionnel** — consommé par `can()`, `PermissionGate`, `PermissionRoute` sur 8 routes et des dizaines de boutons |
| Type | `Permission = string` | Représentation dénormalisée `module.action` — pas de `module_id`/`action` séparés, pas d'entité `Module` |
| Service | `role.service.ts` — `listPermissions()` | Lecture seule, inchangé par le P0 RBAC |
| Context | `contexts/permission-context.tsx` — `usePermissions()`, `can(permission, entityType?)` | Fonctionnel, teste `currentUser.permissions.includes(permission)` |
| Guards | `components/permission-gate.tsx`, `routes/permission-route.tsx` | Fonctionnels, inchangés |
| `hasPermission`/`hasAnyPermission`/`hasAllPermissions` | — | **Inexistants**, aucun composant n'en a besoin (un seul test de présence à la fois partout) |
| CRUD | — | **Aucun** — `create`/`update`/`delete` sur `permissions` n'existent nulle part |
| Entité `Module` | — | **Absente** — `MODULE_KEY: Record<string,string>` (`permission-matrix.tsx`) est une table de libellés i18n statique dérivée par `splitPermission()` (découpage de chaîne), pas une entité de données |

**Classification** : `permissions` = **PARTIALLY_IMPLEMENTED** (lecture réellement fonctionnelle, écriture absente par choix architectural déjà tranché, pas par oubli).

### 3.3 CRUD Permissions requis ?

**Non.** UC20-19 à 22 (« Créer/Modifier/Supprimer/Affecter une permission ») restent, comme déjà établi par `PHASE_10_DECISIONS_A_VALIDER.md` §1 et confirmé par `docs/P0_RBAC_AUDIT.md` §5/§12, strictement **PLATFORM**, acteur **Super Administrateur** exclusivement — jamais « Administrateur Tenant ». Contrairement à UC20-15/16/17/18 (Rôles, marqués `Transversal`, qui ont justifié D2=A pour `roles`), aucune source ne mentionne un acteur tenant pour la gestion des permissions elles-mêmes. Un Tenant Admin **affecte** des permissions déjà existantes à un rôle (via le catalogue en lecture seule, déjà possible depuis `RoleFormFields`/`PermissionPicker`) — il ne **crée** jamais de nouvelle permission. **Conclusion explicite : le CRUD Permissions n'est pas nécessaire dans `tanzen-frontend`.**

### 3.4 Permissions Platform vs Tenant — le mot « scope »

Trois axes distincts, à ne jamais confondre (déjà noté C-RBAC-02 dans `docs/P0_RBAC_AUDIT.md`, reconfirmé ici avec la preuve canonique directe) :

1. **`permission.scope`** : **n'existe pas** dans le modèle canonique (`permissions` n'a pas de colonne `scope`) ni dans le code (`Permission = string`, pas d'objet avec un champ `scope`). Toute permission est un identifiant plat, sans notion de portée propre.
2. **`SystemRole.scope: 'tenant'|'platform'`** : existe dans le code, **n'existe pas** dans le modèle canonique (`roles` n'a pas de colonne `scope`, cf. §11). C'est un champ hérité, conservé par le P0 RBAC comme marqueur RBAC interne (rôle le plus élevé du catalogue d'un tenant), documenté comme tel dans `mocks/rbac.mocks.ts`.
3. **`CurrentUser.scope`** (résolu depuis les rôles portés) : même statut que 2 — un dérivé du champ 2, pas une notion canonique.

**Qui peut définir une permission ?** Le modèle canonique ne le précise pas explicitement au-delà de `created_by`/`updated_by` (FK vers `users.id`, sans contrainte de rôle) — mais UC20-19-22 tranche l'acteur fonctionnel (Super Administrateur, Platform). **Qui peut les consommer ?** Tout `SystemRole` via `role_permissions` (§4). **Le Tenant Admin peut-il les affecter (pas les créer) ?** Oui, déjà possible et déjà implémenté (§3.3).

---

## 4. Audit `role_permissions`

### 4.1 Modèle canonique (fiche #51, lignes 1283-1295)

| Champ | Type | Contrainte |
|---|---|---|
| `id` | BIGINT | PK |
| `role_id` | BIGINT | FK → roles.id |
| `permission_id` | BIGINT | FK → permissions.id |
| `tenant_id` | BIGINT | FK → tenants.id, **« Isolation tenant »** |
| `granted` | BOOLEAN | DEFAULT TRUE |
| `created_at` | TIMESTAMP | — |

Contraintes : `UNIQUE(role_id, permission_id)` (empêche une même paire d'apparaître deux fois). `tenant_id` est **redondant mais explicite** (dérivable de `role_id → roles.tenant_id`, mais matérialisé sur la table de jonction elle-même — un choix de dénormalisation canonique pour l'indexation/les contraintes, pas une incohérence). **Point structurant nouveau** : `granted: BOOLEAN DEFAULT TRUE` implique qu'une ligne `role_permissions` peut exister avec `granted = FALSE` — une **révocation explicite**, sémantiquement différente d'une simple absence de ligne. Aucune fiche/UC ne documente de cas d'usage pour cette distinction (aucun UC « Révoquer une permission d'un rôle sans la retirer du catalogue »).

### 4.2 Code réel

`SystemRole.permissions: Permission[]` — tableau imbriqué directement dans le rôle, pas d'entité de jonction séparée. Classification (mandat §12, options A-E) :

**B — le modèle fonctionnel actuel**, avec des éléments de **D — abstraction volontaire**. Justification par le code réel : `RoleFormFields`/`PermissionPicker` (`access-module.tsx`, ajoutés par le P0 RBAC) permettent déjà de composer entièrement l'ensemble de permissions d'un rôle à la création/modification — la fonctionnalité utilisateur attendue (« quelles permissions ce rôle a-t-il ? ») est déjà pleinement couverte sans entité séparée. Ce n'est ni un mock temporaire (C) ni une divergence non maîtrisée (E) — c'est un choix délibéré, cohérent avec le traitement déjà accepté de `role_permissions` dans `docs/P0_RBAC_AUDIT.md` §6.

### 4.3 Question centrale : matérialiser `role_permissions` maintenant ?

**Non — Option A recommandée** (conserver `SystemRole.permissions` comme représentation frontend, `role_permissions` comme structure de persistance backend future).

| Critère | Analyse |
|---|---|
| Bénéfices d'Option B (matérialiser maintenant) | Alignement canonique immédiat ; permettrait la sémantique `granted=false` (révocation explicite) |
| Risques d'Option B | Aucun UC ne demande la distinction révocation/non-assignation — construire cette nuance serait une anticipation non sourcée ; complexifie `RoleFormFields`/`PermissionPicker` sans bénéfice utilisateur identifié |
| Complexité | Option B nécessiterait une nouvelle entité mock, un nouveau service, une réécriture de `PermissionPicker`/`PermissionMatrix` (aujourd'hui des `Set<Permission>`/`Permission[]` simples) pour manipuler des lignes `{roleId, permissionId, granted}` |
| Impact Roles | Aucun changement de `RoleDetail`/`RolesList` nécessaire sous A |
| Impact Permissions | Aucun — catalogue global inchangé sous A |
| Impact Users | Aucun — `UserPermissionsTab` calcule déjà les permissions effectives via `role.permissions`, fonctionne identiquement sous A |
| Impact backend futur | Le futur backend peut matérialiser `role_permissions` sans que cela ne force un changement de l'API consommée par le frontend (`GET /roles/:id` peut retourner `permissions: string[]` calculé côté serveur à partir de `role_permissions WHERE granted=true`, exactement la forme actuelle) |
| Migration | Nulle aujourd'hui ; le jour d'un vrai backend, la migration se ferait côté API, pas côté frontend |
| Tests | Aucun test supplémentaire requis pour A ; B nécessiterait de réécrire une partie de `role.service.test.ts`/`permission-gate.test.tsx` |
| Risque de doublon | **Élevé si B est fait maintenant** — le frontend maintiendrait deux représentations concurrentes tant que le backend n'existe pas (celle déjà utilisée par `can()`/`PermissionGate`, et une nouvelle table de jonction), sans bénéfice fonctionnel immédiat |

**Recommandation : CONSERVER** (Option A).

---

## 5. Audit `users_roles`

### 5.1 Modèle canonique (fiche #49, lignes 1249-1259)

| Champ | Type | Contrainte |
|---|---|---|
| `id` | BIGINT | PK |
| `tenant_id` | BIGINT | FK → tenants.id, **« Contexte utilisateur »** |
| `user_id` | BIGINT | FK → users.id |
| `role_id` | BIGINT | FK → roles.id |
| `created_at` | TIMESTAMP | — |

Contrainte : `UNIQUE(user_id, role_id, tenant_id)` — empêche une double affectation identique. **Aucun `updated_at`, aucun `deleted_at`, aucun `created_by`** — une table de liaison volontairement minimale (affectation = un événement, pas un enregistrement versionné), cohérent avec ce qu'un UC de type « Affecter un rôle » (UC20-16) demande réellement.

### 5.2 Code réel

`SystemUser.roleIds: string[]` — tableau dénormalisé sur l'utilisateur, mécanismes consommateurs : `RolePicker` (UI, sélection filtrée par tenant depuis le P0 RBAC), `userService.create`/`update` (D3, validation `rolesBelongToTenant` — tenant uniquement, voir §20), `role.service.ts` (`listUsersForRole`, filtre inverse), `access-module.tsx` (`RolesTab`, `UserPermissionsTab`, `roleNames()`).

`roleIds` **suffit** pour l'usage frontend actuel : créer/éditer un utilisateur avec un ou plusieurs rôles fonctionne pleinement (`UserFormFields`/`RolePicker`), et la contrainte canonique `UNIQUE(user_id, role_id, tenant_id)` est **partiellement** respectée — `RolePicker` empêche la duplication à l'écran (`toggle()` bascule via `.includes()`), mais **aucune garde service-side n'empêche un doublon dans `roleIds` soumis directement au service** (ex. `userService.update(..., { roleIds: ['role-viewer', 'role-viewer'] }, ...)` serait accepté silencieusement). Ce point est distinct de ce que `docs/P0_RBAC_AUDIT.md` §15 avait déjà signalé (absence de validation d'existence d'un `roleId`) — c'est une absence de validation d'**unicité**, une facette différente du même point plus large « aucune validation de forme sur `roleIds` soumis au service ».

### 5.3 Tenant isolation `users_roles` (D3)

Vérifié par relecture directe du code livré (pas de nouveau test écrit ici, conformément au mandat) :

| Scénario | Vérification |
|---|---|
| T-001 User + T-001 Role → autorisé | `rolesBelongToTenant(roleIds, tenantId)` retourne `true` si chaque `roleId` a `role.tenantId === tenantId` — confirmé par `user.service.test.ts` (« D3 (P0 RBAC): create() refuses a roleId belonging to another tenant » et le test symétrique sur `update()`) |
| T-001 User + T-002 Role → refusé | Même fonction, retourne `false` → `update()`/`create()` retournent `undefined` (refus, pas de filtrage silencieux) — confirmé par les mêmes tests, déjà exécutés et verts (149/149 au dernier passage documenté) |

**D3 est effectivement respectée pour la dimension tenant.** Voir §20 pour la dimension `scope`/élévation, non couverte par cette garde.

### 5.4 Question centrale : matérialiser `users_roles` maintenant ?

**Non — Option C recommandée** (conserver `roleIds` maintenant, documenter la migration future).

| Critère | Analyse |
|---|---|
| Option A (conserver `roleIds`, statu quo) | Fonctionne déjà pleinement pour Create/Edit User ; aucun UC ne demande un historique d'affectation (« qui a affecté ce rôle, quand ») |
| Option B (créer `users_roles` maintenant) | Bénéfice principal : audit trail (`created_at`/futur `created_by`) — mais aucune source (UC, mandat) ne le demande ; complexifierait `UserFormFields`/`userService` sans bénéfice utilisateur visible aujourd'hui |
| Option C (statu quo + migration documentée) | Retenue — capture le meilleur des deux : pas de sur-ingénierie maintenant, mais le chemin de migration est explicite pour ne pas être découvert en urgence le jour du backend réel |

**Recommandation : CONSERVER + documenter** (Option C). Migration future (description, pas de code) : le jour d'un backend réel, `POST /users/:id/roles`/`DELETE /users/:id/roles/:roleId` matérialiseraient chacun une ligne `users_roles` avec `created_at` ; le frontend n'aurait qu'à consommer `GET /users/:id` retournant `roleIds: string[]` (forme API inchangée), la table de jonction restant un détail d'implémentation serveur.

---

## 6-9. Voir sections dédiées ci-dessus (6=Modèle canonique intégré à 3.1/4.1/5.1, 7=Code réel intégré à 3.2/4.2/5.2, 8=Use Cases voir §19, 9=Tenant isolation voir §5.3/§20)

---

## 10-17. Sécurité, doublons, contradictions, backend pending, matrices, GO/NO-GO

### §20 Sécurité (RBAC Security Review, mandat §20)

| Risque | Statut post-P0 RBAC |
|---|---|
| Escalade de privilège via `roleIds` soumis directement au service | **Partiellement corrigé.** Le tenant est désormais vérifié (`rolesBelongToTenant`), mais **`role.scope` ne l'est pas** — un acteur `scope: tenant` du Tenant A pourrait, via un appel direct à `userService.update`/`create` (contournant `RolePicker`), s'auto-affecter ou affecter à un tiers le rôle `role-admin` (ou tout autre rôle `scope: platform`) **de son propre tenant**, sans qu'aucune garde service-side ne s'y oppose. C'est un **gap réel, confirmé par lecture directe du code** (`user.service.ts` lignes 16-18, 52, 76) — la garde anti-élévation reste strictement UI (`RolePicker`, `access-module.tsx` ligne ~97-100). |
| Affectation d'un rôle d'un autre tenant | **Corrigé** (D3, `rolesBelongToTenant`, testé). |
| Affectation d'une permission non autorisée | Sans objet directement — les permissions d'un rôle sont composées à la création/modification du **rôle** (`RoleFormFields`/`PermissionPicker`), pas affectées individuellement à un utilisateur ; aucune garde manquante identifiée à ce niveau. |
| Modification d'un rôle hors tenant | **Corrigé** (`role.service.ts` `update`/`delete`, `getTenantScoped`, testé). |
| Contournement du `RolePicker` | **Partiellement corrigé** — voir ligne 1 (tenant oui, scope non). |
| Appel direct au service | Même constat — tenant refusé, élévation de scope non refusée. |
| Manipulation de données mock | Hors périmètre frontend réel (`BACKEND_PENDING` général, pas spécifique à ce sujet). |
| Incohérence `PermissionContext`/`TenantContext` | **Aucune trouvée** — `PermissionContext` reste un pur pass-through de `currentUser` (inchangé par le P0 RBAC), `TenantContext` inchangé ; les deux restent indépendants comme déjà documenté (`docs/P0_RBAC_AUDIT.md` §10), sans régression. |

**Conforme au mandat : aucune correction appliquée.** Ce gap est documenté, pas corrigé, dans cette mission strictement read-only.

### Doublons (§21)

| Paire | Nature |
|---|---|
| `SystemRole.permissions` / `role_permissions` (canonique) | **Représentation frontend/backend légitime** (mandat catégorie « B/D »), pas un doublon de code — une seule source de vérité existe dans le frontend (le tableau), la table canonique n'a pas d'équivalent frontend concurrent. |
| `SystemUser.roleIds` / `users_roles` (canonique) | Même nature — représentation frontend légitime, pas de doublon. |

**Aucun doublon réel trouvé** — les deux paires sont des projections frontend/backend d'un même concept, pas deux implémentations concurrentes du même mécanisme.

### Contradictions (§22)

| # | Sujet | Source A | Source B | Priorité | Impact | Bloquant |
|---|---|---|---|---|---|---|
| C-RBAC-08 (nouveau) | `permissions.action` — enum canonique vs catalogue réel | Dictionnaire (fiche #50) : `CHECK(action IN ('CREATE','READ','UPDATE','DELETE','APPROVE','EXPORT','IMPORT'))` | Code (`mocks/rbac.mocks.ts`) : 13 permissions sur 78 utilisent `manage`/`revoke`/`download`, absents du `CHECK` canonique ; `IMPORT` n'est utilisé nulle part dans le code | Dictionnaire (source canonique désignée) | Aucune fonctionnalité livrée n'est cassée (le frontend n'impose aucune contrainte `CHECK` lui-même) — mais un futur backend implémentant le `CHECK` littéralement rejetterait 13 permissions déjà en production frontend | **Non bloquant pour l'existant, DECISION_REQUIRED avant tout backend réel** — voir D-RBAC-01 |
| C-RBAC-09 (nouveau) | `permissions.module_id` FK vs `Permission` chaîne plate | Dictionnaire : `module_id BIGINT FK → modules.id`, table `modules` distincte (fiche #47) | Code : `Permission = string`, module dérivé par découpage de chaîne (`splitPermission()`), aucune entité `Module` | Dictionnaire | Aucun — le frontend ne fait jamais de CRUD sur `permissions`/`modules`, cette normalisation ne concerne qu'un futur backend | Non bloquant, non traité ici (hors périmètre `tanzen-frontend`, cohérent avec §3.3) |
| C-RBAC-10 (nouveau) | `roles.code`/`roles.is_system` — champs canoniques absents du type frontend | Dictionnaire (fiche #48) : `code VARCHAR(100) NOT NULL` (distinct de `name`), `is_system BOOLEAN DEFAULT FALSE` | Code (`SystemRole`, P0 RBAC) : ni `code` ni `is_system` n'existent — seuls `id`/`name`/`description`/`permissions`/`scope`/`tenantId` | Dictionnaire | `roles.code` aurait permis un identifiant métier stable distinct de `id` (aujourd'hui confondus, `id: 'role-admin'` joue les deux rôles) ; `is_system` aurait permis de distinguer les 3 rôles de base (natifs) des rôles créés par un Tenant Admin, notamment pour une future règle « un rôle système ne peut pas être supprimé/renommé » — **absente aujourd'hui**, ce qui explique en partie pourquoi la seule garde de suppression actuelle est l'intégrité référentielle (rôle assigné), pas un flag `is_system` explicite | **Contexte uniquement** (le mandat §18 demande de prendre `roles` en compte comme contexte, pas de le ré-auditer en profondeur) — signalé, non bloquant, non traité |
| C-RBAC-11 (nouveau) | `role_permissions.granted` — révocation explicite non représentable | Dictionnaire : `granted BOOLEAN DEFAULT TRUE` | Code : `SystemRole.permissions` — présence/absence uniquement, pas de ligne `granted=false` | Dictionnaire | Aucun — aucun UC ne demande cette distinction (§4.1) | Non bloquant |
| C-RBAC-12 (nouveau, sécurité) | Garde anti-élévation D3 : tenant vérifié, scope non vérifié | `RolePicker` (UI) : filtre par `role.scope` | `userService.create`/`update` (service, D3) : filtre uniquement par `tenantId`, jamais `scope` | Le service devrait, en toute rigueur, répliquer la même garde que l'UI (défense en profondeur déjà appliquée pour le tenant) | Un acteur `scope:tenant` pourrait s'élever à `scope:platform` **au sein de son propre tenant** via un appel direct au service | Voir §20 — non bloquant pour l'usage normal (RolePicker empêche ce chemin dans l'UI), mais un vrai gap de défense en profondeur |

### Backend Pending (§23)

| Élément | Architecture frontend | Fonctionnalité persistée |
|---|---|---|
| Persistance des rôles | Suffisante (mock en mémoire) | **Non** — perdu au rechargement, comme tout le reste du projet |
| Persistance permissions | Suffisante (catalogue statique) | Sans objet — pas de CRUD prévu côté frontend |
| `role_permissions` | Suffisante en représentation dénormalisée (§4.3) | **Non matérialisée** — mais l'architecture frontend actuelle n'a pas besoin qu'elle le soit pour fonctionner |
| `users_roles` | Suffisante en représentation dénormalisée (§5.4) | **Non matérialisée** — même constat |
| Validation serveur (tenant + scope) | Partiellement répliquée côté frontend (tenant oui, scope non — §20) | **Non** — le frontend n'est jamais l'autorité finale, quel que soit l'état de ses propres gardes |
| Résolution serveur RBAC | `currentUser.permissions` figé à la compilation | **Non** |
| Prévention définitive de l'escalade | Aucune côté frontend ne peut l'être par construction | **Non — dépend intégralement du backend** |
| Audit serveur RBAC | Module `Audit` existant couvre d'autres domaines, pas spécifiquement les mutations RBAC (non vérifié en détail, hors périmètre de cette mission) | **Non** |

### Matrice RBAC (§18/§14)

| Entité | Canonique | Code actuel | Fonctionnel | CRUD requis | Tenant-scoped | Backend |
|---|---|---|---|---|---|---|
| roles (contexte) | `tenant_id NOT NULL`, `code`, `is_system` | `SystemRole.tenantId` ✓, `code`/`is_system` absents (C-RBAC-10) | Oui, CRUD complet (P0 RBAC) | Déjà livré | ✓ | BACKEND_PENDING |
| permissions | Global, `module_id` FK, `action` enum 7 valeurs | `Permission = string`, global ✓, `action` divergent (C-RBAC-08) | Lecture seule, fonctionnelle | **Non** (Platform, hors périmètre) | N/A (global) | BACKEND_PENDING |
| role_permissions | Table de jonction, `tenant_id`, `granted` | `SystemRole.permissions[]` dénormalisé | Oui, pleinement (via `RoleFormFields`) | **Non** | Hérité de `roles` | BACKEND_PENDING |
| users_roles | Table de jonction, `tenant_id`, `UNIQUE(user,role,tenant)` | `SystemUser.roleIds[]` dénormalisé | Oui, pleinement | **Non** | ✓ (D3, tenant vérifié ; scope non vérifié service-side, §20) | BACKEND_PENDING |

### Use Cases (§19)

Aucun UC nouveau identifié au-delà de ceux déjà cités par `docs/P0_RBAC_AUDIT.md` §12 (UC10-07, UC20-15 à UC20-22). Mise à jour de statut post-P0 RBAC :

| UC | Description | Acteur | État avant P0 RBAC | État après |
|---|---|---|---|---|
| UC20-15 | Supprimer un rôle | Admin Tenant, Super Admin | DECISION_REQUIRED | **IMPLEMENTED** (`roleService.delete`, garde d'intégrité référentielle) |
| UC20-16 | Affecter un rôle | Admin Tenant, Super Admin | PARTIALLY_IMPLEMENTED | **IMPLEMENTED** (tenant vérifié ; élévation non vérifiée service-side, §20) |
| UC20-17 | Créer un rôle | Admin Tenant, Super Admin | DECISION_REQUIRED | **IMPLEMENTED** (`roleService.create`) |
| UC20-18 | Modifier un rôle | Admin Tenant, Super Admin | DECISION_REQUIRED | **IMPLEMENTED** (`roleService.update`) |
| UC20-19 à 22 | CRUD Permissions | Super Administrateur (Platform) | OUT_OF_SCOPE | **Inchangé, toujours OUT_OF_SCOPE** (confirmé §3.3) |
| UC10-07 | Gérer les rôles et permissions | Admin Tenant | DECISION_REQUIRED | **Rôles : IMPLEMENTED. Permissions : consultation + affectation à un rôle déjà possibles ; création/modification/suppression de permissions : OUT_OF_SCOPE (Platform)** |

Aucun UC ne nomme explicitement `role_permissions`/`users_roles` comme sujet autonome — confirmé, aucun UC inventé.

---

## 18. Vérification finale — aucune modification

```
git status --short
```
Identique avant/après cette mission — seuls `docs/P0_RBAC_REMAINING_AUDIT.md` (ce document) et `docs/P0_RBAC_REMAINING_DECISIONS_A_VALIDER.md` sont nouveaux. Aucun fichier `src/`/`app/`/`tests/`/`mocks/`/`locales/` modifié. `tanzen-commercial`/`tanzen-mobile` non inspectés dans cette mission (non nécessaire — le sujet est entièrement interne à `tanzen-frontend`).

---

## Classification finale

| Sujet | Statut |
|---|---|
| `permissions` | 🟡 **PARTIAL** — lecture fonctionnelle et suffisante ; CRUD délibérément absent (hors périmètre, Platform) |
| `role_permissions` | 🟡 **PARTIAL** — représentation dénormalisée fonctionnellement complète ; entité de jonction propre non matérialisée (choix assumé, pas un oubli) |
| `users_roles` | 🟡 **PARTIAL** — représentation dénormalisée fonctionnellement complète et tenant-validée (D3) ; entité de jonction propre non matérialisée |

Aucun des trois n'est `MISSING` (une fonctionnalité manquante impliquerait qu'un UC validé ne soit pas satisfait — ce n'est le cas pour aucun des trois) ni `IMPLEMENTED` au sens strict du modèle canonique (aucune table de jonction physique, catalogue de modules absent) — `PARTIAL` reflète fidèlement : fonctionnellement complet pour l'usage réel, structurellement divergent du schéma canonique par choix assumé.

---

## GO / NO-GO

### `permissions`
**GO** pour l'état actuel (lecture seule, catalogue global) — aucune action requise. **NO-GO** (non pertinent) pour un CRUD — hors périmètre par design (D2-adjacent), pas un manque.

### `role_permissions`
**GO** pour conserver `SystemRole.permissions` tel quel — aucune action requise avant l'existence d'un backend réel.

### `users_roles`
**GO** pour conserver `SystemUser.roleIds` tel quel — aucune action requise avant l'existence d'un backend réel.

### Conclusion globale

**P0 RBAC PARTIEL** — et non « COMPLET » au sens strict, pour une raison précise et volontairement non arrondie : cette mission a détecté une contradiction réelle et jusqu'ici non documentée entre le catalogue de permissions du code et la contrainte `CHECK` canonique sur `permissions.action` (C-RBAC-08), ainsi qu'un gap de défense en profondeur sur la garde anti-élévation (C-RBAC-12). Ni l'un ni l'autre ne bloque une fonctionnalité déjà livrée ou un Use Case validé — **au sens fonctionnel, l'architecture actuelle satisfait intégralement les Use Cases validés, sans doublon et sans contredire le modèle canonique sur `role_permissions`/`users_roles` eux-mêmes** (seule `permissions.action` diverge, un sujet de catalogue, pas de structure). Mais l'affirmation « P0 RBAC COMPLET » masquerait ces deux constats réels. Voir `docs/P0_RBAC_REMAINING_DECISIONS_A_VALIDER.md` pour D-RBAC-01.

---

## Recommandation d'architecture

| Sujet | Recommandation |
|---|---|
| `permissions` (CRUD) | **REPORTER AU BACKEND** — aucun CRUD frontend, jamais dans `tanzen-frontend` (Platform-only par les UC sources) |
| `permissions.action` (catalogue) | **COMPLÉTER** — trancher D-RBAC-01 avant tout backend réel (ne bloque rien aujourd'hui) |
| `role_permissions` | **CONSERVER** — `SystemRole.permissions` reste la représentation frontend cible, y compris après l'arrivée d'un backend (l'API peut exposer la même forme) |
| `users_roles` | **CONSERVER** — `SystemUser.roleIds` reste la représentation frontend cible, migration décrite en §5.4 si un jour nécessaire |
| Garde anti-élévation service-side (`role.scope`) | Non couverte par les 3 sujets de cette mission au sens strict (relève de `users`/D3, déjà `TERMINÉ`) — signalée en sécurité (§20), pas une recommandation d'architecture RBAC nouvelle, mais à considérer lors d'une future mission dédiée si le Product Owner le juge prioritaire |

---

## Périmètre d'implémentation éventuel

**Aucun.** Sur la base des sources et du code réellement inspectés :

- `permissions` : aucun CRUD nécessaire (confirmé §3.3).
- `role_permissions` : conserver `SystemRole.permissions`, mapping backend futur sans impact frontend (confirmé §4.3).
- `users_roles` : conserver `roleIds`, validation tenant déjà présente (D3), migration future documentée sans urgence (confirmé §5.4).

Le seul travail restant identifié par cette mission est **décisionnel** (D-RBAC-01, catalogue `action`) et **de sécurité** (garde d'élévation service-side, déjà signalée, non couverte par une nouvelle décision — voir le document des décisions pour la raison).

---

## Conclusion

Le P0 RBAC est fonctionnellement complet pour tout ce que les Use Cases validés demandent sur `permissions`/`role_permissions`/`users_roles`. Aucune implémentation supplémentaire n'est recommandée pour ces trois sujets. Deux constats méritent l'attention du Product Owner sans bloquer quoi que ce soit aujourd'hui : une divergence de catalogue (`permissions.action`, D-RBAC-01) à trancher avant tout backend réel, et un gap de défense en profondeur sur la garde anti-élévation (déjà signalé, ne nécessitant pas une nouvelle décision produit — une clarification d'implémentation future si le Product Owner le priorise).

---

*Fin de l'audit. Voir `docs/P0_RBAC_REMAINING_DECISIONS_A_VALIDER.md` pour la décision D-RBAC-01, la seule nouvelle de cette mission.*
