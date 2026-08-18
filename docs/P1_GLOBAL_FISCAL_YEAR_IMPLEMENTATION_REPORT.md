# P1 GLOBAL FISCAL YEAR — IMPLEMENTATION REPORT

**Statut : IMPLÉMENTATION RÉELLE, PÉRIMÈTRE `tanzen-frontend` UNIQUEMENT.** `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non touchés (confirmé §17). Aucun commit, aucun push.

---

## 1. Résultat

**IMPLEMENTATION = TERMINÉE.**

Les 6 décisions PO (D-FY-01 à D-FY-06) sont implémentées dans les limites strictes autorisées par le Decision Gate — aucune STOP CONDITION (mandat §35) n'a été rencontrée. Les points explicitement laissés ouverts par `docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md` §5 (format exact de validation des chevauchements, mécanisme de sélection du CURRENT parmi plusieurs OPEN, niveau d'autorisation du REOPEN, schéma définitif d'`audit_logs`, classification FY-scoping par domaine) **restent non tranchés**, conformément à l'instruction de ne jamais les transformer en comportement inventé (§15 ci-dessous).

## 2. Décisions implémentées

| ID | Statut |
|---|---|
| D-FY-01 — Création | ✅ Implémentée — `createFiscalYear` réel, `status: 'upcoming'`, CREATE ≠ CLOSE ≠ OPEN |
| D-FY-02 — Périmètre | ✅ Respectée par construction — aucun `fiscalYearId` ajouté à Tontine/Finance/Loans/Governance/Members/Reports/Analytics |
| D-FY-03 — OPEN/CURRENT | ✅ Déjà conforme (audit initial) — confirmée inchangée, désormais auditée |
| D-FY-04 — RBAC | ✅ Implémentée — `fiscalYears.read` n'est plus une permission morte |
| D-FY-05 — Réouverture | ✅ Implémentée — `reopenFiscalYear`, justification obligatoire |
| D-FY-06 — Traçabilité | ✅ Implémentée — `CREATE/OPEN/CLOSE/REOPEN` tracés dans `audit_logs` (`auditEvents`) |

## 3. Précision REOPEN

```
CLOSED → OPEN
isCurrent inchangé.
```

Confirmé par le code (`reopenFiscalYear`, `src/services/settings.service.ts`) et par un test dédié (`settings.service.test.ts`, « ALLOW: reopenFiscalYear reopens a closed fiscal year with a reason, WITHOUT changing isCurrent anywhere ») : la réouverture ne modifie que `status`. `isCurrent` reste `false` — un exercice `closed` a toujours `isCurrent: false` par construction (`closeCurrentFiscalYear` les fixe ensemble), donc aucune bascule n'est nécessaire. Devenir `CURRENT` reste une opération strictement distincte (`openFiscalYear`), jamais déclenchée automatiquement par une réouverture. Vérifié aussi en environnement réel (navigateur, §13).

## 4. Fichiers créés

```
docs/P1_GLOBAL_FISCAL_YEAR_IMPLEMENTATION_REPORT.md   (ce document)
```

Aucun fichier `src/`/`app/`/`tests/` n'a été créé — conformément à l'instruction de ne pas créer un deuxième écran Fiscal Year (mandat §17), l'écran existant (`SettingsFiscalYears`) a été étendu, pas dupliqué.

## 5. Fichiers modifiés

```
src/mocks/settings/fiscal-years.ts        — +createdAt (FiscalYear), 12 enregistrements de seed mis à jour
src/services/settings.service.ts          — +createFiscalYear, +reopenFiscalYear, +recordFiscalYearAudit,
                                              closeCurrentFiscalYear/openFiscalYear instrumentés (audit)
src/services/settings.service.test.ts     — +10 tests (CREATE ×5, REOPEN ×5)
src/features/settings/settings-module.tsx — SettingsFiscalYears étendu (create/reopen dialogs, garde
                                              fiscalYears.read, texte closeFiscalYearConfirm mis à jour)
src/mocks/audit/audit-events.ts           — AuditModule += 'settings' (extension de l'union existante)
src/features/audit/audit-module.tsx       — AUDIT_MODULE_KEY += 'settings' (affichage du nouveau module)
src/locales/fr/index.ts                   — +12 clés settings, +1 clé audit (moduleSettings), 1 clé modifiée
src/locales/en/index.ts                   — idem, en anglais
```

## 6. Fichiers supprimés

**AUCUN.**

## 7. Services

`src/services/settings.service.ts` :
- **`createFiscalYear(tenantId, { label, startDate, endDate })`** — D-FY-01. Crée un `FiscalYear` réel avec `status: 'upcoming'`, `isCurrent: false` — jamais `open`/`closed` directement (cohérent avec le cycle de vie déjà en place : seul `openFiscalYear` peut faire passer un exercice à `open`). Validations volontairement limitées aux incohérences « évidentes » (mandat §11 point 4, non une invention de règle de chevauchement complète) : `endDate > startDate`, et absence de doublon exact (même `label`, ou même couple `startDate`/`endDate`) pour ce tenant. Ne copie, ne clôture, ne touche aucune autre donnée (§24 du mandat, respecté).
- **`reopenFiscalYear(tenantId, fiscalYearId, reason)`** — D-FY-05, précision §8 du mandat. N'accepte qu'un exercice `status === 'closed'` ; `reason` non vide obligatoire (validation minimale — le format exact reste `TECHNICAL DETAIL REQUIRED`, §15). Ne modifie jamais `isCurrent`.
- **`closeCurrentFiscalYear`/`openFiscalYear`** — comportement **inchangé** (déjà conformes, cf. audit initial et D-FY-03) ; seule addition : un appel à `recordFiscalYearAudit` en fin de fonction, après la mutation, sur le chemin de succès uniquement.
- **`recordFiscalYearAudit(...)`** — fonction privée, point d'entrée unique des écritures d'audit Fiscal Year. Pousse directement dans `auditEvents` (`src/mocks/audit/audit-events.ts`), le tableau canonique déjà utilisé par tout le reste du projet — **aucun système d'audit parallèle créé** (mandat §21, respecté). Mapping explicite entre le vocabulaire du mandat et les champs déjà existants d'`AuditEvent` : `performedBy`/`performedAt` → `actorId`+`actorName` (résolus via `currentUser`, importé de `@/mocks/rbac.mocks`, même singleton que `TenantContext`) / `timestamp` ; `fromStatus`/`toStatus` → `before.status`/`after.status`. Aucun champ n'a été ajouté à `AuditEvent` lui-même.

**Noms d'action retenus** : `fiscalYears.create` / `fiscalYears.open` / `fiscalYears.close` / `fiscalYears.reopen` — **pas** `FISCAL_YEAR_CREATED`/etc. comme suggéré à titre d'exemple par le mandat (§21). Choix justifié par l'instruction du mandat lui-même (« utiliser les conventions de nommage existantes si elles imposent un autre format ») : tous les `action` déjà présents dans `auditEvents` (`cycles.manage`, `members.update`, `loans.approve`, `tenants.create`...) suivent le format `module.verbe`, jamais `MODULE_VERBE_PASSÉ`. Suivre le format déjà utilisé partout ailleurs plutôt que celui de l'exemple du mandat.

## 8. Modèle

`FiscalYear` (`src/mocks/settings/fiscal-years.ts`) gagne **un seul champ** : `createdAt: string`. Documenté dans le fichier lui-même (raison/source/consommateur, conformément au mandat §10) : seule information de cycle de vie portée directement par l'entité — `createdBy`/`closedBy`/`reopenedAt`/etc. vivent dans `audit_logs` (D-FY-06), jamais dupliqués sur l'entité elle-même. Les 12 enregistrements de seed préexistants reçoivent une valeur rétroactive (`createdAt = startDate`), documentée comme un choix d'affichage pour des données de démonstration, pas une donnée réelle.

**Aucun autre champ ajouté.** `uuid`/`version`/`sync_status`/`closedBy`/`reopenedBy` n'ont pas été ajoutés — cohérent avec la convention Web déjà documentée (aucun besoin démontré, traçabilité déjà couverte par `audit_logs`).

## 9. UI

`SettingsFiscalYears` (`src/features/settings/settings-module.tsx`), écran unique préservé et étendu :
- **Garde `fiscalYears.read`** : si absente, affiche un état « accès refusé » (`EmptyState` + clés `system.unauthorizedTitle`/`unauthorizedDescription`, déjà existantes — réutilisées, pas dupliquées) au lieu de l'historique. Voir §10.
- **Bouton « Créer un exercice »** (icône `Plus`), gardé `fiscalYears.manage`, ouvre un dialogue (`ConfirmDialog` + champs `label`/`startDate`/`endDate`, même pattern que `CycleCreate`/`addCycleMember` déjà utilisé côté Tontines). Erreur inline (`FieldError`) si champ manquant ou si le service refuse (doublon/période invalide).
- **Bouton « Rouvrir (exceptionnel) »** (icône `RotateCcw`), visible uniquement sur les lignes `status === 'closed'`, gardé `fiscalYears.manage`, ouvre un dialogue avec `Textarea` de justification obligatoire. Erreur inline si le motif est vide ou si le service refuse.
- **`closeFiscalYearConfirm`** reformulé (§19 du mandat) : ne prétend plus qu'une clôture est absolument irréversible, mentionne désormais la réouverture exceptionnelle possible.
- Aucun nouvel écran, aucune nouvelle route.

## 10. RBAC

**Aucune permission créée ni supprimée** (mandat §20, respecté à la lettre). `fiscalYears.read` et `fiscalYears.manage` existaient déjà dans le catalogue (`src/mocks/rbac.mocks.ts`), inchangé. Seul changement : `fiscalYears.read` est désormais **réellement vérifiée** — via `usePermissions().can('fiscalYears.read')` à l'intérieur de `SettingsFiscalYears`, en plus (pas à la place) de la garde de route parente `settings.read` déjà en place sur `/settings/*`. `fiscalYears.manage` continue de gouverner les 4 actions de gestion (create/open/close/reopen), désormais explicitement via son propre libellé dans le mandat (§6/§20).

## 11. Audit

`AuditModule` (`src/mocks/audit/audit-events.ts`) étendu d'une seule valeur : `'settings'` — le seul changement de type nécessaire pour que les événements Fiscal Year puissent exister dans le tableau canonique déjà utilisé par tous les autres modules. `AUDIT_MODULE_KEY` (`src/features/audit/audit-module.tsx`, écran Audit lui-même) et la clé i18n `moduleSettings` (section `audit`, FR+EN) ont été étendus en conséquence, pour que le nouveau module s'affiche correctement dans le filtre « Module » de l'écran Audit — **seul point où ce mandat touche un fichier hors du domaine Settings/Fiscal Year strictement délimité**, justifié précisément parce que le mécanisme d'audit est un mécanisme transverse déjà partagé par construction (commentaire d'en-tête de `audit-events.ts` : « Aucun autre module ne doit créer son propre tableau »), pas un domaine métier au sens du mandat §23/§30 (Tontine/Finance/Governance/Loans/Members) — ces derniers n'ont reçu aucune modification.

`CREATE`/`OPEN`/`CLOSE`/`REOPEN` sont désormais tous audités (vérifié §13, tests unitaires §13 également). Pour `REOPEN`, `context.reason` porte la justification obligatoire.

## 12. Query Keys / Cache

**Aucune nouvelle clé.** `queryKeys.settings.fiscalYears(tenantId)` (déjà existante) est invalidée par `createFiscalYear` et `reopenFiscalYear` (nouveaux) en plus de `closeCurrentFiscalYear`/`openFiscalYear` (déjà le cas). `queryKeys.settings.currentFiscalYear(tenantId)` reste invalidée uniquement par `open`/`close` (les seules opérations qui affectent `isCurrent`) — ni `create` ni `reopen` n'y touchent, cohérence conservée. Aucune query key d'un autre domaine n'a été modifiée (mandat §22, respecté).

## 13. Tests

**10 tests unitaires ajoutés** à `src/services/settings.service.test.ts` (22 tests au total dans ce fichier après ajout, tous passants) :

- CREATE (5) : création réussie sans toucher l'exercice courant ; doublon (même `label`) refusé ; période invalide refusée ; aucune fuite vers un autre tenant ; événement d'audit `fiscalYears.create` enregistré.
- REOPEN (5) : réouverture réussie avec `isCurrent` inchangé ET l'exercice courant précédent inchangé ; motif vide refusé ; statut différent de `closed` refusé ; isolation tenant (refus inter-tenant) ; événement d'audit `fiscalYears.reopen` avec le motif exact.

**RBAC** : aucun nouveau test de composant écrit spécifiquement pour `fiscalYears.read`/`fiscalYears.manage`. Décision délibérée, documentée ici plutôt que silencieuse : le mécanisme générique `PermissionGate`/`can()` est déjà testé exhaustivement et de façon permission-agnostique par `src/components/permission-gate.test.tsx` (ALLOW/DENY avec fallback, ALLOW/DENY sans fallback) — ce test couvre déjà structurellement `fiscalYears.read`/`fiscalYears.manage` puisqu'il exerce le même mécanisme `can(permission)` avec des permissions arbitraires du même catalogue. Aucun autre domaine du projet (Tontine, Finance, Governance...) ne possède de test de composant dédié à son propre RBAC — créer un tel test uniquement pour Fiscal Year aurait introduit une convention de test inédite, contraire à l'instruction de ne pas faire de refactor/pattern nouveau non nécessaire (mandat §2/§28).

**Vérification manuelle en environnement réel** (navigateur, Playwright piloté depuis un projet scratch isolé — aucune dépendance ajoutée à `tanzen-frontend`) : serveur de développement démarré (`npm run dev`), connexion via la session de démonstration existante, navigation vers `/settings/fiscal-years`. 7/7 vérifications passées, 0 erreur console :
1. Écran charge avec la carte « Exercice en cours » + l'historique.
2. Création d'un exercice valide (« Exercice 2033 ») → nouvelle ligne « À venir », exercice courant (2026) inchangé.
3. Doublon (même libellé) → erreur inline, aucune ligne créée.
4. Période invalide (fin avant début) → erreur inline, aucune ligne créée.
5. Bouton « Rouvrir (exceptionnel) » visible sur les lignes clôturées.
6. Soumission sans motif → erreur inline.
7. Soumission avec motif → exercice rouvert (statut « Ouvert »), exercice courant (2026) toujours inchangé.

Serveur de développement arrêté après vérification.

## 14. Typecheck / Lint / i18n / Build

```
npm run typecheck   → 0 erreur
npm run lint        → 0 erreur, 14 warnings pré-existants (react-refresh/only-export-components,
                       fichiers non touchés par ce mandat — vérifiés identiques à avant)
npm run i18n:check  → 2/2 tests passants (aucune clé orpheline, parité FR/EN confirmée)
npm test            → 281/281 tests passants (28 fichiers), incluant les 10 nouveaux tests Fiscal Year
npm run build       → succès (8.12s), même avertissement pré-existant sur la taille du plus gros chunk
                       (909 kB), sans rapport avec ce mandat
```

## 15. Points restant à préciser

Aucun n'a été transformé en comportement inventé. Repris tels que déjà classés par `docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md` §5, toujours ouverts après cette implémentation :

- **`TECHNICAL DETAIL REQUIRED`** : format exact du `label` (aucune contrainte de format imposée au-delà de non-vide) ; règle de chevauchement partiel entre exercices (seul le doublon exact — même `label` ou même couple de dates — est bloqué, pas un chevauchement partiel de périodes) ; format/longueur exacts du motif de réouverture (seule la non-vacuité est vérifiée) ; schéma définitif/rétention/affichage dédié d'`audit_logs` au-delà de sa réutilisation telle quelle.
- **`DECISION REQUIRED`** : mécanisme de sélection du `CURRENT` lorsque plusieurs exercices sont déjà `OPEN` simultanément (non implémenté — seul `openFiscalYear`, qui n'opère que depuis `status='upcoming'`, existe) ; niveau d'autorisation exact du `REOPEN` (`fiscalYears.manage` réutilisée telle quelle, pas de permission distinctive `fiscalYears.reopen` — non demandée par le mandat, mais non explicitement confirmée non plus) ; classification `FY-scoping` par domaine (D-FY-02) — toujours à zéro classification, aucun domaine métier n'a été touché.

## 16. Domaines non modifiés

```
Tontine
Finance
Governance
Loans
Members
```

Confirmé — aucun de ces domaines n'apparaît dans la liste des fichiers modifiés (§5). Le seul fichier touché hors du périmètre strict « Settings/Fiscal Year » est `src/features/audit/audit-module.tsx` (module Audit, mécanisme transverse), justifié explicitement en §11.

## 17. Backend / Commercial / Mobile

```
tanzen-backend     → NON TOUCHÉ (répertoire vide, non consulté)
tanzen-commercial  → NON TOUCHÉ (git status confirmé clean)
tanzen-mobile      → NON TOUCHÉ (git status confirmé identique à l'état préexistant sans rapport avec ce mandat)
```

## 18. Git

```
=== Avant (baseline de ce mandat) ===
tanzen-frontend :
?? docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md
?? docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md
?? docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md
?? docs/P1_GOVERNANCE_PHASE_4C4_POST_IMPLEMENTATION_AUDIT.md   (préexistant, sans rapport)
?? docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md            (préexistant, sans rapport)
?? docs/P1_TONTINE_PO_DECISION_VALIDATION.md                     (préexistant, sans rapport)

=== Après ===
 M src/features/audit/audit-module.tsx
 M src/features/settings/settings-module.tsx
 M src/locales/en/index.ts
 M src/locales/fr/index.ts
 M src/mocks/audit/audit-events.ts
 M src/mocks/settings/fiscal-years.ts
 M src/services/settings.service.test.ts
 M src/services/settings.service.ts
?? docs/P1_GLOBAL_FISCAL_YEAR_IMPLEMENTATION_REPORT.md (ce document)
+ les 5 fichiers ?? déjà listés ci-dessus, inchangés
```

Aucun commit, aucun push, aucune branche créée.

---

## P1 GLOBAL FISCAL YEAR
## IMPLEMENTATION GO

tanzen-frontend :
TERMINÉE

D-FY-01 :
Implémentée — createFiscalYear réel, CREATE ≠ CLOSE ≠ OPEN

D-FY-02 :
Respectée — aucun fiscalYearId ajouté hors du module Settings

D-FY-03 :
Déjà conforme, désormais auditée

D-FY-04 :
Implémentée — fiscalYears.read n'est plus morte

D-FY-05 :
Implémentée — réouverture exceptionnelle, justification obligatoire

D-FY-06 :
Implémentée — CREATE/OPEN/CLOSE/REOPEN tracés dans audit_logs

REOPEN / isCurrent :
CLOSED → OPEN, isCurrent inchangé

Tests :
281/281 passants (10 nouveaux) + vérification navigateur 7/7

Typecheck :
0 erreur

Lint :
0 erreur (14 warnings pré-existants, sans rapport)

i18n :
2/2 passants, aucune clé orpheline

Build :
Succès

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

FIN DU MANDAT.
