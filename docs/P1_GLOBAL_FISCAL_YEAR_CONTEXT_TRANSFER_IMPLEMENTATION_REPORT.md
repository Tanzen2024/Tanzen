# P1 GLOBAL FISCAL YEAR — CONTEXT + TRANSFER
# IMPLEMENTATION REPORT

**Périmètre : `tanzen-frontend` uniquement.** `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés (confirmé §17 et git status final). Aucun commit, aucun push.

---

## 1. Résultat

**TERMINÉ**, y compris l'évolution de gouvernance §24-BIS (réouverture par demande → approbation, reçue en cours de mandat, avant toute ligne de code écrite pour la réouverture — le mécanisme direct initialement prévu n'a donc jamais été exposé à l'utilisateur final).

Trois livrables, tous vérifiés par build/tests/typecheck/lint/i18n **et** par un scénario navigateur complet (Playwright, 11/11 vérifications passées, 0 erreur console imputable à ce mandat) :
1. Contexte global Tenant + Fiscal Year, sélecteur visible en permanence (sidebar + header).
2. Création d'exercice transformée en assistant 2 étapes (informations → classification des données transférables).
3. Réouverture d'un exercice clôturé : workflow demande → approbation, réutilisant intégralement le moteur `workflowService`/`WorkflowRequest`/l'écran Operations déjà existants — aucun second système d'approbation créé.

## 2. Sélecteur global

`src/contexts/fiscal-year-context.tsx` (nouveau) — `FiscalYearProvider`/`useFiscalYear()`, monté dans `src/app/providers.tsx` juste après `PermissionProvider` (a besoin de `can()` pour respecter D-FY-04, voir §5 mandat) :
- `fiscalYears` : liste réelle du tenant courant (`settingsService.listFiscalYears`), **jamais codée en dur** (mandat §4).
- `selectedFiscalYearId`/`selectedFiscalYear` : état de VUE côté client uniquement. Initialisé sur l'exercice `isCurrent`, jamais sur une valeur arbitraire.
- `selectFiscalYear(id)` : ne peut sélectionner qu'un id présent dans `fiscalYears` (déjà tenant-scopé) — un id d'un autre tenant est structurellement absent de la liste, donc jamais sélectionnable (mandat §5/§23 « Tenant isolation »).
- **Ne modifie jamais** `FiscalYear.status`/`isCurrent`, ni aucune autre donnée (mandat §7 : « Sélectionner un FY ≠ ouvrir/clôturer/transférer »).

`src/layouts/fiscal-year-selector.tsx` (nouveau) — composant `FiscalYearSelector`, placé :
- Sidebar (`shell-sidebar.tsx`), juste sous `TenantSwitcher`, mode `compact`.
- Header desktop (`shell-header.tsx`), juste à côté de `TenantSwitcher`.

**Respect strict de D-FY-04 (§5 du mandat)** : si `!can('fiscalYears.read')`, le composant retourne `null` — **absent de l'UI**, pas seulement désactivé. Vérifié par construction (`canRead` calculé une fois dans le contexte, propagé au composant).

`TenantSwitcher` n'a **pas été modifié** — un second composant a été ajouté à côté, pas fusionné dedans (mandat §2 : « ne pas créer un second mécanisme de contexte si un mécanisme existant peut être étendu » — ici le mécanisme Tenant reste inchangé, c'est le Fiscal Year qui obtient son propre contexte parallèle, cohérent avec le fait que ce sont deux dimensions orthogonales : Tenant = isolation, Fiscal Year = vue temporelle).

## 3. Contexte Tenant + Fiscal Year

Vérifié en navigateur (Playwright) : changer d'exercice via le sélecteur (`Exercice 2026` → `Exercice 2027`) **ne modifie jamais** l'affichage du Tenant (`Coopérative Sutura` reste identique avant/après). Le Tenant reste piloté exclusivement par `TenantContext`, non touché par ce mandat — cohérent avec l'architecture single-tenant déjà en place (`docs/FIX_TENANT_APP_SINGLE_TENANT.md`).

## 4. Création d'exercice

`SettingsFiscalYears` (`src/features/settings/settings-module.tsx`) — le dialogue de création devient un assistant 2 étapes (`createStep: 1 | 2`), **sans écran séparé** (mandat §17 : « ne pas créer un deuxième écran Fiscal Year » — c'est le même `ConfirmDialog` réutilisé pour les deux étapes) :

**Étape 1** — informations (libellé, dates), affiche `Exercice précédent : {label}` (l'exercice courant, purement informatif). « Continuer » valide les champs (y compris `endDate > startDate`) **sans rien créer encore**.

**Étape 2** — classification des données (§5 ci-dessous). « Créer l'exercice » appelle `settingsService.createFiscalYear` (service D-FY-01 déjà existant, **non modifié** — aucune logique de transfert n'y a été ajoutée, cohérent avec le fait qu'aucune catégorie n'est aujourd'hui transférable, voir §5). « Retour » revient à l'étape 1 sans perdre la saisie.

Aucun autre exercice n'est jamais touché par cette création (`createFiscalYear` inchangé, déjà garanti par ses tests D-FY-01 existants).

## 5. Classification des données

**Constat central de cette mission, vérifié par inspection réelle du code (pas une supposition)** : recherche exhaustive de `fiscalYearId` dans `tanzen-frontend/src` — **zéro résultat** en dehors du module Settings lui-même. Conséquence directe, déjà établie par l'audit Fiscal Year initial (§12) et non remise en cause depuis : **aucune donnée métier n'est aujourd'hui structurellement liée à un exercice fiscal.** Il n'existe donc littéralement rien à transférer entre deux exercices — pas par limitation technique, mais parce qu'aucune donnée n'est aujourd'hui bornée par un exercice pour commencer.

`src/mocks/settings/fiscal-year-transfer-categories.ts` (nouveau) — catalogue de 9 catégories, chacune classée après lecture réelle du fichier source cité en `evidence` (mandat §12, catégories `PERMANENT`/`TENANT-SCOPED`/`FY-SCOPED`/`FY-DERIVED`/`DECISION_REQUIRED`, réutilisées telles quelles depuis D-FY-02) :

| Catégorie | Classification | Preuve |
|---|---|---|
| Configuration des tontines | `TENANT-SCOPED` | `src/mocks/tontines/tontines.ts` — aucun `fiscalYearId` |
| Membres actifs | `TENANT-SCOPED` | `src/mocks/organization/members.ts` |
| Règles de prêt | `TENANT-SCOPED` | `src/mocks/finance/loan-rules.ts` |
| Comptes / configuration | `TENANT-SCOPED` | `src/mocks/finance/accounts.ts` |
| Cotisations | `DECISION_REQUIRED` | `src/mocks/finance/contributions.ts` + `CycleContribution` |
| Transactions | `DECISION_REQUIRED` | `src/mocks/finance/transactions.ts` |
| Tirages | `DECISION_REQUIRED` | `CycleDraw`, rattaché au Cycle, jamais à un exercice |
| Présences | `DECISION_REQUIRED` | `src/mocks/organization/attendances.ts` |
| Votes | `DECISION_REQUIRED` | `src/mocks/organization/member-votes.ts` |

**`transferable: false` pour les 9** — pas une omission. Les 4 premières (déjà `TENANT-SCOPED`) continuent d'exister indépendamment de tout exercice : rien à transférer, elles s'appliquent déjà à tous les exercices. Les 5 suivantes (`DECISION_REQUIRED`) pourraient légitimement devenir FY-scoped un jour, mais cette décision n'a pas été prise (D-FY-02) — les inclure comme transférables aurait été une invention.

**UI** : chaque catégorie s'affiche en lecture seule (icône cadenas, jamais une case à cocher active — cohérent avec le mandat §16 « un élément non transférable ne doit pas être présenté comme une checkbox active », appliqué ici à 100% des catégories puisqu'aucune n'est aujourd'hui actionnable), avec un badge de classification et une explication. Un bandeau explicite ferme l'étape : *« Aucune donnée n'est aujourd'hui automatiquement transférée... »* — l'écran ne ment pas sur ce qu'il fait.

## 6. Données transférables

**Aucune**, à ce jour — voir §5. Ce n'est pas un livrable manquant : c'est le résultat honnête de la classification demandée par le mandat lui-même, qui prévenait explicitement (§12) : *« NE PAS INVENTER »* si le modèle ne permet pas de conclure, et (§11) que la liste illustrative du mandat *« ne doit pas être considérée automatiquement comme transférable »*.

## 7. Données non transférables

Les 9 catégories du catalogue (§5) — chacune avec sa raison affichée à l'utilisateur (`transferReasonPermanent` pour les 4 déjà permanentes, `transferReasonDecisionRequired` pour les 5 en attente de classification).

## 8. Transfert partiel

**Sans objet.** Le mandat prévoit ce cas (§17) pour un domaine dont une partie de la configuration serait transférable et une autre non — mais chaque catégorie identifiée ici est intégralement `TENANT-SCOPED` (rien à transférer, tout continue) ou intégralement `DECISION_REQUIRED` (rien de tranché), sans mélange constaté. Aucun transfert partiel n'a donc été implémenté ni inventé.

## 9. Audit

**D-FY-06 respecté, aucun système parallèle créé** (mandat §20, §16 du §24-BIS). Détail complet en §17 « Réouverture avec approbation » ci-dessous. Résumé :
- `AuditModule` (`src/mocks/audit/audit-events.ts`) étendu d'une seule valeur, `'settings'` (même pattern que l'extension précédente pour D-FY-06).
- `fiscalYears.create`/`fiscalYears.open`/`fiscalYears.close` : inchangés depuis le mandat IMPLEMENTATION GO précédent.
- `fiscalYears.reopenRequested` : nouveau, poussé par `requestFiscalYearReopen` avec la justification en `context`.
- `fiscalYears.reopened` : nouveau, poussé uniquement par `applyFiscalYearReopenDecision` **après** approbation effective — jamais à la demande.
- L'approbation/le rejet eux-mêmes sont déjà tracés **génériquement** par le mécanisme existant (`workflowService.listHistory`, dérivé de `WorkflowRequest.steps`) — non dupliqués dans `auditEvents`.

## 10. Tests

**+21 tests** (comparé à l'état après le mandat IMPLEMENTATION GO précédent) :
- `settings.service.test.ts` : les 5 tests `reopenFiscalYear` (méthode directe, désormais retirée) remplacés par 8 tests `requestFiscalYearReopen`/`applyFiscalYearReopenDecision` (création de demande, justification obligatoire, statut invalide refusé, tenant croisé refusé, doublon de demande refusé, audit `reopenRequested`, approbation via le moteur générique ouvre l'exercice sans toucher `isCurrent`, rejet laisse l'exercice clôturé, no-op garanti pour tout autre domaine).
- `workflow.service.test.ts` : non modifié — les 12 tests existants continuent de passer sans changement, preuve que `createRequest` (nouveau) n'a rien cassé du moteur existant.
- Aucun test de composant dédié n'a été ajouté pour le sélecteur global ni l'assistant de création — décision délibérée, cohérente avec la convention déjà établie dans ce projet (aucun autre écran de domaine, Tontine/Finance/Governance, ne possède de test de composant dédié ; le RBAC est testé une fois, génériquement, par `permission-gate.test.tsx`). La couverture de ces écrans repose sur la vérification navigateur (§12) plutôt que sur un nouveau pattern de test non demandé explicitement.

**Bug réel trouvé et corrigé pendant l'écriture des tests** : `workflowService.createRequest` générait un id via `WR-${Date.now()}` seul — deux créations survenant dans la même milliseconde (cas réel rencontré en exécutant la suite de tests, qui s'exécute en quelques millisecondes) produisaient un id identique, faisant échouer `getTenantScoped` en retournant la première correspondance... d'un **autre tenant**. Corrigé par un suffixe aléatoire (`WR-${Date.now()}-${random}`). Documenté dans le code (`workflow.service.ts`).

## 11. Typecheck / Lint / i18n / Build

```
npm run typecheck   → 0 erreur
npm run lint        → 0 erreur, 15 warnings (14 pré-existants + 1 nouveau : fiscal-year-context.tsx
                       déclenche le même avertissement react-refresh/only-export-components que les
                       4 autres fichiers de contexte déjà existants — même convention, pas une régression)
npm run i18n:check  → 2/2 passants, parité FR/EN confirmée pour toutes les nouvelles clés
npm test            → 285/285 passants (28 fichiers), incluant les tests réécrits/ajoutés
npm run build       → succès (~11s), même avertissement pré-existant sur la taille du plus gros chunk
```

## 12. Playwright

Scénario complet exécuté contre le serveur de développement réel (`npm run dev`), navigateur Chrome piloté par Playwright depuis un projet scratch isolé (aucune dépendance ajoutée à `tanzen-frontend`) : connexion → vérification Tenant+FY visibles → ouverture du sélecteur (liste réelle, 4 exercices, pas de valeurs codées en dur) → changement d'exercice (Tenant inchangé) → création via l'assistant 2 étapes (étape 1 → étape 2 montrant la classification réelle à 9 catégories, toutes verrouillées) → exercice créé → demande de réouverture sur un exercice clôturé (motif vide refusé, motif renseigné accepté) → badge « Réouverture en attente » → navigation vers l'écran Operations générique existant → justification visible → approbation → **exercice effectivement rouvert, exercice courant inchangé** (vérifié après une navigation SPA réelle, pas un rechargement de page, pour ne pas invalider l'état mémoire).

**11/11 vérifications passées, 0 erreur console imputable à ce mandat** (les seules entrées console capturées sont des avertissements `recharts`/`defaultProps` pré-existants du tableau de bord, sans rapport avec ce travail).

**Bug UI réel trouvé et corrigé pendant cette vérification** : l'étape 2 de l'assistant de création (9 catégories + notice) dépassait la hauteur de la fenêtre sans défilement interne, rendant le bouton « Créer l'exercice » inatteignable. Corrigé en ajoutant `max-h-[45vh] overflow-y-auto` au conteneur de la liste (`settings-module.tsx`), sans toucher au composant partagé `ConfirmDialog` lui-même (fix localisé au contenu, pas au composant générique).

## 13. Fichiers créés

```
src/contexts/fiscal-year-context.tsx
src/layouts/fiscal-year-selector.tsx
src/mocks/settings/fiscal-year-transfer-categories.ts
docs/P1_GLOBAL_FISCAL_YEAR_CONTEXT_TRANSFER_IMPLEMENTATION_REPORT.md (ce document)
```

## 14. Fichiers modifiés

```
src/app/providers.tsx                          — + FiscalYearProvider
src/contexts/index.ts                          — + export FiscalYearProvider/useFiscalYear
src/layouts/index.ts                           — + export FiscalYearSelector
src/layouts/shell-sidebar.tsx                  — + <FiscalYearSelector compact />
src/layouts/shell-header.tsx                   — + <FiscalYearSelector />
src/test/render-with-providers.tsx             — + FiscalYearProvider (miroir de providers.tsx)
src/features/settings/settings-module.tsx      — assistant de création 2 étapes ; réouverture =
                                                  demande (plus directe) ; garde fiscalYears.read
src/features/operations/operations-module.tsx  — DOMAIN_KEY/DOMAIN_ICON/ENTITY_KEY += settings/
                                                  fiscalYear ; filtre domaine += option ; affichage
                                                  Justification ; effet de bord post-décision
                                                  (applyFiscalYearReopenDecision)
src/features/audit/audit-module.tsx            — AUDIT_MODULE_KEY += settings
src/services/settings.service.ts               — reopenFiscalYear (direct) retiré, remplacé par
                                                  requestFiscalYearReopen/listReopenRequests/
                                                  applyFiscalYearReopenDecision
src/services/workflow.service.ts               — + createRequest (générique, réutilisable)
src/services/settings.service.test.ts          — tests réopen réécrits pour le nouveau flux
src/services/query-keys.ts                     — + settings.reopenRequests
src/mocks/settings/fiscal-years.ts             — inchangé fonctionnellement (repris du mandat précédent)
src/mocks/operations/workflow-definitions.ts   — WorkflowDomain += 'settings' ; entityType += 'fiscalYear' ;
                                                  + WD-005
src/mocks/operations/workflow-requests.ts      — entityType += 'fiscalYear' ; + justification?
src/mocks/audit/audit-events.ts                — AuditModule += 'settings'
src/locales/fr/index.ts, src/locales/en/index.ts — nouvelles clés (shell, settings, operations)
```

## 15. Points restant à décider

Aucun n'a été inventé. Nouveaux, propres à ce mandat :

- **`DECISION_REQUIRED — REOPEN APPROVAL AUTHORITY`** (§3, §13 du §24-BIS) : `fiscalYears.manage` est la SEULE permission de gestion existante pour ce domaine — aucune permission distincte « approbateur » vs « gestionnaire » n'existe. Le workflow `WD-005` n'a donc qu'une étape, gardée par cette permission unique. Si une autorité d'approbation distincte est requise à l'avenir, une nouvelle permission devra être créée — non fait ici (mandat §3 : « NE PAS créer de permission automatiquement »).
- **`DECISION_REQUIRED — SELF APPROVAL RULE`** (§13 du §24-BIS) : confirmé par lecture directe du code — `WorkflowRequest` ne porte qu'un `requestedBy: string` (nom libre), jamais un `Users.id`, déjà documenté comme limitation connue dans `workflow.service.ts` (`cancelRequest`, commentaire citant `docs/PHASE_09_DECISIONS_A_VALIDER.md`) pour un cas analogue. **Aucune règle d'auto-approbation n'existe donc dans le moteur générique, pour aucun domaine** — pas seulement Fiscal Year. Le PermissionGate qui protège le bouton « Approuver » vérifie uniquement la permission détenue, jamais l'identité du demandeur. Confirmé structurellement impossible à empêcher sans modifier le modèle `WorkflowRequest` lui-même (hors périmètre de ce mandat).
- **Classification FY-scoping par domaine** (D-FY-02, toujours ouverte) : les 5 catégories `DECISION_REQUIRED` du catalogue (§5) restent à trancher — aucune n'a été promue `FY-SCOPED` par ce mandat.
- **Format de durée/expiration d'une réouverture** : non demandé explicitement par cette version du mandat (§24-BIS ne mentionne pas de durée maximale) — non inventé, l'exercice rouvert reste `open` indéfiniment jusqu'à une nouvelle clôture manuelle explicite.

## 16. Domaines non modifiés

```
Tontine
Finance
Governance
Loans
Members
```

Confirmé — aucun de ces domaines n'apparaît dans la liste des fichiers modifiés (§14). Les seuls fichiers touchés hors du strict périmètre Settings/Fiscal Year sont `operations-module.tsx` et `audit-module.tsx`/`audit-events.ts` — tous deux des mécanismes **transverses** déjà partagés par construction (Workflow Core, Audit), pas des domaines métier au sens du mandat, et chaque modification y est strictement additive (extension d'union de type + un point d'appel de dispatch générique), jamais une réécriture.

## 17. Réouverture avec approbation

**Workflow retenu** : réutilisation intégrale du moteur `WorkflowRequest`/`workflowService` déjà existant (Operations > Workflows), pas un second système. Une seule nouvelle `WorkflowDefinition` (`WD-005`, domaine `settings`, entité `fiscalYear`, une étape gardée par `fiscalYears.manage`).

```
CLOSED
  │  requestFiscalYearReopen (justification obligatoire)
  ▼
WorkflowRequest { status: 'pending' }          ← FiscalYear reste CLOSED, isCurrent inchangé
  │  workflowService.submitAction (moteur générique, écran Operations générique)
  ├── 'approve' → status: 'approved' → applyFiscalYearReopenDecision → FiscalYear.status = 'open'
  ├── 'reject'  → status: 'rejected' → FiscalYear reste CLOSED
  └── 'return'  → status: 'returned' → FiscalYear reste CLOSED
```

**Modèle utilisé** : aucun champ ajouté à `FiscalYear` lui-même. Un seul champ générique ajouté à `WorkflowRequest` (`justification?: string`, réutilisable par tout futur domaine, pas nommé `reopenReason`).

**Permissions** : `fiscalYears.manage` (déjà existante, D-FY-04) — aucune permission créée. Consultation via `PermissionGate permission={currentStep.approverPermission}` déjà présent dans l'écran générique, sans modification.

**Demandeur** : `WorkflowRequest.requestedBy` = `currentUser.name` (résolu automatiquement, pas saisi manuellement).

**Approbateur** : tout utilisateur détenant `fiscalYears.manage` — la même permission que celle exigée pour soumettre la demande (voir auto-approbation ci-dessous).

**Auto-approbation** : **`DECISION_REQUIRED — SELF APPROVAL RULE`** (voir §15) — non empêchée, ni par ce mandat ni par le moteur générique préexistant pour aucun autre domaine. Documentée, non inventée.

**Audit** : `fiscalYears.reopenRequested` (à la demande) et `fiscalYears.reopened` (à l'ouverture effective, uniquement après approbation) poussés explicitement dans `auditEvents` ; l'approbation/le rejet eux-mêmes sont déjà tracés génériquement par `workflowService.listHistory`, réutilisé sans duplication.

**Tests** : voir §10 — 8 tests dédiés (demande, approbation, rejet, no-op cross-domaine), plus vérification navigateur bout-en-bout (§12).

**Points restant à décider** : voir §15 (`REOPEN APPROVAL AUTHORITY`, `SELF APPROVAL RULE`).

## 18. Git

```
=== Avant ce mandat (baseline) ===
tanzen-frontend : 8 fichiers modifiés + 6 fichiers docs non suivis (mandats précédents, sans rapport)
tanzen-backend : non un dépôt git (répertoire vide, inchangé)
tanzen-commercial : clean
tanzen-mobile : 1 fichier modifié + 2 docs non suivis (préexistants, sans rapport avec ce mandat)

=== Après ce mandat ===
tanzen-frontend : 20 fichiers modifiés (dont tsconfig.app.tsbuildinfo, artefact de build TypeScript
  généré par `npm run build`, sans rapport avec le code source) + 3 fichiers créés + 4 nouveaux docs
  non suivis (dont ce rapport)
tanzen-backend : NON TOUCHÉ
tanzen-commercial : NON TOUCHÉ
tanzen-mobile : NON TOUCHÉ (état identique à la baseline)
```

Aucun commit, aucun push, aucune branche créée.

FIN DU MANDAT.
