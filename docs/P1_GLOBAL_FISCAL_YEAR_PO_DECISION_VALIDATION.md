# P1 GLOBAL FISCAL YEAR — PO DECISION VALIDATION

**Statut : DOSSIER DE DÉCISION — 🟢 6 DÉCISIONS VALIDÉES.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` de `tanzen-frontend`. Aucune migration, service, repository, route, écran, permission, table, colonne ou relation n'a été créée. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` n'ont pas été touchés. La validation des 6 décisions ci-dessous **ne constitue pas** un GO d'implémentation — celui-ci ferait l'objet d'un mandat séparé « IMPLEMENTATION GO », non commencé. Aucun commit, aucun push.

---

## 1. Objet

Formaliser les 6 décisions PO relatives au domaine Fiscal Year, telles que validées par le Product Owner, en s'appuyant sur l'audit read-only `docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md`. Ce document ne rouvre aucun constat de l'audit — il transforme les gaps qu'il a identifiés en décisions produit formellement tranchées, en signalant explicitement l'écart restant entre chaque décision et l'état actuel du code (aucune décision ci-dessous n'est encore implémentée).

## 2. Périmètre

Strictement `tanzen-frontend`. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` sont hors périmètre absolu — toute mention ci-dessous de ces dépôts est purement informative (impact futur), jamais une action engagée par ce document.

## 3. Source de référence

`docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md` (intégralement) — non réécrit, non corrigé silencieusement par ce document. Toute divergence entre une décision ci-dessous et un constat de l'audit est signalée explicitement à l'endroit concerné, jamais absorbée sans commentaire.

## 4. Hiérarchie des sources

1. Décision explicitement validée par le PO (ce document, à partir de sa publication).
2. `docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md` — constat de l'état réel du code au moment de l'audit.
3. Code source réel de `tanzen-frontend` (`src/mocks/settings/fiscal-years.ts`, `src/services/settings.service.ts`, `src/features/settings/settings-module.tsx`, `src/mocks/rbac.mocks.ts`).

**Note propre à ce Pack** : contrairement à un Decision Gate qui présenterait des options encore ouvertes, les 6 décisions ci-dessous arrivent **déjà tranchées** par le PO — ce document les formalise, vérifie leur cohérence mutuelle et avec l'audit, il ne les met pas au vote.

---

## 5. D-FY-01 — Création

### Choix retenu

✅ **OPTION A — Créer réellement le Fiscal Year**

### Statut

> 🟢 VALIDÉE

### Principe validé

Le système devra permettre de créer explicitement un nouvel exercice fiscal dans le même Tenant. La création d'un Fiscal Year :
- ne crée pas un nouveau Tenant ;
- conserve les anciens exercices ;
- ne clôture pas automatiquement les exercices précédents ;
- ne copie pas automatiquement les données de l'ancien exercice.

**CREATE FY ≠ CLOSE FY.**

### Cohérence avec l'audit

VERIFIED (`docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md` §6) : aucune fonction `createFiscalYear` n'existe aujourd'hui — `openFiscalYear` (`src/services/settings.service.ts:41-50`) n'active qu'un exercice `upcoming` déjà présent dans les données de seed, elle ne crée jamais un nouvel enregistrement. Cette décision **comble directement** le MODEL GAP le plus significatif identifié par l'audit (§1, §20 🔴). Aucune contradiction — la décision valide la nécessité de construire ce qui est aujourd'hui absent.

### Statut d'implémentation

**NON IMPLÉMENTÉE.** Aucun code n'a été écrit par ce document. Relève du futur mandat IMPLEMENTATION GO.

### Décision PO

```text
[X] OPTION A — Créer réellement le Fiscal Year
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
La création d'un nouvel exercice fiscal doit être une opération réelle et
distincte de l'ouverture (CREATE ≠ CLOSE, et par extension CREATE ≠ OPEN).
Ne clôture ni ne copie rien automatiquement.

Commentaire :
Comble le MODEL GAP §6/§20 de l'audit. Non implémentée par ce document.
```

---

## 6. D-FY-02 — Périmètre

### Choix retenu

✅ **OPTION C — Classification explicite par entité**

### Statut

> 🟢 VALIDÉE

### Principe validé

Le Fiscal Year est un contexte transversal, mais toutes les entités ne sont pas automatiquement FY-scoped. Chaque entité devra être classifiée individuellement selon l'une des valeurs suivantes :
- `PERMANENT`
- `TENANT-SCOPED`
- `FY-SCOPED`
- `FY-DERIVED`
- `DECISION_REQUIRED`

**Ne pas ajouter automatiquement `fiscalYearId` à toutes les tables.** La classification détaillée des domaines (Finance, Tontine, Loans, Governance, Members, Reports, Analytics) reste une étape d'implémentation/architecture ultérieure, non réalisée par cette décision.

### Cohérence avec l'audit

VERIFIED (audit §12) : recherche exhaustive confirmée — `fiscalYearId` n'existe aujourd'hui dans **aucune** entité de `tanzen-frontend` hors du module Settings lui-même. Cette décision est cohérente avec ce constat : elle n'impose aucun ajout rétroactif de `fiscalYearId`, elle établit uniquement la méthode de classification à appliquer plus tard. Aucune contradiction.

### Statut d'implémentation

**NON IMPLÉMENTÉE.** Aucune classification par domaine n'a été produite par ce document — volontairement, conformément au principe validé lui-même (« reste une étape ultérieure »).

### Décision PO

```text
[X] OPTION C — Classification explicite par entité (PERMANENT / TENANT-SCOPED /
    FY-SCOPED / FY-DERIVED / DECISION_REQUIRED)
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
Aucun ajout automatique de fiscalYearId. Chaque entité sera classifiée
individuellement lors d'une phase d'architecture ultérieure.

Commentaire :
Cohérent avec l'absence totale de fiscalYearId constatée par l'audit §12.
La classification détaillée par domaine n'est pas produite ici.
```

---

## 7. D-FY-03 — OPEN / CURRENT

### Choix retenu

✅ **OPTION B — Plusieurs FY peuvent être OPEN, mais un seul est CURRENT**

### Statut

> 🟢 VALIDÉE

### Principe validé

`status` et `isCurrent` sont deux concepts distincts. Un Tenant peut avoir, par exemple :
```
FY 2025 → OPEN / CURRENT=false
FY 2026 → OPEN / CURRENT=true
FY 2027 → OPEN / CURRENT=false
```
Un Tenant peut avoir plusieurs Fiscal Years `OPEN`, mais un seul `CURRENT`. L'ouverture d'un nouvel exercice ne clôture donc pas automatiquement les autres exercices `OPEN`.

### Cohérence avec l'audit

VERIFIED — **cette décision confirme rétroactivement un comportement déjà implémenté et déjà testé**, pas un changement à construire. `openFiscalYear` (`src/services/settings.service.ts:41-50`) retire `isCurrent` de l'ancien exercice courant mais **ne touche jamais son `status`** (commentaire explicite ligne 40 : *« son `status` n'est pas touché »*). Testé directement : `settings.service.test.ts:37-57`, assertion explicite `expect(previousYear?.status).toBe('open')` après ouverture d'un nouvel exercice. L'audit (§1, §8, §19 point 2) avait déjà signalé ce comportement comme une divergence par rapport à une lecture naïve du principe « un seul FY peut être OPEN » — cette décision **valide formellement** ce comportement existant comme intentionnel plutôt que de le corriger.

**Aucune contradiction — seule décision des 6 déjà satisfaite par le code actuel, sans action requise.**

### Statut d'implémentation

**DÉJÀ CONFORME.** Aucun changement de code nécessaire pour cette décision spécifiquement — comportement déjà en production et testé.

### Décision PO

```text
[X] OPTION B — Plusieurs FY peuvent être OPEN, un seul CURRENT
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
status et isCurrent sont des concepts distincts. isCurrent reste un
invariant à une seule valeur par tenant ; status='open' ne l'est pas.

Commentaire :
Confirme le comportement déjà implémenté et testé (settings.service.ts:40,
settings.service.test.ts:53-56) — aucune modification de code requise pour
cette décision seule.
```

---

## 8. D-FY-04 — RBAC

### Choix retenu

✅ **OPTION A — Conserver et utiliser `fiscalYears.read`**

### Statut

> 🟢 VALIDÉE

### Principe validé

Séparer clairement :
- `fiscalYears.read` → consultation des exercices
- `fiscalYears.manage` → création / ouverture / clôture / administration

**`fiscalYears.read` ne doit plus être une permission morte.**

### Cohérence avec l'audit

VERIFIED (audit §16) : `fiscalYears.read` est déclarée dans le catalogue (`src/mocks/rbac.mocks.ts:77`) mais **n'est vérifiée nulle part dans le code** — l'accès à l'écran `/settings/fiscal-years` est gouverné uniquement par la garde parente `settings.read` (`src/routes/app-router.tsx:63`). Seule `fiscalYears.manage` est réellement appliquée, à 2 endroits (`src/features/settings/settings-module.tsx:142, 144`). Cette décision comble directement le point classé DEAD PERMISSION par l'audit (§16, §20 🟡). Aucune contradiction — la séparation `read`/`manage` demandée existe déjà dans le catalogue de permissions ; ce qui manque est uniquement son application effective à la route/l'écran.

### Statut d'implémentation

**NON IMPLÉMENTÉE.** `fiscalYears.read` reste morte dans le code tel qu'il existe à ce jour. Relève du futur mandat IMPLEMENTATION GO (câblage de la vérification sur la route ou l'écran).

### Décision PO

```text
[X] OPTION A — Conserver et utiliser fiscalYears.read
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
fiscalYears.read (consultation) et fiscalYears.manage (création/ouverture/
clôture/administration) doivent rester deux permissions distinctes.
fiscalYears.read doit cesser d'être une permission morte.

Commentaire :
Comble le gap DEAD PERMISSION de l'audit §16. Aucune modification RBAC
effectuée par ce document — le catalogue actuel (2 permissions déjà
séparées) n'a pas besoin d'être changé, seul son câblage l'est.
```

---

## 9. D-FY-05 — Réouverture

### Choix retenu

✅ **OPTION C — Réouverture exceptionnelle avec justification**

### Statut

> 🟢 VALIDÉE

### Principe validé

Un Fiscal Year `CLOSED` peut exceptionnellement être rouvert. Processus cible :
```
CLOSED → Demande exceptionnelle → Justification obligatoire → Autorisation appropriée → OPEN → Traçabilité
```
La réouverture n'est jamais automatique, nécessite une justification, nécessite une autorisation, et doit être tracée.

**Les détails techniques du mécanisme d'approbation restent à préciser lors de l'Implementation GO — non inventés ici** (voir §11 « Points restant à préciser » ci-dessous et le Decision Gate Closure associé).

### Cohérence avec l'audit

VERIFIED (audit §7) : aucune fonction `reopenFiscalYear`/`lockFiscalYear`/`archiveFiscalYear` n'existe — recherche exhaustive confirmée. Le texte de confirmation UI actuel (`src/locales/fr/index.ts:190`, `closeFiscalYearConfirm`) affirme même explicitement l'inverse : *« Cette action ne peut pas être annulée depuis cet écran. »* Cette décision **introduit une nouvelle capacité qui contredit ce texte UI actuel** — pas le code/comportement lui-même (qui ne fait qu'refléter l'absence actuelle de réouverture), mais le message affiché à l'utilisateur deviendra factuellement faux le jour où la réouverture sera implémentée. **Point à traiter explicitement à l'Implementation GO** (mise à jour du texte `closeFiscalYearConfirm`), signalé ici comme conséquence directe de cette décision plutôt que comme contradiction non résolue.

### Statut d'implémentation

**NON IMPLÉMENTÉE.** Aucune fonction, écran, permission ou texte n'a été modifié par ce document.

### Décision PO

```text
[X] OPTION C — Réouverture exceptionnelle avec justification
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
CLOSED → demande exceptionnelle → justification obligatoire → autorisation
appropriée → OPEN → traçabilité. Jamais automatique.

Commentaire :
Comble l'absence totale constatée par l'audit §7. Introduit une capacité
qui contredira le texte UI actuel ("ne peut pas être annulée") — à
corriger explicitement à l'Implementation GO, pas par ce document. Détails
du mécanisme d'approbation non tranchés — voir §11 et le Decision Gate
Closure.
```

---

## 10. D-FY-06 — Traçabilité

### Choix retenu

✅ **OPTION C — Audit complet + journal global `audit_logs`**

### Statut

> 🟢 VALIDÉE

### Principe validé

Les opérations `CREATE`, `OPEN`, `CLOSE`, `REOPEN` doivent être traçables. Informations attendues : `tenantId`, `fiscalYearId`, `action`, `fromStatus`, `toStatus`, `performedBy`, `performedAt`, `reason` (lorsque nécessaire). Les événements doivent être intégrés au mécanisme global `audit_logs`. **Particulièrement liée à D-FY-05** : `REOPEN` doit obligatoirement être justifiable et traçable.

### Cohérence avec l'audit

VERIFIED (audit §4, §17) : `FiscalYear` (`src/mocks/settings/fiscal-years.ts:8-16`) ne porte aujourd'hui aucun des champs `createdAt`/`updatedAt`/`closedAt`/`createdBy`/`closedBy` ; `closeCurrentFiscalYear`/`openFiscalYear` n'écrivent dans aucun journal d'audit — recherche exhaustive confirmée, aucun fichier de `src/mocks/audit/` ne mentionne « fiscal ». Cette décision comble directement l'ABSENCE constatée en §17. Aucune contradiction.

### Statut d'implémentation

**NON IMPLÉMENTÉE.** `audit_logs` n'est pas modifié, aucun champ n'est ajouté à `FiscalYear`, aucune écriture d'audit n'est câblée.

### Décision PO

```text
[X] OPTION C — Audit complet + journal global audit_logs
[ ] AUTRE OPTION
[ ] À PRÉCISER

Décision PO :
CREATE/OPEN/CLOSE/REOPEN doivent être tracés dans audit_logs avec
tenantId, fiscalYearId, action, fromStatus, toStatus, performedBy,
performedAt, reason (si nécessaire).

Commentaire :
Comble l'absence totale constatée par l'audit §17. Directement couplée à
D-FY-05 (REOPEN doit être justifiable et tracé). audit_logs non implémenté
par ce document.
```

---

## 11. Synthèse des validations

| ID | Sujet | Choix retenu | Statut |
|---|---|---|---|
| D-FY-01 | Création | Option A | 🟢 VALIDÉE |
| D-FY-02 | Périmètre | Option C | 🟢 VALIDÉE |
| D-FY-03 | OPEN/CURRENT | Option B | 🟢 VALIDÉE |
| D-FY-04 | RBAC | Option A | 🟢 VALIDÉE |
| D-FY-05 | Réouverture | Option C | 🟢 VALIDÉE |
| D-FY-06 | Traçabilité | Option C | 🟢 VALIDÉE |

**6/6 décisions validées.**

**Points restant à préciser avant Implementation GO** (non tranchés par ces 6 décisions, non inventés ici — développés en détail dans `docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md` §5) :
- Format exact du nom, calcul `startDate`/`endDate`, validation des chevauchements pour D-FY-01.
- Mécanisme exact de sélection du `CURRENT`, comportement d'un Tenant sans `CURRENT` pour D-FY-03.
- Qui autorise la réouverture, approbation simple/double, format de la justification, durée maximale éventuelle pour D-FY-05.
- Schéma exact de `audit_logs`, noms d'action définitifs, conservation, affichage pour D-FY-06.
- Classification détaillée par domaine (Finance, Tontine, Loans, Governance, Members, Reports, Analytics) pour D-FY-02.

**Statut d'implémentation global : NON IMPLÉMENTÉE (6/6).** Aucun code, test, migration, permission ou route n'a été modifié par ce document.

---

## 12. Périmètre et modifications

**`tanzen-frontend`** : aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` modifié. Seul artefact créé par ce document : `docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md`.

**`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile`** : NON TOUCHÉS.

## 13. Git

```
=== tanzen-frontend ===
?? docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md                (mandat antérieur, sans rapport avec celui-ci)
?? docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md          (ce document)
?? docs/P1_GOVERNANCE_PHASE_4C4_POST_IMPLEMENTATION_AUDIT.md    (préexistant, sans rapport)
?? docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md            (mandat antérieur, sans rapport)
?? docs/P1_TONTINE_PO_DECISION_VALIDATION.md                     (mandat antérieur, sans rapport)
```

Aucun commit, aucun push.

FIN DU MANDAT (PO Decision Validation).
