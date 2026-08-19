# P1 TANZEN — MEMBERS / USERS — AUDIT + IMPLEMENTATION REPORT

**Mandat** : Audit + correction ciblée de la création des membres — clarification USER vs
MEMBER — cible `tanzen-frontend` + `tanzen-commercial` (audit), implémentation
`tanzen-frontend` uniquement.
**Mode** : AUDIT FIRST → IMPLEMENTATION CIBLÉE
**Statut** : ✅ IMPLÉMENTÉ — audit terminé, régression complète au vert

---

## 1. Résumé exécutif

L'audit confirme que **USER et MEMBER étaient déjà correctement séparés** dans
`tanzen-frontend` — deux types, deux services, deux écrans, deux arbres de routes, aucune
relation implicite (`memberId`/`userId` absents des deux types), et la séparation est même
**déjà explicitement documentée dans le code lui-même**
(`src/mocks/access/users.ts:4-9` : *« Volontairement indépendant de Member [...] les deux
concepts ne sont pas fusionnés »*). Aucune fusion, aucune relation, aucune duplication n'a été
introduite par ce mandat — la structure existante a été **confirmée**, pas reconstruite.

Le vrai travail de ce mandat portait sur l'alignement du modèle **Member** avec le
dictionnaire canonique fourni (`uuid`, `matricule`, `sync_status`, `version`, timestamps
techniques, `created_by`/`updated_by`, statut `EXITED`), la correction de **trois défauts
réels constatés** dans le formulaire de création (tenant sélectionnable, genre jamais
transmis, email/téléphone forcés obligatoires malgré leur nullabilité), l'application
service-side des 4 contraintes d'unicité du dictionnaire, et la préparation UX (sans
persistance) d'un contrôle photo — un vrai `MODEL GAP` confirmé par audit : **aucun mécanisme
de stockage de fichier n'existe nulle part dans `tanzen-frontend`** (le seul précédent,
`DocumentRecord`, ne stocke que des métadonnées, jamais le contenu réel d'un fichier).

`tanzen-commercial` : **NO CHANGE REQUIRED**, confirmé par audit direct (aucune logique
métier Member/User, seulement un commentaire RBAC qui liste `Member` explicitement comme une
donnée jamais dupliquée côté commercial).

## 2. USER vs MEMBER

| Cas | Constat |
|---|---|
| USER = utilisateur système | `SystemUser` (`src/mocks/access/users.ts`) — authentification, RBAC, MFA, session. |
| MEMBER = adhérent métier | `Member` (`src/mocks/organization/members.ts`) — cotisant, participant tontine, emprunteur, votant. |
| Relation implicite | **Aucune, confirmée absente** — `memberId` n'existe pas sur `SystemUser`, `userId` n'existe pas sur `Member` (vérifié par grep exhaustif et par test, §14). |
| Création croisée | **Aucune** — `organizationService.createMember` ne touche jamais `users` ; `userService.create` ne touche jamais `members` (vérifié par test, §14). |
| Séparation déjà documentée | Oui, dans le code lui-même (`users.ts:4-9`), antérieure à ce mandat. |

Ce mandat n'a ni fusionné, ni relié, ni dupliqué ces deux concepts — la règle fondamentale du
mandat (§4) était déjà respectée par l'architecture existante.

## 3. Audit `tanzen-frontend`

| Élément | USER | MEMBER | État |
|---|---|---|---|
| Modèle | `SystemUser` | `Member` | 🟢 Séparés |
| Type TS | `src/mocks/access/users.ts` | `src/mocks/organization/members.ts` | 🟢 |
| Service | `src/services/user.service.ts` | `src/services/organization.service.ts` (`createMember`/`updateMember`/`getMember`/`listMembers`) | 🟢 Séparés, aucun `MemberService` dupliqué créé |
| Mock | `users: SystemUser[]` (3 seed) | `members: Member[]` (8 seed) | 🟢 |
| Page | `access-module.tsx` (`UsersDirectory`, `UserCreate`, `UserDetail`) | `organization-module.tsx` (`MembersDirectory`, `MemberCreate`, `MemberDetail`, `MemberEdit`) | 🟢 Écrans distincts |
| Route | `/access-security/users/*` | `/organization/members/*` | 🟢 Arbres de navigation distincts (Administration/Identity vs Organisation) |
| Création | `UserCreate` → `userService.create` | `MemberCreate` → `organizationService.createMember` | 🟢 Aucun couplage, testé (§14) |
| RBAC | `users.read/create/update/delete` | `members.read/create/update/delete` | 🟢 Permissions distinctes, non modifiées |
| Tenant isolation | `getTenantScoped`, scope `'tenant'\|'platform'` | `getTenantScoped` | 🟡 Member : gap réel trouvé et corrigé (§6) |
| Fiscal Year | Aucun lien | Aucun lien | ⚪ Sans objet — ni l'un ni l'autre ne référence `FiscalYear`, cohérent avec §12 du mandat |
| Photo | Absent | Absent | 🔴 MODEL GAP confirmé (§8) |

## 4. Audit `tanzen-commercial`

Recherche exhaustive de `Member`/`memberId` et `User`/`SystemUser` dans
`tanzen-commercial/src` :

- `src/mocks/rbac.mocks.ts:18` — un commentaire qui liste explicitement `Member` comme une
  donnée métier **jamais** dupliquée côté commercial (*« jamais les données métier d'un tenant
  (Member/Account/Loan/Tontine/Cycle/...) »*).
- `src/features/public/signup-page.tsx` — le seul autre résultat est un import de l'icône
  `User` (lucide-react) pour un champ de formulaire visuel, pas une entité `SystemUser`.

**Aucune logique métier Member ou User n'existe dans `tanzen-commercial`.**

```
tanzen-commercial = NO CHANGE REQUIRED
```

Confirmé par `git status` (§21) : aucun fichier modifié dans ce dépôt.

## 5. Architecture existante conservée

- `mockRequest`/`getTenantScoped` (pattern d'accès mock) — réutilisés tels quels.
- `useMockMutation` (hook de mutation standard) — réutilisé tel quel, y compris son pattern
  `onSuccess(data)` avec `data` potentiellement `undefined` (déjà utilisé par `CycleCreate`
  dans le domaine Tontine) pour distinguer succès/échec de création.
- `MemberStatusHistoryEntry`/`statusHistory` (D-4C4-WEB-03, historisation par statut) — conservé
  intact, la nouvelle valeur `exited` s'y intègre sans modification de mécanisme.
- `FormSection`/`Label`/`Input`/`FieldError` (composants de formulaire partagés) — réutilisés,
  aucun nouveau composant de champ créé.
- `notify` (toasts) — réutilisé pour les erreurs de validation de fichier photo.
- i18n (`t('organization', ...)`) — toutes les nouvelles chaînes ajoutées dans la section
  `organization` déjà existante, aucun nouveau mécanisme i18n créé.
- RBAC (`members.create`/`members.update`) — inchangé, aucune permission ajoutée ou modifiée.

## 6. Modèle Member appliqué

### 6.1 Champs ajoutés (dictionnaire canonique `members`)

`uuid`, `matricule`, `syncStatus`, `version`, `createdAt`, `updatedAt`, `deletedAt`,
`createdBy`, `updatedBy` — ajoutés à `Member` (`src/mocks/organization/members.ts`), générés
et gérés exclusivement par `organizationService`, **jamais exposés dans le formulaire**
(conforme à l'exigence explicite du mandat).

- `uuid` : généré via `crypto.randomUUID()` (API native du navigateur, aucune dépendance
  ajoutée) — aucun mécanisme `uuid` préexistant dans le projet à réutiliser (vérifié, zéro
  occurrence ailleurs).
- `matricule` : champ optionnel, aucune génération automatique (aucune logique préexistante
  à réutiliser — conforme à l'instruction de ne pas en inventer une).
- `syncStatus`/`version` : valeurs statiques (`'synced'`, `1`), aucun moteur de
  synchronisation ni de verrouillage optimiste réel n'existe dans le projet (confirmé
  absent partout, y compris pour les 5 autres domaines déjà audités dans cette série de
  mandats) — `version` est néanmoins réellement incrémenté à chaque `updateMember`.
- `createdBy`/`updatedBy` : référencent `SystemUser.id` (`currentUser.id`) — **une donnée
  d'audit (qui a effectué l'action), pas une relation d'identité Member↔User** ; cette
  distinction est documentée explicitement dans le code (`members.ts`) pour éviter toute
  confusion avec la règle « ne pas créer de relation User↔Member » (§4/§13 du mandat), qui
  concerne l'identité du membre lui-même, pas la traçabilité des actions.

**Tension signalée, non résolue unilatéralement** : ces champs entrent en tension avec une
convention Web déjà documentée ailleurs dans le projet
(`src/mocks/organization/governance.ts:26-27` : *« uuid/sync_status/version/timestamps
restent volontairement exclus [des entités Web] — aucun besoin Web démontré »*). Ce mandat
demandant explicitement et nommément ces champs pour `Member`, ils ont été implémentés pour
cette seule entité — la question de savoir si cette convention project-wide doit être révisée
plus largement reste `DECISION_REQUIRED` (§17).

### 6.2 Statut étendu

`MemberStatus` passe de 4 à 5 valeurs : `'active' | 'inactive' | 'suspended' | 'pending' | 'exited'`.
`pending` (préexistant, workflow de demande d'adhésion réellement utilisé — voir M-004,
`eligibility.service.ts`) **conservé tel quel** — le retirer aurait cassé une fonctionnalité
en production sans preuve qu'elle soit obsolète (instruction explicite du mandat). `exited`
**ajouté** en plus, pour couvrir la valeur canonique du dictionnaire — les deux valeurs ne se
recouvrent pas sémantiquement (adhésion non encore approuvée vs adhésion terminée). Vérifié
non-régressif sur tous les consommateurs de `MemberStatus` du projet (`eligibility.service.ts`,
`dashboard.service.ts` — aucun ne fait de correspondance exhaustive cassée par l'ajout).

### 6.3 Défauts réels corrigés dans le formulaire de création

1. **Tenant sélectionnable** — `MemberCreate`/`MemberEditForm` proposaient un `<select>`
   permettant de choisir n'importe quel tenant listé (`listTenants`). Corrigé : le champ est
   retiré du formulaire, `tenantId`/`tenantName` sont désormais dérivés exclusivement de
   `useTenant().currentTenant`, jamais éditables par l'utilisateur.
2. **`gender` jamais transmis** — le formulaire ne collectait jamais le genre ; le service
   `createMember` le forçait silencieusement à `'female'` pour tout nouveau membre (bug réel,
   confirmé par lecture du code avant modification). Corrigé : champ ajouté au formulaire
   (valeurs `male`/`female`, plus une option « non renseigné » puisque le dictionnaire déclare
   ce champ nullable), et le forçage silencieux a été retiré du service.
3. **`email` obligatoire malgré sa nullabilité déclarée** — devenu optionnel (validation de
   format conservée uniquement si une valeur est saisie) ; aucune règle métier existante ne
   justifiait de le garder obligatoire (vérifié : `email` n'est consommé qu'en affichage
   ailleurs dans l'application).

## 7. Modèle User vérifié

Aucune modification. `SystemUser`/`user.service.ts`/`UserCreate` inchangés — l'audit confirme
qu'ils ne nécessitent aucune correction au regard de ce mandat (aucun couplage à `Member`,
aucun champ `photo`, isolation tenant déjà correcte).

## 8. Photo Member

**MODEL GAP confirmé par audit, non comblé par une invention** : recherche exhaustive du
mécanisme de fichier le plus proche existant dans le projet —
`DocumentRecord`/`documentService` (`src/mocks/operations/documents.ts`,
`src/services/document.service.ts`) — montre qu'il ne stocke **que des métadonnées** (`name`,
`mimeType`, `sizeKb`, `uploadedBy`...), jamais le contenu réel du fichier ni un chemin/URL
persistant ; la fonction de téléchargement existante (`downloadDocument`,
`operations-module.tsx`) fabrique même un texte factice côté client plutôt que de restituer un
vrai fichier. **Il n'existe donc aucun mécanisme de stockage de fichier réel, nulle part dans
`tanzen-frontend`.**

Conformément à l'instruction explicite du mandat, **aucun champ `photo`/`avatar` n'a été
ajouté à `Member`**, et aucune architecture de stockage n'a été inventée. L'UX a été préparée
comme autorisé (§8 du mandat) :

- `MemberPhotoField` (`organization-module.tsx`) — bouton de sélection, aperçu (via
  `URL.createObjectURL`, révoqué proprement à chaque changement/démontage), bouton de
  suppression, validation du type (image uniquement) et de la taille (5 Mo max), message
  explicite indiquant que la photo n'est pas encore persistée.
- L'état de la photo vit **uniquement en mémoire du composant** (`useState`), jamais transmis
  à `organizationService.createMember`/`updateMember` — `MemberInput` ne porte aucun champ
  photo.

```
MODEL_GAP: Member photo storage requires a dedicated data/storage decision.
```

## 9. Stockage local

Aucun mécanisme de stockage local (fichiers/images) n'a été trouvé ailleurs dans le projet à
réutiliser (§8). Aucune convention `/uploads/`, `/local/...` ou équivalente n'existe.
Conformément à l'instruction explicite (§9 du mandat), **aucune architecture de stockage n'a
été inventée** — le gap est documenté (§8), pas comblé.

## 10. Tenant isolation

`tenantId` est désormais dérivé exclusivement de `useTenant().currentTenant.id` dans
`MemberCreate` et `MemberEditForm` — le sélecteur de tenant a été retiré du formulaire partagé
`MemberFormFields`. Côté service, `createMember`/`updateMember` restent tenant-scopés comme
avant (`getTenantScoped`), et les contraintes d'unicité `tenant_id`-scopées (`phone`, `email`,
identité) sont vérifiées **côté service**, non contournables par la seule validation UI
(instruction explicite du mandat §10 du mandat précédent, reprise ici) — testé (§14).

## 11. Fiscal Year compatibility

Confirmé : `Member` ne référence `FiscalYear` d'aucune manière, avant comme après ce mandat.
Aucun membre n'est recréé, dupliqué ou rattaché à un exercice — un membre reste une donnée du
`Tenant`, permanente, indépendante du cycle de vie des exercices fiscaux (cohérent avec
l'architecture déjà établie dans les mandats précédents de cette série, `docs/P1_TONTINE_D-TON-04_*`).
Aucune incohérence n'a été trouvée dans le code existant sur ce point — rien à signaler comme
conflit.

## 12. Services / types / mocks

Aucun nouveau service, aucun nouveau type `Member`, aucun nouveau mock créé — uniquement des
extensions du type et du service existants :

- `src/mocks/organization/members.ts` : `MemberStatus` (+`exited`), `MemberGenderValue`
  (nouveau, `MemberGender | ''`), `MemberSyncStatus` (nouveau), `Member` (+9 champs).
- `src/services/organization.service.ts` : `MemberInput` (+`gender`, `matricule`,
  `joinedAt?`), `createMember` (uuid, contraintes d'unicité, champs techniques),
  `updateMember` (contraintes d'unicité à l'exclusion de soi-même, `version`/`updatedAt`/
  `updatedBy`), nouvelle fonction `findMemberDuplicate` (lookup de raison de doublon pour
  l'UI — la seule fonction réellement nouvelle du service, justifiée par le besoin de
  messages d'erreur distincts par contrainte, cf. §16 du mandat).

## 13. UI / routes

Aucune route ajoutée ou modifiée. `src/features/organization/organization-module.tsx` :
`MemberFormValues`/`MemberFormErrors`/`validateMember`/`MemberFormFields`/`MemberCreate`/
`MemberEditForm`/`buildMemberInput`/`MembersDirectory` (filtre `exited`)/`statusTone`
(entrée `exited`) modifiés. Nouveau composant local `MemberPhotoField` (UX uniquement, §8).
Navigation globale non touchée (déjà conforme — Users dans Administration/Identity, Members
dans Organisation, jamais mélangés).

## 14. Tests

43 tests dans `src/services/organization.service.test.ts` (26 préexistants inchangés + 17
nouveaux) :

- **Member — création** : uuid généré et unique par membre, `tenantId` dérivé, technique
  (`syncStatus`, `version`, `createdBy`/`updatedBy`, `deletedAt`), `joinedAt` par défaut vs
  explicite.
- **Contraintes d'unicité** : `matricule` (globale, cross-tenant — vérifié explicitement non
  tenant-scopée, conforme au dictionnaire), `phone`/`email` (tenant-scopées, autorisées entre
  tenants différents), identité (`tenant_id`+`first_name`+`last_name`+`join_date`), non-collision
  des valeurs vides (sémantique NULL, pas égalité de chaîne vide).
- **`findMemberDuplicate`** : raison spécifique retournée, cohérente avec ce que `createMember`
  applique réellement.
- **`updateMember`** : incrémentation de `version`, horodatage `updatedAt`/`updatedBy`,
  contraintes d'unicité excluant le membre lui-même.
- **Statut étendu** : `exited` fonctionnel et historisé, `pending` non régressé.
- **USER vs MEMBER** : créer un Member ne crée pas de User et réciproquement (vérifié par
  comptage avant/après sur les deux collections) ; absence structurelle de `userId`/`memberId`
  sur les deux types.

Résultat : **43/43 passés**.

## 15. Typecheck / lint / build

| Commande | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur (15 warnings pré-existants, sans rapport avec ce mandat) |
| `npm run i18n:check` | ✅ 2/2 (parité FR/EN) |
| `npm test` | ✅ **321/321** (304 préexistants + 17 nouveaux) |
| `npm run build` | ✅ build production réussi |

## 16. Model gaps

| Gap | Constat |
|---|---|
| Photo Member | Aucun mécanisme de stockage de fichier réel nulle part dans le projet — voir §8. Non comblé, documenté. |
| `sync_status`/`version`/`uuid` | Tension avec la convention Web déjà documentée (`governance.ts`) qui exclut volontairement ces champs — implémentés ici uniquement parce que ce mandat les demande nommément pour `Member`. Voir §17. |

## 17. Décisions nécessitant validation PO

| ID | Sujet | Constat | Options |
|---|---|---|---|
| DECISION_REQUIRED-1 | Photo Member | Aucun mécanisme de stockage de fichier n'existe dans `tanzen-frontend` | (a) construire un mécanisme dédié (chantier séparé, backend ou stockage navigateur persistant) ; (b) laisser l'UX préparée telle quelle (aperçu non persistant) jusqu'à décision |
| DECISION_REQUIRED-2 | Convention `uuid`/`sync_status`/`version` project-wide | Ce mandat les ajoute à `Member` seul, en tension avec l'exclusion volontaire déjà documentée pour les autres entités Web (`governance.ts`) | (a) confirmer `Member` comme exception nommée ; (b) étendre la même logique aux autres entités si un besoin réel émerge ; (c) revenir sur `Member` pour rester cohérent avec la convention existante |
| DECISION_REQUIRED-3 | `UNIQUE(matricule)` globale (pas tenant-scopée) | Implémentée telle qu'écrite dans le dictionnaire — inhabituel par rapport aux autres contraintes du projet, toutes tenant-scopées | (a) confirmer la portée globale (comportement actuel) ; (b) la rendre tenant-scopée comme les autres contraintes |
| DECISION_REQUIRED-4 | Statut `pending` vs `EXITED` | Les deux valeurs coexistent désormais (additif) — le dictionnaire ne mentionne pas `pending` | (a) conserver les deux, tel qu'implémenté ; (b) fusionner/renommer une fois le workflow d'adhésion (déjà utilisé par `eligibility.service.ts`) revu séparément |

## 18. Fichiers créés

```
docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md   (ce rapport)
```

## 19. Fichiers modifiés

```
tanzen-frontend/
  src/mocks/organization/members.ts
  src/services/organization.service.ts
  src/services/organization.service.test.ts
  src/features/organization/organization-module.tsx
  src/locales/fr/index.ts
  src/locales/en/index.ts
```

## 20. Fichiers supprimés

Aucun.

## 21. Git

```
=== tanzen-frontend ===
 M src/features/organization/organization-module.tsx
 M src/locales/en/index.ts
 M src/locales/fr/index.ts
 M src/mocks/organization/members.ts
 M src/services/organization.service.test.ts
 M src/services/organization.service.ts
?? docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md
?? docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md        (mandat antérieur, sans rapport)
?? docs/P1_TONTINE_D-TON-04_REVISION_TONTINE_CYCLES_DECISION_GATE.md (mandat antérieur, sans rapport)

=== tanzen-commercial ===
(clean — NO CHANGE REQUIRED, confirmé §4)

=== tanzen-mobile ===
 M app/index.tsx                                                    (préexistant, sans rapport avec ce mandat)
?? docs/MOBILE_GOVERNANCE_NAVIGATION_AUDIT.md                       (préexistant, sans rapport)
?? docs/PHASE_4C3_WEB_TO_MOBILE_TRANSFER_AUDIT.md                    (préexistant, sans rapport)
```

Aucun commit, aucun push.

---

## Statut final

```
Résumé : USER/MEMBER déjà correctement séparés (confirmé, non reconstruit) ; modèle Member
aligné sur le dictionnaire canonique (uuid/matricule/sync_status/version/timestamps/
created_by/updated_by, status+EXITED) ; 3 défauts réels corrigés (tenant sélectionnable,
gender jamais transmis, email forcé obligatoire) ; 4 contraintes d'unicité appliquées
côté service ; photo préparée en UX uniquement (MODEL GAP confirmé, non comblé).

tanzen-frontend : IMPLÉMENTÉ
tanzen-commercial : NO CHANGE REQUIRED
tanzen-mobile : NON TOUCHÉ

Typecheck : ✅ 0 erreur
Lint : ✅ 0 erreur
i18n:check : ✅ 2/2
Tests : ✅ 321/321
Build : ✅ réussi

Model gaps : 2 (photo storage, tension convention uuid/sync_status/version)
Décisions PO requises : 4

Commit : AUCUN
Push : AUCUN
```
