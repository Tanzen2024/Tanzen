import { describe, it, expect } from 'vitest';
import { tontinesService, type TontineInput } from './tontines.service';

describe('tontinesService — Tontines', () => {
  it('ALLOW/DENY: listTontines and getTontine are scoped to the requesting tenant', async () => {
    const [t002] = await tontinesService.listTontines('T-002');
    expect(t002.tenantId).toBe('T-002');
    const result = await tontinesService.getTontine('T-001', t002.id);
    expect(result).toBeNull();
  });
});

describe('tontinesService — createTontine (Tontine.valueType)', () => {
  it('creates a MONEY tontine with the requesting tenant', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine de 10000', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.valueType).toBe('MONEY');
    expect(tontine.tenantId).toBe('T-002');
    expect(tontine.status).toBe('statusActive');
  });

  it('the historical structure field `type` no longer exists on the model — valueType is the sole classification', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Sans type historique', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect('type' in tontine).toBe(false);
    expect(Object.keys(tontine).sort()).toEqual(['contributionAmount', 'createdAt', 'frequency', 'id', 'memberCount', 'monthlyDayOfMonth', 'name', 'status', 'tenantId', 'totalContributions', 'valueType']);
  });

  it('creates a GOODS tontine', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 10, unit: 'SAC' }))!;
    expect(tontine.valueType).toBe('GOODS');
  });

  it('a newly created tontine is only visible to its own tenant (isolation preserved)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine isolée', valueType: 'MONEY', tenantId: 'T-003', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const ownTenant = await tontinesService.getTontine('T-003', tontine.id);
    const otherTenant = await tontinesService.getTontine('T-001', tontine.id);
    expect(ownTenant?.id).toBe(tontine.id);
    expect(otherTenant).toBeNull();
  });

});

describe('tontinesService — createTontine GOODS reference (item / quantity)', () => {
  it('a GOODS tontine can carry a reference item and quantity ("10 savons")', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine des savons', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Savon', quantity: 10, unit: 'PIECE' }))!;
    expect(tontine.item).toBe('Savon');
    expect(tontine.quantity).toBe(10);
  });

  it('a MONEY tontine does not carry item/quantity (undefined, not persisted)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine financière', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.item).toBeUndefined();
    expect(tontine.quantity).toBeUndefined();
  });

  it('createTontine uses tenantId exactly as provided by the caller (TontineCreate always passes currentTenant.id)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine isolée bis', valueType: 'GOODS', tenantId: 'T-003', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 25, unit: 'SAC' }))!;
    expect(tontine.tenantId).toBe('T-003');
    const otherTenant = await tontinesService.getTontine('T-002', tontine.id);
    expect(otherTenant).toBeNull();
  });

  it('a GOODS tontine can also carry a reference unit ("10 pièces")', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine des savons (unité)', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Savon', quantity: 10, unit: 'PIECE' }))!;
    expect(tontine.unit).toBe('PIECE');
  });

  it('DENY: rejects empty required GOODS fields and non-positive reference quantities', async () => {
    const invalidInputs: TontineInput[] = [
      { name: '', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 5, unit: 'SAC' },
      { name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: '', quantity: 5, unit: 'SAC' },
      { name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', unit: 'SAC' },
      { name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 0, unit: 'SAC' },
      { name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: -1, unit: 'SAC' },
      { name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 5, unit: '' as unknown as TontineInput['unit'] },
    ];
    for (const input of invalidInputs) expect(await tontinesService.createTontine(input)).toBeNull();
  });
});

describe('tontinesService — createTontine MONEY currency', () => {
  it('a MONEY tontine created with XAF (the UI default) persists the currency as provided', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine XAF', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.currency).toBe('XAF');
  });

  it('a MONEY tontine can be created with a different currency (the user is free to change the default)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine EUR', valueType: 'MONEY', tenantId: 'T-002', currency: 'EUR', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.currency).toBe('EUR');
  });

  it('a GOODS tontine does not carry a currency (undefined, not persisted)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine sans devise', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Sucre', quantity: 5, unit: 'SAC' }))!;
    expect(tontine.currency).toBeUndefined();
  });
});

describe('tontinesService — contributionAmount (mandat « montant de cotisation »)', () => {
  it('ALLOW: creates a MONEY tontine with a strictly positive contribution amount', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Epargne familiale', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000 }))!;
    expect(tontine).toBeTruthy();
    expect(tontine?.contributionAmount).toBe(50_000);
  });

  it('DENY: rejects a MONEY tontine created without a contribution amount', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Sans montant', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1 }))!;
    expect(tontine).toBeNull();
  });

  it('DENY: rejects a MONEY tontine created with a contribution amount of exactly 0', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Montant zéro', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 0 }))!;
    expect(tontine).toBeNull();
  });

  it('DENY: rejects a MONEY tontine created with a negative contribution amount', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Montant négatif', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: -100 }))!;
    expect(tontine).toBeNull();
  });

  it('DENY: rejects a MONEY tontine with an empty name', async () => {
    expect(await tontinesService.createTontine({ name: '', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 })).toBeNull();
  });

  it('ALLOW: a GOODS tontine is accepted without any contribution amount', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'En nature sans montant', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 5, unit: 'SAC' }))!;
    expect(tontine).toBeTruthy();
    expect(tontine?.contributionAmount).toBeUndefined();
  });

  it('ALLOW: updateTontine switches a MONEY tontine to GOODS without requiring a contribution amount', async () => {
    const created = (await tontinesService.createTontine({ name: 'À convertir', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 20_000 }))!;
    const updated = await tontinesService.updateTontine('T-002', created!.id, { valueType: 'GOODS', item: 'Sucre', quantity: 3, unit: 'SAC' });
    expect(updated?.valueType).toBe('GOODS');
  });

  it('DENY: updateTontine switching GOODS back to MONEY without a contribution amount is rejected', async () => {
    const created = (await tontinesService.createTontine({ name: 'En nature', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Huile', quantity: 4, unit: 'BIDON' }))!;
    const updated = await tontinesService.updateTontine('T-002', created.id, { valueType: 'MONEY' });
    expect(updated).toBeNull();
  });

  it('ALLOW: updateTontine updates a MONEY tontine with a valid contribution amount', async () => {
    const created = (await tontinesService.createTontine({ name: 'À modifier', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const updated = await tontinesService.updateTontine('T-002', created!.id, { contributionAmount: 15_000 });
    expect(updated?.contributionAmount).toBe(15_000);
  });

  it('DENY: updateTontine rejects a contribution amount of exactly 0', async () => {
    const created = (await tontinesService.createTontine({ name: 'À corrompre zéro', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const updated = await tontinesService.updateTontine('T-002', created!.id, { contributionAmount: 0 });
    expect(updated).toBeNull();
    const after = await tontinesService.getTontine('T-002', created!.id);
    expect(after?.contributionAmount).toBe(10_000);
  });

  it('DENY: updateTontine rejects a negative contribution amount', async () => {
    const created = (await tontinesService.createTontine({ name: 'À corrompre négatif', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const updated = await tontinesService.updateTontine('T-002', created!.id, { contributionAmount: -500 });
    expect(updated).toBeNull();
    const after = await tontinesService.getTontine('T-002', created!.id);
    expect(after?.contributionAmount).toBe(10_000);
  });

  it('DENY: updateTontine cannot write against a tontine of another tenant', async () => {
    const created = (await tontinesService.createTontine({ name: 'Isolée update', valueType: 'MONEY', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const updated = await tontinesService.updateTontine('T-001', created!.id, { contributionAmount: 99_999 });
    expect(updated).toBeNull();
  });

  it('DENY: updateTontine rejects invalid GOODS fields and an empty name', async () => {
    const created = (await tontinesService.createTontine({ name: 'Tontine riz', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 5, unit: 'SAC' }))!;
    await expect(tontinesService.updateTontine('T-002', created.id, { name: '' })).resolves.toBeNull();
    await expect(tontinesService.updateTontine('T-002', created.id, { item: '' })).resolves.toBeNull();
    await expect(tontinesService.updateTontine('T-002', created.id, { quantity: 0 })).resolves.toBeNull();
    await expect(tontinesService.updateTontine('T-002', created.id, { quantity: -1 })).resolves.toBeNull();
    await expect(tontinesService.updateTontine('T-002', created.id, { unit: '' as unknown as TontineInput['unit'] })).resolves.toBeNull();
  });

  it('removes fields from the previous value type when switching types', async () => {
    const financial = (await tontinesService.createTontine({ name: 'À convertir', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    const goods = await tontinesService.updateTontine('T-002', financial.id, { valueType: 'GOODS', item: 'Riz', quantity: 5, unit: 'SAC' });
    expect(goods).toMatchObject({ valueType: 'GOODS', item: 'Riz', quantity: 5, unit: 'SAC' });
    expect(goods?.currency).toBeUndefined();
    expect(goods?.purchaseMode).toBeUndefined();
    expect(goods?.contributionAmount).toBeUndefined();

    const money = await tontinesService.updateTontine('T-002', financial.id, { valueType: 'MONEY', contributionAmount: 10_000, currency: 'XAF' });
    expect(money).toMatchObject({ valueType: 'MONEY', contributionAmount: 10_000 });
    expect(money?.item).toBeUndefined();
    expect(money?.quantity).toBeUndefined();
    expect(money?.unit).toBeUndefined();
  });
});

describe('tontinesService — frequency obligatoire (mandat « Fréquence obligatoire »)', () => {
  it('DENY: createTontine rejects a missing frequency', async () => {
    const result = await tontinesService.createTontine({ name: 'Sans fréquence', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000 } as unknown as TontineInput);
    expect(result).toBeNull();
  });

  it('DENY: createTontine rejects an incomplete frequency (WEEKLY without weekday)', async () => {
    const result = await tontinesService.createTontine({ name: 'Hebdo incomplète', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000, frequency: 'WEEKLY' });
    expect(result).toBeNull();
  });

  it('ALLOW: createTontine accepts a complete frequency', async () => {
    const created = await tontinesService.createTontine({ name: 'Fréquence complète', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000, frequency: 'WEEKLY', weekday: 'MONDAY' });
    expect(created?.frequency).toBe('WEEKLY');
  });

  it('DENY: updateTontine rejects a patch that blanks out an existing frequency', async () => {
    const created = (await tontinesService.createTontine({ name: 'À protéger', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyDayOfMonth: 10 }))!;
    const updated = await tontinesService.updateTontine('T-002', created.id, { frequency: undefined });
    expect(updated).toBeNull();
    const after = await tontinesService.getTontine('T-002', created.id);
    expect(after?.frequency).toBe('MONTHLY');
  });

  it('DENY: updateTontine rejects switching to WEEKLY without providing a weekday', async () => {
    const created = (await tontinesService.createTontine({ name: 'À protéger bis', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyDayOfMonth: 10 }))!;
    const updated = await tontinesService.updateTontine('T-002', created.id, { frequency: 'WEEKLY' });
    expect(updated).toBeNull();
  });

  it('ALLOW: updateTontine accepts a complete replacement frequency', async () => {
    const created = (await tontinesService.createTontine({ name: 'À remplacer', valueType: 'MONEY', tenantId: 'T-002', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyDayOfMonth: 10 }))!;
    const updated = await tontinesService.updateTontine('T-002', created.id, { frequency: 'WEEKLY', weekday: 'FRIDAY' });
    expect(updated?.frequency).toBe('WEEKLY');
    expect(updated?.weekday).toBe('FRIDAY');
  });

  it('ALLOW: updateTontine on a legacy tontine (seeded before this mandate) still accepts edits unrelated to frequency, without forcing it to be re-entered', async () => {
    const updated = await tontinesService.updateTontine('T-003', 'TON-003', { contributionAmount: 35_000 });
    expect(updated?.contributionAmount).toBe(35_000);
    expect(updated?.frequency).toBe('MONTHLY');
  });

  it('DENY: direct API-style calls cannot bypass the rule via tenant isolation either', async () => {
    const created = (await tontinesService.createTontine({ name: 'Isolation fréquence', valueType: 'MONEY', tenantId: 'T-003', contributionAmount: 10_000, frequency: 'MONTHLY', monthlyDayOfMonth: 5 }))!;
    const updated = await tontinesService.updateTontine('T-001', created.id, { frequency: undefined });
    expect(updated).toBeNull();
  });
});

describe('tontinesService — purchaseMode (mandat refonte §13-16, MONEY uniquement)', () => {
  it('a MONEY tontine can be created "Sans achat" (WITHOUT_PURCHASE, le défaut)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine sans achat', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.purchaseMode).toBe('WITHOUT_PURCHASE');
  });

  it('a MONEY tontine can be created "Avec achat" (WITH_PURCHASE)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine avec achat', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 10_000 }))!;
    expect(tontine.purchaseMode).toBe('WITH_PURCHASE');
  });

  it('a GOODS tontine does not carry a purchaseMode (undefined, not persisted — the field is MONEY-only)', async () => {
    const tontine = (await tontinesService.createTontine({ name: 'Tontine en nature sans achat', valueType: 'GOODS', tenantId: 'T-002', frequency: 'MONTHLY', monthlyDayOfMonth: 1, item: 'Riz', quantity: 10, unit: 'SAC' }))!;
    expect(tontine.purchaseMode).toBeUndefined();
  });
});
