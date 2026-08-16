# TANZEN — Architecture de l'Application Tenant (tanzen-frontend)

Document créé par la mission « EXÉCUTION DE LA SÉPARATION COMMERCIAL /
TENANT » (2026-08-16), conformément à sa section 21. Décrit `tanzen-frontend`
**après** la séparation physique en trois projets indépendants
(`tanzen-commercial`, `tanzen-frontend`, `tanzen-mobile`) — voir
`docs/COMMERCIAL_TENANT_SEPARATION.md` pour la vue d'ensemble des trois, et
`docs/COMMERCIAL_TENANT_MIGRATION_REPORT.md` pour le détail de l'exécution.

## 1. Ce que ce projet est

`tanzen-frontend` est **exclusivement** l'Application Tenant : l'outil de
gestion quotidienne d'UNE organisation (coopérative, tontine, association,
mutuelle) par ses propres utilisateurs. Il ne contient plus :

- le site vitrine (Landing/Features/Pricing/Subscription) ;
- le tunnel commercial (Signup/Checkout/Payment/Billing) ;
- Platform Administration (Dashboard/Tenant Registry/Tenant Administration/
  Plans/Subscriptions/Payments/Billing/Platform Audit).

Ces domaines vivent désormais dans `tanzen-commercial`, un projet npm/git
séparé.

## 2. Domaines métier

```
tanzen-frontend
├── Auth          /login (point d'entrée)
└── Application Tenant (authentifiée)
    ├── Dashboard
    ├── Organization     Members, Governance (assemblées/réunions/votes/mandats)
    ├── Finance          Comptes, transactions, contributions, distributions
    ├── Credit           Demandes, prêts, remboursements, garants (sous /finance)
    ├── Tontines         Tontines, cycles, tirages, gagnants
    ├── Operations       Workflows, notifications, documents
    ├── Access & Security Utilisateurs, rôles, permissions, sessions, MFA
    ├── Audit            Vue d'ensemble, journaux, événements de sécurité
    └── Settings         Organisation, localisation, exercices, branding, ...
```

Chaque domaine est un module React Router monté sur son propre segment
`/*` (`src/features/<domaine>/`), chargé à la demande via `React.lazy`
(sauf Dashboard, statique). Rien n'a changé dans la logique métier de ces
domaines pendant la séparation — seuls Public/Platform ont été retirés du
projet.

## 3. Point d'entrée — `/login`

Nouveau depuis cette mission. `src/features/auth/login-page.tsx`, monté
sous le layout minimal `AuthShell` (`src/layouts/auth-shell.tsx` — logo
centré, pas de sidebar/header applicatif). Contenu fonctionnel identique à
l'ancien `signin-page.tsx` du site Public (formulaire email/mot de passe,
connexion simulée, redirection vers `/dashboard`) — seul l'habillage a
changé, et le lien "Pas de compte ? Créer mon espace" (qui pointait vers le
tunnel commercial) a été retiré : ce n'est plus le rôle de cette app.

`/` redirige vers `/login`. `AuthGuard` (`src/routes/auth-guard.tsx`) est
un **passthrough documenté** : aucune authentification réelle n'existe
(`BACKEND PENDING`, `currentUser` dans `mocks/rbac.mocks.ts` est une
constante toujours "connectée"). Quand un vrai système d'authentification
existera, c'est cet emplacement précis dans l'arbre de routes qui portera
la vérification de session, sans changer la structure du routeur.

## 4. Isolation tenant

Garanties déjà validées avant cette mission, **inchangées** :

- `TenantContext` (`src/contexts/tenant-context.tsx`) : un utilisateur ne
  voit jamais qu'un seul tenant (le sien, résolu depuis
  `currentUser.tenantId`) — aucune sélection, aucune lecture de
  `localStorage`.
- `TenantSwitcher` (`src/layouts/tenant-switcher.tsx`) rend un libellé
  statique, jamais de menu déroulant/recherche/ajout de tenant.
- `getTenantScoped()` (`src/services/tenant-scope.ts`) : tout service
  métier tenant-scoped l'utilise plutôt que de dupliquer la vérification
  `tenantId` — ressource absente ou appartenant à un autre tenant produit
  systématiquement le même écran "introuvable" (jamais de fuite
  d'information).
- Aucune route Platform Administration, aucune route commerciale
  (`/pricing`, `/checkout`, `/payment`, `/billing`, `/platform/*`, etc.)
  n'existe plus dans ce projet — vérifié en direct (Playwright), voir le
  rapport de migration.

## 5. `organization.service.ts` — ce qui reste ici

Ce service est **scindé** avec son équivalent dans `tanzen-commercial` (qui
ne garde que la partie écriture/registre) :

- **Reste ici** (Members/Governance du tenant courant) : `listMembers`,
  `getMember`, `createMember`, `updateMember`, `listAssemblies`,
  `listMeetings`, `listVotes`, `listBoardMembers`, `createAssembly`,
  `createMeeting`, `updateMeetingMinutes`, `createBoardMember`,
  `endBoardMandate`, `createVote`, `updateVoteResult`.
- **Dupliqué, lecture seule** : `listTenants`/`getTenant` — le sélecteur
  "Tenant" du formulaire Membre (`organization-module.tsx`) en dépend
  encore, même s'il ne contient jamais qu'un seul élément en pratique
  (`scope` toujours `'tenant'` ici, plus de `PlatformScopeGuard` dans ce
  projet).
- **N'existe plus ici** : `createTenant`, `updateTenant` (écriture du
  registre) — exclusifs à `tanzen-commercial`, jamais appelés depuis cette
  application.

## 6. Layouts

| Layout | Rôle |
|---|---|
| `AuthShell` | `/login` — minimal, pas de chrome applicatif |
| `AppShell` (+ `ShellHeader`, `ShellSidebar`, `TenantSwitcher`) | toutes les routes authentifiées |

`PublicShell`/`PlatformShell` n'existent plus dans ce projet.

## 7. i18n

Système inchangé (`LocaleProvider`/`useLocale`, persistance `localStorage`
clé `tanzen-locale`, sync `<html lang>`). Le dictionnaire
(`src/locales/{fr,en}/index.ts`) a perdu les sections `public`/`platform`
(déplacées vers `tanzen-commercial`) et gagné une section `auth` compacte
(titre/sous-titre/champs/bouton de `/login`). Toutes les autres sections
(`nav`, `dashboard`, `organization`, `finance`, `tontines`, `operations`,
`access`, `audit`, `settings`, `system`, `shell`) sont inchangées.
`npm run i18n:check` vérifie la parité FR/EN de ce dictionnaire réduit.

## 8. Dark mode

Le correctif appliqué pendant cette migration (voir rapport) retire de
`AppShell` un `useEffect` redondant qui dupliquait (en moins complet) la
logique déjà présente dans `ThemeProvider` (`src/contexts/theme-context.tsx`,
monté une seule fois à la racine de l'app). `ThemeProvider` reste l'unique
source de vérité pour la classe `.dark` sur `<html>`.

## 9. Backend pending

Identique à l'état documenté avant cette migration
(`docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §15) : pas d'authentification
réelle, `tenantId`/`scope`/`permissions` calculés côté client depuis un
mock. Cette migration n'a rien changé à cet état — elle a seulement déplacé
*où* vivent les écrans qui en dépendront un jour.

## 10. Mobile

`tanzen-mobile` (Expo/React Native, projet séparé) reste, comme avant cette
migration, strictement Tenant Application — non modifié par cette
séparation (elle ne concernait que les deux projets web).
