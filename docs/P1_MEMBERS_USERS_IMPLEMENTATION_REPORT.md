# P1 MEMBERS / USERS — IMPLEMENTATION REPORT (D-MEM-01 à D-MEM-04)

**Mandat** : Implementation GO — mise en œuvre des 4 décisions PO closes
(`docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md`) dans `tanzen-frontend` uniquement.
**Statut** : ✅ IMPLÉMENTÉ — régression complète au vert, D-MEM-01 documenté comme MODEL GAP
(infrastructure absente, non inventée, conformément à l'instruction explicite du mandat).

---

## 1. Résumé exécutif

Les 4 décisions ont été implémentées fidèlement, sans réinterprétation :

- **D-MEM-01 (Photo, Option C)** : aucune implémentation de persistance n'était possible sans
  inventer une infrastructure de stockage objet absente du projet — conformément à
  l'instruction explicite du mandat (« NE PAS l'inventer »), ce point reste un **MODEL GAP**
  documenté, l'UX déjà construite (sélection/aperçu/suppression) restant inchangée et
  honnête (aucune persistance simulée).
- **D-MEM-02 (uuid/sync_status/version, Option C)** : aucun changement de code requis
  (l'implémentation de `Member` était déjà conforme) — la convention project-wide a été
  rendue explicite par des commentaires croisés entre `members.ts` et `governance.ts`.
- **D-MEM-03 (Matricule, Option B)** : implémenté — `createMember`, `updateMember`,
  `findMemberDuplicate` vérifient désormais l'unicité du matricule **par tenant**, plus
  globalement. 7 tests (3 réécrits, 4 conservés/adaptés) prouvent les 4 scénarios exigés par
  le mandat.
- **D-MEM-04 (Statuts, Option A + migration `PENDING → ACTIVE`)** : `pending` retiré du type
  `MemberStatus` (garantie au niveau du système de types, pas d'un contrôle runtime),
  `M-004` migré vers `active` (historique recoloré, pas de second événement synthétique),
  formulaire/filtre/compteur adaptés, `Vote.result` explicitement préservé (clé i18n et
  tonalité partagées, non retirées).

**Découverte non cataloguée par l'addendum, trouvée par la vérification exhaustive exigée par
le mandat** : `src/services/dashboard.service.ts` consommait `Member.status === 'pending'`
pour une notification et une entrée « approbation d'adhésion » — un consommateur fonctionnel
réel non identifié lors de la clôture du Decision Gate. Ce code, devenu définitivement
inatteignable (aucun membre ne peut plus être `pending`), a été retiré plutôt que conservé
comme code mort silencieux — voir §5.

Aucune modification de `tanzen-commercial` ni `tanzen-mobile`. Aucun commit, aucun push.

---

## 2. D-MEM-01 — Photo

```
DECISION       Option C — Stockage objet / media storage dédié
IMPLEMENTATION MODEL GAP — infrastructure absente, non inventée (instruction explicite du mandat)
FILES          Aucun fichier modifié pour cette décision
TESTS          Aucun (rien à tester : aucune persistance n'est simulée)
STATUS         🟣 MODEL GAP documenté — UX existante inchangée
```

**Vérification menée** (avant toute décision de ne pas implémenter) : relecture intégrale de
`MemberPhotoField` (`organization-module.tsx`) — sélection de fichier, aperçu
(`URL.createObjectURL`), remplacement, suppression, validations de type (image) et de taille
(5 Mo), tous **confirmés fonctionnels et inchangés**. Relecture du précédent `DocumentRecord`/
`documentService` (`src/mocks/operations/documents.ts`,
`src/services/document.service.ts`) — confirmé, comme lors de l'audit précédent, qu'il ne
stocke que des métadonnées, jamais de contenu binaire réel. Aucun service de stockage objet
n'existe dans `tanzen-frontend`, ni comme dépendance (`package.json` non modifié, aucune
bibliothèque de ce type), ni comme service applicatif. `tanzen-backend` reste un répertoire
vide.

**Décision d'implémentation** : conformément à l'instruction explicite du mandat (« Si une
partie de l'Option C nécessite une infrastructure absente : NE PAS l'inventer. Documente
précisément le point restant comme MODEL GAP au lieu de simuler une persistance réelle »),
**aucun code n'a été ajouté ou modifié pour cette décision**. Simuler une persistance (ex.
stocker un data URI dans un mock, ou créer un faux service qui ne persiste rien réellement)
aurait été exactement le type d'invention que le mandat interdit.

```
MODEL_GAP: Member photo storage requires a dedicated object/media storage service —
absent from tanzen-frontend and tanzen-backend (répertoire vide). Non implémenté ici,
conformément à l'instruction explicite du mandat.
```

## 3. D-MEM-02 — `uuid` / `sync_status` / `version`

```
DECISION       Option C — Convention project-wide explicite (modèle canonique ≠ modèle frontend)
IMPLEMENTATION Documentaire — aucun changement de comportement, l'implémentation Member était déjà conforme
FILES          src/mocks/organization/members.ts, src/mocks/organization/governance.ts (commentaires)
TESTS          Aucun nouveau test requis (déjà couverts par les 43 tests existants, non modifiés pour cette décision)
STATUS         ✅ CLOSED
```

**Vérification menée** : relecture de `Member` (`uuid` généré par `crypto.randomUUID()`,
`syncStatus`/`version` présents et fonctionnels — `version` réellement incrémenté à chaque
`updateMember`), de `createMember`/`updateMember` (inchangés pour cette décision), des
mocks/tests existants (aucune régression possible, rien n'a changé fonctionnellement), et de
`governance.ts:26-27` (convention d'exclusion documentée pour les autres entités Web).

**Implémentation** : la convention project-wide a été rendue explicite par croisement de
commentaires — `members.ts` documente que ces champs sont une **dérogation fermée par
D-MEM-02** à la convention par défaut, et `governance.ts` référence désormais cette
dérogation depuis l'entité qui documentait l'exclusion générale. Aucune nouvelle convention
différente n'a été créée pour `Member` seul (l'implémentation existante était déjà celle
retenue par l'Option C) ; aucune limite entre dictionnaire canonique et modèle Web n'a été
franchie dans un sens ou dans l'autre.

## 4. D-MEM-03 — Matricule

```
DECISION       Option B — UNIQUE(tenant_id, matricule)
IMPLEMENTATION Complète — createMember, updateMember, findMemberDuplicate corrigés
FILES          src/services/organization.service.ts, src/services/organization.service.test.ts
TESTS          7 tests (3 réécrits pour refléter la portée tenant-scopée, 4 nouveaux/adaptés)
STATUS         ✅ CLOSED
```

**Avant** : `createMember` vérifiait `members.some((item) => item.matricule === input.matricule)`
sur l'intégralité du tableau `members` (tous tenants confondus). `updateMember` et
`findMemberDuplicate` faisaient de même.

**Après** : les trois fonctions filtrent d'abord `members` par `tenantId` (variable
`tenantMembers`, réutilisant le pattern déjà en place pour `phone`/`email`/l'identité), puis
vérifient l'unicité du matricule uniquement au sein de ce sous-ensemble.

Tests ajoutés/réécrits (`organization.service.test.ts`) :
1. **ALLOW** : même matricule dans deux tenants différents → autorisé (`createMember`).
2. **DENY** : même matricule dans le même tenant → refusé (`createMember`).
3. **ALLOW** (`updateMember`) : même matricule appliqué à deux membres de tenants différents
   → autorisé.
4. **DENY** (`updateMember`) : collision de matricule entre deux membres du **même** tenant →
   refusé.
5. **ALLOW** (`updateMember`) : un membre conservant/re-soumettant son propre matricule → non
   bloqué (exclusion de soi-même).
6. **ALLOW** : matricules vides ne collisionnent jamais entre eux (sémantique NULL, inchangé).
7. **`findMemberDuplicate`** : retourne `'matricule'` pour une collision intra-tenant, `null`
   pour un tenant différent (cross-tenant explicitement testé comme non-collision).

**Isolation tenant garantie côté service**, pas seulement côté UI — conforme à l'instruction
explicite du mandat : le formulaire ne fait qu'appeler `findMemberDuplicate`/`createMember`/
`updateMember`, qui restent les seules autorités.

## 5. D-MEM-04 — Statuts Member (migration `PENDING → ACTIVE`)

```
DECISION       Option A (vocabulaire limité à ACTIVE/INACTIVE/SUSPENDED/EXITED) + migration PENDING → ACTIVE
IMPLEMENTATION Complète
FILES          src/mocks/organization/members.ts, src/services/organization.service.ts (indirect via D-MEM-03),
               src/services/dashboard.service.ts, src/features/organization/organization-module.tsx,
               src/services/organization.service.test.ts, src/services/eligibility.service.test.ts
TESTS          8 tests (3 réécrits, 5 nouveaux/adaptés) + suppression de code mort dans dashboard.service.ts
STATUS         ✅ CLOSED
```

### 5.1 Type

`MemberStatus` (`src/mocks/organization/members.ts`) : `'active' | 'inactive' | 'suspended' |
'pending' | 'exited'` → `'active' | 'inactive' | 'suspended' | 'exited'`. `'pending'` retiré
de l'union — **aucune valeur `pending` ne peut plus être assignée à `Member.status`, garanti
par le compilateur** (`npm run typecheck`), pas par un contrôle runtime.

### 5.2 Migration des données

Seul enregistrement concerné : `M-004` (Ousmane Fall, `T-004`). `status: 'pending'` →
`status: 'active'`. `statusHistory` : l'entrée `{ status: 'pending', since: '2024-02-15' }`
est recolorée en `{ status: 'active', since: '2024-02-15' }` — **même date**, pas un second
événement synthétique daté d'aujourd'hui : ce n'est pas un changement de statut métier (le
membre n'a pas été « activé » aujourd'hui), c'est une migration du vocabulaire lui-même, donc
rétroactive. `version` incrémenté (1→2), `updatedAt` daté de la migration (2026-08-18) pour
tracer que l'enregistrement a été modifié, `updatedBy` laissé `null` (migration de données,
pas une action d'un utilisateur interactif — cohérent avec `createdBy: null` déjà présent sur
les données de seed). Choix documenté ici, tel qu'anticipé comme non tranché par l'addendum
(§4 point 3).

### 5.3 Formulaire de création

`MemberCreate` : valeur initiale `status: 'pending'` → `status: 'active'`. Le sélecteur de
statut (`MemberFormFields`, section « Général ») est retiré entièrement — il n'offrait que
`active`/`pending` **avant** cette décision (jamais `inactive`/`suspended`/`exited`, déjà
inaccessibles via ce contrôle), donc son seul choix restant après retrait de `pending` était
un unique élément non significatif. Le retrait ne supprime aucune capacité réelle :
`inactive`/`suspended`/`exited` restent atteignables comme avant (suspension/réactivation via
`MemberDetail`, ou modification directe des données). `values.status` reste géré en interne
(initialisé à `member.status` pour l'édition), donc modifier d'autres champs via le formulaire
ne réinitialise jamais le statut d'un membre existant.

### 5.4 Filtre et compteur

`MembersDirectory` : option de filtre `pending` retirée. Le compteur `Metric` « pending » est
remplacé par un compteur « exited », cohérent avec le nouveau vocabulaire à 4 valeurs (choix
d'implémentation, non prescrit explicitement par le mandat — documenté ici).

### 5.5 `eligibility.service.ts` — vérifié, aucun changement de code requis

Confirmé par relecture : `getMemberStatusAt`/`isMemberEligibleForGeneralAssembly` traitent
`MemberStatus` génériquement (aucune branche câblée sur la valeur littérale `'pending'`). Seuls
les **tests** référençaient `pending` explicitement (`eligibility.service.test.ts`) — corrigés
(voir §5.7).

### 5.6 Découverte non cataloguée : `dashboard.service.ts`

`getDashboardOverview` filtrait `tenantMembers` sur `status === 'pending'` pour produire (a)
une notification « membre en attente » (`titleKey: 'pendingMember'`) et (b) une entrée
d'approbation (`typeKey: 'approvalMembership'`). Ce consommateur **n'avait pas été identifié**
dans l'addendum D-MEM-04 (`docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md` §3.1), trouvé
uniquement par `npm run typecheck` après le retrait de `'pending'` du type. Puisqu'aucun
membre ne peut plus jamais être `pending`, ce code devenait strictement inatteignable —
retiré (les deux `.push(...)` conditionnels et la variable `pendingMembers`), plutôt que
conservé comme code mort silencieux qui aurait laissé une fonctionnalité « fantôme » (jamais
déclenchée, jamais retirée). Les clés i18n `pendingMember`/`approvalMembership` sont laissées
en l'état dans les fichiers de locale (orphelines mais inoffensives — retirer des clés i18n
existantes n'était pas demandé par le mandat et risquait d'affecter d'autres lectures non
vérifiées ici).

### 5.7 `Vote.result` — régression vérifiée, explicitement préservée

`VoteResult` (`governance.ts`) conserve `'pending'` sans modification. `statusTone.pending`
(`organization-module.tsx`) et la clé i18n `organization.pending` (fr/en) sont **conservées
telles quelles** — elles restent nécessaires à l'affichage de `Vote.result === 'pending'`
(`organization-module.tsx`, colonne « Résultat » de l'écran Votes). Aucun refactor de
`statusTone` n'a été nécessaire : depuis que `MemberStatus` n'inclut plus `'pending'` au
niveau du type, `member.status` ne peut structurellement plus jamais valoir `'pending'` — la
séparation entre les deux domaines est donc garantie par le système de types lui-même, sans
avoir besoin de scinder la structure `statusTone` partagée. Un test dédié
(`organization.service.test.ts`, describe « Vote.result REGRESSION ») confirme qu'un nouveau
vote démarre toujours à `result: 'pending'`.

### 5.8 Tests

`organization.service.test.ts` :
- « ALLOW: the 4 canonical values all function correctly » (active/inactive/suspended/exited
  enchaînés sur un même membre créé pour le test, historique vérifié).
- « MIGRATION (D-MEM-04): M-004... » — confirme `status: 'active'` et l'absence de toute
  trace `'pending'` dans `statusHistory`.
- « Vote.result REGRESSION » — confirme `createVote` démarre toujours à `'pending'`.

`eligibility.service.test.ts` (2 tests réécrits, décrits en détail ci-dessous — même
propriété testée, sans dépendre du vocabulaire retiré) :
- « reflects a status change only from the date it was recorded » : reconstruite avec une
  transition `active → suspended` sur `M-004` (au lieu de `pending → active`).
- « eligibility uses the historized status at the meeting date, not the member's current
  status » : reconstruite sur `M-007` (`active → suspended`), prouvant la même propriété
  (le statut historisé à la date de la réunion prévaut sur le statut courant) sans dépendre
  du fallback vers `'pending'` qui n'existe plus.

---

## 6. User vs Member

Aucune modification. Vérifié à nouveau (relecture de `SystemUser`, `user.service.ts`,
`Member`, `organization.service.ts`) : aucune relation `userId`/`memberId` n'existe entre les
deux types, aucune des 4 décisions n'introduit de couplage. `createdBy`/`updatedBy` sur
`Member` continuent de référencer `SystemUser.id` comme identité de l'acteur système ayant
effectué l'action — une donnée d'audit, pas une fusion des deux modèles (déjà testé, non
modifié). Test dédié conservé et toujours vert : « Member has no userId field and SystemUser
has no memberId field ».

## 7. Tenant isolation

`createMember`/`updateMember`/`findMemberDuplicate` restent strictement tenant-scopés pour
`phone`/`email`/identité (inchangé) ; `matricule` **rejoint** ce même modèle d'isolation par
D-MEM-03 (auparavant seul champ à vérification globale). Le tenant n'est toujours pas un champ
éditable dans le formulaire de création (déjà corrigé lors d'un mandat précédent, reconfirmé
inchangé ici — aucun sélecteur de tenant dans `MemberFormFields`).

## 8. Fiscal Year compatibility

Confirmé, inchangé : aucune des 4 décisions n'introduit de couplage entre `Member` et
`FiscalYear`. La migration `PENDING → ACTIVE` ne crée ni ne déplace aucun `Member` — `M-004`
reste le même enregistrement, même `id`, même `tenantId`, même `uuid`.

## 9. Données migrées

| Membre | Avant | Après |
|---|---|---|
| `M-004` (Ousmane Fall, `T-004`) | `status: 'pending'`, `statusHistory: [{status:'pending', since:'2024-02-15'}]`, `version: 1` | `status: 'active'`, `statusHistory: [{status:'active', since:'2024-02-15'}]`, `version: 2`, `updatedAt: '2026-08-18T00:00:00.000Z'` |

Aucun autre membre de seed (`M-001`, `M-002`, `M-003`, `M-005` à `M-008`) n'était `pending` —
non affectés.

## 10. Fichiers créés

```
docs/P1_MEMBERS_USERS_IMPLEMENTATION_REPORT.md   (ce rapport)
```

## 11. Fichiers modifiés

```
src/mocks/organization/members.ts           (MemberStatus, migration M-004, commentaires D-MEM-02/04)
src/mocks/organization/governance.ts        (commentaire — référence croisée D-MEM-02)
src/services/organization.service.ts        (D-MEM-03 : matricule tenant-scoped)
src/services/organization.service.test.ts   (D-MEM-03 + D-MEM-04 : tests réécrits/ajoutés)
src/services/eligibility.service.test.ts    (D-MEM-04 : tests reconstruits sans dépendance à 'pending')
src/services/dashboard.service.ts           (D-MEM-04 : retrait du code mort 'pendingMember'/'approvalMembership')
src/features/organization/organization-module.tsx (D-MEM-04 : formulaire, filtre, compteur)
```

## 12. Fichiers supprimés

Aucun.

## 13. Tests

| Commande | Résultat |
|---|---|
| Tests ciblés D-MEM-03/04 | ✅ 15 tests ajoutés/réécrits, tous passants |
| `npm test` (suite complète) | ✅ **324/324** |

## 14. Typecheck / lint / i18n / build

| Commande | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur (1 erreur trouvée et corrigée en cours de route : `dashboard.service.ts`, §5.6) |
| `npm run lint` | ✅ 0 erreur (15 warnings pré-existants, sans rapport avec ce mandat) |
| `npm run i18n:check` | ✅ 2/2 (parité FR/EN) |
| `npm run build` | ✅ build production réussi |

## 15. `tanzen-commercial`

**NON TOUCHÉ.** `git status --short` confirmé vide dans ce dépôt après implémentation.

## 16. `tanzen-mobile`

**NON TOUCHÉ.** `git status --short` confirmé — seules des modifications préexistantes,
sans rapport avec ce mandat, y figurent (`app/index.tsx`, 2 documents non suivis d'un mandat
antérieur).

## 17. Risques / MODEL GAP éventuels

- **D-MEM-01** : `MODEL_GAP` assumé — aucune persistance de photo réelle tant qu'un service de
  stockage objet dédié n'est pas construit (hors périmètre de ce mandat, explicitement interdit
  d'inventer).
- **Clés i18n orphelines** : `pendingMember`/`approvalMembership` (dashboard) restent définies
  dans les locales mais ne sont plus jamais utilisées après le retrait du code mort (§5.6) —
  signalé, non nettoyé (retrait de clés i18n non demandé par le mandat, risque de toucher
  d'autres écrans non vérifiés ici sans certitude suffisante).
- **`statusTone`/i18n `pending` partagés avec Vote** : intentionnellement conservés — tout futur
  retrait de la valeur `pending` de `VoteResult` (hors périmètre de ce mandat) devrait revérifier
  ces deux points avant suppression.
- Aucun autre risque identifié — régression complète au vert, 324/324 tests.

## 18. Conclusion

Les 4 décisions du Decision Gate sont implémentées fidèlement : D-MEM-02 et D-MEM-03 sans
écart avec la décision PO, D-MEM-04 avec la migration exacte demandée
(`PENDING → ACTIVE`, non réinterprétée) et une découverte réelle (dashboard.service.ts)
traitée par retrait plutôt que par contournement, D-MEM-01 correctement documenté comme
`MODEL GAP` plutôt que simulé. Aucune architecture parallèle créée, aucun pattern existant
dupliqué, aucune régression introduite (324/324 tests, build/lint/typecheck/i18n au vert).
`tanzen-commercial` et `tanzen-mobile` non touchés. Aucun commit, aucun push.

---

## Statut final

```
D-MEM-01 : MODEL GAP documenté (photo, infrastructure absente, non inventée)
D-MEM-02 : IMPLÉMENTÉ (convention explicite, aucun changement de comportement)
D-MEM-03 : IMPLÉMENTÉ (matricule tenant-scoped, 7 tests)
D-MEM-04 : IMPLÉMENTÉ (PENDING → ACTIVE, 8 tests, découverte dashboard.service.ts corrigée)

Fichiers modifiés : 7
Fichiers créés     : 1 (ce rapport)
Fichiers supprimés : 0

Typecheck : ✅ 0 erreur
Lint      : ✅ 0 erreur
i18n      : ✅ 2/2
Tests     : ✅ 324/324
Build     : ✅ réussi

tanzen-commercial : NON TOUCHÉ
tanzen-mobile     : NON TOUCHÉ

Commit : AUCUN
Push   : AUCUN
```
