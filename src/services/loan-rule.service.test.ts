import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loanRuleService, type LoanRuleInput } from './loan-rule.service';
import { loanRules, tenantCreditRule } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { applyChange } from './loan-rule.test-helpers';

/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26) : aucune caisse dans la
 * règle, une seule règle vivante par tenant — l'unicité est garantie par le SERVICE, pas par l'UI.
 * Depuis le 2026-09-28, une modification n'est EFFECTIVE qu'après double approbation : les contrôles
 * ci-dessous passent donc par `applyChange` (demande + 2 approbations distinctes), seul chemin réel.
 */
const RULES_SEED = structuredClone(loanRules);
const REQUESTS_SEED = structuredClone(workflowRequests);
const restore = () => {
  loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED));
  workflowRequests.splice(0, workflowRequests.length, ...structuredClone(REQUESTS_SEED));
};
beforeEach(restore);
afterEach(restore);

const validInput: LoanRuleInput = {
  name: 'Politique de crédit test', allowLoans: true, loanMode: 'SIMPLE',
  minAmount: 10_000, maxAmount: 500_000, interestRate: 9, interestPeriod: 'MONTHLY', durationMonths: 12,
  maxActiveLoans: 1, maxLoanExposure: 600_000, requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 1,
  guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false, requiresApproval: true, approvalLevel: 'ADMIN',
};

describe('Règle de crédit unique — données consolidées', () => {
  it('T-001 : une seule règle vivante, LR-001 ; LR-003 et LR-004 supprimées LOGIQUEMENT (conservées pour l’historique)', () => {
    const live = loanRules.filter((rule) => rule.tenantId === 'T-001' && rule.deletedAt === null);
    expect(live.map((rule) => rule.id)).toEqual(['LR-001']);
    for (const id of ['LR-003', 'LR-004']) {
      const archived = loanRules.find((rule) => rule.id === id)!;
      expect(archived.deletedAt).not.toBeNull();
      expect(archived.status).toBe('INACTIVE');
    }
    expect(tenantCreditRule('T-002')?.id).toBe('LR-002');
  });

  it('aucune règle n’est liée à une caisse', () => {
    expect(loanRules.every((rule) => !('cashboxId' in rule) && !('cashboxNumber' in rule))).toBe(true);
  });

  it('chaque tenant a au plus UNE règle vivante', () => {
    const tenants = new Set(loanRules.map((rule) => rule.tenantId));
    for (const tenantId of tenants) expect(loanRules.filter((rule) => rule.tenantId === tenantId && rule.deletedAt === null).length).toBeLessThanOrEqual(1);
  });
});

describe('loanRuleService.getCreditRule', () => {
  it('renvoie LA règle du tenant, jamais celle d’un autre tenant ni une règle supprimée', async () => {
    expect((await loanRuleService.getCreditRule('T-001'))?.id).toBe('LR-001');
    expect((await loanRuleService.getCreditRule('T-002'))?.id).toBe('LR-002');
  });

  it('tenant sans règle → null', async () => {
    expect(await loanRuleService.getCreditRule('T-003')).toBeNull();
  });
});

describe('loanRuleService — unicité garantie par le service', () => {
  it('création de la première règle d’un tenant qui n’en a pas → réussit', async () => {
    const created = await loanRuleService.createLoanRule('T-003', validInput);
    expect(created).toMatchObject({ tenantId: 'T-003', name: 'Politique de crédit test', status: 'ACTIVE', deletedAt: null });
    expect(created).not.toHaveProperty('cashboxId');
    expect((await loanRuleService.getCreditRule('T-003'))?.id).toBe(created!.id);
  });

  it('création d’une deuxième règle → refusée, même en appelant directement le service', async () => {
    expect(await loanRuleService.createLoanRule('T-001', { ...validInput, name: 'Politique concurrente' })).toBeNull();
    await loanRuleService.createLoanRule('T-003', validInput);
    expect(await loanRuleService.createLoanRule('T-003', { ...validInput, name: 'Seconde règle' })).toBeNull();
    expect(loanRules.filter((rule) => rule.tenantId === 'T-003' && rule.deletedAt === null)).toHaveLength(1);
  });

  it('modification de la règle existante après double approbation → réussit (y compris le mode de prêt)', async () => {
    const updated = await applyChange('T-001', 'LR-001', { maxAmount: 2_500_000, loanMode: 'GLOBAL' });
    expect(updated).toMatchObject({ id: 'LR-001', maxAmount: 2_500_000, loanMode: 'GLOBAL', version: 2 });
  });

  it('isolation : un tenant ne modifie jamais la règle d’un autre, ni une règle supprimée', async () => {
    expect(await applyChange('T-001', 'LR-002', { name: 'Intrus' })).toBeNull();
    expect(await applyChange('T-001', 'LR-004', { name: 'Ressuscitée' })).toBeNull();
  });
});

describe('loanRuleService — contraintes canoniques (fiche #14) conservées', () => {
  it('refuse min > max, taux négatif, durée nulle, garants min > max, ratio hors 0–100, nom vide', async () => {
    for (const bad of [
      { minAmount: 600_000, maxAmount: 500_000 },
      { interestRate: -1 },
      { durationMonths: 0 },
      { minGuarantors: 2, maxGuarantors: 1 },
      { guaranteeRatio: 101 },
      { name: '   ' },
    ]) {
      expect(await loanRuleService.createLoanRule('T-003', { ...validInput, ...bad })).toBeNull();
      // LR-001 est OFF dans les données DEMO : on active « Garant requis » pour que les contraintes de garantie s'appliquent.
      expect(await applyChange('T-001', 'LR-001', { requiresGuarantor: true, ...bad })).toBeNull();
    }
    expect(await loanRuleService.getCreditRule('T-003')).toBeNull();
  });

  it('Garant requis ON : Garants max. ≥ Garants min. → enregistrement accepté', async () => {
    expect(await loanRuleService.createLoanRule('T-003', { ...validInput, minGuarantors: 1, maxGuarantors: 3 })).toMatchObject({ requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 3 });
    expect(await applyChange('T-001', 'LR-001', { minGuarantors: 2, maxGuarantors: 2 })).toMatchObject({ minGuarantors: 2, maxGuarantors: 2 });
  });
});

describe('loanRuleService — Garant requis OFF : aucune contrainte de garantie', () => {
  const noGuarantor = { requiresGuarantor: false } as const;

  it('Garants min. = 3, Garants max. = 1 (valeurs conservées incohérentes) → enregistrement accepté, valeurs conservées', async () => {
    expect(await loanRuleService.createLoanRule('T-003', { ...validInput, ...noGuarantor, minGuarantors: 3, maxGuarantors: 1 })).toMatchObject({ requiresGuarantor: false, minGuarantors: 3, maxGuarantors: 1 });
    expect(await applyChange('T-001', 'LR-001', { ...noGuarantor, minGuarantors: 3, maxGuarantors: 1 })).toMatchObject({ id: 'LR-001', requiresGuarantor: false, minGuarantors: 3, maxGuarantors: 1 });
  });

  it('ratio de garantie hors 0–100 → aucune erreur de garantie', async () => {
    expect(await applyChange('T-001', 'LR-001', { ...noGuarantor, guaranteeRatio: 150 })).toMatchObject({ requiresGuarantor: false, guaranteeRatio: 150 });
  });

  it('auto-caution configurée → aucune validation de garantie', async () => {
    expect(await applyChange('T-001', 'LR-001', { ...noGuarantor, allowSelfGuarantee: true, minGuarantors: 4, maxGuarantors: 0 })).toMatchObject({ requiresGuarantor: false, allowSelfGuarantee: true });
  });

  it('les autres contraintes restent appliquées quand Garant requis = OFF', async () => {
    expect(await applyChange('T-001', 'LR-001', { ...noGuarantor, minAmount: 3_000_000 })).toBeNull();
    expect(await applyChange('T-001', 'LR-001', { ...noGuarantor, durationMonths: 0 })).toBeNull();
  });

  it('réactiver Garant requis avec des valeurs incohérentes → refusé (contraintes de garantie de nouveau actives)', async () => {
    await applyChange('T-001', 'LR-001', { ...noGuarantor, minGuarantors: 3, maxGuarantors: 1 });
    expect(await applyChange('T-001', 'LR-001', { requiresGuarantor: true })).toBeNull();
  });
});
