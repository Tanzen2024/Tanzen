# P1 — GLOBAL FISCAL YEAR — REOPEN APPROVAL — IMPLEMENTATION REPORT

**Mandat** : P1 GLOBAL FISCAL YEAR — REOPEN APPROVAL — IMPLEMENTATION GO
**Périmètre** : `tanzen-frontend` uniquement
**Décisions mises en œuvre** : D-FY-07 (Option B) et D-FY-08 (Option B), validées dans
`docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md`
**Statut** : ✅ IMPLÉMENTÉ — régression complète au vert, aucun blocage rencontré

---

## 1. Objectif

Traduire en code les deux décisions PO validées :

- **D-FY-07 (Option B)** : créer une permission `fiscalYears.approve`, **distincte** de
  `fiscalYears.manage`, et l'utiliser comme permission d'étape du workflow de réouverture
  (`WD-005`).
- **D-FY-08 (Option B)** : interdire l'auto-approbation — un utilisateur ne peut pas
  approuver/rejeter sa propre demande de réouverture (`requestedByUserId !== actedByUserId`),
  contrôle appliqué **au niveau service/workflow**, pas seulement dans l'interface.

Avec un cas particulier explicitement anticipé par le mandat : **role-admin** détient à la
fois `fiscalYears.manage` et `fiscalYears.approve` (catalogue complet), donc le RBAC seul ne
peut **jamais** séparer demandeur et approbateur pour ce rôle — la séparation doit être
garantie par la logique métier elle-même.

## 2. Ce qui a été inspecté avant modification (§5, §33 du mandat)

- **RBAC** : `src/mocks/rbac.mocks.ts` — catalogue de permissions (`permissionCatalog`),
  3 templates de rôle (`role-admin` = catalogue complet, `role-manager` = catalogue filtré
  `!endsWith('.delete') && !endsWith('.approve')`, `role-viewer` = catalogue filtré
  `endsWith('.read')`), `systemRoles` généré par tenant, `currentUser` mocké (id `U-001`,
  rattaché à `role-admin`).
- **Workflow générique** : `src/services/workflow.service.ts` (`createRequest`,
  `submitAction`, `cancelRequest`, `getRequest`), `src/mocks/operations/workflow-requests.ts`
  (types `WorkflowRequest`/`WorkflowStep`), `src/mocks/operations/workflow-definitions.ts`
  (`WD-001` à `WD-005`, un par domaine).
- **Usages existants de `WorkflowRequest`/`WorkflowStep`/`submitAction`/`createRequest`** en
  dehors de Fiscal Year : recherche exhaustive (`grep`) confirmant que
  **Credit (WD-001), Tontines (WD-002), Governance (WD-003), Finance (WD-004)** consomment
  tous le même moteur générique via le même point d'appel unique dans
  `operations-module.tsx` (`WorkflowDetail`) — aucun de ces domaines n'a de logique propre
  dupliquée à modifier séparément.
- **Écran d'approbation** : `WorkflowDetail` (`src/features/operations/operations-module.tsx`)
  — seul point d'appel UI de `workflowService.submitAction`/`cancelRequest`, déjà générique
  (boutons gardés par `PermissionGate permission={currentStep.approverPermission}`).

Conclusion de cette inspection : **aucune nouvelle architecture n'était nécessaire**. Le
moteur Workflow, RBAC et Audit existants suffisent — confirmé avant d'écrire la moindre ligne
de code, conformément à la contrainte absolue du mandat.

## 3. D-FY-07 — `fiscalYears.approve` (implémenté)

### 3.1 Catalogue RBAC

`src/mocks/rbac.mocks.ts` — une seule ligne ajoutée au catalogue :

```ts
'settings.read', 'localization.manage', 'fiscalYears.read', 'fiscalYears.manage', 'fiscalYears.approve',
```

Aucune autre ligne du fichier n'a été touchée. Les filtres génériques de `role-manager`
(`!endsWith('.approve')`) et `role-viewer` (`endsWith('.read')`) s'appliquent
**automatiquement** à la nouvelle permission — vérifié par test (§7), aucune modification de
ces filtres n'était nécessaire.

Effet sur les 3 rôles système :

| Rôle | `fiscalYears.manage` | `fiscalYears.approve` |
|---|---|---|
| role-admin | ✅ (catalogue complet) | ✅ (catalogue complet) |
| role-manager | ✅ (pas `.approve`) | ❌ (exclu par le filtre `.approve`) |
| role-viewer | ❌ (pas `.read`) | ❌ (pas `.read`) |

### 3.2 `WD-005` (workflow de réouverture)

`src/mocks/operations/workflow-definitions.ts` — la permission d'étape passe de
`fiscalYears.manage` à `fiscalYears.approve` :

```ts
steps: [{ order: 1, name: 'Autorisation de réouverture', approverPermission: 'fiscalYears.approve' }]
```

`requestFiscalYearReopen` (soumission de la demande) continue de son côté à exiger
`fiscalYears.manage` côté UI (bouton « Demander la réouverture » gardé par
`PermissionGate permission="fiscalYears.manage"`, inchangé) — les deux permissions
restent bien séparées fonctionnellement : **manage** pour soumettre, **approve** pour
statuer.

Aucun autre `WorkflowDefinition` (`WD-001` à `WD-004`) n'a été modifié.

## 4. D-FY-08 — Blocage de l'auto-approbation (implémenté)

### 4.1 Extension de type — `requestedByUserId`

`src/mocks/operations/workflow-requests.ts` — champ ajouté à `WorkflowRequest`,
**optionnel**, `requestedBy` (nom libre) conservé tel quel :

```ts
requestedBy: string;          // conservé, inchangé — nom libre, jamais un identifiant fiable
requestedByUserId?: string;   // nouveau, optionnel — compatibilité avec les WorkflowRequest
                               // déjà en seed (Credit/Tontines/Governance/Finance), qui n'en
                               // portent pas et n'ont aucun contrôle d'auto-approbation
```

Aucune donnée de seed existante n'a été modifiée — le champ reste `undefined` pour toutes
les `WorkflowRequest` préexistantes (`WR-001` à `WR-008`), sans effet de bord (voir §6, test
« LEGACY DATA »).

### 4.2 Correction de `submitAction` — identité réelle de l'acteur

`src/services/workflow.service.ts` — `WorkflowStep.actedBy` existait déjà dans le type mais
n'était **jamais renseigné** (seul `actedByName` l'était — confirmé par grep exhaustif avant
modification). Signature étendue avec un paramètre optionnel en **dernière position**, donc
strictement rétrocompatible :

```ts
submitAction: (tenantId, requestId, action, actorName, comment?, actorId?) => ...
  step.actedBy = actorId;       // nouveau — enfin renseigné
  step.actedByName = actorName; // inchangé
```

Tout appelant existant qui ne fournit pas `actorId` conserve exactement le même
comportement qu'avant (`actedBy` reste `undefined`) — c'est le cas de tous les tests déjà
écrits contre `submitAction`, tous encore verts sans modification.

`WorkflowDetail` (`operations-module.tsx`), point d'appel générique unique pour
approve/reject/return sur **tous les domaines**, a été mis à jour pour toujours transmettre
`user.id` — une correction générique qui bénéficie à Credit/Tontines/Governance/Finance
autant qu'à Fiscal Year (`actedBy` était un champ mort partout, il est désormais renseigné
partout), sans changer le comportement observable de ces domaines.

### 4.3 Le vrai contrôle — `settingsService.decideFiscalYearReopen`

Nouvelle fonction dans `src/services/settings.service.ts`, **spécifique à Fiscal Year**
(scope volontairement restreint à `domain === 'settings' && entityType === 'fiscalYear'`) :

```ts
decideFiscalYearReopen(tenantId, requestId, action, actorId, actorName, comment?)
```

Logique :

1. Récupère la `WorkflowRequest` (tenant-scopée via `workflowService.getRequest`).
2. Si le domaine n'est pas `settings`/`fiscalYear` → `null` (n'impose **jamais** cette règle
   aux autres domaines, qui n'ont fait l'objet d'aucune décision PO en ce sens).
3. **Le blocage** : `if (request.requestedByUserId && request.requestedByUserId === actorId) return null;`
   — appliqué **avant** tout appel à `submitAction`, donc avant toute mutation. Rien n'est
   modifié (ni la `WorkflowRequest`, ni le `FiscalYear`, ni l'audit) lors d'un blocage.
4. Si non bloqué, délègue à `workflowService.submitAction(..., actorId)` (moteur générique,
   inchangé), puis enregistre les événements d'audit `fiscalYears.reopenApproved` /
   `fiscalYears.reopenRejected` (§5), puis appelle `applyFiscalYearReopenDecision` (logique
   déjà existante et inchangée depuis §24-BIS, qui bascule `FiscalYear.status` à `open`
   uniquement si `status === 'approved' && year.status === 'closed'`).

**Pourquoi ce n'est pas dans `submitAction` lui-même** : `submitAction` est le moteur
générique partagé par Credit/Tontines/Governance/Finance. Y coder une règle
« requester ≠ actor » aurait imposé cette contrainte à des domaines dont le PO n'a jamais
statué sur le sujet — hors périmètre du mandat, risque de régression sur 4 workflows non
concernés. La règle vit donc exclusivement dans la fonction Fiscal-Year-spécifique, qui est
le seul point d'entrée utilisé par l'écran d'approbation pour ce domaine (§4.4).

### 4.4 Cas role-admin (§7 du mandat)

`currentUser` (mock, `U-001`) est rattaché à `role-admin`, donc détient
**simultanément** `fiscalYears.manage` (peut soumettre) et `fiscalYears.approve` (peut
statuer). Le RBAC ne peut structurellement pas empêcher ce même utilisateur d'agir aux deux
étapes. C'est précisément pour cela que §4.3 n'est **pas** une vérification de permission
supplémentaire mais une comparaison d'identité (`requestedByUserId === actorId`),
indépendante du rôle ou des permissions détenues. Vérifié par test dédié (§6) et par
vérification navigateur (§8) : un role-admin qui a soumis sa propre demande de réouverture
ne peut ni voir ni déclencher Approuver/Rejeter sur cette demande, alors que le même
role-admin conserve ces boutons sur une demande soumise par quelqu'un d'autre (pattern déjà
couvert au niveau service — non re-testable en navigateur faute d'un second utilisateur
mocké, cf. §8).

### 4.5 Idempotence

`submitAction` était déjà idempotent (`if (!step || step.status !== 'pending') return request;`
— un second appel sur une étape déjà tranchée ne mute rien). `decideFiscalYearReopen`
reproduit la même garantie côté audit : un drapeau `wasActionable` capture
`request.status === 'pending' || 'inProgress'` **avant** l'appel à `submitAction` ; les
événements `fiscalYears.reopenApproved`/`fiscalYears.reopenRejected` ne sont enregistrés que
si `wasActionable` était vrai — un second appel sur une demande déjà résolue ne duplique
donc ni la mutation, ni l'audit (vérifié par test « IDEMPOTENCE », §6).

### 4.6 UI (§19-21 du mandat — indication seulement, jamais le seul contrôle)

`WorkflowDetail` (`operations-module.tsx`) :

- Pour une demande de réouverture de Fiscal Year, approve/reject passent désormais par
  `settingsService.decideFiscalYearReopen` (au lieu de `workflowService.submitAction`
  directement) ; un retour `null` déclenche un toast d'erreur (`cannotActOwnRequest`).
- Quand `request.requestedByUserId === user.id` (même utilisateur), les boutons
  **Approuver** et **Rejeter** sont masqués et remplacés par un message explicatif
  (`data-testid="self-approval-notice"`), même si `PermissionGate` aurait laissé passer
  (l'utilisateur détient bien `fiscalYears.approve`). **Renvoyer** et **Annuler la demande**
  restent disponibles — le mandat ne demande de bloquer que approve/reject.
- Ce traitement est explicitement documenté dans le code comme un **confort UI**, la vraie
  protection étant §4.3.

## 5. Audit (§15 du mandat)

`recordFiscalYearAudit` (inchangé) est désormais appelé pour 4 actions distinctes et
traçables séparément :

| Action | Déclencheur | Neuf/existant |
|---|---|---|
| `fiscalYears.reopenRequested` | `requestFiscalYearReopen` | déjà existant |
| `fiscalYears.reopenApproved` | `decideFiscalYearReopen`, action approve réussie | **nouveau** |
| `fiscalYears.reopenRejected` | `decideFiscalYearReopen`, action reject réussie | **nouveau** |
| `fiscalYears.reopened` | `applyFiscalYearReopenDecision`, transition réelle closed→open | déjà existant |

Chaque événement porte `actorId`/`actorName` de l'acteur réel (via `currentUser`, cf.
`recordFiscalYearAudit`), garantissant que l'audit distingue bien demandeur et approbateur
même si les deux appellent la même fonction technique.

## 6. Tests ajoutés

**`src/services/role.service.test.ts`** — nouveau describe « RBAC catalog: fiscalYears.approve
(D-FY-07) » (5 tests) : existence de la permission, exclusion de `role-manager`/`role-viewer`,
double détention par `role-admin`, non-régression des autres permissions `.approve`
(governance/loans/applications/distributions) sur `role-manager`.

**`src/services/workflow.service.test.ts`** — nouveau describe « submitAction actorId »
(2 tests) : `actedBy` renseigné quand `actorId` est fourni ; comportement strictement
inchangé (`actedBy` reste `undefined`) quand l'appelant ne le fournit pas.

**`src/services/settings.service.test.ts`** — nouveau describe « decideFiscalYearReopen »
(7 tests) :

1. **DENY** — le demandeur ne peut pas approuver sa propre demande, même en role-admin
   (année reste fermée, requête reste `pending`, aucune mutation).
2. **ALLOW** — un acteur différent peut approuver la même demande qui vient d'être bloquée
   (année ouverte, `fiscalYears.reopenApproved` + `fiscalYears.reopened` enregistrés).
3. **IDEMPOTENCE** — ré-approuver une demande déjà approuvée ne duplique ni mutation ni audit.
4. **DENY** — rejet par un acteur différent : `fiscalYears.reopenRejected` enregistré,
   année reste fermée, aucun `fiscalYears.reopened`.
5. **TENANT ISOLATION** — impossible d'agir sur une demande d'un autre tenant.
6. **DEFENSIVE** — retourne `null` pour une demande hors domaine `settings`/`fiscalYear`
   (n'impose jamais la règle aux autres domaines).
7. **LEGACY DATA** — une `WorkflowRequest` sans `requestedByUserId` (créée directement via
   `workflowService.createRequest`, simulant une donnée antérieure à D-FY-08) n'est jamais
   bloquée à tort par le contrôle d'auto-approbation.

**Non-régression** : les tests déjà existants sur `requestFiscalYearReopen` et
`applyFiscalYearReopenDecision` (D-FY-01 à D-FY-06, §24-BIS) n'ont **pas été modifiés** et
restent tous verts — ils utilisent directement `workflowService.submitAction`/
`applyFiscalYearReopenDecision`, tous deux restés rétrocompatibles.

## 7. Vérification navigateur (Playwright)

Serveur de dev lancé (`npm run dev`, port 5173), Chrome headless piloté via Playwright
(installation isolée du scratchpad, jamais ajoutée à `package.json` de `tanzen-frontend`).
Scénario exécuté en tant qu'`U-001` (Amadou Mbaye, role-admin — seul utilisateur mocké
disponible, aucune authentification réelle dans ce projet) :

| # | Vérification | Résultat |
|---|---|---|
| C | Soumission de la demande sans justification → erreur inline, rien créé | ✅ PASS |
| D | Soumission valide → demande créée, ligne affiche « Voir la demande » | ✅ PASS |
| F | Détail du workflow : permission requise affichée = `fiscalYears.approve` | ✅ PASS |
| G1 | Bouton **Approuver** absent (le demandeur est aussi l'acteur courant) | ✅ PASS |
| G2 | Bouton **Rejeter** absent | ✅ PASS |
| G3 | Message explicatif d'auto-approbation affiché | ✅ PASS |
| H | **Renvoyer**/**Annuler la demande** restent disponibles | ✅ PASS |
| I | Exercice reste `Clôturé` + badge « Réouverture en attente » (rien muté) | ✅ PASS |

**8/8 vérifications réussies, aucune erreur console.**

Limite explicitement assumée : le mock `currentUser` est un singleton unique (`U-001`), sans
flux de connexion réel — il n'existe donc **aucun moyen, dans le navigateur, de se connecter
sous un second utilisateur** pour vérifier visuellement le scénario « approbation par un
tiers ». Ce scénario est en revanche couvert de façon exhaustive au niveau service (§6,
tests 2, 3, 4), qui est le niveau où la garantie réelle est appliquée (§4.3) — la
vérification navigateur couvre ici le comportement UI complémentaire (§4.6), pas le contrôle
lui-même.

## 8. Régression complète

| Commande | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur (15 warnings pré-existants, sans lien avec ce mandat) |
| `npm run i18n:check` | ✅ 2/2 tests passés (parité FR/EN) |
| `npm test` | ✅ **304/304 tests passés**, 28 fichiers |
| `npm run build` | ✅ build production réussi |

## 9. Non-régression D-FY-01 à D-FY-06 et transfer-selection

- `createFiscalYear`, `closeCurrentFiscalYear`, `openFiscalYear` : **aucune ligne modifiée**.
- `fiscalYearTransferCategories`, `transferSelections` : **aucune ligne modifiée**.
- `requestFiscalYearReopen` : une seule ligne changée (ajout de `requestedByUserId:
  currentUser.id` dans l'appel à `createRequest`) — signature et comportement observable
  inchangés pour tout le reste (validations, garde anti-doublon, audit
  `fiscalYears.reopenRequested`).
- `applyFiscalYearReopenDecision` : **aucune ligne modifiée**, toujours appelée avec la même
  sémantique (idempotente sur `year.status === 'closed'`).
- Les 3 describe blocks de tests dédiés à D-FY-01 à D-FY-06 (`createFiscalYear`,
  `requestFiscalYearReopen`, `applyFiscalYearReopenDecision`) sont **inchangés** et passent
  toujours (inclus dans les 304/304).

## 10. Fichiers modifiés (périmètre `tanzen-frontend` uniquement)

```
src/mocks/rbac.mocks.ts                          (+1 permission au catalogue)
src/mocks/operations/workflow-definitions.ts     (WD-005 : approverPermission)
src/mocks/operations/workflow-requests.ts        (type : + requestedByUserId?)
src/services/workflow.service.ts                 (createRequest, submitAction : + actorId)
src/services/settings.service.ts                 (+ decideFiscalYearReopen, requestFiscalYearReopen : + requestedByUserId)
src/features/operations/operations-module.tsx    (WorkflowDetail : routage FY + UI auto-approbation)
src/locales/fr/index.ts, src/locales/en/index.ts (+ cannotActOwnRequest)
src/services/role.service.test.ts                (+ 5 tests RBAC)
src/services/workflow.service.test.ts            (+ 2 tests actorId)
src/services/settings.service.test.ts            (+ 7 tests decideFiscalYearReopen)
```

Confirmé par `git status --short` (`tanzen-frontend`) : aucun autre fichier touché par ce
mandat. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` : **non modifiés**
(`git status --short` vérifié dans chaque dépôt — `tanzen-commercial` sans changement,
`tanzen-mobile` porte uniquement des changements pré-existants d'un mandat antérieur, non
liés à celui-ci).

## 11. Points signalés, non des blocages

- **`cancelRequest`** n'a pas reçu de paramètre `actorId` (seul `submitAction` en avait
  besoin pour D-FY-08, qui ne porte que sur approve/reject) — laissé inchangé pour ne pas
  élargir le périmètre au-delà de la décision validée.
- **`return`** (renvoyer une étape) n'est pas soumis au contrôle d'auto-approbation — le
  mandat ne le demandait que pour approve/reject ; étendre la règle à `return` aurait été
  une invention non demandée.
- Les données de seed pré-existantes (`WR-001` à `WR-008`, tous domaines hors Fiscal Year)
  n'ont **pas** été rétro-équipées avec `requestedByUserId` — sans objet, puisque le contrôle
  D-FY-08 ne s'applique qu'au domaine `settings`/`fiscalYear`, qui ne compte aucune requête
  de seed (uniquement créées à l'exécution via `requestFiscalYearReopen`).

Aucune condition de `IMPLEMENTATION BLOCKED` n'a été rencontrée : le RBAC, le moteur
Workflow et le mécanisme d'audit existants ont suffi à porter entièrement D-FY-07 et D-FY-08
sans nouvelle architecture, sans rupture de compatibilité, et sans régression détectée.

---

## Statut final

```
STATUT: IMPLÉMENTÉ
D-FY-07: ✅ fiscalYears.approve créé et câblé (WD-005), distinct de fiscalYears.manage
D-FY-08: ✅ auto-approbation bloquée au niveau service (decideFiscalYearReopen), UI alignée
CAS ROLE-ADMIN: ✅ traité explicitement — séparation garantie par l'identité, pas par le RBAC
RÉGRESSION: ✅ typecheck / lint / i18n:check / test (304/304) / build — tous au vert
NAVIGATEUR: ✅ 8/8 vérifications Playwright, 0 erreur console
NON-RÉGRESSION D-FY-01→06: ✅ confirmée (fichiers/tests inchangés, tous verts)
PÉRIMÈTRE: ✅ tanzen-frontend uniquement — tanzen-backend/tanzen-commercial/tanzen-mobile non touchés
BLOCAGE: aucun
```
