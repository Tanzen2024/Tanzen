# TANZEN — Architecture Commerciale / Platform (Public + Platform Administration)

**Statut : implémentation réelle.** Construction de la couche commerciale complète (Site Public + Platform Administration) demandée par le mandat « TANZEN — CONSTRUCTION COMPLÈTE DE LA COUCHE COMMERCIALE / PLATFORM », en complément de l'Application Tenant (déjà stabilisée, Phases 1-12 + correction Single Tenant, non modifiée par cette mission sauf ajout des sections commerciales sur la fiche Tenant Administration).

## État avant cette mission (inspection, §26 du mandat)

| Élément | État |
|---|---|
| Site vitrine (`src/features/public/`) | **EXISTANT** — Landing, Features, Sign In, Sign Up, Subscribe (calculateur volume/modules), Downloads, Docs |
| `/pricing` | **MISSING** |
| `/checkout`, `/payment`, `/payment/success`, `/payment/cancel` | **MISSING** |
| Tunnel `SaaSTenantOnboarding` | **MISSING** (préparé : `TenantForm`/`validateTenant`/`useTenantFormValues` déjà extraits en Phase E5 spécifiquement pour ce futur usage) |
| `PlatformShell`/`PlatformScopeGuard`/`/platform/*` | **EXISTANT** |
| Platform Dashboard | **MISSING** |
| Platform Tenants (registre) | **EXISTANT** (liste, création, édition, détail) |
| Platform Tenant Administration (sections commerciales : abonnement/paiements/facturation) | **MISSING** sur la fiche existante |
| Plans / Subscriptions / Payments / Billing / Platform Audit | **MISSING** — domaine entier absent des 59 tables du dictionnaire de données, déjà documenté comme `DECISION REQUIRED` dans `docs/FINAL_ARCHITECTURE_DECISIONS_A_VALIDER.md` §5 avant cette mission |
| Permissions RBAC `plans.read`/`subscriptions.read`/`payments.read`/`billing.read`/`platformAudit.read` | **MISSING** (confirmé absentes du catalogue avant cette mission) |

## 1. Architecture globale

```
TANZEN FRONTEND
      │
      ├── PUBLIC (non authentifié)
      │     src/features/public/ → PublicModule → PublicShell
      │     Landing · Features · Pricing (nouveau) · Subscribe (existant) ·
      │     Checkout (nouveau) · Payment/Success/Cancel (nouveau) ·
      │     Sign In · Sign Up · Downloads · Docs
      │
      ├── PLATFORM ADMINISTRATION (scope === 'platform')
      │     src/features/platform/ → PlatformModule → PlatformShell
      │     Dashboard (nouveau) · Tenants (existant) · Tenant Administration
      │     (existant + sections commerciales nouvelles) · Plans (nouveau) ·
      │     Subscriptions (nouveau) · Payments (nouveau) · Billing (nouveau) ·
      │     Platform Audit (nouveau)
      │
      └── TENANT APPLICATION (inchangée par cette mission)
            AppShell — Dashboard, Organization, Finance, Credit, Tontines,
            Governance, Operations, Documents, Workflows, Audit, Settings
```

## 2. Public layer

`PublicModule` (`src/features/public/public-module.tsx`) — routes ajoutées : `pricing`, `checkout`, `payment`, `payment/success`, `payment/cancel`. Toutes sous `PublicShell` (aucune dépendance `TenantContext`/`PermissionContext`, cohérent avec le reste du site). `/subscribe` (calculateur volume/modules existant) conservé tel quel, non supprimé, reste accessible (lien « abonnement personnalisé » sur la nouvelle page Pricing) — les deux modèles de tarification (paliers fixes vs. calcul à la carte) coexistent, pas de doublon supprimé arbitrairement.

## 3. Commercial layer (Public → Platform)

Nouveau domaine de données Commercial/Platform, entièrement absent du dictionnaire de données (59 tables) — construit sur autorisation explicite du mandat, avec mocks clairement documentés comme tels :
- `src/mocks/platform/plans.ts` — `Plan` (5 paliers Free/Starter/Standard/Premium/Enterprise, noms/prix donnés par le mandat lui-même).
- `src/mocks/platform/subscriptions.ts` — `Subscription` (statuts `active/pending/expired/cancelled`, donnés par le mandat).
- `src/mocks/platform/payments.ts` — `Payment` (méthodes `card/mobileMoney/bankTransfer`, propres à ce domaine, distinctes de `PaymentMethod` finance interne au tenant).
- `src/mocks/platform/invoices.ts` — `Invoice` (statuts `paid/pending/overdue/cancelled`).
- `src/mocks/platform/platform-audit.ts` — `PlatformAuditEvent` (7 types d'événements, tous explicitement listés par le mandat, aucun inventé).
- `src/services/platform-commercial.service.ts` — service unique regroupant ces 5 répertoires. `listPlans`/`getPlan` **non gardés par scope** (catalogue public, lisible depuis `/pricing`) ; toutes les autres fonctions gardées par `scope: PlatformScope`, retournant liste vide/`undefined` si `scope !== 'platform'` — même défense en profondeur que `organizationService.listTenants`.

## 4. Platform Administration

`PlatformShell` (`src/layouts/platform-shell.tsx`) — navigation étendue de 1 à 7 entrées (Tableau de bord, Tenants, Plans, Souscriptions, Paiements, Facturation, Audit Platform), toutes gardées au sommet de l'arbre par `PlatformScopeGuard` (inchangé). `PlatformModule` (`src/features/platform/platform-module.tsx`) — 6 nouvelles fonctions de page (`PlatformDashboard`, `PlansList`, `SubscriptionsList`, `PaymentsList`, `BillingList`, `PlatformAuditLog`) suivant exactement les mêmes primitives déjà utilisées par le registre des Tenants (`PageHeader`/`DataTable`/`FilterBar`/`StatusBadge`/`StatCard`/`EmptyState`). `TenantDetail` (fiche Tenant Administration existante) enrichie d'un nouveau composant `TenantCommercialInfo` (3 cartes : Abonnement, Paiements récents, Facturation) — la fiche reste une console d'administration commerciale, aucune donnée métier du tenant (Members/Finance/etc.) n'y a été ajoutée.

## 5. Tenant Application

**Inchangée**, sauf permissions RBAC additionnelles dans le catalogue partagé (§10) — aucune page/route/composant de l'Application Tenant modifié par cette mission.

## 6. Routes

```
PUBLIC   /, /features, /pricing, /subscribe, /checkout, /payment,
         /payment/success, /payment/cancel, /signin, /signup,
         /downloads, /docs
PLATFORM /platform/dashboard, /platform/tenants(/*), /platform/plans,
         /platform/subscriptions, /platform/payments, /platform/billing,
         /platform/audit
TENANT   inchangé
```

`/login` du mandat conservé sous son nom déjà existant `/signin` (équivalence explicitement autorisée par le mandat §5 : « les noms exacts peuvent être adaptés à l'architecture existante »). Pas de route `/billing` publique séparée (voir §14 Limitations).

## 7. Navigation

**Site Public** (`Navbar`) : « Tarifs » et « Commencer » repointés de `/subscribe` vers `/pricing` (nouveau point d'entrée canonique du parcours commercial, conforme au mandat §19). Liens similaires mis à jour pour cohérence : footer (« Tarifs »), CTA de la landing page, lien « Créer mon espace » de la page de connexion, redirection post-inscription de `/signup`. `/subscribe` reste joignable (lien direct sur la page Pricing), non retiré de la navigation globale du site (juste plus la cible principale de « Tarifs »).

**Platform** : voir §4, navigation horizontale à 7 entrées dans `PlatformShell`.

## 8. Tenant provisioning

Séquence implémentée dans `src/features/public/payment-page.tsx` (`handlePay`), honnête sur ce qui est simulé :
```
Checkout (org + admin info)
    ↓
Payment (mock, méthode choisie)
    ↓
organizationService.createTenant()        → Tenant { status: 'pending' }
    ↓
platformCommercialService.createSubscriptionForTenant() → Subscription { status: 'pending' }
    ↓
platformCommercialService.recordPayment() → Payment { status: 'completed' }, active la Subscription
    ↓
/payment/success → CTA vers /signin
```
**Ce qui n'est PAS simulé** : l'activation du `Tenant` lui-même (`status: 'pending' → 'active'`) et la création d'un compte utilisateur administrateur réel restent `BACKEND PENDING` — aucun lien d'activation, aucun email, aucune session n'est créée. Le message de succès le dit explicitement à l'utilisateur (`paymentSuccessDescription`). Vérifié en direct (Playwright) : le tunnel complet Pricing → Checkout → Payment → Success fonctionne de bout en bout, crée un tenant avec ID auto-incrémenté cohérent (`T-006`), une souscription active et un paiement avec référence — dans les limites de la persistance en mémoire du navigateur (aucune donnée ne survit à un rechargement complet, comportement identique à tous les autres domaines mockés de l'application).

## 9. Subscription

`Subscription` (§3) — un tenant peut avoir plusieurs abonnements dans le temps (historique conservé, ex. `SUB-006` annulé puis `SUB-003` actif pour Mutuelle Teranga). `SubscriptionsList` (Platform) permet de filtrer par statut. `TenantCommercialInfo` affiche l'abonnement actif du tenant consulté (ou le plus récent si aucun n'est actif).

## 10. Payment

`Payment` (§3), distinct de `Transaction`/`finance.service.ts` (déjà documenté comme risque de confusion dans `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §14, reconfirmé ici). `PaymentsList` (Platform) liste tous les paiements tous tenants confondus. `PlatformDashboard` affiche les 5 paiements les plus récents et le total des paiements `completed` comme proxy de revenu.

## 11. Billing

`Invoice` (§3) — `BillingList` (Platform) liste les factures tous tenants confondus. Une facture par abonnement facturé, statut indépendant du paiement associé (ex. `INV-004` `overdue` pour un paiement `failed`). Pas de portail de facturation self-service côté Public (voir §14).

## 12. Tenant administration

Voir §4 — `TenantCommercialInfo`, nouveau composant intégré à la fiche `TenantDetail` existante (`/platform/tenants/:id`), sans transformer cette page en console de gestion métier du tenant (règle explicite du mandat §10).

## 13. Security boundaries

- `PlatformScopeGuard` (inchangé) protège tout `/platform/*`, y compris les 6 nouvelles routes — revérifié en direct (Playwright, session tenant-scoped réelle) : les 7 routes Platform (`dashboard`, `tenants`, `plans`, `subscriptions`, `payments`, `billing`, `audit`) redirigent toutes vers `/unauthorized`.
- `platformCommercialService` : défense en profondeur indépendante de la garde de route — `listSubscriptions`/`listPayments`/`listInvoices`/`listAuditEvents` renvoient un tableau vide si `scope !== 'platform'`, même si la fonction était appelée directement en contournant la route.
- `listPlans`/`getPlan` sciemment **non gardés** par scope : le catalogue de plans est une donnée commerciale publique (affichée sur `/pricing`, avant toute authentification) — décision documentée, pas un oubli.
- Nouvelles permissions RBAC (`plans.read`, `subscriptions.read`, `payments.read`, `billing.read`, `platformAudit.read`) ajoutées au catalogue partagé (`src/mocks/rbac.mocks.ts`) et à `role-admin` (seul rôle `scope: 'platform'` existant) — aucune permission métier existante modifiée, aucun rôle existant retiré ou affaibli.
- Correction Single Tenant (`docs/FIX_TENANT_APP_SINGLE_TENANT.md`) **non retouchée** : `TenantSwitcher`/`TenantContext` restent inchangés, revérifiés fonctionnels après cette mission (Platform Administration reste accessible uniquement via `/platform/*`, jamais via un raccourci dans l'Application Tenant).

## 14. Backend pending

- Authentification réelle, résolution serveur de `tenantId`/`scope`/`permissions` — inchangé depuis `docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` §15.
- Passerelle de paiement réelle (`PaymentPage` simule un paiement instantané réussi, aucun provider intégré — `paymentPendingNote` l'indique explicitement à l'écran).
- Activation réelle du tenant (`pending → active`) et de son administrateur initial (lien/token d'activation, définition de mot de passe) — non construit, `BACKEND PENDING` explicite sur l'écran de confirmation.
- Persistance réelle — tout le domaine commercial (Plans/Subscriptions/Payments/Invoices/Audit) vit en mémoire navigateur comme le reste de l'application ; aucune donnée ne survit à un rechargement complet.
- Portail de facturation self-service côté Public — délibérément non construit : une page « mes factures » pour un client authentifié n'a de sens qu'après un vrai système de compte client, qui n'existe pas encore ; l'équivalent existe côté Platform (`/platform/billing`, vue admin sur tous les tenants).

## Limitations actuelles / décisions de périmètre

- `/billing` public (mentionné dans le schéma du mandat sous Site Public) volontairement non construit comme route séparée — voir §14, dernier point.
- KPI « Tenants suspendus »/« Tenants expirés » du Platform Dashboard : aucun nouveau statut inventé. « Suspendu » = `Tenant.status === 'inactive'` (valeur déjà canonique) ; « Expiré » = tenant dont l'abonnement le plus récent a `Subscription.status === 'expired'` (valeur déjà listée par le mandat). Mapping documenté dans `platform-commercial.service.ts` (`getDashboardSummary`).
- `PaymentMethod` du domaine Platform (`card`/`mobileMoney`/`bankTransfer`) est une énumération nouvelle, propre à ce domaine — aucune énumération canonique de méthode de paiement SaaS n'existait dans le projet à réutiliser.

## Tests

`npm run typecheck` — 0 erreur. `npm run lint` — 0 erreur, 16 warnings pré-existants inchangés. `npm run test` — 123/123 tests (suite existante, aucun nouveau test automatisé requis par cette mission — vérification faite par navigateur réel comme demandé §23). `npm run build` — succès (922,54 kB / 262,13 kB gzip chunk principal, +14 kB gzip par rapport à avant cette mission, même avertissement pré-existant de taille de chunk).

Vérification navigateur réelle (Playwright), toutes les 19 vérifications listées au mandat §23 :
1-5, 7-14 (Landing/Pricing/Subscription/Checkout/Payment mock/Login mock/Platform Dashboard/Tenants/Tenant Administration/Plans/Subscriptions/Payments/Billing/Platform Audit) : chaque page chargée et son contenu attendu confirmé, **zéro nouvelle erreur console** sur les 15 pages testées.
6/15/16/17 (parcours complet + Application Tenant accessible/isolée/sans Platform Administration) : tunnel Pricing→Checkout→Payment→Success exécuté de bout en bout avec succès (tenant `T-006` créé, abonnement activé, paiement enregistré avec référence) ; Application Tenant revérifiée sans régression (tenant chip statique, aucun bouton Platform Administration).
18/19 (accès `/platform/*`) : les 7 routes Platform (dont les 6 nouvelles) redirigent un utilisateur tenant-scoped vers `/unauthorized` ; un Platform Admin y accède normalement.

## Fichiers créés

`src/mocks/platform/{plans,subscriptions,payments,invoices,platform-audit,index}.ts`, `src/services/platform-commercial.service.ts`, `src/features/public/{pricing-page,checkout-page,payment-page,payment-success-page,payment-cancel-page}.tsx`, `docs/COMMERCIAL_PLATFORM_ARCHITECTURE.md`.

## Fichiers modifiés

`src/mocks/rbac.mocks.ts` (5 permissions ajoutées), `src/services/query-keys.ts` (clés `platformCommercial`), `src/i18n/index.ts` (section `platform` ajoutée au type), `src/locales/{fr,en}/index.ts` (section `platform` + clés `public` additionnelles), `src/features/platform/platform-module.tsx` (6 pages + `TenantCommercialInfo` + routes), `src/layouts/platform-shell.tsx` (navigation 7 entrées), `src/features/organization/tenant-form.tsx` (props `cancelLabel`/`saveLabel` optionnelles, rétrocompatibles), `src/features/public/public-module.tsx` (5 routes), `src/features/public/components/{navbar,footer,cta}.tsx` (liens repointés vers `/pricing`), `src/features/public/{signin-page,signup-page}.tsx` (liens/redirections repointés vers `/pricing`).

## Fichiers inspectés, non modifiés

`src/routes/app-router.tsx`, `src/routes/platform-scope-route.tsx`, `src/contexts/tenant-context.tsx`, `src/layouts/tenant-switcher.tsx`, `src/layouts/app-shell.tsx`, `src/services/organization.service.ts` (réutilisé tel quel), `src/mocks/organization/tenants.ts` (`Tenant.status` non modifié), tous les modules métier de l'Application Tenant (Organization/Finance/Credit/Tontines/Operations/Access/Audit/Settings).

---

*Fin du document.*
