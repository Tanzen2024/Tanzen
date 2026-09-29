/**
 * Référentiel central de la classification des transactions financières (mandat
 * « CLASSIFICATION DES TRANSACTIONS »). Source unique de vérité : aucun autre
 * fichier (modèle, service, UI, tests, i18n) ne doit redéclarer ces valeurs.
 *
 * Hiérarchie stricte à DEUX niveaux :
 *
 *   CATÉGORIE
 *   ├── ÉPARGNE        → jamais de sous-catégorie (subcategory === null)
 *   └── AUTRES         → sous-catégorie OBLIGATOIRE (une des valeurs ci-dessous)
 *
 * Mandat « Prêts / remboursements indépendants des caisses » (2026-09-25) : PRÊT et
 * REMBOURSEMENT ne sont plus des catégories mais des sous-catégories d'AUTRES. Le prêt
 * (`Loan`) et le remboursement (`Repayment`) sont des engagements métier sans caisse ;
 * la TRANSACTION est le mouvement financier, liée à la caisse (`source`/`destination`)
 * et au prêt (`loanId`, `repaymentId`) : Caisse ← Transaction → Prêt.
 *
 * Convention identique à `src/mocks/settings/fiscal-year-transfer-categories.ts` :
 * tuples `as const` + helpers de clés i18n + prédicats métier réutilisables
 * côté service ET côté formulaire.
 */

/** Les 2 catégories officielles, exactement — dans l'ordre d'affichage. */
export const TRANSACTION_CATEGORIES = ['EPARGNE', 'AUTRES'] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

/**
 * Sous-catégories de `AUTRES`, exactement — dans l'ordre d'affichage. `INSCRIPTION`,
 * `ACHAT_TONTINE`, `SECOURS` (mandat « Type des transactions », 2026-09-25) : opérations
 * des caisses système Inscription / Achat tontine / Secours, toujours en CRÉDIT.
 * `PRET` (décaissement, DÉBIT) et `REMBOURSEMENT` (encaissement, CRÉDIT) : mouvements
 * financiers d'un prêt, portés par la transaction.
 */
export const AUTRES_SUBCATEGORIES = ['INSCRIPTION', 'ACHAT_TONTINE', 'SECOURS', 'PRET', 'REMBOURSEMENT', 'DEPOT', 'RETRAIT', 'FRAIS', 'PENALITE', 'TRANSFERT', 'DISTRIBUTION', 'COTISATION', 'CORRECTION', 'AUTRE'] as const;
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

/** `AUTRES` uniquement expose des sous-catégories ; `EPARGNE` n'en a aucune. */
export function subcategoriesFor(category: TransactionCategory): readonly TransactionSubcategory[] {
  return category === 'AUTRES' ? AUTRES_SUBCATEGORIES : [];
}

/**
 * Règle métier du §« MODÈLE DE DONNÉES » : la combinaison (catégorie, sous-catégorie)
 * est valide ssi
 *   - catégorie === EPARGNE ET sous-catégorie absente (null/undefined) ;
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
 * catégorie. Pour toute opération dont le type est IMPOSÉ (`requiredTransactionType`),
 * c'est ce type qui s'applique — seule l'opération « Autres » libre reste modifiable.
 */
export const DEFAULT_DIRECTION: Record<TransactionCategory, 'debit' | 'credit'> = {
  EPARGNE: 'credit',
  AUTRES: 'credit',
};

/** Opérations « Autres » dont le type est imposé : caisses système, décaissement / encaissement d'un prêt. */
const FORCED_AUTRES_TYPE: Partial<Record<TransactionSubcategory, 'debit' | 'credit'>> = {
  INSCRIPTION: 'credit',
  ACHAT_TONTINE: 'credit',
  SECOURS: 'credit',
  PRET: 'debit',
  REMBOURSEMENT: 'credit',
};

/**
 * TYPE OBLIGATOIRE D'UNE OPÉRATION (mandat « Type des transactions », 2026-09-25) —
 * source UNIQUE de la règle, utilisée par le service (`insertTransaction`,
 * `updateTransaction`) ET par les deux formulaires (saisie détaillée, saisie rapide) :
 *
 *   Épargne → crédit
 *   Autres / Prêt → débit · Autres / Remboursement → crédit
 *   Autres / Inscription · Achat tontine · Secours → crédit
 *   Autres / toute autre sous-catégorie → `null` (crédit OU débit, au choix)
 */
export function requiredTransactionType(category: TransactionCategory | '' | null | undefined, subcategory?: TransactionSubcategory | '' | null): 'debit' | 'credit' | null {
  if (!category) return null;
  if (category === 'AUTRES') return (subcategory && FORCED_AUTRES_TYPE[subcategory]) || null;
  return DEFAULT_DIRECTION[category];
}

/** Le type est-il permis pour cette opération ? (type imposé respecté, ou « Autres » libre). */
export function isTransactionTypeAllowed(category: TransactionCategory, subcategory: TransactionSubcategory | null | undefined, type: unknown): boolean {
  if (type !== 'debit' && type !== 'credit') return false;
  const required = requiredTransactionType(category, subcategory ?? null);
  return required === null || required === type;
}

/** Transaction de DÉCAISSEMENT d'un prêt (AUTRES / PRET). */
export function isLoanDisbursement(category: TransactionCategory | '' | null | undefined, subcategory?: TransactionSubcategory | '' | null): boolean {
  return category === 'AUTRES' && subcategory === 'PRET';
}

/** Transaction d'ENCAISSEMENT d'un remboursement (AUTRES / REMBOURSEMENT). */
export function isLoanRepayment(category: TransactionCategory | '' | null | undefined, subcategory?: TransactionSubcategory | '' | null): boolean {
  return category === 'AUTRES' && subcategory === 'REMBOURSEMENT';
}

/**
 * CATÉGORIES DE SAISIE proposées à l'utilisateur (mandat « Catégories de transactions »,
 * 2026-09-27) — EXACTEMENT 4, dans l'ordre d'affichage : Épargner · Rembourser ·
 * Emprunter · Autres. Ce sont des libellés de saisie : le système en déduit
 * Catégorie de saisie → Catégorie (modèle) → Sous-catégorie → Type obligatoire éventuel.
 *
 *   Épargner   → EPARGNE                 → Crédit (imposé)
 *   Rembourser → AUTRES / REMBOURSEMENT  → Crédit (imposé)
 *   Emprunter  → AUTRES / PRET           → Débit  (imposé)
 *   Autres     → AUTRES / sous-catégorie libre → Crédit ou Débit (au choix)
 *
 * Les anciennes opérations Inscription / Achat tontine / Secours ne sont plus
 * proposées à la saisie ; elles restent des sous-catégories VALIDES du modèle
 * (historique + écritures système du module Tontine, ex. Achat tontine).
 * Les identifiants techniques (`TransactionOperation`) sont conservés.
 */
export const TRANSACTION_OPERATIONS = ['EPARGNE', 'REMBOURSEMENT', 'PRET', 'AUTRES'] as const;
export type TransactionOperation = (typeof TRANSACTION_OPERATIONS)[number];

/** Sous-catégories portées par une catégorie de saisie dédiée (Rembourser / Emprunter). */
const OPERATION_SUBCATEGORIES: ReadonlySet<TransactionSubcategory> = new Set(['PRET', 'REMBOURSEMENT']);
/** Sous-catégories réservées à l'historique et aux écritures système : jamais choisies à la saisie. */
const NON_SELECTABLE_SUBCATEGORIES: ReadonlySet<TransactionSubcategory> = new Set(['INSCRIPTION', 'ACHAT_TONTINE', 'SECOURS', ...OPERATION_SUBCATEGORIES]);

/** Sous-catégories d'AUTRES laissées au choix de l'utilisateur quand la catégorie de saisie est « Autres ». */
export const FREE_AUTRES_SUBCATEGORIES: readonly TransactionSubcategory[] = AUTRES_SUBCATEGORIES.filter((subcategory) => !NON_SELECTABLE_SUBCATEGORIES.has(subcategory));

/**
 * Sous-catégories d'AUTRES rangées sous la catégorie de saisie « Autres » — TOUTES sauf
 * celles portées par Rembourser / Emprunter, y compris l'historique et les écritures système
 * (Inscription, Achat tontine, Secours) : le filtre « Autres » doit retrouver 100 % d'entre elles.
 */
export const OTHER_OPERATION_SUBCATEGORIES: readonly TransactionSubcategory[] = AUTRES_SUBCATEGORIES.filter((subcategory) => !OPERATION_SUBCATEGORIES.has(subcategory));

/**
 * Inverse de `classificationForOperation` : catégorie de saisie d'une transaction stockée
 * (valeurs techniques inchangées). Toute classification tombe dans EXACTEMENT une des
 * 4 catégories de saisie — sert à la colonne et au filtre « Actions » de Finance → Transactions.
 */
export function operationForClassification(category: TransactionCategory, subcategory?: TransactionSubcategory | '' | null): TransactionOperation {
  if (category === 'EPARGNE') return 'EPARGNE';
  if (subcategory === 'PRET' || subcategory === 'REMBOURSEMENT') return subcategory;
  return 'AUTRES';
}

/** Clé i18n (section `finance`) du libellé d'une catégorie de saisie — ex. `operationPRET` (« Emprunter »). */
export const operationLabelKey = (operation: TransactionOperation): string => `operation${operation}`;

/**
 * Classification déterminée par la catégorie de saisie. Pour « Autres », `subcategory`
 * est la sous-catégorie libre choisie (vide tant qu'elle n'est pas choisie ou si elle
 * n'est pas sélectionnable).
 */
export function classificationForOperation(operation: TransactionOperation, freeSubcategory: TransactionSubcategory | '' = ''): { category: TransactionCategory; subcategory: TransactionSubcategory | '' } {
  if (operation === 'EPARGNE') return { category: 'EPARGNE', subcategory: '' };
  if (operation === 'AUTRES') return { category: 'AUTRES', subcategory: freeSubcategory && !NON_SELECTABLE_SUBCATEGORIES.has(freeSubcategory) ? freeSubcategory : '' };
  return { category: 'AUTRES', subcategory: operation };
}
