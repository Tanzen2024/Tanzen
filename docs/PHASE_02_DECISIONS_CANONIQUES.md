# TANZEN — Phase 02 : Décisions canoniques et non bloquantes

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié, créé ou supprimé pour produire ce rapport. Les deux seuls fichiers créés par cette mission sont `docs/PHASE_02_DECISIONS_CANONIQUES.md` (le présent document) et `docs/PHASE_02_DECISIONS_A_VALIDER.md`.

## Méthodologie et périmètre

Ce document est la Phase 2 de reconciliation, faisant suite à `docs/AUDIT_PHASE_01.md` (l'audit croisé complet des 21 Use Cases, 7 diagrammes de classes, 7 diagrammes de séquence, du diagramme d'architecture globale et du code frontend). Il reprend les 17 sujets de décision explicitement demandés plus les éléments complémentaires révélés par la section 9 (« Conflits ») et la section 10 (« Doublons potentiels ») de l'audit, et les classe selon 4 statuts : **CANONIQUE**, **NON BLOQUANT**, **À VALIDER**, **BLOQUANT**. Le présent fichier regroupe tous les sujets **CANONIQUE** et **NON BLOQUANT** ; l'autre fichier (`PHASE_02_DECISIONS_A_VALIDER.md`) regroupe tous les sujets **À VALIDER** et **BLOQUANT**.

**Caveat sur les sources.** Les 15 documents de décision Markdown (`TANZEN_DECISION_MASTER.md`, `TANZEN_CROSS_CUTTING_DECISIONS.md`, `TANZEN_FRONTEND_DECISIONS.md`, `TANZEN_DECISION_03_DICTIONARY.md`, `TANZEN_TONTINE_CYCLE_DECISION.md`, etc.) que `AUDIT_PHASE_01.md` a lus et cités intégralement dans une session antérieure **ne sont pas physiquement présents** dans `tanzen-frontend/docs` — ils n'existent que dans le projet voisin `tanzen-frontend-claude` (hors périmètre pour cette mission). Toute référence à ces documents dans les entrées ci-dessous provient exclusivement des citations déjà vérifiées par `AUDIT_PHASE_01.md` ; ils n'ont pas été rouverts ni re-lus directement dans le cadre de cette Phase 2.

**Sources relues directement pour cette phase** : `AUDIT_PHASE_01.md` intégralement, et une extraction ciblée de `dictionnaire_donnees.xlsx` (26 des 59 feuilles : `tenants`, `users`, `roles`, `permissions`, `role_permissions`, `users_roles`, `modules`, `accounts`, `members_accounts`, `members`, `tontines`, `tontine_cycles`, `cycle_members`, `tontine_contributions`, `tontine_draws`, `draw_winners`, `positions`, `board_mandates`, `penalties`, `loan_guarantors`, `loans`, `repayments`, `meetings`, `attendances`, `workflows`, `workflow_requests`, `fiscal_years`, `financial_categories`, `contribution_rules`, `general_assemblies`, `votes`, `vote_options`, `transactions`) via `openpyxl`, afin de trancher les points que l'audit signalait comme nécessitant une vérification directe (catalogue RBAC, modèle comptable, `organization_type`, conventions `tenant_id`). Cette relecture directe a produit plusieurs affinements par rapport aux constats de `AUDIT_PHASE_01.md` — documentés au cas par cas ci-dessous.

**Constat méthodologique transversal, découvert pendant cette phase** : sur presque tous les champs `status`/`type`/`method` vérifiés directement dans `dictionnaire_donnees.xlsx`, la valeur `CHECK` du dictionnaire **correspond exactement** aux valeurs déjà codées dans le frontend, et **diverge** de ce que montrent les diagrammes de classes (PNG) cités par `AUDIT_PHASE_01.md`. Cela suggère que les diagrammes de classes sont un rendu graphique produit à un stade antérieur ou simplifié du dictionnaire, et non l'inverse — le dictionnaire Excel étant explicitement désigné comme source canonique dans le périmètre de cette mission. Quand ce schéma se répète (constaté directement sur 6 champs indépendants), il est traité ici comme preuve documentaire suffisante pour trancher en faveur du frontend/dictionnaire sans que cela constitue un arbitrage métier — conformément à la consigne de vérifier `dictionnaire_donnees.xlsx` pour les décisions à fort impact. Là où le dictionnaire lui-même est silencieux ou explicitement non tranché (ex. `tontine_cycles.status`), aucune résolution n'est proposée : le sujet est renvoyé au fichier À VALIDER.

**Autre constat de périmètre** : `tanzen-frontend/src` (ce dépôt) a une arborescence `features/` (`access`, `audit`, `dashboard`, `finance`, `operations`, `organization`, `settings`, `tontines`) différente de celle analysée par `AUDIT_PHASE_01.md` (`identity`, `member`, `tontine`, `finance`, `loan`, `workflow`, `notification`, issue de `tanzen-frontend-claude/src` par choix de périmètre explicite de l'audit). Les rubriques « Impact frontend » ci-dessous sont donc formulées au niveau du domaine/modèle de données, sans présumer de chemins de fichiers spécifiques qui n'existent pas nécessairement dans ce dépôt.

---

## Sujets CANONIQUE

### 1. `Member.status`

- **Problème** : le frontend utilise 4 valeurs (`ACTIVE, INACTIVE, SUSPENDED, EXITED`) ; `AUDIT_PHASE_01.md` (C-01) citait un `CHECK(active, inactive)` à 2 valeurs sur plusieurs diagrammes de classes (DC_Tontines, DC_Réunions, DC_Gouvernance), classé BLOQUANT.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-01 ; vérification directe de la feuille `members` de `dictionnaire_donnees.xlsx` : `status VARCHAR(20) DEFAULT 'ACTIVE'`, description métier « État du membre (ACTIVE, INACTIVE, SUSPENDED, EXITED) » — 4 valeurs, identiques au frontend.
- **Conflit** : dictionnaire (canonique) vs diagrammes de classes — pas dictionnaire vs frontend.
- **Analyse** : le dictionnaire de données, source désignée comme canonique pour cette mission, confirme exactement les 4 valeurs déjà codées côté frontend. Les diagrammes de classes montrant seulement 2 valeurs sont une simplification de rendu, cohérente avec le schéma répété observé sur plusieurs autres champs (voir constat méthodologique en tête de document).
- **Décision proposée** : adopter `ACTIVE, INACTIVE, SUSPENDED, EXITED` comme énumération canonique de `Member.status`. Aucun changement frontend requis.
- **Impact frontend** : aucun — le modèle actuel est déjà conforme.
- **Impact backend** : la contrainte `CHECK` doit être implémentée avec ces 4 valeurs ; les diagrammes de classes devraient être corrigés/régénérés pour éviter une confusion future en cas de relecture indépendante.
- **Statut** : **CANONIQUE**.

### 5. `Transaction.type`

- **Problème** : `AUDIT_PHASE_01.md` (C-10bis) signalait un conflit « ensembles disjoints, BLOQUANT » entre le frontend (`INCOME, EXPENSE, TRANSFER, COTISATION, LOAN_DISBURSEMENT, LOAN_REPAYMENT`) et DC_Caisses_et_Cotisations (`income, expense, transfer, tontine, penalty, adjustment`).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-10bis ; feuille `transactions` du dictionnaire : `ck_transactions_type_valid = CHECK(type IN ('INCOME','EXPENSE','TRANSFER','COTISATION','LOAN_DISBURSEMENT','LOAN_REPAYMENT'))` — correspondance exacte avec le frontend, aucune trace de `tontine`/`penalty`/`adjustment`.
- **Conflit** : dictionnaire vs diagramme de classes (le frontend est aligné avec le dictionnaire).
- **Analyse** : preuve directe et non ambiguë en faveur du frontend. Le champ `payment_method` de la même table confirme aussi `CASH, MOBILE_MONEY, BANK, CARD` — identique à `PaymentMethod` frontend (y compris `CARD`, que le diagramme de classes omettait, cf. C-08bis ci-dessous).
- **Décision proposée** : adopter les 6 valeurs déjà codées côté frontend comme énumération canonique de `Transaction.type`.
- **Impact frontend** : aucun.
- **Impact backend** : implémenter le `CHECK` avec ces 6 valeurs ; ne pas reprendre les valeurs `tontine/penalty/adjustment` du diagramme de classes, qui n'ont aucune trace dans le dictionnaire.
- **Statut** : **CANONIQUE**.

### 6. `USERS.role` vs RBAC dynamique

- **Problème** : `AUDIT_PHASE_01.md` (C-09) documentait une coexistence non résolue entre `USERS.role VARCHAR(20) CHECK(owner, admin, manager, treasurer, secretary, member)` (colonne unique, vue sur DC_Administration_et_Multi-tenant) et le modèle RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`), classé BLOQUANT, avec instruction explicite de ne pas trancher sans preuve documentaire directe.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-09, §11 point 10 ; vérification directe et intégrale de la feuille `users` du dictionnaire (34 lignes, dimensions A1:F34) : les champs sont `id, uuid, tenant_id, name, email, phone, password, preferred_language, is_active, last_login_at, sync_status, version, created_at, updated_at, deleted_at, created_by, updated_by` — **aucune colonne `role`**. En parallèle, les feuilles `roles`, `permissions`, `role_permissions`, `users_roles` sont chacune intégralement spécifiées (champs, contraintes `UNIQUE`/`CHECK`, clés étrangères, y compris l'isolation `tenant_id` sur `roles`/`role_permissions`/`users_roles`), avec un niveau de détail cohérent avec les autres tables pleinement adoptées du dictionnaire.
- **Conflit** : dictionnaire (silencieux sur toute colonne `role` directe, mais exhaustif sur le RBAC N:N) vs un diagramme de classes qui affiche une colonne `role` sur `USERS`.
- **Analyse** : c'est la preuve documentaire directe que la consigne de mission demandait avant de trancher ce sujet en faveur d'un des deux modèles. La table `users` canonique n'a structurellement pas de place pour un rôle unique codé en dur ; le RBAC dynamique est au contraire complètement modélisé, avec granularité `permissions.code` de type `module.action` (ex. `loans.create`), actions standardisées (`CREATE, READ, UPDATE, DELETE, APPROVE, EXPORT, IMPORT`) et gestion multi-tenant explicite. Ceci confirme que le frontend déjà construit (`PermissionGate`, `usePermissionStore`, `hasPermission`) est aligné avec le modèle canonique, et que la colonne `USERS.role` vue sur le diagramme de classes est un artefact de rendu obsolète/simplifié (cohérent avec le constat méthodologique transversal en tête de document).
- **Décision proposée** : le RBAC dynamique (`roles`/`permissions`/`role_permissions`/`users_roles`) est le modèle d'autorisation canonique. La colonne `USERS.role` unique ne doit pas être implémentée ni utilisée comme source d'autorité pour les décisions d'accès.
- **Impact frontend** : aucun changement de modèle nécessaire — le RBAC dynamique déjà implémenté est confirmé comme cible. Le catalogue de permissions/rôles reste à peupler (rappel décision déjà connue, non bloquante, cf. `AUDIT_PHASE_01.md` §11 point 9).
- **Impact backend** : ne pas créer de colonne `role` sur `users` ; l'API d'autorisation doit résoudre les permissions effectives via `users_roles → roles → role_permissions → permissions`, filtré par `tenant_id`.
- **Statut** : **CANONIQUE**.

### 7. Rôles métier (Président/Trésorier/Secrétaire/Comité de Crédit) vs rôles RBAC

- **Problème** : `AUDIT_PHASE_01.md` (C-08) documentait une contradiction entre `TANZEN_CROSS_CUTTING_DECISIONS.md` §4.1 (« aucun rôle métier nommé n'apparaît comme acteur dans la spec fonctionnelle, ne coder aucun rôle en dur ») et 6 diagrammes Use Case (UC50, UC70, UC90, UCX1, UCX2, UCX3) qui utilisent Président/Trésorier/Secrétaire/Comité de Crédit comme acteurs UML nommés, classé BLOQUANT pour la doctrine « pas de rôle en dur ».
- **Sources** : `AUDIT_PHASE_01.md` §9 C-08, §11 point 11 ; vérification directe des feuilles `positions` (« Core RBAC Module », catalogue de fonctions nommées avec `code`/`name` — exemples cités : Président, Trésorier, Secrétaire, Manager — indépendant du modèle d'autorisation) et `board_mandates` (« Core Governance Module », fusion déjà exécutée de `BoardMember`+`Mandate`, cf. sujet 14, avec `role VARCHAR(100)` en texte libre portant explicitement « Poste occupé (Président, Trésorier, Secrétaire…) »).
- **Conflit** : apparent seulement — les deux mécanismes ne portent pas la même responsabilité.
- **Analyse** : le dictionnaire canonique résout la contradiction en distinguant deux couches indépendantes : (a) l'autorisation technique, portée par le RBAC dynamique (sujet 6, confirmé canonique) et (b) l'étiquetage/la fonction de gouvernance, portée par `positions` (catalogue de libellés, y compris rôles système `is_system`) et `board_mandates.role` (historisation de qui occupe quelle fonction, avec dates de mandat). Les diagrammes Use Case nommant Président/Trésorier/Secrétaire comme acteurs sont donc cohérents avec l'existence de `positions`/`board_mandates` — ils décrivent des fonctions de gouvernance affichées, pas des rôles d'autorisation codés en dur. La doctrine « pas de rôle en dur » de `TANZEN_CROSS_CUTTING_DECISIONS.md` reste valable **pour l'autorisation** (sujet 6) et n'est pas contredite par l'existence d'un catalogue de libellés de fonction. Point résiduel non résolu : « Comité de Crédit » (acteur de UCX3) n'a aucune trace dans `positions`, `board_mandates`, ni ailleurs dans le dictionnaire — sa nature (poste individuel, groupe d'approbateurs de workflow, ou comité collégial) reste non spécifiée, mais ce point isolé ne remet pas en cause l'architecture à deux couches ci-dessus.
- **Décision proposée** : maintenir le RBAC dynamique comme seul mécanisme d'autorisation (aucun rôle en dur dans le code de contrôle d'accès) ; utiliser `positions`/`board_mandates` comme catalogue d'affichage/gouvernance pour les fonctions nommées (Président, Trésorier, Secrétaire…). Le statut exact de « Comité de Crédit » reste ouvert mais n'est pas bloquant pour cette architecture.
- **Impact frontend** : un domaine Gouvernance (absent aujourd'hui, cf. `AUDIT_PHASE_01.md` §8) pourrait exposer `positions`/`board_mandates` pour afficher « qui est Trésorier actuellement » sans que cela influence le `PermissionGate`.
- **Impact backend** : garder `positions`/`board_mandates` strictement dissociés des tables d'autorisation ; ne pas créer de FK entre `board_mandates.role` et un quelconque `roles.id` du RBAC.
- **Statut** : **CANONIQUE** (le point résiduel sur « Comité de Crédit » est un gap mineur, non bloquant pour cette décision d'architecture).

### 11. `LoanGuarantor`

- **Problème** : `AUDIT_PHASE_01.md` (C-14, §11 point 13) signalait que `LoanGuarantor` est implémenté côté frontend (type, service, dialogue) sur la seule base du nom `loan_guarantors` cité dans l'encart « Tables concernées » de UC-60, sans diagramme de classes de référence — recommandait de « confirmer le schéma exact ».
- **Sources** : `AUDIT_PHASE_01.md` §3.2, §9 C-14 ; vérification directe de la feuille `loan_guarantors` du dictionnaire : schéma complet et cohérent — `loan_id`, `guarantor_member_id`, `guarantee_amount`, `guarantee_type CHECK(FULL, PARTIAL)`, `status CHECK(ACTIVE, RELEASED, DEFAULTED)`, `approved_at`, `released_at`, avec contraintes d'unicité (`UNIQUE(loan_id, guarantor_member_id)`, garantie active unique par prêt).
- **Conflit** : aucun — le dictionnaire canonique comble exactement le vide identifié par l'audit.
- **Analyse** : la table existe et est pleinement spécifiée dans le dictionnaire canonique (59 tables), malgré son absence du diagramme de classes DC_Crédit et de la séquence DSEQ_PRÊT_REMBOURSEMENT. Le frontend a anticipé correctement l'existence fonctionnelle de cette entité ; reste à vérifier champ par champ que le type frontend correspond au schéma canonique ci-dessus (`guarantee_amount`/`guarantee_type`/`status` avec ses 3 valeurs, `approved_at`/`released_at`).
- **Décision proposée** : `loan_guarantors`, tel que défini dans le dictionnaire, est le schéma canonique. Aligner le type frontend sur ces champs exacts si des écarts sont trouvés lors d'une revue de code dédiée (hors périmètre de cette mission documentaire).
- **Impact frontend** : vérifier/aligner les champs de `LoanGuarantor` (notamment `guaranteeType: FULL|PARTIAL` et `status: ACTIVE|RELEASED|DEFAULTED`) sur ce schéma.
- **Impact backend** : implémenter `loan_guarantors` tel que documenté ; ajouter la relation au diagramme de classes DC_Crédit pour éviter la divergence structurelle observée.
- **Statut** : **CANONIQUE**.

### 12. `Account.accountCategory`

- **Problème** : `AUDIT_PHASE_01.md` (C-18, C-11bis) signalait que le frontend traite `accountCategory` comme un champ texte libre « sans liste de valeurs confirmée », alors que les diagrammes de classes montrant `Accounts` affichent un `CHECK(tontine, savings, loan_pool, social_fund, school_fund, operational)` complet — jugé « le frontend sous-estime la contrainte réellement documentée ».
- **Sources** : `AUDIT_PHASE_01.md` §9 C-11bis, C-18 ; vérification directe de la feuille `accounts` : la section « CONTRAINTES MÉTIER » liste `ck_accounts_balance`, `ck_accounts_type` (`ASSET, LIABILITY, INCOME, EXPENSE, EQUITY, CASH`) et `ck_accounts_role` (`STANDARD, TONTINE_PURCHASE, LOAN_FUND, SAVINGS`) — **aucun `ck_accounts_category`** n'existe. Le champ `account_category` est déclaré `NOT NULL` mais sans `CHECK` associé nulle part dans le dictionnaire.
- **Conflit** : dictionnaire vs diagramme de classes — le dictionnaire canonique confirme l'absence de contrainte, contredisant le diagramme.
- **Analyse** : la vérification directe inverse le constat de l'audit : ce n'est pas le frontend qui « sous-estime » une contrainte réelle, c'est le diagramme de classes qui **invente** une contrainte absente du dictionnaire canonique. En revanche, `account_role` (champ distinct de `account_category`) est bien contraint par `CHECK(STANDARD, TONTINE_PURCHASE, LOAN_FUND, SAVINGS)` — et cette liste correspond exactement à `Account.accountRole` déjà codé côté frontend. Il y a donc deux champs métier distincts (`type`, `account_category`, `account_role`) et le frontend a raison de traiter `account_category` comme non contraint tout en modélisant `accountRole` avec une énumération fermée.
- **Décision proposée** : conserver `accountCategory` en texte libre (non contraint) côté frontend, tel qu'actuellement documenté ; confirmer `accountRole` avec les 4 valeurs `STANDARD, TONTINE_PURCHASE, LOAN_FUND, SAVINGS` comme canoniques (déjà le cas).
- **Impact frontend** : aucun changement nécessaire ; le commentaire de code existant (« accountCategory n'a aucune liste de valeurs confirmée ») est correct et peut être conservé tel quel — désormais avec une preuve directe à l'appui plutôt qu'une hypothèse.
- **Impact backend** : ne pas ajouter de `CHECK` sur `account_category` sans nouvelle spécification métier ; la contrainte d'unicité `uq_accounts_tontine_purchase_singleton` (un seul compte `TONTINE_PURCHASE` actif par tenant) doit être implémentée sur `account_role`.
- **Statut** : **CANONIQUE**.

### 13. `Penalty`

- **Problème** : `AUDIT_PHASE_01.md` (C-11, §11 point 17) signalait un rattachement de domaine non tranché entre Credit Core (Architecture_globale) et Risk & Penalty Core, domaine autonome transverse (UC-70).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-11 ; vérification directe de la feuille `penalties` : `source_module VARCHAR(50) NOT NULL`, avec `ck_penalties_module_valid = CHECK(source_module IN ('TONTINES','LOANS','MEETINGS','DOCUMENTS','SYSTEM'))`, et `type CHECK(LATE_CONTRIBUTION, ABSENCE, LOAN_DELAY, EARLY_EXIT, RULE_VIOLATION, ADMIN_FEE)`.
- **Conflit** : résolu par la structure même de la table canonique.
- **Analyse** : le schéma canonique tranche explicitement la question — `penalties` est conçue dès l'origine comme une table **transverse**, avec un `source_module` couvrant 5 domaines (Tontines, Loans, Meetings, Documents, System), pas seulement Credit Core. Le rattachement « Credit Core » vu dans Architecture_globale est donc une simplification de placement graphique, et UC-70 (« Risk & Penalty Core », domaine autonome) est la lecture correcte du modèle de données.
- **Décision proposée** : `Penalty`/`penalties` est un domaine transverse autonome (Risk & Penalty Core), consommé par Tontine/Loan/Meeting/Document/System via `source_module` + `source_id`, et non une sous-fonction du seul Credit Core.
- **Impact frontend** : si un domaine Risk & Penalty Core est construit, il doit être transverse (nav de premier niveau), pas une sous-page du Loan Core ; l'écran devra permettre de filtrer par `source_module`.
- **Impact backend** : implémenter `penalties` avec `source_module`/`source_id` comme clé polymorphe documentée (déjà le design canonique) ; chaque pénalité peut générer une écriture dans `transactions` (mentionné dans la description métier de la feuille).
- **Statut** : **CANONIQUE** (sur la question du rattachement de domaine ; le placement exact dans la navigation frontend reste un détail UX non bloquant).

### 15. `TontineDraw` / Draw Engine

- **Problème** : `AUDIT_PHASE_01.md` (§6 workflow 7, §10 D-03) documentait `TontineDraw`/`DrawWinner` comme entièrement absents du frontend, avec `Tontine_draw_engine` marqué « Fusionnés » avec `TontineDraw` sur Architecture_globale (annotation manuscrite), classé « À VALIDER, faible risque ».
- **Sources** : `AUDIT_PHASE_01.md` §6, §10 D-03 ; vérification directe des feuilles `tontine_draws` (« Core Savings Rotation Engine » — `cycle_id`, `draw_number`, `draw_type CHECK(ROTATION, AUCTION, RANDOM)`, `status CHECK(PENDING, COMPLETED, CANCELLED)`, `scheduled_member_id`/`actual_winner_id`, `winning_bid`, avec contrainte logique « un tirage `COMPLETED` doit avoir un gagnant ») et `draw_winners` (« Core Tontine Settlement Module » — `draw_id` unique par tirage, `contribution_pool`, `amount_received`, `bid_amount`).
- **Conflit** : aucun réel — `Tontine_draw_engine` n'est effectivement jamais une table de données dans le dictionnaire (59 tables), confirmant l'hypothèse D-03 de l'audit.
- **Analyse** : le schéma canonique de `TontineDraw`/`DrawWinner` est complet, cohérent et prêt à l'implémentation : 3 modes de tirage (`ROTATION`, `AUCTION`, `RANDOM`), séparation claire entre le tirage (décision) et son règlement financier (`draw_winners`, couche de settlement). L'annotation « Fusionnés » se confirme purement conceptuelle : le moteur (`Tontine_draw_engine`) est un service qui produit des lignes `tontine_draws`/`draw_winners`, pas une table distincte à fusionner physiquement.
- **Décision proposée** : adopter `tontine_draws` + `draw_winners` tels que définis dans le dictionnaire comme schéma canonique du moteur de tirage. Ne pas créer de table `tontine_draw_engine`.
- **Impact frontend** : premier chantier concret pour construire les écrans de tirage (absents aujourd'hui) : liste des tirages par cycle, déclenchement d'un tirage selon `draw_type`, affichage du gagnant et du règlement. **Dépendance** : ce chantier suppose que les positions/paiements (sujets 9 et 10, BLOQUANT) soient au moins partiellement clarifiés, puisque DSEQ_TONTINE_DRAW_ENGINE ne récupère que les positions déjà `PAID` avant de tirer.
- **Impact backend** : implémenter `tontine_draws`/`draw_winners` avec les contraintes ci-dessus ; le moteur de tirage est un service applicatif, pas une entité de plus.
- **Statut** : **CANONIQUE** (schéma de données) — l'implémentation frontend reste conditionnée par la résolution des sujets 9/10.

### 16. Comptabilité en partie double

- **Problème** : arbitrer entre (A) le modèle simplifié actuellement utilisé côté frontend (`Account.balance` modifiable directement, `Transaction` unique) et (B) la comptabilité en partie double décrite par UC-X4 (`journals`, `transaction_lines`, `account_balances`, débit/crédit strict).
- **Sources** : `AUDIT_PHASE_01.md` §3.3, §9 (implicite), §11 point 14 ; liste exhaustive des 59 feuilles du dictionnaire (vérifiée directement) : **aucune feuille `journals`, `transaction_lines`, ni `account_balances` n'existe**, alors que `accounts` (avec `balance NUMERIC(15,2) DEFAULT 0`, `CHECK(balance >= 0)`) et `transactions` (avec `account_id`, `amount`, `type`) sont chacune intégralement spécifiées avec contraintes métier riches (unicité anti-duplication bancaire, FK vers `loans`/`meetings`/`fiscal_years`).
- **Conflit** : UC-X4 (Use Case) décrit un principe de partie double stricte, mais aucune des 59 tables canoniques du dictionnaire ne le supporte.
- **Analyse** : le dictionnaire — désigné comme source canonique pour cette mission, et dont la complétude a été vérifiée sur l'intégralité de son sommaire (59 feuilles) — ne contient aucune trace de `journals`/`transaction_lines`/`account_balances`, alors qu'il documente en détail des concepts voisins (`fiscal_years` avec `opening_balance`/`closing_balance`/`total_income`/`total_expenses`, ce qui suffit à produire des états comptables agrégés sans partie double ligne à ligne). Le modèle (A), simplifié, est donc celui qui est réellement outillé par le schéma de données canonique ; le modèle (B) de UC-X4 reste une description fonctionnelle sans contrepartie de schéma. Ceci correspond au principe du frontend actuel (`Account.balance` modifiable, cf. commentaire déjà présent dans le code selon `AUDIT_PHASE_01.md` §11 point 14).
- **Décision proposée** : le modèle simplifié (A) — `Account.balance` comme champ maintenu directement, `Transaction` comme journal unique — est le modèle canonique pour la version actuelle du produit. La partie double stricte (B) décrite par UC-X4 est une **cible fonctionnelle non modélisée**, à traiter comme extension future si le besoin métier (audit externe, commissaire aux comptes cité en UC50) l'exige, mais elle nécessiterait une nouvelle spécification de schéma qui n'existe pas aujourd'hui.
- **Impact frontend** : aucun changement — le modèle actuel (`Account`/`Transaction`/`MemberAccount`) reste la cible.
- **Impact backend** : ne pas construire `journals`/`transaction_lines`/`account_balances` sans nouvelle spécification métier explicite ; le calcul du solde doit continuer de reposer sur la mise à jour de `accounts.balance` déclenchée par les écritures de `transactions`, avec `fiscal_years` pour la clôture d'exercice agrégée.
- **Statut** : **CANONIQUE**.

### 18a. `Meeting.status` (C-02)

- **Problème** : frontend `PLANNED, DONE, CANCELLED, POSTPONED` vs DC_Réunions `CHECK(planned, ongoing, completed, cancelled)`, gravité « Élevé » selon l'audit.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-02 ; feuille `meetings` : `ck_meetings_status` n'existe pas nommément dans les contraintes listées, mais le champ `status` a pour description « État (PLANNED, DONE, CANCELLED, POSTPONED) » — correspondance exacte avec le frontend, ni `ongoing` ni `completed`.
- **Conflit** : dictionnaire vs diagramme de classes.
- **Analyse** : même schéma que les sujets 1 et 5 — le dictionnaire canonique confirme les valeurs frontend.
- **Décision proposée** : adopter `PLANNED, DONE, CANCELLED, POSTPONED` comme énumération canonique de `Meeting.status`.
- **Impact frontend** : aucun.
- **Impact backend** : implémenter le `CHECK` correspondant, absent de la liste des contraintes de la feuille malgré la description textuelle — à formaliser.
- **Statut** : **CANONIQUE**.

### 18b. `Attendance.status` (C-03)

- **Problème** : frontend `PRESENT, ABSENT, LATE, EXCUSED` (4, avec EXCUSED) vs DC_Réunions `CHECK(present, absent, late)` (3, sans EXCUSED).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-03 ; feuille `attendances` : `ck_attendances_status = CHECK(status IN ('PRESENT','ABSENT','LATE','EXCUSED'))` — correspondance exacte avec le frontend, `EXCUSED` inclus.
- **Conflit** : dictionnaire vs diagramme de classes.
- **Analyse** : identique aux cas précédents ; le `CHECK` canonique est explicite et confirme le frontend.
- **Décision proposée** : adopter `PRESENT, ABSENT, LATE, EXCUSED` comme énumération canonique.
- **Impact frontend** : aucun.
- **Impact backend** : implémenter le `CHECK` tel que documenté dans le dictionnaire.
- **Statut** : **CANONIQUE**.

### 18c. `Tontine.status` (C-04)

- **Problème** : frontend `ACTIVE, PAUSED, CLOSED` vs DC_Tontines `ENUM(draft, active, completed, cancelled)`.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-04 ; feuille `tontines` : `ck_tontines_status = CHECK(status IN ('ACTIVE','PAUSED','CLOSED'))` — correspondance exacte avec le frontend.
- **Conflit** : dictionnaire vs diagramme de classes.
- **Analyse** : identique aux cas précédents.
- **Décision proposée** : adopter `ACTIVE, PAUSED, CLOSED` comme énumération canonique de `Tontine.status`.
- **Impact frontend** : aucun.
- **Impact backend** : implémenter le `CHECK` avec ces 3 valeurs.
- **Statut** : **CANONIQUE**.

### 18d. `CycleMember.status` (C-06)

- **Problème** : frontend `ACTIVE, INACTIVE, EXITED, SUSPENDED` vs DC_Tontines `ENUM(active, withdrawn, excluded)`.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-06 ; feuille `cycle_members` : `ck_cycle_members_status_valid = CHECK(status IN ('ACTIVE','INACTIVE','EXITED','SUSPENDED'))` — correspondance exacte avec le frontend.
- **Conflit** : dictionnaire vs diagramme de classes.
- **Analyse** : identique aux cas précédents.
- **Décision proposée** : adopter `ACTIVE, INACTIVE, EXITED, SUSPENDED` comme énumération canonique de `CycleMember.status`.
- **Impact frontend** : aucun.
- **Impact backend** : implémenter le `CHECK` avec ces 4 valeurs.
- **Statut** : **CANONIQUE**.

### 18e. `Repayment.method` (C-08bis)

- **Problème** : frontend réutilise `PaymentMethod = CASH, MOBILE_MONEY, BANK, CARD` vs DC_Crédit `CHECK(cash, bank, mobile_money)` (sans `CARD`).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-08bis ; feuille `repayments` : `ck_repayments_method_valid = CHECK(method IN ('CASH','MOBILE_MONEY','BANK','CARD'))` — correspondance exacte avec le frontend, `CARD` inclus. Le même `CHECK` à 4 valeurs (avec `CARD`) est aussi confirmé sur `transactions.payment_method` et `tontine_contributions.payment_method`, renforçant la cohérence transversale.
- **Conflit** : dictionnaire vs diagramme de classes.
- **Analyse** : `CARD` est confirmé canonique sur 3 tables indépendantes du dictionnaire (`repayments`, `transactions`, `tontine_contributions`) ; le diagramme de classes qui l'omet est l'exception isolée.
- **Décision proposée** : adopter `CASH, MOBILE_MONEY, BANK, CARD` comme énumération canonique unique de méthode de paiement, réutilisable sur tous les domaines financiers.
- **Impact frontend** : aucun — le type `PaymentMethod` partagé est déjà correct.
- **Impact backend** : implémenter un `CHECK` cohérent à 4 valeurs sur `repayments.method`, `transactions.payment_method` et `tontine_contributions.payment_method`.
- **Statut** : **CANONIQUE**.

### 18f. `tenants.organization_type` (C-10)

- **Problème** : `AUDIT_PHASE_01.md` (C-10) signalait que 6 diagrammes de classes indépendants montrent tous `CHECK(association, tontine, cooperative, church, company, community, other)`, alors que les documents de décision affirment ces valeurs « non spécifiées » dans le dictionnaire.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-10 ; feuille `tenants` : le champ `organization_type` a pour type de contrainte la valeur littérale « ENUM » dans la colonne Contraintes, mais **aucun `CHECK` correspondant n'apparaît** dans la section « CONTRAINTES MÉTIER » de la feuille (seuls `ck_tenants_status` et `ck_tenants_config` y figurent) — confirmant que le dictionnaire est bien silencieux sur les valeurs exactes, comme l'affirmaient les documents de décision.
- **Conflit** : silence du dictionnaire (pas une contradiction) vs 6 occurrences indépendantes et mutuellement cohérentes dans les diagrammes de classes.
- **Analyse** : à la différence des sujets précédents, ici le dictionnaire ne contredit pas les diagrammes — il est simplement incomplet sur ce point précis. Les 6 diagrammes de classes montrant la même liste à 7 valeurs constituent une convergence forte et non contredite ; il n'y a pas de conflit de valeurs, seulement une case vide dans le dictionnaire à combler. Le risque d'adopter cette liste est faible (silence, pas contradiction).
- **Décision proposée** : adopter `association, tontine, cooperative, church, company, community, other` comme énumération canonique de `organization_type`, en l'absence de toute source contredisant cette liste, et documenter formellement le `CHECK` manquant dans le dictionnaire.
- **Impact frontend** : si un écran de gestion des tenants (Platform Core) est construit, utiliser cette liste à 7 valeurs pour le champ `organization_type`.
- **Impact backend** : ajouter `ck_tenants_organization_type = CHECK(organization_type IN (...))` avec ces 7 valeurs dans le schéma physique et dans le dictionnaire.
- **Statut** : **CANONIQUE** (résolution par convergence documentaire, pas par arbitrage métier).

### 18i. `tontine_cycles` / `cycle_members` — doublon (D-01)

- **Problème** : `AUDIT_PHASE_01.md` (D-01) documentait une tension entre le diagramme de classes (montrant `TontineCycle` comme entité propre et distincte) et le dictionnaire Excel source, où la fiche `tontine_cycles` (ST-022) était historiquement un doublon mot-pour-mot de `cycle_members` (ST-021) référençant une table `cycles` inexistante.
- **Sources** : `AUDIT_PHASE_01.md` §10 D-01 ; vérification directe de la feuille `tontine_cycles` actuelle du dictionnaire : elle contient une note explicite en tête de fiche — *« Structure corrigée : la fiche précédente dupliquait intégralement cycle_members (ST-021) et référençait une table cycles inexistante. Voir docs/TANZEN_TONTINE_CYCLE_DECISION.md pour la traçabilité de cette correction »* — suivie d'un schéma propre (`tontine_id`, `start_date`, `end_date`, `status`, `version`) distinct de `cycle_members` (`cycle_id`, `member_id`, `initial_rank`, `join_date`, `status`).
- **Conflit** : résolu — la feuille elle-même atteste de la correction.
- **Analyse** : ceci confirme directement, à la source, l'hypothèse la plus favorable envisagée par `AUDIT_PHASE_01.md` : le diagramme de classes représentait déjà un état cible/corrigé, et le dictionnaire Excel actuellement disponible porte lui aussi la correction (contrairement à ce que l'audit supposait être encore le cas pour le fichier Excel brut). `tontine_cycles` et `cycle_members` sont deux tables propres et non redondantes.
- **Décision proposée** : `tontine_cycles` (avec ses champs `cycle_code` optionnel non présent — voir note ci-dessous — `start_date`, `end_date`, `status`) est la table canonique de cycle de tontine, distincte de `cycle_members` (affectation membre↔cycle). **Ne pas réintroduire ni faire référence à une ancienne entité `cycles` concurrente.**
- **Impact frontend** : aligner le type `Cycle`/`TontineCycle` du frontend sur ce schéma à deux tables distinctes ; retirer le statut `PROVISIONAL` du commentaire de code si celui-ci ne visait que ce doublon (à confirmer lors d'une revue de code dédiée — hors périmètre documentaire de cette mission).
- **Impact backend** : le schéma physique doit suivre `tontine_cycles`/`cycle_members` tels que документés ; la contrainte `fk_tontine_cycles_tontine` comble explicitement l'anomalie historique « tontines sans FK entrante » notée dans la fiche.
- **Statut** : **CANONIQUE** (la structure des deux tables est tranchée ; la valeur exacte de l'énumération `status` de `tontine_cycles` reste ouverte — voir sujet 2, fichier À VALIDER).

---

## Sujets NON BLOQUANT

### 4. `MemberAccount.role`

- **Problème** : `AUDIT_PHASE_01.md` (C-09bis) signalait un conflit « ensembles disjoints, BLOQUANT » entre le frontend (`OWNER, CO_OWNER, GUARANTOR, CONTRIBUTOR`) et DC_Caisses_et_Cotisations (`CHECK(member, leader, treasurer, admin)`).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-09bis ; feuille `members_accounts` (nommée en interne `member_accounts`) : `role VARCHAR(30) NULL`, description métier « Fonction occupée par le membre dans le compte (owner, co-owner, guarantor, contributor…) » — correspond aux 4 valeurs frontend (à la casse près) — mais **aucun `CHECK` n'est défini** sur ce champ dans la section contraintes de la feuille (seules des contraintes d'unicité `UNIQUE(...)` y figurent, dont une portant spécifiquement sur `role = 'OWNER'`, ce qui présuppose bien cette valeur en majuscule).
- **Conflit** : partiellement résolu — le dictionnaire penche vers le frontend par la description et par une contrainte d'unicité qui présuppose littéralement `'OWNER'`, mais aucun `CHECK` formel ne ferme la liste.
- **Analyse** : contrairement aux sujets 1/5/18a-e, ici le dictionnaire ne fournit pas de `CHECK` fermé — seulement une description informelle et un indice fort (`uq_member_accounts_role_owner ... WHERE role = 'OWNER'`, qui ne serait pas écrit ainsi si les valeurs n'étaient pas censées être en majuscules comme le frontend). Le risque d'adopter les valeurs frontend est faible, mais la contrainte n'étant pas formellement fermée dans le dictionnaire, ce sujet est moins définitivement tranché que les cas avec `CHECK` explicite — d'où un statut NON BLOQUANT plutôt que CANONIQUE : le travail frontend peut continuer sans blocage, mais un `CHECK` formel devrait être ajouté au dictionnaire pour fermer complètement le sujet.
- **Décision proposée** : adopter `OWNER, CO_OWNER, GUARANTOR, CONTRIBUTOR` comme énumération de travail pour `MemberAccount.role`, et faire ajouter le `CHECK` manquant côté dictionnaire lors d'une prochaine itération (pas bloquant pour le développement en cours).
- **Impact frontend** : aucun changement nécessaire dans l'immédiat.
- **Impact backend** : ajouter `ck_member_accounts_role = CHECK(role IN ('OWNER','CO_OWNER','GUARANTOR','CONTRIBUTOR'))` au schéma physique et au dictionnaire.
- **Statut** : **NON BLOQUANT**.

### 14. `BoardMember` / `Mandate`

- **Problème** : `AUDIT_PHASE_01.md` (D-02) signalait une annotation manuscrite « Fusionnés » entourant `BoardMember` et `Mandate` sur DC_Membres_et_Bureau-Exécutif et Architecture_globale, sans que la fusion soit exécutée dans les diagrammes eux-mêmes (qui montrent toujours deux tables distinctes reliées par FK) — classé « À VALIDER, l'intention de fusion n'est pas exécutée ».
- **Sources** : `AUDIT_PHASE_01.md` §10 D-02 ; vérification directe de la feuille `board_mandates` du dictionnaire : une seule table fusionnée existe (« Gestion des mandats des membres du bureau », combinant identité du membre de bureau et période de mandat), avec `board_id → boards.id`, `board_member_id → members.id`, `role VARCHAR(100)` (fonction occupée), `start_date`/`end_date`, `is_active`. **Aucune feuille `boards` séparée n'existe** dans les 59 tables du dictionnaire — `board_id` référence une table non définie.
- **Conflit** : résolu sur le principe de fusion (le dictionnaire l'a exécutée), mais un nouveau gap apparaît : `boards.id` est une FK vers une table absente.
- **Analyse** : contrairement à ce que l'audit anticipait (fusion suggérée mais non exécutée), le dictionnaire canonique **a bien exécuté** la fusion `BoardMember`+`Mandate` → `board_mandates`. Le diagramme de classes (toujours à deux tables séparées) est donc, ici encore, en retard sur le dictionnaire. Le gap résiduel — l'absence de toute définition de `boards` — est mineur : un « bureau » pourrait être implicitement unique par tenant, ou nécessiter sa propre fiche non encore rédigée ; ce point n'empêche pas de construire l'écran Gouvernance sur la base de `board_mandates` seul dans un premier temps (avec `tenant_id` en clé de portée à la place de `board_id` si `boards` n'est pas prioritaire).
- **Décision proposée** : adopter `board_mandates` (fusionné) comme table canonique de gouvernance du bureau exécutif. Documenter `boards` comme gap technique mineur à combler avant la mise en production de l'écran Gouvernance (Bureau Exécutif), sans bloquer sa conception.
- **Impact frontend** : le domaine Gouvernance (Bureau Exécutif, absent aujourd'hui) devrait modéliser une seule entité `BoardMandate` (fusionnée), pas deux (`BoardMember` + `Mandate` séparés).
- **Impact backend** : soit créer une table `boards` minimale (un enregistrement par tenant suffirait probablement), soit retirer `board_id` de `board_mandates` si un seul bureau par tenant est la règle métier — décision technique légère, non bloquante.
- **Statut** : **NON BLOQUANT**.

### 17. Workflow vs Governance approval (`WorkflowModule.GOVERNANCE`)

- **Problème** : `AUDIT_PHASE_01.md` (C-17) signalait que le type frontend `WorkflowModule` inclut la valeur `"GOVERNANCE"`, alors que le domaine Gouvernance est entièrement absent du frontend et qu'aucune séquence ni Use Case ne montre de lien direct Workflow ↔ Vote/Assemblée — qualifiée de « valeur d'enum orpheline, sans entité destinataire construite ».
- **Sources** : `AUDIT_PHASE_01.md` §9 C-17 ; feuille `workflows` du dictionnaire : `ck_workflows_module = CHECK(module IN ('IDENTITY','GOVERNANCE','TONTINE','ACCOUNTING','CREDIT','RISK','DOCUMENT','COMMUNICATION'))` — `GOVERNANCE` y figure explicitement, aux côtés de 7 autres modules, comme valeur canonique et légitime.
- **Conflit** : résolu — la valeur n'est pas orpheline au niveau du schéma, elle est simplement non consommée par un frontend qui n'a pas encore construit le domaine Gouvernance.
- **Analyse** : le dictionnaire canonique confirme que `GOVERNANCE` est un module de workflow prévu au même titre que `CREDIT` ou `TONTINE` — le design du moteur de workflow est délibérément générique (`entity_type` texte libre, ex. « Loan, Expense, Tontine, Meeting, Document ») pour couvrir tout futur domaine métier, dont la Gouvernance. Le vrai gap n'est donc pas une valeur d'enum orpheline mais l'absence du domaine Gouvernance lui-même côté frontend (déjà documentée séparément dans `AUDIT_PHASE_01.md` §8), ce qui correspond à la gravité « Moyen » déjà attribuée par l'audit plutôt qu'à un blocage.
- **Décision proposée** : conserver `WorkflowModule.GOVERNANCE` dans l'énumération frontend, tel quel — elle est canonique. Elle restera simplement non exercée tant que le domaine Gouvernance (Assemblées/Votes/Bureau) n'est pas construit.
- **Impact frontend** : aucun changement nécessaire sur l'énumération ; le lien concret Workflow↔Vote/Assemblée ne pourra être exercé qu'une fois le domaine Gouvernance construit (cf. `AUDIT_PHASE_01.md` §12 points 5-6).
- **Impact backend** : aucun changement — le `CHECK` du dictionnaire est déjà complet et couvre ce cas.
- **Statut** : **NON BLOQUANT**.

### 18g. WhatsApp (C-15)

- **Problème** : WhatsApp est documenté fonctionnellement (4 SF selon l'audit) et cité explicitement dans le libellé du bloc Notifications d'Architecture_globale (« SMS/EMAIL/WHATSAPP »), mais absent des `CHECK` `channel` de tous les diagrammes de classes concernés et de `notification_preferences`.
- **Sources** : `AUDIT_PHASE_01.md` §9 C-15 ; feuille `tenants` du dictionnaire confirme un champ `whatsapp_number VARCHAR(50)` — mais à titre de coordonnée de contact (« WhatsApp — Contact rapide »), pas comme canal de notification structuré dans une table `notifications`/`notification_preferences` dédiée.
- **Conflit** : confirmé, non bloquant — cohérent avec le constat déjà fait par l'audit.
- **Analyse** : la présence de `whatsapp_number` sur `tenants` montre que WhatsApp est envisagé comme canal de contact, mais aucune table de notification structurée ne le porte comme `channel` formel. Le frontend (`NotificationChannel`) exclut correctement WhatsApp, ce qui reste cohérent avec l'absence de tout support structuré dans le dictionnaire.
- **Décision proposée** : ne pas ajouter WhatsApp aux canaux de notification frontend tant qu'aucune spécification de fournisseur/table structurée n'existe ; le champ `whatsapp_number` peut néanmoins être exposé comme coordonnée de contact sur les écrans Tenant/Organisation si ce domaine est construit.
- **Impact frontend** : aucun changement nécessaire.
- **Impact backend** : si WhatsApp devient un canal de notification futur, il faudra étendre `notification_preferences`/`notifications`/`notification_templates` avec un `channel` supplémentaire et choisir un fournisseur — hors périmètre actuel.
- **Statut** : **NON BLOQUANT** (déjà hors périmètre V1 assumé).

### 18h. Collision de nom « Administration & Exploitation » (C-16)

- **Problème** : une seule table (`backups`) est commune entre le domaine technique « Administration & Exploitation » (9 tables : Platform Core) et le volume fonctionnel homonyme (208 SF, 20 sous-modules, incluant probablement des écrans de paramétrage tenant). Confirmé par UC-03/UC-110 (Infrastructure Package/Core) qui listent des tables presque entièrement différentes de celles d'Administration (UC-01/UC-10).
- **Sources** : `AUDIT_PHASE_01.md` §9 C-16, citant `TANZEN_CROSS_CUTTING_DECISIONS.md` §6.
- **Conflit** : collision de nommage entre deux domaines fonctionnels distincts partageant un même libellé français, sans chevauchement réel de données (hormis `backups`).
- **Analyse** : ce point est déjà documenté en détail par le document de décision cité (non ré-audité directement dans cette phase, cf. caveat de méthodologie), et sa nature est purement une question de nommage/étiquetage de domaines dans la navigation et la documentation — sans impact sur le modèle de données lui-même.
- **Décision proposée** : renommer l'un des deux domaines dans la documentation/navigation pour lever l'ambiguïté (ex. « Administration Tenant » pour le domaine fonctionnel vs « Exploitation Technique »/« Infrastructure » pour le domaine technique des 9 tables), sans changement de schéma.
- **Impact frontend** : si des entrées de navigation nommées « Administration » sont ajoutées pour les deux domaines, les distinguer clairement dans les libellés (déjà partiellement le cas : `/administration/*` existe pour Identity aujourd'hui).
- **Impact backend** : aucun changement de schéma requis, seulement une clarification documentaire.
- **Statut** : **NON BLOQUANT**.

### 18j. Nommage `members_accounts` / `member_accounts` (D-04)

- **Problème** : titre interne de fiche incohérent avec le nom de la feuille (`members_accounts` au pluriel comme nom d'onglet, « Table member_accounts » au singulier dans le titre de la fiche).
- **Sources** : `AUDIT_PHASE_01.md` §10 D-04, citant `TANZEN_DECISION_03_DICTIONARY.md` ; confirmé directement lors de l'extraction (feuille nommée `members_accounts`, titre interne « Table member_accounts »).
- **Conflit** : purement cosmétique.
- **Analyse** : aucune ambiguïté de structure de données, seulement un nom d'onglet Excel incohérent avec le nom conventionnel de table (`member_accounts`, singulier, cohérent avec les FK `member_accounts.id` utilisées ailleurs — bien qu'aucune autre feuille ne référence directement cette table par FK dans l'échantillon vérifié).
- **Décision proposée** : retenir `member_accounts` (singulier) comme nom de table canonique pour toute référence technique (API, migrations), et corriger le nom de l'onglet Excel lors d'une prochaine mise à jour du dictionnaire.
- **Impact frontend** : aucun.
- **Impact backend** : nommer la table physique `member_accounts` (singulier).
- **Statut** : **NON BLOQUANT**.

### 18k. Nommage `member_votes` / `members_votes` (D-05)

- **Problème** : même type d'incohérence cosmétique que D-04, sur la table de votes membres.
- **Sources** : `AUDIT_PHASE_01.md` §10 D-05, citant `TANZEN_DECISION_03_DICTIONARY.md` (non ré-vérifié directement dans cette phase — feuille `member_votes` présente dans la liste des 59 onglets, non extraite en détail).
- **Conflit** : purement cosmétique.
- **Analyse** : cohérent avec le schéma récurrent D-04.
- **Décision proposée** : retenir `member_votes` (singulier) comme nom de table canonique.
- **Impact frontend** : aucun.
- **Impact backend** : nommer la table physique `member_votes` (singulier).
- **Statut** : **NON BLOQUANT**.

### 18l. Contenu croisé `workflow_actions` / `workflow_delegations` (D-06)

- **Problème** : la fiche `workflow_actions` documenterait des événements de délégation, qui relèveraient plutôt de `workflow_delegations`.
- **Sources** : `AUDIT_PHASE_01.md` §10 D-06, citant `TANZEN_DECISION_03_DICTIONARY.md` (non ré-vérifié directement dans cette phase — feuilles `workflow_actions` et `workflow_delegations` présentes dans la liste des 59 onglets, non extraites en détail ; le Workflow Core est déjà documenté comme « cohérent avec la spec technique déjà exhaustivement documentée » par `AUDIT_PHASE_01.md` §5 UC-100).
- **Conflit** : chevauchement de contenu entre deux fiches voisines du même sous-domaine.
- **Analyse** : point déjà tracé par le document de décision cité ; sans ré-extraction directe, cette phase ne peut qu'acter le constat existant sans l'approfondir. Le Workflow Core frontend est par ailleurs déjà construit en mode inbox/lecture (cf. `AUDIT_PHASE_01.md` §7), ce qui limite l'impact pratique immédiat de ce chevauchement documentaire.
- **Décision proposée** : lors d'une prochaine mise à jour du dictionnaire, clarifier la frontière entre `workflow_actions` (actions d'approbation : approve/reject/return/cancel) et `workflow_delegations` (délégation de responsabilité de validation à un tiers).
- **Impact frontend** : aucun — le frontend actuel (inbox de `WorkflowRequest`) ne dépend pas de cette distinction fine.
- **Impact backend** : clarifier les deux fiches ; ne pas dupliquer les événements de délégation dans `workflow_actions`.
- **Statut** : **NON BLOQUANT**.

### 18m. `Vote_options` mal rendu en « VARCHAR(255) » (D-07)

- **Problème** : défaut de rendu du diagramme de classes Gouvernance, où le nom de la table `Vote_options` apparaît comme son premier champ affiché.
- **Sources** : `AUDIT_PHASE_01.md` §10 D-07 ; confirmé indépendamment par le recoupement avec Architecture_globale et UC-X5. Vérification directe : la feuille du dictionnaire existe sous le nom d'onglet `vote_options` (singulier de structure cohérent), avec un titre interne « Table votes_options » (au pluriel, même type d'incohérence cosmétique que D-04/D-05) et un schéma simple (`vote_id`, `label`).
- **Conflit** : défaut de rendu du fichier diagramme source, sans ambiguïté une fois recoupé avec les autres sources ; incohérence de nommage additionnelle constatée par cette phase (titre interne « votes_options » vs onglet `vote_options`), de même nature cosmétique que D-04/D-05.
- **Analyse** : aucun impact métier — juste un défaut graphique à signaler au producteur des diagrammes, plus une incohérence de nommage mineure supplémentaire du même type que celles déjà cataloguées.
- **Décision proposée** : retenir `vote_options` (singulier) comme nom de table canonique ; signaler le défaut de rendu du PNG au producteur des diagrammes pour correction lors d'une prochaine régénération.
- **Impact frontend** : aucun.
- **Impact backend** : nommer la table physique `vote_options` (singulier).
- **Statut** : **NON BLOQUANT**.

### 18n. `Meetings` sous deux groupements différents (D-08)

- **Problème** : UC-02/`nav-items.ts` classent Réunions sous « Organisation »/Member Core, tandis qu'Architecture_globale classe `MEETINGS`/`ATTENDANCES` sous « Governance Module ».
- **Sources** : `AUDIT_PHASE_01.md` §10 D-08 ; cohérent avec la feuille `attendances` du dictionnaire dont le titre interne porte explicitement la mention « Core Governance Module », alors que `meetings` ne porte aucune mention de module dans son titre.
- **Conflit** : double classification, pas un doublon de données — risque que deux équipes construisent des écrans concurrents si Member Core et Governance Core sont développés séparément.
- **Analyse** : le dictionnaire penche légèrement vers un rattachement Gouvernance pour `attendances` au moins (mention explicite dans le titre de fiche), mais ne tranche pas `meetings` elle-même. Comme le domaine Gouvernance est aujourd'hui entièrement absent du frontend (`AUDIT_PHASE_01.md` §8) alors que Meetings est déjà construit sous Member Core, il n'y a pas de risque immédiat de double construction — seulement un risque futur si Gouvernance est développée sans vérifier l'existant.
- **Décision proposée** : conserver `Meetings`/`Attendances` sous Member Core dans le frontend actuel (déjà construit et stable) ; lors de la conception du domaine Gouvernance (Assemblées/Votes), veiller explicitement à réutiliser `Meetings`/`Attendances` existants plutôt que d'en recréer une variante sous Governance.
- **Impact frontend** : aucun changement immédiat ; vigilance requise lors de la conception future du domaine Gouvernance pour éviter la duplication d'écran.
- **Impact backend** : aucun changement de schéma — `meetings`/`attendances` restent des tables uniques, quel que soit le regroupement de navigation choisi côté frontend.
- **Statut** : **NON BLOQUANT** — à surveiller lors de la construction du domaine Gouvernance.

---

## Synthèse

Sur les 21 sujets analysés dans ce document (11 des 17 sujets de la liste explicite, plus 10 éléments complémentaires issus des sections 9 et 10 de `AUDIT_PHASE_01.md`), la relecture directe de `dictionnaire_donnees.xlsx` — désigné comme source canonique pour cette mission — a permis de trancher la grande majorité des conflits d'énumération que l'audit de Phase 1 avait classés BLOQUANT en simple confrontation frontend/diagramme-de-classes : sur chaque champ vérifié (`Member.status`, `Meeting.status`, `Attendance.status`, `Tontine.status`, `CycleMember.status`, `Transaction.type`, `Repayment.method`), le dictionnaire canonique confirme systématiquement les valeurs déjà codées côté frontend, suggérant que les diagrammes de classes PNG sont des rendus graphiques en décalage avec le dictionnaire qui les a pourtant produits. La découverte la plus structurante de cette phase concerne l'autorisation : la table `users` canonique n'a **aucune colonne `role`**, ce qui tranche définitivement en faveur du RBAC dynamique déjà implémenté côté frontend et clôt un point que `AUDIT_PHASE_01.md` avait explicitement classé BLOQUANT faute de preuve directe. Restent hors de ce document, renvoyés au fichier `PHASE_02_DECISIONS_A_VALIDER.md`, les sujets où le dictionnaire canonique lui-même reste silencieux ou explicitement non tranché (`TontineCycle.status`, `Loan.status`) et les gaps structurels profonds où aucune des 59 tables canoniques ne couvre un besoin fonctionnel pourtant bien documenté par les séquences (`TontinePosition`/`PositionPayment`) ou où l'implémentation frontend reste à câbler de bout en bout (isolation multi-tenant).
