# TANZEN — Phase 05 : Analyse détaillée des diagrammes de classes

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce document. `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` est le seul fichier créé par cette mission. Les 7 images de `docs/Diagrammes de classes/` ont été rouvertes et relues directement, attribut par attribut, pour cette mission — rien n'est recopié sans revérification depuis `AUDIT_PHASE_01.md`, qui traitait ces diagrammes au niveau entité (32 entités listées, §3.1) et non au niveau attribut/cardinalité. Les décisions déjà verrouillées par `PHASE_02_MODELE_CANONIQUE_FINAL.md` et les 299 cas d'utilisation déjà classifiés par `PHASE_04_USE_CASE_CLASSIFICATION.md` sont pris comme acquis et cités, jamais rejoués.

**Règle suivie systématiquement** : aucun attribut, méthode, relation ou classification n'est inventé. Quand un diagramme ne montre pas quelque chose (ex. pas de méthode, pas de champ `tenant_id`), cela est déclaré explicitement plutôt que comblé. Aucune ambiguïté n'est transformée en décision ; les 5 contradictions de `PHASE_04_USE_CASE_CLASSIFICATION.md` §8 sont traitées avec la structure imposée, y compris quand la conclusion est « NON RÉSOLU PAR LES SOURCES DISPONIBLES ».

**Périmètre frontend vérifié pour cette mission** : `tanzen-frontend/src/features/` = `access, audit, dashboard, finance, operations, organization, platform, public, settings, tontines` (10 dossiers, dont `public` et `platform` hors application tenant) ; `tanzen-frontend/src/services/` = `api-client, audit, credit, dashboard, document, finance, notification, organization, query-keys, role, session, settings, tenant-scope, tontines, user, workflow` (16 fichiers) ; routes réelles extraites de `src/routes/app-router.tsx` et des `*-module.tsx` de chaque domaine (détail en §12). **Constat important à ne pas perdre de vue dans la lecture de tout ce document** : ce périmètre frontend est sensiblement plus riche que celui analysé par `AUDIT_PHASE_01.md` (qui portait sur `tanzen-frontend-claude/src`, un projet voisin distinct, par choix de périmètre explicite de cette mission antérieure — cf. `PHASE_02_DECISIONS_CANONIQUES.md` note de périmètre). Des éléments qu'`AUDIT_PHASE_01.md` documentait comme **ABSENT** (tirage de tontine, `LoanGuarantor`, Gouvernance/Bureau Exécutif) sont en réalité **construits** dans ce dépôt-ci — signalé explicitement chaque fois que pertinent, sans jamais corriger silencieusement les documents précédents.

---

## 1. Executive Summary

- **7/7 diagrammes de classes relus intégralement** comme images, attribut par attribut : `DC_TANZEN_Tontines`, `DC_TANZEN_Administration_et_Multi-tenant`, `DC_TANZEN_Membres_et_Bureau-Exécutif`, `DC_TANZEN_Gouvernance_et_Documents`, `DC_TANZEN_Caisses_et_Cotisations`, `DC_TANZEN_Crédit`, `DC_TANZEN_Réunions_et_présences`.
- **32 classes uniques** recensées après dédoublonnage (dont `Tenant` et `Member`/`Members` apparaissent, redessinées, dans respectivement 6 et 5 des 7 diagrammes — classes transversales de fait). Ce chiffre confirme indépendamment le compte de `AUDIT_PHASE_01.md` §3.1, obtenu ici par une méthode différente (relecture attribut par attribut plutôt que recensement de noms de table).
- **Aucune interface UML, aucune méthode/opération, aucune relation de généralisation (héritage) et aucune notation formelle d'agrégation/composition (losange) ne sont présentes sur les 7 diagrammes.** Ce sont des diagrammes de classes de type « schéma physique » (colonnes typées, `PK`/`FK`/`UQ`/`CHECK`, cardinalités `1..*`) sans comportement modélisé — constat systémique détaillé en §2.
- **≈55 relations dessinées** au total (détail par diagramme en §2), toutes de type association simple porteuse d'une cardinalité `1..*`, jamais de losange d'agrégation/composition.
- **≈35 champs contraints (`ENUM`/`CHECK`)** recensés à travers les 7 diagrammes (détail exhaustif par diagramme en §2).
- **5 contradictions de `PHASE_04_USE_CASE_CLASSIFICATION.md` §8** reprises avec la structure imposée (§10) : **1 illuminée** par les diagrammes de classes (CT-02, rôles métier nommés — confirmée compatible avec la couche `Position`/`Mandate` déjà visible dans `DC_Membres_et_Bureau-Exécutif`), **4 rendues « NON RÉSOLU PAR LES SOURCES DISPONIBLES »** faute d'élément de classe pertinent (CT-01, CT-03, CT-04, CT-05).
- **3 nouvelles contradictions** (NC-01 à NC-03) et **plusieurs incohérences de granularité** sont révélées par la lecture attribut-par-attribut de cette mission — notamment l'absence totale des classes RBAC dynamiques (`Roles`/`Permissions`/`Role_permissions`/`Users_roles`/`Modules`) sur les 7 diagrammes malgré leur statut CANONIQUE verrouillé (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 6), et l'absence de colonne `tenant_id` directe sur 10 des 32 classes (au-delà des 2 déjà signalées par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4).
- **Anomalies** classées par gravité en §13 : le détail chiffré est donné dans cette section (2 CRITICAL, 7 IMPORTANT, 4 MINOR, 3 AMBIGUOUS, 3 INFORMATIONAL).
- **Le modèle `TontineCycle`** (§6, focus imposé) est vérifié conforme à la chaîne attendue `Tontine 1─N TontineCycle 1─N CycleMember`, `TontineCycle 1─N TontineDraw`, `TontineCycle 1─N TontineBid` — avec un écart : le diagramme relie `TontineCycle` à `TontineContribution` **nulle part**, cette dernière classe étant totalement absente des 7 diagrammes (alors que canonique dans le dictionnaire, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §1.1). `TontinePosition`/`PositionPayment` restent confirmées absentes des 7 diagrammes, statut inchangé par rapport à `AUDIT_PHASE_01.md`.
- **Validation technique (informationnel, non lié à cette analyse)** : `npx tsc --noEmit` → **0 erreur**. `npx eslint .` → **0 erreur, 14 warnings** préexistants (`react-refresh/only-export-components`, non liés à cette mission). `npm run build` → **succès** (10,17 s), avertissement préexistant sur un chunk `index-CA7-_63C.js` de 905 kB (>500 kB), déjà documenté dans `POST_MIGRATION_VALIDATION_REPORT.md`. Rien n'a été modifié pour obtenir ce résultat.

---

## 2. Inventaire des diagrammes

Pour chaque diagramme : domaine, classes, énumérations, relations et cardinalités, absence d'interfaces/méthodes/héritage/agrégation-composition (constat commun, rappelé une fois puis non répété par diagramme), dépendances vers des classes dessinées dans un autre diagramme.

**Constat commun aux 7 diagrammes** : notation de type schéma physique (rectangles à trois compartiments implicites : nom de classe, liste de colonnes avec type/contrainte, index) plutôt que notation UML de classe stricte. Aucune classe ne porte de méthode/opération. Aucune relation de généralisation/héritage. Aucun losange d'agrégation ou de composition — toutes les relations sont des associations simples, dessinées comme des flèches uniques portant une cardinalité `1..*` (lue de la classe source vers la classe cible), jamais de paire `0..1`/`0..*` observée. Aucune interface (`«interface»`) sur aucun des 7 diagrammes.

### 2.1 `DC_TANZEN_Tontines.png`

**Domaine** : Tontines (+ dépendance Members, Organization via `Tenant`).

**Classes (8)** : `Tenant`, `Tontine`, `TontineCycle`, `CycleMember`, `Member`, `TontineDraw`, `TontineBid`, `DrawWinner`.

**Attributs notables (avec types)** :
- `Tenant` : jeu complet identique à celui détaillé en §2.2 (classe transversale, redessinée ici sans divergence de fond).
- `Tontine` : `id BIGINT PK`, `uuid CHAR(36) UQ`, `tenant_id FK`, `name VARCHAR(255)`, `description TEXT`, `frequency ENUM(daily, weekly, monthly)`, `default_contribution_amount DECIMAL(15,2)`, `status ENUM(draft, active, completed, cancelled)`, `sync_status ENUM`, `version INT`, `created_at/updated_at/deleted_at TIMESTAMP`.
- `TontineCycle` : `id BIGINT PK`, `uuid CHAR(36) UQ`, `tontine_id FK`, `cycle_code VARCHAR(100)`, `start_date DATE`, `end_date DATE`, `member_count INT`, `contribution_amount DECIMAL(15,2)`, `total_draws INT`, `status ENUM(planned, active, completed, cancelled)`, `sync_status ENUM`, `version INT`, `created_at/updated_at/deleted_at TIMESTAMP`. **Aucun champ `tenant_id` direct.**
- `CycleMember` : `id BIGINT PK`, `uuid CHAR(36)`, `cycle_id FK`, `member_id FK`, `initial_rank INT`, `join_date DATE`, `status ENUM(active, withdrawn, excluded)`, `sync_status ENUM`, `version INT`, `created_at/updated_at/deleted_at TIMESTAMP`. **Aucun champ `tenant_id` direct.**
- `Member` : `id BIGINT PK`, `uuid CHAR(36) UQ`, `tenant_id FK`, `matricule VARCHAR(50)`, `first_name/last_name VARCHAR(100)`, `gender ENUM(M,F)`, `phone VARCHAR(50)`, `email VARCHAR(255)`, `join_date DATE`, `status ENUM(active, inactive)`, `sync_status ENUM`, `version INT`, `created_at/updated_at/deleted_at TIMESTAMP`.
- `TontineDraw` : `id BIGINT PK`, `uuid CHAR(36) UQ`, `cycle_id FK`, `draw_number INT`, `draw_date DATE`, `scheduled_member_id FK`, `actual_winner_id FK`, `draw_type ENUM(normal, auction)`, `winning_bid DECIMAL(15,2)`, `status ENUM(pending, completed, cancelled)`, `created_at/updated_at TIMESTAMP`. **Aucun champ `tenant_id` direct.**
- `TontineBid` : `id BIGINT PK`, `uuid CHAR(36)`, `draw_id FK`, `member_id FK`, `amount DECIMAL(15,2)`, `status ENUM(pending, winner, rejected, cancelled)`, `created_at TIMESTAMP`. **Aucun champ `tenant_id` direct.**
- `DrawWinner` : `id BIGINT PK`, `uuid CHAR(36) UQ`, `draw_id FK`, `member_id FK`, `contribution_pool DECIMAL(15,2)`, `amount_received DECIMAL(15,2)`, `bid_amount DECIMAL(15,2)`, `created_at TIMESTAMP`. **Aucun champ `tenant_id` direct.**

**Relations et cardinalités (12, toutes `1..*`)** : `Tenant→Tontine` (« owns ») · `Tenant→Member` (« owns ») · `Tontine→TontineCycle` (« cycles ») · `TontineCycle→CycleMember` (« participants ») · `TontineCycle→TontineDraw` (« draws ») · `TontineCycle→TontineBid` (« bids ») · `Member→CycleMember` (« participates ») · `Member→TontineBid` (« places ») · `Member→TontineDraw` via `scheduled_member_id` (« scheduled_member ») · `Member→TontineDraw` via `actual_winner_id` (« actual_winner ») · `Member→DrawWinner` (« winner ») · `TontineDraw→DrawWinner` (« receives »).

**Absent de ce diagramme** : `TontineContribution`/`tontine_contributions` (canonique dans le dictionnaire, cf. `PHASE_02_MODELE_CANONIQUE_FINAL.md` §1.1, mais **aucune classe correspondante n'est dessinée ici**) ; `TontinePosition`/`PositionPayment` (statut inchangé, absents — cf. §8) ; `Tontine_draw_engine` (jamais une classe, cohérent avec `PHASE_02_DECISIONS_CANONIQUES.md` sujet 15).

**Classe transversale** : `Tenant` et `Member` sont redessinés ici à l'identique (structurellement) de leur apparition dans les autres diagrammes — cf. §3.

### 2.2 `DC_TANZEN_Administration_et_Multi-tenant.png`

**Domaine** : Organization (Platform) / Settings / Audit.

**Classes (7)** : `TENANTS`, `USERS`, `PLANS`, `SUBSCRIPTIONS`, `PAYMENTS`, `BACKUPS`, `AUDIT_LOGS`.

**Attributs notables** :
- `TENANTS` : `id PK BIGINT`, `uuid UQ CHAR(36)`, `code UQ VARCHAR(100)`, `name VARCHAR(255) NOT NULL`, `short_name VARCHAR(100)`, `slug UQ VARCHAR(255)`, `organization_type VARCHAR(30)` + `CHECK(association,tontine,cooperative,church,company,community,other)`, `description TEXT`, `slogan/logo/cover_image VARCHAR(255)`, `email VARCHAR(255) UNIQUE`, `phone/whatsapp_number VARCHAR(50)`, `supported_locales JSON`, `country` (défaut Cameroon), `city VARCHAR(100)`, `currency_code` (défaut XAF), `language_code` (défaut fr), `timezone` (défaut Africa/Douala), `subscription_plan VARCHAR(20)` + `CHECK(free,starter,standard,premium,enterprise)`, `status VARCHAR(20)` + `CHECK(pending,active,suspended,expired)`, `sync_status` + `CHECK(local,synced,pending,conflict)`, `version INT DEFAULT 1`, `created_at/updated_at/deleted_at TIMESTAMP`, index `IDX(code,slug,email,status)`.
- `USERS` : `id PK`, `uuid UQ`, `tenant_id FK→TENANTS.id`, `name`, `email`, `phone`, `password VARCHAR(255)`, `preferred_language VARCHAR(10)`, **`role VARCHAR(20)` + `CHECK(owner,admin,manager,treasurer,secretary,member)`**, `is_active BOOLEAN`, `last_login_at`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `IDX(tenant_id,email,role)`.
- `PLANS` : `id PK`, `code UQ VARCHAR(50)`, `name`, `description TEXT`, `max_users INT`, `max_storage_mb INT`, `monthly_price/annual_price NUMERIC(15,2)`, `is_active BOOLEAN`, `created_at/updated_at`, index `IDX(code,is_active)`.
- `SUBSCRIPTIONS` : `id PK`, `tenant_id FK`, `plan_id FK`, `start_date/end_date DATE`, `status VARCHAR(20)` + `CHECK(active,expired,cancelled)`, `auto_renew BOOLEAN`, `trial_end_date DATE`, `created_at/updated_at`, index `IDX(tenant_id,plan_id,status)`.
- `PAYMENTS` : `id PK`, `subscription_id FK`, `amount NUMERIC(15,2)`, `currency VARCHAR(10)`, `payment_method VARCHAR(30)` + `CHECK(cash,bank_card,mobile_money,transfer)`, `payment_status VARCHAR(20)` + `CHECK(pending,paid,failed,refunded)`, `payment_date`, `reference VARCHAR(100)`, `transaction_id VARCHAR(100)`, index `IDX(subscription_id,payment_status,payment_date)`.
- `BACKUPS` : `id PK`, `tenant_id FK`, `backup_type VARCHAR(30)` + `CHECK(manual,automatic,scheduled)`, `backup_date`, `file_path VARCHAR(500)`, `size_mb NUMERIC(10,2)`, `status VARCHAR(20)` + `CHECK(pending,completed,failed)`, `created_at`, index `IDX(tenant_id,backup_date,status)`.
- `AUDIT_LOGS` : `id PK`, `uuid UQ`, `tenant_id FK`, `user_id FK→USERS.id`, `module VARCHAR(100)`, `action VARCHAR(100)`, `entity VARCHAR(100)`, `entity_id BIGINT`, `description TEXT`, `ip_address VARCHAR(45)`, `user_agent VARCHAR(255)`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `IDX(tenant_id,user_id,module,action)`.

**Relations et cardinalités (7, toutes `1..*`)** : `TENANTS→USERS` · `TENANTS→BACKUPS` · `TENANTS→SUBSCRIPTIONS` · `TENANTS→AUDIT_LOGS` · `PLANS→SUBSCRIPTIONS` · `SUBSCRIPTIONS→PAYMENTS` · `USERS→AUDIT_LOGS`.

**Absent de ce diagramme** : `Roles`, `Permissions`, `Role_permissions`, `Users_roles`, `Modules` — **aucune des 5 classes du RBAC dynamique canonique n'est dessinée**, alors que ce modèle est verrouillé CANONIQUE (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 6) et alors que `USERS.role` (colonne unique visible ici) est explicitement l'artefact obsolète que ce verrouillage écarte. Voir NC-02 en §10.

**Point relevé** : la cardinalité `TENANTS 1..* USERS` implique qu'aucune ligne `USERS` ne peut exister sans `tenant_id` — en tension avec les acteurs « Super Administrateur »/« administrateur plateforme » de `PHASE_04_USE_CASE_CLASSIFICATION.md` UC01-11 à UC01-14, décrits comme n'appartenant à aucun tenant (UC-00 : « Ne fait partie d'aucun tenant »). Voir NC-01 en §10.

### 2.3 `DC_TANZEN_Membres_et_Bureau-Exécutif.png`

**Domaine** : Governance (+ dépendance Members).

**Classes (6)** : `Tenant`, `Member`, `Position`, `BoardMember`, `Mandate`, `FiscalYear`.

**Attributs notables** :
- `Position` : `id PK`, `uuid CHAR(36)`, `tenant_id FK`, `code VARCHAR(50)`, `name VARCHAR(255)`, `scope` (`board`/`executive`/`committee`, valeurs libres non formalisées en `CHECK` sur ce rendu), `description TEXT`, `is_system BOOLEAN`, `sync_status`, `version`, `created_at/updated_at/deleted_at`.
- `BoardMember` : `id PK`, `tenant_id FK`, `member_id FK`, `position_id FK`, `remarks TEXT`, `sync_status VARCHAR(20)`, `version INT`, `created_at/updated_at/deleted_at`.
- `Mandate` : `id PK`, `tenant_id FK`, `board_member_id FK`, `fiscal_year_id FK`, `start_date/end_date DATE`, `status` (`planned`/`active`/`ended`/`revoked`), `reason TEXT`, `is_current BOOLEAN`, `sync_status`, `version`, `created_at/updated_at/deleted_at`.
- `FiscalYear` : `id PK`, `tenant_id FK`, `code VARCHAR(50)`, `name VARCHAR(255)`, `start_date/end_date DATE`, `status` (`open`/`closed`), `opening_balance/closing_balance/total_income/total_expenses NUMERIC`, `sync_status`, `version`, `created_at/updated_at/deleted_at`.

**Relations et cardinalités (9, toutes `1..*`)** : `Tenant→Member` · `Tenant→Position` · `Tenant→BoardMember` · `Tenant→Mandate` · `Tenant→FiscalYear` · `Member→BoardMember` · `Position→BoardMember` · `BoardMember→Mandate` · `FiscalYear→Mandate`.

**Annotation manuscrite « Fusionnés »** (cercle rouge) : entoure **`BoardMember` et `Mandate`**, confirmant à l'identique le constat D-02 de `AUDIT_PHASE_01.md` — l'intention de fusion est notée graphiquement mais **non exécutée** dans ce diagramme : les deux classes restent séparées avec une FK explicite `Mandate.board_member_id → BoardMember.id`. Rappel (déjà tranché, non rejoué ici) : le dictionnaire canonique a, lui, exécuté cette fusion en une seule table `board_mandates` (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 14) — ce diagramme est donc en retard sur le dictionnaire, constat déjà établi, reconfirmé ici au niveau attribut.

**Absent de ce diagramme** : `Committee`/`CommitteeMember` (cité par UC30-20/21/22, `PHASE_04_USE_CASE_CLASSIFICATION.md`, jamais modélisé ici ni ailleurs) ; `Boards` (référencée nulle part sur ce diagramme — c'est `board_mandates.board_id` du dictionnaire qui la référence, pas ce diagramme, qui n'a pas de FK `board_id` du tout sur `BoardMember`/`Mandate`).

### 2.4 `DC_TANZEN_Gouvernance_et_Documents.png`

**Domaine** : Governance / Documents.

**Classes (6, une mal rendue)** : `TENANTS`, `DOCUMENTS`, `GENERAL_ASSEMBLIES`, `VOTES`, la classe `VOTE_OPTIONS` (rendue littéralement comme `VARCHAR(255)` — défaut de rendu déjà documenté D-07 dans `AUDIT_PHASE_01.md`, reconfirmé identique ici), `MEMBERS`, `MEMBER_VOTES`.

**Attributs notables** :
- `DOCUMENTS` : `PK_id BIGINT`, `UQ_uuid CHAR(36)`, `FK_tenant_id`, `title VARCHAR(255)`, `document_type VARCHAR(30)` + `CHECK(meeting_minutes,receipt,association_statute,loan_document,other)`, `file_path VARCHAR(500)`, `uploaded_by BIGINT → users(id)`, `created_at`, index `INDEX(tenant_id,document_type,uploaded_by)`. **`uploaded_by` référence `users(id)` sans que `USERS` soit dessinée sur ce diagramme — dépendance textuelle non représentée par une flèche.**
- `GENERAL_ASSEMBLIES` : `PK_id`, `UQ_uuid`, `FK_tenant_id`, `title`, `assembly_date DATE`, `description TEXT`, `status VARCHAR(20)` + `CHECK(planned,ongoing,closed)`, `created_at`.
- `VOTES` : `PK_id`, `UQ_uuid`, `FK_assembly_id → general_assemblies(id)`, `title`, `description TEXT`, `status VARCHAR(20)` + `CHECK(open,closed)`. **Aucun champ `tenant_id` direct.**
- `VOTE_OPTIONS` (nommage réel) : `PK_id`, `FK_vote_id → votes(id)`, index `INDEX(vote_id)`. **Seuls ces 3 champs sont visibles sur ce diagramme — aucun champ de libellé (« label »/« option_text ») n'est dessiné**, alors que le dictionnaire canonique documente un schéma `vote_id, label` (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 18m). Ce diagramme est donc, sur cette classe précise, plus pauvre que le schéma canonique déjà tranché — à ne pas confondre avec le défaut de rendu du nom (D-07), qui porte sur le nom de la classe, pas sur ses colonnes. **Aucun champ `tenant_id`, direct ou visible.**
- `MEMBERS` (redessinée) : `status VARCHAR(20)` + `CHECK(active,inactive)` — 2 valeurs, cohérent avec le constat déjà tranché en Phase 2 (rendu simplifié, dictionnaire canonique = 4 valeurs, `PHASE_02_DECISIONS_CANONIQUES.md` sujet 1).
- `MEMBER_VOTES` : `PK_id`, `FK_vote_id`, `FK_member_id`, `FK_option_id → vote_options(id)`, `voted_at TIMESTAMP`, `UQ(vote_id, member_id)`, index `INDEX(vote_id,member_id,option_id)`. **Aucun champ `tenant_id` direct.**

**Relations et cardinalités (6, toutes `1..*`)** : `TENANTS→DOCUMENTS` · `TENANTS→GENERAL_ASSEMBLIES` · `GENERAL_ASSEMBLIES→VOTES` · `VOTES→VOTE_OPTIONS` · `VOTES→MEMBER_VOTES` · `MEMBERS→MEMBER_VOTES`. (Le FK `MEMBER_VOTES.option_id → VOTE_OPTIONS.id` existe en colonne mais n'est pas redessiné comme flèche séparée distincte de `VOTES→MEMBER_VOTES`.)

**Absent de ce diagramme** : `AgendaItem`, `MeetingMinutes` (cités par UC-X5, `PHASE_04_USE_CASE_CLASSIFICATION.md` §6.3, jamais modélisés dans aucun des 7 diagrammes) ; `Meetings`/`Attendances` (dessinées uniquement dans `DC_Réunions_et_présences`, §2.7, malgré leur lien fonctionnel fort avec la Gouvernance selon `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n).

### 2.5 `DC_TANZEN_Caisses_et_Cotisations.png`

**Domaine** : Finance.

**Classes (7)** : `TENANTS`, `ACCOUNTS`, `MEMBERS`, `MEMBER_ACCOUNTS`, `CONTRIBUTION_RULES`, `TRANSACTIONS`, `FINANCIAL_CATEGORIES`.

**Attributs notables** :
- `ACCOUNTS` : `id PK`, `tenant_id FK`, `code VARCHAR(50)`, `name VARCHAR(255)`, `type VARCHAR(20)` (**aucun `CHECK` dessiné sur ce champ**), `account_category` + `CHECK(tontine,savings,loan_pool,social_fund,school_fund,operational)`, `balance DECIMAL` + `CHECK(balance>=0)`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `IDX(tenant_id,account_category,code)`. **Absence notable : le champ `account_role` (canonique, `CHECK(STANDARD,TONTINE_PURCHASE,LOAN_FUND,SAVINGS)`, tranché `PHASE_02_DECISIONS_CANONIQUES.md` sujet 12) n'apparaît nulle part sur cette classe** — ni comme nom de champ, ni comme `CHECK`. Voir NC-03 en §10.
- `MEMBER_ACCOUNTS` : `id PK`, `uuid UNIQUE CHAR(36)`, `tenant_id FK`, `member_id FK`, `account_id FK`, `role` + `CHECK(member,leader,treasurer,admin)`, `status` + `CHECK(active,inactive,suspended)`, `join_date` (défaut `CURRENT_DATE`), `sync_status`, `version`, `created_at/updated_at/deleted_at`, `UNIQUE(member_id,account_id)`, index `INDEX(tenant_id,member_id,account_id)`.
- `CONTRIBUTION_RULES` : `id PK`, `account_id FK`, `amount DECIMAL(15,2) NOT NULL`, `frequency` + `CHECK(daily,weekly,monthly,yearly,fixed)`, `is_mandatory BOOLEAN`, `late_fee DECIMAL`, `created_at/updated_at/deleted_at`, index `INDEX(account_id,frequency)`. **Aucun champ `tenant_id` direct.**
- `TRANSACTIONS` : `id PK`, `tenant_id FK`, `account_id FK`, `member_id FK`, `category_id FK→FINANCIAL_CATEGORIES.id`, `meeting_id FK→MEETINGS.id`, `tontine_id FK→TONTINES.id`, `fiscal_year_id FK→FISCAL_YEARS.id`, `type` + `CHECK(income,expense,transfer,tontine,penalty,adjustment)`, `amount DECIMAL` + `CHECK(>=0)`, `payment_method` + `CHECK(cash,mobile_money,bank)`, `transaction_date TIMESTAMP NOT NULL`, `reference VARCHAR(100)`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(tenant_id,account_id,member_id,category_id)`. **3 des 7 FK de cette classe (`meeting_id`, `tontine_id`, `fiscal_year_id`) pointent vers des classes dessinées dans d'autres diagrammes (`DC_Réunions_et_présences`, `DC_Tontines`, `DC_Membres_et_Bureau-Exécutif`) — dépendances inter-diagrammes non redessinées ici, seulement présentes en colonne.**
- `FINANCIAL_CATEGORIES` : `id PK`, `tenant_id FK`, `name VARCHAR(255)`, `type` + `CHECK(income,expense,tontine)`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(tenant_id,type)`.

**Relations et cardinalités (≈10, toutes `1..*`)** : `TENANTS→ACCOUNTS` · `TENANTS→MEMBERS` · `TENANTS→FINANCIAL_CATEGORIES` · `TENANTS→TRANSACTIONS` · `ACCOUNTS→CONTRIBUTION_RULES` · `ACCOUNTS→MEMBER_ACCOUNTS` · `MEMBERS→MEMBER_ACCOUNTS` · `ACCOUNTS→TRANSACTIONS` · `MEMBERS→TRANSACTIONS` · `FINANCIAL_CATEGORIES→TRANSACTIONS`.

**Rappel de cohérence déjà tranché, non rejoué** : `ACCOUNTS.account_category` porte ici un `CHECK` à 6 valeurs, alors que le dictionnaire canonique **ne porte aucun `CHECK` sur ce champ** (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 12, déjà résolu en faveur du champ texte libre) — reconfirmé identique ici, pas une nouvelle contradiction.

### 2.6 `DC_TANZEN_Crédit.png`

**Domaine** : Credit.

**Classes (6)** : `TENANTS`, `ACCOUNTS`, `MEMBERS`, `LOAN_POLICIES`, `LOANS`, `REPAYMENTS`.

**Attributs notables** :
- `LOAN_POLICIES` : `PK_id`, `UQ_uuid`, `UQ FK_tenant_id`, `UQ FK_account_id`, `allow_loans BOOLEAN`, `min_loan_amount/max_loan_amount NUMERIC(15,2)` (`CHECK>=0`/`CHECK>0`), `interest_rate NUMERIC(5,2) CHECK>=0`, `interest_type` + `CHECK(fixed,simple,compound)`, `interest_period` + `CHECK(daily,weekly,monthly,yearly)`, `min_duration/max_duration INT` (`CHECK>0`), `duration_unit` + `CHECK(days,weeks,months,years)`, `minimum_saving_balance NUMERIC(15,2)`, `minimum_membership_months INT`, `minimum_contributions INT`, `requires_guarantor BOOLEAN`, `minimum_guarantors INT`, `max_active_loans INT`, `late_penalty_rate NUMERIC(5,2)`, `grace_period_days INT`, `is_active BOOLEAN`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(tenant_id)`, `UQ(account_id)`. Niveau de détail nettement plus riche que ce que documentait `AUDIT_PHASE_01.md` (qui citait `Loan_policy` sans détail de champ).
- `LOANS` : `PK_id`, `UQ_uuid`, `FK_tenant_id`, `FK_member_id`, `FK_account_id`, `amount DECIMAL(15,2) NOT NULL`, `interest_rate DECIMAL(5,2)`, `duration_months INT`, `status VARCHAR(20)` + **`CHECK(pending,active,repaid,defaulted)`**, `start_date/end_date DATE`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(member_id)`, `INDEX(account_id)`, `INDEX(status)`. **Ce `CHECK` à 4 valeurs correspond exactement au statut verrouillé par le Product Owner** (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §3 : `PENDING, ACTIVE, REPAID, DEFAULTED`) — le frontend actuel (`PENDING, ACTIVE, CLOSED`, migration déjà identifiée comme requise, §7 point 8 du même document) reste, lui, non aligné ; ce diagramme est donc, sur ce point précis, déjà conforme à la cible verrouillée.
- `REPAYMENTS` : `PK_id`, `UQ_uuid`, `FK_tenant_id`, `FK_loan_id`, `FK_member_id`, `amount DECIMAL(15,2) NOT NULL`, `payment_date TIMESTAMP`, `method VARCHAR(30)` + `CHECK(cash,bank,mobile_money)` (3 valeurs, sans `CARD` — écart déjà tranché, `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18e, `CARD` canonique), `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(loan_id,member_id,payment_date)`.

**Relations et cardinalités (6, toutes `1..*`)** : `TENANTS→ACCOUNTS` · `TENANTS→MEMBERS` · `ACCOUNTS→LOAN_POLICIES` · `ACCOUNTS→LOANS` · `MEMBERS→LOANS` · `LOANS→REPAYMENTS`.

**Absent de ce diagramme** : `LoanGuarantor`/`loan_guarantors` (canonique depuis `PHASE_02_DECISIONS_CANONIQUES.md` sujet 11, mais toujours absente de ce diagramme — statut inchangé) ; `Penalty`/`penalties` (canonique transverse depuis sujet 13 du même document, toujours absente de ce diagramme comme de tous les 7).

### 2.7 `DC_TANZEN_Réunions_et_présences.png`

**Domaine** : Operations (Réunions) / Governance (dépendance).

**Classes (4)** : `TENANTS`, `MEMBERS`, `MEETINGS`, `ATTENDANCES`.

**Attributs notables** :
- `MEETINGS` : `id PK`, `uuid UQ`, `tenant_id FK ON DELETE CASCADE`, `title VARCHAR(255)`, `meeting_date DATE`, `status VARCHAR(20)` + `CHECK(planned,ongoing,completed,cancelled)`, `sync_status`, `version`, `created_at/updated_at/deleted_at`, index `INDEX(tenant_id,meeting_date)`.
- `ATTENDANCES` : `id PK`, `uuid UQ`, `meeting_id FK ON DELETE CASCADE`, `member_id FK ON DELETE CASCADE`, `status VARCHAR(20)` + `CHECK(present,absent,late)` (3 valeurs, sans `EXCUSED` — déjà tranché en faveur des 4 valeurs canoniques, `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18b), **`penalty_amount NUMERIC(15,2)` + `CHECK(penalty_amount>=0)`**, `sync_status`, `version`, `created_at/updated_at/deleted_at`, `UNIQUE(meeting_id,member_id)`, index `INDEX(meeting_id,member_id)`, `INDEX(meeting_id,status)`. **Aucun champ `tenant_id` direct.**

**Relations et cardinalités (4, toutes `1..*`)** : `TENANTS→MEMBERS` · `TENANTS→MEETINGS` · `MEMBERS→ATTENDANCES` · `MEETINGS→ATTENDANCES`.

**Point nouveau relevé par cette lecture attribut-par-attribut** : `ATTENDANCES.penalty_amount` est un champ **numérique embarqué directement sur la présence**, distinct et concurrent du modèle `Penalty`/`penalties` canonique et transverse (`source_module`/`source_id`, `PHASE_02_DECISIONS_CANONIQUES.md` sujet 13). Voir NC-03 bis (traité avec NC-03) en §10 et anomalie IMPORTANT en §13.

---

## 3. Inventaire des classes (consolidé, dédoublonné)

**32 classes uniques** après dédoublonnage des occurrences redessinées de `Tenant`/`Tenants` et `Member`/`Members` à travers plusieurs diagrammes.

| Classe | Diagramme(s) d'apparition | Redessinée à l'identique ? |
|---|---|---|
| `Tenant` | Les 7 diagrammes | Oui — structure identique partout (classe transversale de fait) |
| `Member` | `Tontines`, `Membres_et_Bureau-Exécutif`, `Gouvernance_et_Documents`, `Caisses_et_Cotisations`, `Crédit`, `Réunions_et_présences` (6/7, absente seulement de `Administration_et_Multi-tenant`) | Oui, à une nuance : `status` toujours `CHECK(active,inactive)` (2 valeurs) sur les 6 occurrences — jamais les 4 valeurs canoniques du dictionnaire |
| `Tontine` | `Tontines` | — |
| `TontineCycle` | `Tontines` | — |
| `CycleMember` | `Tontines` | — |
| `TontineDraw` | `Tontines` | — |
| `TontineBid` | `Tontines` | — |
| `DrawWinner` | `Tontines` | — |
| `Users` | `Administration_et_Multi-tenant` | — |
| `Plans` | `Administration_et_Multi-tenant` | — |
| `Subscriptions` | `Administration_et_Multi-tenant` | — |
| `Payments` | `Administration_et_Multi-tenant` | — |
| `Backups` | `Administration_et_Multi-tenant` | — |
| `Audit_logs` | `Administration_et_Multi-tenant` | — |
| `Position` | `Membres_et_Bureau-Exécutif` | — |
| `BoardMember` | `Membres_et_Bureau-Exécutif` | — |
| `Mandate` | `Membres_et_Bureau-Exécutif` | — |
| `FiscalYear` | `Membres_et_Bureau-Exécutif` | — |
| `Documents` | `Gouvernance_et_Documents` | — |
| `General_assemblies` | `Gouvernance_et_Documents` | — |
| `Votes` | `Gouvernance_et_Documents` | — |
| `Vote_options` | `Gouvernance_et_Documents` (nom réel masqué par un défaut de rendu, D-07) | — |
| `Member_votes` | `Gouvernance_et_Documents` | — |
| `Accounts` | `Caisses_et_Cotisations`, `Crédit` | Oui — structure identique dans les deux diagrammes |
| `Member_accounts` | `Caisses_et_Cotisations` | — |
| `Contribution_rules` | `Caisses_et_Cotisations` | — |
| `Transactions` | `Caisses_et_Cotisations` | — |
| `Financial_categories` | `Caisses_et_Cotisations` | — |
| `Loan_policies` | `Crédit` | — |
| `Loans` | `Crédit` | — |
| `Repayments` | `Crédit` | — |
| `Meetings` | `Réunions_et_présences` | — |
| `Attendances` | `Réunions_et_présences` | — |

**Classes explicitement transversales** (au sens « redessinées dans plusieurs diagrammes ») : `Tenant` (7/7), `Member` (6/7), `Accounts` (2/7). Aucune autre classe n'apparaît dans plus d'un diagramme.

---

## 4. Classification Context

Contexte attribué à partir de la portée réelle de chaque classe (dictionnaire/diagramme + rattachement fonctionnel déjà établi par `PHASE_04_USE_CASE_CLASSIFICATION.md`), jamais deviné.

| Classe | Context | Justification |
|---|---|---|
| `Tenant` | **TRANSVERSAL** | Racine de portée pour toutes les classes TENANT, mais administrée elle-même au niveau PLATFORM (`UC01-20` à `UC01-25`, `UC10-01`, registre migré vers `/platform/tenants` — `DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §11). Ni purement PLATFORM ni purement TENANT. |
| `Users` | **TENANT** | `tenant_id FK NOT NULL` visible, cardinalité `1..*` depuis `TENANTS`. Tension avec les acteurs plateforme sans tenant — cf. NC-01, §10. |
| `Plans` | **PLATFORM** | Aucun `tenant_id` ; catalogue global géré par Super Administrateur (`UC01-02` à `UC01-05`). |
| `Subscriptions` | **PLATFORM** | `tenant_id FK` présent mais gérée exclusivement par Super Administrateur/Service de Paiement (`UC01-06` à `UC01-10`) — la portée est celle du tenant facturé, l'acteur est plateforme. |
| `Payments` | **PLATFORM** | Aucun `tenant_id` direct (indirect via `subscription_id`). SaaS Billing, distinct de la Finance tenant (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §14, rappelé §7). |
| `Backups` | **PLATFORM** | `tenant_id FK` présent mais action réservée à Super Administrateur (`UC01-18/19`, `UC03-17/18`) ; UC110-07 documente toutefois une ambiguïté résiduelle (portée tenant partielle « selon les droits ») — cf. `PHASE_04_USE_CASE_CLASSIFICATION.md` §7. |
| `Audit_logs` | **TRANSVERSAL** | `tenant_id` et `user_id` tous deux présents ; consommée à la fois par Super Administrateur (`UC01-16`) et Administrateur Tenant (`UC03-15/16`, `UC110-05`). |
| `Tontine` | **TENANT** | `tenant_id FK` direct. |
| `TontineCycle` | **TENANT** | Aucun `tenant_id` direct, mais chaîne de relation explicite `Tontine→TontineCycle` remontant à `Tenant`. |
| `CycleMember` | **TENANT** | Idem, via `TontineCycle→Tontine→Tenant`. |
| `TontineDraw` | **TENANT** | Idem, via `TontineCycle`. |
| `TontineBid` | **TENANT** | Idem, via `TontineDraw→TontineCycle`. |
| `DrawWinner` | **TENANT** | Idem, via `TontineDraw`. |
| `Member` | **TENANT** | `tenant_id FK` direct, présent sur les 6 diagrammes où la classe figure. |
| `Position` | **TENANT** | `tenant_id FK` direct. |
| `BoardMember` | **TENANT** | `tenant_id FK` direct. |
| `Mandate` | **TENANT** | `tenant_id FK` direct. |
| `FiscalYear` | **TENANT** | `tenant_id FK` direct. |
| `Documents` | **TENANT** | `tenant_id FK` direct. |
| `General_assemblies` | **TENANT** | `tenant_id FK` direct. |
| `Votes` | **TENANT** | Aucun `tenant_id` direct ; remonte via `assembly_id→General_assemblies.tenant_id`. |
| `Vote_options` | **TENANT** | Aucun `tenant_id` direct ; remonte via `vote_id→Votes→General_assemblies.tenant_id` (2 sauts). |
| `Member_votes` | **TENANT** | Aucun `tenant_id` direct ; remonte via `vote_id` ou `member_id`. |
| `Accounts` | **TENANT** | `tenant_id FK` direct. |
| `Member_accounts` | **TENANT** | `tenant_id FK` direct. |
| `Contribution_rules` | **TENANT** | Aucun `tenant_id` direct ; remonte via `account_id→Accounts.tenant_id`. |
| `Transactions` | **TENANT** | `tenant_id FK` direct. |
| `Financial_categories` | **TENANT** | `tenant_id FK` direct. |
| `Loan_policies` | **TENANT** | `tenant_id FK` direct (`UQ`). |
| `Loans` | **TENANT** | `tenant_id FK` direct. |
| `Repayments` | **TENANT** | `tenant_id FK` direct. |
| `Meetings` | **TENANT** | `tenant_id FK` direct. |
| `Attendances` | **TENANT** | Aucun `tenant_id` direct ; remonte via `meeting_id→Meetings.tenant_id`. |

---

## 5. Classification Domain

Domaine PRIMARY attribué depuis la liste fermée imposée, vérifiée contre `src/features/` réel (`access, audit, dashboard, finance, operations, organization, platform, public, settings, tontines`).

| Classe | Domain (PRIMARY) | Dependencies |
|---|---|---|
| `Tenant` | Organization | Settings (facturation/plan) |
| `Users` | Access & Security | Organization |
| `Plans` | Settings | — |
| `Subscriptions` | Organization | Settings |
| `Payments` | Settings | Organization |
| `Backups` | Settings | Audit |
| `Audit_logs` | Audit | Access & Security |
| `Tontine` | Tontines | — |
| `TontineCycle` | Tontines | — |
| `CycleMember` | Tontines | Members |
| `TontineDraw` | Tontines | — |
| `TontineBid` | Tontines | — |
| `DrawWinner` | Tontines | Finance |
| `Member` | Members | — |
| `Position` | Governance | — |
| `BoardMember` | Governance | Members |
| `Mandate` | Governance | — |
| `FiscalYear` | Governance | Finance |
| `Documents` | Documents | Governance, Access & Security |
| `General_assemblies` | Governance | — |
| `Votes` | Governance | — |
| `Vote_options` | Governance | — |
| `Member_votes` | Governance | Members |
| `Accounts` | Finance | — |
| `Member_accounts` | Finance | Members |
| `Contribution_rules` | Finance | — |
| `Transactions` | Finance | Tontines, Credit, Operations, Governance (FK `meeting_id`/`tontine_id`/`fiscal_year_id`) |
| `Financial_categories` | Finance | — |
| `Loan_policies` | Credit | Finance |
| `Loans` | Credit | Finance, Members |
| `Repayments` | Credit | Finance |
| `Meetings` | Operations | Governance |
| `Attendances` | Operations | Members, Credit (`penalty_amount`) |

**Note de méthode** : aucun des 13 domaines n'est représenté par un diagramme de classes dédié pour **Workflows**, **Notifications**, et l'essentiel d'**Access & Security** (RBAC dynamique) — ces domaines existent côté dictionnaire et côté frontend (`operations-module.tsx` : `workflows`, `notifications`, `documents` ; `access-module.tsx` : `roles`, `permissions`, `sessions`, `mfa`) mais **aucune classe correspondante n'apparaît dans les 7 diagrammes analysés**. Ce n'est pas une omission de cette lecture — c'est un fait vérifié : 0 des 7 fichiers de `docs/Diagrammes de classes/` ne porte de classe `Workflow`, `WorkflowStep`, `Notification`, `Role`, `Permission`, `Role_permission`, `User_role` ou `Module`.

---

## 6. Tenant Scope

Classement `TENANT-SCOPED` / `PLATFORM-SCOPED` / `GLOBAL` / `TRANSVERSAL` / `UNKNOWN`, avec identification explicite du champ porteur (`tenant_id` direct, ou chaîne de relation).

| Classe | Tenant Scope | Champ/chaîne porteuse |
|---|---|---|
| `Tenant` | **TRANSVERSAL** | Racine — n'a pas de `tenant_id` (elle EST le tenant) ; administrée en PLATFORM |
| `Users` | **TENANT-SCOPED** | `tenant_id` direct (mais voir NC-01) |
| `Plans` | **GLOBAL** | Aucun `tenant_id` — catalogue partagé |
| `Subscriptions` | **PLATFORM-SCOPED** | `tenant_id` direct, mais domaine SaaS Billing |
| `Payments` | **PLATFORM-SCOPED** | Indirect via `subscription_id→Subscriptions.tenant_id` |
| `Backups` | **PLATFORM-SCOPED** | `tenant_id` direct |
| `Audit_logs` | **TRANSVERSAL** | `tenant_id` + `user_id` directs |
| `Tontine` | **TENANT-SCOPED** | `tenant_id` direct |
| `TontineCycle` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `tontine_id→Tontine.tenant_id` |
| `CycleMember` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `cycle_id→TontineCycle→Tontine.tenant_id` (2 sauts) |
| `TontineDraw` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `cycle_id→TontineCycle→Tontine.tenant_id` (2 sauts) |
| `TontineBid` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `draw_id→TontineDraw→TontineCycle→Tontine.tenant_id` (3 sauts) |
| `DrawWinner` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `draw_id` (3 sauts, identique à `TontineBid`) |
| `Member` | **TENANT-SCOPED** | `tenant_id` direct |
| `Position` | **TENANT-SCOPED** | `tenant_id` direct |
| `BoardMember` | **TENANT-SCOPED** | `tenant_id` direct |
| `Mandate` | **TENANT-SCOPED** | `tenant_id` direct |
| `FiscalYear` | **TENANT-SCOPED** | `tenant_id` direct |
| `Documents` | **TENANT-SCOPED** | `tenant_id` direct |
| `General_assemblies` | **TENANT-SCOPED** | `tenant_id` direct |
| `Votes` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `assembly_id→General_assemblies.tenant_id` |
| `Vote_options` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `vote_id→Votes→General_assemblies.tenant_id` (2 sauts) |
| `Member_votes` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `vote_id` ou `member_id` |
| `Accounts` | **TENANT-SCOPED** | `tenant_id` direct |
| `Member_accounts` | **TENANT-SCOPED** | `tenant_id` direct |
| `Contribution_rules` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `account_id→Accounts.tenant_id` |
| `Transactions` | **TENANT-SCOPED** | `tenant_id` direct |
| `Financial_categories` | **TENANT-SCOPED** | `tenant_id` direct |
| `Loan_policies` | **TENANT-SCOPED** | `tenant_id` direct |
| `Loans` | **TENANT-SCOPED** | `tenant_id` direct |
| `Repayments` | **TENANT-SCOPED** | `tenant_id` direct |
| `Meetings` | **TENANT-SCOPED** | `tenant_id` direct |
| `Attendances` | **TENANT-SCOPED (indirect)** | Aucun `tenant_id` direct — via `meeting_id→Meetings.tenant_id` |

**Constat chiffré** : **10 des 32 classes** (`TontineCycle`, `CycleMember`, `TontineDraw`, `TontineBid`, `DrawWinner`, `Votes`, `Vote_options`, `Member_votes`, `Contribution_rules`, `Attendances`) n'ont **aucune colonne `tenant_id` directe** visible sur leur diagramme, contre 2 seulement déjà signalées par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4 (`tontine_draws`, `draw_winners`). Ce chiffre affiné est une contribution propre à cette lecture attribut-par-attribut — détaillé et qualifié de risque potentiel en §7 et §13.

---

## 7. Relations

### 7.1 Inventaire complet (par diagramme, cardinalités rappelées)

Voir le détail par diagramme en §2 pour la liste exhaustive (≈55 relations, toutes `1..*`, aucune `0..*`/`0..1` observée sur les 7 diagrammes).

### 7.2 Chaînes de relation tenant (§5 du mandat)

| Chaîne | Profondeur jusqu'à `tenant_id` direct | Risque cross-tenant si résolution par ID seul |
|---|---|---|
| `Tenant→Tontine→TontineCycle→CycleMember` | `Tontine` = 0 saut ; `TontineCycle`/`CycleMember` = 1-2 sauts indirects | **Signalé** — un service qui résoudrait `CycleMember` par son seul `id` sans remonter jusqu'à `Tontine.tenant_id` ne dispose d'aucun champ local pour vérifier le tenant |
| `Tenant→Tontine→TontineCycle→TontineDraw→TontineBid/DrawWinner` | 2 à 3 sauts indirects sur les 3 dernières classes | **Signalé** — même risque, profondeur maximale observée sur les 7 diagrammes (3 sauts pour `TontineBid`/`DrawWinner`) |
| `Tenant→Member→Loan→Repayment` | `Loan` et `Repayment` portent chacun un `tenant_id` **direct** | Faible — chaque maillon est vérifiable indépendamment (défense en profondeur correcte) |
| `Tenant→Member→BoardMember→Mandate` | `BoardMember` et `Mandate` portent chacun un `tenant_id` **direct** | Faible — même constat positif que ci-dessus |
| `Tenant→GeneralAssembly→Vote→VoteOption/MemberVote` | `GeneralAssembly` = 0 saut ; `Vote`/`VoteOption`/`MemberVote` = 1 à 2 sauts indirects | **Signalé** — un résultat de vote (potentiellement sensible/confidentiel selon `PHASE_04_USE_CASE_CLASSIFICATION.md` §6.3, « votes secrets ») pourrait être exposé cross-tenant si résolu par `id` seul sans remonter à `GeneralAssembly.tenant_id` |
| `Tenant→Meeting→Attendance` | `Meeting` = 0 saut ; `Attendance` = 1 saut indirect | **Signalé** — `Attendance` porte en plus `penalty_amount` (donnée financière), aggravant l'impact d'une fuite éventuelle |
| `Tenant→Account→ContributionRule` | `Account` = 0 saut ; `ContributionRule` = 1 saut indirect | **Signalé** |
| `Tenant→Subscription→Payment` (chaîne Platform Billing) | `Subscription` = 0 saut ; `Payment` = 1 saut indirect | **Signalé** — portée PLATFORM, pas TENANT, mais même principe : `Payment` contient `amount`/`transaction_id`, données sensibles |

**Rappel de doctrine, non remis en cause ici** : conformément à `PHASE_02_TENANT_ISOLATION_SPEC.md` §12, le frontend n'est jamais l'autorité de sécurité — ces signalements concernent la conception du schéma physique et des requêtes backend (jointures obligatoires), pas une vulnérabilité frontend actuellement exploitable. Ils sont documentés ici parce que le mandat de cette mission demande explicitement de signaler « tout ce qui pourrait permettre un accès cross-tenant accidentel », au niveau modèle.

### 7.3 Dépendances inter-diagrammes non redessinées

Relevées en colonne (`FK`) mais jamais matérialisées par une flèche vers une classe hors du diagramme courant :
- `Transactions.meeting_id → Meetings.id` (classe dessinée dans `DC_Réunions_et_présences`, pas dans `DC_Caisses_et_Cotisations`).
- `Transactions.tontine_id → Tontines.id` (classe dessinée dans `DC_Tontines`).
- `Transactions.fiscal_year_id → Fiscal_years.id` (classe dessinée dans `DC_Membres_et_Bureau-Exécutif`).
- `Documents.uploaded_by → Users.id` (classe dessinée dans `DC_Administration_et_Multi-tenant`).

---

## 8. Tontine Model (focus imposé §6 du mandat)

**Chaîne attendue** (déjà verrouillée, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.1) : `Tontine 1:N TontineCycle`, `TontineCycle 1:N CycleMember`, `TontineCycle 1:N TontineContribution`, `TontineCycle 1:N TontineDraw`.

**Ce que `DC_TANZEN_Tontines.png` montre réellement** :
- `Tontine 1..* TontineCycle` — **conforme**.
- `TontineCycle 1..* CycleMember` — **conforme**.
- `TontineCycle 1..* TontineDraw` — **conforme**.
- `TontineCycle 1..* TontineBid` — relation supplémentaire non citée dans la chaîne attendue du mandat, mais cohérente avec le modèle de tirage par enchère (`draw_type ENUM(normal, auction)` sur `TontineDraw`).
- **`TontineCycle 1..* TontineContribution` : ABSENT.** `TontineContribution`/`tontine_contributions` n'apparaît **sur aucun des 7 diagrammes**, alors qu'elle est une table pleinement spécifiée et canonique du dictionnaire (`PHASE_02_MODELE_CANONIQUE_FINAL.md` §1.1, §2.1). C'est un écart entre la chaîne attendue par le mandat (qui reflète le modèle canonique déjà verrouillé) et ce que le diagramme de classes montre réellement — signalé explicitement plutôt que masqué.
- `TontineDraw 1..* DrawWinner` — relation supplémentaire cohérente (règlement financier du tirage), déjà documentée par `PHASE_02_DECISIONS_CANONIQUES.md` sujet 15.

**`TontinePosition`/`PositionPayment`** : statut **inchangé** par rapport à `AUDIT_PHASE_01.md`/`PHASE_02_MODELE_CANONIQUE_FINAL.md` — **absentes des 7 diagrammes de classes**, y compris `DC_TANZEN_Tontines.png` spécifiquement (seul diagramme où on pourrait s'attendre à les trouver puisque leur rattachement est verrouillé directement à `Tontine`, `PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.1). Elles restent, comme documenté précédemment, visibles uniquement dans les diagrammes de séquence (`DSEQ_Achats_tontines.png`, `DSEQ_TONTINE_DRAW_ENGINE.png`, hors périmètre relu ici) et dans `Architecture_globale.png`.

**Constat de tenant scope propre au modèle Tontine** (détaillé §6/§7) : `TontineCycle`, `CycleMember`, `TontineDraw`, `TontineBid`, `DrawWinner` n'ont **aucune** colonne `tenant_id` directe — seule `Tontine` (et `Tenant`/`Member`) porte le `tenant_id` direct dans ce diagramme. C'est le domaine le plus touché par l'absence de `tenant_id` direct parmi les 7 diagrammes (5 des 10 classes « indirectes » de tout le corpus appartiennent à ce seul diagramme).

**Constat frontend (complémentaire, hors périmètre documentaire strict mais vérifié en lecture seule)** : contrairement à `AUDIT_PHASE_01.md` (qui documentait `TontineDraw`/`DrawWinner` comme absents du frontend), **ce dépôt-ci a des écrans de tirage construits** : `src/features/tontines/tontines-module.tsx` définit les routes `:tontineId/cycles/:cycleId/draws`, `.../draws/create`, `.../draws/:drawId`, `.../draws/:drawId/winner`. Ces écrans consomment cependant des données de tirage **imbriquées dans le mock `TontineCycle`** (`cycle.draws: CycleDraw[]`, `src/mocks/tontines/tontine-cycles.ts`) — **`src/services/tontines.service.ts` ne porte aucune fonction `listDraws`/`getDraw`/`listWinners` dédiée** (vérifié : le fichier ne contient que `listTontines`, `getTontine`, `listCyclesByTontine`, `getCycle`, `listCyclesByMember`, `updateCycleStatus`). C'est un écart structurel entre l'UI (qui traite les tirages comme une sous-ressource de premier ordre) et la couche service (qui ne les expose pas comme telle) — signalé en anomalie IMPORTANT, §13.

---

## 9. Use Case ↔ Class Mapping

Croisement contre les 299 cas d'utilisation de `PHASE_04_USE_CASE_CLASSIFICATION.md` §2, par classe.

### 9.1 Classes utilisées par au moins un UC (avec ID(s) représentatif(s), non exhaustif au-delà de ce que Phase 4 documente déjà)

| Classe | UC représentatifs (voir Phase 4 §2 pour la liste complète) |
|---|---|
| `Tenant` | UC01-20 à UC01-25, UC10-01, UC10-08, UC30-11/12, CT-01 |
| `Users` | UC10-06, UC20-07 à UC20-14 |
| `Plans` | UC01-02 à UC01-05 |
| `Subscriptions` | UC01-06 à UC01-10, UC10-04 |
| `Payments` | (aucun UC individuel ne cite `Payments` nommément — les UC de facturation citent « Abonnement », pas « Paiement » comme sujet direct ; dépendance implicite via UC01-09/10 « Service de Paiement » comme acteur) |
| `Backups` | UC01-18/19, UC03-17/18, UC110-07 |
| `Audit_logs` | UC01-16, UC03-15/16, UC110-05 |
| `Tontine` | UC02-10, UC40-03, UCX2-01 |
| `TontineCycle` | UC40-04/05, UCX2-04, UCX2-11 |
| `CycleMember` | UC40-01, UCX1-10, UCX2-03 |
| `TontineDraw` | UC02-08, UC40-02, UCX2-15 |
| `TontineBid` | (aucun UC individuel ne nomme explicitement l'enchère — cohérent avec la règle source « Le tirage est manuel », UC-40) |
| `DrawWinner` | UC40-07, UCX2-16 |
| `Member` | UC02-05, UC20 (implicite via `User`), UCX1-01 à UCX1-19 |
| `Position` | UC30-14 à UC30-16, UC30-02 |
| `BoardMember` | UC30-01 à UC30-04 |
| `Mandate` | UC30-17 à UC30-19 |
| `FiscalYear` | UC30-08 à UC30-10, UC50-02/03 |
| `Documents` | UC90-01 à UC90-21, UC30-23 à UC30-25 |
| `General_assemblies` | UC30-05 à UC30-07, UCX5-02 |
| `Votes` | UCX5-06/07 |
| `Vote_options` | UCX5-06 (implicite) |
| `Member_votes` | UCX5-06 (implicite) |
| `Accounts` | UC02-17, UC50-04 à UC50-09 |
| `Member_accounts` | (aucun UC individuel ne le nomme explicitement — la relation membre↔compte est implicite dans UC02-17/UC50) |
| `Contribution_rules` | UCX2-02 (implicite, « Configurer les règles ») |
| `Transactions` | UC02-18/19, UC50-10 à UC50-12, UCX4-02/03 |
| `Financial_categories` | (aucun UC individuel ne le nomme — dépendance implicite de `Transactions`) |
| `Loan_policies` | UC60-03 |
| `Loans` | UC02-01/04, UC60-07, UCX3-04 |
| `Repayments` | UC02-03, UC60-04, UCX3-09 |
| `Meetings` | UC02-12/14, UCX5-02 |
| `Attendances` | UC02-13, UCX1-13, UCX5-05 |

### 9.2 Classes sans UC direct (non automatiquement une erreur — cf. consigne §9 du mandat)

- `TontineBid` : aucun UC individuel ne nomme l'enchère — cohérent avec la règle source explicite « le tirage est manuel » (UC-40), qui suggère un mode `ROTATION` privilégié dans les cas d'usage documentés ; `TontineBid`/`draw_type=auction` reste une capacité de schéma non exercée par un UC dédié. **Pas une erreur** — classe technique de variante.
- `Member_accounts`, `Financial_categories`, `Vote_options`, `Member_votes` : dépendances implicites de classes parentes déjà citées (`Accounts`/`Transactions`/`Votes`) plutôt que sujets directs d'un UC — cohérent avec leur rôle de table de jonction/catalogue.
- `Payments` (SaaS) : aucun UC ne cite « Paiement » comme sujet direct ; seul l'acteur « Service de Paiement » apparaît (UC01-09/10). Cohérent avec une classe consommée en arrière-plan d'un flux d'abonnement plutôt que manipulée directement par un utilisateur.

### 9.3 UC sans classe correspondante (déjà établi par Phase 4/AUDIT_PHASE_01, rappelé ici au niveau classe)

`Committee` (UC30-20/21/22), `PenaltyRule`/`Penalty`/`Sanction` (UC70-01 à UC70-19 — 19 UC entiers de `PHASE_04_USE_CASE_CLASSIFICATION.md` §6.1 sans classe de diagramme correspondante), `AgendaItem`/`MeetingMinutes` (UCX5-03/04), `LoanGuarantor` (UC-60 « Tables concernées », aucun UC individuel dédié mais absente de tout diagramme), `ApiClient`/`Webhook`/`SyncJob`/`IntegrationLog` (UC100I-01 à 06, §6.2), `LoanDisbursement`/`LoanInstallment`/`LoanInterestAccrual` (UC60-01/05/06, UCX3-06/08). Détail complet en §11.

### 9.4 Classes utilisées par de multiples UC (charge fonctionnelle la plus élevée)

`Documents` (21 UC sur UC-90 seul, + UC30-23/24/25 + UCX1-02/03/14), `Loans` (≥10 UC répartis sur UC-02, UC-60, UCX3), `Member`/`Users` (transverses à presque tous les diagrammes TENANT).

### 9.5 Relations incohérentes détectées par ce croisement

`Attendances` est utilisée par des UC purement Operations (UC02-13, UC02-14) mais porte un champ `penalty_amount` qui relève fonctionnellement du domaine Credit/Risk (UC70-05/06, « Calculer une pénalité ») — aucun UC de UC-70 ne cite `Attendances` comme ressource, alors que le champ existe sur cette classe. Incohérence de rattachement déjà signalée en §2.7/§10 (NC-03).

---

## 10. Contradictions Phase 4 (§8 de `PHASE_04_USE_CASE_CLASSIFICATION.md`)

### CT-01 — « Configurer le tenant » : deux UC de même titre, contextes différents

- **SOURCE A** : UC01-01 (diagramme UC-01, Platform Package) — bulle « Configurer le tenant » sous acteur Super Administrateur, contexte PLATFORM.
- **SOURCE B** : UC10-08 (diagramme UC-10, Platform Core) — bulle au titre identique sous acteur Admin Tenant, contexte TENANT.
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : `DC_TANZEN_Administration_et_Multi-tenant.png` ne montre qu'une seule classe `TENANTS`, avec un seul jeu de colonnes (aucune distinction entre « configuration vue plateforme » et « configuration vue tenant » au niveau schéma — pas de sous-classe, pas de table de configuration séparée). Le diagramme de classes ne porte aucune trace d'un mécanisme technique qui distinguerait ces deux opérations (ex. deux tables, ou des colonnes distinctes selon l'acteur).
- **CONCLUSION POSSIBLE** : l'absence de toute séparation au niveau schéma est cohérente avec l'hypothèse que les deux bulles décrivent la **même** opération vue sous deux angles d'acteur (un Super Admin configurant un tenant tiers vs un Admin Tenant configurant son propre tenant, sur le même enregistrement `TENANTS`) — mais cette cohérence de schéma ne suffit pas à trancher, car un schéma partagé est compatible aussi bien avec « même opération » qu'avec « deux opérations distinctes portant sur des sous-ensembles de colonnes différents ».
- **DÉCISION À VALIDER** : **NON RÉSOLU PAR LES SOURCES DISPONIBLES.** Le diagramme de classes ne permet pas de trancher entre une opération unique à deux angles d'acteur et deux opérations distinctes sur le même enregistrement.

### CT-02 — Rôles métier nommés comme acteurs UML (Trésorier, Président, Secrétaire, Comité de Crédit)

- **SOURCE A** : diagrammes UC50/UC70/UC90/UCX1/UCX2/UCX3 (>80 bulles individuelles, `PHASE_04_USE_CASE_CLASSIFICATION.md` §8) utilisant ces rôles comme acteurs UML nommés.
- **SOURCE B** : `TANZEN_CROSS_CUTTING_DECISIONS.md` (cité par `AUDIT_PHASE_01.md`) affirmant qu'aucun de ces rôles n'apparaît comme acteur dans les 2 144 titres de la spécification fonctionnelle textuelle.
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : `DC_TANZEN_Membres_et_Bureau-Exécutif.png` montre une classe `Position` (`code`, `name`, `scope` ∈ `board`/`executive`/`committee`, `is_system`) et une classe `Mandate` (`status`, `reason`, `is_current`, liée à `BoardMember` liée elle-même à `Position`). C'est une couche de données réelle, indépendante de toute table d'autorisation, qui permet de nommer/historiser « qui occupe la fonction de Trésorier/Président/Secrétaire » sans coder ce rôle dans un mécanisme d'accès. Ceci **confirme au niveau schéma** l'architecture à deux couches déjà tranchée CANONIQUE par `PHASE_02_DECISIONS_CANONIQUES.md` sujet 7 (RBAC dynamique pour l'autorisation, `Position`/`board_mandates` pour l'étiquetage de gouvernance).
- **CONCLUSION POSSIBLE** : les acteurs UML nommés des 6 diagrammes de cas d'utilisation sont compatibles avec l'existence de `Position`/`BoardMember`/`Mandate` — ils désignent des fonctions de gouvernance affichées via cette couche, pas des rôles d'autorisation codés en dur. La contradiction apparente entre Source A et Source B est donc, comme déjà conclu en Phase 2, plus apparente que réelle.
- **DÉCISION À VALIDER** : **Illuminée par les diagrammes de classes** — aucune nouvelle décision à valider, ce point reste conforme au verrouillage déjà acté (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 7, statut CANONIQUE). Seul point résiduel non couvert par les classes : « Comité de Crédit » (UCX3-15) reste sans classe de rattachement (ni `Position`, ni `BoardMember`, ni ailleurs) — gap déjà connu, non aggravé ni résolu par cette lecture.

### CT-03 — Gestion des rôles/permissions : Admin Tenant seul ou Admin Tenant + Super Admin ?

- **SOURCE A** : UC10-07 (« Gérer les rôles et permissions ») — acteur Admin Tenant seul.
- **SOURCE B** : UC20-15 à UC20-18 (« Gestion des rôles ») — Administrateur Tenant **et** Super Administrateur, via des relations `«include»` partant de Super Administrateur.
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : **aucun.** `DC_TANZEN_Administration_et_Multi-tenant.png` ne montre ni `Roles`, ni `Permissions`, ni `Role_permissions`, ni `Users_roles` — les 5 classes du RBAC dynamique sont **absentes des 7 diagrammes de classes** (constat §2.2/§5). Le seul élément visible est `USERS.role`, colonne unique déjà écartée comme artefact obsolète (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 6), qui ne porte aucune information sur une éventuelle portée « rôles plateforme » vs « rôles tenant ».
- **CONCLUSION POSSIBLE** : aucune — les classes disponibles ne modélisent tout simplement pas l'objet du litige (un référentiel de rôles à portée plateforme vs tenant).
- **DÉCISION À VALIDER** : **NON RÉSOLU PAR LES SOURCES DISPONIBLES.** Les diagrammes de classes n'apportent aucun élément, faute de modéliser le RBAC dynamique.

### CT-04 — Super Administrateur acteur de la Gouvernance tenant

- **SOURCE A** : UC-00 — « Super Admin... Ne fait partie d'aucun tenant. »
- **SOURCE B** : UC-30 (Governance Core) — Super Administrateur relié à des opérations de gouvernance intra-tenant (Constituer le bureau, Nommer/Révoquer un responsable, Planifier une assemblée, Enregistrer les décisions).
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : `DC_TANZEN_Membres_et_Bureau-Exécutif.png` montre `BoardMember.tenant_id FK NOT NULL` (implicite par la cardinalité `1..*` depuis `Tenant`) — aucune classe de ce diagramme ne prévoit de mécanisme pour un acteur sans tenant agissant sur les données d'un tenant (pas de champ « acted_by_platform_user » ni équivalent sur `BoardMember`/`Mandate`/`General_assemblies`). Ceci **aggrave** plutôt qu'il ne résout la contradiction : si le schéma exige `tenant_id NOT NULL` sur toutes les classes de gouvernance sans mécanisme d'action « pour compte de », l'intervention d'un Super Admin dans UC-30 reste sans support de schéma.
- **CONCLUSION POSSIBLE** : aucune résolution disponible ; le schéma ne fait qu'illustrer l'absence de tout mécanisme dédié.
- **DÉCISION À VALIDER** : **NON RÉSOLU PAR LES SOURCES DISPONIBLES.**

### CT-05 — Granularité `AUDIT_PHASE_01.md` vs `PHASE_04_USE_CASE_CLASSIFICATION.md` sur la Gouvernance

- **SOURCE A** : `AUDIT_PHASE_01.md` §2 traite « Gouvernance » en 2 lignes de cartographie sans dénombrer les UC individuels.
- **SOURCE B** : `PHASE_04_USE_CASE_CLASSIFICATION.md` dénombre 25 UC sur UC-30 seul et 8 sur UC-X5.
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : ce n'est pas une contradiction de contenu mais de granularité d'analyse (déjà qualifiée comme telle par Phase 4 elle-même) — un diagramme de classes, par nature, ne peut ni confirmer ni infirmer un écart de granularité entre deux documents d'audit. `DC_TANZEN_Membres_et_Bureau-Exécutif.png` et `DC_TANZEN_Gouvernance_et_Documents.png` confirment cependant, par le nombre de classes qu'ils portent (10 classes à eux deux), que le domaine Gouvernance est structurellement significatif — cohérent avec le chiffre élevé de Phase 4 (33 UC), pas avec la lecture plus sommaire de `AUDIT_PHASE_01.md`.
- **CONCLUSION POSSIBLE** : les classes corroborent indirectement la lecture de Phase 4 (domaine substantiel) sans pouvoir trancher la question de méthode elle-même.
- **DÉCISION À VALIDER** : **NON RÉSOLU PAR LES SOURCES DISPONIBLES** (question de méthode d'audit, pas de modèle de données — hors du pouvoir de résolution d'un diagramme de classes par nature).

### Nouvelles contradictions surfacées par la lecture attribut-par-attribut de cette mission

**NC-01 — `USERS.tenant_id NOT NULL` vs acteurs plateforme sans tenant**

- **CONTRADICTION** : `DC_TANZEN_Administration_et_Multi-tenant.png` montre une cardinalité `TENANTS 1..* USERS`, ce qui signifie structurellement qu'aucune ligne `USERS` ne peut exister sans être rattachée à un tenant. Or `PHASE_04_USE_CASE_CLASSIFICATION.md` documente UC01-11 à UC01-14 (« Créer/Modifier/Désactiver un administrateur plateforme », « Réinitialiser un mot de passe ») comme des opérations PLATFORM sur des « administrateurs plateforme », et UC-00 précise explicitement que le Super Admin « ne fait partie d'aucun tenant ».
- **SOURCE A** : `DC_TANZEN_Administration_et_Multi-tenant.png`, cardinalité `1..*` sur la relation `TENANTS→USERS`.
- **SOURCE B** : `PHASE_04_USE_CASE_CLASSIFICATION.md`, UC-00 et UC01-11 à UC01-14.
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : aucune classe distincte (`PlatformUser`/`Admin`) n'existe pour porter les comptes sans tenant — `USERS` est la seule classe de compte utilisateur sur les 7 diagrammes.
- **CONCLUSION POSSIBLE** : soit le schéma physique doit rendre `USERS.tenant_id` nullable pour les comptes plateforme (non représenté sur ce diagramme), soit une classe distincte de compte plateforme existe ailleurs (dictionnaire, hors périmètre relu ici), soit c'est un gap de modélisation.
- **DÉCISION À VALIDER** : **NON RÉSOLU PAR LES SOURCES DISPONIBLES** — nécessite une vérification ciblée de la fiche `users` du dictionnaire sur la nullabilité de `tenant_id`, non effectuée dans cette mission (hors périmètre : la mission demande de lire les diagrammes de classes, pas de rouvrir le dictionnaire sauf besoin ponctuel documenté).

**NC-02 — Absence totale du RBAC dynamique canonique sur les 7 diagrammes de classes**

- **CONTRADICTION** : `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 verrouille CANONIQUE le modèle RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`), au détriment explicite de `USERS.role` (jugé artefact obsolète). Or **aucune des 5 classes du RBAC dynamique n'apparaît sur aucun des 7 diagrammes de classes** — seul `USERS.role` (l'artefact déjà écarté) y figure.
- **SOURCE A** : `PHASE_02_DECISIONS_CANONIQUES.md` sujet 6 (statut CANONIQUE, verrouillé).
- **SOURCE B** : les 7 diagrammes de classes (silence total sur `Roles`/`Permissions`/`Role_permissions`/`Users_roles`/`Modules`).
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : aucun — c'est précisément l'absence qui constitue le constat.
- **CONCLUSION POSSIBLE** : les 7 diagrammes de classes sont, sur ce point, en retard non seulement sur le dictionnaire (déjà établi pour d'autres champs, cf. constat méthodologique de `PHASE_02_DECISIONS_CANONIQUES.md`) mais aussi sur le frontend réel de ce dépôt, qui a déjà construit `role.service.ts`, `user.service.ts` et les routes `/access-security/roles`, `/access-security/permissions` sur la base du modèle RBAC dynamique.
- **DÉCISION À VALIDER** : ce n'est pas une contradiction de fond (le sujet est déjà tranché CANONIQUE ailleurs) mais une dette de documentation : **les 7 diagrammes de classes devraient être régénérés pour inclure le RBAC dynamique**, sans quoi toute relecture future de ces seuls diagrammes reproduira la confusion déjà résolue.

**NC-03 — `Attendances.penalty_amount` embarqué vs `Penalty` transverse canonique ; `Accounts.account_role` absent du diagramme**

- **CONTRADICTION (1)** : `DC_TANZEN_Réunions_et_présences.png` montre `Attendances.penalty_amount NUMERIC(15,2)` comme champ direct, alors que `PHASE_02_DECISIONS_CANONIQUES.md` sujet 13 verrouille CANONIQUE un modèle `Penalty`/`penalties` **transverse et polymorphe** (`source_module ∈ {TONTINES, LOANS, MEETINGS, DOCUMENTS, SYSTEM}` + `source_id`), qui couvrirait déjà les pénalités de retard/absence en réunion sans nécessiter de champ dédié sur `Attendances`.
- **CONTRADICTION (2)** : `DC_TANZEN_Caisses_et_Cotisations.png` ne montre aucun champ `account_role` sur `Accounts`, alors que ce champ (`CHECK(STANDARD,TONTINE_PURCHASE,LOAN_FUND,SAVINGS)`) est verrouillé CANONIQUE par `PHASE_02_DECISIONS_CANONIQUES.md` sujet 12.
- **SOURCE A** : `PHASE_02_DECISIONS_CANONIQUES.md` sujets 12 et 13 (statuts CANONIQUE).
- **SOURCE B** : `DC_TANZEN_Réunions_et_présences.png` (champ `penalty_amount` embarqué) et `DC_TANZEN_Caisses_et_Cotisations.png` (absence de `account_role`).
- **ÉLÉMENTS APPORTÉS PAR LES CLASSES** : les deux diagrammes concernés montrent un état antérieur/incomplet par rapport au dictionnaire déjà tranché — cohérent avec le constat méthodologique transversal déjà établi par `PHASE_02_DECISIONS_CANONIQUES.md` (« les diagrammes de classes sont un rendu graphique en décalage avec le dictionnaire »), ici reconfirmé sur deux champs supplémentaires non vérifiés jusqu'ici.
- **CONCLUSION POSSIBLE** : cohérent avec le régime déjà établi — le dictionnaire fait foi, les diagrammes doivent être régénérés/corrigés, aucun changement frontend requis.
- **DÉCISION À VALIDER** : documentaire uniquement — mettre à jour `DC_TANZEN_Réunions_et_présences.png` (retirer ou justifier `penalty_amount`) et `DC_TANZEN_Caisses_et_Cotisations.png` (ajouter `account_role`) lors d'une prochaine régénération. Aucun changement de schéma canonique ni de frontend nécessaire — ce sont les diagrammes qui sont en retard, pas le modèle verrouillé.

---

## 11. Classes manquantes

**Rappel** : ce tableau documente, il n'implémente rien. Les colonnes « Existing frontend »/« Missing frontend » sont vérifiées en lecture seule contre `src/` réel de ce dépôt (`tanzen-frontend`), pas contre le projet voisin `tanzen-frontend-claude` analysé par `AUDIT_PHASE_01.md`.

| Classe | Domain | Context | Tenant Scope | Related UC | Existing frontend | Missing frontend | Priority | Notes |
|---|---|---|---|---|---|---|---|---|
| `TontinePosition` | Tontines | TENANT | UNKNOWN (schéma non spécifié) | UC02-11, UCX2-18 | Aucun (`UNKNOWN` service/route, 0 occurrence dans `src/`) | Écran d'achat de position, service dédié | HIGH | Déjà bloquant selon `PHASE_02_MODELE_CANONIQUE_FINAL.md` §7 point 1 — non relitigé ici |
| `PositionPayment` | Finance | TENANT | UNKNOWN | UC02-11, UCX2-18 | Aucun | Idem, lié à `TontinePosition` | HIGH | Idem |
| `TontineContribution` | Tontines | TENANT-SCOPED (indirect, via `cycle_id`) | Canonique dans le dictionnaire mais absente des 7 DC | UC02-09, UC40-06, UCX2-09/10 | `finance-module.tsx` route `/finance/contributions` (`ContributionsView`), `financeService.listContributions`/`listContributionsByMember` | Aucune classe de diagramme correspondante (gap documentaire, pas frontend) | MEDIUM | Le frontend a anticipé cette entité malgré son absence des 7 DC (cf. §8) |
| `LoanGuarantor` | Credit | TENANT | Indirect (via `loan_id`) | UC-60 (« Tables concernées »), UCX3 (implicite via garanties) | **Construit** : route `/finance/credit/guarantors`, `creditService.listGuarantors`/`listGuarantorsByLoan`, mock `guarantors.ts` | — | LOW | Contrairement à `AUDIT_PHASE_01.md` (sibling repo, ABSENT), **ce dépôt-ci l'a déjà construit** — divergence positive à noter |
| `Penalty` (transverse, `source_module`) | Credit (rattachement transverse verrouillé) | TENANT | UNKNOWN (absente de tout DC) | UC70-05 à UC70-08 (19 UC de UC-70 au total) | **Partiel seulement** : `LoanPenalty` imbriqué dans `Loan.penalties[]` (`src/mocks/finance/loans.ts`) — pas de classe/service transverse | Modèle polymorphe `source_module`/`source_id`, écran dédié Risk & Penalty | HIGH | Le frontend actuel ne couvre que le sous-cas Credit ; Meetings (`Attendances.penalty_amount`) et Tontines restent hors de ce modèle même partiel |
| `PenaltyRule` | Credit | TENANT | UNKNOWN | UC70-01 à UC70-04 | Aucun | Écran de configuration des règles de pénalité | MEDIUM | Aucun diagramme de classes ne couvre ce domaine (UC-70 entier sans DC dédié) |
| `Sanction` | Governance | TENANT | UNKNOWN | UC70-12 à UC70-14 | Aucun | Écran de sanctions | LOW | Distincte de `Penalty` selon Phase 4 (acteur Président, pas Trésorier) |
| `Committee` | Governance | TENANT | UNKNOWN | UC30-20 à UC30-22 | Aucun | Écran de gestion des comités | MEDIUM | Absente de `DC_Membres_et_Bureau-Exécutif.png` malgré son rattachement évident au même domaine |
| `Boards` | Governance | TENANT | UNKNOWN | (référencée uniquement par le dictionnaire, `board_mandates.board_id` — aucun UC ne la cite directement) | Aucun | Table de référence minimale (probablement 1 par tenant) | LOW | Gap déjà connu (`PHASE_02_DECISIONS_CANONIQUES.md` sujet 14), confirmé absente aussi de `DC_Membres_et_Bureau-Exécutif.png` (aucune FK `board_id` visible sur ce diagramme, qui ne fusionne pas `BoardMember`/`Mandate`) |
| `AgendaItem` | Governance | TENANT | UNKNOWN | UCX5-03 | Aucun | Ordre du jour d'assemblée/réunion | LOW | Absente de `DC_Gouvernance_et_Documents.png` |
| `MeetingMinutes` | Governance/Documents | TENANT | UNKNOWN | UCX5-04 | Route `/organization/governance/meetings` existe (`GovernanceTablePage kind="meetings"`) mais le niveau de détail procès-verbal n'a pas été vérifié dans cette mission | UNKNOWN (non vérifié en détail) | LOW | Prudence : ne pas conclure à l'absence totale sans relecture ciblée du composant, hors périmètre de cette mission |
| `Roles`/`Permissions`/`Role_permissions`/`Users_roles`/`Modules` | Access & Security | TENANT (sauf `Permissions`/`Modules`, GLOBAL) | TENANT-SCOPED pour `Roles`/`Role_permissions`/`Users_roles` | UC10-07, UC20-15 à UC20-22 | **Construit** : `role.service.ts`, routes `/access-security/roles`, `/access-security/permissions` | — | LOW | Cf. NC-02 — le frontend est ici en avance sur les 7 diagrammes de classes, pas en retard |
| `ApiClient`/`Webhook`/`SyncJob`/`IntegrationLog` | Settings (Integration Core) | TENANT | UNKNOWN | UC100I-01 à 06 | Non vérifié directement dans cette mission (hérité de `PHASE_04_USE_CASE_CLASSIFICATION.md`) | UNKNOWN | LOW | Aucun DC ne couvre l'Integration Core — hors périmètre des 7 diagrammes par construction |
| `LoanDisbursement`/`LoanInstallment`/`LoanInterestAccrual` | Credit | TENANT | UNKNOWN | UC60-01/05/06, UCX3-06/08 | Non vérifié directement (hérité des sources précédentes) | UNKNOWN | MEDIUM | Absentes de `DC_TANZEN_Crédit.png` (qui ne détaille que `Loans`/`Repayments`) |

---

## 12. Use Cases sans classes (matrice UC → Classe(s) → Domaine → Context → Route → Service → Tenant scope)

**Méthode** : la matrice complète des 299 UC (ID, titre, acteur, classe(s), portée tenant) est déjà publiée intégralement dans `PHASE_04_USE_CASE_CLASSIFICATION.md` §2 et n'est pas reproduite ligne à ligne ici (299 lignes déjà citables telles quelles, conformément à la consigne de ne pas recopier sans valeur ajoutée). Cette section ajoute les colonnes **Route potentielle** et **Service potentiel**, vérifiées contre `src/routes/app-router.tsx` et les `*-module.tsx`/`*.service.ts` réels de ce dépôt — jamais inventées, marquées `UNKNOWN` quand non vérifiables. Le regroupement se fait par domaine racine de routing (10 segments réels).

| Domaine (routing réel) | Préfixe de route vérifié | UC couverts (IDs, voir Phase 4 §2) | Classes principales | Context dominant | Service(s) vérifié(s) | Tenant scope |
|---|---|---|---|---|---|---|
| Organization (Members) | `/organization/members*` | UC02-05/06/07, UCX1-01 à UCX1-19 (partiel) | `Member` | TENANT | `organizationService.listMembers/getMember/createMember/updateMember` | TENANT-SCOPED |
| Organization (Governance) | `/organization/governance*` (`assemblies`, `meetings`, `votes`, `board-mandates`) | UC30-01 à UC30-25, UCX5-01 à UCX5-08 | `BoardMember`, `Mandate`, `Position`, `General_assemblies`, `Votes`, `Vote_options`, `Member_votes`, `Meetings` | TENANT | `organizationService.listAssemblies/listMeetings/listVotes/listBoardMembers` | TENANT-SCOPED |
| Finance | `/finance/accounts*`, `/finance/transactions`, `/finance/contributions`, `/finance/distributions*` | UC02-17 à UC02-19, UC50-01 à UC50-19, UCX4-01 à UCX4-07 | `Accounts`, `Transactions`, `Contribution_rules`, `Financial_categories`, `TontineContribution` (hors DC, cf. §11) | TENANT | `financeService.listAccounts/getAccount/createAccount/listTransactions/listContributions/listDistributions` | TENANT-SCOPED |
| Finance (Credit, sous-arbre) | `/finance/credit/applications*`, `/finance/credit/loans*`, `/finance/credit/repayments`, `/finance/credit/guarantors` | UC02-01 à UC02-04, UC60-01 à UC60-07, UCX3-01 à UCX3-18 | `Loan_policies`, `Loans`, `Repayments`, `LoanGuarantor` (hors DC) | TENANT | `creditService.listApplications/listLoans/getLoan/listRepayments/listGuarantors` | TENANT-SCOPED |
| Tontines | `/tontines*` (`create`, `:id`, `cycles*`, `cycles/:id/draws*`) | UC02-08 à UC02-11, UC40-01 à UC40-07, UCX2-01 à UCX2-19 (partiel) | `Tontine`, `TontineCycle`, `CycleMember`, `TontineDraw`, `TontineBid`, `DrawWinner` | TENANT | `tontinesService.listTontines/getTontine/listCyclesByTontine/getCycle/updateCycleStatus` — **aucune fonction dédiée aux tirages** (cf. §8) | TENANT-SCOPED (indirect pour `TontineCycle`/`CycleMember`/`TontineDraw`/`TontineBid`/`DrawWinner`, cf. §6) |
| Operations (Workflows/Notifications/Documents) | `/operations/workflows*`, `/operations/notifications`, `/operations/documents` | UC100W-01 à UC100W-12, UC80-01 à UC80-05, UC90-01 à UC90-21 (partiel) | `Documents` (seule classe couverte par un DC ; `Workflow`/`Notification` absentes de tout DC, cf. §5) | TENANT | `workflow.service.ts`, `notification.service.ts`, `document.service.ts` | TENANT-SCOPED |
| Access & Security | `/access-security/users`, `/roles`, `/permissions`, `/sessions`, `/mfa` | UC20-01 à UC20-22, UC10-06/07, UC03-01 à UC03-06 (partiel) | `Users` (seule classe de DC ; `Roles`/`Permissions` absentes de tout DC, cf. NC-02) | TENANT (+ PUBLIC/SAAS pour UC03-01/03, UC20-01/06) | `user.service.ts`, `role.service.ts`, `session.service.ts` | TENANT-SCOPED |
| Audit | `/audit/overview`, `/logs*`, `/security-events`, `/activity` | UC01-15 à UC01-17, UC03-12 à UC03-16, UC110-05 | `Audit_logs` | TRANSVERSAL | `audit.service.ts` (`list`, `get`) | TRANSVERSAL |
| Settings | `/settings/organization`, `/localization`, `/fiscal-years`, `/branding`, `/notifications`, `/security-policies`, `/modules`, `/integrations` | UC01-26 à UC01-28, UC10-02, UC30-13, UC100I-01 à 06 (partiel) | `FiscalYear` (seule classe de DC ; le reste sans classe de diagramme) | TENANT (majoritairement) | `settings.service.ts` | TENANT-SCOPED |
| Platform | `/platform/tenants*` | UC01-01/20 à UC01-25, UC10-01, UC10-08 (CT-01) | `Tenant` | PLATFORM | `organizationService.listTenants/getTenant/createTenant/updateTenant` | PLATFORM-SCOPED |
| Public / SaaS | `/` (`features`, `signin`, `signup`, `subscribe`, `downloads`, `docs`) | UC03-01/03, UC20-01/06 | Aucune classe de DC (formulaires simulés côté client, cf. `POST_MIGRATION_VALIDATION_REPORT.md` §10-13) | PUBLIC / SAAS | Aucun (simulation locale, `setTimeout`, sans appel réseau — confirmé §10-12 du rapport cité) | GLOBAL |
| Dashboard | `/dashboard` | UC02-21/22, UC10-05 | Agrégat multi-entités, aucune classe dédiée | TENANT | `dashboard.service.ts` | TENANT-SCOPED |
| — (sans domaine de routing correspondant) | `UNKNOWN` | UC70-01 à UC70-19 (Risk & Penalty Core, 19 UC), UC100I-01 à 06 (Integration Core), UCX5-03/04 (AgendaItem/MeetingMinutes) | `PenaltyRule`, `Sanction`, `ApiClient`, `Webhook`, `SyncJob`, `IntegrationLog`, `AgendaItem`, `MeetingMinutes` — aucune classe de DC | TENANT | `UNKNOWN` | `UNKNOWN` |

---

## 13. Anomalies

Taxonomie imposée : `CRITICAL`, `IMPORTANT`, `MINOR`, `AMBIGUOUS`, `INFORMATIONAL`.

### CRITICAL

1. **NC-01 — `USERS.tenant_id NOT NULL` incompatible avec les acteurs plateforme sans tenant** (§10). Un modèle où `USERS` exige structurellement un tenant, alors que des UC entiers (UC01-11 à UC01-14) décrivent des comptes utilisateurs explicitement sans tenant, est une classe fondamentale contradictoire au sens de la taxonomie — impossible de représenter un administrateur plateforme dans ce schéma tel que dessiné.
2. **Chaînes de tenant scope indirectes à profondeur 3 sur `TontineBid`/`DrawWinner`** (§6/§7.2) — risque d'accès cross-tenant si une future implémentation backend résout ces classes par identifiant technique seul sans forcer la jointure remontant à `Tontine.tenant_id`. Le risque est structurel (absence de colonne), pas observé en exploitation (aucun backend réel n'existe encore, cf. `PHASE_02_TENANT_ISOLATION_SPEC.md`), d'où le classement CRITICAL par nature du risque plutôt que par preuve d'exploitation.

### IMPORTANT

1. **NC-02 — Absence totale du RBAC dynamique canonique sur les 7 diagrammes** (§10) — modèle déjà verrouillé CANONIQUE mais non représenté graphiquement, source de confusion pour toute relecture future limitée aux diagrammes.
2. **`TontineContribution` absente de `DC_TANZEN_Tontines.png`** malgré son statut canonique et sa place dans la chaîne attendue du modèle Tontine (§8) — classe manquante sur le diagramme le plus directement concerné par elle.
3. **`TontinesService` sans fonctions dédiées aux tirages** (`listDraws`/`getDraw`/`listWinners`) malgré des écrans de tirage construits et fonctionnels (§8) — dette technique frontend, écart structure UI/service.
4. **10 classes sans `tenant_id` direct** (§6), plus que les 2 déjà documentées par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §4 — la question laissée ouverte par ce document (§9 point 3 : direct ou indirect ?) s'étend en réalité à un périmètre plus large que ce qui y était formulé.
5. **NC-03(1) — `Attendances.penalty_amount` embarqué, concurrent du modèle `Penalty` transverse canonique** (§10) — deux mécanismes de pénalité coexistent dans les sources (l'un transverse et verrouillé, l'autre localisé et dessiné) sans articulation documentée.
6. **NC-03(2) — `Accounts.account_role` absent de `DC_TANZEN_Caisses_et_Cotisations.png`** malgré son statut canonique verrouillé (§10) — diagramme incomplet par rapport à une décision déjà tranchée.
7. **CT-04 aggravée par le schéma** (§10) — le schéma de `DC_Membres_et_Bureau-Exécutif.png` ne prévoit aucun mécanisme pour une action « pour compte de » par un acteur plateforme sur des données tenant, alors qu'un tel acteur est explicitement montré par UC-30.

### MINOR

1. `Vote_options` toujours rendue littéralement comme `VARCHAR(255)` (défaut de rendu D-07, reconfirmé identique, §2.4) — déjà signalé, pas aggravé.
2. `Vote_options` (schéma réel) ne montre aucun champ de libellé visible sur le diagramme au-delà de `PK_id`/`FK_vote_id` — plus pauvre que le schéma canonique du dictionnaire (`vote_id`, `label`), mais sans impact puisque le dictionnaire fait déjà foi.
3. `LOAN_POLICIES`/`Tontine.frequency` : deux échelles de fréquence légèrement différentes (`Tontine.frequency ENUM(daily,weekly,monthly)`, 3 valeurs, vs `Contribution_rules.frequency CHECK(daily,weekly,monthly,yearly,fixed)`, 5 valeurs) — champs de portée différente (Tontine vs Compte), pas nécessairement une incohérence, mais à vérifier lors d'une future harmonisation.
4. Annotation manuscrite « Fusionnés » sur `BoardMember`/`Mandate` toujours non exécutée graphiquement (§2.3, D-02 déjà connu) — dette de mise à jour des diagrammes, sans impact puisque le dictionnaire a déjà exécuté la fusion.

### AMBIGUOUS

1. `MeetingMinutes` : présence/absence exacte dans le frontend non tranchée par cette mission (§11) — la route `/organization/governance/meetings` existe mais son contenu détaillé (procès-verbal ou non) n'a pas été relu.
2. `CT-01` (« Configurer le tenant », deux titres identiques) reste ambiguë même après consultation du diagramme de classes — le schéma partagé ne permet pas de distinguer une opération unique d'une paire d'opérations (§10).
3. Portée exacte de `Backups` (UC110-07, « selon les droits ») — déjà signalée ambiguë par Phase 4, non éclaircie par `DC_TANZEN_Administration_et_Multi-tenant.png`, qui montre `Backups.tenant_id` comme un simple FK sans indication de règle d'accès différenciée.

### INFORMATIONAL

1. Aucune interface, méthode ou relation d'héritage/agrégation/composition formelle sur les 7 diagrammes (§2) — rappel structurel, sans impact fonctionnel direct, mais utile pour cadrer toute réutilisation future de ces diagrammes comme base de génération de code (ils ne portent aucune information comportementale).
2. Le périmètre frontend réel de ce dépôt (`tanzen-frontend/src`) est significativement plus construit que celui décrit par `AUDIT_PHASE_01.md` sur plusieurs points (`LoanGuarantor`, tirages de tontine, Gouvernance/Bureau Exécutif, RBAC dynamique) — à ne pas perdre de vue lors de toute réutilisation future de `AUDIT_PHASE_01.md` comme référence de « ce qui est construit ».
3. `Payments` (SaaS Billing) et `Transactions` (Tenant Finance) restent bien deux modèles disjoints sur les diagrammes (aucun champ, aucune FK commune au-delà d'une similarité de nommage `payment_method`) — conforme à la distinction déjà établie par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §14, reconfirmée ici positivement (pas une anomalie, une vérification qui passe).

---

## 14. Décisions à valider

Reprises des points relevés en §10/§13, jamais tranchées ici.

1. **NC-01** : `USERS.tenant_id` doit-il devenir nullable pour porter les comptes plateforme, ou une classe `PlatformUser` distincte doit-elle être spécifiée ? Vérifier en priorité la fiche `users` du dictionnaire (`dictionnaire_donnees.xlsx`) sur ce point précis avant toute décision — non vérifié dans cette mission.
2. **NC-02** : les 7 diagrammes de classes doivent-ils être régénérés pour inclure `Roles`/`Permissions`/`Role_permissions`/`Users_roles`/`Modules`, conformément au statut CANONIQUE déjà verrouillé ? Question purement documentaire, sans impact sur le code.
3. **NC-03** : `Attendances.penalty_amount` doit-il être retiré au profit du modèle `Penalty` transverse déjà canonique, ou les deux mécanismes doivent-ils coexister (pénalité rapide embarquée + pénalité formelle transverse) ? Question fonctionnelle, pas seulement documentaire — impacte un futur écran Risk & Penalty Core.
4. **`Accounts.account_role`** : confirmer que son absence du diagramme `DC_Caisses_et_Cotisations` est une simple dette de mise à jour et non un signal que ce champ a été abandonné entre la rédaction du dictionnaire et celle du diagramme (chronologie non vérifiable depuis les sources disponibles).
5. **`TontineContribution` absente de `DC_TANZEN_Tontines.png`** : à ajouter lors d'une prochaine régénération du diagramme, conformément à la chaîne canonique déjà verrouillée (§8).
6. **Politique `tenant_id` direct vs indirect** sur les 10 classes identifiées en §6 : uniformiser (ajouter `tenant_id` directement partout) ou accepter officiellement le pattern de jointure indirecte comme suffisant — question déjà ouverte pour 2 classes par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §9 point 3, ici élargie à 8 classes supplémentaires avec preuve directe à l'appui.
7. **Rattachement de `TontineBid`** (variante enchère du tirage) : aucun UC ne l'exerce explicitement (§9.2) — confirmer si cette variante reste une capacité de schéma dormante ou doit être retirée/documentée comme hors périmètre V1, cohérent avec la règle source « le tirage est manuel » de UC-40.
8. **Comité de Crédit** (résiduel, hérité de Phase 2 sujet 7, non traité ni aggravé ici) : toujours sans classe de rattachement (`Position`, `BoardMember`, ou une éventuelle classe `Committee` à spécifier).

---

## 15. Recommandations pour Phase 6

**Rappel du périmètre** : ces recommandations ne constituent pas un plan d'implémentation — elles priorisent les clarifications documentaires et de spécification nécessaires avant qu'une Phase 6 (hors périmètre de cette mission) puisse démarrer un travail de code.

1. **Traiter NC-01 en priorité absolue** avant tout travail sur l'authentification réelle ou le Platform Core (`DECISION_PLATFORM_SAAS_TENANT_FINAL.md` §9/§22) — un modèle `USERS` qui ne peut structurellement pas représenter un compte plateforme sans tenant bloque directement la brique d'authentification que ce même document identifie comme le principal élément encore nécessitant le backend.
2. **Régénérer ou annoter les 7 diagrammes de classes** pour refléter les décisions déjà verrouillées par `PHASE_02_DECISIONS_CANONIQUES.md`/`PHASE_02_MODELE_CANONIQUE_FINAL.md` non encore reflétées graphiquement : RBAC dynamique (NC-02), `TontineContribution` sur le diagramme Tontines (§8), `Accounts.account_role` (NC-03). Objectif : éviter qu'une future relecture indépendante de ces seuls diagrammes ne rouvre des débats déjà tranchés.
3. **Spécifier une politique uniforme de `tenant_id` direct/indirect** (décision à valider #6, §14) avant d'implémenter les 12 tests obligatoires de `PHASE_02_TENANT_ISOLATION_SPEC.md` §14 sur les 10 classes concernées — ces tests supposent un mécanisme de vérification par ressource qui n'est pas uniforme aujourd'hui selon que la classe porte ou non un `tenant_id` direct.
4. **Ne pas relitiguer** la spécification de `TontinePosition`/`PositionPayment`, déjà identifiée bloquante par `PHASE_02_MODELE_CANONIQUE_FINAL.md` §7 point 1 — cette mission confirme simplement que leur absence des 7 diagrammes de classes est totale et inchangée, y compris sur le diagramme Tontines où on les attendrait le plus.
5. **Documenter formellement `Committee`, `PenaltyRule`, `Sanction`, `AgendaItem`, `MeetingMinutes`, `Boards`** (§11) dans le dictionnaire de données avant toute Phase 6 qui prioriserait Gouvernance étendue ou Risk & Penalty Core — aucune de ces classes n'a de fiche ni de diagramme, contrairement à `TontinePosition`/`PositionPayment` qui ont au moins un statut architectural verrouillé.
6. **Ne pas traiter `AUDIT_PHASE_01.md` comme référence à jour de « ce qui est construit »** pour ce dépôt précis (`tanzen-frontend`) — ce document analysait le projet voisin `tanzen-frontend-claude`. Cette mission a confirmé, en lecture directe de `src/`, que `LoanGuarantor`, les tirages de tontine (UI, pas service, cf. anomalie IMPORTANT #3) et la Gouvernance (Bureau Exécutif) sont déjà construits ici. Toute Phase 6 doit repartir de l'inventaire réel (`src/features/`, `src/services/`, `src/routes/app-router.tsx`) vérifié dans cette mission plutôt que de la cartographie du projet voisin.
7. **Clore ou faire trancher les 4 contradictions Phase 4 restées NON RÉSOLUES** (CT-01, CT-03, CT-04, CT-05) par une source qui n'est ni un diagramme de cas d'utilisation ni un diagramme de classes — ces deux familles de sources ont montré leurs limites sur ces 4 points précis ; une clarification produit directe (Product Owner) est nécessaire, cohérent avec le mode de résolution déjà utilisé pour les 5 sujets BLOQUANT/À VALIDER de Phase 2.

---

*Fin du rapport. Aucun fichier autre que `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` n'a été créé ou modifié. Aucun fichier sous `src/` n'a été modifié — seules des lectures (`Read`, `Grep`, `Bash` en lecture seule) et les trois commandes de validation technique demandées (`tsc`, `eslint`, `build`, résultats en §1) ont été exécutées contre `src/`.*
