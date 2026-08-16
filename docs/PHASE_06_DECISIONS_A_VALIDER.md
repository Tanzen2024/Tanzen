# TANZEN — Phase 6 : Décisions à valider par le Product Owner

**Statut : accompagne une mission d'implémentation réelle.** Les sujets ci-dessous n'ont **pas** été implémentés dans le cadre de la Phase 6 (`docs/PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`), conformément à la règle « ne pas inventer de comportement métier / ne pas trancher arbitrairement une contradiction ou un vide de modèle ». Chaque sujet nécessite soit un arbitrage métier, soit une extension du modèle de données non couverte par les sources (`docs/PHASE_04_USE_CASE_CLASSIFICATION.md`, `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md`, code frontend existant).

---

## Sujets À VALIDER

### 1. `Vote.assemblyId` — rattachement d'un vote à une assemblée précise

- **Problème** : UC30-06 (« Enregistrer les décisions d'assemblée ») et UCX5-06/07 (« Organiser les votes » / « Publier les résultats », `«include»` depuis « Enregistrer les présences ») supposent qu'un vote est rattaché à une assemblée ou une réunion précise. Le type `Vote` actuel (`src/mocks/organization/governance.ts`) ne porte **aucun** champ `assemblyId`/`meetingId` — un vote est un enregistrement autonome (`subject`, `date`, `yes/no/abstain`, `result`).
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (bloc UCX5, lignes UCX5-02 à UCX5-08) ; lecture directe de `src/mocks/organization/governance.ts` (type `Vote`, aucun champ de rattachement).
- **Analyse** : ajouter `assemblyId` serait une modification structurelle du modèle de données, pas une simple règle métier — la Phase 6 a explicitement pour consigne de ne pas modifier le modèle « simplement parce qu'une classe » ne porte pas un champ attendu, sans validation préalable. Le formulaire de création de vote livré dans cette phase (`GovernanceTablePage`, kind `votes`) reste donc volontairement limité aux champs déjà existants (`subject`, `date`) — un scrutin binaire autonome, non rattaché.
- **Décision proposée** (à trancher par le PO) : **Question à trancher : un `Vote` doit-il obligatoirement être rattaché à une `Assembly` ou un `Meeting` ?** Options : (a) ajouter `assemblyId: string` (obligatoire) — un vote n'existe que dans le cadre d'une assemblée ; (b) ajouter `assemblyId?: string` (optionnel) — permettre aussi des scrutins hors-assemblée (ex. consultation électronique) ; (c) ne rien changer — le vote reste un enregistrement autonome, la relation avec l'assemblée où il a eu lieu restant implicite (même `date`).
- **Impact frontend** : si (a)/(b) retenue, le formulaire de création de vote doit ajouter un sélecteur d'assemblée (`listAssemblies`), et la page `GovernanceTablePage` (kind `votes`) doit filtrer/afficher ce rattachement.
- **Statut** : **À VALIDER** (n'affecte pas le fonctionnement livré dans cette phase — création et publication de résultat fonctionnent sans ce champ — mais limite la traçabilité « quelle assemblée a décidé quoi »).

### 2. Statut du workflow de candidature (UCX1) — `Member.status === 'pending'` suffit-il ?

- **Problème** : UCX1-01 à UCX1-15 décrivent un parcours multi-étapes (Soumettre une demande → Déposer les pièces → Signer les documents → Payer les frais d'adhésion → Étudier la demande → Valider l'adhésion → Créer le compte membre) avant qu'un candidat ne devienne un `Member` à part entière. Le modèle actuel n'a qu'un statut `Member.status = 'pending'` — un `Member` existe déjà en base dès la candidature, sans entité `Candidate`/`MembershipRequest` distincte, ni trace des sous-étapes (pièces déposées, documents signés, frais payés).
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` (bloc UCX1) ; lecture directe de `src/mocks/organization/members.ts` (type `Member`, un seul champ `status`, pas d'entité candidate séparée) ; `docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` ne fait apparaître aucune classe `Candidate`/`MembershipRequest` dans les 7 diagrammes.
- **Analyse** : deux lectures possibles, non tranchées par les sources — (1) `Member.status === 'pending'` est la simplification volontaire déjà retenue par le frontend (comme la fusion `BoardMember`/`Mandate`), et le détail des sous-étapes n'a jamais vocation à être modélisé séparément ; ou (2) une entité candidate distincte est nécessaire pour suivre les pièces/documents/paiement avant la création effective du `Member`. Inventer l'un ou l'autre reviendrait à trancher une règle métier non documentée.
- **Décision proposée** (à trancher par le PO) : **Question à trancher : le statut `pending` sur `Member` suffit-il à représenter tout le cycle de candidature, ou une entité séparée est-elle requise pour tracer les sous-étapes (pièces, signature, paiement des frais) ?**
- **Impact frontend** : si une entité séparée est requise, cela ouvre un chantier de modélisation à part entière (formulaire de candidature public, upload de pièces, suivi de paiement des frais, écran d'étude de dossier pour l'administrateur) — hors périmètre de cette phase tant que non tranché.
- **Statut** : **À VALIDER** (ne bloque aucun chantier déjà construit ; `MembersDirectory`/`MemberDetail`/Suspendre-Réactiver fonctionnent indépendamment de ce sujet).

---

## Sujets BLOQUANT (aucune donnée/modèle disponible — MOCK DATA REQUIRED)

### 3. Catalogue de postes (« Créer un poste »)

- **Problème** : UC30-14/15/16 (Créer/Modifier/Supprimer un poste) supposent un catalogue de postes configurable par tenant. `PositionRole` (`src/mocks/organization/members.ts`) est une union TypeScript **fixe** (`'president' | 'treasurer' | 'secretary' | 'member' | 'boardMember'`), pas un catalogue dynamique.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC30-14/15/16 ; lecture directe du type `PositionRole`.
- **Analyse** : aucune source ne définit ce qu'un écran de gestion de catalogue devrait contenir (libellé libre ? permissions associées ? position unique ou cumulable ?). Convertir `PositionRole` en catalogue dynamique sans cadrage reviendrait à inventer une structure de données.
- **Statut** : **BLOQUANT — MOCK DATA REQUIRED.** Non implémenté dans cette phase. Les formulaires de nomination livrés (Bureau & Mandats) restent volontairement limités aux 4 libellés `PositionRole` déjà traduits et utilisés ailleurs dans l'app (`president`, `treasurer`, `secretary`, `boardMember`).

### 4. `Committee` (comités)

- **Problème** : UC30-20/21/22 (Créer un comité / Affecter des membres / Supprimer un comité) référencent une classe `Committee` absente de toutes les sources code (`src/mocks/**`, `src/services/**`) et absente des 7 diagrammes de classes (`docs/PHASE_05_CLASS_DIAGRAM_ANALYSIS.md` §11 le note déjà explicitement : *« Absente de `DC_Membres_et_Bureau-Exécutif.png` malgré son rattachement évident »*).
- **Statut** : **BLOQUANT — MOCK DATA REQUIRED.** Aucune implémentation possible sans une spécification minimale (champs, relation aux `Member`/`BoardMember` existants).

### 5. Présences aux assemblées/réunions (`Attendance`)

- **Problème** : UCX5-05 (« Enregistrer les présences ») suppose une liste de présence par membre. `Assembly`/`Meeting` n'ont qu'un compteur agrégé `participants: number` — aucune structure par membre.
- **Statut** : **BLOQUANT — MOCK DATA REQUIRED.** Non implémenté. Le compteur `participants` existant reste modifiable uniquement via les formulaires de création livrés dans cette phase (valeur numérique globale), pas via une liste de présence nominative.

### 6. Scrutins à choix multiples (`VoteOption`)

- **Problème** : UCX5-06 mentionne `Vote, VoteOption` — un scrutin à plusieurs options, pas seulement un for/contre/abstention binaire. Le modèle `Vote` actuel ne porte que `yes/no/abstain`.
- **Statut** : **PARTIEL, non BLOQUANT.** Le scrutin binaire (déjà existant) reste pleinement fonctionnel après cette phase (création + publication de résultat livrées) ; les scrutins à choix multiples ne sont pas couverts et nécessiteraient une classe `VoteOption` non spécifiée par les sources.

---

## Hors périmètre (rappel, pas une décision à trancher)

- **Statuts/règlement intérieur** (UC30-23/24/25) : dépend du domaine Documents, explicitement hors périmètre de la Phase 6 et pas une dépendance technique strictement nécessaire aux domaines Organization/Members/Governance.
- **Contradiction UC01-01 vs UC10-08** (« Configurer le tenant », PLATFORM vs TENANT, documentée à `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` §8) : non retranchée dans cette phase, conformément à la consigne de ne pas corriger les contradictions Phase 4/5. L'écran existant (`SettingsOrganization`, domaine Settings, avec lien vers le Tenant Registry Platform) reste inchangé.
- **Exercices fiscaux** (UC30-08/09/10) : déjà `IMPLEMENTED` sous `src/features/settings/settings-module.tsx` (`SettingsFiscalYears`, domaine Settings) — cross-référencé dans la matrice de couverture de `PHASE_06_ORGANIZATION_MEMBERS_GOVERNANCE.md`, non dupliqué.

---

## Synthèse

2 sujets **À VALIDER** (n'affectent aucun chantier livré dans cette phase, affinent une modélisation déjà fonctionnelle), 4 sujets **BLOQUANT** dont 3 nécessitent une extension de modèle non spécifiée par les sources (`Committee`, `Attendance`, catalogue de postes) et 1 est un raffinement non bloquant du scrutin déjà livré (`VoteOption`). Aucun de ces 6 sujets n'a été résolu par supposition — chacun requiert un arbitrage produit explicite avant toute implémentation.
