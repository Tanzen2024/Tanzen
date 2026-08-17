# TANZEN — Normalisation définitive : `loan_rules` uniquement

**Statut : audit exhaustif effectué, aucune modification de code nécessaire ni effectuée.** Mission transverse (`tanzen-frontend`, `tanzen-mobile`, `tanzen-commercial`), **inverse explicitement** la décision documentée par `docs/LOAN_POLICY_MIGRATION_REPORT.md` (désormais marqué SUPERSÉDÉ en tête de ce document, non supprimé). Conformément au mandat, l'audit exhaustif a précédé toute décision de modification — et son constat rend, comme pour la mission précédente, toute étape de renommage de code sans objet.

---

## 1. Décision de nomenclature

**Décision produit validée (fournie par le mandat de cette mission)** :

| | Ancienne décision (`LOAN_POLICY_MIGRATION_REPORT.md`, superségée) | Décision actuelle (ce document) |
|---|---|---|
| Entité métier | `LoanPolicy` | **`loan_rules`** |
| Type applicatif | `LoanPolicy` | **`LoanRule`** |
| Table physique | `loan_rules` (inchangé) | **`loan_rules`** (inchangé) |

Il ne doit exister qu'**une seule** entité — `loan_rules`. `LoanPolicy`/`loanPolicy`/`loan_policies`/`LoanPolicies`/`loan_policy_id` ne doivent plus être utilisés comme nom d'entité dans le code actif.

## 2. `LoanPolicy` supprimé comme concept actif

**`LoanPolicy` n'a jamais existé dans le code actif d'aucun des trois projets** — ni avant, ni après la mission précédente (qui ne l'y avait pas non plus introduit, faute d'implémentation existante à renommer). Il n'y a donc littéralement rien à « supprimer » du code : la suppression porte uniquement sur la **recommandation documentaire**, déjà neutralisée par le bandeau ajouté en tête de `docs/LOAN_POLICY_MIGRATION_REPORT.md` (§14).

## 3. `loan_rules` conservé

Confirmé inchangé — `loan_rules` reste le nom de la table physique canonique (`docs/audit/excel_dictionary_dump.txt`, fiche #14), comme il l'a toujours été dans les deux missions successives. Aucune des deux décisions de nommage successives n'a jamais remis en cause ce nom physique — seul le nom **applicatif** cible a changé (`LoanPolicy` → `LoanRule`).

## 4. `LoanRule` comme type applicatif

`LoanRule` (et `loanRule` pour les variables/propriétés) est désormais le nom à utiliser lors de toute future implémentation — types TypeScript, services, repositories, hooks, composants, tests, mocks. Comme pour `LoanPolicy` précédemment, **aucune implémentation n'existe aujourd'hui** (§7 ci-dessous) : cette convention s'applique par anticipation, à appliquer dès la première ligne de code qui construira cette entité, pas à un code existant à migrer.

## 5. Relation `Account → loan_rules`

**Inchangée et reconfirmée** — la mission précédente avait déjà établi, à partir de trois sources canoniques indépendantes et concordantes, que la relation réelle est `Account 1──N loan_rules`, jamais `Loan → loan_rules` directement :

- Dictionnaire canonique (`docs/audit/excel_dictionary_dump.txt`, fiche #14) : `loan_rules.account_id BIGINT NOT NULL FK → accounts.id`, avec `UNIQUE(tenant_id, account_id)` — au plus une règle active par compte et par tenant. Confirmé par relecture directe pour cette mission (aucun changement du dictionnaire depuis la mission précédente).
- `docs/AUDIT_PHASE_01.md` : « Tenant 1──N Account 1──N Loan_policy » (diagramme `DC_Crédit`) et séquence `DSEQ_PRÊT_REMBOURSEMENT` : « Member → Loan (validate eligibility via Loan_policies) → disburse funds → Account ».
- `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` : `ACCOUNTS→LOAN_POLICIES` (cardinalité `1..*`), `tenant_id FK direct (UQ)`.

Ces trois sources emploient encore la graphie `Loan_policy(ies)` (documents historiques, non réécrits — §12) mais décrivent, sans ambiguïté, exactement l'entité que ce document appelle désormais `loan_rules`. La relation elle-même — `Account`, jamais `Loan` — reste identique quel que soit le nom retenu pour l'entité.

## 6. Absence de `loan_policy_id`

Confirmé par recherche exhaustive (§3, méthode identique à la mission précédente) : **aucune FK `loan_policy_id` ni `loan_rule_id`** n'existe dans le code d'aucun des trois projets — parce qu'aucune implémentation de l'entité elle-même n'existe. Conformément au mandat (§6), aucune de ces deux FK ne doit être créée avant qu'une future implémentation ne le justifie explicitement par le modèle canonique (qui prévoit `account_id`, jamais de FK directe depuis `Loan`).

## 7. Fichiers impactés — matrice d'impact

Recherche exhaustive reconduite pour cette mission (`loan_rules`, `LoanRule`, `loanRule`, `LoanPolicy`, `loanPolicy`, `loan_policies`, `LoanPolicies`, `loan_policy_id`), dans `src/`, `app/`, `tests/`, `docs/`, `mocks/`, `migrations/`, `services/`, `repositories/`, `hooks/`, `types/`, `routes/`, `locales/` des trois projets :

| Projet | Fichier | Référence | Type | Action |
|---|---|---|---|---|
| `tanzen-frontend` | `docs/audit/excel_dictionary_dump.txt` (fiche #14) | `loan_rules` — table physique complète | DATABASE | **CONSERVER**, inchangé — nom déjà et toujours conforme à la nouvelle décision |
| `tanzen-frontend` | `docs/LOAN_POLICY_MIGRATION_REPORT.md` | `LoanPolicy` — ancienne recommandation | DOCUMENTATION | **CONSERVER, bandeau SUPERSÉDÉ ajouté** en tête (fait par cette mission, voir §12) — pas supprimé, la décision qu'il documentait est actée comme historique |
| `tanzen-frontend` | `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` | `LoanPolicy` (§1.1, §2.4) | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié — document de Phase 2, daté, reflète la terminologie en usage à ce moment-là |
| `tanzen-frontend` | `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` | `LoanPolicy` (UC60-03) + `loan_rules` (citation verbatim) | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié |
| `tanzen-frontend` | `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` | `LOAN_POLICIES`/`Loan_policies` | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié |
| `tanzen-frontend` | `docs/AUDIT_PHASE_01.md` | `Loan_policy` | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié |
| `tanzen-frontend` | `docs/PHASE_07_FINANCE_CREDIT.md` | `Loan_policies` — « absent, non créé » | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié — confirme toujours l'absence d'implémentation réelle |
| `tanzen-frontend` | `docs/PHASE_07_DECISIONS_A_VALIDER.md` (sujet BLOQUANT 3) | `LoanPolicy` — option de résolution d'une décision distincte, toujours ouverte | DOCUMENT HISTORIQUE / DÉCISION | **CONSERVER, référencer sans rouvrir** — inchangé depuis la mission précédente (§13) |
| `tanzen-frontend` | `docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` | Contradiction D3/#14 déjà cataloguée | DOCUMENT HISTORIQUE / CONTRADICTION | **CONSERVER**, non modifié — la contradiction qu'il signalait reste résolue (juste résolue différemment qu'avant, voir ce rapport) |
| `tanzen-frontend` | `docs/P0_TENANTS_FINAL_REPORT.md` | `loan_rules` — mention de périmètre | DOCUMENT HISTORIQUE | **CONSERVER**, non modifié |
| `tanzen-frontend` | `src/`, `app/`, `tests/`, `mocks/` (tout le projet) | **Aucune occurrence** | (toutes catégories) | **AUCUNE ACTION** |
| `tanzen-mobile` | (tout le projet) | **Aucune occurrence, aucune exception** | (toutes catégories) | **AUCUNE ACTION** — domaine Credit non entamé côté Mobile |
| `tanzen-commercial` | 6 documents de référence (copies identiques à `tanzen-frontend`) | Mêmes références, dupliquées à l'identique | DOCUMENTATION | **CONSERVER**, aucune action distincte |
| `tanzen-commercial` | `src/` (tout le projet) | **Aucune occurrence** | (toutes) | **AUCUNE ACTION** — pas de module Credit dans son périmètre |

## 8. `tanzen-frontend`

Aucune modification de code. `LoanPolicy` n'existant nulle part dans `src/`/`app/`/`tests/`/`mocks/` (confirmé §7, recherche identique à la mission précédente, aucun changement depuis), il n'y a rien à remplacer par `LoanRule`. Seule modification de ce projet : le bandeau SUPERSÉDÉ ajouté à `docs/LOAN_POLICY_MIGRATION_REPORT.md` (§12) et la création de ce document.

## 9. `tanzen-mobile`

Aucune modification. Confirmé par recherche exhaustive reconduite : toujours zéro occurrence de `loan_rules`/`LoanRule`/`LoanPolicy` sous toute forme, dans `src/types/`, `src/database/schema/`, `src/database/migrations/`, `src/repositories/`, `src/services/`, `src/hooks/`, `app/`, `tests/`, `mocks/`. Aucune migration SQLite, aucun schéma, aucun repository, aucun Outbox/SyncEngine concerné — le domaine Credit/Finance reste non entamé côté Mobile (seul Governance — Positions/Attendances/BoardMandates/Meetings — est construit à ce jour).

## 10. `tanzen-commercial`

Aucune modification. Confirmé conforme au mandat §9 : `LoanPolicy` n'existe pas dans ce projet, rien n'est donc introduit artificiellement à sa place. Les 6 documents de référence partagés avec `tanzen-frontend` restent des copies identiques (non re-vérifiées par `diff` pour cette mission — déjà confirmé identique par la mission précédente, aucune modification de ces fichiers depuis dans aucun des deux projets).

## 11. Tests

**Aucun test ajouté ou modifié.** Même raisonnement que pour la mission précédente (`docs/LOAN_POLICY_MIGRATION_REPORT.md` §10, toujours valable) : aucune entité `loan_rules`/`LoanPolicy`/`LoanRule` n'existe dans le code, donc aucun test de non-régression sur ce nommage n'aurait de sujet réel à protéger. Un test de ce type prendrait tout son sens **au moment de la véritable implémentation** de `LoanRule`, pas avant.

## 12. Occurrences historiques conservées

| Occurrence | Fichier | Classification |
|---|---|---|
| Table physique complète (fiche #14) | `tanzen-frontend/docs/audit/excel_dictionary_dump.txt` | **CANONIQUE, jamais historique** — c'est la source de vérité elle-même, toujours active |
| `LoanPolicy` — ancienne recommandation, désormais inversée | `tanzen-frontend/docs/LOAN_POLICY_MIGRATION_REPORT.md` | **DOCUMENT HISTORIQUE**, marqué explicitement SUPERSÉDÉ par un bandeau ajouté en tête (seule modification apportée par cette mission à un document préexistant) |
| `LoanPolicy`/`Loan_policy(ies)` dans les documents de Phase 2/4/5/7 et `AUDIT_PHASE_01` | `tanzen-frontend/docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_04_USE_CASE_CLASSIFICATION.md`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, `PHASE_07_FINANCE_CREDIT.md`, `AUDIT_PHASE_01.md` (+ copies identiques `tanzen-commercial`) | **DOCUMENTS HISTORIQUES**, non modifiés — chacun reflète fidèlement la terminologie en usage au moment de sa rédaction ; les réécrire rétroactivement en `LoanRule` falsifierait l'enregistrement historique, ce que le mandat interdit explicitement |
| Contradiction D3/#14 | `tanzen-frontend/docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` | **DOCUMENT HISTORIQUE**, non modifié — la contradiction qu'il signalait (« choisir un nom canonique unique ») reste résolue, seule la réponse finale a changé de valeur entre les deux missions |
| `LoanPolicy` — option de résolution du sujet BLOQUANT 3 | `tanzen-frontend/docs/PHASE_07_DECISIONS_A_VALIDER.md` | **DOCUMENT HISTORIQUE**, non modifié — cette décision distincte (source du taux d'intérêt à l'auto-création du prêt) reste ouverte et hors périmètre des deux missions de nommage ; si elle est un jour tranchée en faveur d'une entité de politique de crédit, elle devra désormais être nommée `loan_rules`/`LoanRule`, pas `LoanPolicy` |

**Aucune occurrence classée « CODE ACTIF À CORRIGER »** — recherche finale reconduite (§16 du mandat), résultat identique à la recherche initiale (§7) : zéro occurrence dans du code applicatif actif, une configuration, une route, un test ou un mock actif, dans aucun des trois projets.

## 13. Risques

- **Aucun risque de régression de code** — rien n'a été modifié dans `src/`/`app/`/`tests/`/`mocks/` d'aucun projet, pour la deuxième mission consécutive sur ce sujet.
- **Risque de « ping-pong » documentaire** si une troisième mission inversait à nouveau la décision — mitigé par la structure de superséssion explicite adoptée ici (bandeau daté et référencé, pas une suppression), qui permettrait de retracer l'historique complet des décisions successives sans perte d'information, quelle que soit la direction d'une éventuelle future inversion.
- **Sujet BLOQUANT 3 de `docs/PHASE_07_DECISIONS_A_VALIDER.md` toujours ouvert** — inchangé, non traité par cette mission ; si tranché en faveur d'une entité de politique de crédit, le nom `LoanRule` devra être utilisé (pas `LoanPolicy`), conformément à la décision actuelle.
- **`docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` §2.4 reste imprécis** sur la relation `Account → loan_rules` (déjà signalé par la mission précédente, non corrigé — document historique) — un risque mineur si une future implémentation se fie à ce seul diagramme sans consulter `AUDIT_PHASE_01.md`/`PHASE_05`/ce rapport.

## 14. État final

`loan_rules` (persistance) / `LoanRule` (application) sont désormais la terminologie canonique unique et sans ambiguïté pour toute future implémentation, dans les trois projets — `LoanPolicy` est explicitement écartée, sa recommandation antérieure marquée superségée sans être effacée. **Aucun code n'a été créé, modifié ou supprimé** dans `tanzen-frontend`, `tanzen-mobile` ou `tanzen-commercial`, pour la même raison que la mission précédente : aucune implémentation de cette entité n'existe encore nulle part. La prochaine mission qui construira cette entité devra utiliser exclusivement `loan_rules`/`LoanRule`, respecter la relation `Account → loan_rules` (§5), ne créer aucune FK `loan_policy_id`/`loan_rule_id` non justifiée par le modèle canonique (§6), et ne pas rouvrir le sujet BLOQUANT 3 de Phase 7 sans validation explicite du Product Owner.

---

**Aucune condition d'arrêt du mandat (§20) n'a été déclenchée** — `LoanPolicy` et `loan_rules` restent la même entité fonctionnelle (aucune preuve du contraire trouvée) ; aucune migration destructive, aucune API réelle, aucune FK réelle `loan_policy_id` ; dictionnaire canonique non contradictoire (juste plusieurs graphies documentaires du même concept, déjà analysées) ; relation `Account → loan_rules` toujours confirmée ; aucune modification backend requise.
