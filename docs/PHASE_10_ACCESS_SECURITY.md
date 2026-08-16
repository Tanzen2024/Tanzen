# TANZEN ENTERPRISE — Phase 10 : Access & Security

**Statut : implémentation réelle, phase de sécurité.** Périmètre strictement limité à Access & Security (Users, Roles, Permissions, Sessions, MFA). Aucune protection existante n'a été affaiblie, aucun mécanisme de permission remplacé, aucune permission ni politique de sécurité inventée. Une large partie de cette phase a consisté à **vérifier** (pas modifier) l'architecture de sécurité déjà en place, conformément au §1 du mandat.

## Méthodologie

Lecture intégrale avant toute modification : l'architecture de sécurité elle-même (`PermissionContext`, `PermissionRoute`, `PlatformScopeGuard`, `TenantContext`, `TenantSwitcher`, `tenant-scope.ts`, `rbac.mocks.ts`, `app-router.tsx`), puis `src/features/access/access-module.tsx` (339 lignes, en entier), `user.service.ts`, `role.service.ts`, `session.service.ts`, `src/mocks/access/{users,sessions}.ts`, croisés avec les blocs UC01/UC03/UC10/UC20 de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` et la section Users/NC-01/NC-02 de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`. Plan validé en mode plan avant implémentation.

---

## 1. Architecture sécurité

Vérifiée en lecture directe, **aucune modification** :

- `getTenantScoped(items, matches, tenantId, requesterScope)` (`tenant-scope.ts`) — `requesterScope === 'platform'` ne contourne l'isolation QUE pour les répertoires transverses (Tenants, Users) ; jamais les données métier d'un tenant.
- `can(permission)` (`PermissionContext`) — `currentUser.permissions.includes(permission)` : une permission absente ou inconnue retourne `false` par construction (pas de cas particulier à exploiter).
- `PermissionRoute` protège l'accès à la PAGE ; `PermissionGate` (inchangé) protège les ACTIONS — les deux mécanismes coexistent sans duplication de logique.
- `PlatformScopeGuard` — garde de **portée** (`user.scope !== 'platform'` → `/unauthorized`), indépendante de `PermissionRoute` (garde de **permission**) : les deux contrôles restent séparés (§17 du mandat), jamais fusionnés en un seul test.

## 2. Users

UC20-07/08/09/14 (profil, consultation) déjà `IMPLEMENTED`. UC20-10/11/12/13 (créer/modifier/désactiver/réactiver) `NOT IMPLEMENTED` avant cette phase → **IMPLEMENTED** :
- `UserCreate` : nom, email, tenant (sélecteur déjà scope-aware via `organizationService.listTenants`, réutilisé tel quel), rôles. **Aucun champ mot de passe.** Statut initial `invited`, MFA initial `disabled`/`none`/`[]`.
- `UserEdit` : mêmes champs, réutilise `userService.update`.
- Désactiver/Réactiver : bascule `status` entre `active`/`inactive` sur `UserDetail`.

## 3. Roles

Consultation (`RolesList`, `RoleDetail`, matrice de permissions par rôle) déjà `IMPLEMENTED`, inchangée. CRUD (UC20-15 à 18) **non implémenté** — déjà marqué « à valider » dans `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` lui-même (cf. C-09), non retranché ici (`docs/PHASE_10_DECISIONS_A_VALIDER.md` §2). `SystemRole` (RBAC) reste strictement distinct de `PositionRole` (fonctions de gouvernance Président/Trésorier/Secrétaire, Phase 6) — aucune confusion introduite, conforme au commentaire déjà présent dans `rbac.mocks.ts`.

## 4. Permissions

Consultation (`PermissionsPage`, catalogue avec rôles porteurs) déjà `IMPLEMENTED`, inchangée. CRUD (UC20-19 à 22) **non implémenté** — modifierait une constante partagée par tout le RBAC de l'application (`docs/PHASE_10_DECISIONS_A_VALIDER.md` §1).

## 5. Sessions

`sessionService.list/listByUser/revoke` déjà `IMPLEMENTED` et déjà correctement scope-gardé (`getTenantScoped(..., scope)`). Aucune modification — uniquement revérifié (§13).

## 6. MFA

Consultation (`MfaPage`, `UserMfaTab` : statut, méthode, appareils, codes de récupération) déjà `IMPLEMENTED` en lecture seule — le modèle de données (`MfaStatus`, `MfaMethod`, `MfaDevice`) était déjà entièrement présent dans les mocks avant cette phase. `mfa.manage` existe dans le catalogue mais reste inutilisé : aucun UC ne définit précisément l'action qu'il devrait couvrir → **DECISION REQUIRED** (`docs/PHASE_10_DECISIONS_A_VALIDER.md` §3). Aucun flux TOTP/QR code/SMS/recovery codes inventé.

## 7. Authentication

Inchangé — Sign In/Sign Up restent simulés (`BACKEND PENDING`), cohérent avec `docs/MIGRATION_SITE_VITRINE_REPORT.md`. Aucune authentification réelle prétendue ou ajoutée.

## 8. Platform scope

`PlatformScopeGuard` protège toujours `/platform/*` indépendamment de toute permission — revérifié, inchangé. `TenantSwitcher` (`src/layouts/tenant-switcher.tsx:16`) affiche une étiquette statique sans dropdown pour tout utilisateur `scope !== 'platform'` — revérifié en direct (§13).

## 9. Tenant scope

Toutes les nouvelles mutations (`userService.create`, `userService.update`) suivent le pattern déjà établi : `update` réutilise `getTenantScoped(users, ..., tenantId, scope)` (même garde que `get`, déjà existante) — jamais d'écriture sur un `userId` non vérifié tenant-scope.

## 10. RBAC

Aucune permission inventée : `users.create`/`users.update` existaient déjà dans le catalogue, jamais utilisées avant cette phase. **Mesure de sécurité ajoutée (pas une nouvelle politique inventée, une application directe du modèle de scope déjà existant)** : le sélecteur de rôles dans `UserCreate`/`UserEdit` (`RolePicker`) exclut les rôles `scope: 'platform'` (ex. `role-admin`) lorsque l'utilisateur courant est lui-même `scope: 'tenant'` — un administrateur tenant-scoped ne peut donc pas s'auto-accorder ou accorder à un tiers un accès inter-tenant qu'il n'a pas lui-même. Vérifié en direct (§13).

## 11. Routes

Aucune nouvelle garde de route nécessaire : `users/create` et `users/:id/edit` héritent de la garde déjà posée sur `/access-security/*` (`PermissionRoute permission="users.read"`) — cohérent avec le pattern déjà utilisé par tous les sous-écrans de création/édition des phases précédentes (Members, Tontines, Finance…), où seule l'action est gardée par `PermissionGate`, pas chaque sous-route individuellement. Aucun `pathname.split()`/`window.location.pathname` introduit ou préexistant.

## 12. Permission Gates

`users.create` gate le bouton de création (`UsersList`) ; `users.update` gate les boutons Modifier/Désactiver-Réactiver (`UserDetail`). Aucune comparaison `role === "Administrateur"` nulle part.

## 13. Cross-tenant tests

**Vérification directe en environnement** (`npm run dev`, headless Chrome + CDP) :
1. **Restriction anti-élévation de privilège** — bascule temporaire et réversible de l'utilisateur mocké courant vers un rôle `scope: 'tenant'` (`role-manager`), le temps de la vérification uniquement : le sélecteur de rôles de `UserCreate` n'affiche plus que « Gestionnaire »/« Lecture seule », « Administrateur Tenant » (`scope: platform`) disparaît de la liste ; le bouton « Platform Administration » et le `TenantSwitcher` interactif disparaissent également du header (confirmation croisée que la simulation de session tenant-scoped était authentique). Fichier `rbac.mocks.ts` restauré à l'identique immédiatement après.
2. **Isolation utilisateurs (§4, §25)** — sous cette même session simulée tenant-scoped, `UsersList` n'affiche que les 4 utilisateurs de T-001 (Coopérative Sutura), aucun des 8 utilisateurs des autres tenants.
3. **Création/désactivation** (session normale, `role-admin`) — création d'un utilisateur réel (`U-013`) avec le rôle « Lecture seule », navigation automatique vers sa fiche ; désactivation puis confirmation du changement de statut (`Inactif`, bouton devenu « Réactiver »).

Sessions/Permissions n'ont pas été re-testées en cross-tenant en direct dans cette phase (aucune mutation n'y a été ajoutée) — leur garantie vient du code déjà en place et déjà vérifié par lecture directe (§1, §5).

## 14. i18n

12 nouvelles clés (FR + EN) dans la section `access` : `fieldRequired`, `invalidEmail`, `saving`, `editUser`, `selectRoles`, `userCreated`, `userUpdated`, `deactivateUser`, `reactivateUser`, `deactivateUserConfirm`, `reactivateUserConfirm`, `userStatusChanged`. `createUser` existait déjà, pré-provisionné.

## 15. Themes

Uniquement les tokens shadcn déjà utilisés dans le module — aucun style codé en dur.

## 16. Accessibility

Chaque champ des formulaires a un `<Label htmlFor>` associé ; les cases à cocher du sélecteur de rôles sont enveloppées dans des `<label>` cliquables. `ConfirmDialog` conserve `role="dialog" aria-modal="true"`.

## 17. Responsive

Formulaires en `grid sm:grid-cols-2`, cohérent avec le pattern déjà établi dans les phases précédentes.

## 18. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — succès (6,9 s), même avertissement pré-existant sur la taille de chunk.

## 19. Use Case coverage

| UC | UI | Route | Service | Permission | Scope | Tenant isolation | Result |
|---|---|---|---|---|---|---|---|
| UC20-07/08/09/14 | Profil, consultation | `/access-security/users/:id` | `userService.get` | `users.read` | TENANT+PLATFORM | `getTenantScoped` | IMPLEMENTED |
| UC20-10 | Créer un utilisateur | `/access-security/users/create` | `userService.create` | `users.create` | selon tenant sélectionné | rôles restreints par scope | IMPLEMENTED |
| UC20-11 | Modifier un utilisateur | `/access-security/users/:id/edit` | `userService.update` | `users.update` | TENANT+PLATFORM | `getTenantScoped` | IMPLEMENTED |
| UC20-12/13 | Désactiver/Réactiver | `/access-security/users/:id` | `userService.update` | `users.update` | TENANT+PLATFORM | `getTenantScoped` | IMPLEMENTED |
| UC10-07, UC20-15 à 18 | Rôles CRUD | — | — | — | — | — | BLOCKED (déjà « à valider » Phase 4) |
| UC20-19 à 22 | Permissions CRUD | — | — | — | — | — | BLOCKED |
| UC20-01/02/03/05/06 | Auth, sessions (self-service), déconnexion | Sign In/Sign Up (Public) | — | — | — | — | PARTIAL (BACKEND PENDING, hors périmètre) |
| UC03-06, UC20-02 | Gérer les sessions (admin) | `/access-security/sessions` | `sessionService` | `sessions.read/revoke` | TENANT+PLATFORM | `getTenantScoped`/scope | IMPLEMENTED |
| — (`mfa.manage`) | — | — | — | `mfa.manage` (inutilisée) | — | — | DECISION REQUIRED |

## 20. Class coverage

| Class | Existing frontend | Service | Related UC | Scope | Tenant scoped | Notes |
|---|---|---|---|---|---|---|
| `Users` (`SystemUser`) | type + CRUD (create/update ajoutés) | `userService` | UC10-06, UC20-07 à 14 | TENANT (+PLATFORM pour `scope:'platform'`) | direct (`tenantId`) | seule classe Access & Security dessinée sur un diagramme (`DC_Administration_et_Multi-tenant`) |
| `SystemRole` | type + lecture | `roleService` | UC10-07, UC20-15 à 18 | GLOBAL (pas de `tenantId`) | N/A | absente des 7 diagrammes de classes (NC-02, déjà signalé Phase 5) — le frontend est en avance sur les diagrammes, pas en retard |
| `Permission` | type + lecture (`string`) | `roleService.listPermissions` | UC20-19 à 22 | GLOBAL | N/A | idem |
| `UserSession` | type + CRUD (lecture + révocation) | `sessionService` | UC03-06, UC20-02 | TENANT (+PLATFORM) | direct (`tenantId`) | inchangée |
| `MfaDevice`/`MfaStatus`/`MfaMethod` | type + lecture (imbriqués dans `SystemUser`) | `userService` (lecture uniquement) | — (aucun UC MFA dédié dans les sources) | TENANT | via `SystemUser` parent | pas de classe séparée créée, cohérent avec le modèle déjà imbriqué |

## 21. Decisions required

3 sujets **BLOQUANT** (CRUD Permissions, CRUD Rôles déjà signalé, `mfa.manage` sans action définie) et 1 sujet **DECISION REQUIRED** non bloquant (auto-désactivation), consolidés dans `docs/PHASE_10_DECISIONS_A_VALIDER.md`.

## 22. Fichiers modifiés

- `src/services/user.service.ts` — `create`, `update`.
- `src/features/access/access-module.tsx` — `RolePicker`, `UserFormFields`, `UserCreate`, `UserEdit` (nouveaux) ; action Désactiver/Réactiver + bouton Modifier sur `UserDetail` ; bouton de création sur `UsersList` ; 2 nouvelles routes.
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — nouvelles clés dans la section `access`.
- `docs/PHASE_10_DECISIONS_A_VALIDER.md`, `docs/PHASE_10_ACCESS_SECURITY.md` — nouveaux.

Aucun autre fichier (Finance, Credit, Tontines, Governance, Operations, Workflows, Documents, Audit, Settings) n'a été modifié. `src/mocks/rbac.mocks.ts` a été temporairement modifié pour la vérification du §13 (bascule de rôle) puis restauré à l'identique — confirmé par relecture — avant la fin de la mission.

---

*Fin du rapport Phase 10. Ne pas commencer la Phase 11.*
