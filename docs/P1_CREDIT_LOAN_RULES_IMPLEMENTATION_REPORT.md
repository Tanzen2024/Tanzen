# TANZEN FRONTEND — P1 Credit — `loan_rules` — Implémentation

**Statut : implémenté, testé, vérifié en direct.** Périmètre strictement respecté : `tanzen-frontend` uniquement. Aucune migration (le projet n'en a pas), aucune modification de `Loan`/`Account`, aucune modification du modèle canonique.

---

## 1. Décisions appliquées

- **D-CREDIT-LR-01 (validée)** : une permission unique `loanRules.manage`, tenant-scopée — aucune permission granulaire (`loanRules.read/create/update/delete`) créée, aucune réutilisation de `loans.*`/`accounts.*`/`credit.*`.
- **D-CREDIT-LR-02 (validée)** : `status` (`ACTIVE`/`INACTIVE`) gouverne Activer/Désactiver ; `deleted_at` gouverne la suppression logique. **DELETE force également `status = 'INACTIVE'`** (règle explicite du mandat, §11), en plus d'horodater `deletedAt`.
- **Cycle** : Créer → Modifier → Activer/Désactiver → Supprimer. **RESTORE hors périmètre** — aucune fonction, bouton, route ou permission de restauration n'existe.

## 2. Modèle implémenté

`src/mocks/finance/loan-rules.ts` — type `LoanRule`, fidèle à la fiche canonique #14 (`docs/audit/excel_dictionary_dump.txt`) : `tenantId`, `accountId` (FK), `name`, `allowLoans`, `loanMode`, `minAmount`/`maxAmount`, `interestRate`/`interestType`/`interestPeriod`, `durationMonths`, `maxActiveLoans`, `maxLoanExposure`, `requiresGuarantor`/`minGuarantors`/`maxGuarantors`/`guaranteeTypeRequired`/`guaranteeRatio`/`allowSelfGuarantee`, `requiresApproval`/`approvalLevel`, `status`, `deletedAt`. Enums (`loanMode`, `interestType`, `interestPeriod`, `guaranteeTypeRequired`, `approvalLevel`, `status`) reprennent exactement les valeurs documentées par la fiche — aucune valeur inventée.

**Champs canoniques volontairement exclus**, choix documenté dans le fichier lui-même : `uuid`, `sync_status`, `version`, `created_at`/`updated_at`, `created_by`/`updated_by` — aucune autre entité mock de ce dossier (`accounts.ts`, `loans.ts`, `guarantors.ts`) n'expose ces colonnes techniques ; réutilisation stricte du pattern déjà établi, pas une omission. Champ ajouté par cohérence avec les entités sœurs : `accountNumber` (dénormalisé pour l'affichage, même convention que `Loan.tenantName`/`Guarantor.borrowerName`).

**Champs du diagramme de classes non canoniques** (`late_penalty_rate`, `grace_period_days`, `minimum_saving_balance`, plage `min_duration`/`max_duration`) : **non implémentés**, conformément à l'audit précédent (`MODEL_GAP`, dictionnaire prioritaire sur le diagramme).

3 règles seedées : `LR-001` (T-001/AC-001, ACTIVE), `LR-002` (T-002/AC-004, ACTIVE), `LR-003` (T-001/AC-002, **INACTIVE** — démontre la distinction status/deletedAt dès les données de départ).

## 3. RBAC

`loanRules.manage` ajouté à `permissionCatalog` (`src/mocks/rbac.mocks.ts`), dans le bloc Credit après `guarantors.*`. Aucune modification du mécanisme de filtrage par rôle (`role-admin` l'obtient via le catalogue complet ; `role-manager` l'obtient automatiquement car le filtre existant n'exclut que `.delete`/`.approve` ; `role-viewer` ne l'obtient pas car il n'exclut que `.read` — comportement identique aux 8 permissions `.manage` déjà présentes, aucune règle de filtrage modifiée).

**Toutes les 4 routes** (`credit/loan-rules`, `/create`, `/:id`, `/:id/edit`) sont enveloppées individuellement dans `<PermissionRoute permission="loanRules.manage">` — l'écran lui-même est gardé, pas seulement les boutons d'action (conforme au mandat §6 : « Tous les écrans et actions Loan Rules doivent respecter cette permission »). Un utilisateur sans cette permission est redirigé vers `/unauthorized`, comme pour tout autre `PermissionRoute` du projet.

## 4. Tenant isolation

`src/services/loan-rule.service.ts` réutilise exclusivement `getTenantScoped` (`tenant-scope.ts`, déjà existant, non modifié) pour `get`/`update`/`activate`/`deactivate`/`delete` ; `list` filtre directement par `tenantId`. Aucun `tenantId` n'est jamais accepté depuis l'UI comme source d'autorité : `currentTenant.id` (contexte `useTenant()`) est toujours le paramètre transmis explicitement au service depuis les composants, jamais un champ de formulaire éditable — même convention que `createRepayment`/`createGuarantor` existants dans `credit.service.ts`.

## 5. Account

`createLoanRule` résout d'abord le compte via `getTenantScoped(accounts, ..., tenantId)` : un `accountId` inexistant ou appartenant à un autre tenant est refusé (retour `undefined` → `null` côté client), avant toute autre validation. `accountId` est **immuable après création** — absent de `LoanRuleUpdateInput`, jamais proposé dans l'écran d'édition (le compte y est affiché en lecture seule).

## 6. CRUD

| Fonction | Fichier | Comportement |
|---|---|---|
| `listLoanRules(tenantId)` | `loan-rule.service.ts` | Filtré par tenant, exclut `deletedAt !== null` (§16 du mandat) |
| `getLoanRule(tenantId, id)` | idem | Tenant-scoped, exclut également les lignes supprimées (choix documenté §7) |
| `createLoanRule(tenantId, input)` | idem | Vérifie le compte, les contraintes `CHECK` canoniques, `UNIQUE(tenant_id, account_id)` et `UNIQUE(tenant_id, name)` — voir §7 |
| `updateLoanRule(tenantId, id, patch)` | idem | Tenant-scoped, réapplique les mêmes `CHECK`, revérifie `UNIQUE(tenant_id, name)` si le nom change |

UI : `LoanRulesList`, `LoanRuleDetail`, `LoanRuleCreate`, `LoanRuleEdit` dans `src/features/finance/finance-module.tsx`, suivant exactement les patterns déjà en place (`DataTable`/`FilterBar`/`FormSection`/`ConfirmDialog`/`useMockMutation`, mêmes composants que `AccountsList`/`ApplicationCreate`/`LoanDetail`). Formulaire organisé en 4 `FormSection` (Général, Conditions de prêt, Garanties, Approbation) partagées par Créer/Modifier via `LoanRuleFormBody`.

## 7. Contraintes canoniques appliquées (au-delà du CRUD de base)

Fonction `violatesCanonicalConstraints` (service) — refuse (retour `undefined`) toute écriture qui violerait un `CHECK` nommé de la fiche #14 : `ck_amount_valid` (max ≥ min), `ck_interest_valid` (taux ≥ 0), `ck_duration_valid` (durée > 0), `ck_exposure_valid` (exposition ≥ 0 si renseignée), `ck_guarantor_count` (max ≥ min garants), `ck_guarantee_ratio` (0–100). Ce n'est pas une règle métier inventée — chacune est nommée et citée dans la fiche canonique.

`UNIQUE(tenant_id, account_id)` et `UNIQUE(tenant_id, name)` : vérifiées **uniquement contre les lignes vivantes** (`deletedAt === null`). Choix d'implémentation documenté dans le code et les tests : comme RESTORE est hors périmètre, une contrainte incluant les lignes supprimées bloquerait définitivement toute nouvelle règle pour un compte dont l'ancienne a été supprimée — un résultat auto-contradictoire avec CREATE et DELETE tous deux prévus comme opérations disponibles. Vérifié par le test « a live rule can be recreated for the same account after the previous one was soft-deleted ».

## 8. Activation/Désactivation

`activateLoanRule`/`deactivateLoanRule` : modifient **uniquement** `status`, jamais `deletedAt` — testé explicitement (`expect(result?.deletedAt).toBeNull()` après chaque opération). Une règle désactivée reste dans le catalogue (visible dans la liste, `isLive()` ne teste que `deletedAt`, pas `status`).

## 9. Suppression logique

`deleteLoanRule` : renseigne `deletedAt` (timestamp ISO) **et** force `status = 'INACTIVE'` dans le même appel — règle explicite du mandat §11, qui répond du même coup à la question laissée ouverte par `docs/P1_CREDIT_LOAN_RULES_DECISION_ANALYSIS.md` §22 (sous-point (i)). Suppression physique jamais effectuée — la ligne reste dans le tableau mock. Une règle déjà supprimée n'apparaît plus dans `listLoanRules` par défaut et n'est plus atteignable via `getLoanRule` (404 → `NotFoundPage` côté UI). Un deuxième appel `deleteLoanRule` sur une ligne déjà supprimée est traité comme « introuvable » (refusé).

## 10. RESTORE hors périmètre

Aucune fonction `restoreLoanRule`, aucun bouton, aucune route, aucune permission dédiée. Vérifié explicitement par un test dédié (`expect((loanRuleService as Record<string, unknown>).restoreLoanRule).toBeUndefined()`).

## 11. Loan non modifié

`src/mocks/finance/loans.ts`, `src/services/credit.service.ts` : **non touchés**. Aucun champ `loan_rule_id` ajouté à `Loan`. Aucune relation `Loan → LoanRule` créée. Le sujet de la source du taux d'intérêt à l'auto-création d'un `Loan` (`PHASE_07_DECISIONS_A_VALIDER.md` sujet BLOQUANT 3) reste ouvert, non traité par cette mission.

## 12. Tests

`src/services/loan-rule.service.test.ts` — 18 tests, tous verts :

| Bloc | Couverture |
|---|---|
| Tenant isolation | `listLoanRules`/`getLoanRule` scopés ; `update`/`activate`/`deactivate`/`delete` refusés cross-tenant |
| Relation Account | Création acceptée pour un compte du même tenant ; refusée pour un compte d'un autre tenant ou inexistant |
| `UNIQUE(tenant_id, account_id)` / `UNIQUE(tenant_id, name)` | Deuxième règle sur le même compte refusée ; nom dupliqué refusé |
| Contraintes `CHECK` canoniques | `ck_amount_valid`, `ck_guarantee_ratio` testés en rejet |
| Activer/Désactiver | `status` modifié, `deletedAt` jamais touché |
| Suppression logique | `deletedAt` + `status=INACTIVE` ; disparaît de la liste ; 404 sur `get` ; non ré-appliquable ; recréation possible après suppression |
| RESTORE | Confirmé absent |
| Modification | Champs métier modifiables, `accountId` non exposé, contrainte `CHECK` réappliquée à l'update |

## 13. Build

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run lint` | 0 erreur, 14 warnings pré-existants (inchangés — `react-refresh/only-export-components` sur des fichiers non touchés) |
| `npm run test -- --run` | **176/176** (18 nouveaux tests, 158 déjà verts, aucun cassé) |
| `npm run i18n:check` | 2/2 |
| `npm run build` | succès (chunk principal 901,63 kB gzip 254,98 kB — avertissement de taille pré-existant, +0,05 kB négligeable) |

**Vérification live (Playwright, script temporaire supprimé après usage)** — 15/16 checks PASS (le seul « FAIL » est un warning React/`recharts` (`defaultProps` deprecation) déclenché en traversant le Dashboard au login, pré-existant, sans rapport avec cette fonctionnalité) :
- Liste filtrée par tenant : T-001 voit ses 2 règles (`Politique Trésorerie Sutura` ACTIVE, `Politique Épargne Sutura` INACTIVE), ne voit jamais la règle T-002.
- Badge de statut ACTIVE/INACTIVE affiché correctement, aucun statut inventé.
- Détail, Désactiver → Activer (aller-retour), bouton et badge cohérents à chaque étape.
- Créer une règle (compte + montants) → redirection vers le détail, données affichées correctement.
- Tentative de doublon sur un compte déjà pourvu → refusée, reste sur le formulaire, toast d'erreur affiché.
- Supprimer → retour à la liste, règle absente de la liste.
- Barre latérale : entrée « Règles de crédit » traduite correctement (correctif i18n appliqué, voir §14).
- Aucune erreur console/page liée à la fonctionnalité.

## 14. i18n

FR/EN complets : titres, labels de champs, valeurs d'énumération (`loanMode*`, `interestType*`, `interestPeriod*`, `guaranteeType*`, `approvalLevel*`), actions (Activer/Désactiver/Supprimer/Modifier), confirmations, messages de succès/erreur. Aucun texte utilisateur hardcodé.

**Correctif découvert pendant la vérification live** : le libellé de navigation (barre latérale + fil d'Ariane) est dérivé automatiquement du dernier segment de route via `getNavigationLabelKey()` (`src/config/navigation.ts`), qui cherche la clé résultante dans le namespace `nav` — pas `finance`. Sans l'ajout de `nav.loanRules`, l'écran affichait le texte brut `loanRules` au lieu d'un libellé traduit. Corrigé en ajoutant `loanRules: 'Règles de crédit'` (FR) / `'Loan Rules'` (EN) au namespace `nav` des deux locales, à côté de `guarantors`/`loans`/`applications` déjà présents — même convention, aucune nouvelle mécanique introduite.

## 15. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `src/mocks/finance/loan-rules.ts` | **Nouveau** — modèle + seed |
| `src/mocks/finance/index.ts` | Ajout d'un export |
| `src/services/loan-rule.service.ts` | **Nouveau** — service dédié (nom de service verrouillé par la décision de nomenclature) |
| `src/services/loan-rule.service.test.ts` | **Nouveau** — 18 tests |
| `src/services/query-keys.ts` | Ajout de 2 clés (`credit.loanRules`, `credit.loanRule`) |
| `src/mocks/rbac.mocks.ts` | Ajout de la permission `loanRules.manage` |
| `src/features/finance/finance-module.tsx` | Ajout des 4 écrans + 4 routes gardées par `PermissionRoute` |
| `src/config/navigation.ts` | Ajout de l'entrée de navigation « Loan Rules » |
| `src/locales/fr/index.ts`, `src/locales/en/index.ts` | Ajout des clés `finance.*` et `nav.loanRules` |

Aucun autre fichier touché. `tanzen-mobile` et `tanzen-commercial` : non modifiés (vérifié par `git status --short` avant/après, identique à leur état préexistant).

## 16. Backend Pending

Inchangé — comme l'intégralité du projet, la persistance reste en mémoire (mocks). Un vrai backend devra répliquer indépendamment : les contraintes `CHECK`/`UNIQUE` nommées, la vérification RBAC (`loanRules.manage`), l'isolation tenant, et la règle DELETE→`status=INACTIVE`. Rien de cela n'est garanti côté serveur par cette implémentation frontend.

## 17. Points restant ouverts

- **Sujet Phase 7 (taux d'intérêt à l'auto-création du `Loan`)** : non traité, hors périmètre de cette mission, reste `BLOQUANT` dans `PHASE_07_DECISIONS_A_VALIDER.md`.
- **Champs du diagramme de classes non canoniques** (`late_penalty_rate`, `grace_period_days`, `minimum_saving_balance`, plage de durée) : non implémentés, resteront `MODEL_GAP` tant qu'aucune source canonique ne les confirme.
- **`getLoanRule` exclut les lignes supprimées** (interprétation, §7) : le mandat ne précisait explicitement ce comportement que pour la liste (§16 : « ne pas afficher les lignes deleted_at != NULL » dans la liste) — appliqué également à `getLoanRule` par cohérence (pas d'écran de consultation d'un élément supprimé prévu, RESTORE hors périmètre), documenté ici pour traçabilité si le Product Owner souhaitait un comportement différent.

---

**P1 CREDIT — LOAN_RULES — IMPLEMENTATION TERMINÉE.**
