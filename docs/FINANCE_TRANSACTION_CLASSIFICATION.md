# Classification des transactions financières

Mandat « CLASSIFICATION DES TRANSACTIONS ». Source unique de vérité :
[`src/mocks/finance/transaction-classification.ts`](../src/mocks/finance/transaction-classification.ts).

## Hiérarchie (stricte, 2 niveaux)

```
CATÉGORIE
├── ÉPARGNE        (category = EPARGNE)        → jamais de sous-catégorie
├── PRÊT           (category = PRET)           → jamais de sous-catégorie
├── REMBOURSEMENT  (category = REMBOURSEMENT)  → jamais de sous-catégorie
└── AUTRES         (category = AUTRES)         → sous-catégorie OBLIGATOIRE
        └── DEPOT · RETRAIT · FRAIS · PENALITE · TRANSFERT ·
            DISTRIBUTION · COTISATION · CORRECTION · AUTRE
```

Libellés affichés (fr) : Épargne · Prêt · Remboursement · Autres ;
sous-catégories : Dépôt · Retrait · Frais · Pénalité · Transfert · Distribution ·
Cotisation · Correction · Autre.

## Règle métier

`subcategory IS NULL` pour `EPARGNE` / `PRET` / `REMBOURSEMENT` ;
`subcategory IS NOT NULL` (et ∈ liste) pour `AUTRES`.

Toute autre combinaison est **rejetée côté service** (`isClassificationValid`,
appelée par `financeService.createTransaction` / `updateTransaction`) :
catégorie inconnue, `AUTRES` sans sous-catégorie, catégorie directe avec
sous-catégorie (ex. `EPARGNE` + `FRAIS`), sous-catégorie inconnue.

## Frontend

Formulaire « + Ajouter une transaction » : champ **Catégorie** d'abord ; le champ
**Sous-catégorie** n'est monté que si `category === 'AUTRES'` et est vidé (non
transmis) dès qu'on quitte `AUTRES`. Le journal affiche une colonne **Catégorie**
(pas de colonne « Opération »), la sous-catégorie apparaît en second niveau
(`Catégorie · Sous-catégorie`) dans la ligne et dans la fiche détail. Filtre
journal : `Catégorie` (4 valeurs) + `Sous-catégorie` dépendant, visible seulement
pour `AUTRES`.

## Migration du seed (mock, pas de BD)

`src/mocks/finance/transactions.ts` — correspondance ancienne → nouvelle
nomenclature appliquée aux 15 lignes seed :

| ancien `category` | nouveau `category` | `subcategory` |
|---|---|---|
| `contribution` | `EPARGNE` | — |
| `loanDisbursement` | `PRET` | — |
| `loanRepayment` / `repayment` | `REMBOURSEMENT` | — |
| `fee` | `AUTRES` | `FRAIS` |
| `transfer` | `AUTRES` | `TRANSFERT` |
| `distribution` | `AUTRES` | `DISTRIBUTION` |
| `penalty` | `AUTRES` | `PENALITE` |
| `deposit` | `AUTRES` | `DEPOT` |
| `withdrawal` | `AUTRES` | `RETRAIT` |
| `other` | `AUTRES` | `AUTRE` |

Les cotisations de tontine sont gérées par leur propre module (Tontines) et
n'écrivent pas dans le journal Finance ; `COTISATION` reste disponible comme
sous-catégorie de `AUTRES` pour une cotisation associative hors tontine.

## Débit / Crédit

Le modèle conserve `amount` (magnitude strictement positive) + `type:
'debit' | 'credit'` — c'est l'invariant « débit XOR crédit » du mandat §9 (une
transaction porte un montant et un sens, jamais les deux colonnes à la fois). Le
journal affiche des colonnes Débit / Crédit dérivées de `type`.
