# P1 GLOBAL FISCAL YEAR — DECISION GATE CLOSURE

**Statut : MISSION DOCUMENTATION — AUCUNE IMPLÉMENTATION.** Ce document ne modifie aucun fichier de `src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/`. Aucune migration, table, colonne, relation, permission, service, repository, route, écran n'a été créé. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` n'ont pas été touchés. Aucun commit, aucun push. Cette mission ne donne **aucun** GO d'implémentation.

---

## 1. Executive Summary

**6 / 6 décisions PO validées.**

**Decision Gate = CLOSED.**

**Implementation GO = NON DÉMARRÉE.**

Les 6 décisions formalisées dans `docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md` sont validées par le PO. Contrôle de cohérence effectué (§4 ci-dessous) : les 6 décisions sont mutuellement compatibles, sans contradiction résiduelle entre elles. Une décision (D-FY-03) confirme un comportement déjà implémenté et testé ; les 5 autres (D-FY-01, 02, 04, 05, 06) comblent chacune un gap explicitement identifié par `docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md`, sans qu'aucune ne le contredise. Une tension documentaire mineure est signalée en §5 (texte UI `closeFiscalYearConfirm` actuel, qui affirme l'irréversibilité de la clôture — deviendra factuellement inexact une fois D-FY-05 implémentée).

## 2. Audit source

`docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md` — non modifié, non corrigé silencieusement par cette clôture. Ses constats (MODEL GAPS §20, divergences §19, décisions requises §22) sont ceux repris et tranchés par les 6 décisions ci-dessous, sans exception et sans ajout de sujet non couvert par l'audit ou par le mandat de cette clôture.

## 3. Six décisions validées

| ID | Sujet | Choix retenu | Règle résultante | Impact / gap comblé |
|---|---|---|---|---|
| D-FY-01 | Création | Option A | `createFiscalYear` réel, distinct de l'ouverture ; ne crée pas de Tenant, ne clôture ni ne copie rien automatiquement | Comble le MODEL GAP 🔴 le plus significatif de l'audit (§6, §20) — aucune fonction de création n'existe aujourd'hui |
| D-FY-02 | Périmètre | Option C | Classification individuelle par entité (`PERMANENT`/`TENANT-SCOPED`/`FY-SCOPED`/`FY-DERIVED`/`DECISION_REQUIRED`) ; pas d'ajout automatique de `fiscalYearId` | Cohérent avec l'absence totale de `fiscalYearId` hors Settings constatée (audit §12) ; la classification détaillée reste différée |
| D-FY-03 | OPEN/CURRENT | Option B | `status` et `isCurrent` restent deux concepts distincts ; plusieurs `OPEN` possibles, un seul `CURRENT` | **Déjà implémenté et testé** (`settings.service.ts:40`, `settings.service.test.ts:53-56`) — cette décision valide le comportement existant, ne le change pas |
| D-FY-04 | RBAC | Option A | `fiscalYears.read` (consultation) et `fiscalYears.manage` (création/ouverture/clôture/administration) restent séparées ; `fiscalYears.read` doit cesser d'être une permission morte | Comble le gap DEAD PERMISSION constaté (audit §16) — la séparation existe déjà dans le catalogue, seul son câblage effectif manque |
| D-FY-05 | Réouverture | Option C | `CLOSED → demande → justification obligatoire → autorisation → OPEN → traçabilité` ; jamais automatique | Comble l'absence totale de réouverture constatée (audit §7) ; mécanisme d'approbation non détaillé — voir §5 |
| D-FY-06 | Traçabilité | Option C | `CREATE/OPEN/CLOSE/REOPEN` tracés dans `audit_logs` (`tenantId, fiscalYearId, action, fromStatus, toStatus, performedBy, performedAt, reason`) | Comble l'absence totale de traçabilité constatée (audit §4, §17) — aucun champ d'audit n'existe sur `FiscalYear` aujourd'hui |

## 4. Cohérence inter-décisions

**D-FY-01 × D-FY-03** — VÉRIFIÉ COHÉRENT. D-FY-01 exige explicitement que la création d'un exercice ne clôture pas automatiquement les exercices précédents ; D-FY-03 confirme que plusieurs exercices `OPEN` peuvent coexister. Les deux décisions se renforcent : créer un nouvel exercice (probablement `upcoming`, puis ouvert séparément — voir §5) n'a aucune raison de modifier le `status` des exercices déjà `OPEN`, exactement comme `openFiscalYear` le fait déjà aujourd'hui pour la transition existante (§3, D-FY-03).

**D-FY-03 × D-FY-05** — COHÉRENT AVEC UNE AMBIGUÏTÉ RÉSIDUELLE SIGNALÉE (non résolue par cette clôture, voir §5). Le principe général est respecté : la réouverture d'un exercice `CLOSED` ne doit pas violer l'invariant « un seul `CURRENT` ». Ce qui n'est **pas** précisé par le texte des 6 décisions : un exercice rouvert (`CLOSED → OPEN`) devient-il automatiquement `CURRENT` (ce qui exigerait de retirer `isCurrent` à l'exercice actuellement courant, par symétrie avec `openFiscalYear`), ou reste-t-il `OPEN`/`isCurrent=false` jusqu'à une action distincte ? Aucune des deux décisions ne tranche ce point — signalé comme point technique requis (§5), pas résolu ici par extrapolation.

**D-FY-05 × D-FY-06** — VÉRIFIÉ COHÉRENT. D-FY-06 liste explicitement `REOPEN` parmi les actions traçables et prévoit un champ `reason` — directement aligné avec l'exigence de justification obligatoire de D-FY-05. Aucune tension.

**D-FY-02** — VÉRIFIÉ COHÉRENT avec lui-même et avec l'audit : la décision interdit explicitement la règle « toutes les entités possèdent `fiscalYearId` » ; aucune des 5 autres décisions ne présuppose une telle règle généralisée. Aucune décision ci-dessus ne classe même partiellement un domaine métier (Finance, Tontine, etc.) — cette classification reste entièrement ouverte, conformément à D-FY-02 elle-même.

**Aucune contradiction bloquante identifiée entre les 6 décisions.**

## 5. Points restant à préciser

Ces points ne remettent pas en cause la fermeture du Decision Gate — ils sont des détails techniques ou des décisions de portée plus fine à trancher explicitement au lancement d'IMPLEMENTATION GO, pas de nouvelles décisions architecturales majeures. Classés selon leur nature :

### Création (D-FY-01) — `TECHNICAL DETAIL REQUIRED`
- Format exact du nom/`label` d'un nouvel exercice (libre, généré, contraint ?).
- Calcul de `startDate`/`endDate` par défaut (année civile stricte ? configurable par tenant ?).
- Validation des chevauchements entre exercices d'un même tenant (aucune règle de non-chevauchement n'existe dans le modèle actuel — `startDate`/`endDate` ne sont contraints par aucun CHECK, ni dans le code ni dans un document consulté).
- Politique de génération de l'année/numérotation (un exercice `upcoming` est-il créé automatiquement à la clôture du précédent, ou uniquement à la demande explicite d'un administrateur ?).

### CURRENT (D-FY-03) — `TECHNICAL DETAIL REQUIRED` / `DECISION REQUIRED`
- Mécanisme exact de sélection du `CURRENT` parmi plusieurs exercices `OPEN` — `openFiscalYear` actuel n'opère que depuis `status='upcoming'` ; le comportement lorsqu'on souhaite rendre `CURRENT` un exercice déjà `OPEN` (parmi plusieurs) n'est pas défini par les 6 décisions. **`DECISION REQUIRED`**.
- Comportement lorsqu'un FY devient `CURRENT` — aucune donnée d'aucun autre domaine n'est aujourd'hui impactée (cohérent avec D-FY-02), donc « devenir CURRENT » n'a aujourd'hui d'effet que sur `FiscalYear` lui-même — à confirmer que cela reste vrai tant que D-FY-02 n'a pas classifié de domaine en `FY-SCOPED`/`FY-DERIVED`.
- Gestion d'un Tenant sans `CURRENT` — déjà un état atteignable aujourd'hui (`closeCurrentFiscalYear` sans réouverture immédiate, audit §7) ; aucune des 6 décisions ne précise si cet état doit rester temporaire/toléré ou être bloqué par une règle produit (ex. empêcher la clôture si aucun exercice `upcoming` n'existe pour prendre la suite). **`DECISION REQUIRED`**.

### Réouverture (D-FY-05) — `DECISION REQUIRED`
- Qui peut autoriser la réouverture — `fiscalYears.manage` (déjà existante) suffit-elle, ou une permission plus restrictive (ex. `fiscalYears.reopen`, un rôle distinct) est-elle requise pour une action explicitement qualifiée d'« exceptionnelle » ? Non tranché par D-FY-04 ni D-FY-05.
- Approbation simple ou double (un seul approbateur suffit, ou un circuit à deux validateurs est requis, par analogie avec des workflows d'approbation déjà observés ailleurs dans le projet pour d'autres domaines) — non spécifié.
- Format exact de la justification (texte libre, catégories prédéfinies, longueur minimale) — non spécifié.
- Durée maximale éventuelle d'une réouverture (l'exercice rouvert repasse-t-il automatiquement à `CLOSED` après un délai, ou reste-t-il ouvert indéfiniment jusqu'à une nouvelle clôture manuelle ?) — non spécifié, et le mandat ne demande pas d'inventer cette règle.
- Conséquence sur `isCurrent` d'un exercice rouvert — voir l'ambiguïté déjà signalée en §4 (D-FY-03 × D-FY-05).
- **Conséquence documentaire directe** : le texte de confirmation UI actuel `closeFiscalYearConfirm` (`src/locales/fr/index.ts:190` : *« Cette action ne peut pas être annulée depuis cet écran »*) deviendra factuellement inexact dès que D-FY-05 sera implémentée — à mettre à jour explicitement à l'Implementation GO, pas silencieusement ni par cette clôture.

### Audit (D-FY-06) — `TECHNICAL DETAIL REQUIRED`
- Schéma exact de `audit_logs` (table déjà existante pour d'autres domaines ? à vérifier au moment de l'implémentation — non confirmé par cet audit, qui n'a trouvé aucun fichier `src/mocks/audit/` mentionnant « fiscal », mais n'a pas audité le schéma complet d'`audit_logs` lui-même, hors périmètre de l'audit Fiscal Year).
- Noms d'action définitifs (`CREATE`/`OPEN`/`CLOSE`/`REOPEN` sont donnés comme intitulés indicatifs par le mandat — à confirmer comme valeurs canoniques exactes, cohérentes avec la casse/convention déjà utilisée par `audit_logs` pour d'autres domaines, si elle existe).
- Politique de conservation (durée, purge éventuelle) — non spécifiée.
- Affichage de l'historique d'audit à l'utilisateur (écran dédié ? intégré à l'écran Fiscal Years existant ?) — non spécifié.

### FY-scoping par domaine (D-FY-02) — `DECISION REQUIRED` (par domaine, aucun n'est encore classifié)
- Finance (candidat le plus naturel selon l'intention documentée dans `fiscal-years.ts:1-5`, mais non tranché).
- Tontine, Loans, Governance, Members, Reports, Analytics — aucun n'a été classifié, aucune source consultée ne fournit d'élément pour le faire à leur place.

**Aucun des points ci-dessus n'a été inventé ou tranché par cette clôture** — ils sont listés strictement parce que le mandat de cette mission demande de les identifier explicitement sans les transformer en décisions déjà validées.

## 6. Conditions d'Implementation GO

La fermeture de ce Decision Gate n'autorise, par elle-même, aucune des actions suivantes :
- créer `createFiscalYear` ou toute fonction associée ;
- ajouter des champs à `FiscalYear` (`createdBy`, `closedBy`, etc.) ;
- créer ou modifier `audit_logs` ;
- modifier le RBAC (câblage de `fiscalYears.read`) ;
- créer une fonction `reopenFiscalYear` ;
- modifier `TenantContext`, les routes, l'UI, les mocks ou les tests existants ;
- classifier formellement un quelconque domaine métier comme `FY-SCOPED`.

Un futur mandat **IMPLEMENTATION GO — FISCAL YEAR**, explicitement demandé, devra au minimum :
1. Trancher les points classés `DECISION REQUIRED` en §5 (sélection du `CURRENT` parmi plusieurs `OPEN`, autorisation de réouverture, classification par domaine).
2. Spécifier les points classés `TECHNICAL DETAIL REQUIRED` en §5 (format de création, schéma `audit_logs`, conservation, affichage).
3. Mettre à jour le texte `closeFiscalYearConfirm` en conséquence de D-FY-05.

## 7. GO / NO-GO

**DECISION GATE = CLOSED.** 6/6 décisions PO validées, cohérence inter-décisions vérifiée, aucune contradiction bloquante.

**IMPLEMENTATION GO = NEXT STEP / À PRÉPARER.** La fermeture de ce Gate signifie uniquement que les décisions métier principales sont validées — elle ne constitue **pas** une autorisation d'implémenter. Le lancement effectif du code reste conditionné à un mandat séparé qui devra d'abord clore les points du §5, en particulier les 3 `DECISION REQUIRED` (sélection du `CURRENT` parmi plusieurs `OPEN`, autorisation de réouverture, classification FY-scoping par domaine).

## 8. Impact Backend

`tanzen-backend` = **NON TOUCHÉ**. Le dépôt reste un répertoire vide (cf. `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §18, constat transverse au projet, non ré-audité par cette mission). Aucune implication de schéma backend n'est engagée par cette clôture.

## 9. Impact Commercial

`tanzen-commercial` = **NON TOUCHÉ**. Aucune dépendance fonctionnelle identifiée sur le domaine Fiscal Year lors de l'audit source.

## 10. Impact Mobile

`tanzen-mobile` = **NON TOUCHÉ**. Aucune implémentation Mobile n'est engagée par cette clôture ; le domaine Fiscal Year n'a pas non plus été audité côté Mobile par cette mission (hors périmètre absolu du mandat).

## 11. Critères de fermeture

    [x] D-FY-01 validée
    [x] D-FY-02 validée
    [x] D-FY-03 validée
    [x] D-FY-04 validée
    [x] D-FY-05 validée
    [x] D-FY-06 validée

**DECISION GATE = CLOSED.**

## 12. Compatibilité avec l'existant

Aucun élément fonctionnel existant n'est remis en cause par cette clôture :
- `TenantContext` (`src/contexts/tenant-context.tsx`) — inchangé, non concerné par les 6 décisions.
- Modèle/service/écran Fiscal Year existants (`src/mocks/settings/fiscal-years.ts`, `src/services/settings.service.ts`, `src/features/settings/settings-module.tsx`) — inchangés ; D-FY-03 les confirme conformes tels quels.
- Tests existants (`settings.service.test.ts`, bloc « REGRESSION: fiscal year isCurrent invariant ») — inchangés, restent valides sous les décisions validées.
- RBAC existant (`fiscalYears.read`/`fiscalYears.manage` déjà présentes dans le catalogue) — inchangé ; D-FY-04 ne demande pas une nouvelle permission, seulement l'usage effectif d'une permission déjà déclarée.
- Conventions de nommage du projet — non affectées.

## 13. Fichiers modifiés

```
Aucun fichier existant modifié.
```

Fichiers créés par ce mandat :
```
docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md
docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md (ce document)
```

`src/`, `app/`, `tests/`, `mocks/`, `services/`, `repositories/`, `config/`, `locales/` inchangés.

## 14. Contrôle des autres dépôts

`tanzen-backend` = **NON MODIFIÉ**.
`tanzen-commercial` = **NON MODIFIÉ**.
`tanzen-mobile` = **NON MODIFIÉ**.

## 15. Git

    Aucun commit
    Aucun push
    Aucune branche supplémentaire

---

## P1 GLOBAL FISCAL YEAR — FINAL

Decision Gate :

CLOSED

Décisions :

6/6 VALIDÉES

Implementation :

NON EFFECTUÉE

Code modifié :

AUCUN

Migrations :

AUCUNE

Backend :

NON TOUCHÉ

Commercial :

NON TOUCHÉ

Mobile :

NON TOUCHÉ

Documents :

docs/P1_GLOBAL_FISCAL_YEAR_PO_DECISION_VALIDATION.md
docs/P1_GLOBAL_FISCAL_YEAR_DECISION_GATE_CLOSURE.md

Git :

Aucun commit
Aucun push

FIN DU MANDAT.
