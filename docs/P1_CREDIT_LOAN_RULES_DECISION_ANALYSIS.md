# TANZEN — P1 Credit — `loan_rules` — Analyse décisionnelle (D-CREDIT-LR-01 / D-CREDIT-LR-02)

**Statut : analyse, strictement lecture seule.** Cette mission ne tranche aucune décision — chaque recommandation ci-dessous est une **proposition** destinée au Product Owner, jamais une décision validée. Aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `routes/`, `locales/`, `migrations/`, `database/`, configuration n'a été modifié dans aucun des trois projets. Nomenclature (`loan_rules`/`LoanRule`, `LoanPolicy` abandonné) non rouverte.

---

## 1. Mission

Approfondir les deux décisions encore ouvertes identifiées par `docs/P1_CREDIT_LOAN_RULES_AUDIT.md` — D-CREDIT-LR-01 (permissions RBAC) et D-CREDIT-LR-02 (répartition `status`/`deleted_at`) — jusqu'à un niveau permettant au Product Owner de trancher chacune sans ambiguïté : sources exactes, options réellement défendables, avantages/inconvénients, conséquences métier et techniques, dépendances, une recommandation unique par décision, et ce que chaque validation débloquerait.

## 2. État actuel

Reconfirmé par recherche exhaustive fraîche (`loan_rules`, `LoanRule`, `LoanPolicy`, `loanPolicy`, `loan_polic*`, insensible à la casse) dans `tanzen-frontend/src`, `tanzen-mobile/src`, `tanzen-commercial/src` : **0 occurrence dans les trois projets**, identique à l'audit précédent — aucune implémentation n'est apparue depuis. `loan_rules` reste à l'état de modèle canonique uniquement.

## 3. Sources analysées

`docs/P1_CREDIT_LOAN_RULES_AUDIT.md` (audit précédent, base de cette analyse), `docs/audit/excel_dictionary_dump.txt` (fiche canonique #14, relue directement), `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (UC60-03), `docs/PHASE_07_DECISIONS_A_VALIDER.md` (sujet BLOQUANT 3, relu intégralement, cité verbatim §17), `docs/LOAN_RULES_NORMALIZATION_REPORT.md`, `docs/LOAN_POLICY_MIGRATION_REPORT.md` (superségé), `src/mocks/rbac.mocks.ts` (catalogue complet relu directement, 78 permissions), `src/services/credit.service.ts`, `src/mocks/finance/accounts.ts`. `PHASE_02_MODELE_CANONIQUE_FINAL.md`, `PHASE_02_DECISIONS_CANONIQUES.md`, `PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, `PHASE_06_DECISIONS_A_VALIDER.md` : déjà couverts en détail par l'audit précédent, non re-cités ligne à ligne ici, référencés par leur conclusion.

## 4. Rappel du modèle canonique

Confirmé, non rouvert : fiche #14 complète (30 champs, 13 contraintes nommées) ; `tenant_id` direct ; `account_id → accounts.id` ; `UNIQUE(tenant_id, account_id)` (au plus une règle par compte) ; aucune relation directe `Loan → loan_rules` (3 sources concordantes, cf. audit précédent §7) ; aucun `loan_rule_id` à inventer ; `LoanPolicy` abandonné, `LoanRule`/`loan_rules` retenu.

---

## 5. D-CREDIT-LR-01 — Question

Quelles permissions RBAC doivent gouverner la gestion de l'entité `loan_rules` (Consulter/Lister/Créer/Modifier/Désactiver/Supprimer) ?

## 6. D-CREDIT-LR-01 — Sources

**Catalogue RBAC actuel** (`src/mocks/rbac.mocks.ts`, relu intégralement, 78 permissions) — aucune permission `loanRules.*`/`credit.*`/`creditPolicy.*` n'existe. Extrait pertinent par domaine :

| Domaine | Permissions | Pattern |
|---|---|---|
| `accounts` | `accounts.read`, `accounts.create` | Granulaire, incomplet (pas de `.update`, `.delete` — déjà `BLOQUANT` sujet 2, `PHASE_07_DECISIONS_A_VALIDER.md`) |
| `applications` | `applications.read`, `applications.create`, `applications.approve` | Granulaire par étape de workflow (plusieurs acteurs : créateur, approbateur) |
| `loans` | `loans.read`, `loans.create`, `loans.approve` | Idem — pas de `.update`/`.delete` |
| `repayments` | `repayments.read`, `repayments.create` | Granulaire |
| `guarantors` | `guarantors.read`, `guarantors.create` | Granulaire |
| `governance` | `governance.read`, `governance.create`, `governance.approve`, `governance.update`, `governance.delete` | Granulaire complet (5 verbes) — seul domaine du catalogue avec cycle de vie complet |
| `securityPolicies`, `modules`, `integrations` | `securityPolicies.manage`, `modules.manage`, `integrations.manage` | **Permission unique `.manage`** pour une ressource de configuration à acteur unique (Admin Tenant/Platform) |
| `mfa`, `notifications`, `cycles`, `draws`, `workflows` | `mfa.manage`, `notifications.manage`, `cycles.manage`, `draws.manage`, `workflows.manage` | Même pattern `.manage` — 5 domaines supplémentaires |

**Deux conventions coexistent réellement dans le catalogue actuel**, ni inventée ni supposée :
1. **Granulaire par verbe** (`accounts.*`, `loans.*`, `applications.*`, `repayments.*`, `guarantors.*`, `governance.*`) — utilisé pour des ressources à **plusieurs acteurs** intervenant à des étapes différentes d'un même workflow (ex. un Trésorier crée une demande, un Admin Tenant l'approuve).
2. **`.manage` unique** (`securityPolicies`, `modules`, `integrations`, `mfa`, `notifications`, `cycles`, `draws`, `workflows`) — utilisé pour des ressources de **configuration administrées par un seul type d'acteur** (Admin Tenant ou Platform), sans séparation d'étapes.

**UC60-03** : acteur unique et exclusif = **Admin Tenant** (aucun autre acteur n'apparaît dans la classification pour cette entité). Aucune décision RBAC précédente ne mentionne `loan_rules`/`LoanPolicy` (vérifié : `P0_RBAC_AUDIT.md`, `P0_RBAC_DECISION_ANALYSIS.md`, `P0_RBAC_REMAINING_AUDIT.md`, `P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md` — aucune mention, confirmé par relecture de leur table des matières et sections RBAC/permissions).

## 7. D-CREDIT-LR-01 — Options

| Option | Description | Cohérence avec le catalogue existant | Statut |
|---|---|---|---|
| **A — Granulaire dédiée** | `loanRules.read`, `loanRules.create`, `loanRules.update`, `loanRules.delete` | Cohérente avec le pattern `governance.*` (5 verbes, 1 seul domaine l'utilise) mais ce pattern sert des ressources **multi-acteurs** — `loan_rules` n'en a qu'un | **Défendable, mais pattern mal aligné sur l'usage réel (acteur unique)** |
| **A′ — `.manage` unique** | `loanRules.manage` (un seul flag couvrant Consulter/Créer/Modifier/Désactiver/Supprimer) | Cohérente avec **7 domaines existants** (`securityPolicies`, `modules`, `integrations`, `mfa`, `notifications`, `cycles`, `draws`, `workflows`) — tous à acteur unique, comme `loan_rules` (UC60-03 : Admin Tenant seul) | **Fortement supportée par le précédent architectural majoritaire** |
| **B — Réutiliser `loans.*`** | Gouverner `loan_rules` avec `loans.read`/`create`/`approve` | Non supportée — `loan_rules` n'est pas un `Loan` (aucune FK directe, cf. §4/audit précédent §7), les deux ont des cycles de vie distincts ; détournerait le sens de `loans.*` | **NON RECOMMANDÉE** |
| **C — Réutiliser `accounts.*`** | Gouverner `loan_rules` avec `accounts.read`/`create` | Non supportée — `loan_rules` est une ressource distincte d'`Account` bien que rattachée par FK ; confondrait la gestion du compte lui-même avec celle de sa politique de crédit | **NON RECOMMANDÉE** |
| **D — `Credit.*` générique (ombrelle)** | Une seule famille de permissions couvrant applications + loans + repayments + guarantors + loan_rules | Non supportée — le catalogue actuel maintient déjà ces quatre domaines **séparés** (`applications.*` ≠ `loans.*` ≠ `repayments.*` ≠ `guarantors.*`), fusionner `loan_rules` dans une ombrelle contredirait cette séparation déjà établie | **NON SUPPORTÉE PAR L'ARCHITECTURE EXISTANTE** |
| **E — Autre** | Aucune autre option n'est explicitement supportée par les sources consultées | — | Non retenue faute de support |

## 8. D-CREDIT-LR-01 — Impacts

| Option | Avantages | Inconvénients | Risque | Cohérence canonique |
|---|---|---|---|---|
| A (granulaire dédiée) | Extensible si un futur second acteur apparaît (ex. un rôle « Auditeur » en lecture seule) ; symétrique avec `loans.*`/`accounts.*` | 4 permissions pour une ressource à un seul acteur réel aujourd'hui — sur-dimensionné par rapport à l'usage démontré par UC60-03 | Faible | Partiellement cohérente (pattern existe, mais pas pour ce type de ressource) |
| **A′ (`.manage` unique)** | Aligné sur le pattern majoritaire (7 précédents) pour exactement ce type de ressource (config, acteur unique) ; une seule permission à assigner par rôle, plus simple à administrer | Moins granulaire si un jour un second acteur (ex. lecture seule pour un rôle Trésorier) devait consulter sans modifier — non anticipé par UC60-03 tel quel | Faible | **Forte — 7 précédents directs** |
| B (`loans.*`) | Aucune nouvelle permission à créer | Détourne une permission existante vers une ressource qu'elle ne représente pas ; un rôle avec `loans.create` (ex. Trésorier) obtiendrait implicitement le droit de modifier les politiques de crédit du tenant — risque d'élévation de portée non voulue | **Élevé** | Aucune |
| C (`accounts.*`) | Idem B | Idem B, avec le même risque (`accounts.create` déjà accordé à des rôles qui ne devraient pas nécessairement administrer les politiques de crédit) | **Élevé** | Aucune |
| D (`Credit.*` ombrelle) | Simplicité apparente | Contredit la séparation déjà en place entre applications/loans/repayments/guarantors ; un rôle avec un seul droit Credit obtiendrait tout le domaine | **Élevé**, régression architecturale | Aucune |

**Dépendances** : RBAC (catalogue `rbac.mocks.ts`) → UI (`RolePicker`/écrans à créer) → service (`loan-rule.service.ts`, futur) → tests. Aucune de ces couches n'existe aujourd'hui — la décision RBAC est la première pierre, rien ne peut être construit avant elle (cf. audit précédent §12/§24).

## 9. D-CREDIT-LR-01 — Recommandation proposée

**Recommandation proposée (non validée) : Option A′ — permission unique `loanRules.manage`.**

**Pourquoi** : UC60-03 ne démontre qu'un seul acteur (Admin Tenant) ; le catalogue actuel résout déjà ce cas de figure exact (ressource de configuration, acteur unique) par une permission `.manage` unique dans 7 domaines distincts (`securityPolicies`, `modules`, `integrations`, `mfa`, `notifications`, `cycles`, `draws`, `workflows`) — c'est le pattern le mieux établi et le plus directement transposable, pas une invention. **Sources** : catalogue RBAC réel (§6), UC60-03 (acteur unique confirmé). **Risques réduits** : élimine le risque d'élévation de portée qu'introduiraient les options B/C/D (aucune permission existante n'est détournée). **Impact** : une seule ligne à ajouter au catalogue, un seul assignment à gérer dans `RolePicker`. **Ce qu'elle débloque** : voir §21/§23.

Si le Product Owner anticipe un second acteur (ex. rôle lecture-seule), l'Option A (granulaire) reste la seconde option la plus défendable — mais rien dans les sources actuelles (UC60-03 ne mentionne qu'un acteur) ne le confirme aujourd'hui.

---

## 10. D-CREDIT-LR-02 — Question

Comment répartir fonctionnellement `status` et `deleted_at` sur `loan_rules` entre Activation / Désactivation / Suppression logique / Restauration éventuelle, sans créer deux mécanismes concurrents portant la même signification ?

## 11. D-CREDIT-LR-02 — Sources

Relecture directe de la fiche canonique #14 (`docs/audit/excel_dictionary_dump.txt`) :

| Champ | Type | Défaut | Nullable | Valeurs documentées | Contrainte nommée | Index |
|---|---|---|---|---|---|---|
| `status` | VARCHAR(20) | `'ACTIVE'` | Implicite NOT NULL (défaut fourni) | `ACTIVE`/`INACTIVE` (documentées en colonne « Détail », **aucun `CHECK` nommé ne les verrouille formellement** — incohérence déjà signalée par l'audit précédent §4.1) | Aucune contrainte `CHECK` nommée pour ce champ dans la liste des 13 contraintes de la fiche | Non explicité par la source |
| `deleted_at` | TIMESTAMP | Aucun (absent = NULL) | NULL | — (mécanisme technique standard, pas un enum) | Aucune | Non explicité par la source |

`UNIQUE(tenant_id, account_id)` (`uq_loan_rules_account`) : la fiche **ne précise pas** de clause partielle (`WHERE deleted_at IS NULL`) — **NON DÉTERMINÉ** si une ligne soft-deleted continue d'occuper cette contrainte d'unicité.

Aucun UC (UC60-03 ni aucun des 18 UCX3) ne décompose Activer/Désactiver/Supprimer/Restaurer en scénarios distincts — confirmé par relecture, cohérent avec le constat déjà fait par l'audit précédent (§8/§16/§17) que ces UC ne fournissent aucun scénario numéroté.

## 12. D-CREDIT-LR-02 — Options

| Option | Principe | Support par les sources |
|---|---|---|
| **A** | `status` = état métier utilisable (ACTIVE/INACTIVE) ; `deleted_at` = suppression logique indépendante. Une ligne `INACTIVE` + `deleted_at NULL` reste visible/gérable mais non utilisable pour un nouveau prêt ; toute ligne avec `deleted_at` renseigné est supprimée quel que soit `status` | Cohérente avec l'existence simultanée des deux champs sur la fiche — exploite les deux sans en laisser un inutilisé |
| **B** | `status` porte l'état complet (y compris une valeur qui jouerait le rôle de « supprimé ») ; `deleted_at` ne serait qu'un horodatage technique sans rôle fonctionnel propre | Non supportée telle quelle : les seules valeurs documentées pour `status` sont `ACTIVE`/`INACTIVE` (§11) — une troisième valeur type `DELETED` **n'est pas canonique**, l'inventer serait interdit par le mandat |
| **C** | Désactivation = `deleted_at` uniquement ; `status` resterait réservé à un autre état métier non encore identifié | Non supportée — aucune source ne documente un troisième usage de `status` au-delà d'ACTIVE/INACTIVE ; utiliser `deleted_at` pour une désactivation réversible détournerait un mécanisme conventionnellement irréversible (soft delete) vers un usage réversible, contradiction interne |
| **D** | Suppression physique (pas de soft delete) | Non supportée — `deleted_at` existe explicitement dans le modèle canonique ; l'ignorer contredirait la fiche elle-même |

**Aucune option n'a été choisie automatiquement** — B, C et D sont explicitement écartées par les sources elles-mêmes (valeurs non canoniques ou contradiction interne), pas par préférence. Seule **A** exploite les deux champs canoniques sans en laisser un inutilisé ni inventer de valeur.

## 13. D-CREDIT-LR-02 — Impacts

### 13.1 Opérations (§13 du mandat)

| Opération | `status` modifié ? | `deleted_at` modifié ? | Source de l'opération |
|---|---|---|---|
| CREATE | Fixé à `ACTIVE` (défaut) | Reste NULL | Défaut de la fiche canonique |
| READ | Non | Non | — |
| UPDATE (champs métier : montants, taux, garanties...) | Non, sauf action explicite de statut (orthogonal) | Non | Inféré — aucune source ne documente de couplage |
| ACTIVATE | `INACTIVE → ACTIVE` | Non touché (doit rester NULL — sinon la ligne est supprimée, pas seulement inactive) | Inféré de l'existence des deux champs, non décrit par un UC |
| DEACTIVATE | `ACTIVE → INACTIVE` | Non touché (reste NULL) | Inféré |
| DELETE (logique) | **NON DÉTERMINÉ** si `status` est simultanément forcé à `INACTIVE` ou laissé inchangé | Renseigné (timestamp) | Aucune source ne tranche ce point — `DECISION_REQUIRED` |
| RESTORE | **NON DÉTERMINÉ** si l'opération est même exposée | Remis à NULL, si l'opération existe | **Non évoquée par UC60-03 ni aucun UCX3** — techniquement permise par le champ (`deleted_at` nullable) mais non confirmée comme fonctionnalité offerte |

### 13.2 Conséquences métier (§15 du mandat)

| Question | Réponse |
|---|---|
| Une règle `INACTIVE` peut-elle servir à créer un nouveau `Loan` ? | **NON DÉTERMINÉ PAR LES SOURCES** — aucune UC ne décrit la validation d'éligibilité au moment de la création ; le sens usuel d'« inactive » le suggère, mais ce n'est pas une règle documentée |
| Une règle `INACTIVE` reste-t-elle visible ? | Présumé oui par construction (distincte de `deleted_at`), mais non explicitement affirmé par une source |
| Une règle supprimée (`deleted_at` renseigné) reste-t-elle historisée ? | Oui par convention de soft-delete déjà observée ailleurs dans TANZEN (ex. `users`), mais non spécifiquement documentée pour `loan_rules` |
| Une règle supprimée peut-elle être restaurée ? | **NON DÉTERMINÉ** — aucun UC ne le confirme |
| Peut-on modifier une règle `INACTIVE` ? | **NON DÉTERMINÉ** |
| Peut-on modifier une règle supprimée ? | **NON DÉTERMINÉ** (convention usuelle = non, mais non spécifiée ici) |
| Peut-on recréer une règle avec le même `account_id` après suppression ? | **NON DÉTERMINÉ** — dépend de si `UNIQUE(tenant_id, account_id)` est partielle (`WHERE deleted_at IS NULL`) ou totale ; la fiche ne le précise pas (§11) |
| L'historique des `Loan` existants est-il affecté par la désactivation/suppression d'une règle ? | **Non** — confirmé avec un niveau de confiance élevé, puisqu'aucune FK directe `Loan → loan_rules` n'existe (audit précédent §7) ; c'est le seul point de cette section qui n'est pas `NON DÉTERMINÉ` |

### 13.3 Conséquences sur `Account` (§16 du mandat)

Aucune règle de cascade n'est documentée par aucune source pour `Account actif/désactivé/supprimé → LoanRule`. À noter, factuellement : `src/services/credit.service.ts` et `src/mocks/finance/accounts.ts` (relecture directe) ne portent aujourd'hui **aucune fonction de désactivation ou de suppression d'`Account`** — la question reste donc théorique tant que ce comportement n'existe pas côté `Account` lui-même. **NON DÉTERMINÉ**, aucune cascade à inventer.

### 13.4 Conséquences sur `Loan` (§17 du mandat)

Rappel non rouvert : aucune FK directe `Loan → loan_rules`. Un `Loan` existant ne dépend donc structurellement pas de l'état (`status`/`deleted_at`) d'une `loan_rules` — cohérent avec le constat §13.2. Aucune source ne démontre un héritage de taux, une copie de paramètres, ou une référence indirecte au moment de la création d'un `Loan`. **Le sujet de la source du taux d'intérêt à l'auto-création du `Loan` reste la propriété exclusive de `PHASE_07_DECISIONS_A_VALIDER.md` sujet BLOQUANT 3** (cité verbatim §17 ci-dessous) — non rouvert, non résolu ici, et aucun `D-CREDIT-LR-03` n'est créé pour ce sujet puisqu'il existe déjà sous une décision canonique distincte.

> Citation verbatim (`PHASE_07_DECISIONS_A_VALIDER.md`, sujet 3) : *« Décision proposée : Question à trancher : d'où doit provenir le taux d'intérêt lors de l'auto-création du prêt au décaissement ? Options : (a) ajouter un champ interestRate à Application... (b) introduire une entité LoanPolicy/barème de taux par type de prêt (cohérent avec UC60-03... non implémenté non plus) ; (c) garder la création manuelle actuelle (statu quo)... »* — Statut : **BLOQUANT**, non résolu.

## 14. D-CREDIT-LR-02 — Recommandation proposée

**Recommandation proposée (non validée) : Option A — `status` = état métier utilisable, `deleted_at` = suppression logique indépendante.**

**Pourquoi** : c'est la seule option qui exploite les deux champs canoniques sans en laisser un inutilisé (B/C/D sont explicitement écartées par les sources elles-mêmes, §12 — pas par préférence). **Sources** : coexistence des deux champs sur la fiche #14, sans contradiction entre eux. **Risques réduits** : évite d'inventer une valeur `status` non canonique (`DELETED`) ou de détourner `deleted_at` vers un usage réversible. **Impacts** : laisse ouvertes plusieurs sous-questions non résolues par cette seule recommandation — Activer/Désactiver n'affecte que `status` (comportement déductible directement de l'option A elle-même) ; en revanche, DELETE→`status` simultané, RESTORE (existence même de l'opération), et le caractère partiel ou non de `UNIQUE(tenant_id, account_id)` **restent chacun `DECISION_REQUIRED`**, non résolus par le seul choix de l'option A. **Ce qu'elle débloque** : voir §21/§23 — seulement Activer/Désactiver ; Supprimer/Restaurer nécessiteraient une clarification complémentaire du Product Owner sur ces trois sous-points avant d'être implémentables avec certitude.

---

## 15. Account

Voir §13.3. Aucune cascade documentée. Aucune fonction de désactivation/suppression d'`Account` n'existe aujourd'hui dans le code (`credit.service.ts`, `finance/accounts.ts` relus directement) — la question de la cascade `Account → loan_rules` reste donc sans objet pratique tant que ce comportement n'existe pas côté `Account`.

## 16. Loan

Voir §13.4. Aucun impact structurel d'un changement d'état de `loan_rules` sur un `Loan` existant (absence de FK confirmée). Le sujet du taux d'intérêt (Phase 7 sujet 3) reste distinct et ouvert, non traité par cette mission.

## 17. RBAC

Voir §5-§9. Catalogue actuel relu intégralement (78 permissions, `src/mocks/rbac.mocks.ts`) — aucune permission `loan_rules`. Deux conventions réelles coexistent (granulaire multi-acteur vs `.manage` acteur unique) ; UC60-03 ne démontre qu'un acteur (Admin Tenant), ce qui oriente factuellement vers le pattern `.manage` (7 précédents directs) plutôt que le pattern granulaire (1 seul précédent, `governance.*`, pour un usage multi-acteur différent).

## 18. Tenant isolation

Portée : `loan_rules.tenant_id` direct (non dérivé), confirmé par l'audit précédent (§6/§13) — aucune jointure requise pour un filtrage `WHERE tenant_id = ?`, cohérent avec le pattern `getTenantScoped` déjà utilisé par tous les services `finance`/`credit` existants. Comportement attendu, conforme au modèle RBAC déjà en place depuis P0 RBAC (rôles tenant-scopés, D1=B) : T-001 gère ses propres `loan_rules` ; T-001 ne peut pas gérer celles de T-002 — ce comportement serait garanti par le même mécanisme déjà utilisé pour `accounts`/`loans`/`applications`, sans nouveau mécanisme à inventer. Aucune modification RBAC effectuée par cette mission.

## 19. Backend Pending

Restent `BACKEND_PENDING`, comme pour l'intégralité du projet : la persistance réelle de `loan_rules`, la validation serveur des contraintes (`CHECK`, `UNIQUE`), la résolution serveur du RBAC (permission réellement vérifiée côté API), la garantie serveur du tenant isolation, et l'audit serveur des modifications. **Ce statut n'est pas utilisé ici pour masquer D-CREDIT-LR-01 ou D-CREDIT-LR-02** — les deux sont des décisions strictement frontend/produit (nommage de permission, répartition fonctionnelle de deux champs déjà canoniques), tranchables dès aujourd'hui indépendamment de l'absence de backend réel.

## 20. Dépendances

```
D-CREDIT-LR-01
      │
      ├── RBAC (catalogue rbac.mocks.ts — ajout d'1 à 4 lignes selon l'option retenue)
      ├── UI (RolePicker — assignment de la/les nouvelle(s) permission(s) aux rôles)
      ├── service (futur loan-rule.service.ts — garde d'accès conditionnée à la permission)
      └── tests (refus/autorisation selon la permission tranchée)

D-CREDIT-LR-02
      │
      ├── status (Activer/Désactiver — débloqué par la seule Option A si retenue)
      ├── delete (Supprimer — reste partiellement ouvert : status simultané ? NON DÉTERMINÉ)
      ├── restore (Restaurer — existence même de l'opération NON DÉTERMINÉE, indépendante du choix d'option)
      ├── Account (aucune cascade documentée, sans objet tant qu'Account n'a pas de désactivation/suppression)
      └── futur Loan (aucun impact structurel, FK absente — indépendant de cette décision)
```

Les deux décisions sont **indépendantes l'une de l'autre** : D-CREDIT-LR-01 conditionne l'accès (qui peut agir), D-CREDIT-LR-02 conditionne le comportement (ce qui se passe quand on désactive/supprime). Consulter/Lister/Créer/Modifier ne dépendent que de D-CREDIT-LR-01. Désactiver/Supprimer/Restaurer dépendent des deux.

## 21. Matrice GO/NO-GO

| Fonctionnalité | D-LR-01 | D-LR-02 | Backend | Statut |
|---|---|---|---|---|
| Consulter | Requise | Non requise | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (bloquée par D-LR-01 seule) |
| Lister | Requise | Non requise | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (bloquée par D-LR-01 seule) |
| Créer | Requise | Non requise | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (bloquée par D-LR-01 seule) |
| Modifier | Requise | Non requise (sauf si la ligne est `INACTIVE`/supprimée — NON DÉTERMINÉ, cf. §13.2) | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (bloquée par D-LR-01 seule ; sous-cas modification d'une ligne inactive reste `NON DÉTERMINÉ`) |
| Activer | Requise | Requise (résolue par l'Option A recommandée) | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (D-LR-01 + D-LR-02) |
| Désactiver | Requise | Requise (résolue par l'Option A recommandée) | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (D-LR-01 + D-LR-02) |
| Supprimer | Requise | Requise, **mais un sous-point reste ouvert même après l'Option A** (`status` simultanément forcé à `INACTIVE` ou non — §13.1) | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED (D-LR-01 + D-LR-02 + clarification complémentaire) |
| Restaurer | Requise | **Existence même de l'opération non confirmée par aucun UC** | `BACKEND_PENDING` | 🟡 DECISION_REQUIRED — susceptible d'être `OUT_OF_SCOPE` si le Product Owner confirme qu'aucun UC n'expose cette opération |

## 22. Décisions proposées

**D-CREDIT-LR-01 — Recommandation proposée : `loanRules.manage` (Option A′), non validée**, cf. §9. **D-CREDIT-LR-02 — Recommandation proposée : Option A (`status` = usage, `deleted_at` = suppression), non validée**, cf. §14, avec trois sous-points explicitement laissés `DECISION_REQUIRED` même après l'adoption de l'option A : (i) `DELETE` force-t-il `status = INACTIVE` simultanément ? (ii) l'opération `RESTORE` est-elle réellement exposée à l'utilisateur, ou seulement techniquement permise par le champ ? (iii) `UNIQUE(tenant_id, account_id)` est-elle partielle (exclut les lignes soft-deleted) ou totale ? Aucune de ces trois sous-questions n'est tranchée par cette mission — elles ne nécessitent pas nécessairement une nouvelle décision `D-CREDIT-LR-03` distincte, mais devront être explicitées par le Product Owner au moment de valider D-CREDIT-LR-02 elle-même, faute de quoi Supprimer/Restaurer resteraient `DECISION_REQUIRED` même après validation de l'option A pour Activer/Désactiver.

## 23. Périmètre après validation

```
APRÈS VALIDATION DE D-CREDIT-LR-01 SEULE
--------------------------------------------------------
- Consulter        → devient actionnable (implémentable)
- Lister           → devient actionnable
- Créer            → devient actionnable
- Modifier         → devient actionnable (hors sous-cas
                      "modifier une ligne inactive", qui reste
                      NON DÉTERMINÉ indépendamment de D-LR-01)

APRÈS VALIDATION DE D-CREDIT-LR-01 ET D-CREDIT-LR-02 (Option A)
--------------------------------------------------------
- Activer          → devient actionnable
- Désactiver       → devient actionnable
- Supprimer        → devient actionnable UNIQUEMENT si le PO
                      précise également le sous-point (i) du §22
                      (status simultané ou non)
- Restaurer        → reste DECISION_REQUIRED tant que le PO n'a
                      pas confirmé que cette opération doit être
                      exposée (sous-point (ii) du §22) — non
                      présumé GO par la seule validation de D-LR-02

TOUJOURS BACKEND_PENDING, quelle que soit la validation
--------------------------------------------------------
Persistance réelle, validation serveur, RBAC serveur, tenant
isolation serveur.

TOUJOURS HORS PÉRIMÈTRE DE CETTE ANALYSE
--------------------------------------------------------
- Sujet BLOQUANT 3 de PHASE_07_DECISIONS_A_VALIDER.md (source du
  taux d'intérêt à l'auto-création du Loan) — non rouvert.
- Champs additionnels du diagramme de classes (MODEL_GAP, déjà
  signalés par l'audit précédent) — non concernés par ces deux
  décisions RBAC/statut.
```

**Aucun statut GO n'est présumé** au-delà de ce que les validations ci-dessus débloquent explicitement — conformément au mandat, la matrice §21 reflète les conclusions réelles de cette analyse, pas une anticipation optimiste.

## 24. Conclusion

Les deux décisions restent indépendantes et complémentaires. D-CREDIT-LR-01 (RBAC) est la plus simple à trancher : le catalogue existant fournit un précédent architectural fort et univoque (7 domaines `.manage` pour des ressources de configuration à acteur unique, exactement le profil de `loan_rules` selon UC60-03) — sa validation débloquerait à elle seule Consulter/Lister/Créer/Modifier. D-CREDIT-LR-02 (statut/soft delete) est plus nuancée : le modèle canonique supporte clairement une option unique parmi celles envisageables (Option A), mais cette option ne résout pas à elle seule trois sous-questions opérationnelles (simultanéité `status`/`deleted_at` à la suppression, existence réelle de l'opération Restaurer, caractère partiel de la contrainte d'unicité) qui devront être explicitées séparément par le Product Owner au moment de la validation. Aucune des deux décisions n'a été tranchée par cette mission — les deux recommandations proposées (§9, §14) restent des propositions.

---

## Vérification finale — aucune modification

`git status --short` / `git diff --stat` exécutés avant et après cette analyse, dans les trois projets : identiques. `tanzen-frontend` : seul `docs/P1_CREDIT_LOAN_RULES_DECISION_ANALYSIS.md` (ce document) est nouveau ; tous les autres fichiers listés par `git status` sont des changements préexistants d'une mission antérieure (P0 Users/RBAC, normalisation `loan_rules`, audit précédent), non retouchés par cette mission. `tanzen-mobile` : changements préexistants (chantier Governance), non touchés. `tanzen-commercial` : aucun changement (`main`, arbre propre). Aucun fichier source, test, migration ou RBAC modifié. Aucun commit. Aucun push.
