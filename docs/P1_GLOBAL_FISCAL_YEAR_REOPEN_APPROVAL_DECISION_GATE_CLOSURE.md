# P1 GLOBAL FISCAL YEAR
# REOPEN APPROVAL — DECISION GATE CLOSURE
# D-FY-07 / D-FY-08

**Statut : MISSION DOCUMENTATION — AUCUNE IMPLÉMENTATION.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. Aucune permission, table, colonne, relation, service, repository, route, écran n'a été créé. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` n'ont pas été touchés. Aucun commit, aucun push. Cette clôture ne donne **aucun** GO d'implémentation — celui-ci ferait l'objet d'un mandat séparé, « IMPLEMENTATION GO — REOPEN APPROVAL », non commencé.

---

## 1. Executive Summary

**2 / 2 décisions PO validées.**

**Decision Gate = 🔒 CLOSED.**

**Implementation GO = NON DÉMARRÉE.**

Les deux décisions formalisées dans `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_PO_DECISION_VALIDATION.md` sont désormais validées par le PO (statuts passés de `⏳ EN ATTENTE DE VALIDATION PO` à `🟢 VALIDÉE`, options cochées, choix explicités). Aucune contradiction bloquante avec les 6 décisions Fiscal Year déjà closes (D-FY-01 à D-FY-06). Deux chantiers techniques distincts, non couplés entre eux, restent à mener lors d'un futur mandat d'implémentation : la création de `fiscalYears.approve` (D-FY-07) et l'extension du modèle `WorkflowRequest`/`WorkflowStep` pour porter des identifiants fiables (D-FY-08).

## 2. Décisions validées

| ID | Sujet | Choix retenu | Règle résultante | Impact architectural |
|---|---|---|---|---|
| D-FY-07 | Autorité d'approbation | Option B | `fiscalYears.manage` (demande/gestion) et `fiscalYears.approve` (approbation/rejet, **à créer**) deviennent deux permissions distinctes | `WD-005` passerait à un `approverPermission` dédié pour son étape de décision ; `role-manager` en serait automatiquement exclu (filtre déjà existant) ; `role-admin` recevrait les deux — séparation partielle, non totale |
| D-FY-08 | Auto-approbation | Option B | Le demandeur d'une réouverture ne peut jamais être aussi l'approbateur/rejeteur de sa propre demande (`requestedByUserId != actedByUserId`) | Nécessite `WorkflowRequest.requestedByUserId` (absent) et le câblage réel de `WorkflowStep.actedBy` dans `submitAction` (aujourd'hui mort) — portée transverse à tous les domaines à workflow, pas seulement Fiscal Year |

## 3. Architecture cible

```
CLOSED
   │
   │ Demande (fiscalYears.manage) + justification obligatoire
   ▼
PENDING_REOPEN_APPROVAL   (WorkflowRequest.status = 'pending')
   │
   ├── Approve (fiscalYears.approve, demandeur ≠ approbateur) ──► OPEN
   │
   └── Reject  (fiscalYears.approve, demandeur ≠ rejeteur)   ──► CLOSED (inchangé)
```

`isCurrent` n'est modifié dans aucun cas (D-FY-03, non rouverte). La demande et sa décision restent strictement `tenantId`-scopées (principe déjà en vigueur pour toute `WorkflowRequest`, `getTenantScoped`) — confirmé comme principe cible, non modifié techniquement par cette clôture.

## 4. Règles structurantes

- `fiscalYears.manage` ne couvre plus, à terme, que la demande et la gestion opérationnelle des exercices (création, ouverture, clôture, **demande** de réouverture) — pas la décision d'approbation/rejet elle-même (D-FY-07).
- `fiscalYears.approve` (à créer) devient la seule permission gouvernant l'approbation et le rejet d'une demande de réouverture.
- Le demandeur d'une réouverture ne peut structurellement pas être également son approbateur/rejeteur, une fois le modèle d'identité étendu (D-FY-08) — règle métier verrouillée, implémentation non réalisée.
- Ces deux règles s'appliquent en complément l'une de l'autre, pas en substitution : détenir `fiscalYears.approve` ne suffit pas si l'utilisateur est aussi le demandeur (D-FY-08 prévaut dans ce cas).
- Aucune des deux règles ne modifie `isCurrent` (D-FY-03) ni l'isolation Tenant déjà en vigueur.

## 5. D-FY-07 — Cas `role-manager` (ARCHITECTURE COMPATIBILITY)

Constat technique conservé, non réimplémenté : le rôle `role-manager` (`src/mocks/rbac.mocks.ts`) est défini par un filtre qui exclut déjà, automatiquement, toute permission se terminant par `.approve` (`permissionCatalog.filter(p => !p.endsWith('.delete') && !p.endsWith('.approve'))`). La création future de `fiscalYears.approve` bénéficierait donc immédiatement de cette exclusion pour `role-manager`, sans configuration additionnelle. Documenté comme **compatibilité d'architecture favorable**, pas comme une implémentation déjà réalisée — `fiscalYears.approve` n'existe toujours pas.

## 6. D-FY-07 — Cas `role-admin` (TECHNICAL DETAIL REQUIRED — IMPLEMENTATION GO)

`role-admin` reçoit aujourd'hui le catalogue de permissions complet (`rbac.mocks.ts`) — la seule création de `fiscalYears.approve` ne l'empêcherait donc pas de détenir simultanément `fiscalYears.manage` et `fiscalYears.approve`. La séparation demandeur/approbateur voulue par D-FY-07 resterait, pour ce rôle, garantie uniquement par D-FY-08 (comparaison d'identité), pas par le RBAC seul. **Non résolu par cette clôture** — classé `TECHNICAL DETAIL REQUIRED — IMPLEMENTATION GO`, à traiter explicitement (ex. retirer `fiscalYears.approve` du catalogue complet de `role-admin`, ou accepter que seule la vérification d'identité D-FY-08 protège ce cas) lors du mandat d'implémentation, pas tranché ici.

## 7. D-FY-08 — MODEL GAP (rappel, non résolu)

```
WorkflowRequest.requestedBy: string        // nom libre, toujours pas un id
WorkflowStep.actedBy?: string              // existe dans le type, jamais écrit par submitAction()
WorkflowStep.actedByName?: string          // seul champ réellement renseigné par submitAction()
```

La décision D-FY-08 (auto-approbation interdite) est **validée au niveau de la règle métier**, mais son application technique (`requestedByUserId != actedByUserId`) reste impossible tant que ce MODEL GAP n'est pas comblé. Distinction maintenue explicitement :

| Axe | Statut |
|---|---|
| Décision (règle métier) | 🟢 VALIDÉE |
| Implémentation | ⏳ à réaliser |
| Model Gap | ⏳ à résoudre pendant Implementation GO |

## 8. Workflow cible détaillé

```
CLOSED
  │
  │ Demande
  │ fiscalYears.manage
  ▼
PENDING_REOPEN_APPROVAL
  │
  ├─────────────────┐
  │                 │
  │ Approve         │ Reject
  │ (fiscalYears    │ (fiscalYears
  │  .approve,      │  .approve,
  │  demandeur ≠    │  demandeur ≠
  │  approbateur)   │  rejeteur)
  │                 │
  ▼                 ▼
 OPEN             CLOSED
```

Non implémenté — `WD-005` (`src/mocks/operations/workflow-definitions.ts`) porte toujours aujourd'hui une seule étape gardée par `fiscalYears.manage`, inchangé par cette clôture.

## 9. Audit cible

Rappel, non modifié : le mécanisme d'audit devra à terme distinguer `FISCAL_YEAR_REOPEN_REQUESTED`, `FISCAL_YEAR_REOPEN_APPROVED`, `FISCAL_YEAR_REOPEN_REJECTED`, `FISCAL_YEAR_REOPENED`, avec demandeur, approbateur/rejeteur, date, justification et décision identifiables. **Aujourd'hui** : `fiscalYears.reopenRequested`/`fiscalYears.reopened` sont déjà explicitement audités (`settings.service.ts`) ; l'approbation/le rejet eux-mêmes restent dérivés génériquement par `workflowService.listHistory`, qui n'porte que des noms (`actedByName`), pas des identifiants — cohérent avec le MODEL GAP §7, pas une régression de cette clôture.

## 10. CURRENT (D-FY-03, non rouverte)

Confirmé : ni D-FY-07 ni D-FY-08 ne modifient D-FY-03. **D-FY-03 reste inchangée.** Une réouverture (`CLOSED → OPEN`) ne rend jamais automatiquement un exercice `CURRENT` — devenir `CURRENT` reste une opération strictement distincte (`openFiscalYear`), non affectée par cette clôture.

## 11. Tenant isolation

Principe cible confirmé, non modifié techniquement : la demande et son approbation/rejet doivent rester strictement dans le Tenant concerné. Un utilisateur d'un autre Tenant ne doit jamais pouvoir approuver une demande. Ce principe est déjà appliqué structurellement pour toute `WorkflowRequest` via `getTenantScoped` (`workflow.service.ts`) — aucune modification requise par D-FY-07/D-FY-08 sur ce point, la séparation demandeur/approbateur qu'elles introduisent s'ajoute à l'isolation Tenant déjà existante, sans la remplacer.

## 12. Contradiction Check

Vérifié contre les 8 décisions Fiscal Year (D-FY-01 à D-FY-08), sans en rouvrir aucune :

- **D-FY-01 (Create)** : aucune interaction — la création d'exercice ne touche ni RBAC ni identité d'acteur de workflow.
- **D-FY-02 (Scope)** : aucune contradiction — ni D-FY-07 ni D-FY-08 n'ajoutent de `fiscalYearId` à un domaine ; non rouverte.
- **D-FY-03 (OPEN/CURRENT)** : confirmée non affectée (§10).
- **D-FY-04 (RBAC)** : dépendance directe, non contradiction — D-FY-07 crée une conséquence RBAC (`fiscalYears.approve`, une permission au-delà des deux déjà validées) qui devra être formellement actée lors de l'Implementation GO, pas ici.
- **D-FY-05 (Reopen)** : cohérente — « jamais automatique, justification obligatoire » reste intact, D-FY-07/D-FY-08 l'enrichissent (qui peut approuver, qui ne peut pas) sans le contredire.
- **D-FY-06 (Audit)** : cohérente — le mécanisme d'audit déjà en place reste compatible ; D-FY-08 l'enrichirait (identifiants au lieu de noms) sans le remplacer, une fois implémentée.
- **D-FY-07 × D-FY-08** : cohérentes entre elles, non couplées — chacune peut techniquement être implémentée indépendamment de l'autre (une permission distincte n'implique pas une vérification d'identité, et réciproquement), mais les deux ensemble sont nécessaires pour une séparation complète demandeur/approbateur qui couvre aussi `role-admin` (§6).

**Aucune contradiction bloquante identifiée.**

## 13. Ce qui n'est PAS autorisé par cette clôture

La fermeture de ce Decision Gate **ne constitue pas** une Implementation GO. Elle ne permet pas encore de :

- créer la permission `fiscalYears.approve` ;
- modifier le catalogue RBAC ou l'assignation aux rôles ;
- modifier `WorkflowRequest`/`WorkflowStep` (ajout de `requestedByUserId`, câblage de `actedBy`) ;
- modifier `submitAction`/`createRequest` ;
- modifier `WD-005` ou tout autre `WorkflowDefinition` ;
- modifier l'écran `WorkflowDetail`/`operations-module.tsx` ;
- modifier l'audit ;
- modifier le Backend ;
- modifier `tanzen-mobile`/`tanzen-commercial`.

La prochaine étape est un mandat séparé, explicitement demandé : **IMPLEMENTATION GO — REOPEN APPROVAL**.

## 14. Conditions pour Implementation GO

### D-FY-07 — à prévoir (non réalisé ici)

- Créer `fiscalYears.approve` dans le catalogue RBAC.
- Intégrer la permission au workflow (`WD-005`, `approverPermission` dédié).
- Vérifier que l'exclusion automatique de `role-manager` (§5) produit le comportement attendu.
- Traiter explicitement le cas `role-admin` (§6) — décision technique complémentaire requise.
- Protéger les actions Approve/Reject avec la nouvelle permission dans `WorkflowDetail`.
- Conserver l'isolation Tenant déjà en place (§11) — non renégociable.

### D-FY-08 — à prévoir (non réalisé ici)

- Identifier le demandeur par un `userId` fiable (extension de `WorkflowRequest`).
- Identifier l'acteur de l'approbation/rejet par un `userId` fiable (câblage réel de `WorkflowStep.actedBy` dans `submitAction`).
- Empêcher techniquement l'auto-approbation.
- Empêcher techniquement l'auto-rejet (même principe, symétrique).
- Auditer correctement les identités une fois disponibles (§9).
- Traiter le cas des `WorkflowRequest` déjà en données de seed, qui n'ont pas de `requestedByUserId` (migration ou tolérance à documenter).

## 15. Impact Backend

`tanzen-backend` = **NON TOUCHÉ**. Le dépôt reste un répertoire vide. Aucune implication de schéma backend n'est engagée par cette clôture.

## 16. Impact Commercial

`tanzen-commercial` = **NON TOUCHÉ**. Aucune dépendance fonctionnelle identifiée sur ce domaine.

## 17. Impact Mobile

`tanzen-mobile` = **NON TOUCHÉ**. Aucune implémentation Mobile n'est engagée par cette clôture.

## 18. Critères de fermeture

    [x] D-FY-07 validée
    [x] D-FY-08 validée

**DECISION GATE = 🔒 CLOSED.**

## 19. Fichiers modifiés

```
docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_PO_DECISION_VALIDATION.md (mise à jour :
  statuts des 2 décisions, cases cochées, synthèse, conditions, statut du gate)
```

Seul fichier créé par cette mission : `docs/P1_GLOBAL_FISCAL_YEAR_REOPEN_APPROVAL_DECISION_GATE_CLOSURE.md` (ce rapport).

Aucun autre fichier modifié. `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` inchangés.

## 20. Git

    Aucun commit
    Aucun push

---

## P1 GLOBAL FISCAL YEAR
## REOPEN APPROVAL — DECISION GATE CLOSURE

D-FY-07 :
🟢 VALIDÉE — Option B — `fiscalYears.approve`

D-FY-08 :
🟢 VALIDÉE — Option B — Auto-approbation interdite

Décisions :
2/2 VALIDÉES

Decision Gate :
🔒 CLOSED

Code modifié :
AUCUN

Documents :
- PO Decision Validation — UPDATED
- Decision Gate Closure — CREATED

Backend :
NON TOUCHÉ

Commercial :
NON TOUCHÉ

Mobile :
NON TOUCHÉ

Commit :
AUCUN

Push :
AUCUN

Next step :
P1 GLOBAL FISCAL YEAR — REOPEN APPROVAL — IMPLEMENTATION GO
(mandat séparé, non commencé)

FIN DU MANDAT.
