# TANZEN — Décision d'architecture Platform / SaaS / Tenant (verrouillage)

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce document. Aucune dépendance installée. Ce document est le seul fichier créé par cette mission. Il fait suite à `docs/DECISION_ARCHITECTURE_SAAS_TENANT.md` (constats 1-8 du contexte, repris tels quels, non ré-audités) et propose l'architecture cible + 3 décisions définitives, à valider avant toute implémentation.

---

## 1. Architecture actuelle

Application Vite + React + TypeScript unique, un seul `package.json`, aucun outillage monorepo (pas de `workspaces`, `turbo.json`, `nx.json`, `pnpm-workspace.yaml`). `src/main.tsx` monte `AppProviders` (`QueryClientProvider` → `LocaleProvider` → `ThemeProvider` → `TenantProvider` → `PermissionProvider`) puis `AppRouter`. `AppRouter` (`src/routes/app-router.tsx`) enveloppe **toutes** les routes métier dans un seul `<Route element={<AppShell />}>` : Dashboard (statique) + 7 domaines lazy-loadés (Organization, Finance, Tontines, Operations, Access & Security, Audit, Settings), chacun gardé par `PermissionRoute permission="..."`. `AppShell` (`src/layouts/app-shell.tsx`) est un layout unique et non paramétrable : `ShellSidebar` (menu + `TenantSwitcher` compact) + `ShellHeader` (recherche globale, notifications, `TenantSwitcher`, menu utilisateur) + `<Outlet/>`. `PermissionContext` injecte un `currentUser` mocké statique (`src/mocks/rbac.mocks.ts`) sans aucun flux d'authentification. `TenantContext` résout le tenant courant depuis `localStorage` + une liste statique complète de tenants.

## 2. Problèmes actuels

1. Aucun code pour le domaine Public/SaaS (Landing, Pricing, Subscription, Checkout, Payment, Onboarding) — confirmé par recherche exhaustive dans `docs/DECISION_ARCHITECTURE_SAAS_TENANT.md`.
2. Platform Administration (Tenant Registry) et Tenant Application partagent aujourd'hui le même `AppRouter`/`AppShell`/menu — pas de séparation structurelle, seulement un filtrage par `scope` sur certains noeuds de navigation et certaines routes (`PlatformScopeGuard`, ajouté lors de la mission précédente).
3. `TenantCreate` (`/organization/tenants/create`) est une action d'administration interne (formulaire simple, création immédiate), pas l'aboutissement d'un tunnel de souscription payant.
4. Aucune authentification réelle — `currentUser` est un objet mocké statique, jamais issu d'un login.
5. `AppShell` est monolithique : aucun mécanisme de layout alternatif pour un espace non authentifié (site vitrine) ou un espace Platform Administration visuellement distinct.

## 3. Architecture cible

Trois espaces logiques, dans **le même dépôt de code pour l'instant** (justification en §21/Décision C), avec une séparation **structurelle** (layouts distincts, préfixes de route distincts) et non plus seulement un filtrage de navigation :

```
TANZEN
  │
  ├── PUBLIC / SAAS        (non authentifié — PublicShell, à construire)
  │     Landing · Pricing · Signup · Payment · Confirmation
  │
  ├── PLATFORM ADMIN       (authentifié, scope=platform — PlatformShell, à construire)
  │     Tenant Registry · Billing · Subscriptions · Modules · Platform Users
  │
  └── TENANT APPLICATION   (authentifié, tenantId courant — AppShell, EXISTANT, inchangé)
        Dashboard · Organization (hors Tenants) · Finance · Credit · Tontines ·
        Governance · Operations · Audit · Settings
```

Le schéma conceptuel fourni dans la demande est globalement validé, avec une correction : **Platform Admin et Tenant Application restent dans le même processus d'authentification et le même `PermissionContext`** — un utilisateur `scope=platform` doit pouvoir naviguer entre les deux (c'est déjà le comportement observé et voulu du rôle `role-admin` aujourd'hui : il opère à la fois sur le registre et sur un tenant courant). Les séparer en deux applications authentifiées indépendantes casserait ce parcours sans qu'aucune source ne le demande explicitly.

## 4. Public / SaaS

À construire intégralement (rien n'existe). Layout dédié (`PublicShell`, sans sidebar/`TenantSwitcher`/`PermissionContext` — ces pages sont anonymes). Contenu : Landing, Features, Pricing/Plans, Souscription, Checkout/Payment, Confirmation, puis redirection vers le flux d'activation. Non authentifié par définition — aucune dépendance à `tenantId`/`scope`.

## 5. Platform Administration

À construire comme espace **structurellement séparé** de l'Application Tenant : layout dédié (`PlatformShell` — en-tête « Platform Administration », pas de `TenantSwitcher` au sens actuel puisqu'il n'y a pas de « tenant courant » à ce niveau, navigation propre : Tenants, Billing, Subscriptions, Modules, Users plateforme). Garde d'accès unique au sommet de l'arbre (`scope === 'platform'`), plutôt qu'un filtrage noeud par noeud comme c'est fait aujourd'hui pour le seul cas Tenant Registry. Le Tenant Registry existant (`organizationService.listTenants`, déjà scope-checké) migre logiquement ici.

## 6. Tenant Application

**Inchangée.** `AppShell` + les 7 modules existants restent la cible pour ce périmètre, une fois le Tenant Registry retiré du menu Organization (il n'y a plus besoin du filtrage `requiredScope` sur ce noeud si le registre vit dans un arbre séparé — simplification nette par rapport à l'état actuel).

## 7. Routing

Structure cible pour `AppRouter` (conceptuel, non implémenté) :

```
/                      → Public/SaaS (PublicShell)
/pricing, /signup, ... → Public/SaaS
/platform/*            → PlatformShell, garde scope=platform au sommet
/platform/tenants       (registre, ex-/organization/tenants)
/platform/billing
/platform/subscriptions
/app/* (ou racine post-auth) → AppShell (Tenant Application), inchangé sauf retrait de /organization/tenants*
```

Trois arbres `<Routes>` distincts plutôt qu'un seul arbre avec des gardes dispersées — un visiteur anonyme ne doit jamais charger le bundle de l'Application Tenant, et réciproquement.

## 8. Layouts

Trois composants de layout, tous montés au même niveau que l'actuel `AppShell` :
- `PublicShell` (nouveau) — en-tête marketing, pas de `PermissionContext`/`TenantContext` requis.
- `PlatformShell` (nouveau) — en-tête « Platform Administration », consomme `PermissionContext` (pour `scope`) mais pas `TenantContext` de la même façon (pas de tenant courant au sens métier).
- `AppShell` (existant, `src/layouts/app-shell.tsx`) — inchangé.

`ShellSidebar`/`ShellHeader` actuels restent spécifiques à `AppShell` ; `PlatformShell`/`PublicShell` auront leurs propres composants d'en-tête/navigation (réutilisant les primitives UI de `src/components/ui`, pas le sidebar métier).

## 9. Authentication

**Ce qui peut rester mocké temporairement** : la forme des données (`CurrentUser`, `SystemRole`, `permissionCatalog`) est un bon schéma cible, réutilisable comme contrat d'API. Les mocks métier (membres, comptes, prêts…) sont indépendants de l'auth et non concernés.

**Ce qui devra être remplacé** : `PermissionProvider` (`src/contexts/permission-context.tsx`) importe aujourd'hui `currentUser` directement depuis `mocks/rbac.mocks.ts` — à remplacer par un état résolu après un vrai login (réponse `/auth/session` ou claims JWT décodés). `resolveScope()` (calcul client à partir de `roleIds`) ne doit jamais faire autorité — c'est un calcul d'affichage, le `scope` réel doit être émis par le backend dans la session/le token.

**Points d'intégration backend nécessaires** : endpoint de login (email/mot de passe ou SSO), endpoint de résolution de session (`/me` ou claims JWT) retournant `user`, `tenantId`, `scope`, `permissions` effectives, endpoint de logout, et — pour le tunnel SaaS — un mécanisme d'activation de compte (lien/token d'activation envoyé après paiement confirmé).

**Dépendances avec `tenantId`** : aujourd'hui résolu côté client (`localStorage` + liste statique). Après authentification réelle, le `tenantId` d'un utilisateur tenant-scoped doit venir de la session (un tenant-scoped n'a qu'un seul tenant, pas de sélection possible) ; pour un utilisateur platform-scope naviguant dans l'Application Tenant, `localStorage` peut rester une préférence d'affichage (« dernier tenant consulté »), jamais une source d'autorisation.

**Dépendances avec `PlatformScope`** : même principe — `scope` doit être vérifié côté backend à chaque requête (cf. §17 Sécurité), le frontend ne fait que refléter ce qui lui est annoncé par la session.

## 10. TenantContext

Conservé tel quel dans son rôle actuel (tenant courant pour l'Application Tenant). Évolution nécessaire à terme (non codée ici) : résolution initiale depuis la session authentifiée plutôt que `localStorage` seul, et absence de tout accès à la liste complète des tenants pour un utilisateur qui ne devrait pas la voir — ce dernier point est déjà correctement traité côté `TenantSwitcher`/`listTenants` depuis la mission précédente.

## 11. Tenant Registry

Migre conceptuellement de `/organization/tenants` (sous `AppShell`, filtré par `PlatformScopeGuard`) vers `/platform/tenants` (sous `PlatformShell`, gardé au sommet de l'arbre Platform). Le service `organizationService.listTenants(tenantId, scope)` (déjà scope-checké) reste valable tel quel — seul son point de montage dans l'arbre de routes change.

## 12. TenantCreate

**Décision B, détaillée ici** : séparer en deux responsabilités distinctes plutôt que dupliquer ou forcer un partage complet.

- **`PlatformTenantCreate`** (renommage conceptuel de l'actuel `TenantCreate`) : reste une action d'administration Platform — formulaire simple, création immédiate par un opérateur autorisé (`scope=platform`), typiquement pour un tenant créé hors ligne (accord commercial direct, migration, tenant de test). Migre sous `/platform/tenants/create`.
- **`SaaSTenantOnboarding`** (nouveau, non construit) : tunnel multi-étapes `Plan → Subscription → Payment → Informations tenant → Confirmation → Activation`. L'étape « informations tenant » de ce tunnel a besoin exactement des mêmes champs que le formulaire Platform actuel.

**Ce qui doit être partagé** : le type `TenantInput` (`src/services/organization.service.ts`), la fonction `validateTenant` et le composant présentationnel `TenantForm` (`src/features/organization/organization-module.tsx`) — ces trois éléments décrivent « à quoi ressemble un tenant », indépendamment de qui le crée et quand.

**Ce qui ne doit pas être partagé** : l'orchestration de page. `PlatformTenantCreate` reste un simple submit → `organizationService.createTenant()` immédiat. `SaaSTenantOnboarding` est une machine à états multi-étapes où la création du tenant ne peut logiquement intervenir qu'**après** confirmation du paiement — observation utile : `organizationService.createTenant` fixe déjà `status: 'pending'` par défaut sur tout nouveau tenant, ce qui est cohérent avec un futur flux d'activation asynchrone (le tenant existe en base avant d'être pleinement actif), mais ce champ n'est aujourd'hui piloté par aucun écran.

## 13. Billing / Subscription

Domaine entièrement absent (confirmé §1-2). Cible : `Plan`, `Subscription`, `Invoice`, `Payment` comme entités Platform (pas Tenant — cf. §16 pour la distinction avec `Finance` tenant). Vit à la fois côté Public/SaaS (souscription initiale, paiement) et côté Platform Administration (consultation/gestion des abonnements de tous les tenants, facturation).

## 14. Payment

À ne jamais confondre avec `Transaction`/`finance.service.ts` (déjà signalé dans le rapport précédent, §3 conflit 3 — répété ici car structurant) : `Payment` (SaaS) = relation `Client → TANZEN Platform → Plan → Subscription`. `Transaction` (Tenant) = opérations financières internes à l'organisation du tenant. Deux modèles de données distincts, deux services distincts, aucun champ commun à réutiliser au-delà d'un éventuel `PaymentMethod` (`CASH, MOBILE_MONEY, BANK, CARD`, déjà canonique côté Finance tenant — à vérifier si le paiement d'abonnement SaaS partage la même énumération ou en a besoin d'une propre, ex. carte bancaire uniquement).

## 15. Tenant Onboarding

Séquence cible (non codée) : paiement confirmé → `createTenant()` (statut `pending`) → génération d'un lien/token d'activation pour l'administrateur initial → l'administrateur clique, définit son mot de passe, son compte est activé → le tenant passe à `active` → première connexion → entrée dans l'Application Tenant. Chaque étape après « paiement confirmé » nécessite un backend réel (aucune ne peut être mockée de façon crédible sans lien d'activation/token).

## 16. Code sharing

Entre les trois espaces : partage légitime du design system (`src/components/ui`), des locales i18n (`src/i18n`, `src/locales`), des types RBAC (`PlatformScope`, `Permission`), du client de requête (`QueryClientProvider`) et — vu en §12 — du triplet `TenantInput`/`validateTenant`/`TenantForm`. Pas de partage de `TenantContext` avec Public/SaaS (aucun tenant courant avant activation) ; pas de partage de `ShellSidebar`/`ShellHeader` avec `PlatformShell`/`PublicShell` (navigation trop différente pour justifier une abstraction commune à ce stade).

## 17. Sécurité

Rappel de doctrine déjà actée et à ne pas rouvrir : **le frontend n'est jamais l'autorité de sécurité.** Que l'architecture soit à un ou plusieurs arbres de routes, chaque requête backend doit re-vérifier `authenticatedUser + authorizedTenant/scope + permission` indépendamment de ce que le frontend affiche ou envoie (cf. `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` §11-12, inchangé par cette décision). La séparation Public/Platform/Tenant proposée ici est une clarification de **présentation et d'ergonomie**, pas un mécanisme de sécurité en soi — elle réduit le risque d'erreur humaine (moins de filtrage dispersé à oublier) mais ne remplace pas la vérification serveur.

## 18. Tenant isolation

Inchangée par cette décision — règle rappelée telle quelle par la demande et déjà implémentée/vérifiée (`docs/PHASE_02_TENANT_ISOLATION_SPEC.md`) : une fois dans l'Application Tenant, `tenantId` = tenant courant, aucun autre tenant visible (listes, recherche, dashboard, notifications, documents, audit). Le Tenant Registry global n'appartient qu'à Platform Administration — ce que la présente réorganisation en `/platform/tenants` rend structurel plutôt que seulement comportemental.

## 19. Migration depuis l'architecture actuelle

Non exécutée dans cette mission (« ne pas coder »). Ordre logique pour une future phase d'implémentation : (1) créer `PlatformShell` et `/platform/*`, déplacer les routes `tenants*` de `OrganizationModule` vers ce nouvel arbre sans changer le service ; (2) retirer le filtrage `requiredScope` désormais inutile sur le noeud de navigation Organization (le menu Tenant Application n'a plus jamais besoin d'afficher/masquer Tenants, il n'y est plus) ; (3) construire `PublicShell` et les pages Public/SaaS en parallèle, sans dépendance aux deux étapes précédentes ; (4) authentification réelle en dernier, une fois qu'il existe un backend à interroger — elle conditionne la bascule finale mais pas la structure de routes elle-même, qui peut être posée avant.

## 20. Risques

- Construire `PlatformShell`/`PublicShell` avant d'avoir un backend réel signifie qu'ils resteront mockés plus longtemps que l'Application Tenant — risque de dérive si les contrats de données (`CurrentUser`, `TenantInput`, futurs `Plan`/`Subscription`/`Payment`) ne sont pas figés tôt avec l'équipe backend.
- Séparer Platform/Tenant structurellement sans avoir de vraie authentification signifie que la garde `scope==='platform'` reste, en attendant, purement déclarative côté client — aucun risque nouveau par rapport à l'existant (déjà le cas aujourd'hui), mais à ne pas perdre de vue avant mise en production.
- Le site vitrine en SPA client-rendue (pas de SSR) est un risque connu pour le SEO/temps de premier affichage — accepté comme compromis à ce stade (cf. Décision C), à réévaluer avant un lancement commercial réel.

## 21. Décisions définitives

### DÉCISION A — Architecture des espaces (Public/SaaS, Platform, Tenant)

**Décision recommandée** : trois arbres de routes/layouts distincts (`PublicShell`, `PlatformShell`, `AppShell`) dans le même processus d'authentification et le même `PermissionContext`, plutôt que trois applications authentifiées indépendantes.

- **Justification** : le schéma fourni dans la demande sépare bien les trois espaces conceptuellement, mais une séparation en applications authentifiées totalement indépendantes casserait le parcours déjà observé et voulu d'un utilisateur `scope=platform` qui opère à la fois sur le registre et sur un tenant donné (comportement du `role-admin` mocké aujourd'hui, vérifié lors de la mission précédente). Rien dans les sources ne demande de séparer l'authentification elle-même.
- **Avantages** : résout structurellement le problème #2 (mélange actuel) sans sur-ingénierie ; supprime le filtrage `requiredScope` noeud-par-noeud au profit d'une garde unique par arbre, plus simple à auditer ; conserve un seul `PermissionContext`/session.
- **Inconvénients** : nécessite deux nouveaux layouts et une réorganisation des routes de `OrganizationModule` (déplacement de `tenants*`) avant toute construction du site vitrine.
- **Impact code existant** : `AppShell`, `ShellSidebar`, `ShellHeader`, tous les modules métier restent inchangés. `OrganizationModule` perd ses 3 routes `tenants*` (déplacées). `PlatformScopeGuard` (créé lors de la mission précédente) reste utile mais se déplace au sommet de l'arbre Platform au lieu d'être appliqué route par route.
- **Impact backend** : aucun changement de contrat nécessaire à ce stade — les mêmes champs (`user`, `tenantId`, `scope`, `permissions`) servent aux trois espaces.
- **Impact sécurité** : neutre à ce stade (toujours pas d'authentification réelle) ; positif à terme (moins de points de garde dispersés à auditer).

### DÉCISION B — Devenir de TenantCreate

**Décision recommandée** : Option C — séparer `PlatformTenantCreate` (existant, conservé, déplacé sous `/platform/tenants/create`) et un futur `SaaSTenantOnboarding` (nouveau, multi-étapes), en partageant `TenantInput`/`validateTenant`/`TenantForm` mais pas l'orchestration de page.

- **Justification** : les deux flux ont des déclencheurs et une temporalité de création incompatibles (immédiate vs post-paiement) — les fusionner (Option B) forcerait le formulaire d'administration à porter une complexité de tunnel de vente dont il n'a pas besoin ; les dupliquer entièrement (Option A pure, sans aucun partage) violerait l'interdiction explicite de duplication inutile du formulaire.
- **Avantages** : aucune duplication des champs/validations ; chaque écran garde une responsabilité claire et testable séparément.
- **Inconvénients** : demande de sortir `TenantForm`/`validateTenant` de `organization-module.tsx` vers un module partagé avant de construire le tunnel SaaS (petit travail de refactor, non fait ici).
- **Impact code existant** : `TenantInput` (déjà dans `organization.service.ts`) ne change pas de forme. `TenantForm`/`validateTenant` (actuellement des fonctions internes à `organization-module.tsx`) devront être extraites vers un emplacement partageable (ex. `src/features/organization/tenant-form.tsx`) — refactor mécanique, aucun changement de comportement.
- **Impact backend** : le tunnel SaaS aura besoin d'un endpoint de création de tenant distinct (ou du même endpoint appelé à un moment différent du cycle de paiement) — à spécifier avec le backend le moment venu.
- **Impact sécurité** : `PlatformTenantCreate` reste derrière l'authentification + scope platform (inchangé). `SaaSTenantOnboarding` est par nature pré-authentification côté tenant — sa propre sécurité (anti-fraude paiement, validation d'unicité d'email/organisation) est un sujet backend à part entière, non traité ici.

### DÉCISION C — Architecture du site vitrine

**Décision recommandée** : **Option A** (même frontend, routing/layout totalement séparés via `PublicShell`) comme architecture immédiate, avec **Option C (monorepo `apps/marketing` + `apps/app`)** documentée comme trajectoire d'évolution si le SEO/la performance du site vitrine deviennent critiques — pas Option C dès maintenant.

- **Justification par le projet actuel, pas par la mode** : le dépôt actuel n'a aucun outillage monorepo, aucun backend réel, aucun contenu marketing existant, et aucune configuration de déploiement multi-app — introduire une architecture monorepo maintenant ajouterait de la complexité d'outillage (orchestration de build, gestion de plusieurs `package.json`) pour un contenu qui n'existe pas encore, alors que le projet est encore au stade pré-lancement (tout est mocké, y compris l'authentification). Un vrai contre-argument existe (rendu client seul = mauvais SEO/premier affichage pour une page marketing publique) — il est reconnu en §20 comme un compromis assumé, pas ignoré.
- **Avantages (Option A)** : zéro nouvel outillage, zéro nouvelle dépendance (conforme à la contrainte de cette mission), un seul déploiement à maintenir, partage trivial du design system/i18n (même bundle, mêmes imports).
- **Inconvénients (Option A)** : pas de SSR/SSG pour le SEO du site vitrine ; le bundle du site vitrine et celui de l'application partagent le même processus de build (mitigé par le découpage en chunks déjà en place — `React.lazy` par domaine, cf. `app-router.tsx`).
- **Trajectoire d'évolution documentée (vers Option C)** : si `PublicShell` est construit avec une frontière nette dès le départ (aucun import croisé avec `AppShell`/`TenantContext`/`PermissionContext`, uniquement le design system et l'i18n en commun), l'extraction future vers `apps/marketing` dans un monorepo devient une opération mécanique de déplacement de dossier, pas une réécriture — c'est précisément pour cette raison que la séparation structurelle de la Décision A (routing/layout distincts dès maintenant) est un prérequis à cette option, même si le monorepo lui-même n'est pas construit aujourd'hui.
- **Impact code existant** : aucun sur l'Application Tenant/Platform Administration ; `PublicShell` est additif.
- **Impact backend** : le site vitrine consommera les futurs endpoints Billing/Subscription/Payment (§13-14), indépendants du backend métier tenant.
- **Impact sécurité** : le site vitrine est intégralement non authentifié — aucune donnée tenant/plateforme ne doit jamais être importée ou accessible depuis `PublicShell`, règle à faire respecter par revue de code plutôt que par une frontière technique tant qu'il reste dans le même bundle (limite acceptée de l'Option A, à surveiller).

## 22. Éléments nécessitant encore le backend

Authentification réelle (login/session/logout) ; résolution serveur de `tenantId`/`scope`/`permissions` (jamais calculée client) ; endpoints `Plan`/`Subscription`/`Payment`/`Invoice` (Billing SaaS) ; endpoint de création de tenant côté tunnel SaaS avec statut `pending` → `active` ; mécanisme de token/lien d'activation pour l'administrateur initial ; passerelle de paiement (fournisseur non spécifié dans les sources) ; toute persistance réelle (l'intégralité de l'application reste aujourd'hui sur mocks en mémoire).

---

*Fin du rapport. Aucun fichier de `src/` n'a été modifié. Aucune dépendance installée. Aucune route ni composant créé. ATTENDS TA VALIDATION AVANT TOUTE MODIFICATION.*
