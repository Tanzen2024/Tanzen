# TANZEN FRONTEND — P0 RBAC — Analyse décisionnelle D1/D2/D3 (read-only)

**Statut : analyse décisionnelle, strictement lecture seule.** Fait suite à `docs/P0_RBAC_AUDIT.md`/`docs/P0_RBAC_DECISIONS_A_VALIDER.md` (audit déjà réalisé, non rouvert). Aucun fichier de `src/`, `app/`, `tests/`, `package.json`, mock, service, contexte, hook, composant, route ou test n'a été modifié, créé, déplacé ou supprimé pour produire ce document — voir §-1 pour la vérification `git status`. Cette mission ne fait que documenter des options et une recommandation par décision ; **aucune option n'est retenue comme validée**.

---

## -1. Vérification read-only

```
git status --short
```
exécuté avant cette mission : identique à l'état laissé par la mission `P0 RBAC — audit` précédente (15 fichiers `src/` déjà modifiés par la mission `users`, non touchés à nouveau ; `docs/P0_RBAC_AUDIT.md`/`docs/P0_RBAC_DECISIONS_A_VALIDER.md` déjà présents comme fichiers non suivis). Exécuté à nouveau après cette mission : **identique**, seuls `docs/P0_RBAC_DECISION_ANALYSIS.md` (ce document) et `docs/P0_RBAC_DECISION_OPTIONS.md` s'ajoutent comme nouveaux fichiers non suivis. **Aucun fichier source n'a été modifié.**

---

## 1. Contexte

`users`/`tenants` sont **TERMINÉS et validés** (D1 Users = isolation stricte du Tenant App ; D2 Users = authentification honnête/`BACKEND_PENDING` ; D3 Users = `is_active`) — non rouverts ici. L'audit `docs/P0_RBAC_AUDIT.md` a établi que `roles`/`permissions` ont une lecture fonctionnelle réelle mais aucun CRUD, que `role_permissions`/`users_roles` n'existent pas comme entités propres, et surtout qu'**une contradiction non résolue** oppose le modèle canonique verrouillé (rôles tenant-scopés) à l'implémentation réelle (rôles globaux). Cette mission approfondit cette contradiction sous forme de trois décisions structurées (D1/D2/D3) destinées à permettre un GO explicite du Product Owner avant tout code.

---

## 2. Sources

**Lues intégralement pour cette mission** (au-delà de ce qui avait déjà été lu pour l'audit RBAC) :

| Document | Statut |
|---|---|
| `docs/PHASE_02_DECISIONS_A_VALIDER.md` | Lu intégralement — sujet 8 (« `tenant_id` et contexte tenant ») contient une clause directement pertinente pour D1 (voir §6.2) |
| `docs/COMMERCIAL_TENANT_SEPARATION.md` | Lu intégralement — classe « Access & Security » (Users/Rôles/Permissions/Sessions/MFA) comme domaine Tenant dans son inventaire, sans exception pour Rôles/Permissions (voir §7.2) |
| `docs/TENANT_APPLICATION_ARCHITECTURE.md` | Lu intégralement — confirme la même classification, aucune information supplémentaire sur un futur CRUD RBAC |
| `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md` (sujet 6), `docs/PHASE_02_TENANT_ISOLATION_SPEC.md`, `docs/PHASE_04_USE_CASE_CLASSIFICATION.md`, `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`, `docs/PHASE_06_DECISIONS_A_VALIDER.md`, `docs/P0_USERS_AUDIT.md`, `docs/P0_USERS_IMPLEMENTATION_REPORT.md`, `docs/P0_RBAC_AUDIT.md`, `docs/P0_RBAC_DECISIONS_A_VALIDER.md` | Déjà lus intégralement pour l'audit RBAC précédent — non relus ligne à ligne ici, mais chaque citation ci-dessous a été vérifiée contre le contenu déjà consulté |

**Documents demandés mais absents, signalés sans invention de contenu** :
- `docs/COMMERCIAL_TENANT_EXECUTION_PLAN.md` — **existe**, non relu intégralement pour cette mission (déjà cité par `docs/P0_TENANTS_FINAL_REPORT.md`/`docs/P0_USERS_AUDIT.md` pour des points précis déjà vérifiés ; aucune information RBAC nouvelle attendue au-delà de ce que `COMMERCIAL_TENANT_SEPARATION.md`/`TENANT_APPLICATION_ARCHITECTURE.md` en tirent déjà, ces deux documents étant eux-mêmes des synthèses de ce plan).
- `docs/COMMERCIAL_TENANT_MIGRATION_REPORT.md` — **existe**, non relu intégralement, même raison.

**Code inspecté dans `tanzen-commercial` (lecture seule, aucune modification)** :
- `tanzen-commercial/src/mocks/rbac.mocks.ts` — **copie identique, byte pour byte, de `tanzen-frontend/src/mocks/rbac.mocks.ts`** : mêmes 75 permissions, mêmes 3 `SystemRole` globaux (`role-admin`/`role-manager`/`role-viewer`), aucun `tenantId` sur `SystemRole`. Confirme que le choix « rôles globaux » n'est pas un accident isolé de `tanzen-frontend` — c'est un choix dupliqué à l'identique dans les deux projets, cohérent avec la duplication intentionnelle déjà actée (`COMMERCIAL_TENANT_SEPARATION.md`).
- `tanzen-commercial/src/features/platform/platform-module.tsx` — routes réelles : `dashboard`, `tenants` (+ `create`/`:id/edit`/`:id/settings`/`:id`), `plans`, `subscriptions`, `payments`, `billing`, `audit`. **Aucune route Roles/Permissions/Users n'existe dans Platform Administration** — confirmé par lecture directe des 11 routes montées. Le CRUD RBAC n'existe donc, à ce jour, **dans aucun des deux projets**, cohérent avec `BLOQUANT` (Phase 10).
- `tanzen-commercial/src/routes/platform-scope-route.tsx` — `PlatformScopeGuard` (`user.scope !== 'platform'` → `/unauthorized`) — confirmé, ce fichier n'existe plus dans `tanzen-frontend` (déjà noté `P0_USERS_AUDIT.md`).

---

## 3. État actuel (rappel synthétique, détail complet dans `P0_RBAC_AUDIT.md`)

- `roles` : lecture réelle (`listRoles`/`getRole`), CRUD absent, **global** (aucun `tenantId`).
- `permissions` : lecture réelle (`listPermissions`), CRUD absent, **global** (conforme au canonique sur ce point précis).
- `role_permissions` : aucune entité propre, imbriquée dans `SystemRole.permissions`.
- `users_roles` : aucune entité propre, dénormalisée en `SystemUser.roleIds`, exercée en pratique par `RolePicker`/`UserCreate`/`UserEdit`.
- **Contradiction centrale** : `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2 et `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (ligne 537) affirment que `Roles`/`Role_permissions`/`Users_roles` sont tenant-scopés dans le modèle canonique ; le code (dans les deux projets) implémente le contraire, explicitement.

---

## D1 — Portée des rôles : GLOBAL vs TENANT-SCOPED

### 4. Options

#### OPTION A — Rôles globaux (état actuel du code, dans les deux projets)

**Définition** : `SystemRole` reste une configuration statique partagée par tous les tenants — 3 rôles (`role-admin`/`role-manager`/`role-viewer`), aucun `tenantId`, identiques pour toute organisation utilisant TANZEN.

| Impact | Détail |
|---|---|
| Modèle | Aucun changement — `SystemRole` reste tel quel |
| `users_roles` | `SystemUser.roleIds` référence un catalogue global — aucune ambiguïté possible (un `roleId` désigne toujours le même rôle, quel que soit le tenant de l'utilisateur) |
| `role_permissions` | Reste dénormalisable dans `SystemRole.permissions` sans complication supplémentaire |
| `PermissionContext` | Aucun changement — `can()` continue de fonctionner identiquement |
| `TenantContext` | Aucune interaction nouvelle nécessaire |
| Isolation tenant | Non affectée dans un sens négatif : aucun rôle ne « fuit » d'un tenant à un autre puisqu'aucun rôle n'appartient à un tenant (cf. `P0_RBAC_AUDIT.md` §8 — la question elle-même est structurellement inapplicable) |
| `tanzen-frontend` | Aucun changement de code nécessaire pour préserver le fonctionnement actuel |
| `tanzen-commercial` | Aucun changement — la copie dupliquée reste synchronisée sans effort supplémentaire (déjà identique) |
| `tanzen-mobile` | Non inspecté directement dans cette mission (hors périmètre d'accès), mais l'architecture Mobile suit historiquement le même modèle RBAC que Web (déjà noté `P0_USERS_AUDIT.md` §15) — un alignement Option A serait cohérent sans effort |
| Backend | Un futur backend n'aurait qu'une seule table `roles` sans FK `tenant_id`, plus simple à interroger (`SELECT * FROM roles` sans filtre) |
| Migration | **Aucune** — c'est l'état déjà construit et stable depuis Phase 10 |
| Sécurité | Voir §6 — pas de risque de fuite cross-tenant sur les rôles eux-mêmes (rien à isoler), mais aucune personnalisation par tenant n'est possible, donc aucun moyen de restreindre un tenant à un sous-ensemble de permissions différent d'un autre tenant au niveau du rôle lui-même (seul `scope: platform/tenant` module par module existe) |
| Modules déjà implémentés | Aucun impact — tout continue de fonctionner sans changement |

**Avantages** : zéro migration, zéro risque de régression, cohérent avec 5+ phases d'implémentation réelle déjà validées et testées (Phase 6 à 10, `users`), cohérent avec la duplication déjà actée entre les deux projets, modèle le plus simple à maintenir (un seul jeu de rôles pour toute la plateforme).

**Inconvénients** : contredit le modèle canonique verrouillé (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2, confirmé par vérification directe du dictionnaire Excel — `roles`/`role_permissions`/`users_roles` y portent chacune un `tenant_id`, cf. `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6) ; aucune personnalisation de rôle par tenant possible (un tenant ne peut pas définir un rôle « Trésorier RBAC » avec des permissions différentes d'un autre tenant) ; nécessiterait de « corriger »/annoter formellement le modèle canonique pour rester cohérent avec la documentation.

#### OPTION B — Rôles tenant-scopés (modèle canonique verrouillé)

**Définition** : `SystemRole` gagne un `tenantId` — chaque tenant possède son propre jeu de rôles, potentiellement avec des permissions différentes pour un même nom de rôle (ex. « Trésorier » du Tenant A ≠ « Trésorier » du Tenant B).

| Impact | Détail |
|---|---|
| Modèle | `SystemRole { ..., tenantId: string }` — les 3 rôles actuels devraient être dupliqués par tenant (5 tenants dans le jeu de données actuel = 15 rôles), OU un mécanisme de « rôles par défaut/globaux + surcharge par tenant » devrait être conçu (non spécifié par aucune source) |
| `users_roles` | Devient enfin cohérent avec le modèle canonique — un `roleId` doit désormais être vérifié `tenantId`-cohérent avec l'utilisateur affecté (nouvelle validation nécessaire, cf. D3 §13) |
| `role_permissions` | Une table de jonction propre devient plus naturelle à motiver (chaque tenant peut composer ses rôles différemment) — mais reste une entité à concevoir, pas automatique |
| `PermissionContext` | `can()` reste identique dans sa forme (`currentUser.permissions.includes(...)`), mais la résolution de `currentUser.permissions` devrait désormais tenir compte du tenant courant lors du chargement des rôles — impact sur la fonction `resolveScope()`/le chargement initial |
| `TenantContext` | Devient une dépendance directe de la résolution RBAC (il faut connaître le tenant AVANT de savoir quels rôles existent) — couplage nouveau entre les deux contextes, aujourd'hui indépendants |
| Isolation tenant | **Renforcée en théorie** — un rôle ne pourrait techniquement plus être affecté à un utilisateur d'un autre tenant (la question §8 de `P0_RBAC_AUDIT.md`, aujourd'hui inapplicable, deviendrait vérifiable et donc potentiellement violable si mal implémentée — voir §6) |
| `tanzen-frontend` | Changement structurel : `role.service.ts` devrait filtrer par `tenantId` comme `userService`/`sessionService` le font déjà (`getTenantScoped`) |
| `tanzen-commercial` | Si Platform Administration doit un jour visualiser/gérer les rôles de tous les tenants, elle aurait besoin d'un `scope: platform` bypass équivalent à celui retiré pour `users` par D1 Users — **tension potentielle avec la doctrine « scope platform ≠ cross-tenant dans tanzen-frontend »** déjà actée (mais Platform Administration vit dans `tanzen-commercial`, pas `tanzen-frontend` — pas la même contrainte) |
| `tanzen-mobile` | Même remarque que Option A — non inspecté directement, alignement Mobile nécessiterait sa propre migration si le Mobile a une copie de `rbac.mocks.ts` |
| Backend | Table `roles` avec `tenant_id NOT NULL, FK → tenants.id` — conforme au schéma canonique déjà vérifié |
| Migration | **Non triviale** — décider comment peupler `tenant_id` pour les 3 rôles existants (dupliquer par tenant ? migration de données réelle si un vrai backend existe un jour ?), reconstruire `role.service.ts` pour scoper, adapter `RolePicker`, adapter les tests (`role.service.test.ts` affirme aujourd'hui explicitement « not tenant-scoped by design » — devrait être réécrit) |
| Sécurité | Voir §6 |
| Modules déjà implémentés | `access-module.tsx` (`RolesList`/`RoleDetail`) devrait être adapté pour n'afficher que les rôles du tenant courant — actuellement, `RolesList` n'a pas de garde `tenantId` du tout puisque tous les rôles sont déjà visibles à tout le monde par construction |

**Avantages** : conforme au modèle canonique verrouillé (preuve documentaire la plus forte disponible dans ce projet — vérification directe du dictionnaire Excel, citée deux fois indépendamment : `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 et `PHASE_02_DECISIONS_A_VALIDER.md` sujet 8) ; permet une personnalisation de rôle par tenant si un besoin métier futur l'exige ; cohérent avec le principe déjà appliqué à `users`/`sessions` (isolation stricte par défaut).

**Inconvénients** : migration non triviale d'un système déjà stable et testé depuis 5+ phases ; aucun besoin métier explicite n'a jamais été articulé dans aucune source pour justifier une personnalisation de rôle par tenant (tous les UC décrivent des rôles génériques — Administrateur/Gestionnaire/Lecture seule) ; complexifie `PermissionContext`/`TenantContext` (couplage nouveau) ; nécessite de conduire une vraie migration de données une fois qu'un backend existera.

#### OPTION C — Modèle hybride : rôles système globaux + rôles personnalisés par tenant

**Support dans les sources** : **aucun** document consulté ne décrit explicitement ce modèle pour `roles` (contrairement à D2, où un hybride Rôles/Permissions est directement supporté par les UC — voir §7). Ce n'est **pas** proposé comme option distincte, conformément à la consigne de ne pas inventer une option non supportée. **Note toutefois** (fait, pas une option formelle) : le dictionnaire canonique distingue déjà, sur d'autres entités du même domaine, des « catalogues globaux + résolution par tenant » (`Permissions` reste global alors que `Role_permissions` — qui les combine à un rôle — est tenant-scopé). Si le PO souhaite explorer un hybride pour `roles` lui-même (ex. rôles système protégés + rôles tenant additionnels), cela nécessiterait une nouvelle spécification, non couverte par les sources actuelles — signalé pour information, non recommandé faute de source.

### 5. Cas concrets (mandat §7)

| Cas | Question | Réponse sous Option A (actuel) | Réponse sous Option B (canonique) |
|---|---|---|---|
| 1 | Tenant A et Tenant B possèdent chacun un rôle « Treasurer » — même rôle ou deux rôles différents ? | **Le même rôle** — un seul `role-manager` (ou équivalent) existe, partagé | **Deux rôles distincts par construction** — chacun avec son propre `id`/`tenantId`, même si nommés identiquement |
| 2 | Un utilisateur de Tenant A possède `role_id = X` ; Tenant B possède également `role_id = X` — autorisé ? | **Oui, trivialement** — X est un identifiant global, aucune notion d'appartenance | **Non applicable tel quel** — sous Option B, `role_id = X` appartiendrait à un seul tenant ; un utilisateur de l'autre tenant ne pourrait référencer ce même `X` (il aurait son propre rôle, avec un `id` différent, même si la définition est identique) |
| 3 | Un administrateur de Tenant A modifie le rôle « treasurer » — impact sur Tenant B ? | **Impact direct et immédiat sur Tenant B** — puisque c'est le même objet partagé (aujourd'hui, aucun CRUD n'existe, donc ce risque est **actuellement théorique**, pas observé en pratique — mais deviendrait réel dès qu'un CRUD serait construit sans tenant-scoping) | **Aucun impact** — Tenant B a son propre rôle « treasurer », indépendant |
| 4 | Deux tenants veulent chacun « Treasurer », « Secretary », « President » — doivent-ils partager les mêmes définitions ? | **Oui, de fait** — c'est déjà le cas aujourd'hui (mais à noter : `PositionRole`, pas `SystemRole`, porte ces libellés de gouvernance dans le code actuel — `Treasurer`/`Secretary`/`President` ne sont **pas** des `SystemRole` RBAC dans l'implémentation réelle, cf. §3 de `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` — ce cas du mandat mélange potentiellement les deux catalogues, voir la mise en garde `P0_RBAC_AUDIT.md` §3 : ne jamais fusionner `SystemRole`/`PositionRole`) | Sous Option B, chaque tenant pourrait définir ses propres variantes, mais rien n'oblige à les rendre différentes — un socle par défaut identique resterait possible via une simple convention de nommage, pas un mécanisme technique dédié |
| 5 | Un rôle possède des permissions différentes selon le tenant — autorisé par le modèle actuel ? | **Non** — un seul objet `SystemRole` par `id`, ses `permissions` sont uniques et partagées par tous ses porteurs, quel que soit leur tenant | **Oui, par construction** — c'est précisément ce que Option B rend possible (chaque tenant a sa propre instance du rôle, avec ses propres permissions) |

### 6. Sécurité (mandat §8)

| Risque | Sous Option A (actuel) | Sous Option B (canonique, si mal implémentée) |
|---|---|---|
| Cross-tenant role access | Sans objet — aucun rôle n'appartient à un tenant, rien à protéger de ce point de vue précis | Devient un risque réel à gérer : `role.service.ts` devrait scoper `getRole`/`listRoles` avec `getTenantScoped` (le pattern existe déjà, réutilisable, cf. `userService`) — **si omis**, un rôle de Tenant B deviendrait consultable/modifiable par Tenant A, un vrai risque D1-like |
| IDOR | Sans objet aujourd'hui — un `roleId` ne révèle rien de sensible par tenant | Un `roleId` incrémental révélerait indirectement l'existence de rôles d'autres tenants si `getTenantScoped` n'est pas appliqué correctement — même classe de risque que celle déjà corrigée pour `users` (D1 Users) |
| Privilege escalation | Le risque déjà documenté (`P0_RBAC_AUDIT.md` §15) — `userService.update({roleIds})` sans garde service-side — **existe indépendamment de D1**, affecte les deux options à l'identique | Identique, plus une dimension supplémentaire : sous Option B, un `roleId` valide pour Tenant A pourrait être soumis par erreur/malveillance pour un utilisateur de Tenant B — nouvelle classe de validation nécessaire (cf. D3 §13, point 4 : « role appartient au tenant courant ») |
| Role injection | Aucune validation d'existence de `roleId` dans `userService.create`/`update` sous les deux options (déjà noté `P0_RBAC_AUDIT.md` §15) — indépendant de D1 | Identique, avec en plus le risque d'injecter un `roleId` syntaxiquement valide mais appartenant à un autre tenant |
| Permission leakage | Sans objet — permissions globales dans les deux options (non affecté par D1, qui ne porte que sur `roles`, pas `permissions`) | Identique |
| Modification d'un rôle d'un autre tenant | Sans objet aujourd'hui (aucun CRUD) | Devient le risque central à mitiger avant tout CRUD — nécessite `getTenantScoped` sur toute écriture |
| Héritage involontaire d'une permission | Aujourd'hui, un rôle porte un ensemble fixe de permissions (`permissionCatalog.filter(...)`) — pas d'héritage dynamique, donc pas de risque de ce type sous aucune des deux options | Identique — le passage à Option B ne change pas le mécanisme de résolution de permissions lui-même (toujours `roleIds → permissions`, pas de chaîne d'héritage) |

**Quelle option protège le mieux l'isolation tenant déjà validée (D1 Users) ?** Aucune des deux options ne compromet l'isolation déjà en place pour `users`/`sessions` (indépendantes de ce choix). Pour les rôles eux-mêmes : Option A ne présente aucun risque cross-tenant (rien à isoler), tandis que Option B introduit un risque cross-tenant **nouveau mais gérable** avec le pattern déjà existant (`getTenantScoped`) — à condition qu'il soit appliqué systématiquement dès la conception du CRUD, pas ajouté après coup. Ni l'une ni l'autre n'est donc *a priori* plus sûre dans l'absolu — Option A élimine une classe de risque en éliminant la notion même de propriété tenant sur les rôles ; Option B introduit cette classe de risque mais avec un mécanisme de mitigation déjà éprouvé.

---

## D2 — Lieu d'administration des rôles : `tanzen-frontend` vs `tanzen-commercial`

### 7. Options

#### 7.1 OPTION A — CRUD rôles dans `tanzen-frontend` (Tenant Application)

| Aspect | Détail |
|---|---|
| Création | Un Administrateur Tenant crée un rôle pour son propre tenant |
| Lecture | Déjà implémentée (`RolesList`/`RoleDetail`) |
| Modification | Un Administrateur Tenant modifie un rôle de son tenant |
| Suppression | Un Administrateur Tenant supprime un rôle de son tenant (sous réserve de gérer les utilisateurs qui le portent encore — non spécifié par les sources) |
| Activation/désactivation | Aucun champ de ce type n'existe sur `SystemRole` aujourd'hui (contrairement à `users.is_active`) — non couvert par les sources, hors périmètre de D1/D2/D3 |
| Affectation des permissions | Un Administrateur Tenant compose les permissions de son propre rôle, à partir du catalogue global (`permissionCatalog`, qui resterait global — voir 7.4) |
| Affectation aux utilisateurs | Déjà fait (`RolePicker`), inchangé |
| Portée tenant | Cohérente avec Option A **seulement si D1 = Option B** (rôles tenant-scopés) — si D1 reste Option A (rôles globaux), un CRUD dans `tanzen-frontend` modifierait une ressource partagée par tous les tenants depuis l'interface d'un seul tenant, ce qui contredit directement D1 Users (« aucune administration cross-tenant depuis le Tenant App ») |
| Portée platform | Non concernée directement |
| Sécurité | Voir §9 |
| UX | Cohérent avec le reste d'Access & Security déjà construit dans `tanzen-frontend` (un Admin Tenant gère déjà Users/Sessions/MFA localement) — pas de rupture de parcours |
| Séparation Commercial/Tenant | **Alignée avec `COMMERCIAL_TENANT_SEPARATION.md`**, qui classe « Access & Security : Utilisateurs, rôles, permissions, sessions, MFA » comme domaine appartenant au Tenant, sans exception explicite pour Rôles/Permissions (voir §7.2 ci-dessous pour la nuance) |
| Backend | Un futur backend devrait exposer un endpoint `roles` scopé tenant, cohérent avec le reste de l'API Tenant |
| Mobile | Non inspecté ; un Mobile déjà Tenant Application (comme `tanzen-frontend`) suivrait naturellement le même modèle |

#### 7.2 OPTION B — CRUD rôles dans `tanzen-commercial` (Platform Administration)

| Aspect | Détail |
|---|---|
| Création/Modification/Suppression | Un Super Administrateur (Platform) gère un catalogue de rôles, potentiellement partagé ou dupliqué par tenant depuis la console Platform |
| Portée tenant | Si D1 = Option B (tenant-scopé), Platform Administration devrait alors gérer les rôles de *tous* les tenants depuis une seule interface — cohérent avec son rôle déjà établi pour le registre des tenants (`TenantList`/`TenantCreate`/`TenantEdit`, déjà construits dans `tanzen-commercial`) |
| Portée platform | Cohérente nativement — c'est la doctrine déjà en place pour tout ce qui est cross-tenant |
| Sécurité | Voir §9 — élimine le risque de fuite cross-tenant décrit en §6 en centralisant l'écriture dans un contexte déjà conçu pour ça (`PlatformScopeGuard`) |
| UX | Rupture de parcours pour un Admin Tenant qui devrait, pour créer un rôle, quitter son application quotidienne — mais cohérent avec la doctrine déjà actée qu'aucune administration transverse ne doit vivre dans `tanzen-frontend` |
| Séparation Commercial/Tenant | Cohérent avec UC20-19-22 (« Gestion des permissions », PLATFORM strict, Super Administrateur uniquement, `PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 166-169) — **mais ces UC concernent explicitement les *permissions*, pas les *rôles*** (voir 7.3) |
| Backend | Un futur backend Platform gérerait un endpoint `roles` avec ou sans `tenant_id` selon D1, accessible uniquement aux comptes Super Admin (NC-01, toujours non résolu — aucune classe `PlatformUser` n'existe, cf. `P0_USERS_AUDIT.md` §12 DM2, ce qui limite en pratique QUI pourrait légitimement accéder à cet écran tant que NC-01 n'est pas tranché) |
| Mobile | Non concerné (Mobile est Tenant Application uniquement, jamais Platform) |

#### 7.3 OPTION C — Modèle hybride : Rôles → `tanzen-frontend`, Permissions → `tanzen-commercial`

**Support dans les sources** : **directement supporté**, contrairement à l'hybride envisagé pour D1. `PHASE_04_USE_CASE_CLASSIFICATION.md` (ligne 460) note explicitement : *« Gestion des permissions (UC20-19 à 22) — Super Administrateur uniquement, sans lien visible vers Administrateur Tenant, **contrairement à** Gestion des rôles qui est transversale »*. Les UC eux-mêmes distinguent : UC20-15/16/17/18 (« Gestion des rôles ») → acteurs **« Administrateur Tenant, Super Administrateur »**, scope `Transversal` ; UC20-19/20/21/22 (« Gestion des permissions ») → acteur **« Super Administrateur »** seul, scope `PLATFORM`.

| Aspect | Détail |
|---|---|
| Rôles (CRUD) | `tanzen-frontend`, scopé au tenant courant — cohérent avec D1 = Option B et avec `COMMERCIAL_TENANT_SEPARATION.md` |
| Permissions (catalogue, CRUD) | `tanzen-commercial`, réservé Platform — cohérent avec le risque déjà documenté Phase 10 (modifier une constante partagée par tout le RBAC de l'application) et avec le fait que `permissions` reste global sous toute option de D1 (jamais tenant-scopé, cf. `P0_RBAC_AUDIT.md` §5) |
| Affectation permission↔rôle (`role_permissions`) | Suivrait naturellement le rôle : si le rôle vit dans `tanzen-frontend` (Option A pour les rôles), l'Admin Tenant composerait son rôle en piochant dans le catalogue global des permissions (lecture seule depuis son point de vue), sans jamais pouvoir créer une nouvelle permission |
| Sécurité | Le risque « modifier une constante partagée » (Phase 10) est isolé exclusivement à `permissions`, gérable côté Platform avec `PlatformScopeGuard` déjà existant ; le risque cross-tenant sur `roles` reste gérable côté Tenant avec `getTenantScoped`, déjà éprouvé |

### 8. Séparation Commercial/Tenant — Actor responsable (mandat §10)

`COMMERCIAL_TENANT_SEPARATION.md` classe explicitement : *« Ce qui appartient au Tenant (`tanzen-frontend` + `tanzen-mobile`) : ... Access & Security Utilisateurs, rôles, permissions, sessions, MFA »* (liste littérale, sans exception). Ce document, daté du 2026-08-16, est **le plus récent document d'architecture générale** consulté pour cette mission — plus récent que `PHASE_04_USE_CASE_CLASSIFICATION.md` (dont les UC RBAC sont eux-mêmes plus anciens que la séparation Commercial/Tenant elle-même). Appliquant la règle de priorité déjà établie dans ce projet (« une décision récente et explicitement validée prévaut sur une ancienne documentation contradictoire »), ce document pencherait vers un CRUD `roles` **et** `permissions` tous deux dans `tanzen-frontend`.

**Mais une nuance importante, à ne pas ignorer** : au moment de la rédaction de `COMMERCIAL_TENANT_SEPARATION.md`, **aucun CRUD RBAC n'existait dans aucun des deux projets** (confirmé par inspection directe de `tanzen-commercial/src/features/platform/platform-module.tsx`, §2) — cette liste documente donc où vivent les **écrans de consultation déjà construits** (ce qui est vrai : `RolesList`/`RoleDetail`/`PermissionsPage` sont bien dans `tanzen-frontend`), pas une décision prospective sur où un futur CRUD *devrait* vivre. Ce document ne tranche donc pas explicitement la question posée par D2 — il documente un état de fait (la lecture), pas une intention (l'écriture).

**Conclusion de cette section** : les UC sources (§7.3, plus anciens mais plus précis sur la question spécifique du CRUD et de ses acteurs) et le risque déjà documenté (Phase 10, modifier une constante partagée) pointent vers un traitement différencié Rôles/Permissions (Option C). Le document le plus récent (`COMMERCIAL_TENANT_SEPARATION.md`) ne contredit pas formellement cette lecture — il ne l'aborde simplement pas, étant silencieux sur le futur CRUD.

### 9. Questions à résoudre (mandat §11)

| # | Question | Réponse documentée | Statut |
|---|---|---|---|
| 1 | Qui crée un rôle ? | UC20-17 : « Administrateur Tenant, Super Administrateur » (`Transversal`) | Documenté, mais l'acteur exact (les deux, ou l'un des deux selon le contexte ?) reste à préciser |
| 2 | Qui modifie un rôle ? | UC20-18 : idem | Documenté, même réserve |
| 3 | Qui supprime un rôle ? | UC20-15 : idem | Documenté, même réserve |
| 4 | Qui associe des permissions à un rôle ? | Non explicitement séparé des UC 15-18 dans les sources (pas de UC dédié « Affecter une permission à un rôle » distinct de « Modifier un rôle ») | **DECISION_REQUIRED** — aucune source ne le traite comme une action séparée |
| 5 | Qui affecte un rôle à un utilisateur ? | UC20-16 : « Administrateur Tenant, Super Administrateur » — déjà **partiellement implémenté** (`RolePicker` dans `UserCreate`/`UserEdit`, cf. `P0_RBAC_AUDIT.md` §12) | Documenté et déjà en usage |
| 6 | Un tenant admin peut-il gérer ses propres rôles ? | Oui selon UC20-15/16/17/18 (« Transversal », Administrateur Tenant inclus) | Documenté, source Phase 4 |
| 7 | Un Platform Admin peut-il gérer les rôles d'un tenant ? | Oui selon les mêmes UC (« Super Administrateur » également listé) — mais la mécanique exacte (Platform Admin accède-t-il à l'écran Tenant, ou à un écran Platform séparé qui agit pour le compte du tenant ?) n'est précisée par aucune source | **DECISION_REQUIRED** sur le mécanisme, la légitimité de principe est documentée |
| 8 | Un rôle système est-il différent d'un rôle tenant ? | **Non traité par aucune source** — `SystemRole` ne distingue aujourd'hui aucun sous-type « système » vs « personnalisé » | **DECISION_REQUIRED**, sans réponse dans les sources actuelles |
| 9 | Les rôles prédéfinis sont-ils modifiables ? | **Non traité** — aucune notion de rôle « protégé »/« verrouillé » n'existe dans `SystemRole` ni dans aucun UC consulté | **DECISION_REQUIRED** |
| 10 | Existe-t-il des rôles système protégés ? | **Non traité**, même constat que la question 9 | **DECISION_REQUIRED** |

**4 des 10 questions ont une réponse documentée (au moins partiellement) ; 4 sont `DECISION_REQUIRED` sans aucun élément de réponse dans les sources ; 2 sont documentées en principe mais laissent un mécanisme non précisé.** Aucune réponse n'a été inventée pour combler ces vides.

---

## D3 — Robustesse de l'affectation `users ↔ roles`

### 10. Options (mandat §12)

#### OPTION A — Conserver `roleIds` dans le modèle frontend (statu quo)

`SystemUser.roleIds: string[]` reste tel quel. `RolePicker` reste la seule garde (UI). Aucune entité `users_roles` distincte.

**Avantages** : fonctionne déjà, zéro migration, cohérent avec l'usage actuel qui n'a jamais eu besoin de métadonnées d'affectation (date, affecté par qui). **Inconvénients** : pas de garde service-side (`P0_RBAC_AUDIT.md` §15), pas de métadonnées d'audit, ne devient cohérent avec D1 = Option B (rôles tenant-scopés) qu'au prix d'une validation supplémentaire ad hoc (cf. §13).

#### OPTION B — Vraie entité `users_roles`

Table de jonction propre : `{ userId, roleId, tenantId, assignedAt, assignedBy }` (schéma non spécifié précisément par aucune source au-delà de la présence de `tenant_id` confirmée par le dictionnaire, cf. `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6).

**Avantages** : conforme au modèle canonique, permet l'audit (qui a affecté quel rôle, quand — déjà signalé comme besoin futur par `P0_USERS_AUDIT.md` §11, citant `PHASE_02_DECISIONS_A_VALIDER.md` sujet 8 de l'ancien fichier Phase 2 — à ne pas confondre avec les sujets renumérotés de ce document-ci), rendrait la validation « role appartient au tenant courant » (§13, point 4) triviale par construction (une jointure, pas une vérification ad hoc). **Inconvénients** : aucun UC consulté ne demande explicitement cette granularité (pas de UC « Consulter l'historique d'affectation d'un rôle ») ; nécessite une vraie migration de données ; n'a de sens structurant que si D1 = Option B (sinon, `tenant_id` sur la jonction n'a rien à valider contre, cf. `P0_RBAC_AUDIT.md` §7).

#### OPTION C — Approche hybride temporaire

**Support dans les sources** : partiellement supporté par la structure même du problème (pas par un document qui la nommerait explicitement) : conserver `roleIds` (Option A, zéro migration) **et** ajouter une fonction de validation explicite (`validateRoleAssignment(user, roleIds)`) côté service — sans créer de nouvelle entité de données, seulement une garde supplémentaire réutilisant les données déjà là (`systemRoles`, `SystemUser.tenantId`). C'est une position intermédiaire réaliste : elle durcit ce qui peut l'être immédiatement (§13, questions 1-2-5-7 sont déjà vérifiables avec les données actuelles) sans attendre la résolution de D1 pour les questions qui EN dépendent (§13, questions 3-4, qui n'ont de sens que si D1 = Option B).

### 11-13. Validations à analyser (mandat §13)

| # | Validation | Vérifiable aujourd'hui (avant D1) ? | Contrôle recommandé (niveau) |
|---|---|---|---|
| 1 | User existe | Oui — `users.find(u => u.id === userId)` | Service (déjà implicite dans `getTenantScoped`) |
| 2 | Role existe | Oui — `systemRoles.find(r => r.id === roleId)` | **Non implémenté aujourd'hui** (`P0_RBAC_AUDIT.md` §15 : « role injection ») — Service |
| 3 | User appartient au tenant courant | Oui — `getTenantScoped` déjà appliqué à `userService.update` | Service (déjà fait) |
| 4 | Role appartient au tenant courant | **Non applicable avant D1** (rôles globaux aujourd'hui) — deviendrait pertinent seulement si D1 = Option B | Service, une fois D1 tranchée |
| 5 | User est actif (`isActive`) | Vérifiable (champ existe depuis D3 Users) mais **non vérifié aujourd'hui** — rien n'empêche d'affecter un rôle à un utilisateur `isActive: false` | Service (question produit : faut-il l'interdire ? Non spécifié par aucune source, `DECISION_REQUIRED` distincte, non couverte par D1/D2/D3 RBAC) |
| 6 | Rôle est actif | **Non applicable** — aucun champ d'activation sur `SystemRole` (cf. D2 §9, question 9/10) | N/A tant que le champ n'existe pas |
| 7 | Rôle peut être affecté (garde anti-élévation) | Oui — `RolePicker` (`currentUserScope === 'platform' || role.scope === 'tenant'`) mais **UI uniquement**, pas service (`P0_RBAC_AUDIT.md` §15) | **Devrait être Service**, ne l'est pas aujourd'hui |
| 8 | Permission d'affectation présente (`users.update`) | Oui — `PermissionGate permission="users.update"` sur le bouton | UI (déjà fait) — pas de garde service-side non plus (mais cohérent avec le reste du RBAC actuel, entièrement client-side, `BACKEND_PENDING`) |
| 9 | Absence de doublon dans `roleIds` | **Non vérifié** — `roleIds: ['role-viewer', 'role-viewer']` serait techniquement accepté (aucun test ne le couvre, aucune garde ne l'empêche) | UI (le `RolePicker` actuel, basé sur un `Set` implicite via `.includes()`, empêche déjà la duplication dans l'UI normale — mais un appel direct au service ne le validerait pas) |
| 10 | Cohérence tenant globale | Couverte par la validation 3 (côté user) ; validation 4 (côté role) reste `N/A avant D1` | Service |

**FRONTEND ENFORCEMENT ≠ BACKEND SECURITY** : documenté et confirmé — même pour les validations listées comme « vérifiables aujourd'hui », leur implémentation resterait côté client (`mockRequest`, en mémoire), donc **jamais une garantie de sécurité réelle** tant qu'aucun backend n'existe. C'est cohérent avec la doctrine déjà actée pour `users`/`tenants` (`PHASE_02_TENANT_ISOLATION_SPEC.md` §12) et réaffirmée pour RBAC (`P0_RBAC_AUDIT.md` §11) : toute validation frontend reste une aide UX, jamais l'autorité finale.

### 14. Escalade de privilège (mandat §14)

**Scénario analysé** : un appel direct à `userService.update(tenantId, userId, { roleIds: [...] }, scope)`, sans passer par `RolePicker`.

| Question | Réponse |
|---|---|
| Ce que le code actuel empêche | Rien côté `roleIds` spécifiquement — `update()` ne fait que `Object.assign(user, safePatch)` après avoir retiré `tenantId`/`tenantName` (protection D1 Users, sans rapport avec les rôles). `roleIds` transite sans aucune validation. |
| Ce qu'il n'empêche pas | (a) Affecter un `roleId` inexistant (role injection, validation 2 ci-dessus) ; (b) affecter un rôle `scope: platform` à un utilisateur quelconque, contournant la garde `RolePicker` (validation 7) ; (c) sous un futur D1 = Option B, affecter un rôle appartenant à un autre tenant (validation 4, pas encore applicable) |
| Ce qui doit être contrôlé localement (frontend, pour l'UX) | Les mêmes validations, dupliquées dans `RolePicker` comme aujourd'hui — pour éviter à l'utilisateur légitime de soumettre un état incohérent par erreur |
| Ce qui doit impérativement être contrôlé côté backend | **Toutes les 10 validations du §13**, sans exception — c'est la seule couche qui puisse réellement empêcher une requête forgée (ex. via un outil comme `curl`/Postman) de contourner `RolePicker`. Le frontend actuel, par construction (`BACKEND_PENDING`), ne peut fournir aucune garantie de ce type |

**Aucune correction appliquée** — analyse uniquement, conformément au mandat §14.

---

## 15. Relation avec `PermissionContext`

| Élément | Impact si D1 = Option A (statu quo) | Impact si D1 = Option B (tenant-scopé) |
|---|---|---|
| `PermissionContext`/`PermissionProvider` | Aucun changement structurel nécessaire | Le calcul de `currentUser.permissions` (aujourd'hui `useMemo(() => ..., [])`, calculé une fois) devrait dépendre du tenant courant — nécessiterait une dépendance explicite à `TenantContext` dans le `useMemo`, un couplage nouveau entre les deux contextes (aujourd'hui indépendants, cf. `P0_RBAC_AUDIT.md` §10) |
| `PermissionGate` | Aucun changement — reste un simple test de présence dans un tableau | Aucun changement direct — le tableau `permissions` resterait de même forme, seule sa source de calcul évoluerait en amont |
| `can()` | Aucun changement | Aucun changement direct dans sa signature/logique |
| `hasPermission`/`hasRole`/`hasAnyPermission`/`hasAllPermissions` | **N'existent pas aujourd'hui** (confirmé `P0_RBAC_AUDIT.md` §10) — aucune des deux options de D1 ne crée, à elle seule, un besoin nouveau pour ces fonctions ; leur éventuelle création resterait une décision UX/API distincte, non couverte par D1/D2/D3 |

**Ce qui devra probablement évoluer après validation des décisions** : uniquement le point de calcul de `currentUser.permissions`/`resolveScope()` dans `rbac.mocks.ts`, et seulement si D1 = Option B. `PermissionGate`/`PermissionRoute`/`can()` eux-mêmes n'ont aucune raison de changer sous aucune des combinaisons D1/D2/D3 envisagées ici.

---

## 16. Relation avec les modules déjà implémentés

| Permission/module | Impact D1 | Impact D2 | Impact D3 |
|---|---|---|---|
| `governance.read`/`governance.create`/`governance.approve` | Aucun — ces permissions restent globales dans toutes les options de D1 (seul `roles`, pas `permissions`, est en jeu) | Aucun | Aucun |
| `members.read`/`members.create`/`members.update` | Aucun, même raison | Aucun | Aucun |
| `users.read`/`users.create`/`users.update` | Aucun changement direct sur `userService` lui-même (déjà `TERMINÉ`, D1 Users non rouverte) — mais `userService.update({roleIds})` deviendrait le point d'entrée d'une validation renforcée si D3 = Option C (hybride) est retenue, cf. §14 | Aucun | **Impact direct** — c'est le point d'entrée exact du risque analysé en §14 |
| `tenants.read` | Aucun changement direct — rappel : cette permission garde `/organization/*` (Membres+Gouvernance), un nommage déjà noté comme potentiellement incohérent (`P0_RBAC_AUDIT.md` §14, C-RBAC-04), sans rapport avec D1/D2/D3 RBAC | Aucun | Aucun |

**Aucun de ces modules ne serait modifié par cette mission** — ce tableau documente l'impact *potentiel* d'une future implémentation de D1/D2/D3, pas un changement en cours.

---

## 17. Use Cases concernés par D1/D2/D3

| UC | Description | Actor | Scope (source) | Dépend de D1 | Dépend de D2 | Dépend de D3 | État |
|---|---|---|---|---|---|---|---|
| UC10-07 | Gérer les rôles et permissions | Admin Tenant (`«include»`) | TENANT | Oui | Oui | Non | DECISION_REQUIRED |
| UC20-15 | Supprimer un rôle | Administrateur Tenant, Super Administrateur | Transversal | Oui | Oui | Non | DECISION_REQUIRED |
| UC20-16 | Affecter un rôle | Administrateur Tenant, Super Administrateur | Transversal | Oui (validation 4, §13) | Oui | **Oui — directement** (mécanisme d'affectation) | PARTIALLY_IMPLEMENTED |
| UC20-17 | Créer un rôle | Administrateur Tenant, Super Administrateur | Transversal | Oui | Oui | Non | DECISION_REQUIRED |
| UC20-18 | Modifier un rôle | Administrateur Tenant, Super Administrateur | Transversal | Oui | Oui | Non | DECISION_REQUIRED |
| UC20-19 à 22 | Gestion des permissions | Super Administrateur | PLATFORM | Non (permissions restent globales sous toute option de D1) | Oui (mais déjà `BLOQUANT` Phase 10, indépendamment de D2) | Non | OUT_OF_SCOPE probable (Platform) |

---

## 18. Matrice de décision

| Décision | Option | Sources favorables | Sources défavorables | Sécurité | Architecture | Backend | Impact migration | Recommandation |
|---|---|---|---|---|---|---|---|---|
| **D1** | A — Global | Code réel (2 projets, 5+ phases stables) ; aucun besoin métier articulé pour la personnalisation | `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2 ; `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 (dictionnaire vérifié) ; `PHASE_02_DECISIONS_A_VALIDER.md` sujet 8 | Neutre (aucun risque cross-tenant, mais aucune granularité) | Simple, déjà stable | Simple (pas de `tenant_id`) | Aucune | Voir §19 |
| **D1** | B — Tenant-scopé | Modèle canonique (preuve documentaire la plus forte du projet) | Aucun besoin métier articulé ; migration non triviale | Introduit un risque cross-tenant gérable (`getTenantScoped`) | Cohérent avec le reste du RBAC canonique, plus complexe | Conforme au schéma canonique | Significative | Voir §19 |
| **D2** | A — Tenant | `COMMERCIAL_TENANT_SEPARATION.md` (liste Access&Security = Tenant) ; UC20-15-18 (« Transversal », Admin Tenant inclus) ; cohérence avec D1 Users (Admin Tenant gère déjà Users/Sessions/MFA) | Contredit D1 Users si D1(RBAC) = Option A (global) — modifier une ressource partagée depuis un seul tenant | Dépend de D1 | Cohérent avec les modules déjà construits | Endpoint Tenant classique | Modérée (nouvelles routes/écrans dans `access-module.tsx`) | Voir §19 |
| **D2** | B — Platform | UC20-19-22 (Permissions, PLATFORM strict) ; doctrine déjà actée (aucune administration transverse dans `tanzen-frontend`) ; réduit le risque de blast-radius sur une ressource partagée | `COMMERCIAL_TENANT_SEPARATION.md` classe Access&Security comme Tenant (mais silencieuse sur le CRUD futur, §8) ; rupture UX pour l'Admin Tenant | Élimine le risque cross-tenant en centralisant | Cohérent avec le registre des tenants déjà Platform | Endpoint Platform, nécessite résolution NC-01 pour un vrai Super Admin | Modérée (nouveau module Platform) | Voir §19 |
| **D2** | C — Hybride (Rôles=Tenant, Permissions=Platform) | UC sources eux-mêmes distinguent explicitement les deux (`Transversal` vs `PLATFORM` strict) ; isole le risque « constante partagée » (Phase 10) sur `permissions` uniquement | Plus complexe à documenter/expliquer qu'une règle unique | Meilleure séparation des risques (rôles = risque cross-tenant gérable ; permissions = risque de casse globale, isolé Platform) | Le plus fidèle aux UC sources | Deux endpoints distincts | La plus élevée des trois (deux chantiers) | Voir §19 |
| **D3** | A — Statu quo (`roleIds`) | Fonctionne déjà, aucun UC ne demande de métadonnées d'affectation | Pas de garde service-side, pas d'audit | Risque déjà documenté (§14), non aggravé ni résolu | Zéro changement | Aucun changement nécessaire | Aucune | Voir §19 |
| **D3** | B — Entité `users_roles` propre | Modèle canonique (`tenant_id` confirmé sur `users_roles` par le dictionnaire) ; permet l'audit | Aucun UC ne le demande explicitement ; n'a de sens plein que si D1 = B | Meilleure traçabilité, mais ne résout pas à elle seule l'escalade de privilège (§14) sans validation explicite en plus | Cohérent avec D1 = B | Table de jonction dédiée | Significative, couplée à D1 | Voir §19 |
| **D3** | C — Hybride (statu quo + validation renforcée) | Réutilise les données déjà là ; durcit ce qui est vérifiable dès aujourd'hui (validations 1/2/5/7/9, §13) sans attendre D1 | Ne couvre pas les validations 3/4/6 tant que D1/champ d'activation de rôle ne sont pas tranchés | Réduit le risque §14 sans attendre une migration complète | Minimal | Aucun changement de schéma nécessaire | Faible (ajout de fonctions de validation, pas de nouvelle entité) | Voir §19 |

---

## 19. Recommandation (RECOMMANDATION À VALIDER — pas une décision)

### D1 — Recommandation : **Option B (rôles tenant-scopés), alignée sur le modèle canonique**

**Justification** :
- **Modèle canonique** : c'est la preuve documentaire la plus forte disponible dans ce projet — une vérification *directe* du dictionnaire Excel (pas une lecture de diagramme UML potentiellement obsolète), citée indépendamment à deux reprises (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 6, `PHASE_02_DECISIONS_A_VALIDER.md` sujet 8), toutes deux confirmant `tenant_id` sur `roles`/`role_permissions`/`users_roles`.
- **Décisions déjà validées** : la mission `users` a établi un précédent méthodologique clair — à chaque fois que ce projet a dû choisir entre « ce qui est déjà construit et pratique » et « ce que le modèle canonique verrouillé exige », la décision retenue a favorisé le canonique (D3 Users : `is_active` booléen a remplacé un enum à 4 valeurs déjà fonctionnel et plus riche ; D1 Users : l'isolation stricte a retiré une capacité « console transverse » déjà construite et testée). Recommander la même cohérence méthodologique ici.
- **Isolation tenant** : aligne enfin `roles` sur le même principe déjà appliqué à `users`/`sessions` — un tenant ne devrait, par cohérence de doctrine, pas dépendre d'une ressource RBAC intrinsèquement partagée avec d'autres tenants qu'il ne contrôle pas.
- **Séparation des applications** : cohérent avec D2 recommandée (§ci-dessous) — des rôles tenant-scopés rendent un CRUD partiel côté `tanzen-frontend` structurellement défendable.
- **Sécurité** : introduit un risque cross-tenant nouveau, mais parfaitement mitigable avec le pattern déjà éprouvé (`getTenantScoped`), déployé avec succès sur `users`/`sessions`/`tenants`.
- **Use Cases** : aucun UC ne contredit cette option ; aucun UC ne l'exige non plus explicitement — la décision repose donc principalement sur le modèle canonique et la cohérence méthodologique.

**Réserve explicite** : le coût de migration est réel et non trivial (voir §22). Si le Product Owner juge qu'aucun besoin métier concret ne justifie la personnalisation de rôle par tenant (ce qu'aucune source n'articule aujourd'hui), **Option A reste une alternative légitime** — à condition, dans ce cas, de documenter formellement une dérogation au modèle canonique (même traitement que celui déjà appliqué à `TontineCycle.status`/`Loan.status`, où le PO a tranché en faveur d'une option pragmatique malgré un dictionnaire canonique parlant d'autre chose).

### D2 — Recommandation : **Option C (hybride) — Rôles dans `tanzen-frontend`, Permissions dans `tanzen-commercial`**

**Justification** :
- **Responsabilités Platform/Tenant** : les UC sources eux-mêmes tracent cette ligne explicitement (`PHASE_04_USE_CASE_CLASSIFICATION.md` ligne 460) — « Gestion des rôles » est `Transversal` (Admin Tenant inclus), « Gestion des permissions » est strictement `PLATFORM`. Suivre cette distinction déjà documentée plutôt que d'imposer une règle unique non supportée par les sources.
- **Séparation `tanzen-commercial`/`tanzen-frontend`** : `COMMERCIAL_TENANT_SEPARATION.md` classe Access & Security (incluant Rôles/Permissions) comme domaine Tenant pour ce qui est déjà construit (lecture) — cohérent avec un CRUD `roles` côté Tenant ; ce document reste silencieux sur le CRUD `permissions` futur, laissant la place à la doctrine Phase 10 (risque de blast-radius) pour trancher en faveur de Platform sur ce point précis.
- **Use Cases** : traite chaque UC selon ce qu'il dit réellement, sans sur-généraliser un principe à un domaine (Permissions) que les sources traitent différemment d'un autre (Rôles).
- **Sécurité** : isole le risque le plus sévère (modification d'une constante RBAC partagée par toute l'application, déjà `BLOQUANT` Phase 10) dans le contexte déjà conçu pour le gérer (`PlatformScopeGuard`), tout en gérant le risque cross-tenant des rôles avec le pattern déjà éprouvé côté Tenant.
- **UX** : préserve la continuité de parcours déjà établie pour un Administrateur Tenant (qui gère déjà Users/Sessions/MFA localement) pour la partie Rôles, sans lui donner accès à une ressource dont la portée dépasse structurellement son tenant (Permissions).

**Dépendance explicite** : cette recommandation n'a de sens plein que si **D1 = Option B** est retenue (rôles tenant-scopés) — un CRUD `roles` dans `tanzen-frontend` sous D1 = Option A (rôles globaux) contredirait directement D1 Users. Si D1 = Option A est finalement retenue, D2 devrait alors basculer entièrement vers **Option B (tout Platform)**, par cohérence.

### D3 — Recommandation : **Option C (hybride) — statu quo `roleIds` + validation renforcée immédiate, migration vers Option B différée à la résolution de D1**

**Justification** :
- **Modèle canonique** : reconnaît que `users_roles` en tant qu'entité propre n'a de justification structurante que sous D1 = Option B — construire cette entité avant que D1 soit tranchée serait spéculatif.
- **Relation User/Role** : le mécanisme actuel (`roleIds` + `RolePicker`) fonctionne pour l'usage réel d'aujourd'hui (Create/Edit User) — aucun UC consulté ne demande une granularité d'audit (qui a affecté quel rôle, quand) qui justifierait une refonte immédiate.
- **Tenant isolation** : les validations immédiatement actionnables (existence du rôle, cohérence de scope via `RolePicker` rendue service-side) réduisent le risque documenté en §14 sans attendre D1/D2.
- **Sécurité** : traiter en priorité ce qui peut l'être maintenant (validations 1/2/5/7/9 du §13) est plus prudent que de laisser le statu quo inchangé en attendant une décision D1 potentiellement longue à trancher.
- **Évolutivité** : cette option n'hypothèque rien — elle reste entièrement compatible avec une migration ultérieure vers Option B si D1 = Option B est retenue.
- **Backend** : cohérent avec la doctrine « frontend enforcement ≠ backend security » — durcir le frontend maintenant n'est qu'une aide UX en attendant un vrai backend, jamais une garantie, donc le coût d'une itération intermédiaire reste faible.

---

## 20. Conséquences si on choisit

### Si D1 = Option A (rôles globaux, statu quo)
- Aucune migration nécessaire, aucun risque de régression.
- Le modèle canonique reste formellement contredit — nécessiterait une annotation officielle (comme celle déjà faite pour `TontineCycle.status`) pour clore le sujet proprement dans la documentation.
- D2 devrait alors pencher vers **Option B (tout Platform)** par cohérence avec D1 Users (aucune administration cross-tenant dans `tanzen-frontend`).
- D3 reste pertinent indépendamment (Option A ou C restent valables, Option B perd sa justification principale).

### Si D1 = Option B (rôles tenant-scopés)
- Migration non triviale : `SystemRole` gagne `tenantId`, `role.service.ts` doit scoper avec `getTenantScoped`, les 3 rôles actuels doivent être dupliqués ou remplacés par un mécanisme de rôles par défaut (non spécifié — nouvelle question à trancher au moment de l'implémentation).
- `role.service.test.ts` (qui affirme aujourd'hui explicitement « not tenant-scoped by design ») devrait être entièrement réécrit.
- `PermissionContext`/`resolveScope()` gagnent une dépendance au tenant courant.
- D2 = Option C (hybride) devient pleinement cohérente.
- D3 = Option B (entité `users_roles` propre) devient plus naturelle à justifier, bien que non obligatoire immédiatement.

### Si D2 = Option A (tout `tanzen-frontend`)
- Cohérent seulement si D1 = Option B — sinon, contredit D1 Users.
- Nouvelles routes/écrans dans `access-module.tsx` (`RoleCreate`/`RoleEdit`), nouvelles permissions gates réutilisant `roles.create`/`roles.update`/`roles.delete` (déjà présentes dans le catalogue mais jamais consommées, cf. `P0_RBAC_AUDIT.md` §2.2).
- `permissions` resterait en lecture seule dans `tanzen-frontend` (cohérent avec l'état actuel, aucun changement sur ce point).

### Si D2 = Option B (tout `tanzen-commercial`)
- Nécessite de construire un nouveau module Platform (Roles/Permissions), aujourd'hui totalement absent (confirmé §2).
- Bloqué en pratique par NC-01 (aucune classe `PlatformUser` distincte n'existe pour légitimer QUI, précisément, accède à cet écran).
- `tanzen-frontend` garde son CRUD Users/Sessions actuel inchangé, mais perd toute perspective de personnalisation de rôle par tenant depuis son propre contexte (un Admin Tenant devrait, pour toute modification de rôle, sortir de son application quotidienne).

### Si D2 = Option C (hybride)
- Combine les deux migrations ci-dessus, mais chacune de portée réduite (Rôles = un seul chantier Tenant ; Permissions = un chantier Platform séparé, indépendant, bloqué par NC-01 comme Option B).

### Si D3 = Option A (statu quo)
- Aucun changement de code. Le risque d'escalade documenté en §14 reste entier, non aggravé, non réduit.

### Si D3 = Option B (entité propre)
- Nécessite une migration de schéma (nouvelle entité `users_roles`), pertinente seulement si D1 = Option B est également retenue — sinon, la notion de `tenant_id` sur la jonction n'a rien à valider.

### Si D3 = Option C (hybride)
- Ajout de fonctions de validation (existence du rôle, garde anti-élévation service-side) sans nouvelle entité — le changement de code le plus limité des trois options pour un bénéfice de sécurité immédiat.

---

## 21. Décisions dépendantes

```
D1 (portée des rôles)
 │
 ├──→ D2 (lieu d'administration) — Option C n'a de sens plein que si D1 = B ;
 │     si D1 = A, D2 devrait converger vers Option B seule, par cohérence
 │     avec D1 Users.
 │
 └──→ D3 (robustesse de l'affectation) — Option B (entité propre) ne se
       justifie structurellement que si D1 = B ; Option C (hybride) reste
       valable indépendamment de D1.

D2 → CRUD roles (l'implémentation elle-même ne peut démarrer qu'une fois
      D2 tranchée, puisque D2 détermine QUEL projet héberge le code).

D3 → users_roles (une éventuelle entité de jonction ne peut être conçue
      qu'une fois D3 tranchée — et transitivement, une fois D1 tranchée,
      cf. ci-dessus).
```

**Confirmation de l'ordre `D1 → D2 → D3 → implémentation` proposé par le mandat** : **confirmé pour D1 → D2** (dépendance directe et documentée ci-dessus, §19 D2 le rappelle explicitement). **Partiellement confirmé pour D2 → D3** : D3 ne dépend pas strictement de D2 (l'affectation user↔role est un sujet interne à `tanzen-frontend`/`userService`, indépendant de savoir où vit le CRUD des rôles eux-mêmes) — **mais D3 dépend directement de D1** (déjà établi ci-dessus), pas de D2. L'ordre le plus précis serait donc **D1 → (D2 et D3 en parallèle, tous deux dépendants de D1 mais pas l'un de l'autre)**, plutôt qu'une chaîne strictement séquentielle D1→D2→D3. Ceci n'est pas imposé sans justification — c'est une lecture directe des dépendances documentées dans ce document.

---

## 22. Migration future (description, aucun code)

Si D1 = Option B et D2 = Option C sont retenues (la combinaison recommandée) :

- **`SystemRole`** (`rbac.mocks.ts`) : ajout d'un champ `tenantId: string`. Les 3 rôles actuels devraient être dupliqués par tenant (ou un mécanisme de rôles par défaut/hérités serait à spécifier — non couvert par les sources actuelles, nouvelle question à soumettre au PO au moment de l'implémentation).
- **`SystemUser.roleIds`** : reste un tableau de `string`, mais chaque `roleId` référencerait désormais un rôle appartenant spécifiquement au tenant de l'utilisateur — une validation de cohérence deviendrait nécessaire à chaque écriture.
- **`roles` (persistance future)** : table avec `tenant_id NOT NULL, FK → tenants.id`, conforme au schéma canonique déjà vérifié.
- **`users_roles` (si D3 = Option B)** : nouvelle table de jonction `{ user_id, role_id, tenant_id, assigned_at, assigned_by }` — schéma exact non spécifié par les sources au-delà de la présence de `tenant_id` confirmée.
- **`role_permissions` (si conçue comme entité propre)** : table de jonction `{ role_id, permission_id }`, potentiellement enrichie de métadonnées si un jour nécessaire (non spécifié par les sources).
- **`permissions`** : resterait un catalogue global sous toute option de D1 — aucun changement de schéma nécessaire de ce côté.
- **`PermissionContext`** (`permission-context.tsx`) : le calcul de `currentUser.permissions` dans `useMemo` devrait dépendre du tenant courant (`useTenant()`), introduisant une dépendance nouvelle entre `PermissionProvider` et `TenantProvider` — actuellement tous deux montés indépendamment dans `AppProviders` (`src/app/providers.tsx`).
- **`role.service.ts`** : `listRoles`/`getRole` devraient adopter le pattern `getTenantScoped` déjà utilisé par `userService`/`sessionService` ; `listUsersForRole` resterait largement inchangé dans sa forme.
- **Services/repositories backend** : un futur backend devrait exposer `GET/POST/PUT/DELETE /roles` scopé tenant (côté `tanzen-frontend`) et `GET/POST/PUT/DELETE /permissions` scopé Platform (côté `tanzen-commercial`), cohérent avec l'API déjà anticipée pour `users`/`tenants`.
- **SQLite/migrations/Outbox/SyncEngine** : aucune mention de ces mécanismes trouvée dans les sources consultées pour ce projet (`tanzen-frontend` reste une architecture mock-en-mémoire, `mockRequest`, sans base de données locale ni synchronisation offline documentée) — ces éléments semblent appartenir à un contexte différent (peut-être `tanzen-mobile`, non inspecté) et ne sont pas traités plus avant faute de source pertinente dans ce projet.

**Aucun code n'a été écrit pour produire cette section** — description prospective uniquement.

---

## 23. Backend

| Élément | Peut être préparé côté frontend (sans backend réel) | Exige impérativement le backend |
|---|---|---|
| Création de rôle | Structure de formulaire, validation de forme (champs requis) | Persistance réelle, unicité, cohérence tenant garantie |
| Modification de rôle | Idem | Idem, + prévention de la modification concurrente |
| Affectation de rôle | Structure UI (`RolePicker`), validations de forme (existence dans le catalogue local) | Validation d'autorité réelle (l'appelant a-t-il le droit d'affecter CE rôle à CET utilisateur ?), persistance |
| Résolution des permissions | Calcul local à partir d'un mock (déjà fait) | Résolution serveur à chaque requête sensible — ne jamais faire confiance à un `currentUser.permissions` calculé côté client pour une décision de sécurité réelle |
| Contrôle tenant | Filtrage d'affichage (`getTenantScoped`, déjà fait pour `users`/`sessions`) | Vérification d'autorité — un filtrage côté client peut toujours être contourné par un appel direct à l'API |
| Prévention de l'escalade | Garde UI (`RolePicker`), validations de forme | **Absolument** — c'est la seule couche qui puisse réellement empêcher une requête forgée, cf. §14 |
| Audit RBAC | Aucun mécanisme d'audit RBAC dédié n'existe aujourd'hui (au-delà du module `Audit` général déjà construit pour d'autres domaines, non vérifié en détail pour RBAC spécifiquement dans cette mission) | Journalisation serveur immuable de toute création/modification/affectation de rôle |

---

## 24. GO / NO-GO

### GO
Rien — comme dans l'audit précédent, aucune implémentation `roles`/`users_roles`/`permissions`/`role_permissions` n'est prête à démarrer sans validation explicite de D1/D2/D3 par le Product Owner.

### NO-GO
- Tout CRUD `roles`/`permissions` tant que D1/D2 ne sont pas validées.
- Toute entité `role_permissions`/`users_roles` propre tant que D1 (et D3 pour la seconde) ne sont pas validées.
- Toute modification de `PermissionContext`/`TenantContext`/`role.service.ts` tant que D1 n'est pas validée.

### DECISION_REQUIRED
D1, D2, D3 — voir `docs/P0_RBAC_DECISION_OPTIONS.md` pour la version courte destinée à la validation du Product Owner.

### BACKEND_PENDING
Persistance réelle de toute écriture RBAC ; résolution serveur des rôles/permissions ; prévention définitive de l'escalade de privilège (§14/§23) ; audit RBAC serveur.

---

*Fin de l'analyse. Voir `docs/P0_RBAC_DECISION_OPTIONS.md` pour la synthèse décisionnelle courte.*
