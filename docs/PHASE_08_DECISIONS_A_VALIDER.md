# TANZEN — Phase 8 : Décisions à valider par le Product Owner

**Statut : accompagne une mission d'implémentation réelle.** Les sujets ci-dessous n'ont **pas** été implémentés dans le cadre de la Phase 8 (`docs/PHASE_08_TONTINES.md`), conformément à la règle absolue « ne pas inventer de règle métier, de montant, de fréquence, d'ordre, de méthode de tirage, de pénalité, de calendrier ou de statut ». Seules les décisions réellement non résolues figurent ici — aucune n'a été ajoutée pour remplir le document.

---

## Sujets BLOQUANT

### 1. Réouverture d'un cycle CLÔTURÉ

- **Problème** : le code avant cette phase permettait de « rouvrir » indifféremment un cycle SUSPENDU ou CLÔTURÉ (même bouton, même transition vers `statusOpen`) — c'est le point explicitement signalé par le mandat de cette phase (§5). Le texte de confirmation existant (`closeCycleConfirm: '...peut être annulée en le rouvrant'`) affirmait même cette réversibilité comme acquise.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` — seuls `UCX2-14 « Ouvrir le cycle »` (DRAFT→OPEN) et `UC40-04`/`UCX2-04 « Clôturer le cycle(s) »` (OPEN→CLOSED) sont des Use Cases confirmés pour le cycle de vie du cycle ; **aucun UC ne nomme une réouverture**, ni distinguée par statut d'origine ni générique. `UCX2-04 → UCX2-05 « Archiver la tontine »` (enchaînement `«include»`) suggère au contraire que la clôture mène vers une finalité (archivage), pas vers un état réversible.
- **Analyse** : la distinction demandée par le mandat (SUSPENDU vs CLÔTURÉ) n'a pas de réponse dans les sources — aucune des deux n'est explicitement réouvrable par un UC nommé. `SUSPENDU→OPEN` (reprise) a été conservée dans cette phase par nécessité structurelle minimale : le statut `SUSPENDED` fait partie de la liste validée à 4 valeurs (§3 du mandat), et un statut qui ne serait accessible depuis aucune transition de sortie n'aurait pas de sens fonctionnel — ce n'est pas une invention de règle métier mais la mécanique minimale requise pour qu'un statut déjà validé reste utilisable. `CLOSED→*` en revanche n'a aucune nécessité structurelle comparable et aucune source ne le confirme — désormais bloqué à la fois côté UI (bouton retiré) et côté service (`updateCycleStatus` rejette la transition).
- **Décision proposée** : **Question à trancher : un cycle CLÔTURÉ doit-il pouvoir être rouvert, et si oui, sous quelles conditions (rôle, motif obligatoire, traçabilité) ?** Si le PO confirme un besoin réel (ex. clôture accidentelle), un nouveau UC devra être spécifié plutôt que de réutiliser silencieusement la transition `SUSPENDED→OPEN`.
- **Impact frontend** : aucun aujourd'hui — le comportement précédent (bouton « Rouvrir » sur un cycle clôturé) a été retiré, pas remplacé par un blocage muet : `CycleDetail` n'affiche simplement plus de bouton de transition sur un cycle CLOSED.
- **Statut** : **BLOQUANT** (au sens : bloque l'implémentation d'une fonctionnalité potentiellement attendue, pas le fonctionnement de ce qui a été livré).

### 2. Enregistrer une cotisation (`TontineContribution`)

- **Problème** : UC02-09 (« Enregistrer une cotisation »), UCX2-09 (« Enregistrer les cotisations en espèces ») et UCX2-10 (« Contrôler les cotisations ») sont des Use Cases confirmés, mais **aucune permission RBAC** ne couvre la création d'une cotisation — le catalogue (`src/mocks/rbac.mocks.ts`) n'expose que `contributions.read` (domaine Finance), jamais `contributions.create`, ni côté Finance ni côté Tontines.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC02-09, UCX2-09/10 ; lecture directe du catalogue RBAC (même gap déjà documenté pour les Transactions en `docs/PHASE_07_DECISIONS_A_VALIDER.md` §1).
- **Analyse** : créer une permission `contributions.create` résoudrait le blocage mais constituerait une invention de permission, explicitement interdite. C'est un doublon exact du gap déjà identifié en Phase 7 pour les Transactions — même cause, même famille de décision.
- **Décision proposée** : **Question à trancher : quelle permission ajouter au catalogue RBAC pour l'enregistrement des cotisations ?** Cette décision devrait être prise conjointement avec le sujet équivalent de Transactions (`docs/PHASE_07_DECISIONS_A_VALIDER.md` §1), pour cohérence du catalogue.
- **Impact frontend** : l'onglet Contributions de `CycleDetail` reste en lecture seule (`ContributionRows`, déjà existant) — aucun bouton de création n'a été ajouté.
- **Statut** : **BLOQUANT**.

---

## Sujets nécessitant une entité non spécifiée (pas d'invention)

### 3. Calendrier des échéances internes au cycle

- **Problème** : `TontineCycle` ne porte que `start_date`/`end_date` — pas de structure représentant les échéances récurrentes internes (ex. une cotisation attendue chaque mois entre le début et la fin du cycle). Le mandat de cette phase (§8) demande explicitement de ne pas transformer automatiquement ces deux dates en calendrier détaillé, ni d'ajouter arbitrairement une nouvelle structure.
- **Sources** : `Tontine.frequency` (`daily/weekly/monthly`, confirmé canonique par `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §2.1) existe et suggère qu'un calendrier dérivé serait techniquement calculable, mais aucun UC ni classe ne spécifie une entité calendrier explicite, ni la façon dont elle interagirait avec `TontineContribution`.
- **Statut** : **CALENDAR ENTITY REQUIRED** — non inventée. Si un calendrier d'échéances est nécessaire (rappels, suivi de retard par échéance plutôt que par cotisation isolée), une spécification dédiée est un préalable.

### 4. Workflow demande → validation d'adhésion à un cycle

- **Problème** : `UCX1-10 « Participer aux tontines »` (acteur Candidat/Membre) et `UCX2-03 « Inscrire les membres »` (acteur Administrateur Tenant) sont deux Use Cases distincts touchant `CycleMember`, sans qu'aucune source ne précise s'ils forment une séquence (un membre demande → un administrateur valide) ou deux chemins indépendants (auto-inscription vs inscription administrative directe).
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UCX1-10, UCX2-03 ; `CycleMember.status` actuel (`'statusActive'|'statusInactive'`, 2 valeurs) ne porte aucun état intermédiaire de type « en attente de validation ».
- **Analyse** : ajouter un statut `pending`/`requested` sans confirmation serait une invention de statut, explicitement interdite (§3 du mandat : « ne pas ajouter de statut sans source »).
- **Décision implémentée à défaut** : seul le chemin non ambigu (UCX2-03, inscription directe par l'administrateur) a été construit dans cette phase (§7 du rapport). Le chemin membre-initié (UCX1-10) n'a pas été implémenté.
- **Statut** : **DECISION REQUIRED** si un vrai parcours de demande côté membre est attendu — sinon, l'inscription administrative directe déjà livrée peut suffire.

---

## Hors périmètre (rappel, pas une nouvelle décision)

- **`TontinePosition`/« Acheter une tontine »** (UC02-11, UCX2-18) — déjà bloquant depuis `docs/PHASE_02_MODELE_CANONIQUE_FINAL.md` §7 point 1 ; non relitigé, conformément à la consigne explicite de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`.
- **`TontineBid`/tirage par enchère** — capacité de schéma dormante, aucun UC ne l'exerce (confirmé par `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §9.2), cohérent avec la règle source « le tirage est manuel ». Non implémenté.
- **Méthode de sélection du gagnant** — non inventée : la déclaration du gagnant construite dans cette phase est une sélection **manuelle** par l'administrateur, jamais un algorithme (aléatoire ou pondéré), conformément à « le tirage est manuel ».

---

## Synthèse

2 sujets **BLOQUANT** (réouverture d'un cycle clôturé, enregistrement de cotisation — ce dernier partageant sa cause racine avec le sujet Transactions de la Phase 7), 2 sujets nécessitant une entité ou un statut non spécifié (calendrier, workflow d'adhésion). Aucun de ces 4 sujets n'a été résolu par supposition — chacun requiert un arbitrage produit explicite avant toute implémentation.
