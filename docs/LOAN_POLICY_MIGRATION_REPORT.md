# TANZEN — Harmonisation transverse : `LoanPolicy` remplace `loan_rules`

**Statut : audit exhaustif effectué, aucune modification de code nécessaire ni effectuée.** Mission transverse (`tanzen-frontend`, `tanzen-mobile`, `tanzen-commercial`). Conformément au mandat, aucune modification de code n'a été entreprise avant la production de la matrice d'impact (§3) — et après production de cette matrice, le constat central rend toute étape de migration de code sans objet (§1).

---

## ⚠️ DÉCISION SUPERSÉDÉE — voir `docs/LOAN_RULES_NORMALIZATION_REPORT.md`

**La décision documentée ci-dessous (`LoanPolicy` comme nom canonique) a été explicitement inversée par une mission produit ultérieure.** Nouvelle décision validée : `loan_rules`/`LoanRule` est désormais l'unique terminologie active — `LoanPolicy` ne doit plus être utilisée comme nom d'entité dans le code actif. Voir `docs/LOAN_RULES_NORMALIZATION_REPORT.md` pour la décision actuelle, ses raisons, et la matrice d'impact à jour.

Ce document n'est **pas** supprimé — conformément à la règle « ne pas supprimer silencieusement l'information historique », déjà appliquée par ce document lui-même à `loan_rules`. Il reste un enregistrement fidèle de l'analyse produite à l'époque (le constat central — aucune référence applicative active dans aucun projet — reste d'ailleurs toujours vrai et a été reconfirmé par la mission de normalisation). Seule la **recommandation de nommage** qu'il contenait est désormais obsolète.

---

## 1. Décision `LoanPolicy`

**Décision produit validée (fournie par le mandat de cette mission, non rouverte ici)** : `LoanPolicy` est désormais le nom canonique unique du concept métier « politique de crédit appliquée à un compte » (« Core Credit Policy Engine »). Il n'existe qu'**une seule** entité métier — `LoanPolicy` et l'ancien nom `loan_rules` désignent la même chose, jamais deux entités distinctes.

**Constat central de cet audit, déterminant pour toute la suite** : **aucune référence applicative active** à `loan_rules`, `LoanRule`, `LoanPolicy`, ou toute variante, n'existe dans le code d'aucun des trois projets — ni type, ni interface, ni service, ni repository, ni composant, ni hook, ni mock, ni migration, ni test, ni route. Recherche exhaustive confirmée (§3, §11). **Le concept n'existe aujourd'hui que dans la documentation.** Il n'y a donc, à ce jour, rien à « migrer » au niveau du code — la décision `LoanPolicy` s'applique par construction dès qu'une implémentation sera un jour entreprise, sans qu'aucun renommage de code ne soit nécessaire entre-temps.

## 2. Ancienne nomenclature `loan_rules`

`loan_rules` est le nom de la **table physique** telle qu'elle apparaît dans le dictionnaire de données canonique (`docs/audit/excel_dictionary_dump.txt`, fiche #14, extraite directement de `dictionnaire_donnees.xlsx`). Ce n'est **pas** un nom inventé par erreur — c'est la source de vérité canonique du schéma physique, avec un schéma complet (30 colonnes, voir §6). **Ce document ne prétend à aucun moment que le dictionnaire aurait déjà utilisé `LoanPolicy`** — conformément au mandat §2, l'évolution de nomenclature est documentée explicitement ci-dessous, pas maquillée.

**Trois graphies distinctes du même concept ont été trouvées dans la documentation**, aucune n'étant une erreur au sens strict — chacune reflète le registre de la source qui l'emploie :
- `loan_rules` (minuscule, `snake_case`) — nom de table SQL, dictionnaire canonique (`docs/audit/excel_dictionary_dump.txt`) et citation verbatim d'un encart source (`docs/PHASE_04_USE_CASE_CLASSIFICATION.md`, « Tables concernées » de UC-60, une citation directe du diagramme UML original, pas un choix de l'analyste).
- `LoanPolicy` (singulier, `PascalCase`) — nom de classe/entité applicative, utilisé par `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (§1.1, §2.4), `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (classification propre de UC60-03), `docs/PHASE_07_DECISIONS_A_VALIDER.md`.
- `Loan_policies`/`LOAN_POLICIES`/`Loan_policy` (pluriel ou singulier, casse de diagramme de classes UML) — utilisé par `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (`DC_Crédit`) et `docs/AUDIT_PHASE_01.md` (diagramme + séquence `DSEQ_PRÊT_REMBOURSEMENT`).

## 3. Matrice d'impact par projet

| Projet | Fichier | Référence | Type | Impact | Action |
|---|---|---|---|---|---|
| `tanzen-frontend` | `docs/audit/excel_dictionary_dump.txt` (fiche #14) | `loan_rules` — table physique complète (30 colonnes) | DATABASE | Source canonique du schéma physique, nom historique | **CONSERVER intégralement** — ne jamais renommer le dictionnaire canonique lui-même dans le cadre de cette mission (condition d'arrêt explicite du mandat, §5 ci-dessous) |
| `tanzen-frontend` | `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` | `LoanPolicy` (§1.1 inventaire des entités ; §2.4 « Tenant 1──N LoanPolicy ») | DOCUMENTATION / RELATION | Nom applicatif déjà en usage ; relation incomplète (ne montre pas la FK réelle vers `Account`, voir §5) | **CONSERVER** (document historique de Phase 2, non modifié) — imprécision relationnelle documentée ci-dessous (§5), pas corrigée dans le document lui-même |
| `tanzen-frontend` | `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` | `LoanPolicy` (UC60-03, classification propre) **et** `loan_rules` (citation verbatim de l'encart « Tables concernées » de UC-60) | DOCUMENTATION | Les deux noms coexistent dans le même document, pour deux raisons distinctes — l'un est une citation fidèle de la source UML, l'autre le choix de classification de l'analyste | **CONSERVER** — ce n'est pas une contradiction interne au document, seulement deux registres de citation différents, déjà cohérents |
| `tanzen-frontend` | `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (`DC_Crédit`) | `LOAN_POLICIES`/`Loan_policies` (nom de classe UML) ; relations `ACCOUNTS→LOAN_POLICIES` (cardinalité `1..*`), `Loan_policies` classé **TENANT-SCOPED**, `tenant_id FK direct (UQ)` | DOCUMENTATION / RELATION | Confirme indépendamment la relation `Account → LoanPolicy` (voir §5) et le tenant scoping direct | **CONSERVER** — source de confirmation, pas de contradiction |
| `tanzen-frontend` | `docs/AUDIT_PHASE_01.md` | `Loan_policy` (singulier, diagramme) ; relation explicite `Tenant 1──N Account 1──N Loan_policy` ; séquence `DSEQ_PRÊT_REMBOURSEMENT` : « Member → Loan (validate eligibility via Loan_policies) → disburse funds → Account » | DOCUMENTATION / RELATION | Source la plus précise sur la relation réelle et l'usage fonctionnel (validation d'éligibilité au moment de l'octroi) | **CONSERVER** — confirme et précise §5 |
| `tanzen-frontend` | `docs/PHASE_07_FINANCE_CREDIT.md` | `Loan_policies` — ligne du tableau de couverture : « absent, non créé, non créé, — » | DOCUMENTATION | Confirme qu'aucune implémentation Credit réelle (déjà livrée : `LoansPage`, `RepaymentsDialog`, `LoanGuarantor`) n'a construit cette entité | **CONSERVER** — confirme le constat central (§1) depuis la phase d'implémentation elle-même |
| `tanzen-frontend` | `docs/PHASE_07_DECISIONS_A_VALIDER.md` (sujet BLOQUANT 3) | `LoanPolicy` mentionnée comme **option de résolution possible** (option b) d'une décision distincte et toujours ouverte : « d'où doit provenir le taux d'intérêt lors de l'auto-création du prêt au décaissement ? » | DOCUMENTATION / DECISION | **Décision produit indépendante, non résolue, explicitement hors périmètre de cette mission** (le mandat interdit de modifier les règles métier/calculs financiers) | **CONSERVER, référencer sans rouvrir** — voir §13 |
| `tanzen-frontend` | `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` | Contradiction déjà cataloguée **D3 / item #14** : « `loan_rules` (Excel) vs `LoanPolicy` (docs) — Mésappariement de nom... À CONSOLIDER (choisir un nom canonique unique avant toute implémentation) » | DOCUMENTATION / CONTRADICTION | **Cette mission résout exactement la contradiction déjà signalée par cet audit antérieur** | **CONSERVER le document** (historique, non modifié) — la résolution vit dans le présent rapport, qui le référence |
| `tanzen-frontend` | `docs/P0_TENANTS_FINAL_REPORT.md` | `loan_rules` cité dans une liste de P0 non entamés (« `users`, `roles`... `loan_rules`... non touchés ») | DOCUMENTATION | Simple mention de périmètre, sans rapport direct avec le nommage | **CONSERVER**, aucune action |
| `tanzen-frontend` | `src/mocks/finance/loans.ts`, `src/services/credit.service.ts` (et tout `src/`/`app/`/`tests/`) | **Aucune** référence à `loan_rules`/`LoanRule`/`LoanPolicy` | TYPE / MOCK / SERVICE / TEST | `Loan.interestRate` reste un champ **inline** sur chaque prêt (valeurs 10 à 15 %, distinctes par prêt dans les données mock) — aucune entité de politique séparée n'existe pour le sourcer | **AUCUNE ACTION — rien à renommer** |
| `tanzen-mobile` | (tout le projet : `src/`, `app/`, `tests/`, `docs/`) | **Aucune occurrence, aucune exception** | (toutes catégories) | Le domaine Credit/Finance n'est pas encore entamé côté Mobile (seul Governance — `board_mandates`/`meetings`/`positions`/`attendances` — est construit à ce jour) | **AUCUNE ACTION** |
| `tanzen-commercial` | `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_04_USE_CASE_CLASSIFICATION.md`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, `PHASE_07_FINANCE_CREDIT.md`, `PHASE_07_DECISIONS_A_VALIDER.md`, `AUDIT_PHASE_01.md` | Mêmes références que `tanzen-frontend` | DOCUMENTATION | **Copies identiques, confirmées par `diff` binaire** (duplication intentionnelle déjà actée dans ce projet, comme pour `rbac.mocks.ts`/`tenants.ts`) — pas une analyse indépendante | **CONSERVER**, aucune action distincte nécessaire |
| `tanzen-commercial` | `src/` (tout le projet) | **Aucune occurrence** | (toutes) | Aucun module Credit dans `tanzen-commercial` (Public/Platform uniquement — le mandat interdit explicitement de lui attribuer artificiellement un module Credit) | **AUCUNE ACTION** — confirmé conforme au mandat §8 |

## 4. Fichiers modifiés

**Aucun.** Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `locales/`, `database/`, `migrations/` n'a été créé, modifié ou supprimé dans aucun des trois projets — parce qu'aucun n'en contenait de référence à renommer. Aucun document historique (`PHASE_02/04/05/07`, `AUDIT_PHASE_01`, `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT`, `P0_TENANTS_FINAL_REPORT`) n'a été modifié — ce sont des livrables d'audit historiques, chacun déjà correctement daté et scopé ; les réécrire pour y faire apparaître rétroactivement `LoanPolicy` partout falsifierait l'enregistrement de ce qui a réellement été trouvé à chaque phase, ce que le mandat interdit explicitement (§2 : « ne pas supprimer silencieusement l'information historique »). Seul ce document (`docs/LOAN_POLICY_MIGRATION_REPORT.md`) est nouveau.

## 5. Relations impactées

**Relation réellement documentée : `Account 1──N LoanPolicy`, jamais `Loan → LoanPolicy` directement.**

Confirmée par trois sources indépendantes et concordantes :
1. Le dictionnaire canonique lui-même (`docs/audit/excel_dictionary_dump.txt`, fiche #14) : `loan_rules.account_id BIGINT NOT NULL FK → accounts.id`, avec `UNIQUE(tenant_id, account_id)` — au plus une politique active par compte et par tenant.
2. `docs/AUDIT_PHASE_01.md` : diagramme `DC_Crédit` — « Tenant 1──N Account 1──N Loan_policy » — et séquence `DSEQ_PRÊT_REMBOURSEMENT` — « Member → Loan (validate eligibility via Loan_policies) → disburse funds → Account » : la politique est consultée pour **valider l'éligibilité** au moment de l'octroi d'un prêt, pas référencée par une FK directe sur `Loan`.
3. `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` : `ACCOUNTS→LOAN_POLICIES` (cardinalité `1..*`), confirmé indépendamment.

**`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (§2.4) est imprécis sur ce point** — son diagramme place `Tenant 1──N LoanPolicy` sans montrer la relation réelle via `Account`, contrairement aux deux autres sources. Ceci n'est pas corrigé dans le document (historique, non modifié conformément à §4) mais signalé ici pour toute future implémentation.

**Conséquence directe pour toute future implémentation (conforme au mandat §9)** : ne jamais créer un champ `loan_rule_id`/`loan_policy_id` sur l'entité `Loan` — la relation canonique passe par `Account`, pas par `Loan`. Aucune FK de ce type n'existe dans le code aujourd'hui (confirmé §3), donc aucun renommage `loan_rule_id → loan_policy_id` n'était de toute façon nécessaire.

**Relations avec `members_accounts`/`contribution_rules`** (mandat §6) : aucune relation directe trouvée dans aucune source — `contribution_rules` reste un domaine Tontine/Finance distinct (cotisations périodiques), sans FK vers `loan_rules`/`LoanPolicy` dans le dictionnaire. Aucune relation inventée.

## 6. Base de données

Conformément au mandat §5 (« Option A vs Option B »), et en l'absence de toute base de données réelle (mock uniquement, `BACKEND_PENDING` général du projet) ou de migration SQLite Mobile existante pour cette entité :

**Option A retenue** : `LoanPolicy` est le nom **applicatif** (classe TypeScript, service, futur mock) ; la table physique canonique reste **`loan_rules`**, conformément au dictionnaire de données déjà verrouillé. Ce choix n'est pas arbitraire — c'est la seule option compatible avec les conditions d'arrêt du mandat (§20) : renommer la table physique dans le dictionnaire canonique constituerait une « modification structurelle du dictionnaire canonique », un cas d'arrêt explicite non déclenché ici parce qu'aucune modification de ce type n'a été entreprise.

Schéma physique canonique complet (rappel, non modifié — fiche #14) : `id, uuid, tenant_id (FK tenants.id), account_id (FK accounts.id), name, allow_loans, loan_mode (NONE/INTERNAL/EXTERNAL/BOTH), min_amount, max_amount, interest_rate, interest_type (FIXED/REDUCING/FLAT), interest_period (DAILY/WEEKLY/MONTHLY/YEARLY), duration_months, max_active_loans, max_loan_exposure, requires_guarantor, min_guarantors, max_guarantors, guarantee_type_required, guarantee_ratio, allow_self_guarantee, requires_approval, approval_level, status (ACTIVE/INACTIVE), sync_status, version, created_at, updated_at, deleted_at, created_by, updated_by`. Contraintes : `UNIQUE(uuid)`, `UNIQUE(tenant_id, account_id)`, `UNIQUE(tenant_id, name)`, `CHECK(allow_loans IN (TRUE,FALSE))`.

**Aucune migration SQL ou SQLite n'a été créée, modifiée ou supprimée** — aucune n'existait pour cette entité dans aucun des trois projets.

## 7. `tanzen-frontend`

Aucune modification. Domaine Credit déjà construit (`LoansPage`, `RepaymentsDialog`, `LoanGuarantor`, `credit.service.ts`) sans jamais référencer `loan_rules`/`LoanPolicy` — confirmé par grep exhaustif (§3). `Loan.interestRate` reste un champ inline, comme avant cette mission. Aucun risque de régression : rien n'a été touché dans le code applicatif.

## 8. `tanzen-mobile`

Aucune modification. Domaine Credit/Finance non entamé — seul Governance (Positions/Attendances/BoardMandates/Meetings) est construit à ce jour côté Mobile. Aucune migration SQLite, aucun schéma, aucun repository, aucun service, aucun Outbox/SyncEngine concerné par cette mission.

## 9. `tanzen-commercial`

Aucune modification. Confirmé conforme au mandat §8 : aucun module Credit n'a été créé artificiellement dans ce projet — il n'appartient pas à son périmètre (Public/SaaS + Platform Administration uniquement). Les 6 documents de référence partagés avec `tanzen-frontend` (copies identiques, confirmées par `diff`) n'ont pas été modifiés non plus.

## 10. Tests

**Aucun test ajouté ou modifié.** Le mandat §11 demandait, si une implémentation existait, des tests garantissant l'unicité du concept et l'absence de doublon `LoanRule`+`LoanPolicy` — mais comme confirmé §1/§3, **aucune des deux entités n'existe dans le code d'aucun projet**. Écrire un test affirmant « `LoanPolicy` existe comme concept unique » serait soit trivialement vide (rien à tester), soit nécessiterait d'inventer une classe/mock `LoanPolicy` uniquement pour la faire passer — ce que le mandat interdit explicitement (§14 : « ne pas inventer de champs », « ne pas créer une deuxième table LoanPolicy »). Un test de non-régression textuelle (« aucune string `loan_rules`/`LoanRule` dans `src/` ») a été envisagé mais écarté : sans aucune implémentation existante, un tel test protégerait un état qui n'a jamais été menacé, et risquerait de devenir un faux-positif gênant le jour où `LoanPolicy` sera légitimement implémenté (le nom `LoanPolicy` lui-même contient la sous-chaîne compatible avec des regex naïves). Recommandation : ce test aurait sa place **au moment de la véritable implémentation** de `LoanPolicy`, pas avant — à ajouter alors, pas maintenant.

Tests existants vérifiés sans impact (Loans, Accounts, Members, RBAC, Tenant isolation, migrations/repositories/services Mobile) — voir §16.

## 11. Références `loan_rules` restantes

Toutes classées, aucune omise :

| Occurrence | Fichier | Classification |
|---|---|---|
| Table physique complète (fiche #14) | `tanzen-frontend/docs/audit/excel_dictionary_dump.txt` | **SQL PHYSIQUE CONSERVÉ** — nom canonique du dictionnaire, jamais renommé par cette mission (voir §6) |
| Citation verbatim de l'encart UC-60 | `tanzen-frontend/docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (+ copie identique `tanzen-commercial`) | **DOCUMENT HISTORIQUE** — citation fidèle d'une source UML, pas un choix de nommage à corriger |
| Mention de périmètre P0 | `tanzen-frontend/docs/P0_TENANTS_FINAL_REPORT.md` | **DOCUMENT HISTORIQUE** |
| Contradiction déjà cataloguée (D3/#14) | `tanzen-frontend/docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` | **DOCUMENT HISTORIQUE**, désormais **résolu** par ce rapport (référencé, pas modifié) |

**Aucune RÉFÉRENCE ACTIVE À CORRIGER trouvée** — c'est-à-dire aucune occurrence dans du code applicatif actif, une configuration, une route, un test ou un mock actif dans aucun des trois projets.

## 12. Raisons des occurrences conservées

Chaque occurrence conservée l'est pour une raison précise et documentée (§11), jamais par omission : soit c'est la source de vérité canonique elle-même (le dictionnaire), soit c'est un enregistrement historique d'un audit déjà daté et scopé, dont la réécriture falsifierait ce qui a réellement été observé à l'époque. Aucune occurrence n'a été laissée « par erreur » — chacune a été explicitement analysée dans la matrice d'impact (§3).

## 13. Risques

- **Aucun risque de régression de code** — rien n'a été modifié dans `src/`/`app/`/`tests/`/`mocks/` d'aucun projet.
- **Risque de confusion documentaire résiduel, faible** : un lecteur consultant uniquement `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` isolément pourrait s'interroger sur la coexistence de `loan_rules` et `LoanPolicy` dans le même document — mitigé par ce rapport, qui devient la référence à consulter pour toute question de nommage sur ce sujet.
- **Le sujet BLOQUANT 3 de `docs/PHASE_07_DECISIONS_A_VALIDER.md` reste entièrement ouvert** (source du taux d'intérêt à l'auto-création du prêt au décaissement) — cette mission ne le résout pas et ne doit pas être interprétée comme l'ayant fait. `LoanPolicy` y reste une **option de résolution possible parmi d'autres** (options a/c toujours valables), pas une décision d'implémentation.
- **`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.4 reste imprécis** sur la relation `Account → LoanPolicy` (§5) — non corrigé (document historique), un risque mineur si une future implémentation se fie à ce seul diagramme sans consulter `AUDIT_PHASE_01.md`/`PHASE_05` ni ce rapport.

## 14. État final

`LoanPolicy` est désormais le nom canonique documenté et sans ambiguïté pour toute future implémentation, dans les trois projets. `loan_rules` reste le nom de la table physique dans le dictionnaire de données canonique — une distinction Concept/Persistance explicitement documentée (§6), pas une contradiction non résolue. **Aucun code n'a été créé, modifié ou supprimé** dans `tanzen-frontend`, `tanzen-mobile` ou `tanzen-commercial` — la mission se limite à consolider une décision de nommage déjà en tension dans la documentation (contradiction D3/#14 de `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md`), sans qu'aucune implémentation réelle n'existe encore pour la matérialiser. La prochaine mission qui construira `LoanPolicy` devra : (a) utiliser ce nom exclusivement, (b) respecter la relation `Account → LoanPolicy` (§5), (c) ne pas rouvrir le sujet BLOQUANT 3 de Phase 7 sans validation du Product Owner sur la source du taux d'intérêt.

---

**Aucune condition d'arrêt du mandat (§20) n'a été déclenchée** — pas de backend réel, pas d'API publique, pas de migration SQL destructive, pas de FK nécessitant une migration backend, dictionnaire canonique non modifié structurellement, relation `Loan ↔ LoanPolicy` déterminable (§5), un seul modèle fonctionnel cohérent trouvé (pas deux modèles différents), Mobile et Frontend sans divergence (aucun des deux ne construit l'entité), aucune rupture de synchronisation possible (rien à synchroniser).
