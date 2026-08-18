# P1 GLOBAL FISCAL YEAR — FRONTEND AUDIT

**Statut : AUDIT READ-ONLY.** Aucun fichier de `src/`, `services/`, `repositories/`, `stores/`, `types/`, `routes/`, `UI/`, `RBAC/`, `tests/` n'a été modifié, créé, renommé, refactoré ou supprimé. Le seul artefact produit par ce mandat est ce fichier. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` sont hors périmètre absolu — non consultés, non modifiés.

---

## 1. Conclusion exécutive

`FiscalYear` existe dans `tanzen-frontend` comme une **entité réelle, testée, avec un écran fonctionnel** — mais elle est **entièrement confinée au module Settings** (`/settings/fiscal-years`). VERIFIED par recherche exhaustive : aucune autre entité du projet (Finance, Tontine, Governance, Loans, Members, Audit) ne porte de champ `fiscalYearId`, et aucun contexte/store partagé (`TenantContext`, seul contexte transverse existant) n'expose de notion d'exercice courant. Le principe du mandat « Tenant = permanent, Fiscal Year = périmètre temporel » est donc **architecturalement correct pour `Tenant`** (contexte unique, stable) mais **sans équivalent construit pour `Fiscal Year`** — aucune donnée métier n'est aujourd'hui scopée, filtrée ou impactée par l'exercice fiscal courant.

**Fait le plus significatif de cet audit** : il n'existe **aucune fonction de création** d'un nouvel exercice fiscal. Le service ne porte que `listFiscalYears`, `getCurrentFiscalYear`, `closeCurrentFiscalYear`, `openFiscalYear` — ce dernier n'active qu'un exercice `upcoming` **déjà présent dans les données de seed**, il n'en crée jamais un nouveau. Le principe cible du mandat (`CREATE FY ≠ CLOSE FY`) n'est donc ni respecté ni violé : **CREATE n'existe simplement pas**, ce qui est un MODEL GAP plus fondamental que ce que le mandat anticipait.

Second fait significatif, VERIFIED par lecture directe du service et des tests : le statut `open` **n'est pas un invariant à une seule valeur par tenant** — seul `isCurrent` l'est. Après `openFiscalYear`, l'ancien exercice courant perd `isCurrent` mais conserve `status: 'open'` (`settings.service.test.ts:53-56`, commentaire explicite `settings.service.ts:40`). Un tenant peut donc avoir plusieurs exercices au statut `open` simultanément, un seul étant `isCurrent`. Ceci répond directement à la mise en garde du mandat (§3) de ne jamais supposer qu'un seul FY peut être `OPEN`.

---

## 2. Principe Tenant permanent

VERIFIED. `TenantContext` (`src/contexts/tenant-context.tsx:1-34`) est l'unique contexte transverse de scoping. Depuis la séparation Tenant/Commercial (`docs/FIX_TENANT_APP_SINGLE_TENANT.md`, citée dans le commentaire du fichier), il n'expose plus qu'**un seul tenant fixe** (`ownTenant`, calculé une fois au niveau module à partir de `currentUser.tenantId`, jamais depuis `localStorage`) — `{ tenants: [ownTenant], currentTenant: ownTenant }`. Aucune bascule de tenant n'est possible dans l'Application Tenant (cohérent avec l'architecture Platform/Tenant déjà auditée séparément). `TenantContextValue` (lignes 5-8) ne porte **aucun champ lié à un exercice fiscal** — ni `currentFiscalYearId`, ni `fiscalYear`, ni équivalent.

**Conclusion** : le principe « Tenant = permanent » est vérifié et solidement implémenté. Il n'a en revanche aucune contrepartie « Fiscal Year = périmètre temporel » câblée au même niveau — `FiscalYear` n'est védu que localement, à l'intérieur d'un seul écran (§10).

---

## 3. Fiscal Year actuel

VERIFIED. `FiscalYear.isCurrent: boolean` (`src/mocks/settings/fiscal-years.ts:8-16`) porte la notion d'exercice courant, un par tenant dans les données de seed (`T-001`→`FY-T001-2026`, `T-002`→`FY-T002-2026`, `T-003`→`FY-T003-2026`, `T-004`→`FY-T004-2026`, `T-005`→`FY-T005-2026`, toutes `status: 'open'` — cohérence des seeds vérifiée, aucun tenant n'a 0 ou 2 `isCurrent=true`).

`settingsService.getCurrentFiscalYear(tenantId)` (`settings.service.ts:30`) calcule `fiscalYears.find(year => year.tenantId === tenantId && year.isCurrent)`. **INFERRED/VERIFIED important** : cette fonction n'est **jamais appelée par l'UI** — recherche exhaustive (`grep getCurrentFiscalYear`) : ses 3 seuls appelants sont dans `settings.service.test.ts` (lignes 22, 27, 41). L'écran `SettingsFiscalYears` (`settings-module.tsx:120-149`) dérive lui-même `const current = years.find(year => year.isCurrent)` à partir du résultat de `listFiscalYears`, sans jamais appeler `getCurrentFiscalYear`. La clé de requête `queryKeys.settings.currentFiscalYear` (`query-keys.ts:101`) n'est utilisée que comme cible d'invalidation de cache (`settings-module.tsx:129, 134`), **jamais comme clé d'un `useQuery` réel**.

**Conclusion** : « Fiscal Year actuel » est un concept qui existe au niveau des données et du service, mais qui n'est concrètement consommé qu'à l'intérieur d'un seul écran, par dérivation locale — pas par un appel dédié, et certainement pas par un contexte global.

---

## 4. Modèle de données

VERIFIED — champs exacts, aucun ajouté ni supposé (`src/mocks/settings/fiscal-years.ts:8-16`) :

```
FiscalYear = {
  id: string
  tenantId: string
  label: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'upcoming'
  isCurrent: boolean
}
```

**Champs présents dans l'exemple indicatif du mandat mais ABSENTS du code réel** : `uuid`, `year` (numérique séparé de `label`), `createdAt`, `updatedAt`, `closedAt`, `createdBy`, `closedBy`. Aucun de ces champs n'existe — ni sur `FiscalYear`, ni ailleurs de façon rattachée. **Conséquence directe** : aucune traçabilité de qui a créé/clôturé/ouvert un exercice, ni quand, n'est structurellement possible avec ce modèle (voir §17).

`FiscalYearStatus = 'open' | 'closed' | 'upcoming'` (ligne 6) — 3 valeurs réellement utilisées et exercées par les tests, aucune quatrième valeur trouvée ailleurs dans le code.

**Commentaire d'intention du fichier** (lignes 1-5) : *« Configuration transverse : un seul calendrier d'exercices fiscaux par tenant, consommé par tous les modules (Finance, Tontines, Audit...) — pas un exercice fiscal par module. »* — VERIFIED comme **intention documentée, non comme fait implémenté** : aucun des modules cités (Finance, Tontines, Audit) ne consomme réellement ce calendrier (§12).

---

## 5. Current Fiscal Year

Repris et détaillé depuis §3. Circulation réelle observée :

```
SettingsFiscalYears (UI)
   ↓ useTenant() → currentTenant.id
settingsService.listFiscalYears(tenantId)   [React Query]
   ↓
fiscalYears.filter(...).sort(...)            [mock array]
```

Aucun maillon `Context`/`Store` dédié au FY n'existe entre l'UI et le service — la seule propagation de contexte observée est celle du `tenantId`, via `useTenant()`. `currentFiscalYear` (au sens du mandat : une valeur disponible ailleurs dans l'app) — **ABSENT**. VERIFIED par grep exhaustif : `fiscalYearId`/`fiscalYear` (casse insensible) n'apparaissent que dans les fichiers déjà listés en §Fichiers inspectés — tous internes à Settings, plus les 2 fichiers RBAC/query-keys transverses qui ne font que déclarer la permission/la clé, sans la consommer ailleurs.

---

## 6. Création

**ABSENT.** Recherche exhaustive de `createFiscalYear`/« create fiscal year »/« new fiscal year » : **aucune occurrence** dans `src/`. Le service ne porte que 2 fonctions d'écriture pour ce domaine :

- `closeCurrentFiscalYear(tenantId)` — clôture.
- `openFiscalYear(tenantId, fiscalYearId)` — **active un exercice existant** dont le statut est déjà `'upcoming'` (`settings.service.ts:41-50`, `if (!year || year.status !== 'upcoming') return undefined;`). Ce n'est pas une création : l'exercice `upcoming` (ex. `FY-T001-2027`) existe déjà dans les données de seed avant tout appel.

**Qui peut créer ?** Question sans objet — rien à protéger par une permission puisque la fonctionnalité n'existe pas. **Le Tenant est-il conservé ?** Sans objet. **Des données sont-elles copiées ?** Sans objet (§13). **L'ancien exercice est-il automatiquement clôturé ?** Non — VERIFIED, `openFiscalYear` ne touche jamais `status` de l'ancien exercice courant, seulement `isCurrent` (voir §1, §8).

**DECISION REQUIRED** : comment un nouvel exercice `upcoming` doit-il être créé en pratique (aujourd'hui, seule l'édition manuelle du tableau de seed le permet) ? Aucune source ne répond à cette question — ni le code, ni les documents consultés pour ce mandat.

---

## 7. Clôture

VERIFIED. `closeCurrentFiscalYear(tenantId)` (`settings.service.ts:32-39`) :
- Trouve l'exercice `isCurrent` du tenant.
- Refuse (`return undefined`) si aucun exercice courant, ou si son `status !== 'open'` — donc un exercice déjà `closed` ou `isCurrent=false` ne peut pas être « re-clôturé ».
- Effet : `status → 'closed'`, `isCurrent → false`.
- **N'ouvre jamais automatiquement l'exercice suivant** — commentaire explicite ligne 31 : *« n'ouvre jamais automatiquement le suivant, aucune règle de succession inventée »*. VERIFIED par le test `settings.service.test.ts:31-35` : après clôture, `getCurrentFiscalYear` renvoie `null` — un tenant peut donc temporairement n'avoir **aucun** exercice courant.

**Permissions** : gardée par `PermissionGate permission="fiscalYears.manage"` (`settings-module.tsx:144`), UI seulement — **aucune garde équivalente côté service** (`closeCurrentFiscalYear` lui-même ne vérifie aucune permission, cohérent avec le pattern déjà observé ailleurs dans le projet où le service fait autorité sur le tenant mais pas sur le RBAC — voir aussi l'audit Tontine §11 pour ce même pattern transverse).

**Réouverture (`reopenFiscalYear`)** : **ABSENT.** Recherche exhaustive : aucune fonction, aucun bouton, aucune permission dédiée. Un exercice `closed` est donc terminal — cohérent avec le texte de confirmation UI lui-même (`closeFiscalYearConfirm`, locales `fr/index.ts:190`) : *« Cette action ne peut pas être annulée depuis cet écran. »* — cette phrase est elle-même la seule documentation du caractère terminal de la clôture.

**`lockFiscalYear`/`archiveFiscalYear`** : ABSENTS, aucune occurrence.

**Restrictions sur les données pendant/après clôture** : **UNKNOWN** — puisqu'aucune donnée d'aucun autre domaine n'est scopée par `fiscalYearId` (§12), la question « les écritures Finance sont-elles bloquées après clôture de l'exercice » n'a pas de réponse vérifiable : aucun code ne fait ce lien, dans un sens ou dans l'autre.

---

## 8. CREATE ≠ CLOSE

Le principe cible du mandat ne peut pas être évalué comme respecté ou violé au sens strict, puisque **CREATE n'existe pas** (§6). Ce qui est vérifiable :

- `closeCurrentFiscalYear` et `openFiscalYear` sont deux fonctions distinctes, avec des gardes différentes (`status==='open'` pour l'une, `status==='upcoming'` pour l'autre) — **CLOSE ≠ OPEN** est bien respecté au niveau du code (pas de fonction unique qui ferait les deux).
- `openFiscalYear` n'est PAS une création : elle opère sur un enregistrement déjà présent. Le mandat définit `CREATE FY` comme la création d'un nouvel espace d'exercice — cette opération est absente, `openFiscalYear` n'en est qu'un sous-ensemble partiel (l'activation), sans jamais instancier un nouvel enregistrement `FiscalYear`.
- **`status: 'open'` n'est pas exclusif par tenant** (§1) — seul `isCurrent` l'est. C'est une divergence par rapport à une lecture naïve du mandat (« ne jamais supposer qu'un seul FY peut être OPEN » — confirmé exact : plusieurs peuvent l'être).

**Conclusion** : DECISION REQUIRED sur la fonction de création elle-même (§6) avant que ce principe puisse être pleinement évalué en pratique.

---

## 9. Historique

VERIFIED. `listFiscalYears(tenantId)` retourne tous les exercices du tenant, triés par `startDate` décroissant (`settings.service.ts:29`). L'écran `SettingsFiscalYears` affiche cet historique complet dans une table (`DataTable`, `settings-module.tsx:146`) — colonnes `label/startDate/endDate/status`, avec un bouton d'action `openFiscalYear` uniquement sur les lignes `status==='upcoming'`.

**Sélection d'un exercice passé pour en consulter les données** : **ABSENT.** Il n'existe aucun mécanisme de « changer le FY actif pour voir les données de 2024 » — ni dropdown de sélection contextuelle, ni paramètre d'URL, ni entrée `localStorage`/`sessionStorage`, ni store Zustand dédié. Recherche exhaustive de `localStorage`/`sessionStorage` en lien avec fiscal : aucune occurrence. L'historique est **uniquement une liste consultable en lecture**, pas un sélecteur de contexte.

**Changer de FY conserve-t-il le même Tenant ?** Question sans objet en l'état — puisqu'il n'existe aucun mécanisme de changement de FY à tester, la garantie ne peut être ni confirmée ni infirmée. UNKNOWN.

---

## 10. Context / Store

VERIFIED (négatif). Aucun `FiscalYearContext`, `FiscalYearProvider`, `useFiscalYear`, ni équivalent Zustand n'existe — recherche exhaustive dans `src/contexts/`, `src/stores/` (si présent) et par grep global sur `FiscalYear` : les seuls résultats sont ceux déjà cités (Settings, RBAC, query-keys, locales, navigation). Le seul état local est celui du composant `SettingsFiscalYears` lui-même (`useState` pour `closeTarget`/`openTarget`, `useEffect` qui les réinitialise au changement de tenant — `settings-module.tsx:126`, bonne pratique défensive déjà présente mais qui n'a d'effet que sur cet écran).

**Flux réel** :
```
SettingsFiscalYears (UI, état local)
   ↓ useTenant() → currentTenant.id (SEUL contexte transverse impliqué)
settingsService (fonction directe, pas de repository intermédiaire)
   ↓
mocks/settings/fiscal-years.ts (tableau en mémoire)
```

---

## 11. Tenant + Fiscal Year isolation

VERIFIED pour le Tenant : chaque fonction du service (`listFiscalYears`, `getCurrentFiscalYear`, `closeCurrentFiscalYear`, `openFiscalYear`) filtre/valide explicitement `tenantId` — testé et confirmé (`settings.service.test.ts:59-65`, `DENY: openFiscalYear only opens a fiscal year belonging to the requesting tenant`).

**Isolation Fiscal Year elle-même** : sans objet pour l'instant — puisqu'aucune autre donnée n'est scopée par `fiscalYearId` (§12), le risque décrit par le mandat (`Tenant A / FY 2026 → données FY 2025`) **ne peut pas se produire aujourd'hui**, non pas parce qu'il est correctement empêché, mais parce que la dimension FY n'existe nulle part où ce risque pourrait apparaître. C'est un MODEL GAP, pas une garantie de sécurité.

---

## 12. Domaines impactés

Recherche exhaustive de `fiscalYearId` dans tout `src/` : **2 fichiers seulement**, tous deux internes au module Settings (`settings-module.tsx`, `settings.service.ts` — le nom de paramètre de `openFiscalYear`). Aucune autre entité du projet ne porte ce champ.

| Domaine | Entité vérifiée | FY direct | FY dérivé | Tenant scoped | Historique | Preuve |
|---|---|---|---|---|---|---|
| Finance | `Transaction`, `Account`, `Contribution` | Non | Non | Oui (`tenantId`) | Non | `src/mocks/finance/*.ts` — aucun `fiscalYearId`, grep confirmé |
| Tontine | `Tontine`, `TontineCycle`, etc. | Non | Non | Oui | Non (cycles ont leurs propres dates, indépendantes du FY) | `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §4-9 — aucune mention de FY dans ce domaine non plus |
| Loans | `Loan`, `Repayment` | Non | Non | Oui | Non | Grep confirmé, aucune occurrence |
| Governance | `Meeting`, `Vote`, `GeneralAssembly` | Non | Non | Oui | Non | Grep confirmé |
| Members | `Member` | Non | Non | Oui | Non | Grep confirmé (`joinedAt` existe, sans lien FY) |
| Audit | `audit_logs`/`audit-module.tsx` | Non | Non | Oui | Filtre de **période relative** uniquement (`today/week/month/quarter/year` — `audit-module.tsx:228`), **pas** un filtre par exercice fiscal | Le mot « year » présent dans ce fichier est un intervalle de temps glissant, pas `FiscalYear` — vérifié directement (§ci-dessous) |
| Settings | `FiscalYear` | **Oui** (l'entité elle-même) | — | Oui | Oui (liste complète) | `src/mocks/settings/fiscal-years.ts` |

**Communication/Reports/Analytics** : aucun module dédié trouvé sous ces noms dans `tanzen-frontend` (cohérent avec `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` et les décisions d'architecture antérieures qui notaient déjà l'absence de reporting dédié) — NOT APPLICABLE.

**Précision sur le filtre « year » du module Audit** (`audit-module.tsx:228`) : c'est une option d'un `<select>` de filtrage par période relative (`today/week/month/quarter/year`, traduites via `t('audit', 'year')`), calculée par rapport à la date courante — **aucun lien avec l'entité `FiscalYear`** ni avec ses bornes `startDate`/`endDate`. Une recherche superficielle sur le seul mot « year » aurait pu laisser croire à un lien — vérifié directement dans le code, ce lien n'existe pas.

---

## 13. Transfer / Carry Forward

**ABSENT.** Recherche exhaustive de `copy`/`transfer`/`carry forward`/`rollover`/`clone`/`initialize`/`reset`/`rebuild`/`recalculate` en lien avec `FiscalYear` : aucune occurrence dans `src/`. `openFiscalYear` n'initialise, ne copie, ne recalcule et ne régénère aucune donnée d'aucun domaine lorsqu'un exercice devient courant — son seul effet est la mutation des 2 champs `status`/`isCurrent` sur l'enregistrement `FiscalYear` lui-même (§7).

Classification demandée par le mandat : **DO_NOT_TRANSFER** de facto — non par une règle explicite qui l'interdirait, mais par absence totale de toute logique de transfert. Aucune donnée d'aucun domaine ne « suit » un changement d'exercice courant, dans un sens ou dans l'autre.

**DECISION REQUIRED** : si des données doivent un jour être scopées par exercice (§12), quelle stratégie de transfert entre exercices (`KEEP`/`COPY`/`COPY_AND_REGENERATE`/`REBUILD`/`RESET`/`RECALCULATE`) s'applique à chaque domaine ? Aucune source consultée ne répond à cette question — à trancher domaine par domaine si la dimension FY est un jour étendue au-delà de Settings.

---

## 14. Query Keys / Cache

VERIFIED. Deux clés dédiées (`src/services/query-keys.ts:100-101`) :

```ts
fiscalYears: (tenantId: string) => ['settings', 'fiscal-years', tenantId] as const,
currentFiscalYear: (tenantId: string) => ['settings', 'fiscal-years', 'current', tenantId] as const,
```

Les deux sont scopées par `tenantId` — cohérent avec le pattern déjà en place ailleurs dans le projet (ex. `queryKeys.tontines.*`, `queryKeys.finance.*`, déjà vérifié par l'audit Tontine). **Aucune clé n'intègre `fiscalYearId`** — cohérent avec l'absence totale de cette dimension partout ailleurs (§12) : il n'existe simplement aucune donnée dont le cache devrait varier par exercice. `currentFiscalYear` n'est utilisée que pour l'invalidation (§3), jamais pour une requête active — un risque de cache stale théorique existe si un futur appelant s'attendait à ce que cette clé soit alimentée par une requête réelle, mais aucun tel appelant n'existe aujourd'hui.

**Aucun risque de cache cross-tenant/cross-FY identifié**, faute de données FY-scoped à mettre en cache incorrectement.

---

## 15. UI / Navigation

VERIFIED. Entrée de menu : `{ label: 'Fiscal Years', path: '/settings/fiscal-years', icon: CalendarDays }` (`src/config/navigation.ts:101`), sous-entrée du menu `Settings` (`Settings2`, path `/settings`). Route : `<Route path="fiscal-years" element={<SettingsFiscalYears t={t} />} />` (`settings-module.tsx:365`), montée sous `/settings/*`, elle-même gardée par `<PermissionRoute permission="settings.read">` (`app-router.tsx:63`) — **pas** par `fiscalYears.read` (voir §17).

**Écran** : un seul (`SettingsFiscalYears`), combinant :
- Carte "Exercice en cours" (visible seulement si `current` existe — donc invisible si l'exercice courant vient d'être clôturé sans qu'un nouveau soit ouvert, §7).
- Table d'historique complet.
- Bouton "Clôturer l'exercice" (si un exercice courant existe), bouton "Ouvrir cet exercice" (par ligne, si `status==='upcoming')`.
- Aucun bouton de création (cohérent avec §6).
- Aucun badge de FY courant affiché ailleurs dans l'application (header, sidebar, dashboard) — recherche exhaustive dans `dashboard-overview.tsx` : aucune occurrence de `fiscalYear`.

---

## 16. RBAC

VERIFIED. Catalogue (`src/mocks/rbac.mocks.ts:77`) : `fiscalYears.read`, `fiscalYears.manage`.

| Permission | Déclarée | Réellement vérifiée dans le code | Où |
|---|---|---|---|
| `fiscalYears.read` | Oui | **Non — jamais utilisée** (grep exhaustif : 1 seule occurrence, sa propre déclaration) | — |
| `fiscalYears.manage` | Oui | Oui, 2 fois | `PermissionGate permission="fiscalYears.manage"` sur le bouton « Clôturer » (`settings-module.tsx:144`) et sur le bouton « Ouvrir » par ligne (`settings-module.tsx:142`) |

**L'accès en lecture à l'écran lui-même** est gouverné par `settings.read` (garde de route parente), pas par `fiscalYears.read` — cette dernière permission est donc **déclarée mais morte** (DEAD PERMISSION), un fait vérifiable et non ambigu.

**Assignation aux rôles** (`rbac.mocks.ts:85-87`) : `role-admin` reçoit `permissionCatalog` intégralement (donc les deux permissions FY) ; `role-manager` reçoit tout sauf `.delete`/`.approve` (les deux permissions FY, qui ne portent pas ces suffixes, sont donc incluses) ; `role-viewer` ne reçoit que les permissions `.read` (donc `fiscalYears.read` — la permission jamais vérifiée — mais pas `fiscalYears.manage`). `currentUser` (mock, `rbac.mocks.ts:131`) hérite de `role-admin`.

**Permission de création** : sans objet, la fonctionnalité n'existe pas (§6). **DECISION REQUIRED** si elle est un jour construite.

Aucune permission n'a été créée ou modifiée par cet audit.

---

## 17. Audit / Traçabilité

**ABSENT.** `FiscalYear` (§4) ne porte aucun des champs `createdAt`/`updatedAt`/`closedAt`/`createdBy`/`closedBy`. `closeCurrentFiscalYear`/`openFiscalYear` ne créent aucune entrée dans un journal d'audit — recherche exhaustive dans `src/mocks/audit/` (nom de fichiers) : **aucun fichier ne mentionne « fiscal »**, confirmé par `Glob`. Aucune des deux opérations n'écrit dans `audit_logs` ni n'importe de service d'audit.

**Conséquence** : il n'existe aujourd'hui, structurellement, aucun moyen de répondre à « qui a clôturé l'exercice 2025 et quand ? » au-delà de ce qui pourrait être déduit d'un log serveur inexistant (rappel : aucun backend n'existe pour ce projet, cf. `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §18, constat transverse au projet entier, pas spécifique à FY).

**DECISION REQUIRED** : la traçabilité (`createdBy`/`closedBy`/horodatage) est-elle un besoin réel pour ce domaine ? Aucune source consultée ne le confirme ni ne l'infirme.

---

## 18. Existing to Preserve

Éléments fonctionnels, testés, à traiter comme contraintes de compatibilité :

- **`src/mocks/settings/fiscal-years.ts`** — modèle `FiscalYear`/`FiscalYearStatus`, 12 enregistrements de seed couvrant 5 tenants avec des historiques réalistes (exercices clos/ouvert/à venir).
- **`src/services/settings.service.ts`** (fonctions FY) — `listFiscalYears`, `getCurrentFiscalYear`, `closeCurrentFiscalYear`, `openFiscalYear`, avec gardes tenant-scope et garde de statut (`upcoming`→`open` uniquement, `open`→`closed` uniquement).
- **`src/services/settings.service.test.ts`** (bloc « REGRESSION: fiscal year isCurrent invariant (Phase 11) ») — 5 tests couvrant la fermeture, le no-op sur fermeture répétée, l'invariant `isCurrent` unique lors d'une ouverture, et l'isolation tenant de `openFiscalYear`.
- **`src/features/settings/settings-module.tsx`** (`SettingsFiscalYears`, lignes 118-149) — écran fonctionnel complet (carte exercice courant, table d'historique, dialogues de confirmation, remise à zéro de l'état local au changement de tenant).
- **RBAC `fiscalYears.manage`** — réellement appliquée à 2 endroits, à conserver telle quelle. `fiscalYears.read` — déclarée mais morte, à noter (§16) plutôt qu'à silencieusement retirer.
- **`queryKeys.settings.fiscalYears`/`currentFiscalYear`** — convention cohérente avec le reste du projet, à conserver.
- **Convention de nommage** : `label` (pas `name`), `isCurrent` (pas `current`/`isActive`), statuts en anglais minuscule (`'open'|'closed'|'upcoming'`, alors que d'autres domaines du projet utilisent des enums `statusXxx` façon clé i18n — divergence de convention interne notée, pas un défaut de ce domaine spécifiquement).

---

## 19. Divergences

| # | Attendu (mandat/principe cible) | Constaté | Classification |
|---|---|---|---|
| 1 | `CREATE FY` existe comme opération distincte | Absente — seule l'activation d'un exercice déjà semé existe | MODEL GAP (le plus significatif de cet audit) |
| 2 | Un seul FY `OPEN` par tenant (hypothèse à ne pas supposer, per mandat) | Confirmé faux : seul `isCurrent` est exclusif, `status='open'` peut coexister sur plusieurs exercices | DIVERGENCE VERIFIED, cohérente avec la mise en garde du mandat |
| 3 | FY consommé par « tous les modules » (intention documentée dans le code lui-même) | Consommé par aucun module hors Settings | DOCUMENTATION GAP interne (le commentaire du fichier source affirme une intention non réalisée) |
| 4 | `fiscalYears.read` protège la lecture de l'écran | La lecture est protégée par `settings.read` (parent) ; `fiscalYears.read` n'est jamais vérifiée | DEAD PERMISSION, WEB-ONLY (n'affecte aucun comportement réel) |
| 5 | Traçabilité des opérations (`createdBy`/`closedBy`) | Absente du modèle et du service | MODEL GAP |
| 6 | Réouverture d'un exercice clôturé | Absente, cohérent avec le texte UI qui l'annonce lui-même comme irréversible | ABSENCE DOCUMENTÉE (pas une divergence au sens propre — cohérence interne UI/code) |

Aucune de ces divergences n'est automatiquement un défaut — classées comme demandé, non résolues.

---

## 20. Model Gaps

**🔴 Le plus significatif** : absence totale de `createFiscalYear` — impossible de créer un nouvel exercice sans éditer directement le fichier de seed.

**🟠 Importants** :
- Aucune donnée métier d'aucun domaine n'est scopée par `fiscalYearId` — le calendrier fiscal n'a aujourd'hui aucun effet sur quoi que ce soit hors de son propre écran.
- Aucune traçabilité (`createdBy`/`closedBy`/horodatages dédiés) sur les opérations d'ouverture/fermeture.
- Aucune stratégie de transfert/carry-forward, ni même de placeholder documenté, pour le jour où une donnée deviendrait FY-scoped.

**🟡 À arbitrer** :
- `fiscalYears.read` jamais vérifiée — à activer réellement sur la route, ou à retirer du catalogue si jugée superflue (les deux sont des décisions produit, pas un bug à corriger silencieusement).
- Réouverture d'un exercice clôturé — absente, jamais réclamée par aucune source consultée.
- Coexistence de plusieurs exercices `status='open'` par tenant — comportement actuel non documenté comme intentionnel ni comme anomalie ; à faire confirmer.

**🟢 Non bloquants** :
- Absence de champs `uuid`/`year` numérique séparé — cohérent avec la convention Web déjà documentée ailleurs dans le projet (voir `docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md` §12) de ne pas porter ces champs côté Web sans besoin démontré.

---

## 21. Documentation Gaps

- Le commentaire d'intention de `fiscal-years.ts` (« consommé par tous les modules ») n'est corroboré par aucun autre document ni par le code — à mettre à jour ou à confirmer comme feuille de route, pas comme état actuel.
- Aucun document `PHASE_XX_FISCAL_YEAR*.md` équivalent aux rapports de phase déjà observés pour d'autres domaines (Tontine, Governance) n'a été trouvé dans `docs/` — recherche par nom de fichier effectuée, aucune correspondance. L'origine de la fonctionnalité FY actuelle (quelle phase l'a construite) n'a pas pu être établie à partir des documents consultés pour ce mandat — UNKNOWN.

---

## 22. Decisions Required

1. Une fonction de création d'exercice fiscal doit-elle être construite, et selon quelles règles (numérotation, dates par défaut, qui peut créer) ?
2. Le calendrier fiscal doit-il un jour scoper réellement des données d'un ou plusieurs domaines (Finance en premier lieu, le candidat le plus naturel) — et si oui, lesquelles, avec quelle stratégie de transfert entre exercices ?
3. La coexistence de plusieurs exercices `status='open'` par tenant est-elle un comportement voulu, ou `status` devrait-il devenir exclusif comme `isCurrent` l'est déjà ?
4. `fiscalYears.read` doit-elle être réellement appliquée à la route/l'écran, ou retirée du catalogue si jugée redondante avec `settings.read` ?
5. Une réouverture d'exercice clôturé est-elle nécessaire, et sous quelles conditions ?
6. Une traçabilité (`createdBy`/`closedBy`/horodatages) est-elle requise pour ce domaine ?

Aucune de ces décisions n'a été arbitrée par cet audit.

---

## 23. GO / NO-GO

**NO-GO pour toute implémentation étendant `FiscalYear` au-delà de Settings** tant que les décisions 1-3 (§22) ne sont pas tranchées — en particulier la question de création (§6), qui est un préalable structurel à toute extension.

**GO pour préserver l'existant tel quel** — le sous-ensemble actuellement construit (liste, exercice courant dérivé, ouverture/fermeture d'un exercice déjà semé, isolation tenant) est fonctionnel, testé, et ne présente aucun risque de régression identifié dans son périmètre actuel (Settings uniquement).

---

## 24. Fichiers inspectés

`src/mocks/settings/fiscal-years.ts`, `src/services/settings.service.ts`, `src/services/settings.service.test.ts`, `src/features/settings/settings-module.tsx` (lignes 118-149, 357-365), `src/mocks/rbac.mocks.ts` (lignes 74-80, 85-87, 131), `src/services/query-keys.ts` (lignes 100-101), `src/config/navigation.ts` (lignes 98-106), `src/routes/app-router.tsx` (ligne 63), `src/contexts/tenant-context.tsx` (intégral), `src/locales/fr/index.ts` (lignes 164, 173, 190), `src/features/finance/finance-module.tsx` (grep, écarté — aucun lien réel), `src/features/audit/audit-module.tsx` (grep + lecture ligne 228, écarté — filtre de période relative, sans lien avec `FiscalYear`), `src/features/dashboard/dashboard-overview.tsx` (grep, écarté — `Intl.DateTimeFormat`, sans lien), `src/mocks/audit/` (listing, aucun fichier lié).

---

## 25. Git

```
=== Avant ===
?? docs/P1_GOVERNANCE_PHASE_4C4_POST_IMPLEMENTATION_AUDIT.md   (préexistant, sans rapport)
?? docs/P1_TONTINE_DATA_MODEL_IMPLEMENTATION_AUDIT.md            (mandat antérieur, sans rapport)
?? docs/P1_TONTINE_PO_DECISION_VALIDATION.md                     (mandat antérieur, sans rapport)

=== Après ===
(identique + docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md, ce fichier)
```

Aucun commit, aucun push. `tanzen-backend`, `tanzen-commercial`, `tanzen-mobile` non consultés.

---

## P1 GLOBAL FISCAL YEAR — FINAL

### tanzen-frontend

Audit READ-ONLY

### tanzen-backend

NON TOUCHÉ

### tanzen-commercial

NON TOUCHÉ

### tanzen-mobile

NON TOUCHÉ

### Code modified

AUCUN

### Migration

AUCUNE

### Commit

AUCUN

### Push

AUCUN

### Artifact

docs/P1_GLOBAL_FISCAL_YEAR_FRONTEND_AUDIT.md

FIN DU MANDAT.
