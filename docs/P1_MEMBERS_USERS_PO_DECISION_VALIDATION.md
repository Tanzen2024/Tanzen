# P1 MEMBERS — PO DECISION VALIDATION

**Mode : GOUVERNANCE / VALIDATION PO — READ-ONLY.** Aucun fichier de `tanzen-frontend/src/**`
ni de `tanzen-commercial/**` (mocks, services, repositories, routes, composants, hooks,
stores, types, locales, tests, configuration, `package.json`, migrations, schéma) n'a été
créé, modifié ou supprimé. Aucun commit, aucun push. Le seul livrable est ce document.

**Mise à jour 2026-08-18 : les 4 décisions ci-dessous sont désormais VALIDÉES par le PO, de
façon définitive** (D-MEM-01 = Option C, D-MEM-02 = Option C, D-MEM-03 = Option B, D-MEM-04 =
Option A + migration `PENDING → ACTIVE`) — voir §10, §14, §15 pour l'enregistrement formel de
chaque choix, `docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md` pour le détail exhaustif de
la migration de statut, et `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` pour la clôture
formelle du Decision Gate (`DECISION GATE = CLOSED`, `IMPLEMENTATION GO = READY`).

---

## 1. Executive Summary

Ce document formalise les 4 décisions PO restées ouvertes sur le modèle `Member` :
`D-MEM-01` (photo), `D-MEM-02` (`uuid`/`sync_status`/`version`), `D-MEM-03` (portée du
`matricule`), `D-MEM-04` (vocabulaire des statuts). Les affirmations du rapport d'audit
précédent (`docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md`) ont été **revérifiées
directement** dans le code et dans le dictionnaire canonique (`docs/dictionnaire_donnees.xlsx`,
extrait dans `docs/audit/excel_dictionary_dump.txt`) plutôt que reprises telles quelles —
aucun écart n'a été trouvé entre le rapport et l'état réel, mais deux tensions
**internes au dictionnaire lui-même** ont été identifiées et sont documentées ici pour la
première fois avec leurs citations exactes (`D-MEM-02`, `D-MEM-03`, §12). Aucune des 4
décisions n'est tranchée — toutes restent `🔴 OPEN`.

## 2. Scope

**Dans le périmètre** : analyse et formalisation des 4 décisions ci-dessus, pour
`tanzen-frontend` (et vérification de leur pertinence pour `tanzen-commercial`, sans
modification). **Hors périmètre** : toute implémentation, tout changement de code, de mock,
de service, de route, de test, de configuration, dans `tanzen-frontend`, `tanzen-commercial`
ou `tanzen-mobile`.

## 3. Sources examinées

Vérifiées directement pour ce document (pas seulement reprises d'un rapport antérieur) :

1. `docs/dictionnaire_donnees.xlsx`, extrait dans `docs/audit/excel_dictionary_dump.txt`,
   feuille `members` (lignes 121-134) et liste des contraintes (lignes 140-145) — source de
   vérité physique, rang 1.
2. `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` (ligne 43, schéma de classe `Member`) — cohérent
   avec la source 1 sur les champs, aucune contradiction supplémentaire trouvée.
3. `docs/P1_MEMBERS_USERS_AUDIT_IMPLEMENTATION_REPORT.md` — rapport d'implémentation, dont les
   affirmations principales ont été recontrôlées (§4 à §9 ci-dessous).
4. `src/mocks/organization/members.ts` (type `Member`, `MemberStatus`, `MemberSyncStatus`,
   `MemberGenderValue`) — code réel, relu intégralement pour ce document.
5. `src/services/organization.service.ts` (`createMember`, `updateMember`,
   `findMemberDuplicate`) — code réel, relu intégralement.
6. `src/mocks/access/users.ts` (`SystemUser`) et `src/services/user.service.ts` — code réel.
7. `src/mocks/organization/governance.ts:26-27` — convention Web documentée (exclusion
   volontaire de `uuid`/`sync_status`/`version`/timestamps).
8. `src/mocks/operations/documents.ts` / `src/services/document.service.ts`
   (`DocumentRecord`) — seul mécanisme de fichier du projet.
9. `src/services/eligibility.service.ts` — consommateur réel de `MemberStatus`.
10. `src/services/organization.service.test.ts` — 43 tests, dont ceux couvrant les 4 champs
    concernés par ces décisions.
11. Recherche exhaustive dans `tanzen-commercial/src` (`Member`/`User`) — aucune logique
    métier trouvée (déjà établi, revérifié §4).

Aucune source n'a été écartée au profit d'une autre. Aucune règle absente de ces sources n'a
été inventée.

## 4. USER vs MEMBER

| | USER (`SystemUser`) | MEMBER (`Member`) |
|---|---|---|
| Représente | Compte système, identité d'authentification, accès à l'application, RBAC, actions administratives | Adhérent, cotisant, participant aux activités financières et communautaires du tenant |
| Type | `src/mocks/access/users.ts` | `src/mocks/organization/members.ts` |
| Service | `src/services/user.service.ts` | `src/services/organization.service.ts` |
| Où il intervient | `tanzen-frontend` uniquement (`/access-security/users/*`) | `tanzen-frontend` uniquement (`/organization/members/*`) |
| `tanzen-commercial` | Aucune logique `SystemUser` trouvée (recherche exhaustive) | Aucune logique `Member` trouvée — un seul commentaire RBAC qui liste `Member` comme donnée jamais dupliquée côté commercial (`tanzen-commercial/src/mocks/rbac.mocks.ts:18`) |
| Relation explicite | **Aucune** — `memberId` absent de `SystemUser` (vérifié) | **Aucune** — `userId` absent de `Member` (vérifié) |

**`created_by`/`updated_by` sur `Member`** référencent `SystemUser.id` — une donnée d'audit
(qui a effectué l'action), **pas** une relation d'identité. Un `Member` ne devient pas un
`User` par ce biais ; aucune relation `User → Member` n'a été créée ou supposée au-delà de ce
que les sources montrent déjà (ce champ de traçabilité, présent depuis le mandat
d'implémentation précédent, non modifié ici).

## 5. Tenant vs Fiscal Year

```
TENANT
│
├── USERS
│   └── comptes système / authentification / RBAC
│
├── MEMBERS
│   └── adhérents / participants
│
└── FISCAL YEARS
    ├── FY 2024
    ├── FY 2025
    └── FY 2026
```

- **Tenant** = périmètre organisationnel permanent.
- **Fiscal Year** = périmètre temporel des données d'exercice, tenant-scopé, cycle de vie
  propre (`upcoming → open → closed`, réouverture via workflow — travaux antérieurs de ce
  même projet).
- **User ≠ Member** (§4). **Tenant ≠ Fiscal Year** — vérifié : `FiscalYear` porte son propre
  `tenantId`, distinct du concept de Tenant lui-même.
- **Member appartient au Tenant**, pas à un Fiscal Year : vérifié par relecture directe de
  `Member` — aucun champ `fiscalYearId` n'existe sur ce type, ni sur aucune entité du domaine
  `organization`.
- Les données d'activité d'un Member (cotisations, tirages, participations) **peuvent** être
  liées au Fiscal Year selon des règles métier déjà établies ailleurs dans le projet
  (domaine Finance/Tontine), mais ceci concerne ces entités-là, pas `Member` lui-même.
- **Aucune règle de transfert Fiscal Year n'est inventée ici.** Le principe déjà établi
  (`docs/P1_TONTINE_D-TON-04_REVISION_FINAL_DECISION_GATE.md` §6-7) — ne pas dupliquer une
  entité tenant-scopée permanente à chaque nouvel exercice — s'applique à `Member` par
  construction : aucune source, aucun code, ne prévoit de recréer un `Member` à la création
  d'un `FiscalYear`.

**Pour chacune des 4 décisions, dimension concernée :**

| Décision | Tenant | Fiscal Year | Les deux | Aucune |
|---|---|---|---|---|
| D-MEM-01 (Photo) | ✔ (donnée du Member, donc du Tenant) | | | |
| D-MEM-02 (uuid/sync/version) | ✔ | | | |
| D-MEM-03 (Matricule) | ✔ (si tenant-scopé) — à trancher | | | |
| D-MEM-04 (Statuts) | ✔ | | | |

Aucune des 4 décisions ne concerne le Fiscal Year directement — confirmé par l'absence totale
de couplage `Member`↔`FiscalYear` dans le code (§5 ci-dessus).

---

## 6. D-MEM-01 — Photo du Member

**Statut : 🟢 VALIDÉE — Option C retenue (Stockage objet / media storage dédié)**

### Problème

Définir le mécanisme officiel de persistance de la photo d'un Member.

### État actuel (vérifié directement)

- `MemberPhotoField` (`src/features/organization/organization-module.tsx`) : sélection de
  fichier, aperçu via `URL.createObjectURL`, remplacement, suppression, validation de type
  (image uniquement) et de taille (5 Mo) — **confirmé présent, état purement local au
  composant (`useState`), jamais transmis au service**.
- `Member` (`src/mocks/organization/members.ts`) : **aucun champ** photo — confirmé par
  relecture intégrale du type.
- `docs/audit/excel_dictionary_dump.txt` (feuille `members`, lignes 121-134) : **aucun champ
  photo dans le dictionnaire canonique** — son absence dans le modèle cible n'est donc pas un
  oubli d'implémentation, elle est cohérente avec la source de vérité elle-même.
- `DocumentRecord`/`documentService` (`src/mocks/operations/documents.ts`,
  `src/services/document.service.ts`) : seul mécanisme de fichier du projet, **confirmé
  métadonnées uniquement** (`id`, `name`, `category`, `mimeType`, `sizeKb`, `uploadedBy`,
  `uploadedAt`, rattachement par `entityType`/`entityId`) — **aucun champ ne porte le contenu
  binaire, un chemin de fichier, ni une URL persistante**. La fonction de téléchargement
  associée (`downloadDocument`, `operations-module.tsx`) fabrique un texte de substitution
  côté client plutôt que de restituer un fichier réel — preuve directe qu'aucun contenu n'est
  réellement stocké.
- Aucun mécanisme de stockage serveur, objet, ou filesystem local n'existe dans
  `tanzen-frontend` (recherche exhaustive : aucune occurrence de `multipart`, `FormData` vers
  un endpoint de stockage, `S3`, `blob storage`, ou équivalent).
- `tanzen-backend` : répertoire vide (confirmé par les audits précédents de cette série) —
  aucun stockage serveur n'existe à ce jour, quelle que soit l'entité.

### OPTION A — Stockage local / filesystem

Le fichier serait stocké sur un système de fichiers (serveur ou local au poste), avec une
référence conservée sur `Member` ou une entité dédiée.

- **Principe** : persistance physique hors base de données, référence uniquement en base.
- **Avantages** : pattern courant, séparation contenu/métadonnées.
- **Inconvénients** : aucun serveur de fichiers n'existe dans ce projet (`tanzen-backend` vide) ;
  suppose une infrastructure à construire entièrement.
- **Impact architecture** : nécessite un service de stockage nouveau, absent aujourd'hui.
- **Impact sécurité** : contrôle d'accès aux fichiers à définir (qui peut lire la photo d'un
  membre d'un autre tenant ?) — **NON DÉFINI — À VALIDER**.
- **Impact tenant isolation** : à garantir au niveau du chemin de stockage — **NON DÉFINI —
  À VALIDER**.
- **Impact backup** : dépend de l'infrastructure retenue — **NON DÉFINI — À VALIDER**.
- **Impact offline/sync** : aucune infrastructure offline/sync n'existe dans
  `tanzen-frontend` (confirmé par l'audit du domaine Tontine de cette même série,
  `docs/P1_TONTINE_FRONTEND_READ_ONLY_AUDIT.md` §14) — un mécanisme de fichier local devrait
  être conçu en cohérence avec cette absence, non résolu ici.
- **Impact Fiscal Year** : aucun, la photo n'a pas de rapport avec un exercice (voir point
  ci-dessous).
- **Impact `tanzen-frontend`** : composant `MemberPhotoField` déjà prêt à être branché sur un
  vrai appel de service, une fois celui-ci défini.
- **Impact `tanzen-commercial`** : aucun — confirmé, `tanzen-commercial` ne porte aucune
  logique `Member`.

### OPTION B — Stockage via infrastructure documentaire existante (`DocumentRecord`)

Réutiliser/étendre `DocumentRecord` (déjà rattachable à `entityType: 'member'`,
`entityId: member.id`) comme support de la photo.

- **Principe** : la photo devient un document parmi d'autres, rattaché au Member.
- **Avantages** : réutilise une structure déjà existante et déjà tenant-scopée
  (`documentService.list`/`create` sont tenant-scopés, vérifié) ; `entityType: 'member'`
  existe déjà dans `DocumentEntityType`.
- **Inconvénients** : `DocumentRecord` **ne stocke pas de contenu réel aujourd'hui** (état
  actuel ci-dessus) — cette option ne résout donc pas la persistance physique, elle ne fait
  que déplacer le problème vers une structure qui a le même gap.
- **Impact architecture** : nécessiterait d'abord de corriger le gap de `DocumentRecord`
  lui-même (hors périmètre de cette seule décision).
- **Impact sécurité / tenant isolation** : hérité de `documentService`, déjà tenant-scopé —
  point positif si cette option est retenue, une fois le contenu réel résolu.
- **Impact backup** : **NON DÉFINI — À VALIDER** (dépend de la résolution du gap sous-jacent).
- **Impact offline/sync** : même constat que l'Option A.
- **Impact Fiscal Year** : aucun.
- **Impact `tanzen-frontend`** : réutilisation d'un service existant plutôt qu'un nouveau.
- **Impact `tanzen-commercial`** : aucun.

### OPTION C — Stockage objet / media storage dédié

Un service de stockage média dédié (ex. object storage externe), avec une référence
(URL/clé) persistée.

- **Principe** : infrastructure spécialisée pour les fichiers binaires (images, documents),
  découplée de la base applicative.
- **Avantages** : scalable, pattern standard pour ce type de besoin.
- **Inconvénients** : n'existe pas aujourd'hui, ni en infrastructure ni en dépendance
  (aucune bibliothèque de ce type dans `package.json`, non vérifié en détail mais aucune
  mention trouvée dans le code applicatif) — le plus gros écart avec l'existant des trois
  options.
- **Impact architecture** : le plus important des trois — nouvelle dépendance externe.
- **Impact sécurité / tenant isolation / backup / offline** : **NON DÉFINI — À VALIDER**
  pour les quatre, dépendants du service retenu.
- **Impact Fiscal Year** : aucun.
- **Impact `tanzen-frontend`/`tanzen-commercial`** : aucun impact `tanzen-commercial` ;
  `tanzen-frontend` nécessiterait un nouveau client d'upload.

### La photo est-elle une donnée permanente du Member ou une donnée d'exercice ?

**Élément factuel, non tranché** : la photo est un attribut descriptif d'identité (comme
`firstName`/`birthDate`), pas un fait daté lié à une activité financière ou de gouvernance.
Par analogie avec le principe déjà établi (§5 : `Member` reste permanent, indépendant des
exercices), une photo suivrait logiquement le même statut — **mais aucune source ne le
confirme explicitement pour ce champ précis**, qui n'existe même pas dans le dictionnaire.
`NON CONFIRMÉ — NE PAS INVENTER` au-delà de cette analogie signalée.

### Recommandation (non contraignante)

Aucune des trois options n'est réalisable sans travail d'infrastructure préalable — c'est le
constat central, pas une préférence. Si une option devait être priorisée pour limiter l'effort
initial, l'Option B (réutilisation de `DocumentRecord`) est la plus proche de l'existant, mais
elle hérite du même gap de fond (aucun stockage de contenu réel) que les deux autres — elle ne
réduit que le travail de *structuration*, pas le travail de *stockage physique* lui-même. Le
PO peut aussi choisir de reporter cette décision (non listée comme option formelle ici, car
non demandée par le mandat, mais cohérente avec l'état actuel du code qui ne persiste déjà
rien).

## 7. D-MEM-02 — `uuid` / `sync_status` / `version`

**Statut : 🟢 VALIDÉE — Option C retenue (Convention project-wide explicite, modèle canonique ≠ modèle frontend)**

### Convention actuelle (code Web)

`src/mocks/organization/governance.ts:26-27` — commentaire documentant une décision déjà
prise pour d'autres entités du domaine `organization` : *« uuid/sync_status/version/timestamps
restent volontairement exclus (aucun besoin Web démontré) »*. Vérifié : aucune autre entité de
`tanzen-frontend` (Tontine, Fiscal Year, Governance, Finance, Credit) ne porte ces trois
champs à ce jour — `Member` en serait la seule exception si l'implémentation actuelle est
maintenue.

### Ce que dit le dictionnaire (vérifié directement)

`docs/audit/excel_dictionary_dump.txt` :
- Ligne 123 : `uuid | CHAR(36) | NOT NULL, UNIQUE | Référence externe unique (API, sync)`.
- Ligne 133 : `sync_status | VARCHAR(20) | DEFAULT 'SYNCED' | État de synchronisation des données`.
- Ligne 134 : `version | INT | DEFAULT 1 | Gestion de concurrence (optimistic locking)`.

### Autres entités concernées (vérifié — la contradiction n'est pas locale à Member)

Le dictionnaire porte les **mêmes trois champs** pour la feuille `users` (ligne 102-104 du
dump : `sync_status | VARCHAR(20) | DEFAULT 'SYNCED'`, `version | INT | DEFAULT 1`) — or
`SystemUser` (`src/mocks/access/users.ts`) ne les porte pas non plus aujourd'hui. **La
contradiction dictionnaire ↔ convention Web est donc project-wide, pas spécifique à
`Member`** — signalé explicitement, non résolu au-delà du périmètre Member/User de ce pack.

### État actuel de l'implémentation `Member` (vérifié)

- `uuid` : généré par `crypto.randomUUID()` à la création, jamais modifié — portée globale.
- `sync_status` : `MemberSyncStatus = 'synced' | 'pending' | 'failed'` (minuscules, écart de
  casse cosmétique avec `'SYNCED'` du dictionnaire), valeur statique `'synced'`, jamais
  modifiée par la suite — **aucun moteur de synchronisation réel n'existe** pour l'alimenter
  (confirmé absent project-wide).
- `version` : initialisé à `1`, **réellement incrémenté** à chaque `updateMember` — mais
  aucun contrôle de conflit (comparaison de version envoyée vs version courante) n'est
  implémenté ; le rôle d'« optimistic locking » assigné par le dictionnaire n'est donc que
  partiellement rempli (le compteur progresse, mais rien ne bloque une écriture concurrente
  basée sur une version périmée).

### OPTION A — Respecter strictement le dictionnaire canonique pour Member

`Member` conserve `uuid`/`sync_status`/`version` tels qu'implémentés, en dérogation assumée à
la convention `governance.ts`.

- **Architecture** : `Member` devient formellement une exception documentée.
- **Backend/Frontend** : aucun backend n'existe pour exploiter réellement ces champs
  aujourd'hui (`tanzen-backend` vide) — leur utilité reste théorique côté Web tant qu'aucune
  synchronisation réelle n'existe.
- **Offline/synchronisation** : `sync_status` resterait un champ figé sans mécanisme réel
  jusqu'à ce qu'une infrastructure offline soit construite (absente aujourd'hui, tous
  domaines confondus).
- **Optimistic locking** : `version` progresse mais ne bloque rien — écart avec le rôle
  attribué par le dictionnaire, signalé, non corrigé ici (correction = implémentation, hors
  périmètre READ-ONLY).
- **Fiscal Year** : aucun impact.
- **Compatibilité autres modules** : aucune, ces champs sont propres à `Member`.
- **Risque de régression** : faible — c'est l'état actuel, déjà testé (43 tests).

### OPTION B — Conserver la convention Web existante

Retirer `uuid`/`sync_status`/`version` de `Member`, aligné sur `governance.ts` et sur toutes
les autres entités Web du projet.

- **Architecture** : homogénéité retrouvée avec le reste du domaine `organization` et au-delà.
- **Backend/Frontend** : sans effet, aucun backend ne les consommait de toute façon.
- **Offline/synchronisation** : cohérent avec l'absence totale d'infrastructure de ce type.
- **Optimistic locking** : abandonné pour `Member`, comme pour toutes les autres entités.
- **Fiscal Year** : aucun impact.
- **Risque de régression** : **impact réel** — retrait de champs déjà livrés et testés (7+
  tests dédiés dans `organization.service.test.ts`), à traiter comme un retour en arrière
  explicite, pas une simple non-action.

### OPTION C — Convention project-wide explicite (modèle canonique ≠ modèle frontend)

Documenter formellement que le **dictionnaire canonique** (destiné à un futur backend/mobile)
et le **modèle frontend actuel** (mocks, sans backend réel) peuvent diverger sciemment sur ces
trois champs techniques, avec une règle explicite de convergence future (ex. : ces champs
seront réellement exploités quand un backend existera, pas avant).

- **Architecture** : la plus structurante des trois — établit une règle de gouvernance
  générale, au-delà de `Member`/`User`.
- **Backend/Frontend** : anticipe la trajectoire vers un vrai backend sans bloquer le
  développement Web actuel.
- **Offline/synchronisation** : la convention pourrait explicitement statuer que
  `sync_status` ne devient significatif qu'avec une vraie infrastructure offline — cohérent
  avec l'état actuel.
- **Fiscal Year** : aucun impact direct.
- **Compatibilité avec les autres modules** : concerne potentiellement Tontine, Governance,
  Finance, Credit, Users — **hors périmètre de ce pack à 4 décisions Member**, mais la
  décision devrait le signaler explicitement si retenue.
- **Risque de régression** : dépend de la mise en œuvre choisie ensuite, non déterminable ici.

### Recommandation (non contraignante)

Le constat central n'est pas « le dictionnaire gagne » — c'est que la contradiction dépasse
`Member` (elle touche aussi `users`, potentiellement d'autres entités canoniques non
vérifiées ici) et qu'aucune des trois options ne peut être choisie pour `Member` seul sans
implicitement présager d'une réponse pour le reste du projet. L'Option C est la seule qui
reconnaît explicitement cette portée, sans trancher la question sous-jacente.

## 8. D-MEM-03 — Portée du `matricule`

**Statut : 🟢 VALIDÉE — Option B retenue (Matricule tenant-scoped : `UNIQUE(tenant_id, matricule)`)**

**Conséquence directe sur l'implémentation actuelle (à traiter en Implementation GO, pas ici) :**
le code livré par le mandat d'implémentation précédent applique aujourd'hui l'Option A
(contrainte **globale**, non tenant-scopée — voir §8 « État actuel de l'implémentation »
ci-dessous). La décision validée (Option B) est **l'inverse** du comportement actuellement en
production. Ce document ne modifie pas le code (READ-ONLY) — cet écart est repris comme
prérequis d'implémentation dans `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` §10/§13.

### Différence avec `id`/`uuid`/`email`/`phone`

- `id` : identifiant technique interne (clé primaire), jamais saisi par l'utilisateur, sans
  signification métier.
- `uuid` : référence externe technique (API/sync), également non saisie par l'utilisateur.
- `email`/`phone` : coordonnées de contact, `UNIQUE(tenant_id, ...)` confirmées (dictionnaire,
  lignes 144-145 du dump).
- `matricule` : **code métier**, saisi ou attribué par l'organisation elle-même, destiné à
  identifier un membre selon les conventions internes du tenant (numérotation, codification
  propre) — un identifiant *fonctionnel*, pas technique, distinct des quatre autres par nature
  autant que par la question de sa portée.

### Contradiction interne au dictionnaire (reproduite fidèlement, citations exactes)

```
Description du champ (docs/audit/excel_dictionary_dump.txt:125, feuille members) :
  « matricule | VARCHAR(50) | UNIQUE, NULL | Identifiant interne du membre dans
    l'organisation »

Liste formelle des contraintes (docs/audit/excel_dictionary_dump.txt:143-145, même feuille) :
  « uq_members_matricule | UNIQUE (matricule)            | Unicité métier        »
  « uq_members_phone     | UNIQUE (tenant_id, phone)      | Unicité multi-tenant  »
  « uq_members_email     | UNIQUE (tenant_id, email)      | Unicité multi-tenant  »
```

La description en langage naturel (« dans l'organisation ») suggère une portée limitée au
tenant. La contrainte formelle est explicitement globale (`UNIQUE(matricule)`, sans
`tenant_id`) et porte une étiquette de catégorie (« Unicité métier ») **délibérément
distincte** de celle utilisée pour `phone`/`email` (« Unicité multi-tenant ») dans la même
liste, à deux lignes d'écart — ce n'est pas une omission de la part de l'auteur du
dictionnaire (qui a bien utilisé deux catégories différentes en conscience), mais une tension
réelle entre le texte descriptif et la contrainte formalisée.

### État actuel de l'implémentation (vérifié)

`organizationService.createMember`/`updateMember`/`findMemberDuplicate` appliquent la
contrainte **globale** (`UNIQUE(matricule)`, sans `tenant_id`) — conforme à la définition
formelle de la contrainte, testé par 2 tests dédiés confirmant explicitement qu'une collision
de matricule entre deux tenants différents est refusée.

### OPTION A — Matricule global

`UNIQUE(matricule)`, tel qu'implémenté aujourd'hui.

- **Unicité** : à l'échelle de la plateforme entière, tous tenants confondus.
- **Multi-tenancy** : impose une coordination implicite entre tenants indépendants (deux
  organisations distinctes ne peuvent pas réutiliser le même code matricule).
- **Migration** : aucune requise, comportement déjà en place.
- **Génération** : aucune génération automatique n'existe (confirmé, ni avant ni après ce
  mandat) — un matricule saisi par un tenant peut être bloqué par un matricule déjà pris par
  un autre tenant, sans que l'utilisateur du premier tenant ne sache pourquoi (aucune
  visibilité cross-tenant côté UI).
- **Import** : un import en masse de membres avec matricules pourrait échouer sur des
  collisions inter-tenants imprévisibles — **NON DÉFINI — À VALIDER** (aucun mécanisme
  d'import n'existe aujourd'hui pour vérifier ce point).
- **Recherche** : permettrait une recherche globale par matricule, si un tel écran existait
  (aucun aujourd'hui).
- **UX** : risque de messages d'erreur peu clairs pour l'utilisateur final (« ce matricule est
  pris » sans indiquer que c'est par un autre tenant, pour des raisons de confidentialité).
- **API** : cohérent avec un identifiant destiné à être unique dans les échanges externes,
  si tel est l'usage prévu — **NON CONFIRMÉ — NE PAS INVENTER** cet usage, aucune source ne le
  précise.
- **Offline** : aucun impact différencié par rapport à l'option B (aucune infrastructure
  offline n'existe de toute façon).
- **Fiscal Year** : aucun.
- **Compatibilité données existantes** : les 8 membres de seed ont tous `matricule: ''`
  (non renseigné) — aucune collision existante, cette option n'exige aucune migration.

### OPTION B — Matricule tenant-scoped

`UNIQUE(tenant_id, matricule)`.

- **Unicité** : à l'échelle du tenant uniquement.
- **Multi-tenancy** : cohérent avec le principe déjà appliqué à `phone`/`email` dans la même
  table — chaque organisation gère sa propre numérotation sans coordination externe.
- **Migration** : changement du service (`createMember`/`updateMember`/`findMemberDuplicate`)
  à prévoir si retenue — non réalisé ici (READ-ONLY).
- **Génération** : même constat que l'Option A, aucune logique automatique à réutiliser.
- **Import** : plus prévisible qu'en Option A (pas de collision inter-tenant possible).
- **Recherche** : recherche par matricule nécessairement scopée au tenant courant, cohérent
  avec le reste de l'architecture d'isolation déjà en place.
- **UX** : messages d'erreur plus simples et cohérents avec le reste de l'application
  (mêmes termes que pour `phone`/`email`).
- **API** : si un usage d'identification externe/cross-tenant était réellement voulu, cette
  option ne le permettrait pas — **NON CONFIRMÉ — NE PAS INVENTER** cet usage.
- **Offline** : aucun impact différencié.
- **Fiscal Year** : aucun.
- **Compatibilité données existantes** : aucune collision actuelle (mêmes seed vides), aucune
  migration de données requise, seul le code de contrainte changerait.

### OPTION C — Autre modèle

Aucune source consultée ne justifie un modèle différent des deux ci-dessus (ex. unicité
composite avec un troisième champ, ou hiérarchie de matricules) — **NON DÉFINI — À VALIDER**,
option non développée faute de justification dans les sources.

### Recommandation (non contraignante)

Élément factuel : l'étiquetage explicite et différencié des trois contraintes dans la même
liste (« Unicité métier » vs « Unicité multi-tenant », deux fois répété pour phone/email) est
le signal le plus fort disponible en faveur d'une distinction **voulue** plutôt qu'une erreur
de rédaction — mais ce n'est pas une preuve, et la description textuelle du champ pointe dans
l'autre sens. Les deux lectures restent défendables ; aucune ne doit être retenue sans
validation explicite.

## 9. D-MEM-04 — Statuts Member

**Statut : 🟢 VALIDÉE (DÉFINITIVE) — Option A retenue (vocabulaire officiel limité à `ACTIVE`/`INACTIVE`/`SUSPENDED`/`EXITED`), avec migration `PENDING → ACTIVE`**

**Mise à jour 2026-08-18 — décision finale du PO** : le point laissé ouvert ci-dessous (sort de
la valeur `pending`) est désormais tranché **définitivement** : `PENDING` est supprimé du
modèle officiel, avec migration obligatoire `PENDING → ACTIVE`. Ce mapping est une décision PO
explicite, non réinterprétée. Détail complet (classification exhaustive des occurrences,
conditions d'Implementation GO) : `docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md`. Ce
document reste READ-ONLY — la migration elle-même n'a pas été exécutée.

**Conséquence directe sur l'implémentation actuelle (à traiter en Implementation GO, pas ici) :**
`pending` reste aujourd'hui une valeur réelle de `MemberStatus`, utilisée en production
(`M-004`, `eligibility.service.ts`, filtre et compteur de `MembersDirectory`) — désormais avec
une destination de migration explicite (`ACTIVE`), non ambiguë. Voir l'addendum ci-dessus pour
le détail exhaustif, y compris un point nouveau : la clé i18n `pending` et l'entrée
`statusTone.pending` (`organization-module.tsx`) sont **partagées avec `Vote.result`**
(domaine Gouvernance) et ne peuvent pas être retirées sans casser l'écran Votes — à traiter
avec précaution en Implementation GO.

### Vérification directe

- **Type** (`src/mocks/organization/members.ts`) : `MemberStatus = 'active' | 'inactive' |
  'suspended' | 'pending' | 'exited'` — 5 valeurs.
- **Dictionnaire** (`excel_dictionary_dump.txt:132`) : « État du membre (ACTIVE, INACTIVE,
  SUSPENDED, EXITED) » — **4 valeurs, `PENDING` absent**.
- **Mocks** : 7 des 8 membres de seed portent un statut parmi les 4 canoniques
  (`active`/`inactive`/`suspended`) ; **1 seul** (`M-004`) porte `pending`.
- **Services** : `organizationService.updateMember` historise tout changement de statut dans
  `Member.statusHistory` (`MemberStatusHistoryEntry[]`), sans distinction de traitement entre
  les 5 valeurs — le mécanisme est générique, pas spécifique à `pending`.
- **UI** : `MembersDirectory` propose un filtre par statut incluant les 5 valeurs (`active`,
  `pending`, `inactive`, `suspended`, `exited`) ; `MemberFormFields` (formulaire de création/
  édition) ne propose que `active`/`pending` au moment de la saisie — les statuts
  `inactive`/`suspended`/`exited` ne sont atteints que par des actions dédiées
  (suspension/réactivation) ou par édition directe, jamais choisis librement à la création.
- **Tests** : `organization.service.test.ts` couvre `suspended` (tenant isolation),
  `exited` (nouvelle valeur, historisée), et la non-régression de `pending` (statut inchangé
  pour `M-004`).
- **Règles métier / transitions** : **aucune machine à états n'est définie pour
  `MemberStatus`** — contrairement à `TontineCycle.status` (qui a une table de transitions
  explicite, `VALID_CYCLE_TRANSITIONS`), `Member.status` peut être modifié vers n'importe
  quelle valeur par `updateMember`, sans contrôle de transition. `NON DÉFINI — À VALIDER PAR
  LE PO` si des transitions doivent être restreintes.
- **Statistiques/reporting** : `MembersDirectory` affiche un compteur de membres `pending`
  (`Metric label={t('organization','pending')}`) — seule exploitation de cette valeur au-delà
  du filtre. Aucun reporting n'existe pour `exited`.
- **Sémantique de `pending`** : le seul indice disponible est le contexte d'usage —
  `M-004.activities` porte `{ type: 'Inscription', description: "Demande d'adhésion soumise" }`
  et `M-004` n'a ni `positions`, ni `accounts`. **Aucune spécification écrite ne confirme
  formellement** que `pending` signifie « candidature en attente d'approbation » plutôt
  qu'un autre sens (validation administrative, inscription non finalisée...).
  `NON CONFIRMÉ — NE PAS INVENTER` au-delà de cette observation contextuelle.

### OPTION A — Conserver uniquement le vocabulaire du dictionnaire

`ACTIVE / INACTIVE / SUSPENDED / EXITED`.

- **Définition** : les 4 valeurs canoniques uniquement, telles que définies dans le
  dictionnaire (§ pour chacune, mandat §9).
- **Cycle de vie/transitions** : `NON DÉFINI — À VALIDER PAR LE PO` (aucune source n'en donne).
- **Impact UI** : le filtre `MembersDirectory` et le formulaire de création perdraient
  l'option `pending`, sans que le code lui-même soit modifié par cette seule décision — écart
  entre vocabulaire officiel et code réel à traiter séparément (implémentation, hors périmètre
  READ-ONLY).
- **Impact services** : `eligibility.service.ts` continuerait de fonctionner techniquement
  (il traite `MemberStatus` génériquement), mais sa logique réelle dépend aujourd'hui de la
  présence de `pending` dans les données — à revalider si cette option entraîne un retrait
  effectif du code.
- **Impact reporting** : le compteur « pending » de `MembersDirectory` perdrait sa
  justification officielle.
- **Impact Fiscal Year** : aucun.
- **Compatibilité données existantes** : `M-004` porte `pending` aujourd'hui — une
  contradiction resterait entre les données de seed et le vocabulaire officiel si le code
  n'est pas aligné séparément.

### OPTION B — Conserver également PENDING, avec sémantique explicitement définie

`ACTIVE / PENDING / INACTIVE / SUSPENDED / EXITED` — **uniquement si le PO formule
explicitement la signification de `PENDING`** (le mandat l'exige ; ce document ne la propose
pas, faute de source).

- **Définition** : `NON DÉFINI — À VALIDER PAR LE PO` (le champ « commentaires » de la §15
  doit être rempli par le PO pour clore cette option).
- **Cycle de vie/transitions** : `NON DÉFINI — À VALIDER PAR LE PO`.
- **Impact UI** : aucun changement requis, cohérent avec l'écran actuel.
- **Impact services** : aucun changement requis, cohérent avec `eligibility.service.ts` actuel.
- **Impact reporting** : le compteur existant devient officiellement justifié.
- **Impact Fiscal Year** : aucun.
- **Compatibilité données existantes** : totale, aucun changement requis.

### OPTION C — Autre modèle

Non développée faute de source la justifiant (le mandat ne fournit pas de troisième
alternative concrète au-delà de A/B) — `NON DÉFINI — À VALIDER`.

### Recommandation (non contraignante)

Élément factuel, pas une préférence : le code actuel (5 valeurs, `pending` réellement utilisé
par un workflow existant et un compteur d'écran) est déjà plus proche de l'Option B que de
l'Option A — retenir l'Option A impliquerait un travail de mise en cohérence ultérieur
(code, mocks, écrans) non anticipé par ce document. Retenir l'Option B nécessite uniquement
que le PO formule la sémantique de `PENDING`, sans autre changement.

---

## 10. Decision Matrix

| ID | Sujet | Statut | Option recommandée | Validation PO |
|----|-------|--------|--------------------|---------------|
| D-MEM-01 | Photo | 🟢 VALIDÉE | Option C — Stockage objet / media storage dédié | ☑ |
| D-MEM-02 | uuid/sync_status/version | 🟢 VALIDÉE | Option C — Convention project-wide explicite | ☑ |
| D-MEM-03 | Matricule | 🟢 VALIDÉE | Option B — Matricule tenant-scoped | ☑ |
| D-MEM-04 | Statuts | 🟢 VALIDÉE (DÉFINITIVE) | Option A — Vocabulaire limité aux 4 valeurs canoniques, migration PENDING → ACTIVE | ☑ |

La colonne « Option recommandée » représente uniquement une recommandation. Elle ne constitue
**pas** une décision.

## 11. Impact Matrix

| Décision | Frontend | Commercial | Backend | DB | Offline | Fiscal Year | Tenant | Migration |
|---|---|---|---|---|---|---|---|---|
| D-MEM-01 (Photo) | 🟡 | ⚪ | 🔴 | 🔴 | 🟡 | ⚪ | 🟡 | 🟡 |
| D-MEM-02 (uuid/sync/version) | 🟡 | ⚪ | 🟡 | 🟡 | 🟡 | ⚪ | ⚪ | 🟢 |
| D-MEM-03 (Matricule) | 🟢 | ⚪ | 🟡 | 🟡 | ⚪ | ⚪ | 🟡 | 🟢 |
| D-MEM-04 (Statuts) | 🟢 | ⚪ | 🟡 | 🟡 | ⚪ | ⚪ | ⚪ | 🟢 |

Légende : 🟢 faible/compatible · 🟡 impact à préciser · 🔴 impact important · ⚪ hors scope.
Aucun impact n'a été inventé au-delà de ce que les sources et le code actuel permettent de
constater — les cellules 🟡 « à préciser » le sont explicitement parce qu'aucune source ne
permet de qualifier plus précisément l'impact à ce stade.

## 12. Contradictions documentaires

| # | Décision | Source 1 | Source 2 | Nature de la contradiction |
|---|---|---|---|---|
| 1 | D-MEM-02 | Dictionnaire (`excel_dictionary_dump.txt:123,133,134`) : `uuid`/`sync_status`/`version` requis pour `Member` (et `users`) | `governance.ts:26-27` : exclusion volontaire de ces mêmes champs pour les entités Web, convention déjà en vigueur pour toutes les autres entités du projet | Contradiction entre le dictionnaire canonique et une convention Web déjà établie — project-wide, pas locale à Member |
| 2 | D-MEM-03 | Description du champ `matricule` (`excel_dictionary_dump.txt:125`) : « dans l'organisation », suggère un scope tenant | Liste des contraintes (`excel_dictionary_dump.txt:143`) : `UNIQUE(matricule)` global, étiqueté « Unicité métier », distinct de « Unicité multi-tenant » (phone/email) | Contradiction interne à la même source (dictionnaire), entre texte descriptif et contrainte formalisée |

Aucune autre contradiction documentaire n'a été identifiée pour `D-MEM-01` (absence pure,
pas de contradiction entre sources) ni pour `D-MEM-04` (le dictionnaire est muet sur
`PENDING`, ce qui est un gap, pas une contradiction entre deux sources qui s'opposeraient).

## 13. Non-régression / Existing System Preservation

Le futur choix, quelle que soit l'option retenue pour chacune des 4 décisions, devra :

- **préserver les `SystemUser` existants** — aucune des 4 décisions ne touche `users.ts`/
  `user.service.ts` ;
- **préserver les `Member` existants** — les 8 membres de seed n'ont pas de collision
  matricule/photo/statut qui serait cassée par l'une ou l'autre option (vérifié §8, §9) ;
- **préserver l'isolation tenant** déjà en place (`getTenantScoped`, testé) — aucune option
  proposée ne l'affaiblit ; l'Option A de `D-MEM-03` (matricule global) est la seule à
  introduire une vérification volontairement **inter-tenant**, déjà le comportement actuel,
  pas un changement ;
- **préserver les routes existantes** — `/organization/members/*` et `/access-security/
  users/*` ne sont concernées par aucune des 4 décisions ;
- **préserver les tests existants** — les 43 tests de `organization.service.test.ts` ne sont
  pas modifiés par ce document (READ-ONLY) ;
- **préserver les conventions déjà validées** — notamment `MemberStatusHistoryEntry`
  (historisation par statut, D-4C4-WEB-03) et `getTenantScoped` (isolation tenant), aucune des
  options proposées ne les remet en cause ;
- **éviter toute reconstruction inutile** — aucune option ne propose de réécrire `Member`
  depuis zéro, uniquement des ajustements ciblés (portée d'une contrainte, présence de 3
  champs, vocabulaire d'un enum) ;
- **éviter toute modification de `tanzen-commercial` sans justification** — confirmé à
  nouveau (§4, §3 point 11) qu'aucune des 4 décisions n'a d'impact sur `tanzen-commercial`,
  qui ne porte aucune logique `Member`/`User` ;
- **éviter toute modification de `tanzen-mobile`** — non consulté par ce mandat (hors
  périmètre explicite), aucune des 4 décisions ne le concerne (`tanzen-mobile` n'a pas encore
  atteint le domaine Members dans sa feuille de route, selon les audits antérieurs de cette
  série).

## 14. Closure Criteria

```
☑ D-MEM-01 validée — Option C
☑ D-MEM-02 validée — Option C
☑ D-MEM-03 validée — Option B
☑ D-MEM-04 validée — Option A
```

Les 4 décisions sont maintenant validées : `GATE = READY FOR CLOSURE`. **Ce document
n'effectue pas la clôture formelle du Gate lui-même** — voir
`docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` pour la déclaration `DECISION GATE = CLOSED`
et les conditions d'Implementation GO qui en découlent.

## 15. PO Validation Area

### D-MEM-01 — Photo du Member

```
Décision :
D-MEM-01 — Photo du Member

Option retenue :
[ ] OPTION A — Stockage local / filesystem
[ ] OPTION B — Stockage via infrastructure documentaire existante (DocumentRecord)
[X] OPTION C — Stockage objet / media storage dédié
[ ] AUTRE / À PRÉCISER

Commentaires PO :
Validée via le mandat "P1 MEMBERS / USERS — DECISION GATE CLOSURE" (2026-08-18). Aucun
détail supplémentaire fourni par le PO au-delà du choix d'option — le service de stockage
objet dédié reste à concevoir en Implementation GO (aucune infrastructure de ce type
n'existe aujourd'hui, cf. §6 « État actuel »).

☑ VALIDÉE

Date : 2026-08-18

```

### D-MEM-02 — `uuid` / `sync_status` / `version`

```
Décision :
D-MEM-02 — uuid / sync_status / version

Option retenue :
[ ] OPTION A — Respecter strictement le dictionnaire canonique pour Member
[ ] OPTION B — Conserver la convention Web existante (retirer les 3 champs)
[X] OPTION C — Convention project-wide explicite (modèle canonique ≠ modèle frontend)
[ ] AUTRE / À PRÉCISER

Commentaires PO :
Validée via le mandat "P1 MEMBERS / USERS — DECISION GATE CLOSURE" (2026-08-18).
L'implémentation actuelle de Member (uuid/sync_status/version présents) est déjà cohérente
avec cette option en pratique — le prérequis d'Implementation GO est documentaire : publier
formellement la convention "modèle canonique ≠ modèle frontend tant qu'aucun backend réel
n'existe", pas un changement de code sur Member lui-même.

☑ VALIDÉE

Date : 2026-08-18

```

### D-MEM-03 — Portée du matricule

```
Décision :
D-MEM-03 — Portée du matricule

Option retenue :
[ ] OPTION A — Matricule global : UNIQUE(matricule)
[X] OPTION B — Matricule tenant-scoped : UNIQUE(tenant_id, matricule)
[ ] OPTION C — Autre modèle (à préciser)
[ ] AUTRE / À PRÉCISER

Commentaires PO :
Validée via le mandat "P1 MEMBERS / USERS — DECISION GATE CLOSURE" (2026-08-18).
ATTENTION : l'implémentation actuelle applique l'inverse (contrainte globale, Option A) —
`organizationService.createMember`/`updateMember`/`findMemberDuplicate` devront être modifiés
en Implementation GO pour scoper la vérification d'unicité du matricule par `tenant_id`
(voir `docs/P1_MEMBERS_USERS_DECISION_GATE_CLOSURE.md` §10/§13).

☑ VALIDÉE

Date : 2026-08-18

```

### D-MEM-04 — Statuts Member

```
Décision :
D-MEM-04 — Statuts Member

Option retenue :
[X] OPTION A — Conserver uniquement ACTIVE/INACTIVE/SUSPENDED/EXITED
[ ] OPTION B — Conserver également PENDING (sémantique à préciser ci-dessous)
[ ] OPTION C — Autre modèle (à préciser)
[ ] AUTRE / À PRÉCISER

Commentaires PO (si OPTION B, préciser la signification exacte de PENDING et ses
transitions autorisées) :
Décision finale et définitive du PO (2026-08-18, mandat "D-MEM-04 — FINAL PO DECISION —
STATUS MIGRATION") : PENDING est supprimé du modèle officiel. Migration obligatoire et non
réinterprétable : PENDING → ACTIVE. Détail exhaustif (occurrences, conditions
d'Implementation GO) : `docs/P1_MEMBERS_USERS_D_MEM_04_STATUS_ADDENDUM.md`.
D-MEM-04 BLOCKER = RESOLVED.

☑ VALIDÉE (DÉFINITIVE)

Date : 2026-08-18

```

---

============================================================
VALIDATION FINALE OBLIGATOIRE
============================================================

```
Code changes:
NONE

Tests:
NOT RUN — READ-ONLY GOVERNANCE

Git commit:
NONE

Git push:
NONE

Decision Gate:
OPEN

Next step:
PO VALIDATION OF D-MEM-01 TO D-MEM-04
```

FIN DU MANDAT.
