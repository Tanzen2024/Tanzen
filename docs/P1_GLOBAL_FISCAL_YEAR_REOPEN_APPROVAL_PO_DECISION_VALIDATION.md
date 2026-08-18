# P1 GLOBAL FISCAL YEAR
# REOPEN APPROVAL — PO DECISION VALIDATION

**Statut : DOSSIER DE DÉCISION — 🟢 2/2 DÉCISIONS VALIDÉES PAR LE PO.** Ce document ne modifie aucun code, service, workflow, RBAC, permission, mock, UI ou test — les deux validations formalisées ci-dessous (§9) sont documentaires uniquement. La clôture formelle du Decision Gate fait l'objet d'un document séparé, `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md`. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés. Aucun commit, aucun push.

---

## 1. Executive Summary

Ce pack formalisait initialement, pour validation PO, les deux décisions de gouvernance laissées ouvertes par `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE.md` : **D-FY-07** (autorité d'approbation d'une réouverture d'exercice) et **D-FY-08** (auto-approbation). **Le PO a désormais explicitement validé les deux** : D-FY-07 → Option B (`fiscalYears.approve`, permission distincte) ; D-FY-08 → Option B (auto-approbation interdite). **Decision Gate = 🟢 CLOSED** (voir §9 pour le détail des validations, et le document de clôture séparé pour la matrice finale et les conditions d'Implementation GO). **Cette clôture n'implémente rien** — `fiscalYears.approve` n'existe toujours pas dans le catalogue RBAC, et `requestedByUserId`/le câblage réel de `actedBy` restent des chantiers à part entière, non réalisés ici.

## 2. État actuel vérifié

Relu directement dans le code pour ce document (pas seulement recopié des rapports précédents) :

- **Workflow de réouverture** (`settings.service.ts`, `workflow-definitions.ts` `WD-005`) : `CLOSED → [demande + justification obligatoire] → WorkflowRequest.status='pending' → APPROVED → FiscalYear.status='open'` ou `REJECTED → FiscalYear reste 'closed'`. `isCurrent` jamais modifié par cette chaîne (`applyFiscalYearReopenDecision`, `settings.service.ts`). Inchangé depuis le Decision Gate précédent — confirmé, pas réaffirmé aveuglément.
- **D-FY-07, permission actuelle** : `fiscalYears.manage` protège à la fois la demande (bouton « Demander la réouverture », `settings-module.tsx`, `PermissionGate permission="fiscalYears.manage"`) et l'approbation (`WorkflowDetail`, `operations-module.tsx`, `PermissionGate permission={currentStep.approverPermission}`, où `currentStep.approverPermission = 'fiscalYears.manage'` pour `WD-005`). Aucune permission `fiscalYears.approve` n'existe dans le catalogue (`rbac.mocks.ts:77` : seules `fiscalYears.read`/`fiscalYears.manage`).
- **D-FY-08, gaps modèle confirmés par relecture directe** :
  - `WorkflowRequest.requestedBy: string` (`workflow-requests.ts`) — nom libre, jamais un identifiant.
  - `WorkflowStep.actedBy?: string` — le champ existe dans le **type**, peuplé uniquement dans les données de **seed** historiques (ex. `'U-001'`). `workflowService.submitAction` (`workflow.service.ts`), le seul point d'écriture réel, ne renseigne **que** `step.actedByName` — recherche exhaustive confirmée, `actedBy` n'est jamais écrit par le code d'exécution.
  - Conclusion inchangée : **MODEL GAP** — `requestedByUserId != approvedByUserId` n'est pas implémentable aujourd'hui, sur aucun domaine du projet (pas seulement Fiscal Year).

---

## 3. D-FY-07 — Autorité d'approbation

### Question PO

Qui doit être autorisé à approuver une demande de réouverture d'un Fiscal Year `CLOSED` ?

### Faits établis (code réel)

- **Permission actuelle** : `fiscalYears.manage`, partagée entre demande et approbation (§2).
- **Permissions `.approve` existantes dans d'autres domaines** : `applications.approve`, `loans.approve`, `distributions.approve`, `governance.approve` (`rbac.mocks.ts:55,59-61`) — toutes distinctes de la permission de création du même domaine.
- **Vérification de l'usage réel de `governance.approve`** (mandat §6 : « ne pas conclure uniquement parce qu'une permission contient le mot approve ») — recherche exhaustive dans `organization-module.tsx` : `governance.approve` gate en réalité un ensemble hétérogène d'actions (`completeMeeting`, `cancelMeeting`, `publishMinutes`, calcul de quorum, `decisionSubmit`/`decisionStartVoting`/`decisionDecide`/`decisionCancel`) — **pas seulement une décision finale d'approbation**. Dans l'usage réel, `governance.approve` se comporte comme une permission de gestion générale du domaine Governance, pas comme une autorité d'approbation isolée et distincte d'un rôle de gestion. **Ce précédent est donc plus faible qu'il n'y paraît** — le simple fait qu'une permission s'appelle `.approve` ne garantit pas, dans ce projet, une séparation réelle des responsabilités.
- **Mécanisme RBAC générique déjà existant, pertinent pour l'Option B** : le rôle `role-manager` (`rbac.mocks.ts:86`) est défini par filtre — `permissionCatalog.filter(p => !p.endsWith('.delete') && !p.endsWith('.approve'))` — c'est-à-dire qu'**il exclut déjà automatiquement toute permission future se terminant par `.approve`**, sans configuration additionnelle. `role-admin`, lui, reçoit le catalogue complet (`.approve` inclus) — donc resterait en mesure de demander et d'approuver avec n'importe quelle option.
- **Rôles existants** : `role-admin` (accès complet), `role-manager` (opérationnel, exclut `.delete`/`.approve`), `role-viewer` (lecture seule). Aucun rôle fonctionnel d'« approbateur » dédié.
- **Mécanismes Governance** (`Positions`/`BoardMandate`) : confirmés strictement séparés du RBAC par une décision antérieure déjà actée (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §5 : « RBAC Role ≠ Governance Position... aucune FK entre les deux catalogues ») — non réaffirmé ici comme nouvelle conclusion, seulement rappelé.
- **Workflow** : `WD-005` (`workflow-definitions.ts`) porte une seule étape.
- **Isolation Tenant** : chaque `WorkflowRequest` reste strictement `tenantId`-scopée (`getTenantScoped`, `workflow.service.ts`), quelle que soit l'option retenue ci-dessous — non affectée par ce choix.
- **Traçabilité actuelle** : `fiscalYears.reopenRequested`/`fiscalYears.reopened` explicitement audités (`settings.service.ts`) ; l'approbation/le rejet eux-mêmes sont dérivés génériquement par `workflowService.listHistory`, indépendamment de la permission utilisée.

### Options

#### Option A — Conserver `fiscalYears.manage`

Tout utilisateur détenant `fiscalYears.manage` peut demander, approuver et rejeter.

- **Avantages** : aucun changement RBAC ; déjà l'implémentation actuelle et testée ; complexité nulle ; cohérent avec `WD-002` (Tontines), qui suit déjà ce même schéma à permission unique.
- **Inconvénients/risques** : aucune séparation demandeur/approbateur ; `role-admin` peut structurellement s'auto-approuver (voir D-FY-08) ; gouvernance plus faible pour une action qualifiée d'« exceptionnelle » par D-FY-05. Risque à ne pas exagérer : c'est le même niveau de gouvernance que celui déjà accepté pour `WD-002` (Tontines) en production.

#### Option B — Permission distincte `fiscalYears.approve`

`fiscalYears.manage` couvrirait la demande/gestion ; `fiscalYears.approve` (nouvelle, **non créée par ce document**) couvrirait la validation.

- **RBAC** : cohérente avec le précédent `applications.approve`/`loans.approve`/`distributions.approve` (mais voir la réserve sur `governance.approve`, ci-dessus) ; **bénéficie automatiquement** du filtre déjà existant qui exclut `role-manager` de toute permission `.approve` — séparation immédiate pour ce palier, sans configuration supplémentaire.
- **Workflow** : `WD-005` passerait à un `approverPermission` distinct pour son étape unique (ou une étape supplémentaire) — changement mineur de définition, non fait ici.
- **UI** : aucun changement d'écran nécessaire — `PermissionGate permission={currentStep.approverPermission}` (déjà générique) fonctionnerait sans modification.
- **Audit** : inchangé.
- **Sécurité** : sépare réellement demandeur/approbateur **pour `role-manager`** (exclusion automatique) ; **ne sépare rien pour `role-admin`**, qui recevrait toujours les deux permissions via le catalogue complet — la séparation resterait donc partielle, pas totale, sauf si un rôle intermédiaire dédié était également créé (non demandé ici).
- **Tenant** : non affecté.
- **Compatibilité Backend future** : neutre — un futur backend devrait de toute façon définir ses propres permissions ; cette option ne préjuge de rien.
- **Complexité** : modérée — une permission à créer (hors périmètre de ce mandat) et une définition de workflow à ajuster.

#### Option C — Autorité Governance existante

- **Constat, après vérification de l'usage réel (pas seulement du nom)** : `governance.approve` n'est pas une autorité d'approbation isolée dans ce projet — c'est une permission de gestion générale du domaine Governance, couvrant des actions très diverses (§ci-dessus). L'utiliser pour Fiscal Year reviendrait à emprunter une permission d'un autre domaine métier pour un usage sans rapport avec son périmètre réel, sans bénéfice de séparation démontrable au-delà de ce qu'apporterait déjà l'Option B.
- **Intégration technique** : le moteur `workflowService` ne connaît que des `Permission` RBAC en `approverPermission` — utiliser `governance.approve` est techniquement possible (c'est une permission comme une autre) mais sémantiquement incohérente (une réouverture de Fiscal Year n'est pas une action de Gouvernance).
- **Positions/BoardMandate (Bureau exécutif)** : aucune intégration RBAC↔Governance n'existe ; les utiliser nécessiterait de revenir sur une séparation déjà actée par une décision antérieure — non recommandé, non implémenté.

#### Option D — Approbation hiérarchique / multi-niveaux

**`MODEL / ARCHITECTURE GAP`** — recherche exhaustive dans `rbac.mocks.ts` (`CurrentUser`, `SystemRole`) : aucun concept de supérieur hiérarchique, de niveau, de seuil ou de nombre d'approbateurs requis n'existe dans le modèle actuel. `WD-001`/`WD-003`/`WD-004` ont bien 2 étapes séquentielles, mais aucune n'est un mécanisme « hiérarchique » au sens propre (pas de notion de rang, seulement une séquence de permissions différentes). Aucun mécanisme existant ne supporte cette option — rien à analyser plus avant sans inventer.

### Matrice comparative

| Critère | Option A | Option B | Option C | Option D |
|---|---|---|---|---|
| Séparation demandeur/approbateur | Aucune | Partielle (role-manager oui, role-admin non) | Aucune démontrée (même limite que A, permission empruntée) | N/A |
| RBAC | Inchangé | Nouvelle permission (non créée ici) | Réutilise `governance.approve` (usage réel incohérent) | N/A |
| Workflow | `WD-005` inchangé | `WD-005` à ajuster | `WD-005` techniquement modifiable, sémantiquement incohérent | N/A |
| Audit | Inchangé | Inchangé | Inchangé | N/A |
| Tenant isolation | Non affectée | Non affectée | Non affectée | N/A |
| UX | Inchangée | Inchangée (PermissionGate déjà générique) | Inchangée | N/A |
| Complexité | Nulle | Modérée | Faible techniquement, mal fondée sémantiquement | N/A |
| Sécurité | Faible séparation | Modérée (partielle) | Faible, trompeuse (nom vs usage réel) | N/A |
| Compatibilité actuelle | Totale (déjà en prod) | Totale (additive) | Totale (additive) | N/A |
| Évolution Backend | Neutre | Neutre | Neutre | N/A |

### Recommandation technique

> 🟡 RECOMMANDATION — historique (non contraignante au moment où elle a été formulée)

Élément factuel, pas une préférence imposée : l'Option B est la seule qui apporte un bénéfice de séparation mesurable (via le filtre `role-manager` déjà existant), mais ce bénéfice reste partiel (`role-admin` non concerné) sauf décision complémentaire non demandée ici. L'Option C s'appuie sur un précédent dont l'usage réel, vérifié, ne soutient pas la conclusion qu'un nom `.approve` garantit une séparation de responsabilités dans ce projet.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option B — Permission distincte `fiscalYears.approve`**. `fiscalYears.manage` reste dédiée à la demande/gestion du workflow de réouverture ; `fiscalYears.approve` (à créer) devient l'autorité d'approbation/rejet. **Le cas `role-admin`** (qui recevrait les deux permissions via le catalogue complet, donc sans séparation garantie pour ce palier) est explicitement reconnu comme non résolu par cette seule création de permission — classé `TECHNICAL DETAIL REQUIRED — IMPLEMENTATION GO`, à traiter lors du mandat d'implémentation, pas inventé ici. **Non implémentée par cette validation** — `fiscalYears.approve` n'existe toujours pas dans le catalogue RBAC à l'issue de ce document.

---

## 4. D-FY-08 — Auto-approbation

### Question PO

Le demandeur d'une réouverture peut-il approuver sa propre demande ?

### Faits établis (code réel)

- `WorkflowRequest.requestedBy: string` — nom libre, jamais un identifiant (`workflow-requests.ts`).
- `WorkflowStep.actedBy?: string` — présent dans le type, **jamais renseigné par `submitAction`** (le seul point d'écriture réel) ; seul `actedByName` l'est.
- Aucun `requestedByUserId` n'existe, ni dans le type, ni dans aucune donnée de seed.
- **Conclusion, confirmée par relecture directe** : `MODEL GAP`. La comparaison `requestedByUserId != approvedByUserId` est structurellement impossible à implémenter aujourd'hui, pour Fiscal Year comme pour tout autre domaine du projet (Credit, Tontines, Governance, Finance inclus) — ce n'est pas une lacune propre à Fiscal Year.
- Aucune comparaison d'identité demandeur/approbateur n'existe nulle part dans le code pour aucun domaine (`submitAction`/`cancelRequest`, `workflow.service.ts`, relus intégralement) — confirmé, pas supposé.

### Options

#### Option A — Auto-approbation autorisée

Le demandeur peut approuver sa propre demande s'il détient l'autorité nécessaire (quelle que soit l'option retenue en D-FY-07).

- **Simplicité** : maximale — aucun changement.
- **Gouvernance** : la plus faible des trois options — un contrôle « exceptionnel » (D-FY-05) sans second regard indépendant garanti.
- **Sécurité** : dépend entièrement du choix D-FY-07 — si Option A y est retenue (`fiscalYears.manage` partagée), l'auto-approbation devient possible pour quiconque détient cette seule permission.
- **Audit** : la demande et l'approbation restent tracées séparément (§2), mais rien n'empêche qu'elles portent le même nom d'acteur.
- **Risque** : le plus élevé des trois pour une action déjà qualifiée d'exceptionnelle par le workflow lui-même.

#### Option B — Auto-approbation interdite (`requestedByUserId != approvedByUserId`)

- **Modèle utilisateur** : nécessiterait d'ajouter `requestedByUserId` à `WorkflowRequest` (absent aujourd'hui) et de câbler réellement `WorkflowStep.actedBy` dans `submitAction` (actuellement mort).
- **`WorkflowRequest`/`WorkflowStep`** : modification de type nécessaire sur les deux structures, utilisées par **tous** les domaines existants (Credit, Tontines, Governance, Finance) — pas seulement Fiscal Year. Un changement ici a une portée transverse.
- **Identité utilisateur** : `currentUser.id` (`rbac.mocks.ts`) existe déjà et est déjà utilisé par `settingsService` pour peupler `actorId` des événements d'audit Fiscal Year (`recordFiscalYearAudit`) — la donnée source existe, elle n'est simplement pas encore propagée jusqu'à `WorkflowRequest`/`WorkflowStep`.
- **Audit** : inchangé dans son principe, gagnerait en précision (identifiants au lieu de noms) si l'Option B était un jour implémentée.
- **RBAC** : sans lien direct — cette option porte sur l'identité de l'acteur, pas sur la permission détenue.
- **UX** : nécessiterait un message explicite si un utilisateur tente d'approuver sa propre demande (« Vous ne pouvez pas approuver votre propre demande ») — écran non conçu ici.
- **Non implémentée dans ce mandat** — modification technique identifiée, pas réalisée (§21 READ-ONLY STRICT).

#### Option C — Auto-approbation conditionnelle

Recherche exhaustive dans le code et les documents déjà produits pour ce projet : **aucune condition existante** ne permettrait de justifier une règle conditionnelle (ex. « autorisée si aucun autre utilisateur ne détient la permission », « autorisée uniquement pour `role-admin` »). Aucune source ne définit un tel mécanisme aujourd'hui — **rien à analyser plus avant sans inventer**.

### Matrice comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Sécurité | Faible | Élevée (une fois implémentée) | N/A — non fondée |
| Gouvernance | Faible | Forte | N/A |
| Séparation des responsabilités | Aucune | Garantie (si D-FY-07 sépare aussi les permissions) | N/A |
| Workflow | Inchangé | `submitAction`/`createRequest` à modifier | N/A |
| Modèle utilisateur | Inchangé | `WorkflowRequest`/`WorkflowStep` à étendre (portée transverse, tous domaines) | N/A |
| Audit | Inchangé | Plus précis (identifiants réels) | N/A |
| Complexité | Nulle | Modérée à élevée (modèle transverse + UX de refus) | N/A |
| Compatibilité actuelle | Totale | Rupture mineure de type, non destructive (champs additifs) | N/A |

### Recommandation technique

> 🟡 RECOMMANDATION — historique (non contraignante au moment où elle a été formulée)

Élément factuel : l'Option B est la seule qui répond réellement à la question posée, mais elle dépend d'un changement de modèle transverse à tous les domaines du projet, pas seulement Fiscal Year — un mandat d'implémentation distinct serait nécessaire si elle est retenue.

### Statut

> 🟢 VALIDÉE — DÉCISION PO

**Décision effective** : le PO a validé **Option B — Auto-approbation interdite** (`requestedByUserId != approvedByUserId` comme règle métier cible). Le `MODEL GAP` déjà identifié (`WorkflowRequest.requestedBy` en texte libre, `WorkflowStep.actedBy` jamais renseigné par `submitAction`) **n'est pas résolu par cette validation** — la décision porte sur la règle métier à appliquer, pas sur son implémentation technique immédiate. Distinction explicitement maintenue : `DECISION = 🟢 VALIDÉE` / `IMPLEMENTATION = ⏳ à réaliser` / `MODEL GAP = ⏳ à résoudre pendant Implementation GO`. Portée transverse reconnue (tous les domaines à workflow, pas seulement Fiscal Year) — non traitée ici.

---

## 5. Matrice comparative (rappel consolidé)

Voir §3 et §4 ci-dessus, présentées séparément par décision pour éviter toute confusion entre les deux questions (autorité vs auto-approbation), qui restent indépendantes l'une de l'autre : D-FY-07 (Option A/B/C/D) détermine *qui peut approuver* ; D-FY-08 (Option A/B/C) détermine *si le demandeur peut être cette même personne*. Les deux peuvent être validées indépendamment — ex. Option A (D-FY-07) + Option B (D-FY-08) est une combinaison techniquement cohérente (permission partagée, mais interdiction d'auto-approbation appliquée par comparaison d'identité), tout comme n'importe quelle autre combinaison.

## 6. Contradiction Check

Vérifié contre les 6 décisions déjà validées, sans les rouvrir :

- **D-FY-01 (création)** : aucune interaction — la création d'exercice ne touche ni RBAC ni identité d'acteur du workflow.
- **D-FY-02 (scope)** : aucune contradiction — ni D-FY-07 ni D-FY-08 n'ajoutent de `fiscalYearId` à un domaine ; non rouvert, conformément au mandat §18.
- **D-FY-03 (OPEN/CURRENT)** : confirmé non affecté — `applyFiscalYearReopenDecision` ne touche `isCurrent` dans aucune des options envisagées ici.
- **D-FY-04 (RBAC)** : **aucune contradiction, mais dépendance directe** — D-FY-07 Option B créerait une permission au-delà des deux déjà validées (`fiscalYears.read`/`fiscalYears.manage`) ; **non fait ici**, signalé comme conséquence à valider séparément si l'Option B est retenue.
- **D-FY-05 (REOPEN)** : cohérent — le principe « jamais automatique, justification obligatoire » reste intact quelle que soit l'option D-FY-07/D-FY-08 retenue.
- **D-FY-06 (AUDIT)** : cohérent — toutes les options restent compatibles avec le mécanisme d'audit déjà en place ; l'Option B de D-FY-08 l'enrichirait (identifiants au lieu de noms) sans le remplacer.

**Aucune contradiction bloquante identifiée.** Un seul point de vigilance signalé (D-FY-04) : si D-FY-07 Option B est validée, une décision RBAC complémentaire (création effective de `fiscalYears.approve`) devra être formellement actée, hors périmètre de ce document.

## 7. Model Gaps

- **MODEL GAP (D-FY-08)** : `WorkflowRequest.requestedBy` (nom libre) et `WorkflowStep.actedBy` (jamais renseigné par `submitAction`) empêchent toute comparaison d'identité fiable — confirmé par relecture directe, non corrigé.
- **TECHNICAL DETAIL REQUIRED (D-FY-07, si Option B validée)** : nom exact de la permission (`fiscalYears.approve` proposé, non tranché), assignation aux rôles au-delà du comportement automatique déjà garanti pour `role-manager`.
- **TECHNICAL DETAIL REQUIRED (D-FY-08, si Option B validée)** : format du message de refus UX, comportement exact si `requestedByUserId` est absent pour une donnée historique (migration des `WorkflowRequest` déjà en seed, qui n'ont pas cet identifiant).

Aucun de ces points n'a été tranché par ce document.

## 8. Conditions Implementation GO

```
D-FY-07 : ☑ choix PO reçu — Option B (fiscalYears.approve)
D-FY-08 : ☑ choix PO reçu — Option B (auto-approbation interdite)
```

Les deux choix PO sont désormais reçus (§9). **Ceci ne constitue toujours pas une autorisation d'implémenter** — voir `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md` pour la clôture formelle du Gate et la liste des conditions techniques restant à traiter avant qu'un mandat séparé « IMPLEMENTATION GO » ne soit lancé.

---

## 9. Validation PO

### D-FY-07 — Autorité d'approbation

```text
[ ] OPTION A — Conserver fiscalYears.manage (partagée demande/approbation)
[X] OPTION B — Permission distincte fiscalYears.approve (non créée)
[ ] OPTION C — Autorité Governance existante (governance.approve)
[ ] OPTION D — Approbation hiérarchique / multi-niveaux (MODEL/ARCHITECTURE GAP — aucun mécanisme existant)

Décision PO :
Option B — fiscalYears.manage (demande/gestion) et fiscalYears.approve
(approbation/rejet, permission distincte à créer) sont deux permissions
séparées. Le cas role-admin (qui recevrait les deux) reste un point
technique à traiter à l'Implementation GO, pas résolu par ce choix seul.

Date :
Reçue dans le cadre du mandat "REOPEN APPROVAL GOVERNANCE — PO DECISION
VALIDATION PACK".

Commentaires :
Aucune implémentation à ce stade — fiscalYears.approve n'existe pas
encore dans le catalogue RBAC.

Statut :
🟢 VALIDÉE
```

### D-FY-08 — Auto-approbation

```text
[ ] OPTION A — Auto-approbation autorisée
[X] OPTION B — Auto-approbation interdite (requestedByUserId != approvedByUserId — nécessite un mandat de modification de modèle transverse)
[ ] OPTION C — Auto-approbation conditionnelle (aucune condition existante identifiée)

Décision PO :
Option B — le demandeur d'une réouverture ne peut jamais approuver ou
rejeter sa propre demande (requestedByUserId != actedByUserId pour toute
décision). Le MODEL GAP déjà identifié (WorkflowRequest.requestedBy en
texte libre, WorkflowStep.actedBy jamais renseigné par submitAction)
n'est pas résolu par cette validation — reste à traiter à
l'Implementation GO.

Date :
Reçue dans le cadre du mandat "REOPEN APPROVAL GOVERNANCE — PO DECISION
VALIDATION PACK".

Commentaires :
Portée transverse reconnue (WorkflowRequest/WorkflowStep sont utilisés
par tous les domaines à workflow, pas seulement Fiscal Year) — non
traitée par ce document.

Statut :
🟢 VALIDÉE
```

### Matrice globale du Decision Gate

| ID | Sujet | Choix retenu | Statut |
|---|---|---|---|
| D-FY-07 | Autorité d'approbation | Option B — `fiscalYears.approve` | 🟢 VALIDÉE |
| D-FY-08 | Auto-approbation | Option B — auto-approbation interdite | 🟢 VALIDÉE |

**Statut global : 🟢 DECISION GATE = CLOSED.** Voir `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md` pour la clôture formelle, la cohérence inter-décisions et les conditions détaillées d'Implementation GO.

## 10. Conclusion

**2/2 décisions validées par le PO.** D-FY-07 (Option B, `fiscalYears.approve`) et D-FY-08 (Option B, auto-approbation interdite) sont désormais tranchées, sur la base d'options tracées à des faits de code vérifiés directement (pas recopiés des rapports précédents sans contrôle) et d'une vérification de cohérence contre les 6 décisions déjà validées (aucune contradiction bloquante). **Ces validations restent strictement documentaires** — `fiscalYears.approve` n'existe pas dans le catalogue RBAC, et le MODEL GAP `requestedByUserId`/`actedBy` n'est pas résolu. Le Decision Gate est `CLOSED` ; l'Implementation GO reste un mandat distinct, non commencé.

---

## Périmètre et Git

**`tanzen-frontend`** : aucun fichier de `src/` modifié. Ce document a été mis à jour ; le document de clôture (`P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md`) a été créé.
**`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile`** : NON TOUCHÉS.

Aucun commit, aucun push.

FIN DU MANDAT.
