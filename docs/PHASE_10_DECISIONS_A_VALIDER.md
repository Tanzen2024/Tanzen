# TANZEN — Phase 10 : Décisions à valider par le Product Owner

**Statut : accompagne une mission d'implémentation réelle, en contexte sécurité.** Les sujets ci-dessous n'ont **pas** été implémentés dans le cadre de la Phase 10 (`docs/PHASE_10_ACCESS_SECURITY.md`), conformément à la règle absolue « ne pas affaiblir une protection existante, ne pas inventer de permission, de politique de sécurité ou de comportement MFA ». Seules les décisions réellement non résolues figurent ici.

---

## Sujets BLOQUANT

### 1. Permissions — CRUD (UC20-19 à 22)

- **Problème** : « Créer/Modifier/Supprimer/Affecter une permission » sont des UC confirmés (PLATFORM, Super Administrateur), mais `permissionCatalog` (`src/mocks/rbac.mocks.ts`) est une **constante partagée par tout le RBAC de l'application** — chaque `can(permission)`, `PermissionRoute`, `PermissionGate` de tous les domaines déjà construits (Phases 6 à 9) en dépend directement. La modifier en direct depuis un écran d'administration changerait le comportement de sécurité de l'application entière à l'exécution.
- **Sources** : `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` UC20-19 à 22 ; lecture directe de `rbac.mocks.ts` (catalogue = tableau de constantes au niveau module, pas une ressource par tenant).
- **Analyse** : au-delà de l'absence de service dédié, aucun acteur « Super Administrateur » distinct de `scope: 'platform'` n'existe dans le modèle actuel — impossible de déterminer qui, précisément, devrait avoir accès à cet écran sans inventer une nouvelle distinction d'acteur. Le risque de sécurité (une permission mal supprimée casse silencieusement l'accès d'autres utilisateurs à des fonctionnalités déjà construites) est disproportionné pour une phase dont la règle absolue est « ne pas affaiblir ».
- **Décision proposée** : **Question à trancher : le catalogue de permissions doit-il rester une configuration statique du code (comme aujourd'hui), ou devenir une ressource administrable en runtime ?** Si administrable, cela nécessite de spécifier : qui peut y accéder (un acteur Super Administrateur distinct doit-il être modélisé ?), comment une suppression de permission encore utilisée par un rôle actif est gérée, et si la modification s'applique immédiatement ou nécessite une revalidation.
- **Statut** : **BLOQUANT.**

### 2. Rôles — CRUD (UC20-15 à 18)

- **Problème** : « Créer/Modifier/Affecter/Supprimer un rôle » — déjà marqués **« À valider — cf. C-09 (AUDIT_PHASE_01) »** dans `docs/PHASE_04_USE_CASE_CLASSIFICATION.md` lui-même, avant même cette phase.
- **Analyse** : cette ambiguïté a été signalée par une phase antérieure et n'a pas été résolue depuis. La règle absolue de cette phase (« ne pas trancher arbitrairement ») s'applique d'autant plus fort qu'il s'agit ici du modèle RBAC lui-même — une erreur de modélisation des rôles affecterait potentiellement l'accès de tous les utilisateurs de tous les tenants.
- **Statut** : **BLOQUANT — non retranché, cohérent avec le marquage déjà existant.**

### 3. `mfa.manage`

- **Problème** : la permission existe dans le catalogue RBAC mais n'est utilisée nulle part dans l'application (confirmé par recherche directe). Aucun Use Case des sources ne définit précisément quelle action administrative elle devrait couvrir.
- **Sources** : lecture directe de `rbac.mocks.ts` (permission présente) et de `access-module.tsx` (aucun usage) ; absence de UC nommé « Réinitialiser le MFA d'un utilisateur » ou équivalent dans `docs/PHASE_04_USE_CASE_CLASSIFICATION.md`.
- **Analyse** : deux lectures plausibles sans arbitrage possible — (a) `mfa.manage` couvre une action administrative de type « forcer la désactivation du MFA d'un utilisateur qui a perdu son appareil » (scénario de récupération de compte courant dans les systèmes réels) ; (b) `mfa.manage` couvre la configuration de la politique MFA au niveau tenant (obligatoire ou non, méthodes autorisées). Construire l'une ou l'autre sans confirmation reviendrait à inventer un comportement MFA, explicitement interdit (règle §10).
- **Décision proposée** : **Question à trancher : que doit précisément permettre `mfa.manage` ?**
- **Statut** : **DECISION REQUIRED — aucune fausse UI MFA construite.**

---

## Sujets nécessitant un arbitrage produit (non bloquants pour ce qui est livré)

### 4. Auto-désactivation d'un compte

- **Problème** : aucune source ne précise si un utilisateur (ou un administrateur agissant sur son propre compte) doit pouvoir se désactiver lui-même via l'action « Désactiver » livrée dans cette phase.
- **Analyse** : empêcher l'auto-désactivation est une politique de sécurité courante dans les systèmes réels (éviter qu'un dernier administrateur ne se verrouille hors de l'application), mais elle n'est définie nulle part dans les sources — l'inventer serait une politique de sécurité non sourcée (règle absolue). Ne pas l'empêcher pourrait, dans un cas limite (un seul administrateur pour un tenant), le déconnecter de fait sans recours frontend (pas d'authentification réelle de toute façon à ce stade).
- **Décision proposée** : **Question à trancher : faut-il empêcher un utilisateur de désactiver son propre compte ?**
- **Statut** : **DECISION REQUIRED** (n'affecte pas le fonctionnement livré — l'action reste disponible sans restriction particulière, comme le formulaire générique le permet par défaut).

---

## Hors périmètre (rappel, pas une nouvelle décision)

- **Authentification réelle, réinitialisation/changement de mot de passe** (UC01-14, UC03-03/05, UC20-04/06) — déjà `BACKEND PENDING`, cohérent avec le reste de l'application (Sign In/Sign Up simulés depuis `docs/MIGRATION_SITE_VITRINE_REPORT.md`). Aucune gestion réelle d'identifiants n'a été ajoutée ni n'était prévue par cette phase (règle §12).
- **Audit / journalisation des événements de sécurité** (§16 du mandat) — explicitement renvoyé à la Phase 11, non traité ici.

---

## Synthèse

3 sujets **BLOQUANT** (CRUD Permissions — modifierait une constante RBAC globale partagée par toute l'application ; CRUD Rôles — déjà signalé ambigu depuis l'audit initial ; `mfa.manage` — permission sans action définie), 1 sujet **DECISION REQUIRED** non bloquant (auto-désactivation). Aucun n'a été résolu par supposition ; aucune protection existante n'a été affaiblie pour les contourner.
