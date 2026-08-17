# TANZEN — P0 RBAC : Décisions à valider par le Product Owner

**Statut : accompagne un audit read-only (`docs/P0_RBAC_AUDIT.md`).** Seules les décisions réellement nouvelles ou non résolues figurent ici. Les décisions déjà consignées ailleurs sont référencées, jamais recopiées : CRUD Permissions et CRUD Rôles déjà `BLOQUANT` (`PHASE_10_DECISIONS_A_VALIDER.md` §1/§2), `mfa.manage` (`PHASE_10_DECISIONS_A_VALIDER.md` §3), `PositionRole`/catalogue de postes (`PHASE_06_DECISIONS_A_VALIDER.md` §3). D1/D2/D3 de la mission `users` (isolation stricte, auth honnête, `is_active`) restent acquises et ne sont pas rouvertes.

---

## D1 — `roles` (et par extension `role_permissions`/`users_roles`) : configuration globale ou ressource tenant-scopée ? *(BLOQUANT)*

**Problème** : `PHASE_02_MODELE_CANONIQUE_FINAL.md` (§2.2, verrouillé CANONIQUE) et `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (ligne 537) affirment que `Roles`/`Role_permissions`/`Users_roles` sont **tenant-scopés** dans le modèle canonique (`Tenant 1──N Roles`). Le code réel (`src/mocks/rbac.mocks.ts`, `src/services/role.service.ts`) implémente le contraire, explicitement et délibérément : 3 rôles globaux (`role-admin`, `role-manager`, `role-viewer`), sans `tenantId`, partagés par les 5 tenants du jeu de données — confirmé par le commentaire de tête de `role.service.ts` (« configuration système globale ») et par un test unitaire qui l'affirme en toutes lettres (« not tenant-scoped by design »). Cette contradiction n'avait jamais été détectée avant cet audit : Phase 5 a affirmé la conformité du frontend au modèle canonique sur ce point précis **sans vérifier le code source** (elle vérifiait la présence des classes sur les diagrammes UML, pas leur schéma réel dans `rbac.mocks.ts`).

**Ce qui n'est PAS tranché automatiquement** : les deux modèles sont fonctionnellement défendables. Des rôles globaux (Source Code) simplifient l'administration — un « Gestionnaire » a la même définition partout, cohérent avec un catalogue de permissions lui-même global — et c'est ce que Phase 10 a construit et testé avec succès (aucune régression, `PHASE_10_ACCESS_SECURITY.md`). Des rôles tenant-scopés (Source Canonique) permettraient à chaque tenant de personnaliser ses propres rôles (ex. un tenant pourrait vouloir un rôle « Trésorier RBAC » avec des permissions différentes d'un autre tenant), ce qui correspond au schéma `dictionnaire_donnees.xlsx` (`roles.tenant_id`, déjà vérifié dans la feuille `users` — sujet 6 de Phase 2 cite les 4 feuilles RBAC comme « chacune intégralement spécifiée » avec `tenant_id`).

**Question à trancher** : `SystemRole` doit-il (a) rester une configuration globale, auquel cas le modèle canonique verrouillé par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.2 doit être formellement corrigé/annoté pour refléter ce choix assumé (comme cela a déjà été fait pour d'autres champs, ex. `TontineCycle.status`) ; ou (b) gagner un `tenantId` pour se conformer au modèle canonique — ce qui impliquerait de redéfinir `systemRoles` par tenant (potentiellement dupliquer les 3 rôles actuels pour chacun des 5 tenants du jeu de données, ou introduire un mécanisme de rôles « globaux par défaut » + rôles « personnalisés par tenant », non spécifié par aucune source) ?

**Impact si non tranché** : bloque tout CRUD `roles` (UC20-15/17/18), toute conception d'une entité `role_permissions`/`users_roles` propre, et toute réponse précise à « un rôle peut-il être affecté à un utilisateur d'un autre tenant ? » (aujourd'hui non définie, pas seulement non implémentée).

**Statut** : **BLOQUANT.**

---

## D2 — Un futur CRUD `roles` (une fois D1 tranchée) : Tenant App (`tanzen-frontend`) ou Commercial (`tanzen-commercial`) ? *(BLOQUANT, dépend de D1)*

**Problème** : `PHASE_04_USE_CASE_CLASSIFICATION.md` (ligne 460) note explicitement que UC20-15/16/17/18 (« Gestion des rôles ») sont marqués `Transversal` avec pour acteurs **« Administrateur Tenant, Super Administrateur »** — contrairement à UC20-19/20/21/22 (« Gestion des permissions »), marqués `PLATFORM` strict, Super Administrateur exclusivement. Pris à la lettre, les sources suggèrent qu'un Administrateur Tenant pourrait légitimement gérer des rôles depuis l'Application Tenant. Mais cette lecture est antérieure à la séparation Commercial/Tenant (2026-08-16) et à D1/D2 de la mission `users` (isolation stricte : aucune administration transverse dans `tanzen-frontend`, même pour `scope: platform`) — jamais confrontée l'une à l'autre avant cet audit.

**Ce qui n'est PAS tranché automatiquement** : si D1 retient des rôles tenant-scopés (option b), un Administrateur Tenant gérant *ses propres* rôles (ceux de son tenant uniquement) serait cohérent avec l'isolation stricte déjà actée pour `users` — ce ne serait pas une administration transverse, juste une gestion locale, exactement comme `UserCreate`/`UserEdit` le sont déjà pour `users`. Si D1 retient des rôles globaux (option a, l'état actuel), alors par définition un CRUD `roles` modifierait une configuration partagée par tous les tenants — ce qui est structurellement une capacité Platform, cohérente avec la doctrine déjà actée de garder toute administration transverse hors de `tanzen-frontend`.

**Question à trancher** : une fois D1 tranchée, un futur CRUD `roles` doit-il être construit (a) dans `tanzen-frontend`, limité à la gestion des rôles du tenant courant (seulement cohérent si D1 = rôles tenant-scopés) ; (b) exclusivement dans `tanzen-commercial`, quel que soit le résultat de D1 (traite tout le RBAC-write comme une capacité Platform, par cohérence maximale avec D1/D2 déjà tranchées pour `users`) ; ou (c) partagé — un socle global géré par `tanzen-commercial` (rôles par défaut) et une personnalisation limitée par `tanzen-frontend` (non spécifié par aucune source, hypothèse la plus lourde à construire) ?

**Impact si non tranché** : bloque le lieu d'implémentation de UC20-15/16/17/18 même après D1 résolue.

**Statut** : **BLOQUANT, dépend de D1** (ne peut pas être tranchée avant D1).

---

## D3 — Affectation rôle↔utilisateur : fonction dédiée ou statu quo `userService.update({ roleIds })` ? *(non bloquant pour l'existant livré)*

**Problème** : aujourd'hui, affecter/retirer un rôle à un utilisateur ne passe par aucune fonction dédiée (`assignRole`/`revokeRole`) — cela transite uniquement par `userService.update(tenantId, userId, { roleIds: [...] }, scope)`, un patch générique qui remplace l'intégralité du tableau `roleIds`. Cela fonctionne pour l'usage actuel (`UserCreate`/`UserEdit` avec `RolePicker`), mais ne constitue pas une entité `users_roles` avec ses propres métadonnées (date d'affectation, affecté par qui — cf. `PHASE_02_DECISIONS_A_VALIDER.md` sujet 8, déjà noté comme dépendance future par `P0_USERS_AUDIT.md` §11) ni de garde service-side dédiée contre l'escalade de privilège (`P0_RBAC_AUDIT.md` §15 — `RolePicker` est une garde UI uniquement, contournable par un appel direct au service).

**Ce qui n'est PAS tranché automatiquement** : ajouter une garde service-side (empêcher `userService.update` d'accepter un `roleIds` contenant un rôle `scope: platform` si l'appelant est `scope: tenant`) serait une mesure de sécurité défensive raisonnable, mais elle nécessiterait de faire transiter l'identité de l'appelant (`currentUser.scope`) jusqu'au service — un changement de signature non demandé explicitement par cette mission (`P0_RBAC_AUDIT.md` reste strictement read-only) et qui empièterait sur le domaine `users` déjà `TERMINÉ`.

**Question à trancher** : faut-il (a) laisser `userService.update({ roleIds })` tel quel (statu quo, fonctionne pour l'usage actuel) ; (b) ajouter une garde service-side contre l'escalade de privilège dans une future mission dédiée (portée précise à définir) ; ou (c) concevoir une entité `users_roles` propre avec métadonnées d'affectation, ce qui dépend directement de D1 (si les rôles deviennent tenant-scopés, une jonction propre devient plus naturelle à construire en même temps) ?

**Impact si non tranché** : aucun sur l'existant livré (Create/Edit User fonctionne déjà) — affecte uniquement la robustesse d'une future évolution du RBAC.

**Statut** : **DECISION REQUIRED, non bloquant.**

---

## Synthèse

**2 sujets BLOQUANT** (D1 — rôles globaux vs tenant-scopés, la contradiction centrale de cet audit entre le modèle canonique verrouillé et l'implémentation réelle ; D2 — lieu d'implémentation d'un futur CRUD rôles, dépend directement de D1) et **1 sujet DECISION REQUIRED non bloquant** (D3 — robustesse de l'affectation rôle↔utilisateur). Aucun n'a été résolu par supposition ; aucune protection existante n'a été affaiblie ou renforcée pour les contourner — cette mission reste strictement analytique. Les décisions déjà bloquantes de Phase 10 (CRUD Permissions, CRUD Rôles générique, `mfa.manage`) ne sont pas dupliquées ici — elles restent référencées et non retranchées.
