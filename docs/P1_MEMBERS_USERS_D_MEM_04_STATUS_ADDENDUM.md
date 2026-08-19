# P1 MEMBERS / USERS — D-MEM-04 — FINAL PO DECISION — STATUS MIGRATION ADDENDUM

**Mode : DOCUMENTAIRE — READ-ONLY.** Aucun fichier de `tanzen-frontend/src/**` (`.ts`, `.tsx`,
mocks, services, routes, UI, tests, migrations, configuration) n'a été créé, modifié ou
supprimé. Aucun commit, aucun push. Ce document enregistre la décision finale et définitive du
PO sur `D-MEM-04`, et prépare — sans l'exécuter — le contrôle qui devra être effectué en
Implementation GO.

---

## 1. Décision finale et définitive

```
D-MEM-04 = OPTION A (confirmée, définitive)

Statuts officiels du modèle Member :
  ACTIVE
  INACTIVE
  SUSPENDED
  EXITED

Ancien statut :
  PENDING (supprimé du modèle officiel)

Migration obligatoire :
  PENDING → ACTIVE
```

Cette décision est **définitive** — reprise ici telle que communiquée par le PO, sans
réinterprétation. Le mapping `PENDING → ACTIVE` n'est ni discuté ni remis en question par ce
document ; aucune autre destination n'est proposée.

## 2. Portée de la décision

`D-MEM-04` concerne exclusivement `Member.status` (`MemberStatus`,
`src/mocks/organization/members.ts`). Elle ne concerne **pas** :
- `MemberSyncStatus` (même fichier, ligne 16 : `'synced' | 'pending' | 'failed'`) — champ
  technique distinct (état de synchronisation, cf. `D-MEM-02`), sans rapport sémantique avec
  le statut d'adhésion d'un membre, malgré le nom partagé `'pending'`. **Non concerné par
  cette migration.**
- Toute autre entité du projet portant sa propre valeur `pending` (Workflow, Transactions,
  Repayments, MFA, Meetings, Votes, etc.) — chacune a son propre cycle de vie, indépendant de
  `Member`. Voir §4 pour le détail des occurrences hors périmètre.

## 3. Contrôle — recherche exhaustive de `pending` dans `tanzen-frontend`

Recherche menée sur l'ensemble de `src/` (insensible à la casse). **40 fichiers** contiennent
le terme. Classement ci-dessous — aucune modification effectuée, constat uniquement.

### 3.1 Occurrences fonctionnelles concernant `Member.status` — devront disparaître en Implementation GO

| # | Fichier | Élément |
|---|---|---|
| 1 | `src/mocks/organization/members.ts:11` | `MemberStatus = 'active' \| 'inactive' \| 'suspended' \| 'pending' \| 'exited'` — `'pending'` à retirer de l'union |
| 2 | `src/mocks/organization/members.ts:107` (seed `M-004`) | `status: 'pending'`, `statusHistory: [{ status: 'pending', since: '2024-02-15' }]` — seul membre de seed concerné |
| 3 | `src/features/organization/organization-module.tsx` (`MemberCreate`, valeur initiale du formulaire) | `useState<MemberFormValues>({ ..., status: 'pending' })` — un nouveau membre est aujourd'hui créé `pending` par défaut |
| 4 | `src/features/organization/organization-module.tsx` (`MemberFormFields`, sélecteur de statut) | `<option value="pending">{t('organization', 'pending')}</option>` dans le formulaire de création/édition |
| 5 | `src/features/organization/organization-module.tsx:68` (`MembersDirectory`) | `<option value="pending">` du filtre de statut, et `Metric` comptant les membres `pending` |
| 6 | `src/services/organization.service.test.ts:155-163` | 2 tests référencent explicitement `pending` pour `M-004` (« exited additive to pending » et « REGRESSION: pending workflow ») |
| 7 | `src/services/eligibility.service.test.ts:17,18,24,85` | 4 assertions référencent `M-004`/`pending` pour la reconstruction d'état à une date donnée |

### 3.2 Occurrences partagées — nécessitent une attention particulière avant tout retrait

| # | Fichier | Constat |
|---|---|---|
| 8 | `src/features/organization/organization-module.tsx:42` (`statusTone`) | L'entrée `pending: 'warning'` de `statusTone` est **partagée** entre `Member.status` et `Vote.result` (`VoteResult`, domaine Gouvernance — un vote peut être `'pending'` avant publication de son résultat, `organization-module.tsx:430` : `row.result === 'pending'`, rendu via ce même `statusTone`). **Ne peut pas être retirée sans casser l'affichage des votes en attente de publication**, sans traitement séparé. |
| 9 | `src/locales/fr/index.ts` / `en/index.ts` (clé `organization.pending`) | Même constat : la clé i18n `pending` (« En attente » / « Pending ») est utilisée à la fois pour le libellé du statut Member et pour le libellé du résultat de vote en attente. **Ne peut pas être supprimée du fichier de traduction sans casser l'écran Votes**, à moins qu'une clé dédiée à `Member` soit introduite séparément en Implementation GO. |

### 3.3 Occurrences hors périmètre — autres domaines, non concernés par `D-MEM-04`

Les fichiers suivants contiennent `pending` pour des concepts **indépendants** de
`Member.status`, chacun avec son propre cycle de vie — **non concernés par cette décision, ne
doivent pas être modifiés à ce titre** :

`workflow.service.ts`/`workflow.service.test.ts`/`workflow-requests.ts` (`WorkflowStatus`),
`settings.service.ts`/`settings.service.test.ts` (workflow de réouverture d'exercice fiscal),
`audit-events.ts` (statuts d'événements d'audit), `decision-vote.service.ts` (votes de
décision d'assemblée), `auth.service.ts`/`auth.service.test.ts`/`login-page.tsx`/
`auth-guard.tsx` (état d'authentification), `finance.service.ts`/`finance.service.test.ts`/
`finance-module.tsx`/`contributions.ts`/`distributions.ts`/`transactions.ts`/`loans.ts`
(statuts Finance/Transactions/Repayments), `tontines.service.ts`/`tontines-module.tsx`/
`tontine-cycles.ts` (statuts Tontine — `statusPending` sur `CycleContribution`, distinct
lexicalement et sémantiquement), `dashboard-overview.tsx`/`dashboard.service.ts` (agrégats
multi-domaines), `access-module.tsx`/`users.ts` (`MfaStatus`), `integrations.ts`/
`notification-settings.ts` (statuts techniques), `governance.ts` (autres statuts de
gouvernance), `tenants.ts` (statut tenant), `approval-timeline.tsx` (générique, dépend du
domaine appelant), `app-router.tsx` (routing générique, `isPending` de React Query — mots-clé
homonymes sans rapport, ex. `mutation.isPending`).

**Ces occurrences peuvent être conservées telles quelles — elles ne sont pas des « occurrences
historiques/documentaires » à considérer pour retrait, mais des concepts fonctionnels
distincts appartenant à d'autres domaines, hors périmètre de `D-MEM-04`.**

### 3.4 Occurrences historiques/documentaires — peuvent être conservées

- Le commentaire d'en-tête de `src/mocks/organization/members.ts:2` (*« `pending` (préexistant,
  workflow de demande d'adhésion... ») documente l'historique de cette valeur — utile à la
  traçabilité de la migration, peut être conservé tel quel ou mis à jour en Implementation GO
  pour refléter le nouveau statut définitif ; sa conservation ne bloque rien.
- Les rapports antérieurs de cette série (`docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md`,
  `docs/P1_MEMBERS_USERS_PO_DECISION_VALIDATION.md`) mentionnant `pending` comme état alors
  non tranché — documents historiques, non réécrits rétroactivement (seule leur section
  `D-MEM-04` est mise à jour pour refléter la décision finale, cf. document séparé).

## 4. Conditions d'Implementation GO (reprises et actionnables)

1. Supprimer `'pending'` de l'union `MemberStatus` (§3.1.1).
2. Empêcher la création d'un nouveau `Member` avec `status: 'pending'` — corriger la valeur
   par défaut du formulaire `MemberCreate` (§3.1.3) et retirer l'option du sélecteur de statut
   (§3.1.4).
3. Migrer les données existantes : le seul enregistrement concerné est `M-004`
   (`src/mocks/organization/members.ts`, §3.1.2) — `status: 'active'`, et une entrée
   `statusHistory` cohérente avec la migration (`{ status: 'active', since: <date de
   migration> }`, en conservant ou non l'entrée historique `pending` selon la décision prise
   en Implementation GO sur la conservation de l'historique — **NON DÉFINI ici, à trancher au
   moment de l'implémentation**, cohérent avec le principe de préservation de l'historique
   §5.12 du mandat).
4. Retirer les usages métier de `pending` propres à `Member` (§3.1.3, §3.1.4, §3.1.5).
5. Adapter les filtres UI (`MembersDirectory`, §3.1.5).
6. Adapter les compteurs (`Metric` « pending » de `MembersDirectory`, §3.1.5).
7. Adapter `eligibility.service.ts` — vérifier si sa logique dépend implicitement de la
   présence de `pending` dans les données (analyse à mener en Implementation GO ; ce document
   constate que le traitement actuel est générique sur `MemberStatus`, sans branche
   spécifique câblée sur `'pending'`, mais ceci reste à confirmer précisément au moment de
   l'implémentation, pas ici).
8. Adapter les mocks (`M-004`, §3.1.2).
9. Adapter les tests (§3.1.6, §3.1.7 — 6 assertions au total à réviser).
10. Supprimer les traductions devenues inutiles — **avec prudence** : la clé i18n `pending`
    et l'entrée `statusTone.pending` sont partagées avec `Vote.result` (§3.2) — leur retrait
    pur et simple casserait l'écran Votes. Implementation GO devra soit introduire une clé/
    tonalité dédiée à `Member` avant de retirer l'ancienne route Member vers cette même clé,
    soit conserver la clé (utile pour Votes) en ne retirant que son usage côté Member.
11. Vérifier qu'aucune occurrence fonctionnelle de `pending` ne subsiste **pour `Member`
    spécifiquement** — les 40 fichiers listés en §3.3 ne sont pas concernés et ne doivent pas
    être « nettoyés » à tort au nom de cette décision.
12. Préserver l'historique des Members — `statusHistory` (mécanisme D-4C4-WEB-03) ne doit pas
    être vidé, seule une nouvelle entrée reflétant la migration doit y être ajoutée (voir
    point 3).
13. Ne créer aucun nouveau `Member` lors de la migration — `M-004` reste `M-004`, seul son
    `status` (et son historique) changent.
14. Ne modifier ni `tenantId` ni l'identité (`firstName`/`lastName`/`uuid`/`matricule`) du
    `Member` migré.
15. Ne pas déplacer le Member entre Fiscal Years — sans objet : confirmé (§9 du pack de
    validation) qu'aucun `Member` ne référence de `FiscalYear`, migration sans impact sur ce
    point.

## 5. Non-régression

- Le seul enregistrement de données réellement affecté est `M-004` (Ousmane Fall, tenant
  `T-004`) — aucun autre membre de seed ne porte `pending`.
- Les 7 autres membres de seed (`M-001`, `M-002`, `M-003`, `M-005` à `M-008`) sont
  **totalement non affectés** par cette migration.
- L'écran Votes (Gouvernance) doit rester fonctionnel après toute suppression de clé i18n/
  tonalité partagée — condition explicite portée en §3.2 et §4 point 10.
- Les 43 tests actuels de `organization.service.test.ts` restent inchangés par ce document ;
  2 d'entre eux (§3.1.6) devront être révisés en Implementation GO pour refléter la migration
  plutôt que la coexistence des deux statuts.

## 6. Statut

```
D-MEM-04 BLOCKER = RESOLVED
D-MEM-04 = OPTION A + PENDING → ACTIVE = VALIDÉE (DÉFINITIVE)
```

Ce document ne modifie aucun code — il documente exhaustivement ce qu'Implementation GO devra
faire, et rien de plus.

FIN DU MANDAT.
