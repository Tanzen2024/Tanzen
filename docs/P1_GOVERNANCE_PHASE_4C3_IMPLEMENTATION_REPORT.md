# TANZEN — P1 Governance — Phase 4C-3 — Implementation Report

Meetings & Attendances — IMPLEMENTATION GO exécuté sur `tanzen-frontend` uniquement. `tanzen-mobile`, `tanzen-commercial` et le Backend n'ont pas été touchés. Aucun commit, aucun push.

---

## 1. Mandat

Implémenter, sur la base des 7 décisions validées et closes du Decision Gate Phase 4C-3 (`docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md`), le modèle `Meeting` étendu (cycle de vie), l'entité `Attendance` complète (CRUD, immutabilité, idempotence), sans rouvrir aucune des décisions ni en inventer de nouvelles.

## 2. Décisions de référence (contractuelles, non rouvertes)

| Décision | Choix validé | Statut d'implémentation |
|---|---|---|
| D-4C3-WEB-01 — Meeting model | Option C (hybride ciblé) | Implémenté : `status` ajouté, aucun autre champ canonique ajouté |
| D-4C3-WEB-02 — Attendance | Option A (construire maintenant) | Implémenté : type, mock, service, UI, tests |
| D-4C3-WEB-03 — Immutabilité | Option A (immuable après clôture) | Implémenté, étendu explicitement à CANCELLED (voir §7) |
| D-4C3-WEB-04 — Idempotence | Option B (idempotence/upsert) | Implémenté via `operationId` + `UNIQUE(meeting_id, member_id)` |
| D-4C3-TECH-02 — Offline/Outbox | `operation_id` + `UNIQUE(meeting_id, member_id)` | Contrat Web minimal implémenté ; outbox réel Backend/Mobile Pending (voir §14) |
| D-4C3-TECH-01 — Meeting status | PLANNED→ONGOING→COMPLETED, PLANNED/ONGOING→CANCELLED | Implémenté tel quel, transitions protégées au niveau service |
| D-4C3-WEB-05 — RBAC | Conserver les permissions existantes | Respecté : aucune permission créée, `governance.update`/`governance.delete` réutilisées (précédemment mortes) |

## 3. Architecture implémentée

Aucune nouvelle architecture introduite — extension stricte des patterns déjà en place (`mockRequest`, `getTenantScoped`, `useMockMutation`, `PermissionGate`/`PermissionRoute`), inspectés avant toute écriture (`organization.service.ts`, `general-assembly.service.ts`, `loan-rule.service.ts`, `tenant-scope.ts`, `organization-module.tsx`).

## 4. Meeting

`src/mocks/organization/governance.ts` — `Meeting` reçoit `status: MeetingStatus` (`'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'`, même vocabulaire que `GeneralAssemblyStatus` déjà en place). Aucun autre champ canonique (`uuid`, `sync_status`, `version`, timestamps) — conformément au périmètre plafonné de D-4C3-WEB-01. `date`/`agenda` non renommés (`meeting_date`/`description`) — hors périmètre de la décision validée, non touché.

`src/services/organization.service.ts` :
- `createMeeting` : `status` toujours forcé à `PLANNED`, jamais accepté en entrée (même garde que `createGeneralAssembly`).
- `getMeeting` (nouveau) : lecture tenant-scoped d'un Meeting — infrastructure minimale requise pour la page Attendance (aucune page détail Meeting n'existait avant cette mission).
- `startMeeting`, `completeMeeting`, `cancelMeeting` (nouveaux) : transitions de cycle de vie, chacune vérifiant l'état courant avant d'écrire (§6).

4 enregistrements mock existants reçoivent un `status` cohérent avec leur date par rapport à aujourd'hui (2026-08-17) sans autre modification : MT-001/002/003 → `PLANNED` (dates futures), MT-004 → `COMPLETED` (date passée, déjà doté d'un PV).

## 5. Attendance

`src/mocks/organization/attendances.ts` (nouveau) : `Attendance = { id, meetingId, memberId, status: AttendanceStatus, operationId }`. `AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'` (canonique, dictionnaire fiche #19). Volontairement exclus : `uuid`, `created_at`/`updated_at`/`deleted_at` (même convention que `GeneralAssembly`/`LoanRule`), `tenant_id` (absent du modèle canonique — isolation indirecte, §10), `penalty_amount` (tension non résolue avec le modèle transverse `Penalty`, NC-03bis — non couvert par aucune des 5 décisions, donc non ajouté). `operationId` ajouté, hors dictionnaire, justifié par D-4C3-TECH-02.

3 enregistrements mock seedés : deux sur MT-004 (COMPLETED, pour disposer d'un fixture d'immutabilité testable dès le départ) et un sur MT-001 (PLANNED, mutable).

`src/services/attendance.service.ts` (nouveau) : `listAttendancesByMeeting`, `createAttendance`, `updateAttendance`, `deleteAttendance`. Présence nominative sur l'ensemble des membres du tenant — aucune source ne définit de liste d'invités distincte du répertoire Members ; aucune n'a été inventée.

**Suppression** : physique (`splice`), pas de soft-delete — `deletedAt` n'a pas été ajouté au modèle (aucune décision validée ne le justifie ; convention déjà établie de ne pas ajouter un champ sans besoin démontré).

## 6. Status lifecycle (Meeting — D-4C3-TECH-01)

```
PLANNED ──start──> ONGOING ──close──> COMPLETED   (terminal)
   │                   │
   └──────cancel───────┴──cancel──> CANCELLED     (terminal)
```

Transitions protégées **dans le service**, jamais par simple assignation de champ : `startMeeting` exige `status === 'PLANNED'`, `completeMeeting` exige `status === 'ONGOING'`, `cancelMeeting` exige `status ∈ {PLANNED, ONGOING}`. Toute violation (y compris `COMPLETED`/`CANCELLED` → n'importe quoi, ou `PLANNED` → `COMPLETED` directement sans passer par `ONGOING`) retourne `undefined`/`null`, jamais silencieusement acceptée. Testé exhaustivement (§13).

Noms de méthode : `startMeeting`/`completeMeeting`/`cancelMeeting`, suggérés par le mandat et compatibles avec la convention déjà en place (`updateMeetingMinutes`, `endBoardMandate`, `updateVoteResult` — verbe + nom, pas de préfixe générique `update` pour une transition d'état).

## 7. Immutabilité (Attendance — D-4C3-WEB-03)

Règle implémentée dans `attendance.service.ts` (`isMeetingOpen`) : `Attendance` est modifiable (create/update/delete) tant que son `Meeting` est `PLANNED` ou `ONGOING`.

**Interprétation signalée explicitement** (pas silencieuse) : la décision validée ne nomme textuellement que la « clôture » (`COMPLETED`). Cette implémentation étend le verrou à `CANCELLED` également, par cohérence directe avec D-4C3-TECH-01 qui qualifie `COMPLETED` **et** `CANCELLED` de « états terminaux » au même titre. Sans cette extension, un `Attendance` resterait modifiable indéfiniment sur une réunion annulée — un résultat qui contredirait l'intégrité historique motivant D-4C3-WEB-03 en premier lieu. Ce choix est documenté ici pour permettre une correction explicite si le PO souhaite une règle plus étroite (immutabilité sur `COMPLETED` seulement).

Aucun mécanisme de correction exceptionnelle après clôture n'a été construit (conforme au mandat §3 : « NE PAS créer... un mécanisme spécial de correction »).

## 8. Idempotence / Offline-Outbox (D-4C3-WEB-04 / D-4C3-TECH-02)

`createAttendance` : `meetingId`+`memberId` déjà existants →
- même `operationId` que l'enregistrement existant ⇒ retransmission, renvoie l'enregistrement **inchangé** ;
- `operationId` différent ⇒ upsert, `UNIQUE(meeting_id, member_id)` respectée, le `status` est mis à jour, **aucun doublon créé**.

`updateAttendance` applique la même règle d'idempotence par `operationId`.

**Contrat Web minimal, pas d'infrastructure outbox complète** (conforme au mandat §5 : « ne pas inventer une architecture parallèle ») : `src/features/organization/organization-module.tsx` génère un `operationId` (`crypto.randomUUID()`, avec repli si absent) à chaque action utilisateur dans `MeetingAttendancePage`. Il n'y a pas de file d'attente offline, pas de retry automatique, pas de détection réseau — le Web actuel est un client mock toujours "connecté" ; construire un outbox réel aurait été une architecture parallèle non demandée. Le contrat de service (`operationId` obligatoire, upsert idempotent) est néanmoins déjà celui qu'un futur client Mobile/offline devra respecter — voir §14 Backend Pending.

## 9. RBAC

Aucune permission créée. Mapping des actions sur le catalogue `governance.*` existant :

| Action | Permission | Remarque |
|---|---|---|
| Liste/consultation Meetings | `governance.read` | Route désormais gardée (§12 — corrige un gap relevé par l'audit initial) |
| Créer Meeting | `governance.create` | Inchangé |
| Démarrer une réunion (`startMeeting`) | `governance.update` | Réutilise une permission déclarée mais jamais utilisée avant cette mission |
| Clôturer / Annuler une réunion | `governance.approve` | Cohérent avec l'usage déjà établi (publier PV, publier résultat de vote, clôturer un mandat = actions terminales/consécutives) |
| Publier le PV | `governance.approve` | Inchangé |
| Consulter la page Attendance | `governance.read` | Route gardée |
| Créer une Attendance | `governance.create` | — |
| Modifier une Attendance | `governance.update` | Réutilise la permission précédemment morte |
| Supprimer une Attendance | `governance.delete` | Réutilise la permission précédemment morte |

Les deux permissions `governance.update`/`governance.delete`, signalées « jamais référencées » par l'audit read-only initial (`docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` §14.2), sont désormais effectivement utilisées — sans qu'aucune n'ait été créée.

## 10. Tenant isolation

**Meeting** : `tenantId` direct, inchangé, toutes les nouvelles méthodes (`getMeeting`, `startMeeting`, `completeMeeting`, `cancelMeeting`) passent par `getTenantScoped`.

**Attendance** : aucun `tenantId` propre (conforme au modèle canonique — §5). Isolation garantie **indirectement**, jamais par simple présence d'une FK :
- `createAttendance` vérifie `meetingId` via `getTenantScoped(meetings, ...)` **et** `memberId` via un contrôle explicite d'appartenance au tenant (`isMemberOfTenant`) — un `meeting_id` ou un `member_id` d'un autre tenant est toujours refusé.
- `updateAttendance`/`deleteAttendance` résolvent l'attendance via `getAttendanceScoped`, qui retrouve son `Meeting` parent et applique `getTenantScoped` dessus — jamais un accès direct par `id` seul.

## 11. UI/UX

Patterns UX existants réutilisés sans réécriture : `DataTable`, `StatusBadge`, `PermissionGate`, `ConfirmDialog`, `OrganizationPage`. Aucune nouvelle librairie, aucun nouveau design system.

- Table Meetings : nouvelle colonne `status` (`StatusBadge`, tons info/warning/success/error), boutons d'action contextuels (Start/Complete/Cancel selon l'état courant, gardés RBAC), bouton « Gérer les présences ».
- Nouvelle page `MeetingAttendancePage` : liste des membres du tenant, statut de présence actuel par membre (badge ou « Non renseigné »), boutons de saisie par statut (PRESENT/ABSENT/LATE/EXCUSED), bouton de suppression. Contrôles désactivés (`disabled`) **et** service refusant l'écriture (pas seulement les boutons masqués/désactivés — conforme au mandat §14/§18) dès que le Meeting n'est plus ouvert, avec message explicite (`attendanceLocked`).

## 12. Routes

- `governance/meetings` : désormais enveloppée dans `PermissionRoute permission="governance.read"` — corrige le gap relevé par l'audit initial (route auparavant non gardée, contrairement à `general-assemblies`).
- `governance/meetings/:meetingId/attendances` (nouvelle) : `PermissionRoute permission="governance.read"`.
- Aucune entrée de navigation ajoutée (`src/config/navigation.ts` non touché) — Attendance est atteint exclusivement via le bouton contextuel de la liste Meetings, conformément au mandat §17 (« ne pas créer une nouvelle structure de navigation »).

## 13. Tests

`src/services/organization.service.test.ts` (étendu) : `createMeeting` force `PLANNED` ; 4 transitions autorisées testées (`PLANNED→ONGOING→COMPLETED`, `PLANNED→CANCELLED`, `ONGOING→CANCELLED`) ; 2 tests d'états terminaux (`COMPLETED`/`CANCELLED` refusent toute transition sortante) ; 1 test de saut interdit (`PLANNED→COMPLETED` direct) ; isolation tenant sur les 3 nouvelles méthodes ; `getMeeting` ALLOW/DENY.

`src/services/attendance.service.test.ts` (nouveau, 15 tests) : CREATE (succès, refus meeting d'un autre tenant, refus member d'un autre tenant, refus meeting COMPLETED) ; idempotence (retransmission par `operationId`, upsert sur `operationId` différent, `UNIQUE(meeting_id, member_id)` vérifiée par absence de doublon) ; UPDATE (succès, refus autre tenant) ; DELETE (succès, refus autre tenant) ; immutabilité (refus create/update/delete sur meeting COMPLETED ou CANCELLED) ; LIST (isolation tenant).

Isolation tenant testée explicitement pour les 4 scénarios requis par le mandat (§20) : `meetingId` d'un autre tenant, `memberId` d'un autre tenant, consultation/modification/suppression cross-tenant.

## 14. Backend Pending

Ce projet reste un client mock (`mockRequest`, tableaux en mémoire) — aucune persistance réelle, aucune validation serveur, aucun RBAC serveur, aucune API réelle n'existent ni n'ont été ajoutées par cette mission. Explicitement Backend Pending :

- Persistance réelle de `Meeting.status` et `Attendance` (aujourd'hui : mémoire process, perdue au rechargement).
- Validation serveur des transitions de `Meeting.status` et de l'immutabilité `Attendance` (aujourd'hui : uniquement appliquée côté service mock Web).
- RBAC serveur (aujourd'hui : uniquement `PermissionGate`/`PermissionRoute` côté client).
- Isolation tenant au niveau base de données (aujourd'hui : filtrage en mémoire uniquement).
- Le comportement réel de retransmission réseau / résolution de conflit pour l'outbox Mobile (le contrat `operationId` est posé, §8, mais aucune logique de synchronisation réelle n'existe ni côté Web ni côté Mobile).

## 15. Fichiers modifiés

Modifiés :
```
src/mocks/organization/governance.ts        (MeetingStatus, Meeting.status, seed statuses)
src/mocks/organization/index.ts             (export attendances)
src/services/organization.service.ts        (getMeeting, startMeeting, completeMeeting, cancelMeeting, createMeeting status)
src/services/organization.service.test.ts   (tests cycle de vie Meeting)
src/services/query-keys.ts                  (governance.meeting, governance.attendances)
src/features/organization/organization-module.tsx  (colonne/actions status Meeting, MeetingAttendancePage, routes)
src/locales/en/index.ts                     (nouvelles clés)
src/locales/fr/index.ts                     (nouvelles clés)
```

Créés :
```
src/mocks/organization/attendances.ts
src/services/attendance.service.ts
src/services/attendance.service.test.ts
docs/P1_GOVERNANCE_PHASE_4C3_IMPLEMENTATION_REPORT.md (ce rapport)
```

Fichiers déjà modifiés/non suivis avant cette mission (listés par `git status --short` avant exécution, laissés strictement intacts par cette mission au-delà des fichiers ci-dessus) :
```
 M src/config/navigation.ts (non modifié par cette mission)
 M src/features/access/access-module.tsx
 M src/features/auth/login-page.tsx
 M src/features/finance/finance-module.tsx
 M src/features/settings/settings-module.tsx
 M src/features/tontines/tontines-module.tsx
 M src/mocks/access/users.ts
 M src/mocks/finance/index.ts
 M src/mocks/rbac.mocks.ts (non modifié par cette mission — aucune permission créée)
 M src/services/auth.service.test.ts / auth.service.ts / role.service.test.ts / role.service.ts / session.service.test.ts / user.service.test.ts / user.service.ts
 M tsconfig.app.tsbuildinfo (régénéré par typecheck/build — artefact, pas une modification métier)
?? docs/*.md (18 rapports P0/P1 antérieurs)
?? src/mocks/finance/loan-rules.ts, src/mocks/organization/general-assemblies.ts
?? src/services/general-assembly.service.ts/.test.ts, loan-rule.service.ts/.test.ts
```

## 16. Vérifications

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur (14 warnings préexistants, `react-refresh/only-export-components`, dans des fichiers non touchés par cette mission) |
| `npm run test` (vitest, suite complète) | ✅ 22 fichiers / 214 tests passés (4 échecs transitoires de timeout constatés lors d'une première exécution sous forte charge parallèle — confirmés non liés à cette mission : les 4 tests concernés (`i18n.test.ts`, `permission-gate.test.tsx`, `tenant-switcher.test.tsx`) passent systématiquement en isolation ou avec un budget de temps plus large ; aucun ne touche au code modifié par cette mission) |
| `npm run i18n:check` | ✅ Aucune clé fr sans équivalent en |
| `npm run build` | ✅ Build production réussi (avertissement préexistant sur la taille d'un chunk, non lié à cette mission) |

- [x] D-4C3-WEB-01 respectée
- [x] D-4C3-WEB-02 respectée
- [x] D-4C3-WEB-03 respectée
- [x] D-4C3-WEB-04 respectée
- [x] D-4C3-WEB-05 respectée
- [x] D-4C3-TECH-01 respectée
- [x] D-4C3-TECH-02 respectée (contrat Web ; réalisation complète Backend/Mobile Pending, §14)
- [x] aucune nouvelle permission
- [x] aucune modification Mobile
- [x] aucune modification Commercial
- [x] aucune modification Backend
- [x] tenant isolation (testée explicitement §13)
- [x] tests (39 nouveaux/étendus, tous passants)
- [x] build

## 17. Gaps éventuels

1. **Immutabilité étendue à CANCELLED** (§7) — interprétation nécessaire pour combler un silence du mandat, signalée explicitement plutôt qu'appliquée silencieusement. À confirmer par le PO si une politique différente est souhaitée.
2. **Comportement réel des retransmissions Offline/Outbox** — déjà signalé NON CONFIRMÉ par `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` §7 ; cette mission pose le contrat minimal (`operationId`) côté Web sans construire la mécanique réelle de synchronisation, qui reste Backend/Mobile Pending (§14 — cohérent avec le mandat qui l'anticipait déjà).
3. **Transitions de `Meeting.status`** — également déjà signalées NON CONFIRMÉES par le même document ; ce mandat (« D-4C3-TECH-01 ») les a explicitement fournies et elles sont désormais implémentées telles quelles.
4. **Suppression physique (hard-delete) d'Attendance** — pas de `deletedAt`/traçabilité de suppression, faute de décision validée l'exigeant ; à signaler si un besoin d'audit trail apparaît plus tard.

## 18. Git

`git status --short` avant/après cette mission : identique à l'exception des fichiers listés en §15. Aucun commit, aucun push effectués.

## 19. Conclusion

Meeting (cycle de vie complet, transitions protégées) et Attendance (CRUD, immutabilité, idempotence, isolation tenant) sont implémentés dans `tanzen-frontend`, strictement dans le périmètre des 7 décisions validées et closes. Aucune décision rouverte, aucune permission créée, aucune modification hors `tanzen-frontend`. Deux gaps de spécification pré-existaient déjà au Decision Gate (transitions Meeting, retransmissions Offline/Outbox) — le premier est désormais résolu par ce mandat (D-4C3-TECH-01), le second reste un contrat Web minimal en attendant une réalisation Backend/Mobile complète.
