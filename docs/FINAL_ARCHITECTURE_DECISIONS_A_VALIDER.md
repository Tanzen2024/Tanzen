# TANZEN — Décisions à valider : Architecture Commercial / Platform / Tenant

**Statut : consolidation.** Ce document ne couvre que les points ouverts par le mandat « TANZEN — REFACTORING ARCHITECTURAL FINAL » (séparation Public/Platform/Tenant, parcours commercial, isolation). Les gaps de modélisation métier des domaines déjà construits (`Loan.status`, `TontinePosition`, permissions RBAC granulaires par domaine comme `transactions.create`, etc.) sont **hors périmètre** ici — ils sont déjà documentés individuellement dans `docs/PHASE_02_DECISIONS_A_VALIDER.md`, `PHASE_06_DECISIONS_A_VALIDER.md`, `PHASE_07_DECISIONS_A_VALIDER.md`, `PHASE_08_DECISIONS_A_VALIDER.md`, `PHASE_09_DECISIONS_A_VALIDER.md`, `PHASE_10_DECISIONS_A_VALIDER.md` — non dupliqués ni ré-ouverts ici.

Voir `docs/FINAL_ARCHITECTURE_COMMERCIAL_TENANT.md` pour le contexte complet de chaque point.

---

## BLOQUANT — nécessite un backend réel (aucune option actionnable côté frontend seul)

### 1. Mécanisme d'authentification réel

**Question à trancher** : JWT (access + refresh) ? Session cookie httpOnly ? SSO ? Aucune source ne le spécifie. Une hypothèse de travail (JWT + refresh token, cookie httpOnly si possible) a été adoptée comme recommandation d'ingénierie par défaut dans `docs/tanzen-frontend-arch-decisions` (mémoire projet) mais **jamais confirmée**.
**Bloque** : E1/E2 de `docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md` — résolution serveur de `tenantId`/`scope`/`permissions`, tout le parcours de login réel.
**Risque de construire sans trancher** : simuler un JWT/session côté frontend seul créerait une fausse impression de sécurité — plus dangereux qu'une absence assumée.

### 2. Fournisseur et flux de paiement SaaS

**Question à trancher** : quel prestataire de paiement (Stripe, Mobile Money local, virement bancaire, autre) ? Paiement unique ou abonnement récurrent facturé comment ? Aucune source ne le spécifie.
**Bloque** : `SubscribePage` → création réelle de tenant (E3/E4), tout le domaine Billing/Subscriptions Platform (E8).

### 3. Mécanisme d'activation du tenant/administrateur initial

**Question à trancher** : lien email avec token à durée limitée ? Définition de mot de passe à la première connexion ? Qui déclenche l'envoi (backend automatique après paiement confirmé) ?
**Bloque** : la transition `Tenant.status: 'pending' → 'active'` — le champ existe déjà en données (`organizationService.createTenant`) mais n'est piloté par aucun écran.

### 4. Vérification serveur de l'isolation tenant

**Question à trancher** : aucune — c'est une exigence non négociable déjà actée (`PHASE_02_TENANT_ISOLATION_SPEC.md` §11-12), simplement rappelée ici car elle ne peut être implémentée tant qu'aucun backend n'existe. Chaque requête doit vérifier `authenticatedUser.tenantId == resource.tenantId` côté serveur, indépendamment de ce que le frontend envoie.

---

## DECISION REQUIRED — arbitrage produit, actionnable frontend une fois tranché

### 5. Périmètre du domaine Platform Administration (Billing/Subscriptions/Payments/Plans)

**Problème** : le mandat (§6) liste `/platform/plans`, `/platform/subscriptions`, `/platform/payments`, `/platform/billing` comme routes cibles. Aucune de ces entités n'existe dans le modèle de données actuel (`dictionnaire_donnees.xlsx`, 59 tables) ni dans le catalogue RBAC — confirmé par recherche directe (`billing.read`, `subscriptions.read`, `payments.read`, `plans.read` : aucune occurrence dans `src/mocks/rbac.mocks.ts`).
**Question à trancher** : ce domaine doit-il être spécifié (schéma de données `Plan`/`Subscription`/`Invoice`/`Payment`, permissions RBAC associées) avant toute construction frontend, ou reste-t-il `MISSING` jusqu'à ce qu'un backend/modèle de données existe ?
**Ne pas trancher par défaut** : construire ces écrans sur un schéma inventé violerait la règle anti-invention (§26 du mandat).

### 6. Redondance `landing/` vs `src/features/public/`

**Problème** : déjà tranché lors d'une mission antérieure — `landing/` (Next.js, source de la migration) archivé vers `_archive/landing-nextjs-legacy/` avec validation explicite de Hugues, plutôt que supprimé ou laissé en place à la racine.
**Écart avec le mandat courant** : le texte du mandat décrit `landing/` comme présent à `tanzen-frontend/landing` et demande explicitement de ne pas le supprimer — ce qui est cohérent avec la décision déjà prise (rien n'a été supprimé), mais l'emplacement a changé.
**Question à trancher (si désaccord avec la décision déjà actée)** : faut-il restaurer `landing/` à son emplacement d'origine ? Aucune action prise ici sans confirmation explicite — la décision précédente reste en vigueur par défaut.

### 7. Trajectoire monorepo pour le site vitrine

**Problème** : Décision C de `docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md` — Option A (même dépôt) retenue immédiatement, Option C (monorepo `apps/marketing`/`apps/app`) documentée comme trajectoire future si le SEO/la performance deviennent critiques.
**Question à trancher** : à quel seuil (trafic, exigence SEO explicite) faut-il déclencher cette migration ? Non urgent, aucune action requise tant que le produit reste pré-lancement.

---

## Synthèse

4 sujets **BLOQUANT** (authentification réelle, paiement, activation tenant, vérification serveur d'isolation) — tous nécessitent un backend qui n'existe pas dans ce projet ; les construire de façon simulée créerait une fausse impression de conformité, explicitement proscrite par le mandat. 3 sujets **DECISION REQUIRED** (périmètre Billing Platform, redondance `landing/`, trajectoire monorepo) — actionnables sans backend une fois arbitrés, aucun n'affecte le fonctionnement déjà livré et vérifié.

*Fin du document.*
