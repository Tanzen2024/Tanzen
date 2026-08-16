# TANZEN ENTERPRISE — Phase 11 : Audit / Settings

**Statut : implémentation réelle.** Périmètre strictement limité à Audit et Settings. Aucune permission ni aucun champ non documenté n'a été inventé. Une large partie du domaine Audit était déjà entièrement construite et n'a été que **vérifiée** (pas modifiée) ; le travail réel de cette phase porte sur Settings, où chaque écran affichait déjà les bonnes données mais avec des boutons « Enregistrer »/interrupteurs décoratifs (même défaut de fond que rencontré à chaque phase précédente sur les écrans de création/mutation).

## Méthodologie

Lecture intégrale avant toute modification : `src/features/audit/audit-module.tsx` (251 lignes), `src/services/audit.service.ts`, `src/features/settings/settings-module.tsx` (309 lignes avant modification), `src/services/settings.service.ts`, les 7 fichiers `src/mocks/settings/*.ts`, croisés avec les blocs UC01/UC03/UC10/UC30/UC110 de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` et la section Settings/Audit de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`. Plan validé en mode plan avant implémentation (`expressive-meandering-cook.md`).

---

## 1. Audit

**Aucune modification.** `AuditOverview`, `AuditLogs`, `AuditLogDetail`, `SecurityEvents`, `ActivityPage` étaient déjà entièrement construits, tous en lecture seule (cohérent avec les UC sourcés, tous des verbes « Consulter » — un journal d'audit n'est par nature pas modifiable), tous tenant-scopés via `auditService.list(currentTenant.id)`, avec un filtre RBAC déjà correct sur les événements sensibles (`audit.read`/`audit.readSensitive`, appliqué dans `useVisibleEvents`). Revérifié en lecture directe, rien à construire.

Une console Audit **Platform** (UC01-15/16/17, statistiques/journaux/connexions globaux, Super Administrateur) n'existe pas aujourd'hui — contrairement au registre des Tenants, jamais migrée vers `/platform/*`. Construire un nouvel écran Platform aurait été une fonctionnalité spéculative au-delà du périmètre étroit de cette phase (« Implémenter uniquement Audit, Settings », sans mention explicite d'un nouvel écran) → **non implémenté**, à demander explicitement si souhaité.

## 2. Settings — Organization

`settingsService.updateOrganizationSettings(tenantId, {timezone, currency})` (nouveau). Champs `timezone`/`currency` passés de `defaultValue` (non contrôlé, jamais persisté) à `value`/`onChange` contrôlés. Bouton Enregistrer gate `tenants.update` — réutilise le choix déjà présent dans le code décoratif existant (pas de nouvelle permission `organizationSettings.manage` inventée). L'identité du tenant (nom, nom légal, pays) reste en lecture seule avec lien vers le registre des Tenants — non touchée, conforme au mandat (« ne pas devenir un registre global de tenants »).

## 3. Settings — Localization

`settingsService.updateLocalizationSettings(tenantId, patch)` (nouveau), étendu à 4 champs contrôlés : `timezone`, `currency`, `dateFormat` (select `DD/MM/YYYY`/`MM/DD/YYYY`/`YYYY-MM-DD`), `numberFormat` (select `space`/`comma`/`period`). Gate `localization.manage` (déjà en place). Le changement de langue applicative (FR/EN, `useLocale`) reste un mécanisme séparé et déjà fonctionnel — non touché.

## 4. Settings — Fiscal Years

UC30-08/09/10, différé depuis la Phase 6. Deux actions indépendantes, sans enchaînement automatique de statut inventé :
- **Clôturer l'exercice courant** (`closeCurrentFiscalYear`) : `open`→`closed`, `isCurrent=false`, uniquement sur l'exercice `isCurrent`.
- **Ouvrir un exercice** (`openFiscalYear`) : `upcoming`→`open`, `isCurrent=true`, sur l'exercice explicitement choisi par l'administrateur (bouton par ligne dans l'historique).

**Bug trouvé et corrigé pendant la vérification** : `openFiscalYear` positionnait `isCurrent=true` sur le nouvel exercice sans jamais retirer `isCurrent` de l'ancien exercice courant, ce qui aurait pu produire deux exercices marqués « courant » simultanément pour un même tenant — violation de l'invariant déjà présent dans les données seed (`fiscal-years.ts`, un seul `isCurrent: true` par tenant). Corrigé en clôturant `isCurrent` sur l'ancien exercice avant d'ouvrir le nouveau — **son `status` n'est pas touché**, aucune cascade de statut inventée, seul l'invariant `isCurrent` unique est restauré. Testé en direct : après ouverture de 2027, le bandeau « Exercice en cours » bascule correctement de 2026 à 2027 (plus de doublon).

Pas de création de nouvel exercice fiscal (nécessiterait de deviner des dates par défaut) — uniquement les transitions de statut sur les exercices déjà seedés. Gate `fiscalYears.manage`.

## 5. Settings — Notifications

Les 3 onglets (`Préférences`/`Canaux`/`Règles`) avaient déjà les bons interrupteurs (`checkbox`/`Switch`) mais ne persistaient qu'en `useState` local. Ajout de `settingsService.updateNotificationPreference`/`updateNotificationChannel`/`updateNotificationRule` (nouveaux), câblés via `useMockMutation` en remplacement du `useState` local (composants simplifiés — ils lisent désormais directement les données de la query, sans état intermédiaire susceptible de diverger). `RulesTab` était jusqu'ici pur affichage sans aucun interrupteur ; ajout d'un `Switch` sur `rule.enabled` (même permission `notificationSettings.manage`, extension directe d'un champ déjà typé, pas un champ inventé).

## 6. Settings — Security Policies

Conversion d'un affichage `Info` pur lecture seule vers un formulaire éditable pour les 4 politiques (mot de passe/session/MFA/connexion) — tous les champs déjà typés dans `security-policies.ts`, aucun champ inventé :
- `minLength`, `expiryDays`, `preventReuseCount` (nombres), `requireUppercase`/`requireNumber`/`requireSymbol` (cases à cocher).
- `idleTimeoutMinutes`, `maxConcurrentSessions`, `rememberMeDays` (nombres).
- `enforced` (case à cocher), `graceLoginCount` (nombre), `allowedMethods` — converti en cases à cocher par méthode (`MfaMethod` est une énumération fermée `authenticatorApp`/`securityKey`/`sms`/`email`/`none` ; un champ texte libre aurait permis de saisir une valeur hors énumération, ce qui aurait été incorrect vis-à-vis du typage existant — corrigé en cours de développement, `tsc` ayant immédiatement signalé l'erreur de type).
- `maxFailedAttempts`, `lockoutMinutes` (nombres), `allowedIpRanges` — resté en champ texte séparé par virgules (converti en tableau à l'enregistrement) car il s'agit de données libres (plages IP), pas d'une énumération.

`settingsService.updateSecurityPolicies(tenantId, {password, session, mfa, login})` (nouveau) sauvegarde les 4 politiques en une seule action. Gate `securityPolicies.manage`.

## 7. Settings — Modules

L'interrupteur existait déjà avec confirmation avant désactivation (`ConfirmDialog`), mais ne persistait qu'en `useState` local. `settingsService.updateModule(tenantId, key, enabled)` (nouveau), câblé via `useMockMutation` en conservant l'UX de confirmation existante à l'identique (activation directe, désactivation confirmée). Gate `modules.manage`.

## 8. Settings — Integrations, Branding

**Branding** : déjà pleinement fonctionnel avant cette phase (`useTheme().setBranding`) — non touché.

**Integrations** : le bouton « Configurer » reste décoratif — **non implémenté**. Configurer une intégration réelle (clé API, OAuth) nécessiterait d'inventer un backend/flux d'identifiants, explicitement interdit par le mandat. Une simple bascule de statut (`connected`/`disconnected`) sans vrai flux sous-jacent aurait été trompeuse sous le libellé « Configurer ».

## 9. Bug de fond trouvé et corrigé — état de formulaire non réinitialisé au changement de tenant

Découvert pendant la vérification cross-tenant (§10) : `SettingsOrganization`, `SettingsLocalization` et `SettingsSecurityPolicies` gardent un état local de saisie (`useState`) qui ne se réinitialise jamais lors d'un changement de tenant courant (même route, même instance de composant — pas de remontage). Concrètement : un administrateur Platform modifie le fuseau horaire du Tenant A dans le formulaire, enregistre, puis bascule vers le Tenant B via le `TenantSwitcher` — le formulaire de Settings continuait d'afficher la valeur tapée pour le Tenant A au lieu de recharger celle du Tenant B, avec le risque réel qu'un clic « Enregistrer » ultérieur écrase silencieusement les paramètres du Tenant B avec ceux du Tenant A.

Ce n'est **pas** une fuite de données inter-tenant au niveau des mocks (`settingsService.updateOrganizationSettings` reste correctement filtré par `tenantId`, vérifié — le Tenant A n'a jamais été affecté par une action sur le Tenant B) : c'est un défaut d'affichage côté formulaire, dans le même esprit que le correctif `TenantSwitcher`/`TenantContext` traité hors-phase précédemment, mais localisé cette fois dans les composants Settings eux-mêmes plutôt que dans le contexte partagé.

**Corrigé** : ajout d'un `useEffect(() => resetState(), [currentTenant.id])` dans `SettingsOrganization`, `SettingsLocalization`, `SettingsSecurityPolicies` (état d'édition), `SettingsFiscalYears` (état des dialogues de confirmation) et `SettingsModules` (état du dialogue de confirmation) — le formulaire revient systématiquement aux données réelles du nouveau tenant dès le changement, sans reste de saisie non enregistrée de l'ancien tenant.

## 10. Tenant isolation — tests effectués

Vérification directe en environnement (`npm run dev`, headless Chrome + Chrome DevTools Protocol) :

1. **Reproduction et correction du bug §9** — fuseau horaire du Tenant T-001 (Coopérative Sutura) modifié et enregistré (`ISOLATION-TEST-T001-v3`), confirmé persisté sur T-001. Bascule vers T-002 (Tontine Horizon) via le `TenantSwitcher` : le formulaire affiche correctement la valeur par défaut propre à T-002 (`Africa/Dakar`), aucune trace de la saisie de T-001. Rejeu après correctif — comportement conforme.
2. **Aucune fuite de données au niveau service** : `updateOrganizationSettings`/`updateLocalizationSettings`/`updateSecurityPolicies`/`updateModule`/`closeCurrentFiscalYear`/`openFiscalYear`/`updateNotification*` filtrent tous directement par `tenantId` (pattern déjà établi dans tous les mocks Settings) — vérifié en lecture de code, aucune mutation transverse n'écrit sur un enregistrement d'un autre tenant.
3. Persistance confirmée par navigation SPA (changement d'onglet puis retour, sans rechargement dur qui réinitialiserait l'état mémoire des mocks) pour : Organization, Localization, Fiscal Years (ouverture + clôture, avec correction de l'invariant `isCurrent` du §4), Notifications (3 onglets), Security Policies, Modules (avec confirmation de désactivation).

## 11. i18n

Nouvelles clés FR/EN dans la section `settings` : `saving`, `saved`, `closeFiscalYear`, `closeFiscalYearConfirm`, `fiscalYearClosed`, `openFiscalYear`, `openFiscalYearConfirm`, `fiscalYearOpened`, `mfaMethodAuthenticatorApp`, `mfaMethodSecurityKey`, `mfaMethodSms`, `mfaMethodEmail`, `mfaMethodNone`.

## 12. Themes

Uniquement les tokens shadcn déjà utilisés dans le module — aucun style codé en dur ajouté.

## 13. Accessibility

Chaque nouveau champ a un `<Label htmlFor>` associé ; les nouvelles cases à cocher (politiques de mot de passe, méthodes MFA) sont enveloppées dans des `<label>` cliquables ; les `Switch` conservent leurs `aria-label` déjà en place.

## 14. Responsive

Formulaires en `grid sm:grid-cols-2`, cohérent avec le pattern déjà établi dans les phases précédentes.

## 15. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — succès, même avertissement pré-existant sur la taille de chunk (912 kB, antérieur à cette phase).

## 16. Use Case coverage

| UC | UI | Route | Service | Permission | Tenant isolation | Result |
|---|---|---|---|---|---|---|
| UC01 (audit — consultation) | Overview/Logs/Security Events/Activity | `/audit/*` | `auditService.list/get` | `audit.read`/`audit.readSensitive` | filtre direct `tenantId` | IMPLEMENTED (déjà avant cette phase) |
| — (Organization) | Formulaire Enregistrer | `/settings/organization` | `settingsService.updateOrganizationSettings` | `tenants.update` | filtre direct `tenantId` | IMPLEMENTED |
| — (Localization) | Formulaire Enregistrer | `/settings/localization` | `settingsService.updateLocalizationSettings` | `localization.manage` | filtre direct `tenantId` | IMPLEMENTED |
| UC30-08/09/10 | Clôturer/Ouvrir un exercice | `/settings/fiscal-years` | `settingsService.closeCurrentFiscalYear`/`openFiscalYear` | `fiscalYears.manage` | filtre direct `tenantId` | IMPLEMENTED |
| — (Notifications) | Préférences/Canaux/Règles | `/settings/notifications` | `settingsService.updateNotification*` | `notificationSettings.manage` | filtre direct `tenantId`/`userId` | IMPLEMENTED |
| — (Security Policies) | Formulaire Enregistrer | `/settings/security-policies` | `settingsService.updateSecurityPolicies` | `securityPolicies.manage` | filtre direct `tenantId` | IMPLEMENTED |
| — (Modules) | Interrupteur + confirmation | `/settings/modules` | `settingsService.updateModule` | `modules.manage` | filtre direct `tenantId` | IMPLEMENTED |
| — (Integrations) | Bouton Configurer | `/settings/integrations` | — | `integrations.manage` | — | BLOCKED (nécessiterait un backend/flux d'identifiants) |
| UC01-15/16/17 | Console Audit Platform | — | — | — | — | NOT BUILT (hors périmètre étroit de la phase, à demander explicitement) |

## 17. Decisions

Aucun fichier `DECISIONS_A_VALIDER.md` n'a été nécessaire pour cette phase : les deux seuls sujets non construits (Integrations « Configurer », console Audit Platform) ont une justification directe tenant au mandat lui-même (interdiction d'inventer un backend, hors périmètre explicite) plutôt qu'une ambiguïté nécessitant un arbitrage humain — consolidés au §16 ci-dessus.

## 18. Fichiers modifiés

- `src/services/settings.service.ts` — 9 nouvelles fonctions de mutation (organization, localization, close/open exercice fiscal avec correction de l'invariant `isCurrent`, 3× notifications, security policies, modules).
- `src/features/settings/settings-module.tsx` — câblage réel des formulaires/interrupteurs déjà présents (Organization, Localization, Fiscal Years, Notifications ×3 onglets, Security Policies, Modules) ; ajout de `useEffect` de réinitialisation d'état local au changement de tenant (§9) sur 5 composants.
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — nouvelles clés (§11).
- `docs/PHASE_11_AUDIT_SETTINGS.md` — nouveau (le présent rapport).

Aucun autre fichier (Finance, Credit, Tontines, Governance, Operations, Workflows, Documents, `src/features/audit/*`) n'a été modifié — Audit a été uniquement revérifié en lecture.

---

*Fin du rapport Phase 11. Ne pas commencer la Phase 12.*
