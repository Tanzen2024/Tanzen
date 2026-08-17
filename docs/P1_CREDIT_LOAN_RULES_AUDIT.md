# TANZEN — P1 Credit — `loan_rules` — Audit read-only GO/NO-GO

**Statut : audit, strictement lecture seule.** Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `routes/`, `locales/`, `migrations/`, `database/`, configuration n'a été modifié, créé ou supprimé pour produire ce document, dans aucun des trois projets. `git status` confirmé identique avant/après (§29 en fin de document). D1/D2/D3 (RBAC), les deux décisions de nomenclature successives (`LOAN_POLICY_MIGRATION_REPORT.md` puis `LOAN_RULES_NORMALIZATION_REPORT.md`) ne sont pas rouvertes.

---

## 1. Mission

Déterminer si l'entité canonique `loan_rules` peut recevoir un GO d'implémentation dans `tanzen-frontend`, fonctionnalité par fonctionnalité, sur la base exclusive des sources réellement présentes — sans présumer qu'un modèle canonique existant suffit à justifier un GO.

## 2. Décision de nomenclature

Rappel, verrouillé par les deux missions précédentes, non rouvert ici :

| | Décision actuelle |
|---|---|
| Entité métier | `loan_rules` |
| Nom applicatif futur | `LoanRule` |
| Nom de service futur | `loan-rule.service.ts` |
| Nom de repository futur | `loan-rule.repository.ts` |
| Persistance | `loan_rules` |

`LoanPolicy`/`loanPolicy`/`loan_policies`/`loan_policy_id` restent explicitement écartées comme terminologie active (`docs/LOAN_RULES_NORMALIZATION_REPORT.md`).

## 3. Sources analysées

Lues intégralement ou par extraction ciblée pour cette mission : `docs/audit/excel_dictionary_dump.txt` (fiche #14, canonique), `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `docs/PHASE_02_DECISIONS_CANONIQUES.md` (aucune mention de `loan_rules`, vérifié), `docs/PHASE_02_DECISIONS_A_VALIDER.md` (aucune mention, vérifié), `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (bloc UC-60 complet + UCX3 complet, tableau maître), `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (`DC_TANZEN_Crédit.png`, §2.6, §3, §6, §7, §9), `docs/PHASE_06_DECISIONS_A_VALIDER.md` (aucune mention, vérifié), `docs/PHASE_07_FINANCE_CREDIT.md`, `docs/PHASE_07_DECISIONS_A_VALIDER.md`, `docs/AUDIT_PHASE_01.md`, `docs/LOAN_RULES_NORMALIZATION_REPORT.md`, `docs/LOAN_POLICY_MIGRATION_REPORT.md` (superségé). Code inspecté directement : `src/services/credit.service.ts` (intégral), `src/mocks/finance/{loans,accounts}.ts`, `src/mocks/rbac.mocks.ts` (catalogue complet), `tanzen-mobile/src/` (recherche exhaustive), `tanzen-commercial/src/` (recherche exhaustive).

## 4. Dictionnaire canonique

Fiche #14, `loan_rules` — « Core Credit Policy Engine » — extraite intégralement (`docs/audit/excel_dictionary_dump.txt` lignes 394-445) :

| Champ | Type | Contrainte | Détail |
|---|---|---|---|
| `id` | BIGINT | PK, Identity | — |
| `uuid` | CHAR(36) | NOT NULL | Référence API |
| `tenant_id` | BIGINT | NOT NULL, FK → `tenants.id` | Tenant propriétaire |
| `account_id` | BIGINT | NOT NULL, FK → `accounts.id` | Caisse soumise à la politique |
| `name` | VARCHAR(100) | NOT NULL | Nom de la règle |
| `allow_loans` | BOOLEAN | DEFAULT FALSE | Autorise les prêts sur la caisse |
| `loan_mode` | VARCHAR(20) | (valeurs documentées, non `CHECK`-formalisées — §4.1) | `NONE`/`INTERNAL`/`EXTERNAL`/`BOTH` |
| `min_amount` | DECIMAL(15,2) | DEFAULT 0 | Minimum empruntable |
| `max_amount` | DECIMAL(15,2) | NOT NULL | Plafond de prêt |
| `interest_rate` | DECIMAL(5,2) | DEFAULT 0 | Taux appliqué |
| `interest_type` | VARCHAR(20) | `CHECK IN ('FIXED','REDUCING','FLAT')` | — |
| `interest_period` | VARCHAR(20) | `CHECK IN ('DAILY','WEEKLY','MONTHLY','YEARLY')` | — |
| `duration_months` | INT | NOT NULL | Durée remboursement (valeur unique, pas un min/max) |
| `max_active_loans` | INT | DEFAULT 1 | Limite d'exposition active |
| `max_loan_exposure` | DECIMAL(15,2) | NULL | Risque total autorisé |
| `requires_guarantor` | BOOLEAN | DEFAULT FALSE | — |
| `min_guarantors` | INT | DEFAULT 0 | — |
| `max_guarantors` | INT | `CHECK(max_guarantors >= min_guarantors)` | — |
| `guarantee_type_required` | VARCHAR(30) | (valeurs documentées, non `CHECK`-formalisées — §4.1) | `PERSONAL`/`GROUP`/`COLLATERAL` |
| `guarantee_ratio` | DECIMAL(5,2) | `CHECK BETWEEN 0 AND 100`, DEFAULT 100 | % garantie exigée |
| `allow_self_guarantee` | BOOLEAN | DEFAULT FALSE | — |
| `requires_approval` | BOOLEAN | DEFAULT TRUE | — |
| `approval_level` | VARCHAR(30) | (valeurs documentées, non `CHECK`-formalisées — §4.1) | `MEMBER`/`BOARD`/`ADMIN` |
| `status` | VARCHAR(20) | DEFAULT `'ACTIVE'` (valeurs documentées, non `CHECK`-formalisées — §4.1) | `ACTIVE`/`INACTIVE` |
| `sync_status` | VARCHAR(20) | DEFAULT `'SYNCED'` | — |
| `version` | INT | DEFAULT 1 | Concurrence |
| `created_at`/`updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | — |
| `deleted_at` | TIMESTAMP | NULL | Suppression logique |
| `created_by`/`updated_by` | BIGINT | NULL, FK → `users.id` | — |

Contraintes nommées : `uq_loan_rules_uuid` (`UNIQUE(uuid)`), `uq_loan_rules_account` (`UNIQUE(tenant_id, account_id)`), `uq_loan_rules_name` (`UNIQUE(tenant_id, name)`), `ck_allow_loans_valid`, `ck_amount_valid` (`max_amount >= min_amount`), `ck_interest_valid` (`interest_rate >= 0`), `ck_duration_valid` (`duration_months > 0`), `ck_exposure_valid`, `ck_interest_type`, `ck_interest_period`, `ck_guarantee_ratio`, `ck_guarantor_count`, `ck_account_credit_policy` (`account_id IS NOT NULL`).

### 4.1 Constat — incohérence interne au dictionnaire (nouveau, non signalé par les missions précédentes)

Trois champs (`loan_mode`, `guarantee_type_required`, `approval_level`) et un quatrième (`status`) sont documentés avec une liste de valeurs dans la colonne « Détail », et deux d'entre eux (`loan_mode`, `guarantee_type_required`) portent même la mention `CHECK ENUM` dans leur colonne « Type » — **mais aucun `CHECK` correspondant n'est nommé** dans la section « CONTRAINTES MÉTIER » de la fiche (10 contraintes `CHECK`/`UNIQUE` y sont nommées, aucune pour ces 4 champs). Ce n'est pas une contradiction entre deux sources (dictionnaire vs diagramme) comme celles déjà cataloguées ailleurs dans ce projet — c'est une incohérence **interne à la fiche canonique elle-même**. Conséquence pratique : les valeurs listées (`NONE/INTERNAL/EXTERNAL/BOTH`, `PERSONAL/GROUP/COLLATERAL`, `MEMBER/BOARD/ADMIN`, `ACTIVE/INACTIVE`) restent la meilleure information disponible et doivent être respectées si le champ est implémenté, mais leur caractère strictement fermé (aucune autre valeur n'étant jamais valide) n'est pas formellement verrouillé par une contrainte `CHECK` nommée. Non bloquant, mais signalé pour ne pas être découvert plus tard comme une omission de cet audit.

## 5. Modèle

**Complet et exploitable tel quel** pour un premier périmètre de CRUD simple — 30 champs, tous typés, la quasi-totalité des règles métier (montants, taux, garanties, approbation) déjà représentées. **Aucun champ n'a été inventé ou supposé pour cet audit** — chaque ligne du tableau §4 provient directement de la fiche canonique.

**Divergence substantielle avec le diagramme de classes (`DC_TANZEN_Crédit.png`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.6), non détectée par les deux missions de nommage précédentes** (qui ne comparaient que la terminologie, pas les champs) :

| | Dictionnaire (fiche #14, canonique) | Diagramme `DC_TANZEN_Crédit.png` (secondaire) |
|---|---|---|
| `interest_type` | `CHECK IN ('FIXED','REDUCING','FLAT')` | `CHECK(fixed, simple, compound)` — **valeurs entièrement différentes** |
| Durée | `duration_months INT NOT NULL` (valeur unique) | `min_duration`/`max_duration INT` + `duration_unit CHECK(days,weeks,months,years)` — **structure différente** (plage + unité, pas une valeur unique en mois) |
| Statut | `status VARCHAR(20)` (`ACTIVE`/`INACTIVE`) | `is_active BOOLEAN` — représentation différente du même concept à 2 états |
| Champs présents uniquement sur le diagramme | — | `minimum_saving_balance`, `minimum_membership_months`, `minimum_contributions`, `late_penalty_rate`, `grace_period_days` — **absents de la fiche canonique** |
| Champs présents uniquement sur le dictionnaire | `name`, `loan_mode`, `max_loan_exposure`, `guarantee_type_required`, `allow_self_guarantee`, `requires_approval`, `approval_level`, `created_by`, `updated_by` | (non montrés sur le diagramme) |

**Application stricte de la règle de priorité déjà établie dans ce projet (dictionnaire > diagramme)** : le modèle de base pour un futur `LoanRule` est **la fiche #14 telle quelle** (§4) — les champs propres au diagramme (`minimum_saving_balance`, `late_penalty_rate`, `grace_period_days`, plage min/max de durée) sont **`MODEL_GAP`**, non confirmés canoniques, à ne pas implémenter sans validation explicite du Product Owner. `interest_type`/durée/`status` : la fiche canonique prévaut également sur ces trois points.

## 6. Relation `Account → loan_rules`

**Confirmée, cohérente entre les deux sources qui la documentent, aucune ambiguïté.**

- Dictionnaire (fiche #14) : `account_id BIGINT NOT NULL FK → accounts.id`, contrainte `uq_loan_rules_account = UNIQUE(tenant_id, account_id)` — **au plus une règle par compte et par tenant**.
- Diagramme `DC_TANZEN_Crédit.png` : `LOAN_POLICIES.UQ FK_account_id`, relation `ACCOUNTS→LOAN_POLICIES` (cardinalité `1..*` au sens du diagramme, mais la contrainte `UNIQUE(account_id)` citée directement sur le diagramme — §2.6 — la resserre en pratique à `0..1` par compte, cohérent avec le dictionnaire).

**Cardinalité** : `Account 1──0..1 loan_rules` (au plus une règle active par compte, jamais plusieurs). **FK exacte** : `loan_rules.account_id → accounts.id`, portée par l'entité `loan_rules` elle-même (pas l'inverse). **Comportement tenant** : `tenant_id` est présent **directement** sur `loan_rules` (pas seulement dérivable via `account_id → accounts.tenant_id`) — confirmé deux fois indépendamment (`PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §6 et §7 : « `Loan_policies` \| TENANT \| `tenant_id FK` direct (`UQ`) » et « `Loan_policies` \| TENANT-SCOPED \| `tenant_id` direct »). **Suppression/modification d'`Account`** : aucune source ne documente de comportement `ON DELETE`/`ON UPDATE` sur cette FK précise — `NON DÉTERMINÉ PAR LES SOURCES`, et sans urgence pratique puisqu'aucune suppression d'`Account` n'est de toute façon implémentée dans `tanzen-frontend` aujourd'hui (`accountService`/`finance.service.ts` ne porte aucune fonction de suppression, confirmé par lecture directe).

## 7. Relation avec `Loans`

**Aucune relation directe `Loan → loan_rules` identifiée — conclusion confirmée par trois sources indépendantes et concordantes, la plus solide de tout cet audit.**

1. Dictionnaire (fiche #14) : `loan_rules` ne porte aucune FK vers `loans` ; la fiche `loans` (non ré-extraite intégralement dans cette mission, hors périmètre strict de l'audit `loan_rules`) n'apparaît dans aucune source consultée comme portant une colonne `loan_rule_id`/`loan_policy_id`.
2. `docs/AUDIT_PHASE_01.md` : diagramme `DC_Crédit` — « Tenant 1──N Account 1──N Loan_policy » — `Loan_policy` est rattachée à `Account`, jamais directement à `Loan`. La séquence `DSEQ_PRÊT_REMBOURSEMENT` (« Member → Loan (validate eligibility via Loan_policies) → disburse funds → Account ») montre la politique **consultée pour validation d'éligibilité** au moment de l'octroi, un usage fonctionnel, pas une FK structurelle.
3. `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.6 : les 6 relations du diagramme `DC_TANZEN_Crédit.png` sont exhaustivement listées (« toutes `1..*` ») — `TENANTS→ACCOUNTS`, `TENANTS→MEMBERS`, `ACCOUNTS→LOAN_POLICIES`, `ACCOUNTS→LOANS`, `MEMBERS→LOANS`, `LOANS→REPAYMENTS`. **`LOAN_POLICIES` et `LOANS` ne sont jamais reliées entre elles directement** — les deux ne se rejoignent que via leur `Account` commun.

**Conclusion explicite (mandat §8)** : « Aucune relation directe Loan → loan_rules identifiée. » Ne jamais créer `loan_policy_id` ni `loan_rule_id` sur `Loan` sans une nouvelle source canonique qui la démontrerait explicitement — aucune ne le fait aujourd'hui.

## 8. Use Cases

Recherche exhaustive dans `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (bloc UC-60 complet + bloc UCX3 complet + recherche des termes « crédit »/« prêt »/« règles de prêt »/« politique de prêt » au-delà de ces deux blocs — aucune occurrence supplémentaire trouvée dans `PHASE_02_DECISIONS_CANONIQUES.md`/`PHASE_02_DECISIONS_A_VALIDER.md`/`PHASE_06_DECISIONS_A_VALIDER.md`, vérifié).

### UC directement associé

| ID exact | Nom exact | Contexte | Domaine | Acteur | Entité | Statut source |
|---|---|---|---|---|---|---|
| **UC60-03** | **Gérer les politiques de prêt** | TENANT | Credit | Admin Tenant | `LoanPolicy` (= `loan_rules`/`LoanRule` après renommage) | **Confirmé** |

Préconditions/scénario numéroté/résultat détaillé/dépendances explicites : **absents de la source** — confirmé, la source elle-même le documente (`PHASE_04_USE_CASE_CLASSIFICATION.md` §9 : « Scénarios numérotés — absents partout » ; « Règles métier annotées par bulle — absentes »). « Gérer » n'est jamais décomposé en Consulter/Créer/Modifier/Supprimer par la source — cette décomposition n'est déductible que du modèle de données (champs `status`, `deleted_at` — §16/§17) et du terme générique « Gérer » lui-même, dont le sens usuel dans les autres UC de cette même classification (ex. UC50-07/08 « Gérer les comptes » → Modifier/Désactiver déjà déduit ainsi par `PHASE_07_DECISIONS_A_VALIDER.md` sujet 2) inclut conventionnellement au moins Consulter/Créer/Modifier.

**Encart « Tables concernées » de UC-60** (citation verbatim, pas une classification) : `loan_rules, loans, loan_guarantors, loan_disbursements, loan_installments, loan_repayments, loan_interest_accruals, loan_penalties` — confirme que `loan_rules` fait partie du domaine Credit Core au même titre que les autres tables, sans en dire plus sur son propre périmètre fonctionnel.

### UC associé indirectement (via une décision distincte déjà cataloguée)

| ID | Nom | Lien avec `loan_rules` |
|---|---|---|
| UC60-01 | Gérer les décaissements | `docs/PHASE_07_DECISIONS_A_VALIDER.md` sujet BLOQUANT 3 cite `LoanPolicy` comme option de résolution possible (source du taux d'intérêt à l'auto-création du `Loan`) — voir §15 |

### UCX3 (18 UC, Credit Core détaillé) — aucune association directe trouvée

Les 18 UC de UCX3 (dépôt de pièces, signature, décaissement, remboursement, clôture, analyse de solvabilité, pénalités...) ont tous pour entité déclarée `Loan` ou une entité sœur (`LoanInstallment`, `LoanDisbursement`, `LoanInterestAccrual`) — **aucun n'a `loan_rules`/`LoanPolicy` comme entité propre**. Le seul lien fonctionnel plausible (UCX3-15 « Évaluer la solvabilité », Comité de Crédit) a pour entités déclarées « Loan, Member (score) », pas `LoanPolicy` — cohérent avec §7 (aucune FK directe).

**Aucun UC n'a été inventé ni reconstruit** — les deux tableaux ci-dessus reprennent exactement les identifiants et libellés de la source.

## 9. État `tanzen-frontend`

**Absent, confirmé par recherche exhaustive** (`loan_rules`, `LoanRule`, `loanRule`, `LoanPolicy`, `loanPolicy`, `loan_policies`, `loan_policy_id` — 0 occurrence dans `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `hooks/`, `routes/`, `locales/`).

**Inspection directe de `src/services/credit.service.ts` (fichier intégral, §3)** : le domaine Credit déjà construit (`listApplications`, `createApplication`, `advanceApplicationStage`, `listLoans`, `getLoan`, `createLoan`, `listRepayments`, `createRepayment`, `listGuarantors`, `createGuarantor`, `closeLoan`) ne référence `loan_rules` à aucun endroit. `createLoan` accepte un `interestRate` **fourni librement par l'appelant** (`LoanInput = Omit<Loan, ...>`, `interestRate` reste un champ du formulaire manuel), sans aucune validation contre une règle de crédit associée au compte. Aucun couplage, même informel, entre `Account` et une notion de politique n'existe dans le code actuel.

**Routes** (`docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §9, confirmé par la structure de service ci-dessus) : `/finance/credit/applications*`, `/finance/credit/loans*`, `/finance/credit/repayments`, `/finance/credit/guarantors` — **aucune route `loan-rules`/`credit-policies`** n'existe.

**RBAC** : voir §12. **Mocks** : `src/mocks/finance/{loans,repayments,guarantors,applications}.ts` existent, aucun `loan-rules.ts`/`loan-rule.ts`.

## 10. État `tanzen-mobile`

**Absent, confirmé.** Recherche exhaustive (`loan`, `credit`, `account` insensible à la casse) dans `src/`, `app/`, `tests/` : les seules occurrences sont des mentions de placeholder Phase 1 (`src/database/migrations/001_initial.ts`, `src/database/schema/index.ts` — listes de noms de tables futures dans un commentaire, ex. `local_loans`/`local_accounts`, fichiers volontairement vides) et un faux positif (`tenant-scoped-repository.ts`, mot « credit »/« account » hors contexte métier). Aucune migration, schéma, repository, service, hook, écran ou test réel. Le domaine Finance/Credit n'est pas entamé côté Mobile — seul Governance (`board_mandates`/`meetings`/`positions`/`attendances`) est construit à ce jour.

## 11. État `tanzen-commercial`

**Absent, hors périmètre.** Recherche exhaustive : 0 occurrence dans `src/`. Les 6 documents de référence partagés avec `tanzen-frontend` (`PHASE_02/04/05/07`, `AUDIT_PHASE_01`) sont des copies identiques (confirmé par `diff` lors de la mission de nommage précédente, non re-vérifié ici faute de changement possible). Conforme au mandat : aucun module Credit ne doit être introduit artificiellement dans ce projet (Public/SaaS + Platform Administration uniquement).

## 12. RBAC

Catalogue actuel (`src/mocks/rbac.mocks.ts`, inspecté directement) :

| Domaine | Permissions existantes |
|---|---|
| `accounts` | `accounts.read`, `accounts.create` (**pas** `accounts.update`, déjà `BLOQUANT` sujet 2 de `PHASE_07_DECISIONS_A_VALIDER.md`, non retranché) |
| `applications` | `applications.read`, `applications.create`, `applications.approve` |
| `loans` | `loans.read`, `loans.create`, `loans.approve` (**pas** `loans.update`/`loans.delete`) |
| `repayments` | `repayments.read`, `repayments.create` |
| `guarantors` | `guarantors.read`, `guarantors.create` |
| `transactions` | `transactions.read`, `transactions.export` (**pas** `transactions.create`, déjà `BLOQUANT` sujet 1) |

**Aucune permission `loanRules.*`/`creditPolicy.*`/`loan_rules.*` n'existe.** Réutiliser `loans.*` serait sémantiquement incorrect (une politique de crédit n'est pas un prêt — même distinction déjà appliquée par ce projet pour ne pas confondre `governance.*` et `members.*`, cf. `MOBILE_PHASE_04C1_GOVERNANCE_REPORT.md`) ; réutiliser `accounts.*` serait tout aussi incorrect (une règle de crédit n'est pas le compte lui-même, même s'il la porte). **Aucune permission n'a été inventée pour combler ce constat.**

| UC | Action | Permission requise | Permission existante | Suffisant ? |
|---|---|---|---|---|
| UC60-03 | Consulter/Lister | (à définir) | Aucune | **Non** |
| UC60-03 | Créer | (à définir) | Aucune | **Non** |
| UC60-03 | Modifier | (à définir) | Aucune | **Non** |
| UC60-03 | Désactiver/Supprimer | (à définir) | Aucune | **Non** |

**DECISION_REQUIRED** — voir D-CREDIT-LR-01 (§22). Ce gap est structurellement identique à ceux déjà catalogués par `PHASE_07_DECISIONS_A_VALIDER.md` (sujets 1 et 2 : `transactions.create`, `accounts.update`) — la même cause (catalogue RBAC non étendu lors de la construction initiale du domaine Credit) produit le même type de blocage pour une troisième entité.

## 13. Tenant isolation

**Modèle simple et sans ambiguïté** — contrairement à `attendances` (Mobile, isolation indirecte via `meeting_id`), `loan_rules` porte `tenant_id` **directement** (confirmé §6, deux sources concordantes). Scénarios :

| Scénario | Classification |
|---|---|
| T-001 `loan_rules` → T-001 `account` | Autorisé — cohérent, `account_id` et `tenant_id` doivent pointer vers le même tenant |
| T-001 utilisateur → T-002 `loan_rules` | Refusé — `tenant_id` direct permet un filtrage simple (`WHERE tenant_id = ?`), pattern déjà utilisé par tous les services `finance`/`credit` existants (`getTenantScoped`) |
| T-001 `loan_rules` référençant un `account_id` de T-002 | **Risque théorique à vérifier explicitement par toute future implémentation** — rien dans le schéma n'empêche structurellement une incohérence `loan_rules.tenant_id` ≠ `accounts(loan_rules.account_id).tenant_id`, aucune contrainte composite ne la garantit (même famille de risque que celui déjà documenté pour `attendances.member_id` vs `attendances.meeting_id` côté Mobile) |

**Aucune garde n'a été ajoutée** — analyse uniquement, conformément au mandat. Le pattern déjà en place (`getTenantScoped`, `tenant-scope.ts`, réutilisé sans modification par tous les services `finance`/`credit`) suffirait structurellement pour `loan_rules`, sans nécessiter de jointure (contrairement à `attendances`, qui n'a pas de `tenant_id` direct) — un avantage structurel notable pour une future implémentation.

## 14. Règles financières

Chaque règle ci-dessous est directement sourcée par la fiche canonique (§4) — aucune n'est inventée :

| Règle | Source | Statut | Suffisamment définie ? |
|---|---|---|---|
| Montant min/max empruntable | `min_amount`/`max_amount`, `ck_amount_valid` | Sourcée | Oui |
| Taux d'intérêt | `interest_rate`, `ck_interest_valid (>= 0)` | Sourcée | Oui (valeur), voir §15 pour son usage |
| Type d'intérêt | `interest_type CHECK(FIXED/REDUCING/FLAT)` | Sourcée | Oui |
| Périodicité d'intérêt | `interest_period CHECK(DAILY/WEEKLY/MONTHLY/YEARLY)` | Sourcée | Oui |
| Durée | `duration_months`, `ck_duration_valid (> 0)` | Sourcée | Oui — valeur unique, pas de plage (contrairement au diagramme, §5) |
| Exposition maximale | `max_active_loans`, `max_loan_exposure` | Sourcée | Oui |
| Garanties | `requires_guarantor`, `min_guarantors`/`max_guarantors`, `guarantee_type_required`, `guarantee_ratio CHECK(0-100)`, `allow_self_guarantee` | Sourcée | Oui, malgré l'incohérence `CHECK` non nommé sur `guarantee_type_required` (§4.1) |
| Approbation | `requires_approval`, `approval_level` | Sourcée | Oui, malgré l'incohérence `CHECK` non nommé sur `approval_level` (§4.1) |
| Pénalités | **Absent de `loan_rules`** | — | `late_penalty_rate` n'existe que sur le diagramme (§5), non canonique — les pénalités relèvent du modèle transverse `Penalty`/`penalties` déjà canonique ailleurs (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 13), pas de `loan_rules` |
| Frais | **Non sourcé** | — | Aucun champ de frais sur `loan_rules` |

**Aucune règle financière n'a été inventée pour combler un vide** — là où le champ existe, il est cité ; là où il n'existe pas (pénalités, frais), c'est documenté comme absent, pas complété.

## 15. Taux d'intérêt — point bloquant distinct, non résolu ici

**Rappel du sujet déjà identifié** (`docs/PHASE_07_DECISIONS_A_VALIDER.md`, sujet BLOQUANT 3, « Auto-création du `Loan` au décaissement d'une `Application` ») : le décaissement d'une demande de crédit (`ApplicationDetail`/`advanceApplicationStage`) ne crée aujourd'hui **aucun** `Loan` automatiquement — la création reste manuelle (`LoanCreate`), avec un taux saisi librement (12% par défaut dans le formulaire actuel). La question posée par ce sujet reste : « d'où doit provenir le taux d'intérêt lors de l'auto-création du prêt au décaissement ? », avec pour option (b) déjà envisagée : « introduire une entité `LoanPolicy`/barème de taux par type de prêt ».

**Ce que cet audit apporte de nouveau, sans le résoudre** : `loan_rules.interest_rate` (§4) est un champ réel, sourcé, déjà présent dans le modèle canonique — une réponse plausible et bien étayée à la question « d'où viendrait le taux » **si** l'option (b) de ce sujet était retenue. Mais :
- **loan_rules fournit-il réellement le taux au moment de la création d'un `Loan` ?** `NON DÉTERMINÉ PAR LES SOURCES` — aucun UC, aucune séquence numérotée ne décrit ce transfert explicitement (seule la séquence `DSEQ_PRÊT_REMBOURSEMENT` mentionne une validation d'éligibilité via la politique, pas une copie de son taux).
- **Le `Loan` hérite-t-il ce taux, ou le stocke-t-il indépendamment une fois copié ?** `NON DÉTERMINÉ` — `Loan.interest_rate` (dictionnaire, table `loans`, non ré-extraite ici) et `loan_rules.interest_rate` sont deux champs distincts sur deux tables distinctes ; aucune règle de copie/synchronisation n'est documentée.
- **Le taux est-il calculé ailleurs ?** Non — aucune autre source de taux n'existe dans le modèle Credit.
- **L'UC précise-t-il ce comportement ?** Non (§8 — scénarios numérotés absents de toutes les sources UC-60/UCX3).

**Conclusion explicite : `DECISION_REQUIRED`, et ce sujet n'est PAS considéré comme résolu par la seule présence du champ `interest_rate` sur `loan_rules`**, conformément au mandat. Ce point reste la propriété de `docs/PHASE_07_DECISIONS_A_VALIDER.md` sujet 3, non dupliqué ici sous un nouvel identifiant — cet audit se contente d'ajouter la preuve que `loan_rules.interest_rate` existe réellement et serait une source technique viable si l'option (b) était un jour retenue par le Product Owner.

## 16. Statut / activation

Le dictionnaire canonique prévoit **deux mécanismes distincts et coexistants** sur `loan_rules`, tous deux réels (aucun n'est inventé) :

1. `status VARCHAR(20) DEFAULT 'ACTIVE'` — valeurs documentées `ACTIVE`/`INACTIVE` (§4.1 : liste non formalisée par un `CHECK` nommé, mais c'est la seule information disponible).
2. `deleted_at TIMESTAMP NULL` — suppression logique classique (soft delete).

**Ne pas inventer `DRAFT`** ou toute autre valeur non listée par la fiche — confirmé, seules `ACTIVE`/`INACTIVE` sont documentées.

**Ce que les sources ne précisent pas** : la distinction fonctionnelle entre « désactiver » (`status = 'INACTIVE'`, probablement réversible) et « supprimer » (`deleted_at` renseigné, soft delete) n'est décrite par aucun UC ni aucune note de dictionnaire — les deux mécanismes existent, mais leur cas d'usage respectif (quelle action UI déclenche laquelle) est `NON DÉTERMINÉ PAR LES SOURCES`. Voir D-CREDIT-LR-02 (§22).

**Conséquence positive, déjà établie par §7** : comme aucun `Loan` ne référence `loan_rules` par FK, désactiver ou supprimer une règle de crédit **n'a structurellement aucun effet** sur les prêts déjà émis sous cette règle — un risque d'intégrité référentielle qui ne se pose pas, contrairement à ce qu'on pourrait craindre a priori.

## 17. Soft delete

`deleted_at` existe (§16). Questions du mandat :

- **Une `LoanRule` supprimée reste-t-elle référencée ?** Par construction, non — aucune FK entrante n'existe (§7), donc rien ne « référence » une règle supprimée au sens intégrité référentielle. Un `Loan` déjà émis sous cette règle ne porte aucune trace structurelle de cette règle (son propre `interest_rate`/`duration_months` etc. sont ses champs propres, indépendants).
- **Peut-elle être réactivée ?** `NON DÉTERMINÉ PAR LES SOURCES` — aucune UC ne décrit de flux de restauration après soft delete pour cette entité spécifiquement. Le pattern déjà établi ailleurs dans ce projet (`users.is_active` : true⇄false réversible, mais **pas** de `deleted_at` sur `users`) n'est pas directement transposable ici, puisque `loan_rules` a les deux mécanismes simultanément (§16), une situation inédite dans ce qui a été audité jusqu'ici.
- **Peut-elle être recréée ?** Techniquement oui (`UNIQUE(tenant_id, account_id)` porterait probablement sur les lignes non supprimées uniquement — `NON DÉTERMINÉ`, aucune source ne précise si la contrainte `UNIQUE` s'applique aux lignes soft-deleted ou les exclut).
- **L'unicité tient-elle compte du soft delete ?** `NON DÉTERMINÉ PAR LES SOURCES` — la contrainte `uq_loan_rules_account = UNIQUE(tenant_id, account_id)` ne précise pas de clause `WHERE deleted_at IS NULL` (contrairement à d'autres contraintes partielles vues ailleurs dans le même dictionnaire, ex. `uq_subscriptions_tenant_active`).

**Aucune de ces questions n'a été tranchée par supposition** — chacune reste `DECISION_REQUIRED` si un jour pertinente, regroupée avec D-CREDIT-LR-02.

## 18. Offline / Backend

**Offline (Mobile)** : sans objet direct pour cette mission (le domaine Credit n'existe pas côté Mobile, §10) — si un jour construit, le pattern déjà utilisé par Governance Mobile (`TenantScopedRepository`/`OutboxRepository`, filtrage `WHERE tenant_id = ?` direct, pas de jointure nécessaire grâce au `tenant_id` direct confirmé §6/§13) s'appliquerait sans adaptation structurelle particulière — plus simple que `attendances`, qui nécessite une jointure.

**Backend** : `BACKEND_PENDING` standard, comme l'intégralité du projet — aucune API réelle n'existe pour `loan_rules` ni pour aucune autre entité Credit. Le mécanisme mock/local déjà en place (`mockRequest`, `getTenantScoped`) suffirait structurellement pour une première implémentation frontend, sans rien inventer de nouveau.

## 19. Doublons

Recherche des concepts proches (`loan_rules`, `LoanRule`, `LoanPolicy`, `loan_policies`, « loan conditions », « credit rules », « lending rules ») dans `tanzen-frontend` : **aucun doublon trouvé**. Le seul champ apparenté déjà existant, `Loan.interestRate` (`src/mocks/finance/loans.ts`), est un champ inline sur chaque prêt, indépendant de toute règle de crédit — ce n'est pas un doublon conceptuel de `loan_rules`, c'est la donnée finale déjà « décidée » pour un prêt individuel (potentiellement future source d'incohérence si `loan_rules` est un jour implémenté sans règle de cohérence entre les deux — signalé, pas un doublon aujourd'hui).

## 20. Contradictions

| # | Sujet | Source A | Source B | Priorité | Impact | Bloquant |
|---|---|---|---|---|---|---|
| CT-LR-01 (nouveau) | `interest_type` — valeurs | Dictionnaire : `FIXED/REDUCING/FLAT` | Diagramme `DC_TANZEN_Crédit.png` : `fixed/simple/compound` | Dictionnaire | Le diagramme ne doit pas être utilisé comme source de valeurs pour ce champ | Non — dictionnaire déjà suffisant et prioritaire |
| CT-LR-02 (nouveau) | Durée — structure | Dictionnaire : `duration_months` (valeur unique) | Diagramme : `min_duration`/`max_duration` + `duration_unit` (plage + unité) | Dictionnaire | Ne pas implémenter une plage de durée non canonique | Non |
| CT-LR-03 (nouveau) | Statut — représentation | Dictionnaire : `status ENUM ACTIVE/INACTIVE` (+ `deleted_at` séparé) | Diagramme : `is_active BOOLEAN` (fusionne les deux notions du dictionnaire en une seule) | Dictionnaire | Le diagramme perd la distinction statut/suppression logique que le dictionnaire porte explicitement — à ne pas reproduire | Non, mais alimente D-CREDIT-LR-02 |
| CT-LR-04 (nouveau) | Champs additionnels non canoniques | Dictionnaire : silencieux | Diagramme : `minimum_saving_balance`, `minimum_membership_months`, `minimum_contributions`, `late_penalty_rate`, `grace_period_days` | Dictionnaire (silence, pas de `CHECK` ni de colonne) | `MODEL_GAP` si un jour demandés — ne pas les implémenter sans confirmation canonique | Non |
| CT-LR-05 (déjà cataloguée, non nouvelle) | `loan_rules` vs `LoanPolicy` (nommage) | — | — | Résolue par les deux missions de nommage précédentes | — | Non, close |
| CT-LR-06 (nouveau, mineure) | Incohérence interne au dictionnaire | `loan_mode`/`guarantee_type_required`/`approval_level`/`status` : valeurs documentées mais `CHECK` non nommé | — (même fiche) | Dictionnaire, incohérence interne (§4.1) | Aucun aujourd'hui — les valeurs documentées restent la meilleure information disponible | Non |

## 21. Décisions existantes (respectées, non rouvertes)

- `loan_rules` = terminologie officielle (`docs/LOAN_RULES_NORMALIZATION_REPORT.md`).
- `LoanPolicy` = terminologie abandonnée.
- `Account → loan_rules` = relation confirmée (§6, reconfirmée par cette mission).
- Aucune FK `Loan → loan_rules` confirmée (§7, reconfirmée).
- Aucun `loan_policy_id` (respecté — non créé).
- Aucun `loan_rule_id` sans source canonique (respecté — non créé, aucune source ne le démontre).
- Sujet BLOQUANT 3 de `PHASE_07_DECISIONS_A_VALIDER.md` (taux d'intérêt) — non rouvert, référencé §15.
- Sujets BLOQUANT 1/2 de `PHASE_07_DECISIONS_A_VALIDER.md` (`transactions.create`, `accounts.update`) — non rouverts, cités §12 pour leur parenté structurelle avec D-CREDIT-LR-01.

## 22. Nouvelles décisions

### D-CREDIT-LR-01 — Quelle(s) permission(s) RBAC pour `loan_rules` ?

**Contexte** : aucune permission `loanRules.*`/`creditPolicy.*` n'existe dans le catalogue actuel (§12) ; réutiliser `loans.*`/`accounts.*` serait sémantiquement incorrect (entités distinctes). Ce gap est structurellement identique aux sujets 1/2 déjà catalogués par `PHASE_07_DECISIONS_A_VALIDER.md`.

**Options** :
- (a) Une seule permission `loanRules.manage` couvrant Consulter/Créer/Modifier/Désactiver-Supprimer.
- (b) Granularité fine, cohérente avec le reste du catalogue (`loanRules.read`/`loanRules.create`/`loanRules.update`/`loanRules.delete`).
- (c) Réutiliser une permission existante sous une nouvelle sémantique documentée (non recommandé — risque de confusion déjà signalé pour d'autres domaines, ex. la fuite `tenants.read` sur `/organization/*`).

**Avantages/Inconvénients** : (a) simple, cohérent avec `securityPolicies.manage`/`modules.manage` déjà présents dans le catalogue pour d'autres domaines de configuration transverse ; (b) plus granulaire, cohérent avec `accounts.*`/`loans.*`/`applications.*` déjà en place pour le même domaine Credit, mais 4 permissions pour une seule entité de configuration.

**Impact métier** : détermine qui, précisément, peut configurer les conditions de prêt d'un tenant — une action sensible (montants/taux/garanties). **Impact technique** : aucun changement de code nécessaire tant que non tranché — bloque uniquement la construction d'un futur écran.

**Recommandation** : aucune tranchée à la place du Product Owner — question ouverte, à trancher avant toute implémentation.

**Statut** : **BLOQUANT** pour l'intégralité du périmètre `loan_rules` (aucune fonctionnalité ne peut être gardée par RBAC sans cette décision).

### D-CREDIT-LR-02 — Distinction `status` (ACTIVE/INACTIVE) vs `deleted_at` (soft delete)

**Contexte** : les deux mécanismes coexistent sur `loan_rules` (§16/§17), sans qu'aucune source ne précise quelle action UI (« Désactiver » vs « Supprimer ») déclenche lequel, ni si une règle désactivée/supprimée peut être réactivée/recréée, ni si l'unicité `(tenant_id, account_id)` tient compte des lignes soft-deleted.

**Options** :
- (a) `status = INACTIVE` = désactivation réversible (empêche l'octroi de nouveaux prêts sous cette règle, mais la règle reste visible/modifiable) ; `deleted_at` = suppression définitive (masquée de toute liste active, non réversible depuis l'UI).
- (b) Les deux mécanismes fusionnés en un seul geste UI (« Supprimer » applique les deux simultanément) — plus simple, mais redondant avec deux champs canoniques distincts.
- (c) Autre répartition, à définir par le Product Owner.

**Avantages/Inconvénients** : (a) exploite pleinement le modèle canonique (deux champs, deux usages distincts, cohérent avec les contraintes déjà nommées) ; (b) plus simple à construire mais laisse un champ canonique (`status` ou `deleted_at`) inutilisé, ce qui serait une implémentation partielle du modèle sans justification.

**Impact métier** : détermine si un Trésorier/Admin Tenant peut « geler » temporairement une politique de crédit sans la perdre. **Impact technique** : conditionne le schéma exact des futures fonctions `deactivateLoanRule`/`deleteLoanRule` (une ou deux fonctions distinctes).

**Recommandation** : aucune tranchée — observation de cohérence en faveur de l'option (a), qui seule exploite les deux champs canoniques sans en laisser un inutilisé, sans emporter de décision.

**Statut** : **Bloquant uniquement pour le sous-cas Désactiver/Supprimer** — indépendant de D-CREDIT-LR-01, n'empêcherait pas un GO partiel « Consulter + Créer + Modifier » si D-CREDIT-LR-01 était résolue seule.

## 23. Matrice GO / NO-GO

| Fonctionnalité | UC | Modèle | RBAC | Tenant | Account | Offline | Backend | Décision | Statut |
|---|---|---|---|---|---|---|---|---|---|
| Consulter une règle de crédit | UC60-03 (« Gérer », implicite) | GO (fiche #14 complète) | Aucune permission | Direct, simple (§13) | `account_id` requis | N/A (Mobile absent) | `BACKEND_PENDING` standard | D-CREDIT-LR-01 | 🟡 **DECISION_REQUIRED** |
| Lister les règles de crédit (par tenant/par compte) | UC60-03 (implicite) | GO | Aucune permission | Direct, simple | `account_id` requis | N/A | `BACKEND_PENDING` | D-CREDIT-LR-01 | 🟡 **DECISION_REQUIRED** |
| Créer une règle de crédit | UC60-03 (Confirmé) | GO | Aucune permission | Direct, simple | `UNIQUE(tenant_id, account_id)` à respecter | N/A | `BACKEND_PENDING` | D-CREDIT-LR-01 | 🟡 **DECISION_REQUIRED** |
| Modifier une règle de crédit | UC60-03 (« Gérer », implicite) | GO | Aucune permission | Direct, simple | — | N/A | `BACKEND_PENDING` | D-CREDIT-LR-01 | 🟡 **DECISION_REQUIRED** |
| Désactiver une règle de crédit (`status=INACTIVE`) | Non sourcée explicitement — déduite du champ `status` | GO (champ existe) | Aucune permission | Direct, simple | Aucun impact sur les `Loan` déjà émis (§16) | N/A | `BACKEND_PENDING` | D-CREDIT-LR-01 **+** D-CREDIT-LR-02 | 🟡 **DECISION_REQUIRED** |
| Supprimer une règle de crédit (`deleted_at`) | Non sourcée explicitement — déduite du champ `deleted_at` | GO (champ existe) | Aucune permission | Direct, simple | Idem | N/A | `BACKEND_PENDING` | D-CREDIT-LR-01 **+** D-CREDIT-LR-02 | 🟡 **DECISION_REQUIRED** |
| Utiliser `loan_rules.interest_rate` comme source du taux à la création d'un `Loan` | UC60-01 (indirect) | Champ existe, usage non documenté | — | — | — | N/A | `BACKEND_PENDING` | `PHASE_07_DECISIONS_A_VALIDER.md` sujet 3 (non rouvert) | 🟡 **DECISION_REQUIRED** (hors périmètre direct de `loan_rules`) |
| Champs additionnels du diagramme (`late_penalty_rate`, `grace_period_days`, `minimum_saving_balance`, plage de durée) | — | `MODEL_GAP` (§5, CT-LR-04) | — | — | — | — | — | Confirmation canonique nécessaire | 🟣 **MODEL_GAP** |

**Aucune fonctionnalité n'est classée 🟢 GO ni 🔴 NO-GO complet.** Le modèle lui-même n'est jamais le facteur bloquant (contrairement à d'autres entités déjà auditées dans ce projet, ex. `TontinePosition`) — **le seul facteur bloquant commun à toutes les fonctions CRUD de base est l'absence de permission RBAC (D-CREDIT-LR-01)**, une décision unique qui, si tranchée, débloquerait immédiatement Consulter/Lister/Créer/Modifier ; Désactiver/Supprimer resteraient conditionnées à une seconde décision (D-CREDIT-LR-02).

## 24. Périmètre recommandé

```
IMPLEMENTABLE (dès résolution de D-CREDIT-LR-01 seule)
--------------------------------------------------------
- Consulter une règle de crédit (par compte)
- Lister les règles de crédit du tenant courant
- Créer une règle de crédit (rattachée à un Account du tenant)
- Modifier une règle de crédit

IMPLEMENTABLE (dès résolution de D-CREDIT-LR-01 ET D-CREDIT-LR-02)
--------------------------------------------------------
- Désactiver une règle de crédit (status = INACTIVE)
- Supprimer une règle de crédit (deleted_at)

MODEL_GAP — NE PAS IMPLÉMENTER SANS CONFIRMATION CANONIQUE
--------------------------------------------------------
- late_penalty_rate, grace_period_days
- minimum_saving_balance, minimum_membership_months, minimum_contributions
- Plage min_duration/max_duration + duration_unit (le canonique n'a
  qu'un duration_months unique)

DECISION_REQUIRED, hors périmètre direct de loan_rules
--------------------------------------------------------
- Utilisation de loan_rules.interest_rate à l'auto-création d'un
  Loan au décaissement (PHASE_07_DECISIONS_A_VALIDER.md sujet 3,
  non rouvert par cet audit)

BACKEND_PENDING
--------------------------------------------------------
Standard, comme toutes les entités du projet.

OUT_OF_SCOPE
--------------------------------------------------------
- tanzen-mobile (domaine Credit non entamé, aucune action requise
  par cet audit)
- tanzen-commercial (hors périmètre du domaine)
- Toute relation directe Loan → loan_rules (non canonique, §7)
```

**Aucun sous-périmètre n'est actionnable aujourd'hui sans validation d'au moins D-CREDIT-LR-01** — le modèle canonique, lui, ne bloque rien.

## 25. Tests futurs (à ne pas écrire maintenant)

Si un GO est donné après résolution de D-CREDIT-LR-01 (et D-CREDIT-LR-02 pour Désactiver/Supprimer) :
- **Migration** : table `loan_rules`, 30 colonnes (§4), contraintes `UNIQUE(uuid)`/`UNIQUE(tenant_id, account_id)`/`UNIQUE(tenant_id, name)`, 9 `CHECK` nommés + éventuellement les 4 listes de valeurs non formalisées (§4.1, à trancher si elles doivent devenir des `CHECK` réels au moment de l'implémentation).
- **Modèle/Repository** : `list`/`get` filtrés `tenant_id` direct (pas de jointure requise, contrairement à `attendances` — §13) ; refus cross-tenant testé explicitement (T-001 → T-002).
- **Relation Account → loan_rules** : test de la contrainte `UNIQUE(tenant_id, account_id)` — tentative de création d'une deuxième règle pour le même compte, refusée ; test qu'un `account_id` d'un autre tenant est refusé à la création.
- **Service** : validations `ck_amount_valid`/`ck_interest_valid`/`ck_duration_valid`/`ck_guarantee_ratio`/`ck_guarantor_count` répliquées côté service (mock), pas seulement documentées.
- **RBAC** : refus/autorisation selon la permission tranchée par D-CREDIT-LR-01.
- **Statut/soft delete** : selon D-CREDIT-LR-02 — au minimum, test qu'aucun `Loan` existant n'est affecté par la désactivation/suppression d'une règle (confirmation du constat §16).
- **Régression** : `credit.service.test.ts` existant (si présent) non cassé — `createLoan` continue de fonctionner indépendamment, même une fois `loan_rules` introduite (pas de FK, §7).
- **i18n** : FR/EN, aucun texte hardcodé.
- **Build/typecheck/lint** : `tanzen-frontend` seul concerné (Mobile/Commercial hors périmètre).

## 26. Conclusion

`loan_rules` dispose d'un modèle canonique riche et directement exploitable (fiche #14, 30 champs, 13 contraintes nommées), d'une relation `Account → loan_rules` confirmée par deux sources concordantes, et de l'absence tout aussi bien confirmée de relation directe avec `Loan` — un socle de données solide, plus simple à isoler par tenant que d'autres entités déjà auditées dans l'écosystème TANZEN (`attendances`, Mobile). **Le blocage n'est pas un problème de modèle mais un problème de gouvernance RBAC** : aucune permission n'existe pour cette entité, un gap de la même nature que deux sujets déjà catalogués et toujours ouverts (`PHASE_07_DECISIONS_A_VALIDER.md` sujets 1/2). Un second point, plus mineur, reste à trancher pour la partie Désactiver/Supprimer (coexistence `status`/`deleted_at`, D-CREDIT-LR-02). Le sujet du taux d'intérêt à l'auto-création d'un `Loan` (sujet 3 de Phase 7) reste distinct, non rouvert, et non résolu par cet audit malgré la présence bien documentée d'un champ `interest_rate` sur `loan_rules`. **Réponse à la question posée par le mandat : `loan_rules` ne peut pas recevoir aujourd'hui un GO d'implémentation complet — un GO partiel (Consulter/Lister/Créer/Modifier) deviendrait immédiatement actionnable dès la seule résolution de D-CREDIT-LR-01.**

---

## 27. Vérification finale — aucune modification

```
git status --short
```
exécuté avant et après cette mission, dans les trois projets : **identique**. `tanzen-frontend` : aucun fichier `src/`/`app/`/`tests/`/`mocks/`/`services/`/`repositories/`/`routes/`/`locales/`/`migrations/`/`database/` modifié — seul `docs/P1_CREDIT_LOAN_RULES_AUDIT.md` (ce document) est nouveau. `tanzen-mobile` : aucun changement (déjà en cours depuis les missions précédentes, non touché par celle-ci). `tanzen-commercial` : aucun changement (`git status --short` vide).
