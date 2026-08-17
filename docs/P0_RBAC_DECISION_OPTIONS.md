# TANZEN — P0 RBAC : Options de décision pour le Product Owner

**Document court, décisionnel.** Détail complet et sources dans `docs/P0_RBAC_DECISION_ANALYSIS.md` et `docs/P0_RBAC_AUDIT.md`. Aucune option ci-dessous n'est validée — ce document présente des choix, pas des faits accomplis.

---

## D1 — Portée des rôles

### Question
Un rôle RBAC (« Administrateur », « Gestionnaire », « Lecture seule »...) est-il une configuration **partagée par tous les tenants**, ou une ressource **propre à chaque tenant** ?

### Options

**Option A — Rôles globaux** (état actuel du code, dans `tanzen-frontend` et `tanzen-commercial`)
Un seul jeu de 3 rôles pour toute la plateforme, identique pour tous les tenants.

**Option B — Rôles tenant-scopés** (modèle canonique du dictionnaire de données)
Chaque tenant possède ses propres rôles, personnalisables indépendamment les uns des autres.

### Avantages / Inconvénients

| | Option A (Global) | Option B (Tenant-scopé) |
|---|---|---|
| Avantages | Déjà construit, testé, stable (5+ phases) ; zéro migration ; simple | Conforme au modèle de données canonique ; personnalisation possible par tenant ; cohérent avec l'isolation déjà appliquée à `users` |
| Inconvénients | Contredit le modèle canonique verrouillé | Migration non triviale ; aucun besoin métier concret n'a jamais été exprimé pour justifier des rôles différents par tenant |

### Conséquences
- **Si A** : aucun changement de code. Le modèle canonique devrait être formellement annoté comme dérogé (précédent déjà établi pour d'autres champs du projet).
- **Si B** : `SystemRole` gagne un `tenantId` ; `role.service.ts` doit filtrer par tenant comme `userService` le fait déjà ; les 3 rôles actuels doivent être dupliqués par tenant ou remplacés par un mécanisme de rôles par défaut (à spécifier).

### Recommandation
**Option B**, par cohérence avec la méthode déjà appliquée dans ce projet (les décisions passées — `is_active`, isolation stricte des utilisateurs — ont systématiquement privilégié le modèle canonique sur l'existant quand les deux divergeaient). Réserve : si aucun besoin métier de personnalisation par tenant n'est identifié, Option A reste défendable à condition d'être actée explicitement comme dérogation documentée.

---

## D2 — Lieu d'administration des rôles

### Question
Un futur écran de gestion des rôles (créer/modifier/supprimer) doit-il vivre dans `tanzen-frontend` (Application Tenant) ou dans `tanzen-commercial` (Platform Administration) ?

### Options

**Option A — `tanzen-frontend`**
Un administrateur de chaque tenant gère ses propres rôles.

**Option B — `tanzen-commercial`**
Seul un opérateur Platform gère les rôles (de tous les tenants).

**Option C — Hybride** *(directement supportée par les sources : les Use Cases distinguent explicitement « Gestion des rôles » — transversale, ouverte à un Administrateur Tenant — de « Gestion des permissions » — strictement Platform)*
Rôles → `tanzen-frontend` ; catalogue de permissions (la liste des actions possibles elle-même) → `tanzen-commercial`.

### Avantages / Inconvénients

| | Option A | Option B | Option C |
|---|---|---|---|
| Avantages | Cohérent avec la gestion déjà locale de Users/Sessions/MFA | Centralise le risque, cohérent avec la doctrine « aucune administration transverse dans le Tenant App » | Suit exactement ce que les sources documentent ; isole le risque le plus sévère (modifier le catalogue global de permissions) côté Platform |
| Inconvénients | Incohérent si D1 = Option A (rôles globaux) | Rupture de parcours pour l'administrateur tenant ; bloqué par l'absence de compte « Super Administrateur » distinct | Plus complexe (deux chantiers au lieu d'un) |

### Conséquences
- **Si A** : nouvelles routes/écrans dans `tanzen-frontend` ; n'a de sens que si D1 = Option B.
- **Si B** : nouveau module à construire dans `tanzen-commercial` (aujourd'hui inexistant, vérifié) ; bloqué par l'absence de compte Super Administrateur (déjà signalé ailleurs).
- **Si C** : les deux chantiers ci-dessus, chacun de portée réduite.

### Recommandation
**Option C**, parce qu'elle suit fidèlement ce que les Use Cases sources décrivent déjà (les deux périmètres — Rôles et Permissions — sont traités différemment dans les sources elles-mêmes), et isole le risque de sécurité le plus sévère déjà identifié (modification d'une configuration RBAC partagée par toute l'application). **Dépend de D1 = Option B** pour être pleinement cohérente ; si D1 = Option A est retenue à la place, cette recommandation bascule vers Option B (tout Platform).

---

## D3 — Affectation Utilisateur ↔ Rôle

### Question
L'affectation d'un rôle à un utilisateur doit-elle rester le mécanisme actuel (`roleIds`, un simple tableau sur l'utilisateur), ou devenir une vraie entité de données dédiée avec ses propres métadonnées (qui a affecté quoi, quand) ?

### Options

**Option A — Statu quo (`roleIds`)**
Rien ne change dans le modèle de données.

**Option B — Vraie entité `users_roles`**
Une table dédiée, avec traçabilité complète.

**Option C — Hybride**
Garder `roleIds` tel quel, mais ajouter des vérifications de sécurité qui manquent aujourd'hui (existence du rôle, garde anti-élévation appliquée aussi côté service, pas seulement dans l'écran).

### Avantages / Inconvénients

| | Option A | Option B | Option C |
|---|---|---|---|
| Avantages | Fonctionne déjà, zéro migration | Traçabilité complète, conforme au modèle canonique | Réduit un risque de sécurité réel dès maintenant, sans attendre D1 |
| Inconvénients | Un risque de sécurité déjà identifié (contournement possible de la garde d'écran) reste ouvert | Aucun besoin métier ne le demande aujourd'hui ; n'a de sens plein que si D1 = Option B | Ne couvre pas tout tant que D1 n'est pas tranchée |

### Le risque de sécurité concerné, en une phrase
Aujourd'hui, un appel technique direct (contournant l'écran normal) pourrait attribuer n'importe quel rôle — y compris un rôle à privilèges élevés — à n'importe quel utilisateur, sans qu'aucune vérification ne s'y oppose côté service. C'est un risque déjà documenté, pas une découverte nouvelle de cette analyse — et rappel important : même corrigé côté frontend, ce ne serait jamais qu'une aide, jamais une vraie protection tant qu'aucun backend réel n'existe.

### Conséquences
- **Si A** : aucun changement, le risque ci-dessus reste entier.
- **Si B** : nouvelle entité à concevoir, pertinente seulement une fois D1 tranchée.
- **Si C** : quelques fonctions de validation ajoutées, aucun changement de modèle de données.

### Recommandation
**Option C** — traiter maintenant ce qui peut l'être sans attendre D1, tout en restant compatible avec une migration ultérieure vers Option B si D1 = Option B est retenue.

---

## Dépendances entre décisions

```
D1 doit être tranchée en premier.
D2 et D3 en dépendent tous les deux directement (mais pas l'un de l'autre) :

        ┌── D2 (lieu d'administration)
D1 ─────┤
        └── D3 (robustesse de l'affectation)
```

---

## Synthèse des recommandations (à valider, non décidées)

| Décision | Recommandation |
|---|---|
| D1 | Option B — rôles tenant-scopés |
| D2 | Option C — rôles dans `tanzen-frontend`, permissions dans `tanzen-commercial` |
| D3 | Option C — statu quo renforcé par des validations supplémentaires |

**D1 : À VALIDER**
**D2 : À VALIDER**
**D3 : À VALIDER**
