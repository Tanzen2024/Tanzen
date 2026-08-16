# TANZEN Frontend — Implémentation réelle du logout

Rapport requis par la mission « TANZEN FRONTEND — IMPLEMENTATION LOGOUT »
(2026-08-16), §19. Projet concerné exclusivement : `tanzen-frontend`.
`tanzen-commercial` et `tanzen-mobile` n'ont pas été touchés.

## Cause avant correction

La mission supposait l'existence d'une architecture d'authentification
(`AuthGuard`, `authService`, un store de session, `TenantContext`,
`PermissionContext`) déjà fonctionnelle, à réutiliser sans la recréer.
L'inspection (§1 de la mission) a montré que ce n'était vrai qu'en partie :

| Élément attendu | État réel avant cette mission |
|---|---|
| `AuthGuard` | Existait, mais **passthrough documenté** — rendait toujours ses enfants, aucune vérification (`BACKEND PENDING`, ajouté lors de la séparation Commercial/Tenant du 2026-08-16) |
| `authService` | **N'existait pas** |
| Store/session d'authentification | **N'existait pas** — `currentUser` (`mocks/rbac.mocks.ts`) est une constante statique, toujours "connectée", indépendante de toute session |
| `LoginPage` (`/login`) | Simulait un délai (`setTimeout`) puis naviguait vers `/dashboard`, sans jamais persister d'état de session |
| Bouton "Se déconnecter" (`UserMenu`, dans `shell-header.tsx`) | Affiché, mais son `onClick` ne faisait que fermer le menu (`onClick={onClose}`) — **aucun effet réel** |
| `TenantContext`/`PermissionContext` | Dérivent toujours de `currentUser` (mock statique), sans aucune notion de session |

Il n'y avait donc littéralement rien à "réutiliser" pour le mécanisme de
session lui-même — seul son point d'insertion (`AuthGuard`, déjà à la
bonne place dans l'arbre de routes depuis la séparation Commercial/Tenant)
existait. Construire un `authService` minimal était la seule façon de
satisfaire l'exigence explicite de la mission : *« le logout local doit
néanmoins fonctionner réellement »* même en `BACKEND PENDING`.

## Mécanisme de logout retenu

Session locale uniquement, aucun token/JWT (rien à invalider côté
serveur puisqu'aucun serveur n'existe) :

```
src/services/auth.service.ts
  isAuthenticated() → lit localStorage['tanzen-session'] === 'active'
  login()           → écrit localStorage['tanzen-session'] = 'active'
  logout()           → supprime localStorage['tanzen-session']
```

`login`/`logout` passent par `mockRequest` (même abstraction que tous les
autres services mockés du projet, `src/services/api-client.ts`) — la forme
de l'appel (`Promise`, `try/catch/finally` côté appelant) reste identique
le jour où une vraie API existera ; seul le contenu de ces deux fonctions
changera alors.

`isAuthenticated()` relit `localStorage` à **chaque appel**, jamais mis en
cache en mémoire — un rechargement de page ne peut donc jamais
"ressusciter" une session déjà invalidée par `logout()`.

## Comportement de la session

- **Connexion** (`LoginPage`, `src/features/auth/login-page.tsx`) : le
  formulaire appelle désormais `await authService.login()` avant de
  naviguer vers `/dashboard` (au lieu du `setTimeout` précédent qui ne
  posait aucun état). `try/catch/finally` : `catch` affiche une
  notification d'erreur générique (`notify.error`, réutilise
  `system.errorTitle`) si `login()` rejetait un jour (aucun cas d'échec
  possible aujourd'hui, `mockRequest` ne rejette jamais) ; `finally`
  réinitialise l'état de chargement du bouton dans tous les cas.
- **Déconnexion** (`UserMenu`, dans `src/layouts/shell-header.tsx`) : le
  bouton "Se déconnecter" appelle désormais `handleLogout`, qui :
  1. ignore les clics successifs pendant l'exécution (`if (loggingOut)
     return;`, bouton désactivé visuellement — `disabled={loggingOut}` —
     pendant l'appel) ;
  2. appelle `await authService.logout()` ;
  3. navigue vers `/login` avec `{ replace: true }` (pas d'entrée
     "tableau de bord" inutile dans l'historique après déconnexion) ;
  4. en cas d'erreur, affiche une notification et réactive le bouton
     (`catch`/pas de `finally` séparé ici, car le succès navigue déjà
     hors du composant).

## Comportement du TenantContext / PermissionContext

**Ni l'un ni l'autre n'a été modifié.** Ils restent de simples projections
du mock RBAC (`ownTenant`/`currentUser`), sans aucune notion de session —
décision architecturale délibérée, pas un oubli :

- La garantie demandée ("après logout, aucune session tenant/permission
  active") est assurée **structurellement**, au niveau du routeur : ces
  deux contextes ne sont consommés que par des pages situées **à
  l'intérieur** du bloc protégé par `AuthGuard`
  (`src/routes/app-router.tsx`). Une fois `AuthGuard` redirige vers
  `/login`, plus aucun composant consommateur de `useTenant()`/
  `usePermissions()` n'est monté — la donnée n'est jamais "encore
  disponible puis effacée", elle n'est simplement jamais atteinte.
- C'est exactement le même principe que `PermissionRoute` (garde de page,
  pas garde de context) déjà en place pour chaque domaine métier, et que
  l'ancien `PlatformScopeGuard` (supprimé de ce projet lors de la
  séparation Commercial/Tenant, mais qui suivait la même logique de garde
  route-level).
- Alternative envisagée et écartée : rendre `TenantContext`/
  `PermissionContext` eux-mêmes "conscients" de la session (ex. renvoyer un
  utilisateur vide/`null` si non authentifié). Rejetée car cela dupliquerait
  la vérification de session à deux endroits (context ET route), pour un
  gain de sécurité nul (le context n'est jamais atteint sans passer par la
  route déjà gardée), et introduirait une complexité que la mission demande
  explicitement d'éviter (« NE PAS créer une UX complexe », « NE PAS
  recréer un système d'authentification »).
- Vérifié par test automatisé (`src/routes/auth-guard.test.tsx`) : un
  composant qui appelle `useTenant()`/`usePermissions()` à l'intérieur
  d'`AuthGuard` ne s'affiche jamais tant qu'aucune session n'est active, et
  s'affiche normalement avec les bonnes données une fois authentifié.

## Redirection

- Après connexion réussie : `/dashboard` (inchangé).
- Après déconnexion : `/login`, via `navigate('/login', { replace: true
  })` — mécanisme de navigation déjà utilisé partout ailleurs dans le
  projet (`react-router-dom`), rien de nouveau introduit.
- Accès direct à une route protégée sans session : `AuthGuard` redirige
  vers `/login` (`<Navigate to="/login" replace />`), avant même que
  `AppShell` ou la page demandée ne soient montés.

## Fichiers modifiés

- `src/routes/auth-guard.tsx` — passthrough → vraie garde de session.
- `src/features/auth/login-page.tsx` — appelle `authService.login()`,
  gère `try/catch/finally`.
- `src/layouts/shell-header.tsx` — bouton "Se déconnecter" (`UserMenu`)
  câblé sur `authService.logout()` + navigation, état `loggingOut` pour
  éviter les double-clics.

## Fichiers créés

- `src/services/auth.service.ts` — le service qui n'existait pas.
- `src/services/auth.service.test.ts` — 5 tests.
- `src/routes/auth-guard.test.tsx` — 4 tests (garde de route + non-accès
  à `useTenant()`/`usePermissions()` quand non authentifié).
- `docs/FIX_LOGOUT_TENANT_APP.md` (ce document).

## Tests

**Automatisés** (`npm run test`) :
- `authService` : démarre non authentifié · `login()` crée une session ·
  `logout()` invalide une session active · `logout()` supprime bien la clé
  `localStorage` (pas seulement un statut "inactive") · `isAuthenticated()`
  relit `localStorage` sans cache mémoire (pas de "session fantôme" après
  suppression externe de la clé, ce qu'un rechargement de page produirait).
- `AuthGuard` : refuse l'accès sans session (redirection `/login`, aucune
  donnée protégée rendue) · autorise l'accès avec session active (données
  tenant/permission bien rendues) · refuse de nouveau après un
  `logout()` explicite · refuse si la session est supprimée entre-temps
  (simule un rechargement).

Ces deux fichiers couvrent les TESTS 1 à 6 du mandat (logout normal, route
protégée après logout, session non restaurée après "refresh" — simulé par
relecture `localStorage` fraîche, session persistée bien supprimée,
absence de session tenant/permission après logout).

**Tentative écartée** : un troisième fichier de test
(`shell-header.test.tsx`, cliquant littéralement sur le bouton dans le
composant `ShellHeader` réel) a été écrit et passait seul, mais
**déstabilisait deux fichiers de tests préexistants** (`tenant-switcher
.test.tsx`, `permission-gate.test.tsx`) quand exécuté avec la suite
complète — `getMultipleElementsFoundError` reproductible, isolé par
bissection à ce fichier précis (confirmé : sans lui, 132/132 tests stables
sur plusieurs exécutions consécutives ; avec lui, 2 fichiers préexistants
échouent de façon déterministe). Cause probable : `ShellHeader` monte
`TenantSwitcher` (requêtes `useQuery`, listeners globaux `document`) dont
le nettoyage entre fichiers de test ne semble pas hermétique sous le pool
de threads réutilisés de Vitest — un problème d'infrastructure de test
préexistant à cette mission, pas un défaut du mécanisme de logout
lui-même. Plutôt que de risquer la stabilité de la suite existante, ce
fichier a été retiré ; le comportement qu'il visait à couvrir
(clic réel sur le bouton) a été vérifié à la place en navigateur réel
(ci-dessous), qui est de toute façon plus représentatif qu'un rendu jsdom.

**Manuel / navigateur réel** (Playwright, `npm run dev`), reproduisant
exactement le parcours §17 du mandat :
1. `/login` ouvert.
2. Connexion avec le mécanisme mock (`amadou.mbaye@sutura.sn`).
3. `/dashboard` atteint, `localStorage['tanzen-session'] === 'active'`.
4. Menu utilisateur ouvert.
5. Clic sur "Se déconnecter".
6. Redirection vers `/login` confirmée, `localStorage['tanzen-session']`
   redevenu `null`.
7-8. Tentative directe de `/dashboard`, `/organization/members`,
   `/finance/accounts`, `/settings/organization` après déconnexion → les
   quatre redirigent vers `/login`.
9-10. Reconnexion, puis déconnexion, puis rechargement complet de la
   page → reste sur `/login`, session toujours `null` (non restaurée).

Zéro erreur console sur l'ensemble du parcours.

## Résultats de validation

```
npm run typecheck   → 0 erreur
npm run lint         → 0 erreur, 14 warnings préexistants inchangés (react-refresh/only-export-components)
npm run test          → 132/132 tests (123 préexistants + 9 nouveaux)
npm run build          → succès, 895,09 kB / 253,00 kB gzip (chunk principal, +0,66 kB gzip — authService/AuthGuard sont minces)
```

## Points BACKEND PENDING restants

- La session reste un simple drapeau local (`localStorage`), sans token
  réel — aucun identifiant n'est vérifié par `login()`.
- Aucun appel réseau n'est effectué par `authService` (`POST /logout`,
  `POST /auth/logout`, endpoint JWT ou de rafraîchissement) — explicitement
  hors périmètre, non inventés, conformément à la mission §16.
- Le jour où un vrai backend existera : `authService.login()`/`logout()`
  seront les deux seules fonctions à modifier pour appeler une vraie API
  (poser/invalider un vrai token côté serveur) — la forme de l'appel côté
  composants (`await authService.login()`/`logout()`, `try/catch/finally`)
  ne change pas, tout comme le reste du projet suit déjà ce principe pour
  ses autres services mockés.

## Checklist finale (mandat §20)

- [x] bouton "Se déconnecter" fonctionne
- [x] `authService.logout()` utilisé (créé pour cette mission, puisqu'il
      n'existait pas — aucune architecture existante réutilisable trouvée
      à l'inspection)
- [x] session locale invalidée
- [x] utilisateur = unauthenticated (`authService.isAuthenticated() ===
      false`)
- [x] permissions invalidées (structurellement — jamais atteintes hors
      session, voir §"Comportement du TenantContext/PermissionContext")
- [x] `TenantContext` ne conserve pas la session (même raisonnement)
- [x] `/login` après logout
- [x] routes protégées inaccessibles après logout (4 routes testées)
- [x] refresh ne restaure pas la session
- [x] tests OK (132/132)
- [x] typecheck OK
- [x] lint OK
- [x] build OK

`tanzen-commercial` et `tanzen-mobile` non modifiés.
