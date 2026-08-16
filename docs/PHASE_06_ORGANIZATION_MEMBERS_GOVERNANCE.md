# TANZEN ENTERPRISE — Phase 6 : Organization / Members / Governance

**Statut : implémentation réelle.** Périmètre strictement limité aux domaines **Organization, Members, Governance**. Aucun autre domaine (Finance, Credit, Tontines, Operations, Workflows, Documents, Access & Security, Audit, Settings) n'a été modifié. Aucune contradiction Phase 4/5 n'a été corrigée. Aucune règle métier non sourcée n'a été inventée — les sujets concernés sont documentés dans `docs/PHASE_06_DECISIONS_A_VALIDER.md`, pas implémentés.

## Méthodologie

Lecture intégrale du code existant avant toute modification (`src/mocks/organization/{members,governance,tenants}.ts`, `src/services/organization.service.ts`, `src/features/organization/organization-module.tsx` en entier — 244 lignes —, `src/mocks/rbac.mocks.ts`, `src/features/settings/settings-module.tsx`, `src/hooks/use-mock-mutation.ts`, `src/components/confirm-dialog.tsx`), croisée avec `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (blocs UC02, UC10, UC30, UCX1, UCX5) et `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (§5 Domaine, §6 Tenant Scope, §11 gaps). Plan validé en mode plan avant implémentation.

---

## 1. Use Cases traités

| UC | Description | Statut avant | Statut après |
|---|---|---|---|
| UC02-05/06/07 | Gérer les membres (créer/consulter/modifier) | IMPLEMENTED | inchangé (déjà complet) |
| UCX1-16/17 | Suspendre / Réactiver un membre | NOT IMPLEMENTED | **IMPLEMENTED** |
| UC30-05 | Planifier une assemblée | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** |
| UCX5-02 (assemblées) | Planifier une assemblée générale | NOT IMPLEMENTED | **IMPLEMENTED** |
| UCX5-02 (réunions) | Planifier une réunion | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** |
| UCX5-03 | Définir l'ordre du jour | NOT IMPLEMENTED | **PARTIAL** (champ `agenda` texte libre sur assemblées/réunions, pas d'entité `AgendaItem` structurée) |
| UCX5-04 | Rédiger et publier le procès-verbal | NOT IMPLEMENTED | **IMPLEMENTED** (le champ `minutes` existait déjà, la publication ne l'était pas) |
| UC30-01/02 | Constituer le bureau / Nommer un membre du bureau | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** |
| UC30-03/19 | Révoquer un membre / Clôturer un mandat | NOT IMPLEMENTED | **IMPLEMENTED** |
| UC30-17/18 | Consulter le bureau / les mandats | IMPLEMENTED | inchangé |
| UCX5-06 | Organiser les votes (créer un scrutin) | NOT IMPLEMENTED (bouton décoratif) | **IMPLEMENTED** (binaire yes/no/abstain uniquement) |
| UCX5-07 | Publier les résultats | NOT IMPLEMENTED | **IMPLEMENTED** |
| UC30-08/09/10 | Exercices fiscaux | IMPLEMENTED ailleurs (Settings) | inchangé, cross-référencé |
| UC30-11/12 | Consulter/Modifier informations organisation | IMPLEMENTED ailleurs (Settings) | inchangé, cross-référencé |
| UC30-14/15/16 | Créer/Modifier/Supprimer un poste | NOT IMPLEMENTED | **BLOCKED** (`docs/PHASE_06_DECISIONS_A_VALIDER.md` §3) |
| UC30-20/21/22 | Comités | NOT IMPLEMENTED | **BLOCKED** (§4) |
| UC30-23/24/25 | Statuts / règlement intérieur | NOT IMPLEMENTED | **OUT OF SCOPE** (dépend de Documents) |
| UCX1-01→15 | Workflow de candidature (dépôt, étude, validation) | NOT IMPLEMENTED | **BLOCKED** (§2 — entité candidate non sourcée) |
| UCX5-05 | Enregistrer les présences | NOT IMPLEMENTED | **BLOCKED** (§5 — pas de structure `Attendance`) |
| UC01-01 / UC10-08 | Configurer le tenant (contradiction PLATFORM/TENANT) | contradiction Phase 4 §8 | non retranchée, écran Settings existant inchangé |

## 2. Classes traitées

| Classe | Frontend existant | Frontend ajouté | Service | Tenant scope | Notes |
|---|---|---|---|---|---|
| `Member` | type + CRUD complet | statut suspendu/réactivé (réutilise `updateMember`) | `organizationService` | direct (`tenantId`) | aucun nouveau champ |
| `Assembly` | type + liste | création (`createAssembly`) | `organizationService` | direct (`tenantId`), déjà à plat malgré la relation indirecte du modèle canonique — voir §9 | aucun nouveau champ |
| `Meeting` | type + liste | création, publication du PV (`createMeeting`, `updateMeetingMinutes`) | `organizationService` | direct (`tenantId`) | aucun nouveau champ |
| `Vote` | type + liste | création, publication de résultat (`createVote`, `updateVoteResult`) | `organizationService` | direct (`tenantId`) | pas de `assemblyId` — voir décision à valider §1 |
| `BoardMember` | type + liste (fusionne déjà `Mandate`) | nomination, clôture de mandat (`createBoardMember`, `endBoardMandate`) | `organizationService` | direct (`tenantId`) | aucune classe `Mandate` séparée créée — cohérent avec la fusion déjà actée (Phase 2) |
| `Position` (per-member) | type + affichage (onglet Positions du membre) | — | — | via `Member` | catalogue de postes non traité, cf. décision §3 |
| `Committee` | absent | non créé | non créé | — | BLOCKED, cf. décision §4 |

## 3. Routes

Aucune nouvelle route. Les 5 routes Governance existantes (`/organization/governance`, `/governance/assemblies`, `/governance/meetings`, `/governance/votes`, `/governance/board-mandates`) et les 4 routes Members (`/organization/members`, `members/create`, `members/:id`, `members/:id/edit`) sont inchangées — toute la nouvelle fonctionnalité est portée par des modales (`ConfirmDialog`) et des actions en ligne dans les pages existantes.

## 4. Pages modifiées

- `MemberDetail` (`organization-module.tsx`) — action Suspendre/Réactiver.
- `GovernanceTablePage` (les 4 variantes `assemblies`/`meetings`/`votes`/`boardMandates`) — bouton de création rendu fonctionnel, actions en ligne conditionnelles (publier le PV, clôturer le mandat, publier le résultat).

## 5. Components

Aucun nouveau composant fichier créé. Réutilisation de `ConfirmDialog` (`src/components/confirm-dialog.tsx`, déjà utilisé ailleurs avec un slot `children` pour embarquer un mini-formulaire — pattern déjà en place dans `operations-module.tsx`) et de `Textarea` (`src/components/ui/textarea.tsx`, déjà présent mais non encore utilisé dans ce module).

## 6. Services

7 nouvelles méthodes sur `organizationService` (`src/services/organization.service.ts`), toutes suivant le pattern déjà en place (`mockRequest`, `getTenantScoped` pour les mises à jour, push direct avec `tenantId` explicite pour les créations) :

`createAssembly`, `createMeeting`, `updateMeetingMinutes`, `createBoardMember`, `endBoardMandate`, `createVote`, `updateVoteResult`.

Aucun accès direct aux mocks depuis les composants — tout passe par le service. Aucun appel réseau réel introduit (le mock reste en mémoire, `BACKEND PENDING` comme partout ailleurs dans le projet).

## 7. Queries / Mutations

Toutes les nouvelles mutations utilisent `useMockMutation` (`src/hooks/use-mock-mutation.ts`, déjà existant) avec invalidation ciblée des `queryKeys.governance.*`/`queryKeys.members.*` déjà définies dans `src/services/query-keys.ts` — aucune nouvelle clé de requête introduite, aucun accès `useQuery`/`useMutation` brut en dehors de ce hook standard.

## 8. RBAC

Aucune permission inventée — réutilisation stricte du catalogue existant (`src/mocks/rbac.mocks.ts`) :

- `members.update` — Suspendre/Réactiver un membre.
- `governance.create` — créer une assemblée, une réunion, un membre du bureau, un vote.
- `governance.approve` — publier un PV, clôturer un mandat, publier un résultat de vote (mapping retenu : ces actions finalisent/valident un contenu déjà créé, sémantique la plus proche du catalogue existant à 3 permissions `governance.read/create/approve`, sans `update`/`delete` séparés).

Tous les boutons d'action sont gardés par `PermissionGate`, jamais par une comparaison directe de rôle (`if role === ...`).

## 9. Tenant isolation

Les 4 types mock Governance (`Assembly`, `Meeting`, `Vote`, `BoardMember`) portent chacun un `tenantId` **direct** — contrairement à ce que suggère le modèle canonique (Phase 5 signale certaines classes comme indirectes via relation parent), le modèle frontend déjà simplifié aplatit ce champ, cohérent avec la fusion déjà actée pour `BoardMember`/`Mandate`. Conformément à la règle « une relation parent peut assurer le tenant scope, analyser avant de modifier » : **aucune modification du modèle n'a été faite**, le pattern `.filter(x => x.tenantId === tenantId)` / `getTenantScoped` déjà en place pour les autres domaines continue de s'appliquer tel quel à toutes les nouvelles méthodes.

**Vérification directe en environnement** (`npm run dev`, headless Chrome + script CDP) : un membre du bureau créé sous le tenant courant (T-001, « Coopérative Sutura ») a été confirmé **absent** de la liste Bureau & Mandats après bascule vers T-002 (`localStorage['tanzen-tenant-id'] = 'T-002'`) — aucune fuite inter-tenant constatée.

## 10. i18n

Toutes les nouvelles chaînes passent par `t('organization', ...)`. La grande majorité des libellés nécessaires existait déjà (préprovisionnée : `createAssembly`, `createMeeting`, `createVote`, `addBoardMember`, `agenda`, `minutes`, `mandateStart`, `mandateEnd`, etc.). 22 nouvelles clés ajoutées en FR et EN (`title`, `selectMember`, `suspendMember`, `reactivateMember`, `suspendMemberConfirm`, `reactivateMemberConfirm`, `memberSuspended`, `memberReactivated`, `assemblyCreated`, `meetingCreated`, `publishMinutes`, `publishMinutesConfirm`, `minutesPublished`, `boardMemberAdded`, `endMandate`, `endMandateConfirm`, `mandateEnded`, `voteCreated`, `publishResult`, `publishResultConfirm`, `resultPublished`) — `src/locales/fr/index.ts` et `src/locales/en/index.ts`.

## 11. Themes

Aucun style codé en dur — exclusivement les tokens shadcn déjà utilisés dans tout le module (`bg-primary`, `text-muted-foreground`, classes de `Card`/`Button`/`Input`/`Label`/`Textarea` existantes). Aucun token `landing-*` (réservé au site public) utilisé ici.

## 12. Accessibility

Chaque nouveau champ de formulaire a un `<Label htmlFor>` associé, cohérent avec le pattern déjà utilisé pour `MemberFormFields`. `ConfirmDialog` porte déjà `role="dialog" aria-modal="true" aria-labelledby` (composant réutilisé sans modification). Les actions en ligne conditionnelles (publier le PV, clôturer le mandat, publier le résultat) sont des `<Button>` texte explicite, pas des icônes seules sans libellé.

## 13. Responsive

Aucun changement de layout global — les formulaires en dialogue utilisent `grid grid-cols-2 gap-3` pour les paires de champs courtes (date/participants, début/fin de mandat), qui se comportent comme le reste de l'app (pas de `sm:`/`lg:` supplémentaire nécessaire, `ConfirmDialog` est déjà responsive par construction : `max-w-md`, `w-full`, `p-4`).

## 14. Tests

Playwright non disponible dans cet environnement (constaté dans les phases précédentes). Vérification effectuée via :
1. `npm run typecheck`, `npm run lint`, `npm run build` (voir §15).
2. Captures d'écran Chrome headless (assemblées, réunions, votes, bureau & mandats) confirmant le rendu correct des boutons de création et des actions conditionnelles par ligne.
3. Script Node + Chrome DevTools Protocol (`--remote-debugging-port`), exécuté contre l'application réellement lancée (`npm run dev`) : cycle complet création → apparition dans la liste → clôture de mandat → disparition de l'action → bascule de tenant → non-fuite inter-tenant, décrit en détail au §9.

## 15. Build

`tsc --noEmit -p tsconfig.app.json` — 0 erreur. `eslint .` — 0 erreur, 14 warnings pré-existants sans rapport avec cette mission (fichiers `ui/badge.tsx`, `ui/button.tsx`, etc., déjà présents avant cette phase). `vite build` — succès (7,25 s), même avertissement pré-existant sur la taille de chunk (>500 kB), inchangé depuis les phases précédentes.

## 16. UC partiels ou manquants

Voir la colonne « Statut après » du tableau §1 — résumé : PARTIAL (1 : UCX5-03, agenda en texte libre) ; BLOCKED (4 : UC30-14/15/16, UC30-20/21/22, UCX1-01→15, UCX5-05) ; OUT OF SCOPE (1 : UC30-23/24/25).

## 17. Contradictions rencontrées

Aucune contradiction Phase 4/5 n'a nécessité d'arbitrage direct pour le travail livré dans cette phase. La contradiction déjà documentée (UC01-01 PLATFORM vs UC10-08 TENANT, « Configurer le tenant », Phase 4 §8) n'a pas été retranchée — l'écran existant sous Settings (`SettingsOrganization`, lien vers le Tenant Registry Platform) reste inchangé et continue de la contourner de facto sans la résoudre.

## 18. Décisions à valider

6 sujets consolidés dans `docs/PHASE_06_DECISIONS_A_VALIDER.md` : 2 À VALIDER (`Vote.assemblyId`, statut du workflow de candidature UCX1), 4 BLOQUANT (catalogue de postes, `Committee`, présences `Attendance`, scrutins multi-options `VoteOption` — ce dernier non bloquant pour le scrutin binaire déjà livré).

## 19. Fichiers modifiés

- `src/services/organization.service.ts` — 7 nouvelles méthodes + 4 nouveaux types d'entrée (`AssemblyInput`, `MeetingInput`, `BoardMemberInput`, `VoteInput`).
- `src/features/organization/organization-module.tsx` — `MemberDetail` (action suspendre/réactiver), `GovernanceTableShell` (bouton de création connecté), `GovernanceTablePage` (formulaires de création + actions en ligne pour les 4 variantes).
- `src/locales/fr/index.ts`, `src/locales/en/index.ts` — 22 nouvelles clés dans la section `organization`.
- `docs/PHASE_06_DECISIONS_A_VALIDER.md` — nouveau.
- `docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md` — nouveau (le présent document).

Aucun autre fichier (mock, service, composant d'un autre domaine) n'a été modifié.

---

*Fin du rapport Phase 6. Ne pas commencer la Phase 7.*
