import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_CATEGORIES,
  AUTRES_SUBCATEGORIES,
  DEFAULT_DIRECTION,
  isClassificationValid,
  isTransactionCategory,
  isTransactionSubcategory,
  subcategoriesFor,
} from './transaction-classification';

/**
 * Mandat « CLASSIFICATION DES TRANSACTIONS » : hiérarchie stricte à deux niveaux.
 * Ce référentiel est la source unique — ces invariants protègent contre toute
 * dérive (ajout/retrait de valeur, sous-catégorie sur une catégorie directe).
 */
describe('transaction-classification — référentiel', () => {
  it('expose exactement les 4 catégories officielles, dans l’ordre', () => {
    expect([...TRANSACTION_CATEGORIES]).toEqual(['EPARGNE', 'PRET', 'REMBOURSEMENT', 'AUTRES']);
  });

  it('expose exactement les 9 sous-catégories de AUTRES', () => {
    expect([...AUTRES_SUBCATEGORIES]).toEqual(['DEPOT', 'RETRAIT', 'FRAIS', 'PENALITE', 'TRANSFERT', 'DISTRIBUTION', 'COTISATION', 'CORRECTION', 'AUTRE']);
  });

  it('subcategoriesFor : AUTRES seule expose des sous-catégories', () => {
    expect(subcategoriesFor('AUTRES')).toEqual(AUTRES_SUBCATEGORIES);
    for (const category of ['EPARGNE', 'PRET', 'REMBOURSEMENT'] as const) {
      expect(subcategoriesFor(category)).toEqual([]);
    }
  });

  it('isTransactionCategory / isTransactionSubcategory : gardes runtime', () => {
    expect(isTransactionCategory('EPARGNE')).toBe(true);
    expect(isTransactionCategory('CONTRIBUTION')).toBe(false);
    expect(isTransactionCategory(undefined)).toBe(false);
    expect(isTransactionSubcategory('FRAIS')).toBe(true);
    expect(isTransactionSubcategory('EPARGNE')).toBe(false);
  });

  describe('isClassificationValid', () => {
    it('catégories directes : valides SANS sous-catégorie', () => {
      expect(isClassificationValid('EPARGNE', null)).toBe(true);
      expect(isClassificationValid('PRET', undefined)).toBe(true);
      expect(isClassificationValid('REMBOURSEMENT', '')).toBe(true);
    });

    it('catégories directes : invalides AVEC sous-catégorie', () => {
      expect(isClassificationValid('EPARGNE', 'FRAIS')).toBe(false);
      expect(isClassificationValid('PRET', 'DISTRIBUTION')).toBe(false);
    });

    it('AUTRES : valide avec une sous-catégorie connue, invalide sans / avec une inconnue', () => {
      expect(isClassificationValid('AUTRES', 'FRAIS')).toBe(true);
      expect(isClassificationValid('AUTRES', 'DISTRIBUTION')).toBe(true);
      expect(isClassificationValid('AUTRES', null)).toBe(false);
      expect(isClassificationValid('AUTRES', 'INCONNUE')).toBe(false);
    });

    it('catégorie inconnue : toujours invalide', () => {
      expect(isClassificationValid('CONTRIBUTION', null)).toBe(false);
      expect(isClassificationValid(undefined, undefined)).toBe(false);
    });
  });

  it('DEFAULT_DIRECTION couvre les 4 catégories', () => {
    expect(Object.keys(DEFAULT_DIRECTION).sort()).toEqual([...TRANSACTION_CATEGORIES].sort());
    expect(DEFAULT_DIRECTION.PRET).toBe('debit');
    expect(DEFAULT_DIRECTION.EPARGNE).toBe('credit');
  });
});
