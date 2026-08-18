# P1 TONTINE — DECISION GATE
# PO DECISION VALIDATION — FRONTEND ONLY
# READ-ONLY

**Statut : DOSSIER DE DÉCISION — 🟡 8 DÉCISIONS EN ATTENTE DE VALIDATION PO.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` de `tanzen-frontend`. Aucune migration, service, repository, route, écran, permission, table, colonne ou relation n'a été créée. **`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` n'ont pas été touchés et sont hors périmètre absolu de ce mandat** — toute mention de ces trois dépôts ci-dessous sert uniquement à documenter un impact futur, jamais une action. Ce document ne donne aucun GO d'implémentation ; celui-ci relèverait d'un mandat séparé « IMPLEMENTATION GO », non demandé ici. Aucun commit, aucun push.

---

## 1. Objet

Transformer les 8 sujets `DECISION_REQUIRED`/`À ARBITRER` identifiés par `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` (§22-23) en un pack de validation directement actionnable par le Product Owner — chaque décision porte des options tracées à leurs sources, une analyse des consommateurs réels du code, une recommandation explicitement non contraignante, et un bloc de validation à cocher. Ce document ne tranche rien lui-même : il **prépare** les décisions nécessaires avant une future phase `IMPLEMENTATION GO`, conformément au mandat.

## 2. Contexte

`docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` a établi, en lecture seule, que le domaine Tontine possède un modèle canonique verrouillé (`docs/dictionnaire_donnees.xlsx` + `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md`) dont l'implémentation réelle de `tanzen-frontend` diverge sur plusieurs points structurels et de nomenclature. Quatre de ces points étaient déjà consignés par le projet lui-même (`docs/PHASE_08_DECISIONS_A_VALIDER.md`) ; quatre autres ont été identifiés pour la première fois par l'audit. Ce dossier reformule ces 8 sujets pour validation — il n'en rouvre aucun ni n'en invente de nouveaux.

## 3. Sources utilisées

Source principale : `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` (intégralement, §4-23).

Sources secondaires effectivement référencées et reprises ici pour la traçabilité de chaque option :
- `docs/dictionnaire_donnees.xlsx` (feuilles `tontines`, `tontine_cycles`, `cycle_members`, `tontine_contributions`, `tontine_draws`, `draw_winners`)
- `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` (§1.1, §2.1, §3, §8, ligne 127 pour `organization_type`)
- `docs/PHASE_02_DECISIONS_CANONIQUES.md` (sujet 18f, `organization_type`)
- `docs/PHASE_08_TONTINES.md`, `docs/PHASE_08_DECISIONS_A_VALIDER.md` (§1-4, source directe de D-TON-05 à D-TON-08)
- Code réel, relu pour ce dossier au-delà de l'audit initial : `src/features/organization/organization-module.tsx` (lignes 166-192, consommateurs exacts de `Contribution`), `src/features/tontines/tontines-module.tsx` (ligne 275, consommateur exact de `CycleContribution`), `src/mocks/finance/contributions.ts`, `src/mocks/tontines/tontine-cycles.ts`, `src/services/tontines.service.ts`, `src/mocks/rbac.mocks.ts`

**Correction ponctuelle apportée par ce dossier à l'audit initial** : `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §16 affirmait que l'onglet Contributions de la fiche Membre consomme `queryKeys.tontines.cyclesByMember` — vérification directe du code (`organization-module.tsx:183-191`) montre que `ContributionsTab` consomme en réalité `financeService.listContributionsByMember` (l'entité `Contribution`, pas `CycleContribution`). C'est l'onglet **Tontines** (`TontinesTab`, différent) qui consomme `cyclesByMember`. Cette correction ne change aucun verdict de l'audit, mais est déterminante pour D-TON-01 ci-dessous (§9) — signalée ici plutôt que silencieusement corrigée dans le document déjà publié.

## 4. Hiérarchie des sources

Reprise sans modification depuis `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §2 :

1. `docs/dictionnaire_donnees.xlsx` — source de vérité physique.
2. `docs/PHASE_02_DECISIONS_CANONIQUES.md` / `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` — couche de décision produit verrouillée.
3. `docs/PHASE_08_TONTINES.md` / `docs/PHASE_08_DECISIONS_A_VALIDER.md` — rapport d'implémentation Phase 8.
4. `docs/PHASE_02_TENANT_ISOLATION_SPEC.md`.
5. Code source réel de `tanzen-frontend`.

**Note propre à ce Pack** : aucune décision ci-dessous n'est aujourd'hui rang 1 — chacune le devient uniquement au fur et à mesure que le PO coche une option. Tant qu'une décision reste `🟡 EN ATTENTE DE VALIDATION PO`, les rangs 1-3 (parfois muets ou contradictoires sur le point précis en question) restent la référence documentée.

## 5. Fondations déjà validées (non rouvertes)

Reprises telles quelles de l'audit, non remises en cause par ce dossier :
- Isolation tenant en deux temps (`Tontine` → `TontineCycle`), testée (`docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §11).
- `TontineCycle.status = DRAFT/OPEN/SUSPENDED/CLOSED`, verrouillé par le PO en Phase 2, cohérent entre le code et `PHASE_02_MODELE_CANONIQUE_FINAL.md` (audit §5).
- Convention Web project-wide d'absence de `uuid`/`version`/`sync_status`/soft-delete sur toutes les entités (audit §12, §21 point 5) — **non rouverte par ce dossier**, aucune décision ci-dessous n'y touche.
- Fusion `Winner` → `CycleDraw` (pas d'entité `draw_winners` séparée), documentée et assumée (audit §9, §21 point 8) — **non rouverte**, la contrainte `UNIQUE(draw_id)` étant déjà satisfaite par construction sans action requise.

---

## 6. Périmètre des décisions à formaliser

```
tontines ────────── D-TON-04 (Tontine.type)

tontine_cycles ──── D-TON-02 (cycle_number)
       │
       ├── cycle_members ──── D-TON-08 (workflow adhésion)
       │
       ├── tontine_contributions ── D-TON-01 (réconciliation) · D-TON-06 (permission create) · D-TON-07 (calendrier)
       │
       └── tontine_draws ──── D-TON-03 (draw_type)

TontineCycle.status=CLOSED ── D-TON-05 (réouverture)
```

8 décisions, dont 4 déjà loggées par le projet (D-TON-05 à 08, reprises sans modification de `PHASE_08_DECISIONS_A_VALIDER.md`) et 4 nouvelles, identifiées par l'audit (D-TON-01 à 04).

---

## D-TON-01 — Réconciliation Contribution / CycleContribution

### Question PO

`Contribution` (ledger Finance) et `CycleContribution` (moteur Tontine) doivent-elles être fusionnées, reliées explicitement, ou rester séparées avec seulement une règle de cohérence documentée ?

### Faits établis

Deux entités distinctes coexistent, non reliées par FK :

| | `Contribution` (`src/mocks/finance/contributions.ts:14-23`) | `CycleContribution` (`src/mocks/tontines/tontine-cycles.ts:17-24`) |
|---|---|---|
| Champs | `id, tenantId, memberId, tontineId, cycleNumber, amount, date, status` | `id, tontineCycleId, memberName, amount, date, status` |
| FK membre | `memberId` réel | Aucune (`memberName` string seul) |
| Rattachement au cycle | Clé métier `tontineId`+`cycleNumber` | Structurel (`tontineCycleId`, tableau imbriqué) |
| Écriture | `financeService` — aucune fonction `create` trouvée à ce jour non plus | Aucune fonction `create` (bloqué, cf. D-TON-06) |
| Auto-documentation | `contributions.ts:1-11` : *« remplace les anciens financeContributions et Member.contributions... Distinct de CycleContribution... ce dernier est un enregistrement interne au moteur de cycle de tontine (protégé, non modifié ici) »* | — |

**Analyse des consommateurs réels** (relecture directe du code pour ce dossier, corrigeant l'audit §16 — voir §3) :

| Consommateur | Entité lue | Fichier |
|---|---|---|
| Finance > Liste des cotisations | `Contribution` | `finance-module.tsx:133` |
| Finance > Tendance mensuelle | `Contribution` (agrégat séparé `contributionsByMonth`) | `finance-module.tsx:136` |
| Fiche Membre > Onglet Overview (métrique « Cotisations ») | `Contribution` | `organization-module.tsx:174` |
| Fiche Membre > Onglet Contributions (tableau) | `Contribution` | `organization-module.tsx:184-191` |
| Fiche Cycle > Onglet Contributions | `CycleContribution` | `tontines-module.tsx:275` (`rows={cycle.contributions}`) |

**`Contribution` a 4 consommateurs UI réels ; `CycleContribution` en a exactement 1.** Aucun code ne lit les deux à la fois ni ne les recoupe.

### Sources d'autorité

Aucune — la fiche dictionnaire `tontine_contributions` (rang 1) ne connaît qu'**une seule** entité de ce nom ; le doublon `Contribution`/`CycleContribution` est un fait de code, pas une divergence de source documentaire à arbitrer entre deux textes.

### Sources en conflit

Aucune source ne recommande explicitement la fusion ni la séparation — le commentaire du code (`contributions.ts:1-11`) documente une séparation **déjà faite**, sans en justifier la pérennité ni en interdire la réconciliation future.

### Option A — Fusionner en une seule entité

`CycleContribution` est retirée ; `TontineCycle.contributions[]` est reconstruit par filtrage de `Contribution` sur `tontineId`+`cycleNumber` (ou `cycle_id` si D-TON-02 ratifie `cycle_number` et qu'une migration ajoute un FK propre).

- **Avantages** : une seule vérité, `member_id` fiable partout (hérité de `Contribution`), rapproche le modèle Web du schéma canonique unique (`tontine_contributions`).
- **Inconvénients** : `CycleDetail` (`tontines-module.tsx:275`) doit être réécrit pour dériver ses lignes de `Contribution` filtrée plutôt que de lire `cycle.contributions` directement — rupture du pattern "tout est dans `TontineCycle`" déjà en place pour `members`/`draws`/`activities`.
- **Migration** : les 10 enregistrements `FC-00X` (`Contribution`) et les cotisations imbriquées dans les 5 cycles seed (`CycleContribution`, ex. `CC-001`..`CC-014`) devraient être réconciliés un par un — aucune correspondance automatique fiable n'existe aujourd'hui entre un `CC-xxx` et un `FC-xxx` (montants/dates parfois proches mais non identiques dans les seeds actuels).
- **Web** : retrait de `CycleContribution` du type `TontineCycle`, réécriture de `CycleDetail`.
- **Backend/Mobile** : aligne le futur modèle sur une seule entité `tontine_contributions`, cohérent avec le schéma canonique — **simplifie** leur future construction (non exécutée ici).
- **Risques** : la migration des seeds existantes n'est pas triviale (voir ci-dessus) ; à traiter comme chantier dédié, pas comme effet de bord d'une autre fonctionnalité (cohérent avec la recommandation §27 de l'audit).

### Option B — Séparer avec relation explicite

`CycleContribution` gagne un champ `financeContributionId` (FK optionnelle vers `Contribution.id`), sans fusion des deux structures.

- **Avantages** : traçabilité explicite sans réécrire les 5 consommateurs existants ; chaque nouvelle cotisation pourrait créer les deux enregistrements liés.
- **Inconvénients** : ne résout pas la racine du doublon — deux écritures restent nécessaires à chaque cotisation (aucune fonction `create` n'existe aujourd'hui pour l'une ou l'autre, donc ce coût n'est payé qu'au moment où D-TON-06 débloquerait la création) ; risque de désynchronisation si l'une des deux est modifiée sans l'autre (aucun mécanisme de cohérence n'est proposé par cette option seule).
- **Migration** : ajouter le champ est additif (pas de rupture), mais les 10+14 enregistrements seed existants n'ont pas de correspondance fiable à assigner rétroactivement (même limite qu'Option A).
- **Web** : nouveau champ optionnel sur `CycleContribution`, aucun retrait.
- **Backend/Mobile** : le schéma canonique unique (`tontine_contributions`) n'a pas de champ pour une FK de ce type — cette option resterait une particularité du Web, à ne pas répliquer telle quelle.

### Option C — Séparer avec règle de cohérence documentée, sans lien technique

Statu quo structurel : les deux entités restent totalement indépendantes en code, mais une règle métier explicite est documentée (ex. « `Contribution` est la source de vérité financière ; `CycleContribution` est un instantané d'affichage propre au moteur de cycle, resynchronisé manuellement/périodiquement ») sans FK ni fusion.

- **Avantages** : aucun changement de code requis, risque de régression nul.
- **Inconvénients** : ne résout aucun des risques déjà identifiés par l'audit (§10, §14 : incohérence possible entre les deux vérités) ; repousse le problème plutôt que de le traiter ; le schéma canonique unique n'a de toute façon qu'une seule entité, donc cette option maintient une divergence permanente vis-à-vis du modèle cible.
- **Migration** : aucune.
- **Backend/Mobile** : n'aide pas leur construction — ils devront de toute façon choisir une seule structure conforme au dictionnaire, indépendamment de ce que le Web fait.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Conforme au schéma canonique (1 seule entité) | Oui | Non | Non |
| Nombre de consommateurs à réécrire | 1 (`CycleDetail`) | 0 | 0 |
| Résout le risque d'incohérence (audit §10, §14) | Oui | Partiellement (si les 2 écritures sont disciplinées) | Non |
| Migration des seeds existantes | Non triviale | Non triviale (mêmes données) | Aucune |
| Simplifie Backend/Mobile futurs | Oui | Non | Non |
| Effort | Modéré (1 écran + migration seed) | Faible-modéré | Nul |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel à signaler, pas une préférence imposée : l'Option A est la seule des trois qui aligne le Web sur le schéma canonique à une seule entité `tontine_contributions` — mais son coût de migration des seeds existantes (aucune correspondance automatique fiable entre `CC-xxx` et `FC-xxx`) doit être chiffré séparément avant d'être engagé, cohérent avec la recommandation §27 de l'audit de ne pas mélanger une migration de modèle avec une nouvelle fonctionnalité.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Fusionner en une seule entité (CycleContribution dérivée de Contribution)
[ ] OPTION B — Séparer avec relation explicite (FK financeContributionId)
[ ] OPTION C — Séparer avec règle de cohérence documentée, sans lien technique
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-02 — cycle_number

### Question PO

Le champ `cycleNumber` (déjà implémenté, obligatoire et rendu unique par tontine dans le code) doit-il être ratifié comme attribut canonique de `tontine_cycles`, supprimé, ou conservé temporairement comme extension Web non ratifiée ?

### Faits établis

La fiche dictionnaire `tontine_cycles` (rang 1) laisse explicitement ce point ouvert : *« opportunité d'un champ `cycle_number` [...] reste à valider par le propriétaire fonctionnel — aucune valeur n'a été inventée pour combler ce point »* (`docs/dictionnaire_donnees.xlsx`, feuille `tontine_cycles`, ligne 59, citée intégralement dans l'audit §5). Le code, lui, a déjà tranché de facto : `cycleNumber: number` est un champ obligatoire de `TontineCycle` (`tontine-cycles.ts:56`), et `createCycle` (`tontines.service.ts:41-50`) rejette toute création dupliquant un `cycleNumber` déjà utilisé par la même tontine (`duplicate` check, ligne 45) — un comportement équivalent à `UNIQUE(tontine_id, cycle_number)`, jamais formalisé comme telle. `PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) ne mentionne `cycle_number` nulle part — ce point n'a pas été traité par le verrouillage PO qui a autrement tranché `TontineCycle.status`.

### Sources d'autorité

Code réel (rang 5) pour l'état actuel — champ déjà en production et exercé par 15 tests indirectement (`tontines.service.test.ts`, aucun test ne cible spécifiquement l'unicité de `cycleNumber`, mais `createCycle` l'applique dans le chemin normal testé).

### Sources en conflit

Le dictionnaire (rang 1) refuse explicitement de trancher ; le code a tranché sans validation métier documentée. Ce n'est pas un conflit entre deux réponses contradictoires, mais un écart entre une question sciemment laissée ouverte et une réponse de facto déjà en production.

### Option A — Ratifier cycle_number comme attribut canonique

Le PO confirme `cycle_number` comme faisant partie du schéma `tontine_cycles`, avec `UNIQUE(tenant_id, tontine_id, cycle_number)` comme contrainte formelle (généralisation de ce que `createCycle` applique déjà à l'échelle d'une tontine).

- **Avantages** : aucun changement de code requis (le comportement actuel devient conforme rétroactivement) ; comble un point resté ouvert dans le dictionnaire depuis sa dernière correction.
- **Inconvénients** : engage le schéma canonique sur un champ que le dictionnaire lui-même n'a jamais validé — le combler demande une mise à jour du dictionnaire physique (hors périmètre de ce mandat, action pour le propriétaire du fichier).
- **Migration** : aucune côté Web.
- **Backend/Mobile** : leur futur schéma `tontine_cycles` pourrait inclure `cycle_number` en toute légitimité si cette option est retenue.

### Option B — Supprimer cette notion

Retirer `cycleNumber` du modèle Web, s'aligner sur le silence du dictionnaire.

- **Avantages** : élimine un champ non sourcé.
- **Inconvénients** : rupture directe — `cycleNumber` est affiché dans au moins 3 endroits observés (titre de `CycleDetail`, `CYCLE_STATUS_LABEL`/liste des cycles, colonne `cycle` de `ContributionsTab`) et sert de clé d'unicité fonctionnelle pour éviter les doublons de cycle ; le retirer sans le remplacer par un autre identifiant lisible (ex. `startDate`/`endDate` seuls) dégraderait l'UX sans qu'aucune source ne le demande.
- **Migration** : retrait d'un champ activement utilisé — risque de régression le plus élevé des trois options.

### Option C — Conserver temporairement comme extension Web non ratifiée

Le champ reste tel quel dans le code, explicitement documenté comme extension Web non confirmée par le dictionnaire, en attendant une décision ultérieure du propriétaire du fichier `dictionnaire_donnees.xlsx`.

- **Avantages** : aucun changement de code ; ne force pas une mise à jour du dictionnaire dans l'immédiat.
- **Inconvénients** : laisse le point `DECISION REQUIRED` ouvert indéfiniment côté Backend/Mobile — chacun devra reproduire la même question au moment de construire son propre schéma `tontine_cycles`, sans réponse déjà tranchée à leur disposition.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Changement de code requis | Aucun | Oui (retrait, 3+ points d'usage) | Aucun |
| Risque de régression | Nul | Élevé | Nul |
| Comble le point ouvert du dictionnaire | Oui | Oui (en le neutralisant) | Non — reporté |
| Aide Backend/Mobile à trancher le même point | Oui | Oui | Non |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel : l'Option B implique un retrait d'un champ activement affiché dans au moins 3 endroits de l'UI, sans qu'aucune source ne demande ce retrait — signalé comme le changement au risque le plus élevé des trois, pas comme une option écartée d'office.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Ratifier cycle_number comme attribut canonique de tontine_cycles
[ ] OPTION B — Supprimer cette notion
[ ] OPTION C — Conserver temporairement comme extension Web non ratifiée
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-03 — draw_type

### Question PO

Le tirage doit-il rester exclusivement manuel (comportement actuel), ou les trois modes canoniques (`ROTATION`, `AUCTION`, `RANDOM`) doivent-ils être implémentés — intégralement, ou progressivement ?

### Faits établis

Le dictionnaire (rang 1, feuille `tontine_draws`) définit `draw_type IN ('ROTATION','AUCTION','RANDOM')` comme `NOT NULL`. Le code actuel n'a **aucun** champ `draw_type` : `CycleDraw` (`tontine-cycles.ts:29-43`) ne connaît qu'un tirage manuel — `declareWinner` (`tontines.service.ts:82-98`) exige une sélection explicite d'un `winnerMemberId` par l'appelant, sans algorithme. `docs/PHASE_08_DECISIONS_A_VALIDER.md` (rang 3, section « Hors périmètre ») confirme explicitement que ce choix est **sourcé**, pas un oubli : *« Méthode de sélection du gagnant — non inventée : la déclaration du gagnant [...] est une sélection manuelle par l'administrateur, jamais un algorithme [...], conformément à "le tirage est manuel" »*, et que `TontineBid`/enchère est une *« capacité de schéma dormante, aucun UC ne l'exerce »*. Le champ `bidAmount` existe déjà dans `CycleDraw` (`tontine-cycles.ts:38`) mais reste toujours à `0` (audit §8) — vestige compatible avec une future Option B/C, sans avoir jamais été activé.

### Sources d'autorité

Dictionnaire (rang 1) pour les 3 valeurs canoniques. `PHASE_08_DECISIONS_A_VALIDER.md` (rang 3) pour la confirmation sourcée que le comportement manuel actuel est un choix produit délibéré, pas un gap d'implémentation oublié.

### Sources en conflit

Aucune contradiction directe — le dictionnaire prévoit 3 modes, le code n'en implémente aucun nommément (le mode manuel actuel ne correspond à aucune des 3 valeurs canoniques ; il s'agit d'un 4e comportement de facto, non prévu par l'enum). C'est une **absence d'implémentation d'un champ obligatoire du schéma canonique**, pas un désaccord entre deux sources qui se contrediraient.

### Option A — Conserver le tirage manuel uniquement

Le mode manuel actuel devient la décision produit définitive ; `draw_type` n'est pas implémenté (ou implémenté avec une seule valeur figée, ex. `MANUAL`, hors des 3 valeurs canoniques).

- **Avantages** : aucun changement de code ; cohérent avec le comportement déjà en production et testé (15 tests, dont 2 sur `declareWinner`).
- **Inconvénients** : le schéma canonique `draw_type IN ('ROTATION','AUCTION','RANDOM')` resterait durablement non conforme côté Web — à moins que le PO ne fasse aussi corriger le dictionnaire pour y ajouter/substituer une valeur `MANUAL`, ce qui est une action sur le dictionnaire, hors périmètre de ce mandat.
- **Backend/Mobile** : devront eux-mêmes décider s'ils répliquent ce choix ou implémentent les 3 modes canoniques dès leur construction — cette option ne les engage pas mais ne les aide pas non plus.

### Option B — Implémenter les trois modes

`draw_type` ajouté à `CycleDraw`, avec une logique dédiée pour chacun de `ROTATION` (sélection automatique par ordre de `position`/`initial_rank`), `AUCTION` (activation réelle de `bidAmount`, déjà présent mais mort), `RANDOM` (tirage aléatoire parmi les membres éligibles).

- **Avantages** : conformité complète au schéma canonique ; active un champ déjà présent mais mort (`bidAmount`).
- **Inconvénients** : le plus gros effort des trois options — 3 algorithmes de sélection à spécifier (aucune règle métier n'existe aujourd'hui pour `ROTATION`/`RANDOM`, ex. gestion des ex-æquo, membres déjà gagnants exclus ou non) ; `declareWinner` actuel (sélection manuelle) devrait coexister ou être remplacé selon le mode.
- **Migration** : les 8 tirages seed existants (`CD-001`..`CD-008`) n'ont pas de `draw_type` à assigner rétroactivement de façon non ambiguë.
- **Risques** : les règles de départage/exclusion pour `ROTATION`/`RANDOM` ne sont sourcées par aucun document consulté — les inventer serait une invention de règle métier, explicitement interdite par le mandat d'audit d'origine et implicitement par celui-ci.

### Option C — Introduction progressive (ROTATION d'abord)

`draw_type` ajouté avec seulement `ROTATION` implémenté dans un premier temps (le plus proche du comportement actuel : ordre de `position` déjà existant sur `CycleMember`) ; `AUCTION`/`RANDOM` traités dans une phase ultérieure distincte.

- **Avantages** : réutilise une donnée déjà présente (`CycleMember.position`) ; effort borné à un seul mode pour une première étape ; cohérent avec la recommandation §27 de l'audit de traiter les migrations de modèle comme des chantiers dédiés plutôt que mélangés.
- **Inconvénients** : les règles précises de `ROTATION` (que faire si le membre suivant dans l'ordre a déjà gagné, ex. cycle qui boucle) ne sont sourcées par aucun document consulté — resteraient `DECISION REQUIRED` même après cette étape.
- **Risques** : nécessite un critère de sortie explicite pour la suite (`AUCTION`/`RANDOM`), sinon `draw_type` reste durablement une énumération à une seule valeur effective, ce qui n'est pas un vrai gain de conformité par rapport à l'Option A.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Conformité immédiate au schéma canonique | Non | Oui (si les 3 algorithmes sont correctement spécifiés) | Partielle |
| Règles métier à faire spécifier par le PO avant implémentation | Aucune | 3 (une par mode) | 1 (`ROTATION`) |
| Effort | Nul | Le plus élevé | Modéré |
| Réutilise une donnée déjà existante (`position`) | N/A | Pour `ROTATION` seulement | Oui |
| Active `bidAmount` (déjà présent, mort) | Non | Oui (`AUCTION`) | Non, différé |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel, pas une préférence imposée : quelle que soit l'option retenue, les règles de départage/exclusion pour `ROTATION` et `RANDOM` ne sont sourcées par aucun document consulté à ce jour — leur absence resterait un `DECISION REQUIRED` distinct, à traiter séparément de ce choix de périmètre.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Conserver le tirage manuel uniquement
[ ] OPTION B — Implémenter les trois modes (ROTATION, AUCTION, RANDOM)
[ ] OPTION C — Introduction progressive (ROTATION d'abord)
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-04 — Tontine.type

### Question PO

Le champ `Tontine.type` (`'cooperative'|'tontine'|'association'|'mutuelle'`, présent dans le code mais absent de la fiche dictionnaire `tontines`) est-il un doublon voulu de `tenants.organization_type`, un attribut réellement propre à `Tontine` non documenté, ou un champ à retirer ?

### Faits établis

`Tontine.type` existe dans `src/mocks/tontines/tontines.ts:3-13` avec 4 valeurs (`cooperative`, `tontine`, `association`, `mutuelle`), utilisé pour les 5 tontines seed (`TON-001`..`005`). La fiche dictionnaire `tontines` (rang 1, audit §4) ne porte **aucun champ de ce type** — seuls `id, uuid, tenant_id, name, description, frequency, default_contribution_amount, is_purchasable, status, sync_status, version, created_at, updated_at, deleted_at, created_by, updated_by` y figurent. En revanche, `PHASE_02_MODELE_CANONIQUE_FINAL.md:127` (rang 2) documente `tenants.organization_type ∈ {association, tontine, cooperative, church, company, community, other}` comme *« convergence de 6 diagrammes de classes, dictionnaire silencieux mais non contradictoire »* (Phase 2, sujet 18f) — un champ **au niveau du tenant**, avec un vocabulaire à 4 valeurs communes (`association`, `tontine`, `cooperative`) mais aussi 3 valeurs propres à `organization_type` (`church`, `company`, `community`, `other`) absentes de `Tontine.type`, et 1 valeur propre à `Tontine.type` (`mutuelle`) absente de `organization_type`. **Les deux vocabulaires se recoupent mais ne sont pas identiques.**

### Sources d'autorité

`PHASE_02_MODELE_CANONIQUE_FINAL.md` (rang 2) pour `tenants.organization_type`. Aucune source de rang 1 à 3 ne documente `Tontine.type` lui-même — code réel (rang 5) seul.

### Sources en conflit

Aucun conflit direct — il n'existe pas de source qui interdise `Tontine.type`, seulement une absence totale de spécification pour ce champ précis, doublée d'une ressemblance troublante avec un champ existant à un autre niveau (`tenants`, pas `tontines`).

### Option A — Retirer Tontine.type (doublon non voulu de organization_type)

Le champ est considéré comme une confusion entre le type d'organisation du tenant et le type de la tontine elle-même ; il est retiré, et si une distinction de nature de groupe d'épargne est nécessaire, elle est déportée sur `tenants.organization_type` (déjà canonique).

- **Avantages** : élimine un champ non sourcé et potentiellement redondant ; aligne strictement `Tontine` sur la fiche dictionnaire.
- **Inconvénients** : `type` est utilisé dans les 5 enregistrements seed et pourrait être lu par l'UI (à vérifier au moment de l'implémentation, hors périmètre de ce dossier) ; suppose que la distinction `cooperative`/`tontine`/`association`/`mutuelle` n'a jamais de sens à l'échelle d'une tontine individuelle au sein d'un même tenant — non confirmé par aucune source (un tenant `organization_type=association` pourrait en théorie gérer à la fois des tontines et des mutuelles internes, ce qui rendrait `Tontine.type` non redondant).

### Option B — Conserver Tontine.type comme attribut légitime, distinct de organization_type

Le PO confirme que `Tontine.type` répond à un besoin réel et distinct (une tontine peut avoir une nature propre, indépendante du type d'organisation de son tenant), et demande que ce champ soit ajouté au dictionnaire physique (action sur le fichier, hors périmètre de ce mandat).

- **Avantages** : aucun changement de code ; comble un gap de spécification plutôt que de retirer une fonctionnalité déjà utilisée.
- **Inconvénients** : les deux vocabulaires (`Tontine.type` à 4 valeurs, `organization_type` à 7 valeurs) resteraient durablement proches mais non identiques, sans qu'aucune règle ne documente s'ils doivent rester synchronisés ou évoluer indépendamment.

### Option C — Fusionner le vocabulaire avec organization_type sans fusionner les champs

`Tontine.type` est conservé comme champ séparé, mais son vocabulaire est aligné strictement sur le sous-ensemble pertinent de `tenants.organization_type` (retrait de `mutuelle` ou ajout à `organization_type`, à trancher par le PO), pour éviter deux énumérations divergentes décrivant des concepts voisins.

- **Avantages** : réduit la confusion terminologique sans toucher à la présence du champ lui-même.
- **Inconvénients** : nécessite malgré tout une action sur `tenants.organization_type` (dictionnaire, hors périmètre direct de `tanzen-frontend` seul si ce champ est aussi utilisé ailleurs) pour que les deux vocabulaires convergent proprement.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Changement de code | Retrait (5 seeds + usages UI à vérifier) | Aucun | Aucun sur `Tontine`, potentiel sur `organization_type` |
| Comble le gap de spécification | En le neutralisant | Oui (demande une mise à jour dictionnaire) | Oui, avec harmonisation |
| Risque de régression | Modéré (dépend des usages UI non vérifiés dans ce dossier) | Nul | Nul côté `Tontine` |
| Résout la divergence de vocabulaire (4 vs 7 valeurs) | N/A (champ supprimé) | Non | Oui |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Aucune source ne permet de trancher entre ces trois options — signalé comme un vide de spécification complet, pas une préférence. Point factuel à vérifier avant toute implémentation, quelle que soit l'option retenue : les usages UI réels de `Tontine.type` (au-delà des 5 enregistrements seed) n'ont pas été inventoriés exhaustivement par ce dossier ni par l'audit d'origine.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Retirer Tontine.type (doublon non voulu de organization_type)
[ ] OPTION B — Conserver comme attribut légitime distinct, à faire spécifier au dictionnaire
[ ] OPTION C — Fusionner le vocabulaire avec organization_type sans fusionner les champs
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-05 — Réouverture d'un cycle CLÔTURÉ

*Reprise sans modification de `docs/PHASE_08_DECISIONS_A_VALIDER.md` §1, reformulée pour validation.*

### Question PO

Un `TontineCycle` au statut `CLOSED` doit-il pouvoir être rouvert, et si oui, sous quelles conditions (rôle, motif obligatoire, traçabilité) ?

### Faits établis

`VALID_CYCLE_TRANSITIONS` (`tontines.service.ts:13-18`) ne définit aucune transition sortante depuis `statusClosed`. Avant Phase 8, le code traitait à tort une clôture comme réversible via le même bouton qu'une reprise de suspension — bug corrigé (`PHASE_08_TONTINES.md:76`). Aucun Use Case classifié ne nomme de réouverture, ni distinguée par statut d'origine ni générique ; `UCX2-04 → UCX2-05` (« Clôturer » → « Archiver ») suggère au contraire que la clôture mène vers une finalité, pas vers un état réversible (`PHASE_08_DECISIONS_A_VALIDER.md` §1).

### Sources d'autorité

`docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (cité par `PHASE_08_DECISIONS_A_VALIDER.md` §1) — aucun UC ne nomme cette transition.

### Sources en conflit

Aucune — absence totale de spécification, pas de contradiction entre sources.

### Option A — Aucune réouverture possible (statu quo)

`CLOSED` reste un état terminal sans transition sortante, tel qu'implémenté depuis Phase 8.

- **Avantages** : aucun changement de code ; cohérent avec l'enchaînement `«include»` `UCX2-04→UCX2-05` (clôture → archivage).
- **Inconvénients** : aucun recours en cas de clôture accidentelle.

### Option B — Réouverture possible, avec conditions

Une transition `CLOSED → OPEN` (ou un nouvel état intermédiaire) est ajoutée, gardée par une permission dédiée et/ou un motif obligatoire tracé.

- **Web** : nouvelle entrée dans `VALID_CYCLE_TRANSITIONS`, nouveau bouton `CycleDetail`, potentiellement un champ de motif à ajouter à `CycleActivity`.
- **RBAC** : à spécifier — réutiliser `cycles.manage` ou créer une permission plus restrictive (ex. `cycles.reopen`) — non tranché par aucune source.
- **Risques** : sans motif obligatoire ni traçabilité renforcée, réintroduit le risque ambigu que Phase 8 a justement corrigé (confusion entre reprise de suspension et réouverture de clôture).

### Option C — Réouverture possible sans conditions particulières

Simple réactivation de la transition `CLOSED → OPEN`, sans garde supplémentaire au-delà de `cycles.manage` déjà existant.

- **Avantages** : le plus simple à implémenter.
- **Inconvénients** : réintroduit une partie du bug corrigé en Phase 8 (aucune distinction visible entre une reprise « normale » depuis `SUSPENDED` et une réouverture d'un cycle réellement clôturé) — l'audit et `PHASE_08_TONTINES.md` traitent explicitement cette distinction comme la correction principale de la phase.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Cohérent avec la correction Phase 8 | Oui | Oui, si distincte de la reprise `SUSPENDED→OPEN` | Non — réintroduit l'ambiguïté corrigée |
| Nécessite une nouvelle permission | Non | À trancher | Non |
| Traçabilité d'une réouverture | N/A | Oui, si motif tracé | Aucune |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Reprise de l'analyse déjà faite par `PHASE_08_DECISIONS_A_VALIDER.md` §1 : aucune source ne réclame cette fonctionnalité ; sa nécessité dépend d'un besoin métier réel (ex. fréquence des clôtures accidentelles) non documenté à ce jour.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Aucune réouverture possible (statu quo)
[ ] OPTION B — Réouverture possible, avec conditions (permission/motif/traçabilité)
[ ] OPTION C — Réouverture possible sans conditions particulières
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-06 — Permission de création de cotisation

*Reprise sans modification de `docs/PHASE_08_DECISIONS_A_VALIDER.md` §2, reformulée pour validation.*

### Question PO

Quelle permission RBAC ajouter pour débloquer la création d'une cotisation (`tontine_contributions`), sachant que ce gap partage sa cause racine avec l'absence de `transactions.create` déjà identifiée en Phase 7 ?

### Faits établis

Le catalogue RBAC (`src/mocks/rbac.mocks.ts:58-67`) ne porte que `contributions.read` — aucune variante `create`/`manage` pour les cotisations, ni côté Finance (Phase 7) ni côté Tontine (Phase 8). Conséquence directe : ni `CycleContribution` (`tontines.service.ts`) ni `Contribution` (`finance.service.ts`, à vérifier séparément mais aucune fonction d'écriture n'a été trouvée non plus lors de la relecture pour ce dossier — voir D-TON-01) n'ont de fonction de création.

### Sources d'autorité

`PHASE_08_DECISIONS_A_VALIDER.md` §2, `PHASE_07_DECISIONS_A_VALIDER.md` §1 (gap analogue, non relu intégralement dans ce dossier mais cité comme même cause racine).

### Sources en conflit

Aucune.

### Option A — contributions.create (une seule permission, partagée Finance/Tontine)

Une permission unique couvre la création de cotisation, quelle que soit l'entité d'écriture retenue (dépend aussi de D-TON-01).

- **Avantages** : cohérence avec le nom déjà existant `contributions.read` ; résout Phase 7 et Phase 8 simultanément si les deux domaines convergent (D-TON-01 Option A).
- **Inconvénients** : si D-TON-01 retient l'Option B/C (entités séparées), une permission unique pourrait autoriser l'écriture d'un côté sans l'autre selon l'implémentation — à préciser à ce moment-là.

### Option B — Deux permissions distinctes (finance et tontine)

`transactions.create`/`financeContributions.create` d'un côté, `tontineContributions.create` (ou équivalent) de l'autre.

- **Avantages** : granularité RBAC plus fine, cohérent avec une architecture où `CycleContribution` reste distincte de `Contribution` (D-TON-01 Option B/C).
- **Inconvénients** : deux permissions à maintenir pour un même geste métier du point de vue de l'utilisateur final (« enregistrer une cotisation »).

### Option C — Reporter la décision jusqu'à D-TON-01

Ne pas trancher le nom/la portée de la permission avant que D-TON-01 (réconciliation Contribution/CycleContribution) ne soit validée, puisque le nombre d'entités d'écriture concernées en dépend directement.

- **Avantages** : évite de nommer une permission pour une architecture qui pourrait changer.
- **Inconvénients** : bloque la levée du gap `BLOQUANT` déjà identifié en Phase 7 et confirmé en Phase 8 jusqu'à ce que D-TON-01 soit lui-même validé.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Résout Phase 7 + Phase 8 simultanément | Oui, si D-TON-01=A | Oui, indépendamment de D-TON-01 | Différé |
| Dépend de D-TON-01 | Partiellement | Non | Totalement |
| Granularité RBAC | Faible | Élevée | N/A |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel : cette décision est structurellement liée à D-TON-01 — un choix définitif sur la permission gagnerait à être validé après ou en même temps que D-TON-01, pas avant.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — contributions.create (permission unique, partagée)
[ ] OPTION B — Deux permissions distinctes (finance / tontine)
[ ] OPTION C — Reporter jusqu'à D-TON-01
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-07 — Calendrier des échéances internes au cycle

*Reprise sans modification de `docs/PHASE_08_DECISIONS_A_VALIDER.md` §3, reformulée pour validation.*

### Question PO

Une entité calendrier des échéances internes à un `TontineCycle` (cotisations attendues à intervalles réguliers entre `start_date` et `end_date`) est-elle nécessaire ?

### Faits établis

`TontineCycle` ne porte que `startDate`/`endDate` — aucune structure d'échéances récurrentes. `Tontine.frequency` (`DAILY/WEEKLY/MONTHLY/CUSTOM`, canonique) suggère qu'un calendrier dérivé serait techniquement calculable, mais **aucun UC ni classe ne spécifie une entité calendrier explicite**, ni son interaction avec `tontine_contributions` (`PHASE_08_DECISIONS_A_VALIDER.md` §3). Notamment : `Tontine.frequency` lui-même est absent du code actuel (audit §4) — un calendrier dérivé ne pourrait pas être calculé aujourd'hui même si l'entité existait, sans que `frequency` ne soit d'abord implémenté sur `Tontine`.

### Sources d'autorité

Aucune — MODEL_GAP au niveau spécification.

### Sources en conflit

Aucune — absence totale, pas de contradiction.

### Option A — Aucun calendrier, suivi par cotisation isolée uniquement

Statu quo : le suivi des cotisations reste ponctuel (chaque `tontine_contributions` est indépendante), sans notion d'échéance attendue ni de retard calculable automatiquement.

- **Avantages** : aucun changement de code.
- **Inconvénients** : aucun rappel ni suivi de retard par échéance n'est possible.

### Option B — Calendrier dérivé (calculé, non persisté)

Un calendrier d'échéances est calculé à la volée à partir de `Tontine.frequency` + `TontineCycle.startDate`/`endDate`, sans nouvelle entité persistée.

- **Préalable** : nécessite d'abord que `Tontine.frequency` soit implémenté côté Web (actuellement absent, audit §4) — dépendance non triviale.
- **Avantages** : pas de nouvelle table/entité à créer ni à synchroniser.
- **Inconvénients** : ne permet pas de tracer un rappel envoyé ou un statut de retard propre à une échéance donnée (recalculé à chaque affichage, sans état persistant).

### Option C — Entité calendrier persistée

Une nouvelle entité (ex. `CycleSchedule`/`ExpectedContribution`) matérialise chaque échéance attendue, liée à `TontineCycle` et potentiellement à `CycleMember`.

- **Avantages** : permet un suivi de retard par échéance, des rappels ciblés.
- **Inconvénients** : entité entièrement à spécifier (aucune source ne propose de schéma) — inventer ses champs serait une invention de structure non sourcée, à faire spécifier par le PO/le dictionnaire avant toute conception.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Nouvelle entité | Non | Non | Oui, à spécifier |
| Dépend de `Tontine.frequency` (absent du code) | Non | Oui | Oui, si dérivée de la fréquence |
| Permet suivi de retard par échéance | Non | Partiel (recalculé, pas tracé) | Oui |
| Effort | Nul | Modéré (+ préalable frequency) | Élevé (schéma à spécifier) |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel : quelle que soit l'option retenue au-delà du statu quo, l'absence de `Tontine.frequency` dans le code actuel (audit §4, D-TON non couvert séparément ici car déjà classé 🔴 ABSENT sans ambiguïté par l'audit) est un préalable structurel — signalé, pas résolu par ce dossier.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Aucun calendrier, suivi par cotisation isolée uniquement
[ ] OPTION B — Calendrier dérivé (calculé, non persisté)
[ ] OPTION C — Entité calendrier persistée (schéma à spécifier séparément)
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## D-TON-08 — Workflow demande/validation d'adhésion à un cycle

*Reprise sans modification de `docs/PHASE_08_DECISIONS_A_VALIDER.md` §4, reformulée pour validation.*

### Question PO

`UCX1-10` (« Participer aux tontines », membre-initié) et `UCX2-03` (« Inscrire les membres », administrateur) forment-ils une séquence demande→validation, ou deux chemins indépendants ?

### Faits établis

Seul `UCX2-03` (inscription administrative directe) est implémenté (`addCycleMember`, `tontines.service.ts:63-70`). `CycleMember.status` actuel (`statusActive`/`statusInactive`, 2 valeurs — déjà signalé divergent du canonique 4 valeurs par l'audit §6) ne porte aucun état intermédiaire de type « en attente de validation ». Ajouter un tel statut sans confirmation serait une invention de statut, explicitement interdite (`PHASE_08_DECISIONS_A_VALIDER.md` §4).

### Sources d'autorité

`docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (UCX1-10, UCX2-03) — deux UC distincts, sans séquence `«include»`/`«extend»` documentée entre eux dans les sources consultées.

### Sources en conflit

Aucune — deux UC réels, relation entre eux non spécifiée (absence, pas contradiction).

### Option A — Deux chemins indépendants

`UCX1-10` et `UCX2-03` restent des parcours séparés : un membre peut être inscrit directement par un administrateur (déjà implémenté), et/ou une future fonctionnalité d'auto-candidature pourrait exister sans jamais passer par un état intermédiaire commun.

- **Avantages** : n'exige pas de nouveau statut `CycleMember` ; cohérent avec l'implémentation actuelle telle quelle.
- **Inconvénients** : une future implémentation de `UCX1-10` devrait alors créer directement un `CycleMember` actif sans validation — potentiellement pas ce que « Participer aux tontines » signifie réellement pour un membre-initié.

### Option B — Séquence demande → validation

Un membre soumet une demande (`UCX1-10`), qu'un administrateur approuve ou rejette (`UCX2-03` devient l'étape de validation, pas d'inscription directe). Nécessite un état intermédiaire sur `CycleMember.status` (ex. `PENDING`/`REQUESTED`, non dans les 4 valeurs canoniques `ACTIVE/INACTIVE/EXITED/SUSPENDED`) ou une entité de demande séparée.

- **Avantages** : cohérent avec un modèle de gouvernance où l'adhésion à un cycle n'est pas unilatérale.
- **Inconvénients** : nécessite soit d'étendre l'enum canonique déjà verrouillé (`CycleMember.status`, Phase 2 sujet 18d) au-delà de ses 4 valeurs actuelles — ce qui romprait le verrouillage existant — soit une entité de demande séparée, non spécifiée par aucune source.

### Option C — Statu quo (inscription administrative uniquement, UCX1-10 non implémenté)

Comportement actuel : seul `UCX2-03` existe ; `UCX1-10` reste non implémenté jusqu'à nouvelle décision.

- **Avantages** : aucun changement de code.
- **Inconvénients** : `UCX1-10` reste durablement non couvert.

### Analyse comparative

| Critère | Option A | Option B | Option C |
|---|---|---|---|
| Nécessite un nouveau statut hors de l'enum verrouillé | Non | Oui (ou une entité séparée) | Non |
| Couvre UCX1-10 | Oui, mais sans validation | Oui, avec validation | Non |
| Changement de code | Futur, si UCX1-10 implémenté | Futur, plus complexe | Aucun |

### Recommandation

> 🟡 RECOMMANDATION — EN ATTENTE DE VALIDATION PO

Élément factuel : l'Option B est la seule qui donne un sens complet à « Participer aux tontines » comme un acte du membre distinct d'une inscription administrative, mais elle seule requiert de rouvrir l'enum `CycleMember.status` déjà verrouillé (Phase 2, sujet 18d) — signalé comme un coût structurel, pas un obstacle disqualifiant.

### Statut

> 🟡 EN ATTENTE DE VALIDATION PO

### Décision PO

```text
[ ] OPTION A — Deux chemins indépendants
[ ] OPTION B — Séquence demande → validation (nécessite un statut CycleMember additionnel)
[ ] OPTION C — Statu quo (UCX1-10 non implémenté)
[ ] AUTRE / À PRÉCISER

Décision PO :


Commentaire :

```

---

## 7. Synthèse

| Décision | Sujet | Origine | Statut |
|---|---|---|---|
| D-TON-01 | Réconciliation Contribution / CycleContribution | Nouvelle (audit) | 🟡 EN ATTENTE |
| D-TON-02 | Ratification de `cycle_number` | Nouvelle (audit) | 🟡 EN ATTENTE |
| D-TON-03 | `draw_type` (ROTATION/AUCTION/RANDOM vs manuel) | Nouvelle (audit) | 🟡 EN ATTENTE |
| D-TON-04 | Provenance de `Tontine.type` | Nouvelle (audit) | 🟡 EN ATTENTE |
| D-TON-05 | Réouverture d'un cycle CLÔTURÉ | `PHASE_08_DECISIONS_A_VALIDER.md` §1 | 🟡 EN ATTENTE |
| D-TON-06 | Permission de création de cotisation | `PHASE_08_DECISIONS_A_VALIDER.md` §2 | 🟡 EN ATTENTE |
| D-TON-07 | Calendrier des échéances internes | `PHASE_08_DECISIONS_A_VALIDER.md` §3 | 🟡 EN ATTENTE |
| D-TON-08 | Workflow demande/validation d'adhésion | `PHASE_08_DECISIONS_A_VALIDER.md` §4 | 🟡 EN ATTENTE |

**Dépendances entre décisions** : D-TON-06 dépend partiellement de D-TON-01 (le nombre d'entités d'écriture concernées par la permission). D-TON-08 dépend de l'enum `CycleMember.status` déjà verrouillé (Phase 2, sujet 18d) — son Option B le remettrait en question. Aucune autre dépendance croisée identifiée.

Aucune décision n'est validée par ce document — toutes restent 🟡 EN ATTENTE DE VALIDATION PO jusqu'à ce que le Product Owner coche une option pour chacune.

---

## 8. Périmètre et modifications

**`tanzen-frontend`** : aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` modifié. Seul artefact créé : `docs/P1_TONTINE_PO_DECISION_VALIDATION.md`.

**`tanzen-backend`, `tanzen-commercial`, `tanzen-mobile`** : NON TOUCHÉS. Aucune analyse, aucune modification, aucune recommandation d'implémentation n'a été produite pour ces trois dépôts — les mentions ci-dessus (Backend/Mobile dans certaines colonnes d'analyse) documentent uniquement un impact futur potentiel, jamais une action engagée par ce mandat.

## 9. Git

```
=== tanzen-frontend ===
?? docs/P1_GOVERNANCE_PHASE_4C4_POST_IMPLEMENTATION_AUDIT.md        (préexistant, sans rapport)
?? docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md                 (mandat précédent, sans rapport avec celui-ci)
?? docs/P1_TONTINE_PO_DECISION_VALIDATION.md                          (ce document)

=== tanzen-backend / tanzen-commercial / tanzen-mobile ===
Non consultés par ce mandat (hors périmètre absolu, cf. §1 du mandat).
```

Aucun commit, aucun push.

FIN DU MANDAT.
