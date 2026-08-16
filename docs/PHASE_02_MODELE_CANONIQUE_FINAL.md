# TANZEN — Phase 02 (verrouillage) : Modèle canonique final

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce document. C'est le seul fichier créé par cette mission. Il consolide `docs/AUDIT_PHASE_01.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md`, `docs/PHASE_02_DECISIONS_A_VALIDER.md` et les 5 décisions du Product Owner données pour cette mission, afin de produire **le document de référence unique** pour toute phase d'implémentation ultérieure. En cas de divergence future, ce document prévaut sur les trois précédents.

## Méthodologie et périmètre

Travail effectué exclusivement dans `tanzen-frontend`. Les décisions ci-dessous combinent :
- les 21 sujets déjà **CANONIQUE**/**NON BLOQUANT** de `PHASE_02_DECISIONS_CANONIQUES.md` (repris sans modification, non redétaillés ici — s'y référer pour l'analyse complète), et
- les 5 sujets qui étaient **À VALIDER**/**BLOQUANT** dans `PHASE_02_DECISIONS_A_VALIDER.md`, désormais **verrouillés** par les 5 décisions du Product Owner fournies dans cette mission (détaillées section « Décisions validées »).

Aucune décision métier n'a été prise par Claude dans ce document au-delà de ce qui était déjà tranché par les phases précédentes ou explicitement fourni par le Product Owner dans cette mission. Là où les décisions du PO laissent un point ouvert (ex. rattachement exact de `TontinePosition`), il est listé tel quel en section « Contradictions restantes », pas résolu par extrapolation.

---

## 1. Entités

### 1.1 Entités canoniques confirmées dans `dictionnaire_donnees.xlsx`

Tenant · Users · Roles · Permissions · Role_permissions · Users_roles · Modules · Members · Meetings · Attendances · Tontines · TontineCycle (`tontine_cycles`) · CycleMember (`cycle_members`) · TontineContribution (`tontine_contributions`) · TontineDraw (`tontine_draws`) · DrawWinner (`draw_winners`) · Positions · BoardMandate (`board_mandates`, fusion `BoardMember`+`Mandate` déjà exécutée) · Accounts · MemberAccount (`member_accounts`) · ContributionRule (`contribution_rules`) · Transaction (`transactions`) · FinancialCategory · LoanPolicy · Loan (`loans`) · Repayment (`repayments`) · LoanGuarantor (`loan_guarantors`) · Penalty (`penalties`) · Workflow · WorkflowRequest · FiscalYear · GeneralAssembly · Vote · VoteOption (`vote_options`) · MemberVote (`member_votes`) · Plans · Subscriptions · Payments · Backups · Audit_logs.

Statut : **EXISTANT**, structure et contraintes vérifiées directement dans le dictionnaire pendant la Phase 2.

### 1.2 Entités désormais verrouillées mais SANS fiche dans le dictionnaire (gap de spécification résiduel)

| Entité | Statut architectural | Statut schéma physique |
|---|---|---|
| `TontinePosition` | **Verrouillée comme entité indépendante** (Décision 2 du PO) | **ABSENTE** de `dictionnaire_donnees.xlsx` — aucune des 59 fiches ne la couvre. À spécifier avant implémentation. |
| `PositionPayment` | **Verrouillée comme entité indépendante**, en relation avec `TontinePosition` (Décision 3 du PO) | **ABSENTE** du dictionnaire, même constat. |

Ce verrouillage clôt la question « entité distincte ou synonyme de `tontine_contributions` ? » laissée ouverte par `PHASE_02_DECISIONS_A_VALIDER.md` (sujets 9-10) — le PO tranche explicitement pour l'indépendance. Ce que le verrouillage ne fournit **pas** : le schéma de champs exact ni le rattachement hiérarchique précis (voir §9 « Contradictions restantes »). `tontine_contributions` reste, elle, pleinement spécifiée et canonique pour son propre usage (cotisation périodique) — les deux entités coexistent, elles ne se substituent pas l'une à l'autre.

### 1.3 Entités hors périmètre de ce verrouillage

`boards` (référencée par `board_mandates.board_id` mais absente des 59 tables), `journals`/`transaction_lines`/`account_balances` (comptabilité en partie double, tranchée non-canonique en Phase 2 sujet 16 — modèle simplifié retenu), les ~35 tables citées uniquement dans les encarts Use Case sans aucune fiche dictionnaire (Risk & Penalty Core détaillé, Document Core, Integration Core, Infrastructure Core — cf. `AUDIT_PHASE_01.md` §3.3). Ces domaines restent différés, non concernés par ce verrouillage.

---

## 2. Relations et cardinalités

### 2.1 Domaine Tontine (verrouillé par Décision 4 du PO)

```
Tenant 1──N Tontine

Tontine 1──N TontineCycle (tontine_cycles.id — jamais "cycles.id")
                    │
                    ├──N CycleMember (member_id → Member)
                    ├──N TontineContribution (member_id → Member, payment_method, status)
                    └──N TontineDraw (draw_type, status)
                              │
                              └──N DrawWinner (1 gagnant par tirage COMPLETED)
```

Contrainte explicite du PO : toute relation de cycle doit référencer `tontine_cycles.id` ; l'ancienne entité concurrente `cycles` (anomalie historique du dictionnaire, déjà corrigée — cf. `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18i) ne doit jamais être réintroduite.

**`TontinePosition`/`PositionPayment` (Décisions 2-3 du PO)** : verrouillées comme entités indépendantes, non fusionnées avec `TontineContribution`. **Rattachement verrouillé** (décision du PO, précisant la Décision 4) : `TontinePosition` se rattache directement à `Tontine`, **pas** à `TontineCycle` — cohérent avec les séquences DSEQ_Achats_tontines/DSEQ_TONTINE_DRAW_ENGINE (`Member → Tontine → TontinePosition`).

```
Tontine 1──N TontinePosition ──N PositionPayment
```

Le rattachement de `TontinePosition` est désormais tranché (voir ci-dessus) : `Tontine → TontinePosition` directement, pas `TontineCycle → TontinePosition`. Une conséquence à noter pour le moteur de tirage (§6, workflow 7) : `tontine_draws` est scopé par `cycle_id`, alors que `TontinePosition` est scopée par `tontine_id` — le moteur de tirage devra donc filtrer les positions payées d'une `Tontine` par ce qui est pertinent au cycle en cours (ex. positions non encore consommées par un tirage antérieur), plutôt que par une FK directe `cycle_id` sur `TontinePosition`. Ce point de filtrage reste à spécifier lors de la rédaction du schéma physique (cf. §9).

### 2.2 Domaine Identity / RBAC

```
Tenant 1──N Users
Tenant 1──N Roles 1──N Role_permissions N──1 Permissions (catalogue global, non scopé tenant)
Users N──N Roles (via Users_roles, scopé tenant)
```

`Users` ne porte **aucune colonne `role`** (confirmé Phase 2 sujet 6) — toute résolution d'autorisation passe par `Users_roles → Roles → Role_permissions → Permissions`.

### 2.3 Domaine Gouvernance

```
Tenant 1──N BoardMandate (board_id → boards [TABLE ABSENTE, cf. §9], board_member_id → Member, role: libellé libre)
Tenant 1──N Positions (catalogue de libellés de fonction, indépendant du RBAC)
Tenant 1──N GeneralAssembly 1──N Vote 1──N VoteOption, Vote N──N MemberVote N──1 Member
```

`Positions`/`BoardMandate` (couche gouvernance/affichage) et `Roles`/`Permissions` (couche autorisation RBAC) restent strictement dissociées — aucune FK entre les deux (cf. §5).

### 2.4 Domaine Finance / Crédit

```
Tenant 1──N Member 1──N MemberAccount N──1 Account 1──N Transaction N──1 FinancialCategory
Tenant 1──N Account 1──N ContributionRule
Tenant 1──N Member 1──N Loan N──1 Account
Loan 1──N Repayment
Loan 1──N LoanGuarantor N──1 Member (guarantor)
Tenant 1──N LoanPolicy
```

Pas de `Journal`/`TransactionLine`/`AccountBalance` — modèle simplifié verrouillé (Phase 2 sujet 16), `Account.balance` mis à jour directement par les écritures `Transaction`.

### 2.5 Domaine transverse

```
Penalty : polymorphe via source_module ∈ {TONTINES, LOANS, MEETINGS, DOCUMENTS, SYSTEM} + source_id
Workflow : polymorphe via entity_type texte libre, module ∈ {IDENTITY, GOVERNANCE, TONTINE, ACCOUNTING, CREDIT, RISK, DOCUMENT, COMMUNICATION}
```

---

## 3. Statuts (énumérations canoniques verrouillées)

| Entité.champ | Valeurs canoniques | Origine du verrouillage |
|---|---|---|
| `Member.status` | `ACTIVE, INACTIVE, SUSPENDED, EXITED` | Dictionnaire (Phase 2, sujet 1) |
| `Meeting.status` | `PLANNED, DONE, CANCELLED, POSTPONED` | Dictionnaire (Phase 2, sujet 18a) |
| `Attendance.status` | `PRESENT, ABSENT, LATE, EXCUSED` | Dictionnaire (Phase 2, sujet 18b) |
| `Tontine.status` | `ACTIVE, PAUSED, CLOSED` | Dictionnaire (Phase 2, sujet 18c) |
| **`TontineCycle.status`** | **`DRAFT, OPEN, SUSPENDED, CLOSED`** | **Décision du PO (cette mission)** — le dictionnaire lui-même refusait explicitement de trancher (silence documenté, cf. `PHASE_02_DECISIONS_A_VALIDER.md` sujet 2) ; le PO retient l'option (a), la proposition frontend actuelle. Terminologie volontairement distincte de `Tontine.status` (`DRAFT/OPEN` vs `ACTIVE/PAUSED`) — ce n'est pas une incohérence, c'est le choix explicite du PO plutôt que l'option (c) d'alignement terminologique qui avait été proposée en option. |
| `CycleMember.status` | `ACTIVE, INACTIVE, EXITED, SUSPENDED` | Dictionnaire (Phase 2, sujet 18d) |
| **`Loan.status`** | **`PENDING, ACTIVE, REPAID, DEFAULTED`** | **Décision du PO (cette mission)** — retient l'option (b) de `PHASE_02_DECISIONS_A_VALIDER.md` sujet 3 (distinction explicite d'un état de défaut). **`CLOSED` est explicitement exclu** en tant que statut métier du prêt. |
| `MemberAccount.role` | `OWNER, CO_OWNER, GUARANTOR, CONTRIBUTOR` | Dictionnaire, indice fort mais `CHECK` non formalisé (Phase 2, sujet 4 — NON BLOQUANT) |
| `Transaction.type` | `INCOME, EXPENSE, TRANSFER, COTISATION, LOAN_DISBURSEMENT, LOAN_REPAYMENT` | Dictionnaire (Phase 2, sujet 5) |
| `PaymentMethod` (partagé `Repayment.method`/`Transaction.payment_method`/`TontineContribution.payment_method`) | `CASH, MOBILE_MONEY, BANK, CARD` | Dictionnaire, confirmé sur 3 tables indépendantes (Phase 2, sujet 18e) |
| `Account.accountRole` | `STANDARD, TONTINE_PURCHASE, LOAN_FUND, SAVINGS` | Dictionnaire (Phase 2, sujet 12) |
| `Account.accountCategory` | **Texte libre, non contraint** (pas d'énumération fermée) | Dictionnaire — absence confirmée de `CHECK` (Phase 2, sujet 12) |
| `LoanGuarantor.guaranteeType` | `FULL, PARTIAL` | Dictionnaire (Phase 2, sujet 11) |
| `LoanGuarantor.status` | `ACTIVE, RELEASED, DEFAULTED` | Dictionnaire (Phase 2, sujet 11) |
| `TontineDraw.draw_type` | `ROTATION, AUCTION, RANDOM` | Dictionnaire (Phase 2, sujet 15) |
| `TontineDraw.status` | `PENDING, COMPLETED, CANCELLED` | Dictionnaire (Phase 2, sujet 15) |
| `Penalty.source_module` | `TONTINES, LOANS, MEETINGS, DOCUMENTS, SYSTEM` | Dictionnaire (Phase 2, sujet 13) |
| `tenants.organization_type` | `association, tontine, cooperative, church, company, community, other` | Convergence de 6 diagrammes de classes, dictionnaire silencieux mais non contradictoire (Phase 2, sujet 18f) |
| `Workflow.module` | `IDENTITY, GOVERNANCE, TONTINE, ACCOUNTING, CREDIT, RISK, DOCUMENT, COMMUNICATION` | Dictionnaire (Phase 2, sujet 17) |
| `TontinePosition.status` / `PositionPayment.status` | **Non spécifié** | Hors périmètre du verrouillage — aucune fiche dictionnaire n'existe pour ces entités (cf. §1.2, §9) |

**Impact frontend différé (non exécuté dans cette phase, à traiter lors d'une future phase d'implémentation)** : le frontend actuel utilisait `Loan.status = PENDING, ACTIVE, CLOSED` (`CLOSED` inclus) selon `AUDIT_PHASE_01.md` §9 C-07 — ceci **contredit désormais la liste verrouillée** (`REPAID, DEFAULTED` remplacent `CLOSED`) et nécessitera une migration de code lors d'une phase ultérieure. Pour `TontineCycle.status`, la liste verrouillée (`DRAFT, OPEN, SUSPENDED, CLOSED`) correspond déjà exactement à ce que le frontend utilisait à titre provisoire — seule la mention `PROVISIONAL` dans le commentaire de code devient obsolète et pourra être retirée.

---

## 4. Tenant scope (architecture cible verrouillée par Décision 1 du PO)

```
User
 ↓ (porte un tenantId)
tenantId
 ↓ (résolu au login / sélection explicite)
TenantContext / tenantStore
 ↓ (propagé sur chaque appel)
API (header/paramètre tenant)
 ↓
Backend vérifie l'accès au tenant — AUTORITÉ FINALE
```

**Règles verrouillées** :
- `tenantId` représente le tenant courant — doit être porté explicitement par `CurrentUser`/l'état d'authentification.
- `TenantContext`/`tenantStore` est le contexte frontend faisant autorité pour l'affichage — aujourd'hui non alimenté (`useTenantStore.setTenant` jamais appelé, cf. `AUDIT_PHASE_01.md` C-12) ; ceci reste un **gap d'implémentation à corriger dans une phase ultérieure**, pas dans celle-ci.
- Toute donnée métier est tenant-aware — cohérent avec `tenant_id NOT NULL` observé sur la quasi-totalité des tables canoniques vérifiées en Phase 2 (26/59 feuilles).
- Les clés de requête (React Query ou équivalent) doivent intégrer `tenantId` lorsque nécessaire, pour éviter qu'un changement de tenant ne réutilise un cache stale d'un autre tenant.
- Le changement de tenant doit invalider/recharger les données dépendantes.
- **Le frontend ne constitue pas l'autorité de sécurité** — le filtrage réel reste backend, cohérent avec la doctrine déjà actée dans `AUDIT_PHASE_01.md` §9 C-12.

**Cas résiduels identifiés en Phase 2, non résolus par cette architecture cible** (car ce sont des questions de schéma physique, pas d'architecture frontend) : `modules`/`permissions` sont des catalogues globaux non scopés tenant (cohérent, aucune action requise) ; `tontine_draws`/`draw_winners` n'ont pas de colonne `tenant_id` directe, leur portée tenant n'étant déductible que via `cycle_id → tontine_cycles.tenant_id` — la Décision 1 ne tranche pas si ce pattern de jointure indirecte est acceptable pour `TontinePosition`/`PositionPayment` une fois leur schéma spécifié (cf. §9).

**Règles opérationnelles détaillées** : `docs/PHASE_02_TENANT_ISOLATION_SPEC.md` détaille cette architecture en règles vérifiables par surface applicative (listes, dashboard, recherche, notifications, documents, audit, accès direct par URL, combinaison avec le RBAC) et fixe 12 tests obligatoires pour une future implémentation. Ce document-ci reste la référence pour l'architecture ; le document dédié en est l'opérationnalisation, sans divergence.

---

## 5. Permissions (RBAC — verrouillé, aucun changement par rapport à la Phase 2)

- **Conserver** `PermissionRoute`, `PermissionGate`, `can()` comme mécanisme unique de contrôle d'accès.
- **Ne jamais** remplacer le RBAC dynamique par une vérification en dur du type `role === "ADMIN"` — cohérent avec le fait que `Users` n'a structurellement aucune colonne `role` (§2.2).
- **RBAC Role ≠ Governance Position** : deux catalogues strictement séparés (§2.3). Le RBAC (`roles`/`permissions`/`role_permissions`/`users_roles`) répond à « qu'est-ce que cet utilisateur a le droit de faire ? » ; `Positions`/`BoardMandate` répond à « quelle fonction de gouvernance cette personne occupe-t-elle, et depuis quand ? ». Aucune FK entre les deux catalogues.
- Point résiduel non bloquant hérité de la Phase 2 (sujet 7) : l'acteur « Comité de Crédit » (UCX3) n'a de trace dans aucun des deux catalogues — nature non spécifiée (poste individuel, groupe d'approbateurs de workflow, ou comité collégial). Non traité par les décisions du PO de cette mission.

---

## 6. Workflows

Rappel des 7 workflows documentés par séquence (`AUDIT_PHASE_01.md` §6), avec statut mis à jour à la lumière du verrouillage :

1. **Login & résolution de tenant** — architecture cible désormais explicite (§4), implémentation toujours absente côté frontend.
2. **Achat de position tontine** (`Member → Tontine → TontinePosition → PositionPayment → Account/Transaction`) — les deux entités pivots sont désormais verrouillées comme indépendantes (§1.2, §2.1), mais leur schéma de champs reste à spécifier avant toute implémentation d'écran.
3. **Clôture annuelle** — inchangé, absent côté frontend, dépend de `FiscalYear` (déjà canonique).
4. **Prospect → Tenant actif** — inchangé, dépend du Platform Core (non construit).
5. **Prêt → remboursement** — **impacté par le verrouillage de `Loan.status`** : le flux de remboursement devra, dans une future phase d'implémentation, distinguer un remboursement complet (`REPAID`) d'un défaut de paiement (`DEFAULTED`), ce que le frontend actuel (`CLOSED` unique) ne fait pas.
6. **Redistribution des intérêts** — inchangé, absent côté frontend.
7. **Moteur de tirage tontine** (`Tontine_draw_engine → Tontines → Tontine_positions (positions PAID) → Tontine_draws → Draw_winners`) — le schéma de `TontineDraw`/`DrawWinner` est déjà canonique (Phase 2 sujet 15), mais ce workflow reste conditionné par la spécification de `TontinePosition` (étape 2 de ce même workflow) : le moteur de tirage ne peut récupérer des « positions payées » qu'une fois ce schéma défini.

---

## 7. Dépendances (ordre d'implémentation, mis à jour)

L'ordre recommandé par `AUDIT_PHASE_01.md` §12 reposait sur la résolution préalable des sujets alors BLOQUANT. Ce verrouillage lève le blocage **architectural** (on sait désormais ce qui est canonique) mais ne lève pas le blocage **de spécification physique** (`TontinePosition`/`PositionPayment` n'ont toujours pas de fiche dictionnaire) ni le blocage **d'implémentation** (le contexte tenant n'est toujours pas câblé). Ordre mis à jour :

1. **Spécifier le schéma physique de `tontine_positions`/`position_payments`** dans le dictionnaire de données (champs, contraintes, logique de filtrage par cycle au tirage — cf. §9) — préalable désormais isolé, puisque les questions architecturales (entité indépendante, rattachement à `Tontine`) sont tranchées, seul le schéma reste à écrire.
2. **Câbler le contexte tenant frontend** selon l'architecture §4 (`tenantId` sur `CurrentUser`, alimentation de `tenantStore`, header API, invalidation de cache) — nécessaire avant le Platform Core.
3. **Construire l'écran d'achat de position** (Tontine Core) une fois le point 1 résolu.
4. **Construire le moteur de tirage** (schéma déjà canonique) — dépend du point 3.
5. **Platform Core** (Tenants/Plans/Subscriptions/Payments) — dépend du point 2 pour que `tenantStore` ait une source réelle.
6. **Gouvernance (Bureau Exécutif)** — `BoardMandate` déjà fusionné/canonique ; gap résiduel mineur sur `boards` (§9) à combler en parallèle, non bloquant.
7. **Gouvernance (Assemblées/Votes/Documents)**.
8. **Migrer `Loan.status`** du modèle frontend actuel (`PENDING, ACTIVE, CLOSED`) vers le modèle verrouillé (`PENDING, ACTIVE, REPAID, DEFAULTED`) — chantier de maintenance sur un domaine déjà construit, indépendant des points 1-7.
9. Reste de l'ordre `AUDIT_PHASE_01.md` §12 inchangé (Audit, Reporting V1, Risk & Penalty Core/Document Core/Integration Core/Infrastructure différés).

---

## 8. Décisions validées (registre consolidé)

| # | Sujet | Statut final | Source du verrouillage |
|---|---|---|---|
| 1 | `Member.status` | **VERROUILLÉ** | Phase 2 (dictionnaire) |
| 2 | `TontineCycle.status` | **VERROUILLÉ** | **Décision PO (cette mission)** |
| 3 | `Loan.status` | **VERROUILLÉ** | **Décision PO (cette mission)** |
| 4 | `MemberAccount.role` | **VERROUILLÉ** (indice fort, `CHECK` à formaliser) | Phase 2 (dictionnaire) |
| 5 | `Transaction.type` | **VERROUILLÉ** | Phase 2 (dictionnaire) |
| 6 | `USERS.role` vs RBAC dynamique | **VERROUILLÉ** — RBAC dynamique retenu | Phase 2 (dictionnaire, absence de colonne `role`) + réaffirmé Décision RBAC (cette mission) |
| 7 | Rôles métier vs rôles RBAC | **VERROUILLÉ** — deux couches séparées | Phase 2 (dictionnaire `positions`/`board_mandates`) + réaffirmé Décision RBAC (cette mission) |
| 8 | `tenant_id` et contexte tenant | **VERROUILLÉ** (architecture cible) — implémentation reste à faire | **Décision PO 1 (cette mission)** |
| 9 | `TontinePosition` | **VERROUILLÉ** (existence, indépendance, rattachement direct à `Tontine` — pas `TontineCycle`) — schéma physique reste à spécifier | **Décision PO 2 (cette mission)**, rattachement précisé ensuite |
| 10 | `PositionPayment` | **VERROUILLÉ** (existence, indépendance, relation à TontinePosition) — schéma physique reste à spécifier | **Décision PO 3 (cette mission)** |
| 11 | `LoanGuarantor` | **VERROUILLÉ** | Phase 2 (dictionnaire) |
| 12 | `Account.accountCategory` | **VERROUILLÉ** — texte libre non contraint | Phase 2 (dictionnaire) |
| 13 | `Penalty` | **VERROUILLÉ** — domaine transverse | Phase 2 (dictionnaire) |
| 14 | `BoardMember`/`Mandate` | **VERROUILLÉ** — fusion en `BoardMandate` | Phase 2 (dictionnaire) |
| 15 | `TontineDraw`/Draw Engine | **VERROUILLÉ** | Phase 2 (dictionnaire) |
| 16 | Comptabilité en partie double | **VERROUILLÉ** — modèle simplifié (A) retenu | Phase 2 (absence de `journals`/`transaction_lines`/`account_balances` dans le dictionnaire) |
| 17 | Workflow vs Governance approval | **VERROUILLÉ** — `GOVERNANCE` est un module valide, non orphelin | Phase 2 (dictionnaire) |
| 18a-n | Conflits/doublons complémentaires (Meeting.status, Attendance.status, Tontine.status, CycleMember.status, Repayment.method, organization_type, tontine_cycles/cycle_members, WhatsApp, collision Administration/Exploitation, nommages D-04/D-05/D-07, workflow_actions/delegations, Meetings double classification) | **VERROUILLÉ** (14 sujets) | Phase 2 (dictionnaire ou convergence documentaire) |

**Total : 31 sujets, tous désormais VERROUILLÉS au niveau architectural.** Deux sujets (9, 10) restent conditionnés à une spécification de schéma physique avant implémentation ; un sujet (8) reste conditionné à une implémentation de code, non exécutée dans cette phase documentaire.

---

## 9. Contradictions restantes (explicitement non résolues par ce verrouillage)

1. **Schéma de champs de `TontinePosition`/`PositionPayment`** : leur existence, indépendance et rattachement (`Tontine → TontinePosition`, tranché — cf. §2.1) sont verrouillés, mais aucun champ, type, contrainte ou statut n'est spécifié — contrairement à toutes les autres entités de ce document, qui s'appuient sur une fiche `dictionnaire_donnees.xlsx` vérifiée. Une spécification dédiée (nouvelle fiche ST-0XX) est nécessaire avant toute implémentation.
2. **Filtrage des positions par cycle au moment du tirage** : `TontinePosition` est scopée par `tontine_id`, alors que `tontine_draws` (déjà canonique) est scopé par `cycle_id`. Le moteur de tirage devra donc filtrer, parmi les positions `PAID` d'une `Tontine`, celles pertinentes au cycle en cours — logique de filtrage à spécifier avec le schéma physique (point 1), pas une FK directe `TontinePosition.cycle_id`.
3. **`tenant_id` sur `TontinePosition`/`PositionPayment`** : à spécifier — direct (comme la majorité des tables) ou indirect via `tontine_id` (comme `tontine_draws`/`draw_winners` le sont via `cycle_id`) ?
4. **`boards`** : toujours absente du dictionnaire malgré la FK `board_mandates.board_id` qui la référence (gap déjà identifié en Phase 2, non traité par les décisions du PO de cette mission — non bloquant pour la conception de l'écran Gouvernance, cf. §7 point 6).
5. **« Comité de Crédit »** (acteur UCX3) : toujours sans correspondance dans `positions`, `board_mandates`, ni le RBAC (gap déjà identifié en Phase 2 sujet 7, non traité par cette mission).
6. **Migration de code requise, non exécutée** : `Loan.status` actuel du frontend (`PENDING, ACTIVE, CLOSED`) contredit désormais la liste verrouillée (`PENDING, ACTIVE, REPAID, DEFAULTED`) — un chantier de migration est nécessaire dans une future phase d'implémentation (§7 point 8), volontairement non exécuté ici.
7. **Contexte tenant non implémenté** : l'architecture cible (§4) est verrouillée mais zéro ligne de code ne l'implémente aujourd'hui (`AUDIT_PHASE_01.md` C-12, non modifié par cette phase documentaire).

---

## Synthèse

Ce document verrouille l'intégralité des 31 sujets de décision de la Phase 2 : les 26 déjà tranchés par preuve documentaire directe (dictionnaire de données) restent inchangés, et les 5 qui nécessitaient un arbitrage produit (`TontineCycle.status`, `Loan.status`, `tenant_id`/contexte tenant, `TontinePosition`, `PositionPayment`) sont désormais fixés par les décisions explicites du Product Owner fournies dans cette mission — y compris le rattachement de `TontinePosition` directement à `Tontine` (et non à `TontineCycle`), qui clôt ce qui était initialement identifié comme la contradiction la plus structurante restante. Le modèle canonique qui en résulte est cohérent et actionnable pour la quasi-totalité des domaines déjà construits. Il subsiste 6 points non résolus par ce verrouillage — listés en section 9 — le plus concret étant l'absence de schéma de champs pour `TontinePosition`/`PositionPayment` : leur existence, indépendance et rattachement sont actés, mais aucune fiche de schéma physique ne les décrit encore. Aucun fichier de `src/` n'a été modifié — ce document reste, comme les trois précédents, un livrable strictement documentaire.
