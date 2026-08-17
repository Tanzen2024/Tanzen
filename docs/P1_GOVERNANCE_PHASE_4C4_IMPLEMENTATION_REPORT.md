# TANZEN — P1 Governance — Phase 4C-4 — Implementation Report

General Assembly — IMPLEMENTATION GO exécuté sur `tanzen-frontend` uniquement, conformément aux 10 décisions PO validées (`docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md`). `tanzen-mobile`, `tanzen-commercial` et le Backend n'ont pas été touchés. Aucun commit, aucun push.

---

## 1. Résultat

**IMPLEMENTATION = TERMINÉE** (10/10 décisions implémentées ; 3 points explicitement signalés comme non déterminés, cf. §11 — conformes au mandat, pas des lacunes d'implémentation).

## 2. Décisions implémentées

| Décision | Choix validé | Statut |
|---|---|---|
| D-4C4-WEB-01 | Option B — Meeting.type remplace GeneralAssembly | ✅ Implémenté (mock migré, service repointé, UI adaptée) |
| D-4C4-WEB-02 | Option A — REGULAR / GENERAL_ASSEMBLY, défaut REGULAR | ✅ Implémenté |
| D-4C4-WEB-03 | Option D — Historisation + règle d'éligibilité AG | ✅ Implémenté (`statusHistory`, `eligibility.service.ts`) |
| D-4C4-WEB-04 | Option C — Seuil configurable (type/valeur) | ✅ Implémenté (`quorum.service.ts`) |
| D-4C4-WEB-05 | Option A — QuorumSnapshot persistant, UNIQUE(meeting_id) | ✅ Implémenté |
| D-4C4-WEB-06 | Option A — AssemblyDecision liée à Meeting, lifecycle complet | ✅ Implémenté |
| D-4C4-WEB-07 | Option C — Vote.meetingId → Meeting.id | ✅ Implémenté |
| D-4C4-WEB-08 | Option A (variante) — Vote.assemblyDecisionId + meetingId | ✅ Implémenté, intégrité forcée structurellement |
| D-4C4-WEB-09 | Option B — pas de tenant_id sur AssemblyDecision | ✅ Implémenté |
| D-4C4-WEB-10 | Modèle étendu VoteOption/MemberVote | ✅ Implémenté |

## 3. Fichiers créés

```
src/mocks/organization/quorum-snapshots.ts
src/mocks/organization/assembly-decisions.ts
src/mocks/organization/vote-options.ts
src/mocks/organization/member-votes.ts
src/services/eligibility.service.ts
src/services/quorum.service.ts
src/services/assembly-decision.service.ts
src/services/decision-vote.service.ts
src/services/eligibility.service.test.ts
src/services/quorum.service.test.ts
src/services/assembly-decision.service.test.ts
src/services/decision-vote.service.test.ts
docs/P1_GOVERNANCE_PHASE_4C4_IMPLEMENTATION_REPORT.md (ce rapport)
```

## 4. Fichiers modifiés

```
src/mocks/organization/governance.ts       (Meeting.type/description, Vote.meetingId/assemblyDecisionId, migration MT-005/006/007)
src/mocks/organization/members.ts          (MemberStatusHistoryEntry, statusHistory)
src/mocks/organization/index.ts            (exports mis à jour)
src/services/organization.service.ts       (createMember/updateMember historisent status, createMeeting force type=REGULAR, createVote force meetingId=null)
src/services/general-assembly.service.ts   (réécrit intégralement — opère sur Meeting(type=GENERAL_ASSEMBLY))
src/services/general-assembly.service.test.ts (réécrit — données migrées, nouveau test de cycle de vie hérité)
src/services/organization.service.test.ts  (tests Meeting.type ajoutés)
src/services/query-keys.ts                 (clés quorumSnapshot/assemblyDecisions/decisionVotes/voteOptions/memberVotes)
src/features/organization/organization-module.tsx (imports, GeneralAssemblyDetail étendu, QuorumCard, AssemblyDecisionsCard, DecisionVotesPage, DecisionVoteCard, route)
src/locales/en/index.ts, src/locales/fr/index.ts (clés quorum/decision/vote)
```

## 5. Fichiers supprimés

```
src/mocks/organization/general-assemblies.ts (D-4C4-WEB-01 — entité autonome retirée ; les 3 enregistrements GA-001..003 ont été migrés vers meetings avant suppression, voir §13)
```

## 6. Migrations

Aucune migration DB au sens strict (projet mock, pas de SQL) — extensions de type TypeScript + mock arrays, listées en §3/§4. `QuorumSnapshot`/`AssemblyDecision`/`VoteOption`/`MemberVote` démarrent vides (`[]`) ; `Meeting`/`Member`/`Vote` étendus de champs additionnels avec valeurs migrées/par défaut pour tous les enregistrements existants (aucun champ `undefined`).

## 7. Services / repositories

`eligibility.service.ts`, `quorum.service.ts`, `assembly-decision.service.ts`, `decision-vote.service.ts` créés. `general-assembly.service.ts` réécrit (opère sur `meetings` filtré par `type`). `organization.service.ts` étendu (historisation Member, `type`/`description` sur Meeting, `meetingId`/`assemblyDecisionId` sur Vote). Aucune architecture parallèle — tous suivent le pattern déjà établi (`mockRequest`, `getTenantScoped`, isolation indirecte via Meeting pour les entités sans `tenantId` propre).

## 8. Routes / UI

Route ajoutée : `governance/general-assemblies/:meetingId/decisions/:decisionId/votes` (`PermissionRoute permission="governance.read"`). Aucune route retirée — `governance/general-assemblies*` conservées, désormais backées par `Meeting`. `GeneralAssemblyDetail` étendu avec `QuorumCard` (calcul/figeage) et `AssemblyDecisionsCard` (liste + création + transitions de cycle de vie + lien vers la gestion des votes). Nouvelle page `DecisionVotesPage` + `DecisionVoteCard` (création de Vote avec options libres, casting nominatif par membre, pattern repris de `MeetingAttendancePage`). Aucune entrée de navigation ajoutée (cohérent avec la convention déjà établie en Phase 4C-3 : les pages enfants de Meeting ne sont jamais dans l'arbre de navigation principal).

## 9. Tests

**Ajoutés** : `eligibility.service.test.ts` (7 tests), `quorum.service.test.ts` (6 tests), `assembly-decision.service.test.ts` (13 tests), `decision-vote.service.test.ts` (12 tests).

**Modifiés** : `general-assembly.service.test.ts` (réécrit pour les données migrées + 1 test de cycle de vie hérité, désormais possible), `organization.service.test.ts` (+2 tests Meeting.type).

**Couverture des scénarios requis par le mandat (§28)** :
- Meeting.type : REGULAR par défaut, GENERAL_ASSEMBLY via `generalAssemblyService`.
- Migration GeneralAssembly : `getGeneralAssembly('T-001','MT-005')` retourne les données migrées de `GA-001` avec toutes leurs valeurs préservées (voir aussi `docs/PHASE_4C4_GENERAL_ASSEMBLY_MEETING_TYPE_IMPACT_AUDIT.md`).
- Tenant isolation : testée explicitement pour chaque nouvelle entité (`QuorumSnapshot`, `AssemblyDecision`, `Vote`/`VoteOption`/`MemberVote`) — cross-tenant refusé à chaque niveau.
- AssemblyDecision : création, 4 transitions valides, 2 refus d'état terminal (DECIDED/CANCELLED), refus de saut d'état (DRAFT→VOTING direct).
- QuorumSnapshot : calcul, figeage, `UNIQUE(meeting_id)` (second appel refusé, valeurs du premier snapshot préservées), refus sans seuil valide.
- Vote/AssemblyDecision : test explicite du rejet cross-tenant (`Vote(Meeting A) + Decision(Meeting B)` structurellement impossible — `meetingId` toujours dérivé de la Decision, jamais fourni par l'appelant, donc la violation ne peut littéralement pas se produire plutôt que d'être seulement détectée après coup).
- VoteOption : création, rattachement au Vote.
- MemberVote : création, `UNIQUE(vote_id, member_id)` — premier vote accepté, second explicitement rejeté (pas d'upsert).
- Eligibility : `getMemberStatusAt` testé sur historique à une/plusieurs entrées ; `isMemberEligibleForGeneralAssembly` testé pour tous les cas (tenant mismatch × 2, actif/inactif/suspendu, changement de statut avant/après la date de réunion).

**Exécution** : `npm run test` → 26 fichiers / **260 tests passants** (0 échec). `npm run typecheck` → 0 erreur. `npm run lint` → 0 erreur (14 warnings préexistants, fichiers non touchés). `npm run i18n:check` → aucune clé fr sans équivalent en. `npm run build` → succès.

## 10. Lint / Typecheck

✅ Les deux passent sans erreur (détail §9).

## 11. Points non déterminés

Conformes au mandat de clôture (`docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` §8) — **non inventés** :

1. **Critères d'éligibilité** : seul critère implémenté = tenant + statut `active` historisé à la date de la réunion (`eligibility.service.ts`). Aucune durée minimale d'adhésion, cotisation, ancienneté, âge ou autre critère — non spécifiés par aucune source, point d'extension isolé pour une future règle validée.
2. **Valeur du quorum** : le mécanisme (`quorumThresholdType`/`quorumThresholdValue`) est implémenté et configurable ; aucune valeur numérique par défaut n'existe dans le code — l'appelant (UI) doit toujours la fournir explicitement, sans quoi le calcul est refusé (`computeAndFreezeQuorumSnapshot` retourne `null`).
3. **Valeurs de VoteOption** : aucune liste universelle (`POUR`/`CONTRE`/`ABSTENTION`) n'est codée en dur — chaque `Vote` définit ses propres options via un champ de saisie libre (séparées par des virgules dans l'UI actuelle).

## 12. Compatibilité

    tanzen-mobile = NON MODIFIÉ
    tanzen-commercial = NON MODIFIÉ

## 13. Données existantes

**Migration réussie, aucune perte.** Les 3 `GeneralAssembly` mock (`GA-001..003`) ont été converties en `Meeting(type=GENERAL_ASSEMBLY)` avant suppression du fichier source :

| Ancien | Nouveau | Champs préservés |
|---|---|---|
| `GA-001` (T-001, « Assemblée Générale Ordinaire 2026 », 2026-06-15, COMPLETED) | `MT-005` | title, assemblyDate→date, description, status (vocabulaire identique) |
| `GA-002` (T-001, « ... Budget Q4 », 2026-11-20, PLANNED) | `MT-006` | idem |
| `GA-003` (T-002, « ... Horizon 2026 », 2026-07-10, ONGOING, description `null`) | `MT-007` | idem, `description: null` préservé tel quel |

Vérifié par test (`general-assembly.service.test.ts`, « ALLOW: getGeneralAssembly returns the migrated MT-005... »). Les 4 `Meeting` REGULAR préexistants (`MT-001..004`) reçoivent `type: 'REGULAR'`, `description: null` — aucune donnée perdue, extension additive pure. Les 5 `Vote` préexistants (`V-001..005`, non rattachés à une assemblée par aucune source) conservent toutes leurs valeurs, avec `meetingId`/`assemblyDecisionId` à `null` (non migrés rétroactivement, faute de mapping démontrable — signalé, pas inventé).

## 14. Git

    Aucun commit
    Aucun push

---

## Notes d'implémentation complémentaires

### Amélioration fonctionnelle directe de l'unification (D-4C4-WEB-01)

Une General Assembly bénéficie désormais gratuitement du cycle de vie complet de `Meeting` (`startMeeting`/`completeMeeting`/`cancelMeeting`) — capacité qui n'existait pas sur l'ancienne entité autonome (Create+Read seulement, explicitement NO-GO en Phase 4C-3 antérieure). Testé explicitement.

### Interprétation signalée — immutabilité étendue implicitement

Aucune règle explicite d'immutabilité n'a été demandée pour `QuorumSnapshot` au-delà du figeage `UNIQUE(meeting_id)` lui-même (un second calcul est structurellement impossible, pas une valeur modifiable après coup) — cohérent avec le mandat §11 (« Une fois frozen... ne doivent plus être modifiables »), satisfait par construction puisqu'aucune méthode `updateQuorumSnapshot` n'existe.

### RBAC — aucune permission créée

Mapping des nouvelles actions sur le catalogue existant, par cohérence avec le pattern déjà établi (Meeting/Attendance) :

| Action | Permission |
|---|---|
| Calculer/figer le quorum | `governance.approve` (consequential/irréversible) |
| Créer une AssemblyDecision | `governance.create` |
| Transitions de cycle de vie (submit/startVoting/decide/cancel) | `governance.approve` |
| Créer un Vote pour une Decision | `governance.create` |
| Caster un MemberVote | `governance.create` |

Aucune permission `assembly.*`/`vote.*`/`decision.*` créée.

### Tenant isolation — mécanisme uniforme

`QuorumSnapshot`/`AssemblyDecision`/`VoteOption`/`MemberVote` n'ont aucun `tenantId` propre — isolation garantie exclusivement par remontée vers `Meeting.tenantId` (via `getTenantScoped` sur `meetings`), jamais par simple présence d'une FK brute. `Vote.assemblyDecisionId` → l'intégrité `Vote.meetingId === AssemblyDecision.meetingId` est appliquée en dérivant systématiquement `meetingId` depuis la `AssemblyDecision` elle-même à la création — rendant la violation structurellement impossible plutôt que simplement détectée après coup.
