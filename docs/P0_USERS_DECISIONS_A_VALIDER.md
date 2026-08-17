# TANZEN — P0 USERS : Décisions à valider par le Product Owner

**Statut : accompagne un audit read-only (`docs/P0_USERS_AUDIT.md`).** Seules les décisions réellement nouvelles ou non résolues figurent ici. Les décisions déjà consignées ailleurs sont référencées, jamais recopiées : NC-01 (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`), CRUD Rôles/Permissions et `mfa.manage`/auto-désactivation (`PHASE_10_DECISIONS_A_VALIDER.md`), D-4B-01 à 04 (`tanzen-mobile/docs/MOBILE_PHASE_04B_MEMBERS_DECISIONS_A_VALIDER.md`).

---

## D1 — Access & Security : console transverse ou strictement single-tenant ? *(BLOQUANT, sécurité)*

**Problème** : `userService.list/get/update/listByRole`, `sessionService.list/revoke`, `roleService.listUsersForRole` traitent `requesterScope === 'platform'` comme une autorisation de lecture/écriture sur les utilisateurs et sessions de **tous les tenants**, pas seulement celui de l'utilisateur courant. C'était un choix délibéré et testé de `PHASE_10_ACCESS_SECURITY.md` (« Access & Security est une console d'administration transverse »). Mais l'unique identité que `tanzen-frontend` peut incarner aujourd'hui (`currentUser` dans `rbac.mocks.ts`, `role-admin`, `scope: platform`) porte précisément ce scope — rendant la fuite active par défaut, pour quiconque utilise l'application telle qu'elle est livrée : `/access-security/users` liste les 12 utilisateurs des 5 tenants ; `/access-security/users/:id` et `/access-security/users/:id/edit` résolvent avec succès un `id` appartenant à n'importe quel tenant, sans 404 ; les modifications s'y appliquent réellement.

**Tension avec une décision plus récente** : `FIX_TENANT_APP_SINGLE_TENANT.md` (2026-08-16) établit, pour le header et le registre des tenants, que **aucun utilisateur, y compris `platform`-scoped, ne doit pouvoir administrer les données d'un autre tenant depuis l'Application Tenant**. `docs/P0_TENANTS_AUDIT.md`/`_FINAL_REPORT.md` (cette session) a déjà appliqué ce principe au registre des tenants (`organizationService.listTenants`), en signalant explicitement que le même motif existait encore, non corrigé, dans `userService` — précisément l'objet de cette décision.

**Ce qui n'est PAS tranché automatiquement** : la Source A (Phase 10) a une justification fonctionnelle réelle et non absurde — un opérateur plateforme légitime pourrait avoir besoin d'administrer des comptes système à travers les tenants (support, sécurité), ce qui est fonctionnellement différent d'« administrer les données métier d'un tenant ». Choisir entre les deux architectures sans validation reviendrait à trancher arbitrairement un point de sécurité.

**Question à trancher** : `tanzen-frontend` doit-il (a) s'aligner strictement sur `FIX_TENANT_APP_SINGLE_TENANT.md` — aucune lecture/écriture cross-tenant sur `users`/`sessions`/`roles`, quel que soit le scope, exactement comme cela a été fait pour le registre des tenants — ou (b) conserver Access & Security comme une console transverse légitime pour `scope: platform`, auquel cas il faut alors définir précisément **qui** peut légitimement porter ce scope dans `tanzen-frontend` (aujourd'hui, c'est l'unique utilisateur mocké par défaut, ce qui n'a de sens que pour une démo) ?

**Impact si non tranché** : le module reste `NO-GO — SECURITY_RISK` pour toute mise en production, y compris pour les parties par ailleurs entièrement fonctionnelles (création, désactivation).

**Statut** : **BLOQUANT.**

---

## D2 — Philosophie `authService.login()` en l'absence de backend : simuler un succès ou refuser explicitement ? *(non bloquant pour l'existant livré, mais divergent entre plateformes)*

**Problème** : `tanzen-frontend/src/services/auth.service.ts` — `login()` ne prend aucun paramètre et **retourne toujours un succès**, posant un drapeau de session locale inconditionnellement. `tanzen-mobile/src/auth/auth-service.ts` — `login(credentials)` **retourne toujours un échec explicite** (`{ ok: false, error: "BACKEND PENDING : aucune API d'authentification TANZEN n'existe encore." }`), sans jamais poser de session. Les deux se réclament de la même contrainte (« ne pas inventer une authentification réelle ») mais aboutissent à des comportements utilisateur opposés : le Web laisse croire qu'une connexion a eu lieu (n'importe quel email/mot de passe fonctionne), le Mobile refuse et l'affiche clairement.

**Analyse** : le comportement Mobile semble plus conservateur et moins susceptible de créer une fausse impression de sécurité — mais il rendrait aussi l'application Web totalement inutilisable en démo (aucun écran ne serait jamais atteignable sans un `AuthGuard` désactivé). Le comportement Web actuel a été un choix assumé de la mission Logout (`FIX_LOGOUT_TENANT_APP.md`), pour ne pas bloquer l'accès aux écrans déjà construits — cohérent avec le même raisonnement que `rbac.mocks.ts` (« rattaché à `role-admin` pour ne pas masquer les écrans déjà construits »). Aucune des deux réponses n'est évidemment "correcte" sans arbitrage produit.

**Question à trancher** : le Web doit-il converger vers le refus explicite du Mobile (au prix de rendre l'app inaccessible sans un vrai backend), ou le Mobile doit-il converger vers la simulation de succès du Web (au prix de perdre la garantie « pas de fausse session ») ? Ou les deux approches sont-elles délibérément différentes pour des raisons propres à chaque plateforme (le Web sert de démo commerciale, le Mobile est plus proche d'un usage réel terrain) ?

**Statut** : **DECISION REQUIRED**, non bloquant pour ce qui est déjà livré (aucune régression à corriger dans l'immédiat), mais à trancher avant toute harmonisation future entre les deux « Tenant Application ».

---

## D3 — Statut utilisateur : enum à 4 valeurs (code) ou booléen `is_active` (modèle canonique) ? *(non bloquant pour l'existant livré)*

**Problème** : `SystemUser.status` (`src/mocks/access/users.ts`) est un enum `'active' | 'inactive' | 'suspended' | 'invited'`. Le modèle canonique (`PHASE_02_DECISIONS_CANONIQUES.md`, schéma `users`, confirmé identique dans le dictionnaire Excel — feuille `users`, colonne `is_active BOOLEAN DEFAULT TRUE`) ne définit qu'un booléen simple. Le modèle canonique a priorité sur l'implémentation (règle de priorité du mandat, niveau 2 vs niveau 5) — c'est donc une divergence à trancher, pas à ignorer.

**Constat additionnel** : même au sein du code, la transition `invited → active` n'existe nulle part (seul `active⇄inactive` est câblé dans `UserDetail`) — un utilisateur créé avec le statut initial `invited` (`userService.create`) n'a aucun chemin documenté pour devenir `active`. `suspended` n'a de son côté aucune transition d'entrée ni de sortie (présent uniquement dans les données de démonstration, jamais assigné par le code).

**Question à trancher** : le modèle canonique (`is_active` booléen) doit-il être complété pour représenter `suspended`/`invited` comme des cas légitimes (et si oui, comment — un champ `invited_at`/`suspended_at` distinct du booléen ?), ou l'enum du code est-il une élaboration prématurée à réaligner sur le simple booléen canonique (au prix de perdre la distinction affichée aujourd'hui entre "jamais activé" et "désactivé") ?

**Statut** : **DECISION REQUIRED**, non bloquant (aucune fonctionnalité livrée ne dépend d'une résolution immédiate), mais à trancher avant toute évolution du cycle de vie utilisateur (notamment avant de définir la transition `invited→active` manquante).

---

## Synthèse

**1 sujet BLOQUANT** (D1 — architecture Access & Security transverse vs single-tenant, qui conditionne la résolution du `SECURITY_RISK` le plus important de cet audit) et **2 sujets DECISION REQUIRED non bloquants** (D2 — divergence Web/Mobile sur la simulation d'authentification ; D3 — statut utilisateur enum vs booléen canonique). Aucun n'a été résolu par supposition ; aucune protection existante n'a été affaiblie ou renforcée pour les contourner — cette mission reste strictement analytique.
