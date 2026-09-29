import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_CATEGORIES,
  AUTRES_SUBCATEGORIES,
  DEFAULT_DIRECTION,
  FREE_AUTRES_SUBCATEGORIES,
  TRANSACTION_OPERATIONS,
  classificationForOperation,
  isClassificationValid,
  isLoanDisbursement,
  isLoanRepayment,
  requiredTransactionType,
  isTransactionCategory,
  isTransactionSubcategory,
  subcategoriesFor,
  OTHER_OPERATION_SUBCATEGORIES,
  operationForClassification,
} from './transaction-classification';

/**
 * Mandat « CLASSIFICATION DES TRANSACTIONS » : hiérarchie stricte à deux niveaux.
 * Ce référentiel est la source unique — ces invariants protègent contre toute
 * dérive (ajout/retrait de valeur, sous-catégorie sur une catégorie directe).
 */
describe('transaction-classification — référentiel', () => {
  // Mandat « Prêts / remboursements indépendants des caisses » (2026-09-25) : PRET / REMBOURSEMENT deviennent des sous-catégories d'AUTRES.
  it('expose exactement les 2 catégories officielles, dans l’ordre', () => {
    expect([...TRANSACTION_CATEGORIES]).toEqual(['EPARGNE', 'AUTRES']);
  });

  // Mandat « Type des transactions » (2026-09-25) : + INSCRIPTION, ACHAT_TONTINE, SECOURS (caisses système, toujours en crédit).
  it('expose exactement les 14 sous-catégories de AUTRES (dont PRET et REMBOURSEMENT)', () => {
    expect([...AUTRES_SUBCATEGORIES]).toEqual(['INSCRIPTION', 'ACHAT_TONTINE', 'SECOURS', 'PRET', 'REMBOURSEMENT', 'DEPOT', 'RETRAIT', 'FRAIS', 'PENALITE', 'TRANSFERT', 'DISTRIBUTION', 'COTISATION', 'CORRECTION', 'AUTRE']);
  });

  it('subcategoriesFor : AUTRES seule expose des sous-catégories', () => {
    expect(subcategoriesFor('AUTRES')).toEqual(AUTRES_SUBCATEGORIES);
    expect(subcategoriesFor('EPARGNE')).toEqual([]);
  });

  it('isTransactionCategory / isTransactionSubcategory : gardes runtime', () => {
    expect(isTransactionCategory('EPARGNE')).toBe(true);
    expect(isTransactionCategory('CONTRIBUTION')).toBe(false);
    expect(isTransactionCategory(undefined)).toBe(false);
    expect(isTransactionSubcategory('FRAIS')).toBe(true);
    expect(isTransactionSubcategory('EPARGNE')).toBe(false);
  });

  describe('isClassificationValid', () => {
    it('ÉPARGNE : valide SANS sous-catégorie, invalide AVEC', () => {
      expect(isClassificationValid('EPARGNE', null)).toBe(true);
      expect(isClassificationValid('EPARGNE', '')).toBe(true);
      expect(isClassificationValid('EPARGNE', 'FRAIS')).toBe(false);
      expect(isClassificationValid('EPARGNE', 'PRET')).toBe(false);
    });

    it('PRET / REMBOURSEMENT ne sont plus des catégories : seulement AUTRES / PRET et AUTRES / REMBOURSEMENT', () => {
      expect(isClassificationValid('PRET', null)).toBe(false);
      expect(isClassificationValid('REMBOURSEMENT', undefined)).toBe(false);
      expect(isClassificationValid('AUTRES', 'PRET')).toBe(true);
      expect(isClassificationValid('AUTRES', 'REMBOURSEMENT')).toBe(true);
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

  it('DEFAULT_DIRECTION couvre les 2 catégories', () => {
    expect(Object.keys(DEFAULT_DIRECTION).sort()).toEqual([...TRANSACTION_CATEGORIES].sort());
    expect(DEFAULT_DIRECTION.EPARGNE).toBe('credit');
  });

  it('isLoanDisbursement / isLoanRepayment : AUTRES / PRET et AUTRES / REMBOURSEMENT uniquement', () => {
    expect(isLoanDisbursement('AUTRES', 'PRET')).toBe(true);
    expect(isLoanDisbursement('AUTRES', 'REMBOURSEMENT')).toBe(false);
    expect(isLoanDisbursement('AUTRES', 'FRAIS')).toBe(false);
    expect(isLoanRepayment('AUTRES', 'REMBOURSEMENT')).toBe(true);
    expect(isLoanRepayment('AUTRES', 'PRET')).toBe(false);
    expect(isLoanRepayment('EPARGNE', null)).toBe(false);
  });
});

/**
 * CATÉGORIES DE SAISIE (mandat « Catégories de transactions », 2026-09-27) : exactement
 * Épargner · Rembourser · Emprunter · Autres ; le système en déduit
 * Catégorie de saisie → Catégorie → Sous-catégorie → Type obligatoire éventuel.
 */
describe('transaction-classification — catégories de saisie', () => {
  it('expose exactement les 4 catégories de saisie, dans l’ordre', () => {
    expect([...TRANSACTION_OPERATIONS]).toEqual(['EPARGNE', 'REMBOURSEMENT', 'PRET', 'AUTRES']);
  });

  it.each([
    ['EPARGNE', 'EPARGNE', '', 'credit'],
    ['PRET', 'AUTRES', 'PRET', 'debit'],
    ['REMBOURSEMENT', 'AUTRES', 'REMBOURSEMENT', 'credit'],
  ] as const)('%s → catégorie %s, sous-catégorie « %s », type imposé %s', (operation, category, subcategory, type) => {
    const classification = classificationForOperation(operation);
    expect(classification).toEqual({ category, subcategory });
    expect(requiredTransactionType(classification.category, classification.subcategory)).toBe(type);
  });

  it('AUTRES ordinaire → catégorie AUTRES, sous-catégorie libre, type au choix (non imposé)', () => {
    expect(classificationForOperation('AUTRES')).toEqual({ category: 'AUTRES', subcategory: '' });
    expect(classificationForOperation('AUTRES', 'FRAIS')).toEqual({ category: 'AUTRES', subcategory: 'FRAIS' });
    expect(requiredTransactionType('AUTRES', 'FRAIS')).toBeNull();
  });

  it('AUTRES ordinaire ne peut pas « déguiser » une opération à type imposé (Prêt, Remboursement…)', () => {
    expect(FREE_AUTRES_SUBCATEGORIES).not.toContain('PRET');
    expect(FREE_AUTRES_SUBCATEGORIES).not.toContain('REMBOURSEMENT');
    expect(classificationForOperation('AUTRES', 'PRET')).toEqual({ category: 'AUTRES', subcategory: '' });
    expect(FREE_AUTRES_SUBCATEGORIES.every((subcategory) => requiredTransactionType('AUTRES', subcategory) === null)).toBe(true);
  });

  it('Inscription / Achat tontine / Secours ne sont plus sélectionnables à la saisie mais restent valides (historique, écritures système)', () => {
    for (const legacy of ['INSCRIPTION', 'ACHAT_TONTINE', 'SECOURS'] as const) {
      expect(FREE_AUTRES_SUBCATEGORIES).not.toContain(legacy);
      expect(classificationForOperation('AUTRES', legacy)).toEqual({ category: 'AUTRES', subcategory: '' });
      expect(isClassificationValid('AUTRES', legacy)).toBe(true);
      expect(requiredTransactionType('AUTRES', legacy)).toBe('credit');
    }
  });
});

describe('operationForClassification — inverse de classificationForOperation (colonne et filtre « Actions »)', () => {
  it('valeurs historiques : PRET → Emprunter, REMBOURSEMENT → Rembourser, le reste d’AUTRES → Autres (données inchangées)', () => {
    expect(operationForClassification('AUTRES', 'PRET')).toBe('PRET');
    expect(operationForClassification('AUTRES', 'REMBOURSEMENT')).toBe('REMBOURSEMENT');
    for (const legacy of ['COTISATION', 'FRAIS', 'SECOURS', 'INSCRIPTION', 'ACHAT_TONTINE', 'DISTRIBUTION', 'CORRECTION', 'PENALITE', 'AUTRE'] as const) {
      expect(operationForClassification('AUTRES', legacy)).toBe('AUTRES');
    }
    // Aucune action plus précise ne peut être déduite : AUTRES sans sous-catégorie reste « Autres ».
    expect(operationForClassification('AUTRES', null)).toBe('AUTRES');
    // Écritures du module Tontine : cotisation = EPARGNE → Épargner ; achat/distribution/correction → Autres.
    expect(operationForClassification('EPARGNE', null)).toBe('EPARGNE');
  });

  it('toute classification valide (historique inclus) tombe dans exactement une des 4 catégories de saisie', () => {
    expect(operationForClassification('EPARGNE')).toBe('EPARGNE');
    for (const subcategory of AUTRES_SUBCATEGORIES) {
      const operation = operationForClassification('AUTRES', subcategory);
      expect(TRANSACTION_OPERATIONS).toContain(operation);
      expect(operation === 'AUTRES').toBe(OTHER_OPERATION_SUBCATEGORIES.includes(subcategory));
    }
    expect(operationForClassification('AUTRES', 'PRET')).toBe('PRET');
    expect(operationForClassification('AUTRES', 'REMBOURSEMENT')).toBe('REMBOURSEMENT');
    expect(operationForClassification('AUTRES', 'ACHAT_TONTINE')).toBe('AUTRES');
  });

  it('aller-retour : classificationForOperation puis operationForClassification rend la catégorie de saisie', () => {
    for (const operation of TRANSACTION_OPERATIONS) {
      const { category, subcategory } = classificationForOperation(operation, 'DEPOT');
      expect(operationForClassification(category, subcategory)).toBe(operation);
    }
  });
});
