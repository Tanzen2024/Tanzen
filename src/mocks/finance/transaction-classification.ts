/**
 * Référentiel central de la classification des transactions financières (mandat
 * « CLASSIFICATION DES TRANSACTIONS »). Source unique de vérité : aucun autre
 * fichier (modèle, service, UI, tests, i18n) ne doit redéclarer ces valeurs.
 *
 * Hiérarchie stricte à DEUX niveaux :
 *
 *   CATÉGORIE
 *   ├── ÉPARGNE        → jamais de sous-catégorie (subcategory === null)
 *   ├── PRÊT           → jamais de sous-catégorie
 *   ├── REMBOURSEMENT  → jamais de sous-catégorie
 *   └── AUTRES         → sous-catégorie OBLIGATOIRE (une des 9 valeurs ci-dessous)
 *
 * Convention identique à `src/mocks/settings/fiscal-year-transfer-categories.ts` :
 * tuples `as const` + helpers de clés i18n + prédicats métier réutilisables
 * côté service ET côté formulaire.
 */

/** Les 4 catégories officielles, exactement — dans l'ordre d'affichage. */
export const TRANSACTION_CATEGORIES = ['EPARGNE', 'PRET', 'REMBOURSEMENT', 'AUTRES'] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

/** Sous-catégories de `AUTRES`, exactement — dans l'ordre d'affichage. */
export const AUTRES_SUBCATEGORIES = ['DEPOT', 'RETRAIT', 'FRAIS', 'PENALITE', 'TRANSFERT', 'DISTRIBUTION', 'COTISATION', 'CORRECTION', 'AUTRE'] as const;
export type TransactionSubcategory = (typeof AUTRES_SUBCATEGORIES)[number];

/** Clé i18n (section `finance`) du libellé d'une catégorie — ex. `categoryEPARGNE`. */
export const categoryLabelKey = (category: TransactionCategory): string => `category${category}`;
/** Clé i18n (section `finance`) du libellé d'une sous-catégorie — ex. `subcatDEPOT`. */
export const subcategoryLabelKey = (subcategory: TransactionSubcategory): string => `subcat${subcategory}`;

const CATEGORY_SET: ReadonlySet<string> = new Set(TRANSACTION_CATEGORIES);
const SUBCATEGORY_SET: ReadonlySet<string> = new Set(AUTRES_SUBCATEGORIES);

export function isTransactionCategory(value: unknown): value is TransactionCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value);
}

export function isTransactionSubcategory(value: unknown): value is TransactionSubcategory {
  return typeof value === 'string' && SUBCATEGORY_SET.has(value);
}

/** `AUTRES` uniquement expose des sous-catégories ; les 3 autres catégories n'en ont aucune. */
export function subcategoriesFor(category: TransactionCategory): readonly TransactionSubcategory[] {
  return category === 'AUTRES' ? AUTRES_SUBCATEGORIES : [];
}

/**
 * Règle métier du §« MODÈLE DE DONNÉES » : la combinaison (catégorie, sous-catégorie)
 * est valide ssi
 *   - catégorie ∈ {EPARGNE, PRET, REMBOURSEMENT} ET sous-catégorie absente (null/undefined) ;
 *   - OU catégorie === AUTRES ET sous-catégorie ∈ AUTRES_SUBCATEGORIES.
 * Rejette donc : catégorie inconnue, `AUTRES` sans sous-catégorie, catégorie directe
 * AVEC sous-catégorie, sous-catégorie inconnue.
 */
export function isClassificationValid(category: unknown, subcategory: unknown): boolean {
  if (!isTransactionCategory(category)) return false;
  const hasSubcategory = subcategory !== null && subcategory !== undefined && subcategory !== '';
  if (category === 'AUTRES') return hasSubcategory && isTransactionSubcategory(subcategory);
  return !hasSubcategory;
}

/**
 * Sens (débit/crédit) proposé par défaut au chargement du formulaire selon la
 * catégorie — l'utilisateur reste libre de le modifier. Une entrée d'épargne ou un
 * remboursement alimente la caisse (crédit) ; un décaissement de prêt en sort (débit).
 */
export const DEFAULT_DIRECTION: Record<TransactionCategory, 'debit' | 'credit'> = {
  EPARGNE: 'credit',
  PRET: 'debit',
  REMBOURSEMENT: 'credit',
  AUTRES: 'credit',
};
