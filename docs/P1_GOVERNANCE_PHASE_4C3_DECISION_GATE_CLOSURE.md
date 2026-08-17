# TANZEN — P1 Governance — Phase 4C-3 — Decision Gate Closure

**Statut : MISSION DOCUMENTATION / GOVERNANCE — AUCUNE IMPLÉMENTATION.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. Aucun service, repository, migration, écran, route, permission, test, modèle ou schéma n'a été créé. `tanzen-mobile`, `tanzen-commercial` et le Backend n'ont pas été touchés. Aucun commit, aucun push. Cette mission ne donne **aucun** GO d'implémentation — celui-ci fait l'objet d'un mandat séparé, « P1 GOVERNANCE — PHASE 4C-3 — IMPLEMENTATION GO », qui n'a pas commencé.

**Note de transparence sur le mandat reçu** : le texte du mandat transmis pour cette mission s'est interrompu au milieu de la formalisation de D-4C3-WEB-03 (section « 5. D-4C3-WEB-03 — IMMUTABILITÉ », après la règle de cycle de vie `Meeting ouvert → Attendance modifiable → clôture → Attendance figées »), avant les sections annoncées pour D-4C3-WEB-04, D-4C3-WEB-05, la structure de rapport détaillée et les règles absolues. Cette mission a formalisé les 5 décisions à partir : (a) du tableau récapitulatif explicite fourni en tête de mandat (§1, « DÉCISIONS PO OFFICIELLEMENT VALIDÉES »), qui donne l'option retenue et le statut 🟢 VALIDÉE pour chacune des 5 décisions sans ambiguïté ; (b) des sections détaillées reçues pour D-4C3-WEB-01 à 03 ; (c) du contenu déjà établi par `docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md` pour les options non redétaillées dans le mandat tronqué (notamment le contenu exact de « D-4C3-WEB-04 Option B » et « D-4C3-WEB-05 Option A »). Aucun détail non fourni par ces sources n'a été inventé : là où le mandat tronqué annonçait un élément sans le préciser (le comportement exact des retransmissions Offline/Outbox pour D-4C3-WEB-04), ce point est signalé **NON CONFIRMÉ** ci-dessous plutôt que complété par supposition.

---

## 1. Objet

Formaliser dans la documentation du projet les 5 décisions PO de la Phase 4C-3 (Governance / Meetings / Attendances), désormais validées, telles que communiquées explicitement par le mandat : mettre à jour `docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md`, clôturer officiellement le Decision Gate, produire ce rapport de clôture, et vérifier qu'aucune contradiction documentaire bloquante ne subsiste sur les 5 sujets concernés.

## 2. Contexte

`docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` (audit read-only) avait identifié 5 décisions ouvertes sur Meeting/Attendance/Governance. `docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md` les avait reformulées en dossier de décision, avec recommandations non validées. Cette mission formalise leur validation par le PO, sans engager la moindre implémentation.

## 3. Les 5 décisions PO validées

### 3.1 D-4C3-WEB-01 — Modèle Meeting

**Décision : Option C — Modèle hybride ciblé.** Conforme à la recommandation du Decision Gate. `Meeting` reçoit uniquement l'ajout ciblé nécessaire à UC02-14 (« Clôturer une réunion ») — un champ `status`. **Cette validation n'élargit pas la décision** : elle n'implique ni alignement strict sur le dictionnaire, ni ajout automatique de `uuid`/`sync_status`/`version`/timestamps, ni refactoring global du modèle `Meeting`, conformément à la limite explicite posée par le mandat (§3 du mandat de clôture). Le vocabulaire exact des valeurs de `status` et ses règles de transition ne sont **pas** fixés par cette validation.

### 3.2 D-4C3-WEB-02 — Attendance

**Décision : Option A — Construire Attendance maintenant.** Cette décision est **distincte** de la recommandation du Decision Gate (qui recommandait l'Option C — arbitrage produit préalable). Le PO a tranché directement l'arbitrage de cadrage produit en faveur d'une implémentation directe. Conséquence explicite : Attendance **entre dans le périmètre d'implémentation** de Phase 4C-3. Conformément au mandat de clôture (§4) : cela ne signifie **pas** que le développement commence dans cette mission — il relève exclusivement du futur mandat IMPLEMENTATION GO.

### 3.3 D-4C3-WEB-03 — Immutabilité Attendance

**Décision : Option A — Attendance immuable après clôture.** Aucune recommandation du Decision Gate n'existait pour ce sujet (absence totale de source documentaire) — décision produit tranchée directement par le PO. Règle métier validée :

```
Meeting ouvert
      ↓
Attendance modifiable selon les règles du cycle
      ↓
clôture du Meeting
      ↓
Attendance figées (immuables)
```

Cette règle dépend de D-4C3-WEB-01 : la notion de « clôture » présuppose le champ `Meeting.status` désormais validé (§3.1). Le mécanisme technique exact de verrouillage (quels champs sont couverts — `status` seul, ou aussi un futur `penalty_amount` — et comment le verrou est appliqué au niveau service) n'est **pas** fixé par cette validation.

### 3.4 D-4C3-WEB-04 — Idempotence Attendance

**Décision : Option B — Idempotence.** Règle associée confirmée : `UNIQUE(meeting_id, member_id)`, avec un comportement d'upsert — une nouvelle saisie de présence pour le même couple `meeting_id`/`member_id` met à jour l'enregistrement existant plutôt que de créer un doublon ou de produire une erreur.

**GAP explicitement signalé** : le mandat de clôture annonçait un « comportement explicitement défini pour les retransmissions Offline/Outbox » sans le préciser (texte du mandat interrompu avant cette précision). **NON CONFIRMÉ** — ce détail n'est pas déduit ni inventé par cette mission. Il doit être spécifié explicitement au lancement du mandat IMPLEMENTATION GO (ex. politique en cas d'écritures concurrentes différées, fenêtre de tolérance de rejeu, articulation avec `sync_status`/`version`).

### 3.5 D-4C3-WEB-05 — RBAC Governance

**Décision : Option A — Conserver les permissions Governance existantes.** Conforme à la recommandation du Decision Gate. Catalogue inchangé : `governance.read`, `governance.create`, `governance.approve`, `governance.update`, `governance.delete`. Aucune permission `meeting.*` ou `attendance.*` n'est créée. La future saisie d'Attendance (§3.2) réutilisera `governance.create`.

---

## 4. Formalisation documentaire — ce qui a été mis à jour

`docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md` a été mis à jour, pour chacune des 5 décisions :
- le bloc `RECOMMANDATION / STATUT` de chaque décision a été changé de « EN ATTENTE DE VALIDATION PO » / « RECOMMANDATION À VALIDER » à « 🟢 VALIDÉE — DÉCISION PO » ;
- la case correspondant à l'option retenue a été cochée (☑) dans le bloc « Décision PO » de chaque section, avec la ligne « Décision PO : » et « Commentaire : » renseignées ;
- le tableau de synthèse PO (§10) reflète les 5 décisions validées ;
- les 11 critères de fermeture (§14) sont désormais cochés ;
- le statut global (§15) est passé de `DECISION GATE = OPEN` à `DECISION GATE = CLOSED` ;
- la recommandation finale (§16) a été réécrite pour signaler les deux points restant à préciser avant le mandat IMPLEMENTATION GO (transitions de `Meeting.status`, comportement exact des retransmissions Offline/Outbox), plutôt que de les laisser implicitement résolus par la validation.

Aucun autre document du projet n'a été modifié — en particulier, `docs/P1_GOVERNANCE_PHASE_4C3_WEB_DECISION_GATE.md` (l'audit original) est laissé strictement intact, car il documente un état des faits à un instant donné, pas une décision ; il conserve sa valeur de preuve historique.

## 5. Vérification — aucune contradiction documentaire bloquante ne subsiste

| Sujet | Contradiction identifiée par le Decision Gate | Résolution apportée par la décision PO |
|---|---|---|
| Statut Attendance (D-4C3-WEB-02) | `PHASE_06_DECISIONS_A_VALIDER.md` (BLOQUANT) vs `COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` (PARTIALLY_IMPLEMENTED, COMPLÉTER sans blocage) — désaccord de cadrage produit, fait sous-jacent non contesté | **Résolue.** Une décision PO explicitement validée est rang 1 de la hiérarchie des sources (`docs/COMPLETE_DATA_DICTIONARY_IMPLEMENTATION_AUDIT.md` §6, repris par le Decision Gate §3 et le dossier PO §4) — elle surclasse le désaccord de cadrage entre les deux documents de rang 5 sans qu'aucun des deux n'ait besoin d'être corrigé rétroactivement. Les deux restent des constats historiques valides pour leur date ; la décision PO (Option A, « construire maintenant ») s'applique pour la suite du projet. |
| Modèle Meeting (D-4C3-WEB-01) | Verrouillage canonique (`PHASE_02_MODELE_CANONIQUE_FINAL.md`, rang 2) établi en comparant le dictionnaire au code de `tanzen-frontend-claude`, pas à `tanzen-frontend` | **Résolue pour le périmètre validé.** La décision PO (Option C) ne prétend pas trancher la conformité totale au verrouillage canonique — elle acte un ajout ciblé (`status` pour UC02-14) sans revendiquer l'alignement complet. Le reste de l'écart (`uuid`/`sync_status`/`version`/timestamps) demeure un écart documenté et assumé, pas une contradiction non résolue — cf. Decision Gate §8 Option C, désormais validée telle quelle. |
| Classification Meetings/Attendances (Member Core vs Governance Module) | Déjà tranchée `NON BLOQUANT — à surveiller` par `PHASE_02_DECISIONS_CANONIQUES.md` sujet 18n avant même le Decision Gate | Non concernée par les 5 décisions de cette clôture — reste `NON BLOQUANT`, aucune action requise. |
| Immutabilité / Idempotence (D-4C3-WEB-03/04) | Absence totale de règle (pas une contradiction entre sources) | **Résolue par décision PO directe** (Option A et Option B respectivement) — l'absence de règle est comblée, pas arbitrée entre deux sources contradictoires. |
| RBAC (D-4C3-WEB-05) | Aucune contradiction réelle identifiée par le Decision Gate (l'écart apparent 3 vs 5 verbes déclarés était une distinction déclaré/utilisé, pas un conflit) | Non concernée — confirmée sans changement. |

**Conclusion de la vérification** : aucune contradiction documentaire bloquante ne subsiste sur les 5 sujets couverts par cette clôture. Les deux points signalés en §3.4 (retransmissions Offline/Outbox) et rappelés en §7 ci-dessous ne sont pas des contradictions entre sources — ce sont des **gaps de spécification** non comblés par cette mission, à traiter explicitement au mandat suivant.

## 6. Statut du Decision Gate

**DECISION GATE = CLOSED.**

Les 5 décisions (D-4C3-WEB-01 à 05) sont validées par le PO. Conformément au mandat : cette fermeture **ne constitue pas** une Implementation GO, ni Web ni Mobile. Aucune implémentation n'a été engagée par cette mission ni n'est autorisée par elle.

## 7. Points à traiter avant le lancement du mandat IMPLEMENTATION GO

Ces deux points ne bloquent pas la fermeture du Decision Gate (les décisions de principe sont validées) mais doivent être explicitement précisés avant que le développement ne démarre, pour éviter qu'ils ne soient tranchés silencieusement pendant l'implémentation :

1. **Transitions de `Meeting.status`** (D-4C3-WEB-01) : le vocabulaire (`PLANNED/DONE/CANCELLED/POSTPONED`, déjà verrouillé au rang 2 pour ce qui est du nommage) et les règles de transition entre ces valeurs (quel état peut aller vers quel autre) ne sont fixés par aucune décision de cette clôture.
2. **Comportement des retransmissions Offline/Outbox pour Attendance** (D-4C3-WEB-04) : le principe d'idempotence/upsert est validé, mais le comportement exact en cas de rejeu réseau, d'écritures concurrentes différées, ou d'articulation avec `sync_status`/`version` n'a pas été précisé par le mandat reçu — signalé NON CONFIRMÉ, pas déduit.

## 8. Impact Mobile

`tanzen-mobile` = **NON MODIFIÉ**. La fermeture de ce Decision Gate ne déclenche aucune implémentation Mobile. Le mandat IMPLEMENTATION GO, lorsqu'il sera lancé, devra intégrer les 5 décisions validées ainsi que les 2 points en attente de précision (§7) avant toute conception SQLite/repository/outbox côté Mobile.

## 9. Prochaines étapes

```
Decision Gate CLOSED (cette mission)
          ↓
Précision des 2 points restants (§7) — recommandé avant le mandat suivant
          ↓
Mandat séparé : P1 GOVERNANCE — PHASE 4C-3 — IMPLEMENTATION GO
          ↓
Implémentation Web (Meeting.status, modèle Attendance complet)
          ↓
Conception Mobile (SQLite, repository, service, écrans, outbox)
          ↓
Tests
```

Ce document ne déclenche aucune de ces étapes.

## 10. Fichiers modifiés

    docs/P1_GOVERNANCE_PHASE_4C3_PO_DECISION_VALIDATION.md (mise à jour des 5 décisions : statuts, cases cochées, synthèse, critères de fermeture, statut du gate)

Seul fichier créé par cette mission : `docs/P1_GOVERNANCE_PHASE_4C3_DECISION_GATE_CLOSURE.md` (ce rapport).

Aucun autre fichier modifié. `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` inchangés.

## 11. tanzen-mobile / tanzen-commercial / Backend

    NON MODIFIÉS

## 12. Git

    Aucun commit
    Aucun push
