# P1 GOVERNANCE — PHASE 4C-4
# GENERAL ASSEMBLY
# DECISION GATE CLOSURE

**Statut : MISSION DOCUMENTATION / GOVERNANCE — AUCUNE IMPLÉMENTATION.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. Aucune migration, table, colonne, relation, permission, service, repository, route, écran n'a été créé. `tanzen-mobile`, `tanzen-commercial` et le Backend n'ont pas été touchés. Aucun commit, aucun push. Cette mission ne donne **aucun** GO d'implémentation — celui-ci fait l'objet d'un mandat séparé, « IMPLEMENTATION GO — PHASE 4C-4 », non commencé.

---

## 1. Conclusion exécutive

**10 / 10 décisions PO validées.**

**Decision Gate = CLOSED.**

**Implementation GO = NON DÉMARRÉE.**

Les 10 décisions formalisées dans `docs/P1_GOVERNANCE_PHASE_4C4_PO_DECISION_VALIDATION.md` sont désormais validées par le PO et mises à jour dans ce document (statuts passés de `🟠 EN ATTENTE DE VALIDATION PO` à `🟢 VALIDÉE`, options cochées, choix explicités). Le couplage D-4C4-WEB-01 ↔ D-4C4-WEB-07, signalé comme point de vigilance par le Decision Gate initial (`docs/P1_GOVERNANCE_PHASE_4C4_WEB_DECISION_GATE.md`), est résolu de façon cohérente : `GeneralAssembly` est migrée vers `Meeting.type` (Option B) et `Vote` est rattaché via `meeting_id` (Option C) — les deux décisions convergent sur la même architecture, sans contradiction résiduelle entre elles.

## 2. Décisions validées

| ID | Sujet | Choix retenu | Règle résultante | Impact architectural |
|---|---|---|---|---|
| D-4C4-WEB-01 | Migration GeneralAssembly | Option B | `GeneralAssembly` cesse d'être une entité autonome ; une AG = `Meeting(type=GENERAL_ASSEMBLY)` | Retrait futur de `general-assemblies.ts`/`general-assembly.service.ts`/3 routes/UI/12 tests/8 clés i18n, non réalisé par cette clôture |
| D-4C4-WEB-02 | Meeting.type | Option A | `Meeting.type ∈ {REGULAR, GENERAL_ASSEMBLY}`, défaut `REGULAR` | Extension additive de `Meeting`, préalable technique aux autres décisions |
| D-4C4-WEB-03 | Eligibility | Option D | Historisation `Member` + règle explicite d'éligibilité AG | Critères métier détaillés non définis — voir §8 |
| D-4C4-WEB-04 | Quorum | Option C | Seuil configurable : `quorum_threshold_type` (`PERCENTAGE`\|`COUNT`) + `quorum_threshold_value` | Aucune valeur numérique de seuil décidée — voir §8 |
| D-4C4-WEB-05 | QuorumSnapshot | Option A | Entité persistante rattachée à `Meeting`, `UNIQUE(meeting_id)` | Figeage du résultat de quorum à la clôture, indépendant de toute évolution ultérieure de `Member` |
| D-4C4-WEB-06 | AssemblyDecision | Option A | Liée directement à `Meeting` (`1..N` par AG), lifecycle `DRAFT→SUBMITTED→VOTING→DECIDED` | `Meeting(type=GENERAL_ASSEMBLY)` peut porter plusieurs décisions distinctes |
| D-4C4-WEB-07 | Vote FK | Option C | `Vote.meeting_id → Meeting.id` | Options dictionnaire (`assembly_id→assemblies.id`) et rang 2 (`assembly_id→general_assemblies.id`) écartées — désalignement documentaire à traiter séparément, voir §9 |
| D-4C4-WEB-08 | Decision → Vote | Option A (variante) | `Vote.assembly_decision_id → AssemblyDecision.id` **et** `Vote.meeting_id → Meeting.id` conservés simultanément, avec `Vote.meeting_id = AssemblyDecision.meeting_id` | Intégrité référentielle à appliquer applicativement lors de l'implémentation |
| D-4C4-WEB-09 | tenant_id AssemblyDecision | Option B | Pas de `tenant_id` sur `AssemblyDecision` — dérivé de `Meeting` | Cohérent avec le pattern déjà validé pour `Attendance` (Phase 4C-3) |
| D-4C4-WEB-10 | VoteOption / MemberVote | Modèle étendu | `VoteOption{id, vote_id, code, label, display_order, created_at}` ; `MemberVote{id, vote_id, member_id, vote_option_id, voted_at, created_at, updated_at}` ; `UNIQUE(vote_id, member_id)` | Extension du schéma dictionnaire (ajout `code`/`display_order`/`updated_at`), pas une adoption littérale |

## 3. Architecture cible finale

```
Meeting
  |
  +-- Attendance
  |
  +-- QuorumSnapshot
  |
  +-- AssemblyDecision
          |
          +-- Vote
                |
                +-- VoteOption
                |
                +-- MemberVote
```

`Meeting.type ∈ {REGULAR, GENERAL_ASSEMBLY}`. `Attendance` est commune aux deux types (aucun changement requis, Phase 4C-3). `QuorumSnapshot`, `AssemblyDecision`, `Vote`, `VoteOption`, `MemberVote` sont spécifiques au cas `GENERAL_ASSEMBLY` — rien n'empêche structurellement qu'ils restent vides/absents pour un `Meeting(type=REGULAR)`.

## 4. Règles structurantes

- `GeneralAssembly` n'est plus une entité cible autonome (D-4C4-WEB-01).
- `Meeting.type` distingue `REGULAR` et `GENERAL_ASSEMBLY` (D-4C4-WEB-02).
- `AssemblyDecision` dépend de `Meeting` via `meeting_id`, sans `tenant_id` propre (D-4C4-WEB-06, D-4C4-WEB-09).
- `Vote` dépend de `Meeting` via `meeting_id` (D-4C4-WEB-07).
- `Vote` dépend également d'`AssemblyDecision` via `assembly_decision_id` (D-4C4-WEB-08).
- `Vote.meeting_id = AssemblyDecision.meeting_id` — contrainte d'intégrité croisée (D-4C4-WEB-08).
- Le tenant d'`AssemblyDecision` est dérivé de `Meeting`, jamais stocké directement (D-4C4-WEB-09).
- `QuorumSnapshot` est persistant, un seul par `Meeting` (`UNIQUE(meeting_id)`, D-4C4-WEB-05).
- `MemberVote` est unique par couple `(vote_id, member_id)` (D-4C4-WEB-10).
- L'éligibilité combine historisation du membre et règle d'éligibilité AG explicite (D-4C4-WEB-03).
- Le quorum utilise un seuil configurable (`quorum_threshold_type`/`quorum_threshold_value`), pas une valeur figée dans le code (D-4C4-WEB-04).

## 5. Modèles validés

**AssemblyDecision** :
```
id, meeting_id, decision_number, title, description, status,
created_by, created_at, updated_at, submitted_at, decided_at
```
(pas de `tenant_id` — D-4C4-WEB-09)

**QuorumSnapshot** :
```
id, meeting_id, eligible_member_count, present_member_count,
quorum_threshold_type, quorum_threshold_value, quorum_reached,
frozen_at, created_at
```
Contrainte : `UNIQUE(meeting_id)`.

**VoteOption** :
```
id, vote_id, code, label, display_order, created_at
```

**MemberVote** :
```
id, vote_id, member_id, vote_option_id, voted_at, created_at, updated_at
```
Contrainte : `UNIQUE(vote_id, member_id)`.

**Vote** (extension du modèle actuel, non détaillée champ par champ par les 10 décisions au-delà des FK) :
```
Vote.meeting_id           → Meeting.id
Vote.assembly_decision_id → AssemblyDecision.id
```

## 6. Lifecycle AssemblyDecision

```
DRAFT
  ↓
SUBMITTED
  ↓
VOTING
  ↓
DECIDED
```

Annulation : `DRAFT → CANCELLED`, `SUBMITTED → CANCELLED`. États terminaux : `DECIDED`, `CANCELLED` — aucune transition sortante depuis ces deux états. Ce cycle de vie n'était pas défini par le Decision Gate initial (qui signalait l'absence de toute énumération de `status` pour `AssemblyDecision`) ; il est désormais validé et clôt ce point.

## 7. Décisions héritées Phase 4C-3

**Meeting.status** — `PLANNED → ONGOING → COMPLETED` (terminal), annulation possible depuis `PLANNED`/`ONGOING` vers `CANCELLED` (terminal). Déjà validé et implémenté (`src/services/organization.service.ts`). **Non rouvert par cette clôture.**

**Attendance** — `meeting_id`/`member_id`, `UNIQUE(meeting_id, member_id)`, immutabilité après clôture, idempotence (`operationId`), isolation tenant indirecte via `Meeting`. Déjà validé et implémenté (`src/mocks/organization/attendances.ts`, `src/services/attendance.service.ts`). **Non rouvert par cette clôture.** Ces deux fondations restent hors du périmètre du Decision Gate Phase 4C-4 — elles ont simplement été vérifiées comme compatibles avec l'architecture General Assembly (aucun changement requis).

## 8. Points qui restent à préciser (ne bloquent pas la fermeture)

Ces points ne remettent pas en cause la fermeture du Decision Gate — ils sont des détails d'implémentation à formaliser explicitement au lancement du mandat IMPLEMENTATION GO, pas de nouvelles décisions architecturales :

1. **Eligibility (D-4C4-WEB-03)** : les critères métier détaillés de la règle d'éligibilité AG (quels champs exacts historiser sur `Member`, quelles transitions déclenchent un enregistrement, quel mécanisme précis de calcul) ne sont pas définis par la validation du principe « historisation + règle ».
2. **Quorum (D-4C4-WEB-04)** : le mécanisme est configurable (`quorum_threshold_type`/`quorum_threshold_value`), mais aucune valeur numérique de seuil n'est validée — ni pourcentage, ni nombre fixe.
3. **VoteOption (D-4C4-WEB-10)** : les valeurs concrètes des options de vote (ex. si `POUR`/`CONTRE`/`ABSTENTION` doivent exister par défaut, ou si chaque `Vote` définit librement ses options) ne sont pas figées par cette décision — représentées au cas par cas par des enregistrements `VoteOption`, sans liste universelle imposée.

## 9. Point de vigilance documentaire (non bloquant)

D-4C4-WEB-07 (`Vote.meeting_id → Meeting.id`) met `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2, ligne 102 : `FK_assembly_id → general_assemblies(id)`) et le dictionnaire canonique (rang 6, fiche #40 : `assembly_id → assemblies.id`) en décalage avec le modèle désormais validé. Ce Decision Gate formalise la décision produit ; il ne modifie pas ces documents sources — une mise à jour de `PHASE_02_MODELE_CANONIQUE_FINAL.md` reste recommandée séparément pour que ce document continue de jouer son rôle de référence unique en cas de divergence future, mais n'est pas réalisée par cette mission (portée strictement documentaire de clôture, pas une correction des sources canoniques elles-mêmes).

## 10. Ce qui n'est PAS autorisé par cette clôture

La fermeture du Decision Gate **ne constitue pas** une Implementation GO. Elle ne permet pas encore de :

- créer les migrations ;
- modifier `Meeting` (ajout de `type`) ;
- créer `AssemblyDecision` ;
- créer `QuorumSnapshot` ;
- créer/modifier `Vote` (ajout de `meeting_id`/`assembly_decision_id`) ;
- créer `VoteOption` ;
- créer `MemberVote` ;
- supprimer `GeneralAssembly` ;
- modifier les routes, services, repositories ;
- modifier le Backend ;
- modifier `tanzen-mobile`.

La prochaine étape est un mandat séparé, explicitement demandé : **IMPLEMENTATION GO — PHASE 4C-4**.

## 11. Impact Mobile

`tanzen-mobile` = **NON MODIFIÉ**. Aucune implémentation Mobile n'est engagée par cette clôture. Le portage Mobile reste traité après stabilisation Web, dans un mandat séparé, conformément à la méthodologie déjà appliquée en Phase 4C-3.

## 12. Impact Commercial

`tanzen-commercial` = **NON MODIFIÉ**. Aucune dépendance fonctionnelle sur ce domaine (confirmé par l'audit d'impact Phase 4C-4).

## 13. Critères de fermeture

    [x] D-4C4-WEB-01 validée
    [x] D-4C4-WEB-02 validée
    [x] D-4C4-WEB-03 validée
    [x] D-4C4-WEB-04 validée
    [x] D-4C4-WEB-05 validée
    [x] D-4C4-WEB-06 validée
    [x] D-4C4-WEB-07 validée
    [x] D-4C4-WEB-08 validée
    [x] D-4C4-WEB-09 validée
    [x] D-4C4-WEB-10 validée

**DECISION GATE = CLOSED.**

## 14. Fichiers modifiés

```
docs/P1_GOVERNANCE_PHASE_4C4_PO_DECISION_VALIDATION.md (mise à jour des 10 décisions :
  statuts, cases cochées, synthèse, critères de fermeture, statut du gate)
```

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C4_DECISION_GATE_CLOSURE.md` (ce rapport).

Aucun autre fichier modifié. `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` inchangés.

## 15. Git

    Aucun commit
    Aucun push
