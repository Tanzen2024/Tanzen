# TANZEN — Correction architecturale critique : suppression du TenantSwitcher et de Platform Administration de l'Application Tenant

**Statut : correctif appliqué et vérifié en direct (navigateur réel, 2 sessions distinctes).**

## 1. Problème constaté

L'Application Tenant (`AppShell`) exposait, dans son header, deux éléments appartenant conceptuellement à la couche Platform :
- Un `TenantSwitcher` interactif (dropdown, recherche, « Ajouter un tenant », liste des 5 tenants) pour tout utilisateur `scope === 'platform'`.
- Un bouton « Platform Administration » menant vers `/platform`, également gardé par `scope === 'platform'`.

Comme l'application n'a pas d'authentification réelle et que l'unique utilisateur mocké par défaut (`currentUser` dans `src/mocks/rbac.mocks.ts`) est `scope: 'platform'`, **tout visiteur de l'application, dans son état livré par défaut, voyait ces deux éléments** en naviguant dans l'Application Tenant — ce n'était pas une fuite d'isolation (déjà vérifiée saine à plusieurs reprises pour un utilisateur réellement `scope: 'tenant'`, cf. `docs/FIX_TENANT_SWITCHER_ISOLATION.md` et `docs/PHASE_12_INTEGRATION_TRANSVERSALE_TESTS.md`), mais un choix architectural désormais jugé incorrect : l'Application Tenant ne doit **jamais** exposer de mécanisme de bascule de tenant ni de raccourci Platform, **quel que soit le scope de l'utilisateur qui la consulte**.

## 2. Cause racine

Le design précédent traitait `scope === 'platform'` comme une autorisation à **utiliser l'Application Tenant comme une console multi-tenant** (bascule libre entre tenants via le header, accès direct à Platform depuis n'importe quelle page tenant). Cette conception datait d'avant la séparation stricte Public/Platform/Tenant en 3 arbres de routes (`docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md`) et n'avait pas été retirée lors de cette séparation. La nouvelle règle, plus stricte : l'Application Tenant est **structurellement single-tenant pour tout le monde** ; la capacité multi-tenant (registre, bascule, administration) n'existe que dans la couche Platform (`/platform/*`), jamais mélangée dans le header de l'Application Tenant.

## 3. Fichiers concernés

| Fichier | Rôle | Modification |
|---|---|---|
| `src/layouts/tenant-switcher.tsx` | Composant d'affichage du tenant courant | Réécrit : suppression complète de la branche interactive (dropdown/recherche/ajout), ne rend plus que l'étiquette statique, **quel que soit le scope**. |
| `src/contexts/tenant-context.tsx` | Résolution du tenant courant pour l'Application Tenant | Simplifié : `tenants` ne contient plus jamais que le tenant de `currentUser.tenantId`, pour tout utilisateur. `setCurrentTenant`/`setCurrentTenantId` supprimés (plus aucun appelant légitime). `localStorage['tanzen-tenant-id']` n'est plus jamais lu ni écrit — la résolution ne dépend plus que de `currentUser`. |
| `src/layouts/shell-header.tsx` | Header de l'Application Tenant | Bouton « Platform Administration » retiré (suppression inconditionnelle, pas un masquage conditionnel) ; imports devenus inutiles (`ShieldCheck`, `navigate` local) retirés. |
| `src/layouts/tenant-switcher.test.tsx` | Tests unitaires du switcher | Réécrit : le second test (« platform-scoped peut ouvrir le switcher ») remplacé par un test confirmant que platform-scoped voit désormais, lui aussi, uniquement l'étiquette statique. |
| `docs/FIX_TENANT_APP_SINGLE_TENANT.md` | Ce document | Nouveau. |

**Fichiers inspectés mais non modifiés** (aucun autre consommateur du mécanisme retiré trouvé) : `src/layouts/shell-sidebar.tsx` (utilise `<TenantSwitcher compact />`, bénéficie automatiquement du nouveau comportement sans changement de code), `src/routes/platform-scope-route.tsx` (`PlatformScopeGuard`, inchangé — protège toujours `/platform/*`), `src/layouts/platform-shell.tsx` (n'a jamais consommé `TenantContext`, confirmé par grep — aucun impact), `src/features/organization/organization-module.tsx` (utilise `organizationService.listTenants()`, un service Platform séparé et déjà scope-gardé, pour peupler un sélecteur de tenant dans le formulaire Membre — fonctionnalité distincte du header, non touchée, hors périmètre de cette correction), tous les 8 modules métier (`dashboard`, `organization`, `finance`, `tontines`, `operations`, `access`, `audit`, `settings` — tous consomment uniquement `currentTenant`, jamais `tenants`/`setCurrentTenant`, confirmé par grep exhaustif avant modification).

## 4. Architecture avant

```
ShellHeader (Application Tenant)
  ├── scope === 'platform' → TenantSwitcher interactif (dropdown, recherche, 5 tenants, "Ajouter un tenant")
  │                        → Bouton "Platform Administration" → /platform
  └── scope !== 'platform' → TenantSwitcher étiquette statique
```

## 5. Architecture après

```
ShellHeader (Application Tenant)
  └── TOUS les scopes → TenantSwitcher étiquette statique uniquement
                       → AUCUN bouton "Platform Administration"

PlatformShell (Platform Administration, /platform/*)
  └── Registre complet des tenants, recherche, création — inchangé, toujours gardé par PlatformScopeGuard
```

## 6. Séparation Public / Platform / Tenant

Inchangée dans sa structure de routes (3 arbres distincts, `src/routes/app-router.tsx` non modifié par cette correction). Ce qui change : l'Application Tenant ne contient plus aucun pont visuel vers la couche Platform — un utilisateur ne peut plus naviguer de l'une vers l'autre via un contrôle du header. L'accès à `/platform/*` reste possible (navigation directe par URL, ou par un futur point d'entrée dédié une fois l'authentification réelle construite) et reste protégé par `PlatformScopeGuard` exactement comme avant.

## 7. Comportement Tenant

Pour **tout** utilisateur consultant l'Application Tenant (`/dashboard`, `/organization/*`, etc.), quel que soit son `scope` RBAC :
- Le header affiche uniquement : `[XX]  Nom du tenant` — aucun chevron, aucun menu, aucune recherche, aucune action de changement.
- Aucun bouton « Platform Administration » n'est présent, à aucun endroit de l'interface.
- `TenantContext.tenants` ne contient jamais qu'un seul élément — le tenant de l'utilisateur connecté.

## 8. Comportement Platform

Inchangé et revérifié fonctionnel : `/platform/tenants` affiche toujours les 5 tenants, la recherche, le bouton « Créer un tenant » ; `/platform/tenants/create` et les fiches détail fonctionnent normalement. Le Tenant Registry appartient exclusivement à cette couche.

## 9. Stratégie localStorage

`localStorage['tanzen-tenant-id']` n'est désormais **plus jamais lu** par `TenantContext`, pour aucun utilisateur — ce n'est plus une simple règle d'ignorance conditionnelle (comme dans le correctif précédent, `docs/FIX_TENANT_SWITCHER_ISOLATION.md`), c'est une absence totale de dépendance : la clé peut contenir n'importe quelle valeur, y compris celle d'un autre tenant, sans le moindre effet sur `currentTenant`. Vérifié explicitement (§10, TEST 3).

## 10. Tests effectués

Vérification directe en environnement (`npm run dev`, Playwright/CDP, avec bascule temporaire et réversible du mock `currentUser` dans `src/mocks/rbac.mocks.ts` pour simuler une session tenant-scoped — U-004/Mamadou Sow/T-002/role-manager — puis restauration à l'identique, confirmée par relecture intégrale) :

| Test | Résultat |
|---|---|
| **TEST 1** — utilisateur platform-scoped par défaut (Amadou Mbaye, T-001) sur `/dashboard` et `/organization` | Voit uniquement T-001 (« Coopérative Sutura »), aucun texte « Platform Administration », aucun bouton switcher interactif (`aria-expanded` absent). **PASS.** |
| **TEST 2** — utilisateur tenant-scoped (Mamadou Sow, T-002) sur `/dashboard` | Voit uniquement « Tontine Horizon », aucune trace de « Coopérative Sutura »/« Mutuelle Teranga », aucun texte « Platform Administration », aucun switcher interactif. **PASS.** |
| **TEST 3** — `localStorage['tanzen-tenant-id']` poisonné à `T-003` sous session T-001, puis à `T-001` sous session T-002, avec rechargement complet dans les deux cas | Le tenant affiché reste systématiquement celui de la session réelle (T-001 puis T-002) — jamais la valeur poisonnée. **PASS.** |
| **TEST 4** — utilisateur tenant-scoped (T-002) navigue directement vers `/platform/tenants` | Redirection immédiate vers `/unauthorized`, confirmée par l'URL finale. **PASS.** |
| **TEST 5** — utilisateur tenant-scoped (T-002) navigue directement vers `/tontines/TON-004` (ressource appartenant à T-001) | Page « ERREUR 404 — Page introuvable » rendue, aucune donnée de T-001 affichée, en-tête toujours « Tenant actuel : Tontine Horizon ». **PASS.** |
| **TEST 6** — session Platform Admin sur `/platform/tenants` | Les 5 tenants affichés, recherche fonctionnelle, bouton « Créer un tenant » présent, aucune erreur console. **PASS**, aucune régression sur la couche Platform. |

**Non-régression** : `npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 16 warnings pré-existants inchangés), `npm run test` (**123/123 tests**, y compris `tenant-switcher.test.tsx` réécrit pour refléter le nouveau comportement), `npm run build` (succès, chunk principal légèrement réduit — 908,44 kB vs 912,20 kB avant, effet du code mort retiré).

## 11. Résultats

**Confirmation explicite** : un utilisateur tenant-scoped ne peut plus voir ni sélectionner les autres tenants — vrai avant cette correction (isolation déjà garantie) et **toujours vrai après**, avec en plus la garantie qu'**aucun** utilisateur, y compris platform-scoped, ne peut désormais changer de tenant depuis l'Application Tenant elle-même.

**Confirmation explicite** : « Platform Administration » n'apparaît plus nulle part dans l'Application Tenant, pour aucun utilisateur — suppression inconditionnelle du code, pas un masquage visuel conditionnel.

## 12. Éléments BACKEND PENDING

Inchangés depuis `docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §15 : authentification réelle, résolution serveur de `tenantId`/`scope`, paiement, activation de tenant. Cette correction ne modifie ni n'ajoute aucune dépendance backend — elle retire uniquement une capacité frontend (bascule de tenant depuis le header) qui n'avait jamais eu besoin d'un backend pour fonctionner.

## 13. Conséquence fonctionnelle assumée

Le retrait du `TenantSwitcher` interactif fait perdre à un utilisateur platform-scoped la capacité, testée et documentée en Phase 11 (`docs/PHASE_11_AUDIT_SETTINGS.md` §9), de « prévisualiser »/administrer les données métier (Settings, Finance, Members…) d'un tenant différent directement depuis l'Application Tenant en changeant de tenant via le header. Cette capacité n'est plus disponible nulle part dans l'application telle qu'elle existe aujourd'hui (elle n'a pas été recréée côté Platform, qui ne propose aujourd'hui qu'un registre en lecture/administration générale des tenants, pas un accès à leurs données métier). C'est une conséquence directe et voulue de la règle « l'Application Tenant ne doit jamais permettre de changer de tenant » — signalée ici explicitement plutôt que découverte silencieusement, conformément à la règle anti-invention (ne pas recréer cette capacité sous une autre forme sans une demande explicite).

---

*Fin du document. Correctif appliqué, vérifié en direct sous 2 sessions réelles (platform-scoped et tenant-scoped), aucune régression détectée.*
