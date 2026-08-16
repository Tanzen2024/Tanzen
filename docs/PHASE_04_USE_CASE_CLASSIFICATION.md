# TANZEN — Phase 04 : Classification des Use Cases individuels

**Statut : ANALYSE UNIQUEMENT.** Aucun fichier de `src/` n'a été modifié pour produire ce rapport. `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` est le seul fichier créé par cette mission.

## 0. Méthodologie

- **Sources lues intégralement, comme images, pour cette mission** : les 21 PNG de `docs/USES CASES/` — UC-00, UC-01, UC-02, UC-03, UC-10, UC-20, UC-30, UC-40, UC50, UC-60, UC70, UC-80, UC90, UC-100 (×2 : Integration Core et Workflow Core), UC-110, UCX1, UCX2, UCX3, UC-X4, UC-X5. Chaque diagramme a été rouvert et relu bulle par bulle pour cette mission ; aucune ligne de `AUDIT_PHASE_01.md` n'a été recopiée sans re-vérification directe sur l'image.
- **Différence de granularité avec `AUDIT_PHASE_01.md`** : ce document précédent traite chaque diagramme comme une ligne unique (ID diagramme, titre, acteurs, constat principal). Le présent document descend au niveau de chaque bulle UML individuelle (chaque cas d'utilisation nommé) à l'intérieur de chaque diagramme. `AUDIT_PHASE_01.md` est utilisé ici uniquement comme repère de fond / recoupement (notamment ses conflits C-08, C-09, C-11 qui recoupent directement des constats faits ici), jamais recopié tel quel.
- **Identifiants** : à une exception près (les codes SF-xxx cités dans les encarts gris de spécifications, qui désignent des groupes de use cases et non des bulles individuelles), **aucune bulle UML des 21 diagrammes ne porte d'identifiant propre dans la source**. Chaque cas d'utilisation individuel de ce document reçoit donc un identifiant de traçabilité **assigné par cet audit**, de la forme `<CodeDiagramme>-<NN>` (ex. `UC01-05`), afin de permettre les renvois entre sections. Ce n'est **jamais** un identifiant natif de la source — le rappeler une fois ici évite de le répéter sur chacune des ~300 lignes du tableau. Pour UC-100, qui désigne deux diagrammes distincts dans la source (Integration Core et Workflow Core), les codes `UC100I` et `UC100W` sont utilisés pour lever l'ambiguïté.
- **UC-00 n'est pas décomposé en lignes individuelles** : ses 11 bulles (« Platform Core », « Governance Core », « Tontine Core », etc.) ne sont pas des cas d'utilisation au sens UML (pas de verbe d'action) mais des renvois de package, explicitement annotés dans le diagramme lui-même (« Les détails sont décrits dans UC-01, UC-02, UC-03 »). Les compter comme cas d'utilisation doublonnerait les ~300 lignes détaillées dans les 20 autres diagrammes. UC-00 est documenté séparément en §1 comme vue d'ensemble.
- **Absence systémique de préconditions / scénarios numérotés / exceptions / postconditions** : les 21 diagrammes sont des diagrammes de cas d'utilisation UML au sens strict — acteurs, bulles, relations `«include»`/`«extend»`, et parfois un encart texte (note jaune) donnant une règle générale. Aucun des 21 diagrammes ne porte, sur une bulle individuelle, de précondition, de scénario numéroté, d'exception ou de postcondition. C'est un **constat systémique**, détaillé une seule fois en §9, plutôt que répété sur chacune des ~300 lignes. Quand un encart jaune donne une règle exploitable (ex. « Le tirage est manuel »), elle est citée verbatim dans l'intro du diagramme concerné et rattachée aux UC pertinents.
- **Règle de classification Contexte** appliquée systématiquement à partir des acteurs réellement connectés à chaque bulle :
  - Seuls des acteurs plateforme (Super Admin/Super Administrateur, services externes techniques de la plateforme) → **PLATFORM**.
  - Seuls des acteurs métier internes à un tenant (Admin Tenant, Membre, Trésorier, Président, Secrétaire, Comité de Crédit, Candidat) → **TENANT**.
  - Acteur générique pré-authentification (« Utilisateur » seul, écrans de connexion/mot de passe avant résolution du tenant) → **PUBLIC / SAAS**, par cohérence avec le flux `DSEC Login & Tenant-Resolution` déjà documenté dans `AUDIT_PHASE_01.md` §6.
  - Un même cas d'utilisation connecté à la fois à un acteur plateforme et à un acteur tenant → classé dans **Use Cases transversaux**, jamais dupliqué en deux lignes.
- **Domaines** : liste fermée fournie pour cette mission (`Organization, Members, Governance, Finance, Credit, Tontines, Operations, Workflows, Notifications, Documents, Access & Security, Audit, Settings`). Plusieurs regroupements de bulles (Plans/Abonnements de la Platform Package, Integration Core, Risk & Penalty Core) n'ont pas de correspondance src/features exacte au moment de l'audit (vérifié : `src/features/` contient `access, audit, dashboard, finance, operations, organization, platform, public, settings, tontines` — aucun dossier `members`, `governance`, `credit`, `workflows`, `notifications`, `documents` au niveau racine à ce stade du frontend). Le domaine le plus proche est choisi et documenté explicitement chaque fois que le rattachement n'est pas direct.
- **Portée tenant** : pour chaque cas TENANT, la ou les ressources concernées sont nommées à partir du sujet direct de la bulle (ex. « Gérer les remboursements » → `Repayment`), jamais au-delà de ce que le libellé et le module montrent.
- **Total** : 299 cas d'utilisation individuels recensés sur les 20 diagrammes détaillés (hors UC-00), + 11 bulles de renvoi de package dans UC-00 non comptées séparément.

---

## 1. UC-00 — Vue d'ensemble (non décomposée)

Diagramme global. Acteurs : Utilisateur, Super Admin, Membre, Admin Tenant. Notes verbatim :
- « Compte de connexion. Gestion : Authentification / Profil / Abonnement / Paiement » (rattachée à Super Admin → Utilisateur).
- « Administrateur de la plateforme SaaS. Ne fait partie d'aucun tenant. » (Super Admin).
- « Un membre appartient à un tenant. Il peut ne pas posséder de compte utilisateur. Il consulte uniquement ses informations. Exception : Participation aux votes. » (Membre).
- « Acteur principal de TANZEN. Toutes les opérations métier sont réalisées par lui. » (Admin Tenant).
- « UC-00 : Diagramme global de la plateforme TANZEN. Il présente uniquement : les acteurs, les packages, les grands domaines fonctionnels. Les détails sont décrits dans : UC-01 Platform Package, UC-02 Business Package, UC-03 Infrastructure Package. »

11 bulles de renvoi (non comptées comme UC) : Platform Core, Governance Core, Tontine Core, Communication Core, Document Core, Credit Core, Accounting Core, Risk & Penalty Core, Identity Core, Infrastructure Core, Integration Core — chacune détaillée par un diagramme dédié (UC-10, UC-30, UC-40, UC-80, UC90, UC-60, UC50, UC70, UC20, UC-110, UC-100I respectivement).

**Constat notable** : Membre est relié à « Consulter » (tontines, notifications, documents, prêts, opérations) et « Voter » — cohérent avec la note « Exception : Participation aux votes ». Cela confirme, au niveau du diagramme le plus haut de la hiérarchie, que Membre a un rôle de consultation + vote uniquement, jamais de création — utile comme repère pour classer les cas d'utilisation « Consulter »/« Voter » attribués à Membre dans les diagrammes détaillés.

---

## 2. Tableau maître

Colonnes : `ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status`. `tenant-scoped` = ressource(s) concernée(s) si Context=TENANT, sinon `N/A`. `Status` = **Confirmé** (extraction directe et non ambiguë) ou **À valider** (ambiguïté de rendu, acteur incertain, ou rattachement de domaine discutable).

### UC-01 — Platform Package (PLATFORM)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC01-01 | Configurer le tenant | PLATFORM | Organization | Super Administrateur (Administrateur Tenant également relié — chevauchement de libellés, cf. §7) | N/A | — | À valider |
| UC01-02 | Supprimer un plan | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC01-03 | Attribuer un plan à un tenant | PLATFORM | Settings | Super Administrateur | N/A | Organization | Confirmé |
| UC01-04 | Créer un plan | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC01-05 | Modifier un plan | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC01-06 | Consulter l'historique des abonnements | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-07 | Suspendre un abonnement | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-08 | Résilier un abonnement | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-09 | Créer un abonnement | PLATFORM | Organization | Super Administrateur, Service de Paiement | N/A | — | Confirmé |
| UC01-10 | Renouveler un abonnement | PLATFORM | Organization | Super Administrateur, Service de Paiement | N/A | — | Confirmé |
| UC01-11 | Créer un administrateur plateforme | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC01-12 | Modifier un administrateur | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC01-13 | Désactiver un administrateur | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC01-14 | Réinitialiser un mot de passe | PLATFORM | Access & Security | Super Administrateur, Service Email/SMS | N/A | — | Confirmé |
| UC01-15 | Consulter les statistiques globales | PLATFORM | Audit | Super Administrateur | N/A | — | Confirmé |
| UC01-16 | Consulter les journaux d'audit | PLATFORM | Audit | Super Administrateur | N/A | — | Confirmé |
| UC01-17 | Consulter les connexions | PLATFORM | Audit | Super Administrateur | N/A | — | Confirmé |
| UC01-18 | Restaurer une sauvegarde | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC01-19 | Sauvegarder la plateforme | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC01-20 | Créer un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-21 | Modifier un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-22 | Suspendre un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-23 | Réactiver un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-24 | Supprimer un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-25 | Consulter les informations d'un tenant | PLATFORM | Organization | Super Administrateur | N/A | — | Confirmé |
| UC01-26 | Configurer les paramètres financiers | PLATFORM | Settings | Super Administrateur | N/A | Organization, Finance | Confirmé |
| UC01-27 | Configurer les notifications | PLATFORM | Settings | Super Administrateur | N/A | Notifications | Confirmé |
| UC01-28 | Configurer les paramètres fonctionnels | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |

Acteurs secondaires « Service Email/SMS », « Service de Paiement », « Planificateur » : connectés à ce diagramme mais le rendu ne permet pas d'établir avec certitude à quelle(s) bulle(s) précise(s) chacun est relié au-delà de Abonnements/Notifications (traits convergents non individuellement traçables) — signalé en §7.

### UC-02 — Business Package (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC02-01 | Accorder un prêt | TENANT | Credit | Administrateur Tenant | Loan | — | Confirmé |
| UC02-02 | Calculer les intérêts | TENANT | Credit | Administrateur Tenant (`«include»` depuis Accorder un prêt et Enregistrer un remboursement) | Loan | — | Confirmé |
| UC02-03 | Enregistrer un remboursement | TENANT | Credit | Administrateur Tenant | Repayment | — | Confirmé |
| UC02-04 | Créer un prêt | TENANT | Credit | Administrateur Tenant | Loan | — | Confirmé |
| UC02-05 | Gérer les membres | TENANT | Members | Administrateur Tenant | Member | — | Confirmé |
| UC02-06 | Gérer les familles | TENANT | Members | Administrateur Tenant | Member (regroupement famille) | — | Confirmé |
| UC02-07 | Gérer les groupes | TENANT | Members | Administrateur Tenant | Member (regroupement groupe) | — | Confirmé |
| UC02-08 | Effectuer un tirage | TENANT | Tontines | Administrateur Tenant | TontineDraw | — | Confirmé |
| UC02-09 | Enregistrer une cotisation | TENANT | Tontines | Administrateur Tenant (`«include»` depuis Effectuer un tirage) | TontineContribution | — | Confirmé |
| UC02-10 | Créer une tontine | TENANT | Tontines | Administrateur Tenant | Tontine | — | Confirmé |
| UC02-11 | Acheter une tontine | TENANT | Tontines | Administrateur Tenant | TontinePosition | — | Confirmé |
| UC02-12 | Planifier une réunion | TENANT | Operations | Administrateur Tenant | Meeting | — | Confirmé |
| UC02-13 | Gérer les présences | TENANT | Operations | Administrateur Tenant | Attendance | — | Confirmé |
| UC02-14 | Clôturer une réunion | TENANT | Operations | Administrateur Tenant | Meeting | — | Confirmé |
| UC02-15 | Envoyer une notification | TENANT | Notifications | Administrateur Tenant | Notification | — | Confirmé |
| UC02-16 | Consulter les notifications | TENANT | Notifications | Administrateur Tenant, Membre (`«extend»` depuis Envoyer une notification) | Notification | — | Confirmé |
| UC02-17 | Gérer les comptes | TENANT | Finance | Administrateur Tenant | Account | — | Confirmé |
| UC02-18 | Enregistrer une transaction | TENANT | Finance | Administrateur Tenant | Transaction | — | Confirmé |
| UC02-19 | Consulter les mouvements | TENANT | Finance | Administrateur Tenant | Transaction | — | Confirmé |
| UC02-20 | Exporter PDF / Excel | TENANT | Operations | Administrateur Tenant | (rapport, pas d'entité dédiée) | — | Confirmé |
| UC02-21 | Consulter les tableaux de bord | TENANT | Operations | Administrateur Tenant | (agrégat multi-entités) | Finance, Tontines, Credit | Confirmé |
| UC02-22 | Produire les rapports | TENANT | Operations | Administrateur Tenant | (agrégat multi-entités) | Finance, Tontines, Credit | Confirmé |

Note : Membre n'est relié qu'à une seule flèche globale vers l'ensemble « Gestion Financière » dans le rendu (trait unique partant de Membre traversant plusieurs blocs) — la bulle précise atteinte n'est pas déterminable avec certitude ; signalé en §7.

### UC-03 — Infrastructure Package

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC03-01 | Se connecter | PUBLIC / SAAS | Access & Security | Utilisateur (`«include»` → Vérifier les autorisations) | N/A | — | Confirmé |
| UC03-02 | Vérifier les autorisations | Transversal | Access & Security | Utilisateur | N/A | PLATFORM + TENANT | Confirmé |
| UC03-03 | Réinitialiser le mot de passe | PUBLIC / SAAS | Access & Security | Utilisateur, Service Email/SMS (`«include»`) | N/A | — | Confirmé |
| UC03-04 | Se déconnecter | Transversal | Access & Security | Utilisateur | N/A | PLATFORM + TENANT | Confirmé |
| UC03-05 | Changer le mot de passe | Transversal | Access & Security | Utilisateur | N/A | PLATFORM + TENANT | Confirmé |
| UC03-06 | Gérer les sessions | Transversal | Access & Security | Utilisateur (interne, `«include»`) | N/A | PLATFORM + TENANT | À valider |
| UC03-07 | Téléverser un fichier | À valider | Documents | Service Stockage (acteur humain déclencheur non identifié dans la source) | Document (si TENANT) | — | À valider |
| UC03-08 | Télécharger un fichier | À valider | Documents | Service Stockage (idem) | Document (si TENANT) | — | À valider |
| UC03-09 | Supprimer un fichier | À valider | Documents | Service Stockage (idem) | Document (si TENANT) | — | À valider |
| UC03-10 | Programmer une tâche | PLATFORM | Settings | Planificateur | N/A | — | Confirmé |
| UC03-11 | Exécuter les tâches automatiques | PLATFORM | Settings | Planificateur | N/A | — | Confirmé |
| UC03-12 | Recevoir une alerte système | Transversal | Audit | Service Monitoring, Administrateur Tenant, Super Administrateur | AuditLog (part tenant) | PLATFORM + TENANT | À valider |
| UC03-13 | Consulter l'état de la plateforme | PLATFORM | Audit | Service Monitoring, Super Administrateur | N/A | — | Confirmé |
| UC03-14 | Consulter les performances | Transversal | Audit | Service Monitoring, Administrateur Tenant, Super Administrateur | AuditLog (part tenant) | PLATFORM + TENANT | À valider |
| UC03-15 | Consulter les journaux système | Transversal | Audit | Administrateur Tenant, Super Administrateur | AuditLog | PLATFORM + TENANT | Confirmé |
| UC03-16 | Consulter les journaux d'audit | Transversal | Audit | Administrateur Tenant, Super Administrateur | AuditLog | PLATFORM + TENANT | Confirmé |
| UC03-17 | Créer une sauvegarde | PLATFORM | Settings | Super Administrateur, Service Sauvegarde | N/A | — | Confirmé |
| UC03-18 | Restaurer une sauvegarde | PLATFORM | Settings | Super Administrateur, Service Sauvegarde | N/A | — | Confirmé |
| UC03-19 | Vider le cache | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |
| UC03-20 | Actualiser le cache | PLATFORM | Settings | Super Administrateur | N/A | — | Confirmé |

### UC-10 — Platform Core

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC10-01 | Gérer les organisations (Tenants) | PLATFORM | Organization | Super Admin | N/A | — | Confirmé |
| UC10-02 | Gérer les modules | PLATFORM | Settings | Super Admin | N/A | — | Confirmé |
| UC10-03 | Authentification | Transversal | Access & Security | Super Admin, Utilisateur, Admin Tenant | N/A | PLATFORM + TENANT | Confirmé |
| UC10-04 | Gérer les abonnements | Transversal | Organization | Super Admin, Admin Tenant | N/A | PLATFORM + TENANT | Confirmé — cf. contradiction §8 |
| UC10-05 | Consulter le tableau de bord | TENANT | Operations | Utilisateur, Admin Tenant | (agrégat multi-entités) | — | Confirmé |
| UC10-06 | Gérer les utilisateurs | TENANT | Access & Security | Admin Tenant | User | — | Confirmé |
| UC10-07 | Gérer les rôles et permissions | TENANT | Access & Security | Admin Tenant (`«include»` depuis Gérer les utilisateurs) | Role, Permission | — | Confirmé |
| UC10-08 | Configurer le tenant | TENANT | Organization | Admin Tenant | Tenant (l'enregistrement lui-même) | — | Confirmé — cf. contradiction §8 (doublon de titre avec UC01-01) |

### UC-20 — Identity Core

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC20-01 | Se connecter | PUBLIC / SAAS | Access & Security | Utilisateur, Administrateur Tenant (`«include»` → Vérifier les autorisations) | N/A | — | Confirmé |
| UC20-02 | Gérer les sessions | Transversal | Access & Security | Utilisateur, Administrateur Tenant (`«include»`) | N/A | — | Confirmé |
| UC20-03 | Vérifier les autorisations | Transversal | Access & Security | Utilisateur, Administrateur Tenant | N/A | — | Confirmé |
| UC20-04 | Changer le mot de passe | Transversal | Access & Security | Utilisateur | N/A | — | Confirmé |
| UC20-05 | Se déconnecter | Transversal | Access & Security | Utilisateur | N/A | — | Confirmé |
| UC20-06 | Réinitialiser le mot de passe | PUBLIC / SAAS | Access & Security | Utilisateur, Service Email/SMS (`«include»`) | N/A | — | Confirmé |
| UC20-07 | Consulter son profil | TENANT | Access & Security | Utilisateur | User | — | Confirmé |
| UC20-08 | Modifier son profil | TENANT | Access & Security | Utilisateur | User | — | Confirmé |
| UC20-09 | Téléverser une photo | TENANT | Access & Security | Utilisateur | User | — | Confirmé |
| UC20-10 | Créer un utilisateur | TENANT | Access & Security | Administrateur Tenant | User | — | Confirmé |
| UC20-11 | Modifier un utilisateur | TENANT | Access & Security | Administrateur Tenant | User | — | Confirmé |
| UC20-12 | Désactiver un utilisateur | TENANT | Access & Security | Administrateur Tenant | User | — | Confirmé |
| UC20-13 | Réactiver un utilisateur | TENANT | Access & Security | Administrateur Tenant | User | — | Confirmé |
| UC20-14 | Consulter un utilisateur | TENANT | Access & Security | Administrateur Tenant | User | — | Confirmé |
| UC20-15 | Supprimer un rôle | Transversal | Access & Security | Administrateur Tenant, Super Administrateur | Role | — | À valider — cf. C-09 (AUDIT_PHASE_01) |
| UC20-16 | Affecter un rôle | Transversal | Access & Security | Administrateur Tenant, Super Administrateur | Role | — | À valider — cf. C-09 |
| UC20-17 | Créer un rôle | Transversal | Access & Security | Administrateur Tenant, Super Administrateur | Role | — | À valider — cf. C-09 |
| UC20-18 | Modifier un rôle | Transversal | Access & Security | Administrateur Tenant, Super Administrateur | Role | — | À valider — cf. C-09 |
| UC20-19 | Créer une permission | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC20-20 | Modifier une permission | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC20-21 | Supprimer une permission | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |
| UC20-22 | Affecter une permission | PLATFORM | Access & Security | Super Administrateur | N/A | — | Confirmé |

### UC-30 — Governance Core (TENANT — Super Administrateur également relié, cf. §7)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC30-01 | Constituer le bureau | TENANT | Governance | Super Administrateur, Administrateur Tenant | BoardMember | — | À valider (rôle Super Admin, cf. §7) |
| UC30-02 | Nommer un responsable | TENANT | Governance | Super Administrateur, Administrateur Tenant (`«include»` depuis Constituer le bureau) | BoardMember, Position | — | À valider |
| UC30-03 | Révoquer un responsable | TENANT | Governance | Super Administrateur, Administrateur Tenant | BoardMember | — | À valider |
| UC30-04 | Consulter le bureau | TENANT | Governance | Super Administrateur, Administrateur Tenant, Membre | BoardMember | — | Confirmé |
| UC30-05 | Planifier une assemblée | TENANT | Governance | Super Administrateur, Administrateur Tenant | GeneralAssembly | — | À valider |
| UC30-06 | Enregistrer les décisions | TENANT | Governance | Super Administrateur, Administrateur Tenant (`«include»`) | GeneralAssembly | — | À valider |
| UC30-07 | Consulter les résolutions | TENANT | Governance | Administrateur Tenant, Membre | GeneralAssembly | — | Confirmé |
| UC30-08 | Créer un exercice | TENANT | Governance | Administrateur Tenant | FiscalYear | — | Confirmé |
| UC30-09 | Clôturer un exercice | TENANT | Governance | Administrateur Tenant | FiscalYear | — | Confirmé |
| UC30-10 | Ouvrir un nouvel exercice | TENANT | Governance | Administrateur Tenant (`«extend»` depuis Clôturer un exercice) | FiscalYear | — | Confirmé |
| UC30-11 | Consulter les informations de l'organisation | TENANT | Organization | Administrateur Tenant | Tenant | — | Confirmé |
| UC30-12 | Modifier les informations de l'organisation | TENANT | Organization | Administrateur Tenant | Tenant | — | Confirmé |
| UC30-13 | Configurer les paramètres de gouvernance | TENANT | Settings | Administrateur Tenant | Tenant (paramètres) | Governance | Confirmé |
| UC30-14 | Créer un poste | TENANT | Governance | Administrateur Tenant | Position | — | Confirmé |
| UC30-15 | Modifier un poste | TENANT | Governance | Administrateur Tenant | Position | — | Confirmé |
| UC30-16 | Supprimer un poste | TENANT | Governance | Administrateur Tenant | Position | — | Confirmé |
| UC30-17 | Créer un mandat | TENANT | Governance | Administrateur Tenant | Mandate | — | Confirmé |
| UC30-18 | Renouveler un mandat | TENANT | Governance | Administrateur Tenant | Mandate | — | Confirmé |
| UC30-19 | Clôturer un mandat | TENANT | Governance | Administrateur Tenant | Mandate | — | Confirmé |
| UC30-20 | Créer un comité | TENANT | Governance | Administrateur Tenant | Committee (non modélisé ailleurs, cf. §9) | — | Confirmé |
| UC30-21 | Affecter des membres au comité | TENANT | Governance | Administrateur Tenant | Committee, Member | — | Confirmé |
| UC30-22 | Supprimer un comité | TENANT | Governance | Administrateur Tenant | Committee | — | Confirmé |
| UC30-23 | Modifier les statuts | TENANT | Governance | Administrateur Tenant | Documents (statuts) | Documents | Confirmé |
| UC30-24 | Publier les statuts | TENANT | Governance | Administrateur Tenant | Documents (statuts) | Documents | Confirmé |
| UC30-25 | Consulter les statuts | TENANT | Governance | Administrateur Tenant, Membre | Documents (statuts) | Documents | Confirmé |

### UC-40 — Tontine Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC40-01 | Gérer les membres du cycle | TENANT | Tontines | Admin Tenant | CycleMember | — | Confirmé |
| UC40-02 | Gérer les tirages | TENANT | Tontines | Admin Tenant | TontineDraw | — | Confirmé |
| UC40-03 | Gérer les tontines | TENANT | Tontines | Admin Tenant, Membre (consultation) | Tontine | — | Confirmé |
| UC40-04 | Clôturer les cycles | TENANT | Tontines | Admin Tenant (`«include»`) | TontineCycle | — | Confirmé |
| UC40-05 | Gérer les cycles | TENANT | Tontines | Admin Tenant, Membre (consultation) | TontineCycle | — | Confirmé |
| UC40-06 | Gérer les cotisations | TENANT | Tontines | Admin Tenant, Membre (consultation) (`«include»` depuis Gérer les cycles) | TontineContribution | — | Confirmé |
| UC40-07 | Gérer les gains et répartitions | TENANT | Tontines | Admin Tenant, Membre (consultation) | DrawWinner, ProfitDistribution | Finance | Confirmé |

Note règle source (encart jaune) : « Toutes les opérations de gestion sont réalisées par l'Admin Tenant. Les cotisations sont enregistrées manuellement (après paiement en espèces). Le tirage est manuel. » ; « Le membre peut : consulter ses tontines, consulter ses cotisations, consulter ses gains. Le membre ne crée ni ne modifie aucune donnée métier. »

### UC-50 — Accounting Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC50-01 | Verrouiller les écritures | TENANT | Finance | Administrateur Tenant (`«include»` depuis Clôturer un exercice) | Journal | — | Confirmé |
| UC50-02 | Clôturer un exercice | TENANT | Finance | Administrateur Tenant | FiscalYear | — | Confirmé |
| UC50-03 | Ouvrir un exercice | TENANT | Finance | Administrateur Tenant | FiscalYear | — | Confirmé |
| UC50-04 | Calculer les soldes globaux | TENANT | Finance | Trésorier | Account (agrégat) | — | Confirmé |
| UC50-05 | Calculer le solde d'un compte | TENANT | Finance | Trésorier (`«include»` depuis Calculer les soldes globaux) | Account | — | Confirmé |
| UC50-06 | Créer un compte | TENANT | Finance | Trésorier | Account | — | Confirmé |
| UC50-07 | Modifier un compte | TENANT | Finance | Trésorier | Account | — | Confirmé |
| UC50-08 | Désactiver un compte | TENANT | Finance | Trésorier | Account | — | Confirmé |
| UC50-09 | Consulter le plan comptable | TENANT | Finance | Trésorier | Account | — | Confirmé |
| UC50-10 | Annuler une transaction | TENANT | Finance | Trésorier | Transaction | — | Confirmé |
| UC50-11 | Consulter une transaction | TENANT | Finance | Trésorier | Transaction | — | Confirmé |
| UC50-12 | Enregistrer une transaction | TENANT | Finance | Trésorier (`«include»` → Générer une écriture) | Transaction | — | Confirmé |
| UC50-13 | Générer une écriture | TENANT | Finance | Trésorier | Journal | — | Confirmé |
| UC50-14 | Consulter le grand livre | TENANT | Finance | Trésorier, Commissaire aux Comptes | Journal | — | Confirmé |
| UC50-15 | Consulter le journal | TENANT | Finance | Trésorier, Commissaire aux Comptes | Journal | — | Confirmé |
| UC50-16 | Consulter le compte de résultat | TENANT | Finance | Trésorier, Commissaire aux Comptes, Président | (agrégat) | — | Confirmé |
| UC50-17 | Exporter PDF / Excel | TENANT | Finance | Commissaire aux Comptes (`«extend»`) | (rapport) | — | Confirmé |
| UC50-18 | Consulter la situation financière | TENANT | Finance | Trésorier, Commissaire aux Comptes, Président | (agrégat) | — | Confirmé |
| UC50-19 | Consulter la balance | TENANT | Finance | Trésorier, Commissaire aux Comptes, Président | (agrégat) | — | Confirmé |

Note : acteurs métier nommés en dur (Trésorier, Commissaire aux Comptes, Président) sans passer par « Administrateur Tenant » générique — recoupe directement le conflit **C-08** de `AUDIT_PHASE_01.md` (§9), confirmé indépendamment ici bulle par bulle.

### UC-60 — Credit Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC60-01 | Gérer les décaissements | TENANT | Credit | Admin Tenant | LoanDisbursement | — | Confirmé |
| UC60-02 | Clôturer les prêts | TENANT | Credit | Admin Tenant | Loan | — | Confirmé |
| UC60-03 | Gérer les politiques de prêt | TENANT | Credit | Admin Tenant | LoanPolicy | — | Confirmé |
| UC60-04 | Gérer les remboursements | TENANT | Credit | Admin Tenant, Membre (consultation) (`«include»` → Gérer les intérêts) | Repayment | — | Confirmé |
| UC60-05 | Gérer les intérêts | TENANT | Credit | Admin Tenant, Membre (consultation) | LoanInterestAccrual | — | Confirmé |
| UC60-06 | Gérer les échéanciers | TENANT | Credit | Admin Tenant, Membre (consultation) | LoanInstallment | — | Confirmé |
| UC60-07 | Gérer les demandes de prêt | TENANT | Credit | Admin Tenant, Membre (consultation) | Loan | — | Confirmé |

Note règle source (encart jaune) : « Toutes les opérations de gestion des prêts sont réalisées par l'Admin Tenant. Le décaissement est effectué après validation. Les remboursements sont enregistrés après paiement (en espèces ou autre mode prévu par l'organisation). » ; « Le membre peut consulter ses demandes/échéancier/remboursements/intérêts. Le membre ne valide ni ne décaisse un prêt. »

### UC-70 — Risk & Penalty Core → voir §5 Use Cases transversaux (19 UC)

### UC-80 — Communication Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC80-01 | Consulter les journaux d'envoi | TENANT | Notifications | Système TANZEN, Admin Tenant | NotificationLog | — | Confirmé |
| UC80-02 | Gérer les modèles de notification | TENANT | Notifications | Admin Tenant (`«include»` → Gérer les notifications) | NotificationTemplate | — | Confirmé |
| UC80-03 | Gérer les notifications | TENANT | Notifications | Système TANZEN, Admin Tenant, Membre (consultation) | Notification | — | Confirmé |
| UC80-04 | Gérer les annonces | TENANT | Notifications | Admin Tenant, Membre (consultation) (`«extend»` depuis Gérer les notifications) | Announcement | — | Confirmé |
| UC80-05 | Gérer les préférences de notification | TENANT | Notifications | Admin Tenant, Membre | NotificationPreference | — | Confirmé |

Note règle source : « Le système TANZEN : génère les notifications, alimente les files d'attente Email/SMS/Push, enregistre les journaux d'envoi. » ; « Toutes les communications sont créées par l'Admin Tenant. Le système assure leur diffusion. » ; « Le membre peut consulter les annonces/notifications/préférences. Il ne peut créer aucune communication. »

### UC-90 — Document Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC90-01 | Supprimer une catégorie | TENANT | Documents | Administrateur Tenant | DocumentCategory | — | Confirmé |
| UC90-02 | Classer un document | TENANT | Documents | Administrateur Tenant, Secrétaire (`«include»`) | Document | — | Confirmé |
| UC90-03 | Créer une catégorie | TENANT | Documents | Administrateur Tenant | DocumentCategory | — | Confirmé |
| UC90-04 | Modifier une catégorie | TENANT | Documents | Administrateur Tenant | DocumentCategory | — | Confirmé |
| UC90-05 | Définir les droits d'accès | TENANT | Documents | Administrateur Tenant (`«include»` depuis Partager un document) | Document | Access & Security | Confirmé |
| UC90-06 | Partager un document | TENANT | Documents | Administrateur Tenant, Trésorier | Document | — | Confirmé |
| UC90-07 | Restaurer un document | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-08 | Supprimer un document | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-09 | Archiver un document | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-10 | Consulter un document | TENANT | Documents | Secrétaire, Membre | Document | — | Confirmé |
| UC90-11 | Télécharger un document | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-12 | Modifier les métadonnées | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-13 | Téléverser un document | TENANT | Documents | Secrétaire | Document | — | Confirmé |
| UC90-14 | Créer une nouvelle version | TENANT | Documents | Secrétaire (`«extend»`) | Document | — | Confirmé |
| UC90-15 | Soumettre un document | TENANT | Documents | Président (`«extend»` → Valider un document) | Document | — | Confirmé |
| UC90-16 | Valider un document | TENANT | Documents | Président | Document | — | Confirmé |
| UC90-17 | Rejeter un document | TENANT | Documents | Président | Document | — | Confirmé |
| UC90-18 | Signer électroniquement | TENANT | Documents | Président (`«include»` → Vérifier une signature) | Document | Access & Security | Confirmé |
| UC90-19 | Vérifier une signature | TENANT | Documents | (interne, `«include»`) | Document | — | Confirmé |
| UC90-20 | Rechercher un document | TENANT | Documents | Membre | Document | — | Confirmé |
| UC90-21 | Filtrer les documents | TENANT | Documents | Membre | Document | — | Confirmé |

Note : acteur « Secrétaire » utilisé comme acteur UML nommé sur ce diagramme (cf. C-08, `AUDIT_PHASE_01.md`), confirmé ici sur 8 bulles (UC90-07 à UC90-14).

### UC-100I — Integration Core → voir §5 Use Cases transversaux (6 UC)

### UC-100W — Workflow Core (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC100W-01 | Activer / Désactiver un workflow | TENANT | Workflows | Administrateur Tenant | Workflow | — | Confirmé |
| UC100W-02 | Gérer les workflows | TENANT | Workflows | Administrateur Tenant (`«include»` → Définir les étapes) | Workflow | — | Confirmé |
| UC100W-03 | Définir les étapes | TENANT | Workflows | Administrateur Tenant (`«include»` → Définir les validateurs) | WorkflowStep | — | Confirmé |
| UC100W-04 | Définir les validateurs | TENANT | Workflows | Administrateur Tenant | WorkflowStep | — | Confirmé |
| UC100W-05 | Définir les conditions | TENANT | Workflows | Administrateur Tenant (`«include»`) | WorkflowCondition | — | Confirmé |
| UC100W-06 | Soumettre une demande à validation | TENANT | Workflows | Administrateur Tenant | WorkflowRequest | — | Confirmé |
| UC100W-07 | Consulter l'historique | TENANT | Workflows | Administrateur Tenant, Membre | WorkflowRequest | — | Confirmé |
| UC100W-08 | Retourner pour correction | TENANT | Workflows | Administrateur Tenant, Membre (`«include»`) | WorkflowRequest | — | Confirmé |
| UC100W-09 | Valider une demande | TENANT | Workflows | Administrateur Tenant, Membre | WorkflowRequest | — | Confirmé |
| UC100W-10 | Annuler une demande | TENANT | Workflows | Administrateur Tenant, Membre | WorkflowRequest | — | Confirmé |
| UC100W-11 | Rejeter une demande | TENANT | Workflows | Administrateur Tenant, Membre | WorkflowRequest | — | Confirmé |
| UC100W-12 | Consulter les demandes | TENANT | Workflows | Administrateur Tenant, Membre | WorkflowRequest | — | Confirmé |

### UC-110 — Infrastructure Core

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UC110-01 | Superviser la plateforme | PLATFORM | Settings | Système TANZEN, Super Admin | N/A | Audit | Confirmé |
| UC110-02 | Gérer les traitements planifiés | PLATFORM | Settings | Système TANZEN, Super Admin | N/A | — | Confirmé |
| UC110-03 | Administrer l'infrastructure | PLATFORM | Settings | Système TANZEN, Super Admin (`«include»` → Configurer le système) | N/A | — | Confirmé |
| UC110-04 | Configurer le système | PLATFORM | Settings | Super Admin | N/A | — | Confirmé |
| UC110-05 | Gérer les journaux et audits | Transversal | Audit | Système TANZEN, Super Admin, Admin Tenant | AuditLog | PLATFORM + TENANT | Confirmé |
| UC110-06 | Gérer les imports et exports | Transversal | Settings | Super Admin, Admin Tenant | (fichier d'import/export, portée tenant si Admin Tenant) | PLATFORM + TENANT | Confirmé |
| UC110-07 | Gérer les sauvegardes et restaurations | Transversal | Settings | Système TANZEN, Super Admin, Admin Tenant (« selon les droits », cf. note) | N/A (backup plateforme) / portée tenant possible | PLATFORM + TENANT | À valider |

### UC-X4 — Cycle Comptable (TENANT)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UCX4-01 | Produire les états financiers | TENANT | Finance | Admin Tenant | (agrégat) | — | Confirmé |
| UCX4-02 | Déclencher une opération financière | TENANT | Finance | Admin Tenant (`«include»` → Valider l'opération) | Transaction | Tontines, Credit (sources possibles : cotisation, achat de tontine, décaissement, remboursement, pénalité) | Confirmé |
| UCX4-03 | Valider l'opération | TENANT | Finance | Admin Tenant, Système TANZEN | Transaction | — | Confirmé |
| UCX4-04 | Mettre à jour les comptes | TENANT | Finance | Système TANZEN (`«include»`) | Account | — | Confirmé |
| UCX4-05 | Mettre à jour les soldes | TENANT | Finance | Système TANZEN (`«include»` depuis Mettre à jour les comptes) | Account | — | Confirmé |
| UCX4-06 | Archiver l'opération | TENANT | Finance | Système TANZEN | Transaction | — | Confirmé |
| UCX4-07 | Générer les écritures comptables | TENANT | Finance | Système TANZEN (`«extend»`) | Journal | — | Confirmé |

Note règle source : « Une opération financière peut provenir de : Cotisation, Achat de tontine, Décaissement de prêt, Remboursement, Pénalité, Frais, Dépense, Recette. » ; « Le système applique automatiquement le principe de la comptabilité en partie double. Chaque opération produit au moins : une ligne Débit, une ligne Crédit. » — recoupe directement la décision #14 déjà identifiée dans `AUDIT_PHASE_01.md` §11.

### UC-X5 — Cycle de Gouvernance → voir §5 Use Cases transversaux (8 UC)

### UCX1 — Cycle de vie d'un membre (TENANT, Domaine primaire Members)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UCX1-01 | Quitter l'organisation | TENANT | Members | Candidat (devenu membre) | Member | — | Confirmé |
| UCX1-02 | Déposer les pièces justificatives | TENANT | Members | Candidat (`«include»`) | Member | Documents | Confirmé |
| UCX1-03 | Signer les documents | TENANT | Members | Candidat (`«include»`) | Member | Documents | Confirmé |
| UCX1-04 | Soumettre une demande d'adhésion | TENANT | Members | Candidat | Member | — | Confirmé |
| UCX1-05 | Modifier son profil | TENANT | Members | Candidat | Member | — | Confirmé |
| UCX1-06 | Recevoir des notifications | TENANT | Members | Candidat (`«include»`) | Member | Notifications | Confirmé |
| UCX1-07 | Appliquer une pénalité | Transversal | Credit | Candidat/Membre (destinataire), Trésorier (`«extend»` depuis Verser les cotisations) | Member | Tontines, Governance, Operations (cf. §5 UC70) | Confirmé |
| UCX1-08 | Verser les cotisations | Transversal | Tontines | Candidat/Membre, Trésorier | Member, TontineContribution | Finance | Confirmé |
| UCX1-09 | Demander un prêt | TENANT | Credit | Candidat/Membre, Trésorier | Loan | — | Confirmé |
| UCX1-10 | Participer aux tontines | TENANT | Tontines | Candidat/Membre, Trésorier | CycleMember | — | Confirmé |
| UCX1-11 | Rembourser un prêt | TENANT | Credit | Candidat/Membre, Trésorier | Repayment | — | Confirmé |
| UCX1-12 | Payer les frais d'adhésion | TENANT | Members | Trésorier | Member | Finance | Confirmé |
| UCX1-13 | Participer aux réunions | TENANT | Operations | Candidat/Membre, Trésorier, Secrétaire | Attendance | — | Confirmé |
| UCX1-14 | Archiver le dossier membre | TENANT | Members | Secrétaire | Member | Documents | Confirmé |
| UCX1-15 | Étudier la demande | TENANT | Members | Administrateur Tenant | Member (demande) | — | Confirmé |
| UCX1-16 | Suspendre le membre | TENANT | Members | Administrateur Tenant | Member | — | Confirmé |
| UCX1-17 | Réactiver le membre | TENANT | Members | Administrateur Tenant | Member | — | Confirmé |
| UCX1-18 | Créer le compte membre | TENANT | Members | Président (`«include»` depuis Valider l'adhésion) | Member | Access & Security (compte utilisateur associé) | Confirmé |
| UCX1-19 | Valider l'adhésion | TENANT | Members | Président | Member | — | Confirmé |

Note : acteurs métier nommés Trésorier, Secrétaire, Président, en plus de Candidat et Administrateur Tenant — recoupe à nouveau C-08. Note règle source implicite via relations `«extend»` : « Appliquer une pénalité » étend « Verser les cotisations », suggérant que le retard de cotisation déclenche la pénalité (cohérent avec UC70).

### UCX2 — Cycle complet d'une tontine (TENANT, Domaine primaire Tontines)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UCX2-01 | Créer une tontine | TENANT | Tontines | Administrateur Tenant (`«include»` → Configurer les règles) | Tontine | — | Confirmé |
| UCX2-02 | Configurer les règles (montant, fréquence, ordre, achat, intérêts) | TENANT | Tontines | Administrateur Tenant (`«include»` → Inscrire les membres) | Tontine, ContributionRule | Credit (règles d'intérêts) | Confirmé |
| UCX2-03 | Inscrire les membres | TENANT | Tontines | Administrateur Tenant | CycleMember | Members | Confirmé |
| UCX2-04 | Clôturer le cycle | TENANT | Tontines | Administrateur Tenant (`«include»` → Archiver la tontine) | TontineCycle | — | Confirmé |
| UCX2-05 | Archiver la tontine | TENANT | Tontines | Administrateur Tenant | Tontine | Documents | Confirmé |
| UCX2-06 | Enregistrer les écritures comptables | Transversal | Finance | Trésorier | Journal | Tontines | Confirmé |
| UCX2-07 | Accorder un prêt sur le fonds disponible | Transversal | Credit | Trésorier (`«include»` → Encaisser un remboursement) | Loan | Tontines, Finance | Confirmé |
| UCX2-08 | Encaisser un remboursement | Transversal | Credit | Trésorier | Repayment | Tontines, Finance | Confirmé |
| UCX2-09 | Enregistrer les cotisations (en espèces) | TENANT | Tontines | Trésorier (`«include»` → Contrôler les cotisations) | TontineContribution | — | Confirmé |
| UCX2-10 | Contrôler les cotisations | TENANT | Tontines | Trésorier (`«include»` → Calculer le fonds disponible) | TontineContribution | — | Confirmé |
| UCX2-11 | Calculer le fonds disponible | Transversal | Tontines | Trésorier | TontineCycle | Finance | Confirmé |
| UCX2-12 | Verser les fonds | Transversal | Tontines | Trésorier, Président | TontinePosition, DrawWinner | Finance | Confirmé |
| UCX2-13 | Calculer les intérêts | Transversal | Credit | Trésorier, Planificateur | Loan | Tontines, Finance | Confirmé |
| UCX2-14 | Ouvrir le cycle | TENANT | Tontines | Président (`«extend»` → Effectuer le tirage) | TontineCycle | — | Confirmé |
| UCX2-15 | Effectuer le tirage | TENANT | Tontines | Président (`«include»` → Valider le bénéficiaire) | TontineDraw | — | Confirmé |
| UCX2-16 | Valider le bénéficiaire | TENANT | Tontines | Président (`«extend»` → Distribuer les bénéfices) | DrawWinner | — | Confirmé |
| UCX2-17 | Distribuer les bénéfices | Transversal | Tontines | Président | ProfitDistribution | Finance | Confirmé |
| UCX2-18 | Acheter une tontine | TENANT | Tontines | Président, Membre | TontinePosition | — | Confirmé |
| UCX2-19 | Organiser une réunion | TENANT | Operations | Membre, Secretary | Meeting | Tontines | Confirmé |

Note terminologie : l'acteur « Secretary » (anglicisme) apparaît isolément sur ce diagramme, déjà signalé comme anomalie dans `AUDIT_PHASE_01.md` §5 (UCX2). Confirmé ici : c'est le seul acteur non francisé sur l'ensemble des 21 diagrammes, relié uniquement à « Organiser une réunion ».

### UCX3 — Cycle de vie d'un prêt (TENANT, Domaine primaire Credit)

| ID | Use Case | Context | Domain | Actor | tenant-scoped | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| UCX3-01 | Déposer les pièces justificatives | TENANT | Credit | Membre (`«include»`) | Loan | Documents | Confirmé |
| UCX3-02 | Signer le contrat | TENANT | Credit | Membre (`«include»`) | Loan | Documents | Confirmé |
| UCX3-03 | Consulter l'échéancier | TENANT | Credit | Membre | LoanInstallment | — | Confirmé |
| UCX3-04 | Soumettre une demande de prêt | TENANT | Credit | Membre | Loan | — | Confirmé |
| UCX3-05 | Notifier le membre | TENANT | Credit | Trésorier (`«include»` → Décaisser le prêt) | Loan | Notifications | Confirmé |
| UCX3-06 | Décaisser le prêt | TENANT | Credit | Trésorier | LoanDisbursement | — | Confirmé |
| UCX3-07 | Rééchelonner le prêt | TENANT | Credit | Trésorier (`«extend»`) | Loan | — | Confirmé |
| UCX3-08 | Calculer les intérêts | TENANT | Credit | Trésorier (`«include»` → Enregistrer un remboursement) | LoanInterestAccrual | — | Confirmé |
| UCX3-09 | Enregistrer un remboursement | TENANT | Credit | Trésorier | Repayment | — | Confirmé |
| UCX3-10 | Archiver le dossier | TENANT | Credit | Trésorier (`«include»` → Clôturer le prêt) | Loan | Documents | Confirmé |
| UCX3-11 | Clôturer le prêt | TENANT | Credit | Trésorier | Loan | — | Confirmé |
| UCX3-12 | Analyser la demande | TENANT | Credit | Trésorier (`«include»` → Générer le contrat de prêt) | Loan | — | Confirmé |
| UCX3-13 | Générer le contrat de prêt | TENANT | Credit | Trésorier (`«include»` → Décider de l'octroi) | Loan | Documents | Confirmé |
| UCX3-14 | Décider de l'octroi | TENANT | Credit | Président (`«include»` → Évaluer la solvabilité) | Loan | — | Confirmé |
| UCX3-15 | Évaluer la solvabilité | TENANT | Credit | Comité de Crédit | Loan, Member (score) | — | Confirmé |
| UCX3-16 | Appliquer une pénalité | Transversal | Credit | (`«include»` depuis Détecter un retard) | Loan | Tontines, Governance, Operations (cf. §5 UC70) | Confirmé |
| UCX3-17 | Calculer les pénalités | Transversal | Credit | (`«include»`) | Loan | cf. §5 UC70 | Confirmé |
| UCX3-18 | Détecter un retard | Transversal | Credit | Planificateur | Loan | cf. §5 UC70 | Confirmé |

Note : acteur « Comité de Crédit » — nommé, jamais vu sur aucun autre des 20 autres diagrammes, déjà signalé dans `AUDIT_PHASE_01.md` §5 (UCX3).

---

## 3. Use Cases Public / SaaS — détail complet

Diagrammes d'origine : UC-03 (Infrastructure Package), UC-20 (Identity Core). Ce sont les seuls écrans accessibles avant résolution du tenant (connexion, mot de passe), cohérents avec le flux `DSEC Login & Tenant-Resolution` déjà documenté dans `AUDIT_PHASE_01.md` §6.

| ID | Titre exact | Acteur(s) | Objectif | Préconditions | Scénarios (relations) | Règles | Exceptions | Postconditions | Terminologie |
|---|---|---|---|---|---|---|---|---|---|
| UC03-01 | Se connecter | Utilisateur | absent de la source | absent de la source | `«include»` Vérifier les autorisations | absent de la source | absent de la source | absent de la source | Package « Authentification & Sécurité » |
| UC03-03 | Réinitialiser le mot de passe | Utilisateur, Service Email/SMS | absent de la source | absent de la source | `«include»` (service email/SMS) | absent de la source | absent de la source | absent de la source | — |
| UC20-01 | Se connecter | Utilisateur, Administrateur Tenant | absent de la source | absent de la source | `«include»` Vérifier les autorisations | absent de la source | absent de la source | absent de la source | Package « Authentification » |
| UC20-06 | Réinitialiser le mot de passe | Utilisateur, Service Email/SMS | absent de la source | absent de la source | `«include»` (service email/SMS) | absent de la source | absent de la source | absent de la source | — |

Aucune autre bulle des 21 diagrammes n'est reliée exclusivement à un acteur pré-authentification sans lien concurrent avec un acteur plateforme ou tenant.

---

## 4. Use Cases Platform — détail complet

### UC-01 — Platform Package

Acteurs : Super Administrateur (dominant), Administrateur Tenant (1 lien, cf. §7), Service Email/SMS, Service de Paiement, Planificateur.
Notes source : aucun encart texte sur ce diagramme (contrairement à UC-40/UC-60/UC-80 qui en portent). Regroupements fonctionnels (« Terminologie ») visibles comme titres de package : *Plans Management*, *Tenant CRUD / Tenant Configuration* (libellés superposés, cf. §7), *Subscription Management*, *Platform Users*, *Monitoring*, *UC-01 — Platform Package*.

Pour les 28 use cases UC01-01 à UC01-28 (liste complète en §2) : Objectif, Préconditions, Scénarios numérotés, Règles annotées par bulle, Exceptions et Postconditions sont **absents de la source** — aucune de ces 28 bulles ne porte d'annotation au-delà de son libellé et de ses relations d'acteur. Aucune relation `«include»`/`«extend»` n'est visible sur ce diagramme (seules des flèches acteur→bulle simples), à la différence de la plupart des autres diagrammes.

### UC-03 — Infrastructure Package (sous-ensemble Platform)

UC03-10, UC03-11 (Tâches planifiées — Planificateur), UC03-13 (Consulter l'état de la plateforme), UC03-17 à UC03-20 (Sauvegarde/Cache — Super Administrateur).

Note source (encart jaune) : « Le système exécute automatiquement : les tâches planifiées, les sauvegardes, les audits, les contrôles, la supervision. » (rattachée à Système TANZEN sur UC-110, réutilisée conceptuellement ici — absente littéralement sur UC-03 lui-même, qui ne porte aucun encart). Objectif/Préconditions/Scénarios/Règles par bulle/Exceptions/Postconditions : absents de la source pour ce sous-ensemble.

### UC-10 — Platform Core

UC10-01 (Gérer les organisations), UC10-02 (Gérer les modules).
Note source (encart jaune) : « Administration globale de la plateforme SaaS. Organisations, Plans, Modules, Abonnements. » (Super Admin). Spécifications associées listées dans l'encart gris : SF-101 à SF-108 (Authentification, Gestion des organisations, Gestion des utilisateurs, Gestion des rôles, Gestion des permissions, Gestion des abonnements, Gestion des modules, Paramétrage du tenant) — c'est la seule trace de « Terminologie »/référence de spécification sur ce diagramme. Objectif/Préconditions/Scénarios/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UC-20 — Identity Core (sous-ensemble Platform)

UC20-19 à UC20-22 (Gestion des permissions — Super Administrateur uniquement, sans lien visible vers Administrateur Tenant, contrairement à Gestion des rôles qui est transversale — cf. §5). Objectif/Préconditions/Scénarios/Règles/Exceptions/Postconditions : absents de la source.

### UC-110 — Infrastructure Core (sous-ensemble Platform)

UC110-01 à UC110-04 (Superviser la plateforme, Gérer les traitements planifiés, Administrer l'infrastructure, Configurer le système).
Notes source (encarts jaunes) : « Le système exécute automatiquement : les tâches planifiées, les sauvegardes, les audits, les contrôles, la supervision. » (Système TANZEN) ; « Responsable technique de la plateforme SaaS. Administration globale. Configuration système. Supervision. » (Super Admin). Relation `«include»` Administrer l'infrastructure → Configurer le système. Spécifications associées (encart gris) : SF-1101 à SF-1107. Objectif/Préconditions/Scénarios numérotés/Règles par bulle/Exceptions/Postconditions : absents de la source au-delà des deux notes citées.

---

## 5. Use Cases Tenant — détail complet

*(Section volumineuse — 20 des 21 diagrammes contribuent au contexte TENANT, soit directement soit via leur volet transversal en §6. Le détail des attributs Objectif/Préconditions/Scénarios/Règles/Exceptions/Postconditions/Terminologie est donné une fois par diagramme ci-dessous ; les identifiants, titres, acteurs, domaines et portée tenant complets figurent dans le tableau maître, §2.)*

### UC-02 — Business Package

Notes source : aucun encart texte. Relations `«include»`/`«extend»` : Accorder un prêt → Calculer les intérêts (`«include»`) ; Calculer les intérêts → Enregistrer un remboursement (`«include»`, sens ascendant dans le rendu) ; Effectuer un tirage → Enregistrer une cotisation (`«include»`) ; Envoyer une notification → Consulter les notifications (`«extend»`). Terminologie (regroupements) : *Gestion des Prêts, Gestion des Membres, Gestion des Tontines, Gestion des Réunions, Communication, Gestion Financière, Reporting*. Objectif/Préconditions/Scénarios numérotés/Règles par bulle/Exceptions/Postconditions : absents de la source.

### UC-40 — Tontine Core

Notes source citées intégralement en §2. Relations `«include»` : Gérer les membres du cycle, Gérer les tirages, Gérer les cycles (×3 flèches «include» convergentes non individuellement discriminables dans le rendu) → Gérer les cotisations ; Clôturer les cycles → Gérer les cycles. Tables concernées (encart gris) : `tontines, tontine_cycles, cycle_members, contribution_rules, tontine_contributions, tontine_draws, draw_winners, cycle_closures, profit_distributions`. Spécifications : SF-401 à SF-408. Objectif/Préconditions/Scénarios numérotés/Exceptions/Postconditions par bulle : absents de la source.

### UC-50 — Accounting Core

Relations `«include»` : Clôturer un exercice → Verrouiller les écritures ; Calculer les soldes globaux → Calculer le solde d'un compte ; Enregistrer une transaction → Générer une écriture (`«include»`, sens ascendant) ; Consulter le compte de résultat → Exporter PDF/Excel (`«extend»`) → Consulter la situation financière (`«extend»`) → Consulter la balance (`«extend»`). Terminologie : *Exercice Comptable, Soldes, Plan Comptable, Transactions, Écritures Comptables, États Comptables*. Objectif/Préconditions/Scénarios numérotés/Règles par bulle/Exceptions/Postconditions : absents de la source.

### UC-60 — Credit Core

Notes source citées en §2. Relations `«include»` (5 flèches convergentes vers « Gérer les intérêts » et « Gérer les échéanciers » depuis Admin Tenant, non toutes individuellement discriminables). Tables concernées : `loan_rules, loans, loan_guarantors, loan_disbursements, loan_installments, loan_repayments, loan_interest_accruals, loan_penalties`. Spécifications : SF-601 à SF-607. Objectif/Préconditions/Scénarios numérotés/Exceptions/Postconditions par bulle : absents de la source.

### UC-80 — Communication Core

Notes source citées en §2. Relations : Gérer les modèles de notification → Gérer les notifications (`«include»`) ; Gérer les annonces (`«extend»` depuis Gérer les notifications). Tables concernées : `announcements, notifications, notification_templates, notification_preferences, notification_logs, notification_settings, email_queue, sms_queue, push_queue`. Spécifications : SF-801 à SF-805. Objectif/Préconditions/Scénarios numérotés/Règles par bulle/Exceptions/Postconditions : absents de la source.

### UC-90 — Document Core

Relations `«include»`/`«extend»` : Partager un document → Définir les droits d'accès (`«include»`) ; Classer un document (`«include»`, acteur Secrétaire) ; Créer une nouvelle version (`«extend»`) ; Soumettre un document → Valider un document (`«extend»`) ; Signer électroniquement → Vérifier une signature (`«include»`). Terminologie : *Classification, Partage, Gestion documentaire, Validation, Signature, Recherche*. Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UC-100W — Workflow Core

Relations `«include»` en chaîne : Gérer les workflows → Définir les étapes → Définir les validateurs ; Définir les conditions (`«include»`) ; Consulter l'historique → Retourner pour correction (`«include»`, sens ascendant). Aucun encart texte sur ce diagramme (seul des 21 à n'avoir ni note jaune ni encart gris de tables/spécifications). Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UC-X4 — Cycle Comptable

Notes source citées intégralement en §2 (origine des opérations financières ; principe de partie double). Relations : Déclencher une opération financière → Valider l'opération (`«include»`) ; Mettre à jour les comptes → Mettre à jour les soldes (`«include»`) ; Produire les états financiers / Archiver l'opération / Générer les écritures comptables reliés par `«include»`/`«extend»` multiples non tous individuellement discriminables dans le rendu. Modules concernés (encart gris) : Accounting Core, Tontine Core, Credit Core, Risk & Penalty Core. Tables concernées : `journals, transactions, transaction_lines, accounts, account_balances, fiscal_years`. Objectif/Préconditions/Scénarios numérotés/Exceptions/Postconditions par bulle : absents de la source (le processus global « Opération → Validation → Écritures comptables → Mise à jour comptes → Mise à jour soldes → États financiers → Archivage » listé dans l'encart gris tient lieu de scénario de haut niveau, mais aucune bulle individuelle ne porte de numérotation d'étapes).

### UCX1 — Cycle de vie d'un membre

Aucun encart texte sur ce diagramme. Relations `«include»`/`«extend»` nombreuses et pour partie non individuellement discriminables (multiples flèches «include»/«extend» convergentes depuis Candidat et Trésorier vers un groupe de bulles central) ; celles clairement lisibles : Verser les cotisations → Appliquer une pénalité (`«extend»`) ; Valider l'adhésion → Créer le compte membre (`«include»`). Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UCX2 — Cycle complet d'une tontine

Relations `«include»`/`«extend»` nombreuses, en partie non discriminables individuellement (multiples flèches convergentes depuis Trésorier et Président). Celles clairement lisibles : Créer une tontine → Configurer les règles → Inscrire les membres (`«include»` en chaîne) ; Clôturer le cycle → Archiver la tontine (`«include»`) ; Accorder un prêt → Encaisser un remboursement (`«include»`) ; Enregistrer les cotisations → Contrôler les cotisations → Calculer le fonds disponible (`«include»` en chaîne) ; Ouvrir le cycle → Effectuer le tirage (`«extend»`) → Valider le bénéficiaire (`«include»`) → Distribuer les bénéfices (`«extend»`). Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UCX3 — Cycle de vie d'un prêt

Relations `«include»` en chaîne longue, en partie non discriminables individuellement dans le rendu (nombreuses flèches croisées entre Membre, Trésorier, Président, Comité de Crédit). Celles clairement lisibles : Décaisser le prêt → Notifier le membre (`«include»`) ; Enregistrer un remboursement → Calculer les intérêts (`«include»`) ; Clôturer le prêt → Archiver le dossier (`«include»`) ; Générer le contrat de prêt → Analyser la demande (`«include»`) ; Décider de l'octroi → Générer le contrat de prêt (`«include»`) ; Évaluer la solvabilité → Décider de l'octroi (`«include»`) ; Détecter un retard → Calculer les pénalités → Appliquer une pénalité (`«include»` en chaîne, sens ascendant). Rééchelonner le prêt et Signer le contrat sont reliés par `«extend»`/`«include»` à Décaisser le prêt et Déposer les pièces justificatives respectivement. Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source.

### UC-30 — Governance Core, UC-20 (sous-ensemble tenant), UC-10 (sous-ensemble tenant)

Voir tableaux §2. Notes source UC-30 : aucun encart texte. Relations `«include»` : Constituer le bureau → Nommer un responsable ; Planifier une assemblée → Enregistrer les décisions ; Clôturer un exercice → Ouvrir un nouvel exercice (`«extend»`). Terminologie (regroupements) : *Bureau Exécutif, Assemblées Générales, Exercice, Organisation, Postes, Mandats, Comités, Statuts & Règlement*. Objectif/Préconditions/Scénarios numérotés/Règles/Exceptions/Postconditions par bulle : absents de la source pour les trois diagrammes.

---

## 6. Use Cases transversaux (cross-context ou cross-domaine)

### 6.1 Cross-domaine — UC-70 Risk & Penalty Core (PRIMARY DOMAIN = Credit)

Diagramme entier traité comme transversal, cohérent avec le conflit **C-11** déjà documenté dans `AUDIT_PHASE_01.md` (rattachement disputé Credit Core / domaine autonome). Contexte : **TENANT** (tous les acteurs — Administrateur Tenant, Trésorier, Président, Commissaire aux Comptes, Planificateur — sont des rôles internes au tenant). PRIMARY DOMAIN = **Credit** (les pénalités/intérêts de retard sont d'abord documentées sous Credit Core dans `Architecture_globale`, cf. `AUDIT_PHASE_01.md` §3.2). DEPENDENCIES = **Tontines** (retard de cotisation), **Governance** (sanctions appliquées par le Président), **Operations** (détection d'absence aux réunions).

| ID | Titre exact | Acteur(s) | tenant-scoped | Relations |
|---|---|---|---|---|
| UC70-01 | Créer une règle de pénalité | Administrateur Tenant | PenaltyRule | — |
| UC70-02 | Modifier une règle | Administrateur Tenant | PenaltyRule | — |
| UC70-03 | Supprimer une règle | Administrateur Tenant | PenaltyRule | — |
| UC70-04 | Consulter les règles | Administrateur Tenant | PenaltyRule | — |
| UC70-05 | Appliquer une pénalité | Trésorier (`«include»` depuis Calculer une pénalité) | Penalty | — |
| UC70-06 | Calculer une pénalité | Trésorier | Penalty | — |
| UC70-07 | Annuler une pénalité | Trésorier | Penalty | — |
| UC70-08 | Consulter les pénalités | Trésorier | Penalty | — |
| UC70-09 | Classer un membre par risque | Trésorier (`«include»` depuis Calculer le score de risque) | Member (score de risque) | — |
| UC70-10 | Calculer le score de risque | Trésorier | Member | — |
| UC70-11 | Consulter le profil de risque | Trésorier | Member | — |
| UC70-12 | Consulter les sanctions | Président | Sanction (non modélisée ailleurs, cf. §9) | — |
| UC70-13 | Appliquer une sanction | Président | Sanction | — |
| UC70-14 | Lever une sanction | Président | Sanction | — |
| UC70-15 | Consulter les statistiques de pénalités | Commissaire aux Comptes | Penalty (agrégat) | — |
| UC70-16 | Produire le rapport des risques | Commissaire aux Comptes | Member (agrégat) | — |
| UC70-17 | Détecter une absence | Planificateur | Attendance | Operations |
| UC70-18 | Détecter un retard de cotisation | Planificateur | TontineContribution | Tontines |
| UC70-19 | Détecter un retard de remboursement | Planificateur | Repayment | Credit |

Objectif/Préconditions/Scénarios numérotés/Postconditions : absents de la source pour les 19 bulles. Exceptions : absentes de la source.

### 6.2 Cross-domaine — UC-100I Integration Core (PRIMARY DOMAIN = Settings)

Contexte : **TENANT** (Admin Tenant configure les intégrations de son propre tenant, selon la note source : « L'Admin Tenant peut : configurer les API, déclencher une synchronisation, consulter les échanges. Il n'effectue aucun traitement technique. »). PRIMARY DOMAIN = **Settings**. DEPENDENCIES = **Notifications** (files d'attente Email/SMS/Push partagées avec Communication Core), **Access & Security** (api_tokens).

| ID | Titre exact | Acteur(s) | tenant-scoped | Relations |
|---|---|---|---|---|
| UC100I-01 | Gérer les API | Admin Tenant, Service Externe, Système TANZEN | ApiClient | — |
| UC100I-02 | Surveiller les échanges | Admin Tenant, Service Externe, Système TANZEN | IntegrationLog | — |
| UC100I-03 | Synchroniser les données | Système TANZEN | SyncJob | — |
| UC100I-04 | Gérer les Webhooks | Service Externe, Système TANZEN (`«include»` → Gérer les intégrations externes) | Webhook | — |
| UC100I-05 | Gérer les intégrations externes | Système TANZEN (`«include»` → Gérer les files d'attente) | ApiClient | — |
| UC100I-06 | Gérer les files d'attente | Système TANZEN | (email_queue/sms_queue/push_queue) | Notifications |

Exemples de services externes cités (encart jaune) : API Mobile, API Bancaire, Orange Money, MTN Mobile Money, Firebase, SMTP, SMS Gateway, ERP externe. Tables concernées : `api_clients, api_tokens, webhooks, sync_jobs, email_queue, sms_queue, push_queue, integration_logs`. Objectif/Préconditions/Scénarios numérotés/Règles par bulle/Exceptions/Postconditions : absents de la source.

### 6.3 Cross-domaine — UC-X5 Cycle de Gouvernance (PRIMARY DOMAIN = Governance)

Contexte : **TENANT** (Admin Tenant, Membre, Système TANZEN — tous internes au tenant). PRIMARY DOMAIN = **Governance**, DEPENDENCIES listées **verbatim dans l'encart gris du diagramme lui-même** (« Modules concernés ») : **Access & Security** (Identity Core), **Notifications** (Communication Core), **Documents** (Document Core), **Finance** (Accounting Core, « si décision financière »).

| ID | Titre exact | Acteur(s) | tenant-scoped | Relations |
|---|---|---|---|---|
| UCX5-01 | Exécuter les décisions | Admin Tenant (`«extend»` depuis Planifier une réunion) | GeneralAssembly (décision) | — |
| UCX5-02 | Planifier une réunion ou une Assemblée Générale | Admin Tenant (`«include»` → Définir l'ordre du jour) | Meeting, GeneralAssembly | — |
| UCX5-03 | Définir l'ordre du jour | Admin Tenant | AgendaItem | — |
| UCX5-04 | Rédiger et publier le procès-verbal | Admin Tenant | MeetingMinutes | Documents |
| UCX5-05 | Enregistrer les présences | Admin Tenant, Membre (`«include»`×2 → Organiser les votes) | Attendance | — |
| UCX5-06 | Organiser les votes | Membre (`«include»` → Publier les résultats) | Vote, VoteOption | — |
| UCX5-07 | Publier les résultats | Admin Tenant (`«include»` → Notifier les membres) | Vote | — |
| UCX5-08 | Notifier les membres | Système TANZEN | Notification | Notifications |

Note source (encart jaune) : « Les décisions adoptées peuvent entraîner : création d'une tontine, ouverture d'un cycle, approbation d'un prêt, nomination d'un responsable, création d'une dépense, modification des paramètres, toute autre décision métier. » — confirme explicitement le caractère transversal de ce diagramme (une décision de gouvernance peut déclencher des actions dans Tontines, Credit, Governance, Finance, Settings). « La gouvernance peut concerner : Réunion ordinaire, Réunion extraordinaire, Assemblée Générale. » « Les votes peuvent être : à main levée, secrets, pondérés (selon les règles de l'organisation). » Tables concernées : `meetings, general_assemblies, attendances, agenda_items, votes, vote_options, member_votes, meeting_minutes, announcements, notifications`. Objectif/Préconditions/Scénarios numérotés/Exceptions/Postconditions par bulle : absents de la source (le processus global listé dans l'encart gris — Planification → Ordre du jour → Notification → Présences → Vote → Résultats → Procès-verbal → Exécution des décisions — tient lieu de scénario de haut niveau, non détaillé par bulle).

### 6.4 Autres cas transversaux individuels (déjà listés dans leur diagramme d'origine, §2)

- UC10-03 Authentification, UC10-04 Gérer les abonnements — UC-10.
- UC20-02/03/04/05/06 (Authentification), UC20-15 à UC20-18 (Gestion des rôles) — UC-20 ; cf. Contradictions §8 (C-09).
- UC03-02, UC03-04 à UC03-06, UC03-12, UC03-14 à UC03-16 — UC-03.
- UC110-05 à UC110-07 — UC-110.
- UCX1-07, UCX1-08 ; UCX2-06 à UCX2-08, UCX2-11 à UCX2-13, UCX2-17 ; UCX3-16 à UCX3-18 — cross-domaine à l'intérieur des diagrammes de cycle de vie (détail des dépendances dans le tableau maître §2).

---

## 7. Use Cases ambigus

| ID / Sujet | Nature de l'ambiguïté | Diagramme(s) |
|---|---|---|
| UC01-01 Configurer le tenant | Libellés de package superposés dans le rendu (« Tenant CRUD » et « Tenant Configuration » semblent occuper le même espace) — impossible de déterminer avec certitude si cette bulle appartient au package « Configuration » relié à Admin Tenant seul, à Super Admin seul, ou aux deux. Défaut de rendu comparable à D-07 (« Vote_options » mal rendu) documenté dans `AUDIT_PHASE_01.md` §10. | UC-01 |
| UC01 — Service Email/SMS, Service de Paiement, Planificateur | Ces trois acteurs secondaires ont des traits qui convergent vers la zone Subscription Management/Monitoring sans qu'il soit possible d'isoler la bulle exacte atteinte par chacun dans le rendu (traits superposés). | UC-01 |
| UC02 — Membre → Gestion Financière | Un trait unique part de Membre et traverse plusieurs blocs de packages avant d'atteindre la zone « Gestion Financière » ; la bulle précise (Gérer les comptes / Enregistrer une transaction / Consulter les mouvements) n'est pas déterminable avec certitude. | UC-02 |
| UC03-07/08/09 Gestion documentaire | Aucune flèche acteur→bulle n'est visible pour ce sous-groupe (seules les flèches bulle→Service Stockage sont dessinées) ; l'acteur humain déclencheur (Utilisateur ? Admin Tenant ?) et donc le Contexte (PUBLIC/PLATFORM/TENANT) ne sont pas déterminables à partir de cette seule source. | UC-03 |
| UC03-12/14 Recevoir une alerte système / Consulter les performances | Quatre acteurs (Planificateur, Service Monitoring, Administrateur Tenant, Super Administrateur) ont des flèches convergentes vers le même cluster Surveillance/Journalisation ; l'attribution précise par bulle est partiellement reconstituée par proximité de trait plutôt que certaine à 100 %. | UC-03 |
| UC30 — Rôle de Super Administrateur dans la Gouvernance tenant | Super Administrateur (acteur plateforme, « ne fait partie d'aucun tenant » selon UC-00) est relié à des opérations de gouvernance normalement internes à un tenant (Constituer le bureau, Nommer/Révoquer un responsable, Planifier une assemblée, Enregistrer les décisions). Ambigu entre (a) supervision plateforme légitime d'un tenant en difficulté, (b) erreur de diagramme, (c) rôle de Super Admin en tant qu'utilisateur agissant temporairement comme Admin Tenant. Non tranchable depuis cette seule source — voir aussi Contradictions §8. | UC-30 |
| Domaine des bulles « Plans Management »/« Subscription Management » (UC01) | Aucun domaine de la liste fermée des 13 ne correspond exactement à « Billing »/abonnements SaaS ; classé ici sous Settings/Organization par défaut argumenté (§0), mais le rattachement reste discutable. | UC-01 |
| Domaine des bulles UC-100I (Integration Core) | Aucun domaine de la liste fermée ne correspond à « Intégration » en tant que tel ; classé sous Settings avec dépendances Notifications/Access & Security, choix argumenté mais non unique possible. | UC-100I |
| UC110-07 Gérer les sauvegardes et restaurations | La note source indique que l'Admin Tenant « peut... effectuer une sauvegarde (selon les droits) », ce qui suggère une portée tenant partielle pour une action par ailleurs typiquement plateforme (sauvegarde de la plateforme entière dans UC-01/UC-03). Ambigu si la sauvegarde en question est celle des données du tenant seul ou de la plateforme entière. | UC-110 |

---

## 8. Contradictions

| # | Sujet | Constat | Sources en conflit |
|---|---|---|---|
| CT-01 | « Configurer le tenant » — deux use cases de même titre, contextes différents | UC01-01 (diagramme UC-01, Platform Package) place « Configurer le tenant » sous acteur Super Administrateur (contexte PLATFORM, un tiers configure un tenant qui n'est pas le sien). UC10-08 (diagramme UC-10, Platform Core) place une bulle au **titre identique** sous acteur Admin Tenant (contexte TENANT, un tenant configure lui-même ses propres paramètres). Aucune des deux sources ne précise si ce sont deux opérations distinctes portant le même nom par coïncidence, ou la même opération vue sous deux angles d'acteurs différents (auquel cas le Contexte réel serait transversal PLATFORM+TENANT). Non résolu ici — les deux lignes sont conservées séparément dans le tableau maître plutôt que fusionnées, conformément à la consigne de ne rien trancher silencieusement. | UC-01 vs UC-10 |
| CT-02 | Rôles métier nommés comme acteurs UML (Trésorier, Président, Secrétaire, Comité de Crédit) | Confirme et étend, bulle par bulle, le conflit **C-08** déjà documenté dans `AUDIT_PHASE_01.md` §9 : ces rôles apparaissent comme acteurs UML nommés sur UC50 (19 UC), UC70 (19 UC), UC90 (8 UC sur Secrétaire/Président), UCX1 (Trésorier/Secrétaire/Président sur 13 UC), UCX2 (Trésorier/Président/Secretary sur 15 UC), UCX3 (Trésorier/Président/Comité de Crédit sur 14 UC) — soit **plus de 80 bulles individuelles** au total sur les 6 diagrammes concernés, alors que `TANZEN_CROSS_CUTTING_DECISIONS.md` (cité dans `AUDIT_PHASE_01.md`) affirme qu'aucun de ces rôles n'apparaît comme acteur dans les 2 144 titres de la spécification fonctionnelle textuelle. | Diagrammes UC50/UC70/UC90/UCX1/UCX2/UCX3 vs `TANZEN_CROSS_CUTTING_DECISIONS.md` |
| CT-03 | Gestion des rôles/permissions : Admin Tenant seul ou Admin Tenant + Super Admin ? | UC10-07 (« Gérer les rôles et permissions ») ne montre que Admin Tenant comme acteur. UC20-15 à UC20-18 (« Gestion des rôles », diagramme dédié plus détaillé) montrent à la fois Administrateur Tenant **et** Super Administrateur reliés aux mêmes opérations (Créer/Modifier/Supprimer/Affecter un rôle), via des relations `«include»` partant de Super Administrateur. Ceci recoupe directement le conflit **C-09** de `AUDIT_PHASE_01.md` (coexistence non tranchée entre `USERS.role` unique et RBAC dynamique N:N) — la présente lecture bulle par bulle confirme que même au niveau UML, la portée exacte (rôles plateforme vs rôles tenant, ou un seul référentiel de rôles partagé) n'est pas tranchée par les diagrammes eux-mêmes. | UC-10 vs UC-20 |
| CT-04 | Super Administrateur acteur de la Gouvernance tenant | UC-00 précise explicitement que le Super Admin « ne fait partie d'aucun tenant » et n'agit que sur le Platform Package. UC-30 (Governance Core) le montre pourtant relié à des opérations de gouvernance intra-tenant (Bureau Exécutif, Assemblées Générales, Exercice). Contradiction directe entre la note de cadrage de UC-00 et le contenu réel de UC-30. Voir aussi §7 (ambiguïté non tranchée sur la nature exacte de cette intervention). | UC-00 vs UC-30 |
| CT-05 | `AUDIT_PHASE_01.md` classe le domaine « Gouvernance » comme entièrement absent du frontend sans jamais avoir décomposé UC-30/UC-X5 au niveau bulle | Non une contradiction de contenu mais de **granularité** : `AUDIT_PHASE_01.md` §2 traite « Gouvernance (Bureau Exécutif) » et « Gouvernance (Assemblées/Votes/Documents) » comme deux lignes de cartographie sans dénombrer les use cases individuels. Cette mission dénombre 25 use cases individuels sur UC-30 seul et 8 sur UC-X5, révélant un existant fonctionnel bien plus large qu'une lecture au niveau diagramme ne le suggérait — cohérent avec l'esprit d'`AUDIT_PHASE_01.md` mais quantitativement plus précis, à signaler pour toute réutilisation de ses chiffres. | `AUDIT_PHASE_01.md` §2 vs présent document |

---

## 9. Informations manquantes (lacune systémique des sources)

Les 21 diagrammes de cas d'utilisation UML de `docs/USES CASES/` sont, sans exception, des **diagrammes acteur-bulle** au sens le plus strict : ils montrent qui (acteur) peut déclencher quelle opération (bulle), et occasionnellement une relation `«include»`/`«extend»` entre deux bulles. Aucun des 21 diagrammes ne porte, sur une bulle individuelle :

- **Objectif** formalisé (au-delà du titre lui-même, qui sert d'intitulé d'objectif).
- **Préconditions** — jamais annotées sur une bulle individuelle. Seules quelques notes globales de diagramme (encarts jaunes) donnent des règles générales applicables à l'ensemble des bulles d'un diagramme (ex. « Toutes les opérations de gestion sont réalisées par l'Admin Tenant », UC-40/UC-60), jamais des préconditions au sens UML (état requis avant déclenchement).
- **Scénarios numérotés** (étapes 1, 2, 3…) — absents partout. Les relations `«include»`/`«extend»` donnent un ordre partiel de dépendance entre bulles, mais ce n'est pas un scénario détaillé.
- **Règles métier annotées par bulle** — absentes, sauf les encarts jaunes globaux déjà cités par diagramme dans les sections précédentes (au nombre de 11 sur 21 diagrammes : UC-00, UC-20 implicitement via profils, UC-40, UC-60, UC-80, UC-90 implicitement, UC-100I, UC-110, UC-X4, UC-X5, et les notes d'acteur de UC-00).
- **Exceptions** — jamais annotées, à l'exception d'une seule occurrence sur l'ensemble des 21 diagrammes : la note de UC-00 sur l'acteur Membre (« Exception : Participation aux votes »), qui est une exception de périmètre d'acteur, non une exception de flux d'exécution.
- **Postconditions** — absentes partout.
- **Terminologie/glossaire** — présente uniquement sous forme de titres de regroupement de packages (ex. « Bureau Exécutif », « Plan Comptable », « Classification ») et des encarts gris « Tables concernées »/« Spécifications associées » présents sur 9 des 21 diagrammes (UC-40, UC-60, UC-80, UC-90 en a un partiel, UC-100I, UC-110, UC-X4, UC-X5, UC-10 pour les SF uniquement) — jamais de définition de terme au sens strict d'un glossaire.

**Conséquence pour ce document** : dans les sections 3 à 6, ces attributs sont marqués « absent de la source » de façon groupée par diagramme plutôt que répétés individuellement sur near-300 lignes, conformément à la règle de ne jamais inventer de contenu plausible. Toute production future de fiches de cas d'utilisation détaillées (objectif, préconditions, scénario nominal, exceptions, postconditions) devra s'appuyer sur les 15 documents de décision Markdown et les encarts « Tables concernées »/« Spécifications associées » (codes SF-xxx) déjà cités par `AUDIT_PHASE_01.md`, jamais sur les 21 diagrammes eux-mêmes qui n'en portent pas la matière.

---

*Fin du rapport. Aucun fichier autre que `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` n'a été créé ou modifié. Aucun fichier sous `src/` n'a été lu en écriture ni modifié — une seule consultation en lecture seule de la structure `src/features/` a été effectuée pour ancrer la liste de Domaines fournie dans l'état réel du frontend (§0).*
