# TANZEN ENTERPRISE — Phase 8 : Tontines

**Statut : implémentation réelle.** Périmètre strictement limité au domaine **Tontines** (Tontine, TontineCycle, CycleMember, TontineContribution, TontineDraw, Winner). Une seule dépendance technique strictement nécessaire hors périmètre : `organization-module.tsx` (mise à jour d'un appel de service, cf. §20). Aucune règle métier, montant, fréquence, ordre, méthode de tirage, pénalité, calendrier ou statut supplémentaire n'a été inventé — les sujets concernés sont documentés dans `docs/PHASE_08_DECISIONS_A_VALIDER.md`, pas implémentés.

## Méthodologie

Lecture intégrale avant modification : `src/features/tontines/tontines-module.tsx` (216 lignes), `src/services/tontines.service.ts`, `src/mocks/tontines/{tontines,tontine-cycles}.ts` en entier, le catalogue RBAC, croisée avec les blocs UC02/UC40/UCX1/UCX2/UC70 de `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` et la section Tontines (§2.1, §8, §9.2) de `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`. Plan validé en mode plan avant implémentation.

---

## 1. Use Cases

| UC | Description | Statut avant | Statut après |
|---|---|---|---|
| UC02-10, UCX2-01 | Créer une tontine | NOT IMPLEMENTED (formulaire ne persistait rien) | **IMPLEMENTED** |
| UC40-05 | Gérer les cycles (création) | NOT IMPLEMENTED (formulaire ne persistait rien) | **IMPLEMENTED** |
| UCX2-14 | Ouvrir le cycle | PARTIAL (transition non gardée, non protégée RBAC) | **IMPLEMENTED** |
| — (§5 mandat) | Suspendre / Reprendre un cycle | PARTIAL (« Suspendre » fonctionnel mais non sourcé distinctement, « Rouvrir » ambigu) | **IMPLEMENTED** (reprise SUSPENDED→OPEN, seule transition de sortie retenue faute de source dédiée à la suspension elle-même — voir §9) |
| UC40-04, UCX2-04 | Clôturer le cycle | PARTIAL (non protégée RBAC) | **IMPLEMENTED** |
| — | Réouverture d'un cycle CLÔTURÉ | NOT IMPLEMENTED correctement (bug : traitée comme une reprise) | **BLOCKED** (retirée, non sourcée — `docs/PHASE_08_DECISIONS_A_VALIDER.md` §1) |
| UCX2-03 | Inscrire les membres | NOT IMPLEMENTED (aucun bouton fonctionnel) | **IMPLEMENTED** |
| UCX1-10 | Participer aux tontines (membre-initié) | NOT IMPLEMENTED | **BLOCKED/DECISION REQUIRED** (§10 mandat, `docs/PHASE_08_DECISIONS_A_VALIDER.md` §4) |
| UC02-08, UC40-02, UCX2-15 | Effectuer / planifier un tirage | NOT IMPLEMENTED (formulaire ne persistait rien) | **IMPLEMENTED** |
| UCX2-16 | Valider le bénéficiaire (déclarer le gagnant) | NOT IMPLEMENTED | **IMPLEMENTED** (sélection manuelle, aucun algorithme) |
| UC02-09, UCX2-09/10 | Enregistrer / contrôler une cotisation | NOT IMPLEMENTED | **BLOCKED** (`docs/PHASE_08_DECISIONS_A_VALIDER.md` §2 — pas de permission `contributions.create`) |
| UC02-11, UCX2-18 | Acheter une tontine (`TontinePosition`) | NOT IMPLEMENTED | **BLOCKED** (déjà bloquant, non relitigé) |
| UCX2-02 | Configurer les règles (montant, fréquence, ordre) | NOT IMPLEMENTED | **OUT OF SCOPE** (dépend de Credit pour les intérêts, aucun champ de règle sourcé pour la création elle-même) |
| UCX2-05 | Archiver la tontine | NOT IMPLEMENTED | **OUT OF SCOPE** (dépend de Documents) |

## 2. Classes

| Classe | Frontend existant | Modifié | Service | Tenant scope | Notes |
|---|---|---|---|---|---|
| `Tontine` | type + liste + détail | création | `tontinesService` | direct (`tenantId`) | pas de champ règles/fréquence sur la création (non sourcé) |
| `TontineCycle` | type + liste + détail | création + garde de transition | `tontinesService` | direct (`tenantId`), déjà à plat comme les autres domaines déjà traités | statut déjà conforme à la liste validée, aucune migration requise |
| `CycleMember` | type + affichage (imbriqué dans `TontineCycle`) | inscription | `tontinesService` | via `TontineCycle` parent (imbriqué structurellement — pas une table séparée) | `hasWon` déjà prévu, utilisé par la déclaration de gagnant |
| `TontineContribution` (`CycleContribution`) | type + affichage (imbriqué) | — | `tontinesService` (lecture uniquement) | idem | création BLOQUÉE (§1 décisions) ; confirmé présent dans le code malgré son absence des 7 diagrammes de classes (déjà noté par Phase 5) — non supprimé ni modifié |
| `TontineDraw` (`CycleDraw`) | type + affichage (imbriqué) | planification + déclaration du gagnant | `tontinesService` | idem | `TontinesService` n'avait aucune fonction dédiée aux tirages avant cette phase (gap déjà signalé par Phase 5 §8) — comblé par `createDraw`/`declareWinner` |
| `Winner` (`DrawWinner`, porté par les champs `winnerMemberId`/`winnerName`/`amountReceived` de `CycleDraw`) | affichage (`WinnerDetail`) | déclaration (via `declareWinner`) | `tontinesService` | idem | pas de classe TS séparée créée — le modèle existant fusionne déjà `Winner` dans `CycleDraw`, cohérent avec la consigne de ne pas créer de classe pour reproduire visuellement un diagramme |

## 3. Routes

Aucune nouvelle route. Toute la nouvelle fonctionnalité passe par les pages déjà routées (`/tontines/create`, `/:tontineId/cycles/create`, `/:tontineId/cycles/:cycleId`, `/:tontineId/cycles/:cycleId/draws/create`, `/:tontineId/cycles/:cycleId/draws/:drawId`) et par des modales (`ConfirmDialog`).

## 4. Pages

`TontineCreate`, `CycleCreate`, `DrawCreate` réparées (persistance réelle). `CycleDetail` (lifecycle corrigé, action d'inscription de membre). `DrawDetail` (action de déclaration du gagnant).

## 5. Components

Aucun nouveau composant fichier. Réutilisation de `ConfirmDialog`/`FieldError` (import ajouté, déjà présent dans `@/components`) suivant le pattern établi en Phases 6/7.

## 6. Services

`src/services/tontines.service.ts` : `createTontine`, `createCycle`, `addCycleMember`, `createDraw`, `declareWinner`, plus une garde de transition (`VALID_CYCLE_TRANSITIONS`) appliquée dans `updateCycleStatus`. `listCyclesByMember` durci avec un paramètre `tenantId`. Tous suivent le pattern déjà en place (`mockRequest`, `getTenantScoped` pour valider le parent avant écriture).

## 7. Queries

Réutilisation stricte des `queryKeys.tontines.*` déjà définies — aucune nouvelle clé nécessaire.

## 8. Mutations

Toutes via `useMockMutation`. Les mutations dont le service peut renvoyer un échec de validation (numéro de cycle déjà utilisé, tirage/membre invalide) vérifient explicitement `if (!result)` dans `onSuccess` plutôt que de supposer un succès — évite qu'un échec silencieux affiche un message de succès erroné.

## 9. Cycle lifecycle

Garde de transition ajoutée côté service (défense en profondeur, pas seulement UI) :

```
DRAFT     → OPEN                    (sourcé : UCX2-14)
OPEN      → SUSPENDED, CLOSED       (CLOSED sourcé : UC40-04/UCX2-04 ; SUSPENDED nécessaire à la mécanique du statut validé)
SUSPENDED → OPEN                    (reprise, nécessaire pour que SUSPENDED ne soit pas un cul-de-sac)
CLOSED    → (aucune)                (non sourcé — voir docs/PHASE_08_DECISIONS_A_VALIDER.md §1)
```

**Correction du bug identifié par le mandat (§5)** : avant cette phase, un cycle SUSPENDU et un cycle CLÔTURÉ affichaient tous deux un bouton « Rouvrir » identique, transitionnant vers OPEN sans distinction. Après correction : SUSPENDU affiche « Reprendre le cycle » (reste réversible) ; CLÔTURÉ n'affiche **aucun** bouton de transition. Le texte `closeCycleConfirm` a été réécrit pour ne plus affirmer qu'une clôture est réversible. Les deux boutons de transition (`lifecycleAction`, `closeAction`) sont désormais protégés par `PermissionGate permission="cycles.manage"`, absent auparavant.

## 10. Tenant isolation

`TontineCycle` porte un `tenantId` direct (comme les autres domaines déjà traités) ; `CycleMember`/`CycleContribution`/`CycleDraw` sont des tableaux **imbriqués** dans chaque `TontineCycle` (pas des tables séparées) — leur isolation découle structurellement de la validation du `TontineCycle` parent, déjà appliquée par `getCycle`. Toutes les nouvelles mutations (`addCycleMember`, `createDraw`, `declareWinner`) revalident ce parent indépendamment côté service, jamais sur la seule foi d'un `cycleId` client.

**Vérification directe en environnement** (`npm run dev`, headless Chrome + CDP) :
- Navigation vers `/tontines/TON-001/cycles/CYC-001` (Tontine et Cycle appartenant à T-002) depuis le tenant courant T-001 → **404 Page introuvable**, confirmé par capture d'écran.
- Cycle de vie complet exercé sur `CYC-005` (T-001, statut initial `statusDraft`) : Ouvrir → Suspendre → Reprendre → Clôturer, avec à chaque étape uniquement les boutons attendus par le nouveau graphe de transition (aucun bouton après clôture).
- Inscription d'un membre sur `CYC-005` : mutation exécutée avec succès, nouvelle ligne `#1 Fatou Ndiaye · 100 000 FCFA` confirmée dans le tableau après rafraîchissement de la requête.

## 11. RBAC

Aucune permission inventée. Catalogue réel utilisé : `tontines.create` (créer une tontine), `cycles.create` (créer un cycle), `cycles.manage` (transitions de cycle — nouvellement appliqué aux boutons de lifecycle, absent avant cette phase ; également utilisé pour l'inscription de membre, action de gestion de cycle la plus proche), `draws.manage` (planifier un tirage, déclarer un gagnant). Aucune comparaison directe de rôle.

## 12. i18n

Nouvelles clés (FR + EN) : `resumeCycle`, `cycleResumed`, `resumeCycleConfirm`, `fieldRequired`, `cycleNumberTaken`, `selectMember`, `addCycleMember`, `cycleMemberAdded`, `tontineCreated`, `cycleCreated`, `drawCreated`, `declareWinner`, `selectWinner`, `winnerDeclared` ; `closeCycleConfirm` réécrite pour ne plus affirmer une réversibilité non sourcée. Les 4 statuts de cycle (`statusDraft/statusOpen/statusSuspended/statusClosed`) avaient déjà leurs traductions FR/EN.

## 13. Themes

Uniquement les tokens shadcn déjà utilisés dans le module — aucun style codé en dur.

## 14. Accessibility

Chaque nouveau champ a un `<Label htmlFor>` associé. `ConfirmDialog` porte déjà `role="dialog" aria-modal="true"`. Les actions sont des `<Button>` à libellé texte explicite.

## 15. Responsive

Formulaires en dialogue utilisant `grid grid-cols-2 gap-3` pour les paires de champs courtes, cohérent avec le pattern déjà établi en Phases 6/7 ; aucun nouveau composant de mise en page.

## 16. Cross-tenant tests

Voir §10. Testé en direct : Tontine/Cycle cross-tenant → 404. `CycleMember`/`TontineContribution`/`TontineDraw` héritent structurellement de cette protection (tableaux imbriqués, jamais exposés hors de la validation du `TontineCycle` parent) — non re-testés individuellement en live par souci de temps, la garantie venant du code partagé (même `getTenantScoped`) déjà éprouvé en Phases 6/7, pas d'une supposition.

## 17. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission. `vite build` — succès (6,7 s), même avertissement pré-existant sur la taille de chunk.

## 18. Missing Use Cases

Voir colonne « Statut après » du tableau §1. BLOCKED (3 : réouverture de cycle clôturé, cotisations, achat de position) ; DECISION REQUIRED (1 : workflow d'adhésion membre-initié) ; OUT OF SCOPE (2 : configuration des règles, archivage).

## 19. Decisions required

4 sujets consolidés dans `docs/PHASE_08_DECISIONS_A_VALIDER.md` : réouverture d'un cycle clôturé, permission manquante pour les cotisations (même cause que les Transactions en Phase 7), entité calendrier non spécifiée, workflow demande/validation d'adhésion non sourcé.

## 20. Fichiers modifiés

- `src/services/tontines.service.ts` — garde de transition + `createTontine`, `createCycle`, `addCycleMember`, `createDraw`, `declareWinner` ; `listCyclesByMember` durci avec `tenantId`.
- `src/features/tontines/tontines-module.tsx` — `TontineCreate`/`CycleCreate`/`DrawCreate` réparés ; `CycleDetail` (lifecycle corrigé + `PermissionGate` + inscription de membre) ; `DrawDetail` (déclaration du gagnant).
- `src/features/organization/organization-module.tsx` — `TontinesTab` : appel à `listCyclesByMember` mis à jour avec `tenantId` (dépendance technique strictement nécessaire, seul appelant existant).
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — nouvelles clés dans la section `tontines`.
- `docs/PHASE_08_DECISIONS_A_VALIDER.md`, `docs/PHASE_08_TONTINES.md` — nouveaux.

Aucun autre fichier (Finance, Credit, Governance, Operations, Workflows, Documents, Access, Audit, Settings) n'a été modifié.

---

*Fin du rapport Phase 8. Ne pas commencer la Phase 9.*
