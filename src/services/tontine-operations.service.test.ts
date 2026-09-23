import { describe, it, expect } from 'vitest';
import { tontineOperationsService, getBeneficiaryPaymentStatus, isCycleComplete, isPlanningComplete } from './tontine-operations.service';
import { tontinesService } from './tontines.service';
import { workflowService } from './workflow.service';
import { financePositionService } from './finance-position.service';
import { transactions } from '@/mocks/finance/transactions';
import { accounts } from '@/mocks/finance/accounts';
import { tontineRemainders, tontines } from '@/mocks/tontines/tontines';
import { auditEvents } from '@/mocks/audit/audit-events';

/** Helper — crée une Tontine MONEY fraîche pour isoler chaque test des autres. Plus de Période intermédiaire (restructuration) : Plans/Tours se rattachent DIRECTEMENT à `tontine.id`. */
async function makeMoneyTontine(tenantId: string, opts: { withPurchase?: boolean; accountId?: string; contributionAmount?: number } = {}) {
  return tontinesService.createTontine({
    tenantId, name: `Test Ops ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: opts.contributionAmount ?? 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5,
    withPurchase: opts.withPurchase ?? false, accountId: opts.accountId,
  } as never);
}

describe('tontineOperationsService — Planification (sans-achat), rattachée DIRECTEMENT à la Tontine', () => {
  it('ALLOW: addPlanEntry assigns sequential positions (1, 2, 3…)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    expect(planA?.position).toBe(1);
    expect(planB?.position).toBe(2);
    expect(planA?.tontineId).toBe(tontine!.id);
  });

  it('DENY: addPlanEntry refuses a « Avec achat » tontine — planning is sans-achat only', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const plan = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(plan).toBeNull();
  });

  it('DENY: addPlanEntry refuses the same adhesion twice on the same tontine', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const duplicate = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(duplicate).toBeNull();
  });

  it('ALLOW → DENY: removePlanEntry works while unconsumed, refused once consumed by a Tour', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const plan = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const removed = await tontineOperationsService.removePlanEntry('T-001', plan!.id);
    expect(removed).toEqual({ removed: true });

    const plan2 = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]); // consomme plan2
    const refused = await tontineOperationsService.removePlanEntry('T-001', plan2!.id);
    expect(refused).toBeNull();
  });

  it('DENY: listPlans of a tenant never leaks another tenant’s plans', async () => {
    const result = await tontineOperationsService.listPlans('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });

  it('ALLOW: removePlanEntry renumbers the following positions — never leaves a gap', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const adhesionC = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id); // #1
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id); // #2
    const planC = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionC!.id); // #3
    await tontineOperationsService.removePlanEntry('T-001', planB!.id);
    const remaining = await tontineOperationsService.listPlans('T-001', tontine!.id);
    expect(remaining.map((p) => [p.id, p.position])).toEqual([[planA!.id, 1], [planC!.id, 2]]);
  });

  describe('addPlanEntries (ajout multiple — refonte UX Planification)', () => {
    it('ALLOW: assigns successive positions at the end of the existing plan', async () => {
      const tontine = await makeMoneyTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
      const adhesionC = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id); // #1 déjà présent
      const result = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionB!.id, adhesionC!.id]);
      expect(result?.skipped).toBe(0);
      expect(result?.added.map((p) => p.position)).toEqual([2, 3]);
    });

    it('DENY: skips an adhesion already planned, or foreign to the Tontine, without failing the whole batch', async () => {
      const tontine = await makeMoneyTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
      const result = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionA!.id, adhesionB!.id, 'ADH-DOES-NOT-EXIST']);
      expect(result?.added.map((p) => p.adhesionId)).toEqual([adhesionB!.id]);
      expect(result?.skipped).toBe(2);
    });

    it('DENY: refuses entirely on an « Avec achat » tontine', async () => {
      const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
      const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const result = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesion!.id]);
      expect(result?.added).toEqual([]);
      expect(result?.skipped).toBe(1);
    });

    it('TEST 11/TEST 6 — ALLOW: an explicit startPosition inserts there and shifts the following positions down, never a duplicate', async () => {
      const tontine = await makeMoneyTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
      const adhesionC = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
      const adhesionD = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-09-01');
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id); // #1 Fatou
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id); // #2 Cheikh
      const planC = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionC!.id); // #3 Modou → sera décalé en #5
      const planD = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionD!.id); // #4 Coumba → sera décalé en #6
      // Secondes représentations de Fatou/Cheikh (mandat §12 : deux adhesionId distincts du même membre restent deux positions séparées).
      const adhesionE = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-10');
      const adhesionF = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-10');
      const result = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionE!.id, adhesionF!.id], 3);
      expect(result?.skipped).toBe(0);
      expect(result?.added.map((p) => p.position)).toEqual([3, 4]);
      const plans = await tontineOperationsService.listPlans('T-001', tontine!.id);
      expect(plans.find((p) => p.id === planC!.id)?.position).toBe(5);
      expect(plans.find((p) => p.id === planD!.id)?.position).toBe(6);
      expect(new Set(plans.map((p) => p.position)).size).toBe(plans.length); // aucune position dupliquée
    });

    it('DENY: refuses the whole batch on an out-of-range or non-integer startPosition', async () => {
      const tontine = await makeMoneyTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id); // 1 position existante → insertion valide dans [1, 2]
      const tooHigh = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionB!.id], 3);
      expect(tooHigh?.added).toEqual([]);
      expect(tooHigh?.skipped).toBe(1);
      const zero = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionB!.id], 0);
      expect(zero?.added).toEqual([]);
      const decimal = await tontineOperationsService.addPlanEntries('T-001', tontine!.id, [adhesionB!.id], 1.5);
      expect(decimal?.added).toEqual([]);
    });
  });

  describe('setPlanPosition (attribution directe d’une position — refonte UX §3-§7, remplace le glisser-déposer)', () => {
    async function makePlannedTontine() {
      const tontine = await makeMoneyTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
      const adhesionC = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
      const adhesionD = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-09-01');
      const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id); // #1 Fatou
      const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id); // #2 Cheikh
      const planC = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionC!.id); // #3 Modou
      const planD = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionD!.id); // #4 Coumba
      return { tontineId: tontine!.id, planA: planA!, planB: planB!, planC: planC!, planD: planD! };
    }

    it('TEST 4 — ALLOW: moving a position UP (3 → 1) shifts the intermediate positions down by one', async () => {
      const { tontineId, planA, planB, planC, planD } = await makePlannedTontine();
      const updated = await tontineOperationsService.setPlanPosition('T-001', tontineId, planC.id, 1);
      expect(updated?.map((p) => [p.id, p.position])).toEqual([[planC.id, 1], [planA.id, 2], [planB.id, 3], [planD.id, 4]]);
    });

    it('TEST 5 — ALLOW: moving a position DOWN (2 → 4) shifts the intermediate positions up by one', async () => {
      const { tontineId, planA, planB, planC, planD } = await makePlannedTontine();
      const updated = await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 4);
      expect(updated?.map((p) => [p.id, p.position])).toEqual([[planA.id, 1], [planC.id, 2], [planD.id, 3], [planB.id, 4]]);
    });

    it('ALLOW: setting the SAME position is a no-op, never a duplicate', async () => {
      const { tontineId, planA, planB, planC, planD } = await makePlannedTontine();
      const updated = await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 2);
      expect(updated?.map((p) => [p.id, p.position])).toEqual([[planA.id, 1], [planB.id, 2], [planC.id, 3], [planD.id, 4]]);
    });

    it('TEST 8 — DENY: 0, a negative number, a decimal, or a position beyond the plan size are all cleanly refused', async () => {
      const { tontineId, planB } = await makePlannedTontine();
      expect(await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 0)).toBeNull();
      expect(await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, -1)).toBeNull();
      expect(await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 2.5)).toBeNull();
      expect(await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 5)).toBeNull();
      const plans = await tontineOperationsService.listPlans('T-001', tontineId);
      expect(plans.find((p) => p.id === planB.id)?.position).toBe(2); // jamais modifiée par un refus
    });

    it('TEST 13 — DENY: never touches an already-consumed position, and never lets another position take its slot', async () => {
      const { tontineId, planA, planB } = await makePlannedTontine();
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontineId, '2026-09-05');
      await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [planA.adhesionId]); // consomme planA (#1)
      const refused = await tontineOperationsService.setPlanPosition('T-001', tontineId, planA.id, 2);
      expect(refused).toBeNull();
      // Une position non consommée ne peut pas non plus revendiquer le créneau consommé #1 (immuabilité du passé).
      const refusedTakeover = await tontineOperationsService.setPlanPosition('T-001', tontineId, planB.id, 1);
      expect(refusedTakeover).toBeNull();
    });
  });
});

describe('isPlanningComplete (mandat « onglet par défaut selon adhérents et planification » — SEULE définition de « planification complète »)', () => {
  it('DENY: aucune participation planifiée — jamais complète', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(false);
  });

  it('DENY: TEST 8 — planification PARTIELLE (2 sur 4 adhésions éligibles planifiées) — pas encore complète', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const a = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const b = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-01-01');
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-018', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, a!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, b!.id);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(false);
  });

  it('ALLOW: TEST 9 — les 4 adhésions éligibles sont toutes planifiées — complète', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesionIds: string[] = [];
    for (const memberId of ['M-001', 'M-006', 'M-016', 'M-018']) adhesionIds.push((await tontinesService.addAdhesion('T-001', tontine!.id, memberId, '2026-01-01'))!.id);
    for (const adhesionId of adhesionIds) await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionId);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(true);
  });

  it('DENY: TEST 10 — granularité `adhesionId`, jamais `memberId` — un membre avec 2 participations dont une seule planifiée reste incomplet', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const jeanAdh1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01'); // ADH-001
    const jeanAdh2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-05'); // ADH-002, seconde représentation du même membre
    const marieAdh = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01'); // ADH-003
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, jeanAdh1!.id);
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, marieAdh!.id);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(false); // jeanAdh2 (ADH-002) n'est pas planifiée
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, jeanAdh2!.id);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(true); // TEST 11 — les 3 adhesionId sont désormais toutes planifiées
  });

  it('DENY: jamais complète pour une Tontine « Avec achat » — la planification n’existe pas pour ce mode', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(false);
  });

  it('TEST 14/15 — CYCLE : un cycle précédent intégralement planifié ne rend jamais le nouveau cycle « planifié » — seule la planification du cycle COURANT compte', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false, contributionAmount: 10_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(true); // cycle 1 : planification complète (1 seule participation éligible)

    // Réalise intégralement le cycle courant (seule façon d'ouvrir « Démarrer un nouveau cycle », règles existantes inchangées).
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, beneficiary.amountDue);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);

    await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    // TEST 14 — nouveau cycle, aucune planification propre : jamais considéré comme planifié malgré l'ancien cycle intégralement planifié.
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(false);

    // TEST 15 — planifier la même participation dans le NOUVEAU cycle rend bien la planification complète.
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(isPlanningComplete('T-001', tontine!.id)).toBe(true);
  });
});

describe('tontineOperationsService — Tours progressifs (« Ajouter un tour »), rattachés DIRECTEMENT à la Tontine', () => {
  /**
   * Mandat « historique des bénéficiaires entre Tours » (2026-09-23) —
   * remplace l'ancien comportement (`createOccurrence` auto-consommait la
   * prochaine position non consommée) : désormais, sans achat comme avec
   * achat, le panneau Bénéficiaires commence TOUJOURS vide à l'ouverture
   * d'un Tour — chaque bénéficiaire est ajouté explicitement via
   * `addOccurrenceBeneficiaries` (checkbox + « Ajouter » côté UI), y
   * compris la toute première position.
   */
  it('ALLOW: sans-achat — createOccurrence never auto-creates a beneficiary; addOccurrenceBeneficiaries lets the manager choose manually, respecting the Plan order', async () => {
    const tontine = await makeMoneyTontine('T-001', { contributionAmount: 30_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(occurrence?.occurrenceNumber).toBe(1);
    expect(occurrence?.status).toBe('PLANNED');
    expect(occurrence?.tontineId).toBe(tontine!.id);
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).toHaveLength(0);

    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    expect(result?.added).toHaveLength(1);
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(1);
    expect(beneficiaries[0].adhesionId).toBe(adhesion!.id);
    expect(beneficiaries[0].amountDue).toBe(30_000);
  });

  it('ALLOW: sans-achat — no beneficiary created when the plan is empty (never blocks progressive round creation)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(occurrence).toBeTruthy();
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(0);
  });

  it('ALLOW: avec-achat — createOccurrence never auto-creates a beneficiary; addOccurrenceBeneficiary lets the manager choose manually, several per round', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).toHaveLength(0);
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 12_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 8_000);
    expect(beneficiaryA).toBeTruthy();
    expect(beneficiaryB).toBeTruthy();
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(2); // jamais une chaîne concaténée — une ligne par bénéficiaire
  });

  it('DENY: sans-achat — addOccurrenceBeneficiary is refused (the plan is the only path)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(beneficiary).toBeNull();
  });

  it('DENY: addOccurrenceBeneficiary refuses a duplicate adhesion on the same occurrence', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    const duplicate = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    expect(duplicate).toBeNull();
  });

  it('ALLOW: occurrenceNumber increases progressively across successive rounds of the same tontine', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const first = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const second = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-10-05');
    expect(first?.occurrenceNumber).toBe(1);
    expect(second?.occurrenceNumber).toBe(2);
  });

  it('DENY: listOccurrences never leaks another tenant’s tours', async () => {
    const result = await tontineOperationsService.listOccurrences('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });
});

describe('tontineOperationsService — Représentations multiples d’un même membre dans une même Tontine (mandat « finalisation ajout multiple »)', () => {
  it('AVEC-ACHAT : un membre avec 3 représentations distinctes peut bénéficier de 3 Tours différents — chaque bénéficiaire reste traçable jusqu’à SA représentation, jamais une ambiguïté sur laquelle des 3', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const rep1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep3 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    expect(new Set([rep1!.id, rep2!.id, rep3!.id]).size).toBe(3); // trois représentations distinctes, même membre, même Tontine
    expect([rep1, rep2, rep3].every((rep) => rep!.memberId === 'M-001' && rep!.tontineId === tontine!.id)).toBe(true);

    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-03-01');
    const occurrence3 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-04-01');
    const beneficiary1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, rep1!.id, 10_000);
    const beneficiary2 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence2!.id, rep2!.id, 10_000);
    const beneficiary3 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence3!.id, rep3!.id, 10_000);
    expect(beneficiary1?.adhesionId).toBe(rep1!.id);
    expect(beneficiary2?.adhesionId).toBe(rep2!.id);
    expect(beneficiary3?.adhesionId).toBe(rep3!.id);
    expect(new Set([beneficiary1!.adhesionId, beneficiary2!.adhesionId, beneficiary3!.adhesionId]).size).toBe(3);
  });

  it('SANS-ACHAT : 3 représentations planifiées séparément occupent 3 positions distinctes, consommées par 3 Tours différents dans l’ordre — jamais confondues entre elles', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const rep1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep3 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const plan1 = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, rep1!.id);
    const plan2 = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, rep2!.id);
    const plan3 = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, rep3!.id);
    expect([plan1!.position, plan2!.position, plan3!.position]).toEqual([1, 2, 3]);

    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [rep1!.id]);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-03-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [rep2!.id]);
    const occurrence3 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-04-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence3!.id, [rep3!.id]);
    const [beneficiary1] = await tontineOperationsService.listBeneficiaries('T-001', occurrence1!.id);
    const [beneficiary2] = await tontineOperationsService.listBeneficiaries('T-001', occurrence2!.id);
    const [beneficiary3] = await tontineOperationsService.listBeneficiaries('T-001', occurrence3!.id);
    expect(beneficiary1.adhesionId).toBe(rep1!.id);
    expect(beneficiary2.adhesionId).toBe(rep2!.id);
    expect(beneficiary3.adhesionId).toBe(rep3!.id);
  });

  it('ALLOW: l’historique reste par représentation — clôturer une représentation n’affecte jamais les autres représentations actives du même membre dans la même Tontine', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const rep1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const closed = await tontinesService.closeAdhesion('T-001', rep1!.id, '2026-05-01');
    expect(closed?.status).toBe('exited');
    const stillActive = await tontinesService.getAdhesion('T-001', rep2!.id);
    expect(stillActive?.status).toBe('active');
  });
});

describe('tontineOperationsService — Finance : cotisations et réceptions journal-liées', () => {
  it('ALLOW: recordContribution posts a credit Transaction (EPARGNE) when the tontine is linked to a Finance account', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002' });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution?.amount).toBe(10_000);
    expect(transactions.length).toBe(before + 1);
    expect(transactions[transactions.length - 1]).toMatchObject({ category: 'EPARGNE', type: 'credit', amount: 10_000, toAccount: 'CS-001-ÉPG' });
  });

  it('ALLOW: recordContribution never blocks (best-effort) when the tontine has no linked Finance account', async () => {
    const tontine = await makeMoneyTontine('T-001'); // aucun accountId
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution).toBeTruthy();
    expect(transactions.length).toBe(before); // aucune Transaction, mais l'enregistrement métier réussit
  });

  it('DENY: recordContribution refuses an adhesion inactive at the occurrence date', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontinesService.closeAdhesion('T-001', adhesion!.id, '2026-09-02');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // après la sortie
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution).toBeNull();
  });

  it('DENY: recordContribution refuses an adhesion belonging to a DIFFERENT tontine', async () => {
    const tontineA = await makeMoneyTontine('T-001');
    const tontineB = await makeMoneyTontine('T-001');
    const adhesionOfB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-001', '2026-09-01');
    const occurrenceOfA = await tontineOperationsService.createOccurrence('T-001', tontineA!.id, '2026-09-05');
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrenceOfA!.id, adhesionOfB!.id, 10_000);
    expect(contribution).toBeNull();
  });

  it('FINANCE NON-LEAKAGE : recordReception with a purchaseAmount posts the purchase amount ONLY to the "Achat tontine" account — the net reception posts to the general account, never mixed', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    const before = transactions.length;
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000, 5_000);
    expect(transactions.length).toBe(before + 2);
    const netTx = transactions.find((t) => t.amount === 15_000 && t.fromAccount === 'CS-001-ÉPG');
    const purchaseTx = transactions.find((t) => t.amount === 5_000 && t.toAccount === 'CS-001-CX-008');
    expect(netTx).toMatchObject({ category: 'AUTRES', subcategory: 'DISTRIBUTION', type: 'debit' });
    expect(purchaseTx).toMatchObject({ category: 'AUTRES', subcategory: 'AUTRE', type: 'credit' });
  });

  it('DENY: recordReception is refused once the Occurrence is REALIZED (immutability)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const secondReception = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 1_000);
    expect(secondReception).toBeNull();
    const refusedNewBeneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 1_000);
    expect(refusedNewBeneficiary).toBeNull();
  });
});

describe('tontineOperationsService — Clôture et Reliquat', () => {
  it('DENY: closeOccurrence refuses while any beneficiary is not fully paid', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 4_000); // partiel
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(closed).toBeNull();
  });

  it('ALLOW: closeOccurrence succeeds once every beneficiary is fully paid, and moves status to REALIZED', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(closed?.status).toBe('REALIZED');
  });

  it('RELIQUAT — traçabilité complète : un solde collecté non intégralement distribué crée un TontineRemainder OPEN avec tontine/tour/date/origine/statut', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 6_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 6_000); // 10 000 collectés, 6 000 distribués → reliquat 4 000
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const remainders = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    expect(remainders).toHaveLength(1);
    expect(remainders[0]).toMatchObject({ tontineId: tontine!.id, occurrenceId: occurrence!.id, amount: 4_000, origin: 'UNDERDISTRIBUTED_POOL', status: 'OPEN' });
    expect(remainders[0].createdBy).toBeTruthy();
    expect(remainders[0].date).toBeTruthy();
    expect('periodId' in remainders[0]).toBe(false); // aucune trace de Période dans le modèle Reliquat
  });

  it('ALLOW: no remainder is created when the collected pool exactly matches what was distributed', async () => {
    const before = tontineRemainders.length;
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002' });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // sans-achat (amountDue = contributionAmount)
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(tontineRemainders.length).toBe(before); // rien ajouté
  });

  it('ALLOW → DENY: consumeRemainder/writeOffRemainder transition OPEN once, refused a second time', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 2_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 2_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const [remainder] = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    const consumed = await tontineOperationsService.consumeRemainder('T-001', remainder.id);
    expect(consumed?.status).toBe('CONSUMED');
    const secondAttempt = await tontineOperationsService.writeOffRemainder('T-001', remainder.id, 'motif');
    expect(secondAttempt).toBeNull();
  });
});

describe('tontineOperationsService — Distributions (vue consolidée, transverse à tous les Tours de la Tontine)', () => {
  it('ALLOW: listDistributions aggregates OccurrenceBeneficiary rows across every Tour of the tontine, most recent tour first', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    // Deux PARTICIPATIONS distinctes (mandat cycle système : une même participation ne peut bénéficier qu'une fois par cycle, cf. describe « Cycle système » plus bas) — l'agrégation transverse reste testée sur deux Tours différents.
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, adhesionA!.id, 5_000);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-10-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence2!.id, adhesionB!.id, 5_000);
    const distributions = await tontineOperationsService.listDistributions('T-001', tontine!.id);
    expect(distributions).toHaveLength(2);
    expect(distributions[0].occurrenceNumber).toBe(2); // le plus récent d'abord
  });

  it('DENY: listDistributions never leaks another tenant’s distributions', async () => {
    const result = await tontineOperationsService.listDistributions('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });
});

describe('tontineOperationsService — Permutation de positions planifiées (workflow générique)', () => {
  it('ALLOW: requestPlanPermutation creates a WorkflowRequest against the WD-008 definition (domain tontines, entityType beneficiaryPermutation)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test User' });
    expect(request?.domain).toBe('tontines');
    expect(request?.entityType).toBe('beneficiaryPermutation');
    expect(request?.status).toBe('pending');
  });

  it('DENY: requestPlanPermutation refuses two positions from different Tontines, and a position already consumed', async () => {
    const tontineA = await makeMoneyTontine('T-001');
    const tontineB = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontineA!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontineB!.id, adhesionB!.id);
    const crossTontine = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    expect(crossTontine).toBeUndefined(); // pas de mockRequest ici (moteur Workflow générique) — undefined, jamais null

    const occurrenceA = await tontineOperationsService.createOccurrence('T-001', tontineA!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrenceA!.id, [adhesionA!.id]); // consomme planA
    const adhesionC = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-016', '2026-09-01');
    const planC = await tontineOperationsService.addPlanEntry('T-001', tontineA!.id, adhesionC!.id);
    const consumedSide = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planC!.id, requestedBy: 'Test' });
    expect(consumedSide).toBeUndefined();
  });

  it('ALLOW: WD-008 permission is beneficiaries.manage, self-approval explicitly allowed (mandat)', async () => {
    const definition = await workflowService.getWorkflowFor('beneficiaryPermutation', 'update');
    expect(definition?.id).toBe('WD-008');
    expect(definition?.steps[0].approverPermission).toBe('beneficiaries.manage');
    expect(definition?.allowSelfApproval).toBe(true);
  });

  it('ALLOW: approving the request swaps the two adhesionId atomically and writes a sensitive AuditEvent, even with the SAME actor as requester (self-approval)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Amadou Mbaye', requestedByUserId: 'U-001' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'approve', 'Amadou Mbaye', undefined, 'U-001'); // même acteur que le demandeur
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!);
    const refreshedA = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(refreshedA?.a.memberName).toBe('Cheikh Diop'); // M-006 a pris la position de M-001 après échange
    expect(refreshedA?.b.memberName).toBe('Fatou Ndiaye');
  });

  it('ALLOW: rejecting the request never mutates the plan positions', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'reject', 'Amadou Mbaye');
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!); // no-op : status !== 'approved'
    const preview = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(preview?.a.memberName).toBe('Fatou Ndiaye');
    expect(preview?.b.memberName).toBe('Cheikh Diop');
  });

  it('DENY: applying the same approved decision twice never double-swaps (idempotence)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'approve', 'Amadou Mbaye', undefined, 'U-001');
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!);
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!); // second appel : no-op (appliedAt déjà renseigné)
    const preview = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(preview?.a.memberName).toBe('Cheikh Diop');
    expect(preview?.b.memberName).toBe('Fatou Ndiaye');
  });
});

describe('Caisse système « Achat tontine » — audit ciblé', () => {
  it('AVEC ACHAT : la caisse système est résolue automatiquement (aucune sélection utilisateur), et SEULE la jambe achat y transite', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    expect(tontine?.purchaseAccountId).toBe('AC-015'); // résolution automatique par libellé, jamais un choix utilisateur
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000, 5_000);
    const purchaseTx = transactions.find((t) => t.amount === 5_000 && t.toAccount === 'CS-001-CX-008');
    expect(purchaseTx).toBeTruthy(); // ACHAT → caisse système « Achat tontine »
  });

  /**
   * RÉGRESSION — bug « Régler échoue dès que le montant d'achat est > 0 ».
   * Cause racine : `resolveWithPurchase` garantit `purchaseAccountId` UNIQUEMENT pour
   * les Tontines créées/modifiées via `tontinesService` — un enregistrement existant
   * AVANT cette garantie (ex. seed historique tel que TON-004) porte `withPurchase:
   * true` SANS `purchaseAccountId`. `recordReception` refusait alors TOUT règlement
   * dès que `purchaseAmount > 0` (jamais quand il valait 0, exactement le symptôme
   * rapporté). Chaque test manipule directement `tontines` (comme le fait déjà le
   * test « ABSENCE ARTIFICIELLE DU COMPTE » pour `accounts`) pour reproduire cette
   * anomalie de données SANS dépendre du seed partagé TON-004.
   */
  describe('RÉGRESSION — Tontine « avec achat » sans purchaseAccountId (donnée historique/seed, ex. TON-004)', () => {
    async function makeLegacyPurchaseTontine(tenantId: string, opts: { contributionAmount?: number } = {}) {
      const tontine = await makeMoneyTontine(tenantId, { withPurchase: true, contributionAmount: opts.contributionAmount });
      const record = tontines.find((item) => item.id === tontine!.id)!;
      delete record.purchaseAccountId; // simule la donnée historique/seed — jamais passée par `resolveWithPurchase`
      return tontine!;
    }

    it('SCÉNARIO 1 — montant achat = 0 : le règlement fonctionne (comportement déjà correct avant le correctif)', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const adhesion = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
      const result = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 0);
      expect(result).toBeTruthy();
      expect(result!.amountPaid).toBe(20_000);
    });

    it('SCÉNARIO 2 — montant achat = 5 000 : le règlement réussit désormais (avant le correctif, `recordReception` renvoyait `undefined`)', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const adhesion = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
      const result = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 5_000);
      expect(result).toBeTruthy(); // plus de refus silencieux
      expect(result!.amountPaid).toBe(20_000);
      expect(result!.amountPurchased).toBe(5_000); // le montant d'achat reste DISTINCT du montant de règlement
      const purchaseTx = transactions.find((t) => t.amount === 5_000 && t.toAccount === 'CS-001-CX-008');
      expect(purchaseTx).toBeTruthy(); // « Achat tontine » reste le compte système dédié, jamais une caisse générale
      const refreshed = await tontinesService.getTontine('T-001', tontine.id);
      expect(refreshed?.purchaseAccountId).toBe('AC-015'); // la référence est réparée pour les règlements suivants
    });

    it('SCÉNARIO 4 — le montant d\'achat n\'est jamais confondu avec `amountDue`/`amountPaid` : un montant d\'achat différent du montant dû est accepté tel quel', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const adhesion = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
      const result = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 7_500); // achat ≠ montant dû/réglé
      expect(result?.amountDue).toBe(20_000);
      expect(result?.amountPaid).toBe(20_000);
      expect(result?.amountPurchased).toBe(7_500); // jamais aligné automatiquement sur amountDue/amountPaid
    });

    it('SCÉNARIO 3 — plusieurs bénéficiaires avec des montants d\'achat différents (dont 0) se règlent chacun indépendamment', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const jean = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const marie = await tontinesService.addAdhesion('T-001', tontine.id, 'M-016', '2026-09-01');
      const paul = await tontinesService.addAdhesion('T-001', tontine.id, 'M-006', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiaryJean = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, jean!.id, 20_000);
      const beneficiaryMarie = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, marie!.id, 20_000);
      const beneficiaryPaul = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, paul!.id, 20_000);

      const resultJean = await tontineOperationsService.recordReception('T-001', beneficiaryJean!.id, 20_000, 5_000);
      const resultMarie = await tontineOperationsService.recordReception('T-001', beneficiaryMarie!.id, 20_000, 10_000);
      const resultPaul = await tontineOperationsService.recordReception('T-001', beneficiaryPaul!.id, 20_000, 0);

      expect(resultJean?.amountPurchased).toBe(5_000);
      expect(resultMarie?.amountPurchased).toBe(10_000);
      expect(resultPaul?.amountPurchased).toBe(0);
      expect(resultJean?.amountPaid).toBe(20_000);
      expect(resultMarie?.amountPaid).toBe(20_000);
      expect(resultPaul?.amountPaid).toBe(20_000);
    });

    it('SCÉNARIO 4bis — plusieurs représentations du même membre restent des `OccurrenceBeneficiary` indépendantes, chacune réglable avec son propre montant d\'achat', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const adhesionA = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const adhesionB = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01'); // même memberId
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 20_000);
      const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 20_000);

      const resultA = await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 20_000, 5_000);
      const resultB = await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 20_000, 8_000);

      expect(resultA!.id).not.toBe(resultB!.id); // deux lignes distinctes, jamais fusionnées par adhesionId/memberId
      expect(resultA?.amountPurchased).toBe(5_000);
      expect(resultB?.amountPurchased).toBe(8_000);
    });

    it('SCÉNARIO 5 — Tontine SANS achat : comportement inchangé, `purchaseAmount` transmis par erreur n’est jamais appliqué', async () => {
      const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
      const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
      await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
      await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
      const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
      const result = await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000, 500);
      expect(result).toBeTruthy();
      expect(result!.amountPurchased).toBe(0); // jamais appliqué hors avec-achat
    });

    it('TENANT ISOLATION — l’auto-réparation de purchaseAccountId résout la caisse « Achat tontine » DU BON tenant, jamais celle d’un autre', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-002');
      const adhesion = await tontinesService.addAdhesion('T-002', tontine.id, 'M-002', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-002', tontine.id, '2026-09-05');
      const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-002', occurrence!.id, adhesion!.id, 20_000);
      const result = await tontineOperationsService.recordReception('T-002', beneficiary!.id, 20_000, 4_000);
      expect(result).toBeTruthy();
      const refreshed = await tontinesService.getTontine('T-002', tontine.id);
      expect(refreshed?.purchaseAccountId).toBe('AC-016'); // caisse « Achat tontine » de T-002, jamais AC-015 (T-001)
      const purchaseTx = transactions.find((t) => t.amount === 4_000 && t.toAccount === 'TH-002-CX-001');
      expect(purchaseTx).toBeTruthy();
    });

    it('STATUT/RESTE — après un règlement intégral avec achat > 0, le statut passe à PAID et le reste dû est nul (le montant d\'achat ne perturbe pas ce calcul)', async () => {
      const tontine = await makeLegacyPurchaseTontine('T-001');
      const adhesion = await tontinesService.addAdhesion('T-001', tontine.id, 'M-001', '2026-09-01');
      const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine.id, '2026-09-05');
      const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
      const result = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 5_000);
      expect(getBeneficiaryPaymentStatus(result!)).toBe('PAID');
      expect(Math.max(result!.amountDue - result!.amountPaid, 0)).toBe(0);
    });
  });

  it('SANS ACHAT : la caisse système « Achat tontine » n’est jamais résolue ni utilisée, même si un montant d’achat est transmis par erreur', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: false });
    expect(tontine?.purchaseAccountId).toBeUndefined();
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // sans-achat
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    const before = transactions.length;
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000, 999); // purchaseAmount fourni par erreur
    const added = transactions.slice(before);
    expect(added).toHaveLength(1); // uniquement la jambe nette
    expect(added.some((t) => t.toAccount === 'CS-001-CX-008')).toBe(false); // jamais posté vers « Achat tontine »
  });

  it('COTISATION : recordContribution ne transite jamais par « Achat tontine », même pour une tontine « avec achat »', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const added = transactions.slice(before);
    expect(added).toHaveLength(1);
    expect(added.some((t) => t.toAccount === 'CS-001-CX-008' || t.fromAccount === 'CS-001-CX-008')).toBe(false);
  });

  it('RELIQUAT : la création d’un TontineRemainder ne poste aucune écriture Finance dans « Achat tontine » (mécanisme distinct, non financier)', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 6_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 6_000); // pas de purchaseAmount ici
    const before = transactions.filter((t) => t.toAccount === 'CS-001-CX-008' || t.fromAccount === 'CS-001-CX-008').length;
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrence!.id); // crée le reliquat (10 000 collectés, 6 000 distribués)
    expect(closed?.status).toBe('REALIZED');
    const remainders = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    expect(remainders).toHaveLength(1);
    const after = transactions.filter((t) => t.toAccount === 'CS-001-CX-008' || t.fromAccount === 'CS-001-CX-008').length;
    expect(after).toBe(before); // le reliquat ne touche jamais la caisse « Achat tontine »
  });

  it('DISTRIBUTIONS : la lecture consolidée ne poste ni ne modifie aucune écriture Finance (vue pure)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    const before = transactions.length;
    await tontineOperationsService.listDistributions('T-001', tontine!.id);
    expect(transactions.length).toBe(before); // lecture pure, aucun effet de bord Finance
  });

  it('TENANT ISOLATION : chaque tenant résout SA PROPRE caisse « Achat tontine », jamais celle d’un autre tenant', async () => {
    const tontineT1 = await makeMoneyTontine('T-001', { withPurchase: true });
    const tontineT2 = await makeMoneyTontine('T-002', { withPurchase: true });
    expect(tontineT1?.purchaseAccountId).toBe('AC-015'); // CS-001-CX-008 — caisse de T-001
    expect(tontineT2?.purchaseAccountId).toBe('AC-016'); // TH-002-CX-001 — caisse de T-002

    const adhesion = await tontinesService.addAdhesion('T-002', tontineT2!.id, 'M-002', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-002', tontineT2!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-002', occurrence!.id, adhesion!.id, 20_000);
    const before = transactions.length;
    await tontineOperationsService.recordReception('T-002', beneficiary!.id, 15_000, 5_000);
    const added = transactions.slice(before);
    expect(added.some((t) => t.amount === 5_000 && t.toAccount === 'TH-002-CX-001')).toBe(true); // la caisse de SON PROPRE tenant
    expect(added.some((t) => t.toAccount === 'CS-001-CX-008' || t.fromAccount === 'CS-001-CX-008')).toBe(false); // jamais celle de T-001
  });

  it('EXERCICE FISCAL : clôturer/reporter un exercice ne recrée jamais la caisse système et l’identifiant résolu reste stable', async () => {
    const accountsCountBefore = accounts.length;
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    expect(tontine?.purchaseAccountId).toBe('AC-015');
    await financePositionService.closeFiscalYear('T-001', 'FY-T001-2026');
    await financePositionService.carryForward('T-001', 'FY-T001-2026', 'FY-T001-2027');
    expect(accounts.length).toBe(accountsCountBefore); // aucun compte ajouté par la clôture/le report
    const refreshed = await tontinesService.getTontine('T-001', tontine!.id);
    expect(refreshed?.purchaseAccountId).toBe('AC-015'); // toujours la même caisse système, jamais recréée
  });

  it('ABSENCE ARTIFICIELLE DU COMPTE (mandat §17/§21) : la caisse système disparaît hors API (corruption de données) → l’achat est refusé PROPREMENT, jamais un enregistrement partiel ni une perte silencieuse de purchaseAmount', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    // Suppression HORS API du compte système — jamais atteignable via `financeService.deleteAccount` (protégé),
    // reproduit ici uniquement pour simuler une anomalie de données déjà survenue.
    const accountIndex = accounts.findIndex((account) => account.id === tontine!.purchaseAccountId);
    const [removedAccount] = accounts.splice(accountIndex, 1);
    try {
      const before = transactions.length;
      const result = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000, 5_000);
      expect(result).toBeNull(); // refusé proprement, jamais un faux succès
      expect(transactions.length).toBe(before); // aucune écriture Finance créée, `purchaseAmount` jamais perdu en silence
      const [refreshedBeneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
      expect(refreshedBeneficiary.amountPaid).toBe(0); // aucune mutation partielle du bénéficiaire
    } finally {
      accounts.push(removedAccount); // restaure l'état pour le reste de la suite
    }
  });
});

describe('tontineOperationsService — Isolation multi-tenant', () => {
  it('DENY: listAllAdhesions/listAllOccurrences/listAllContributions never leak across tenants', async () => {
    const [adhesionsT1, adhesionsT2] = await Promise.all([tontineOperationsService.listAllAdhesions('T-001'), tontineOperationsService.listAllAdhesions('T-002')]);
    expect(adhesionsT1.every((a) => a.tenantId === 'T-001')).toBe(true);
    expect(adhesionsT2.every((a) => a.tenantId === 'T-002')).toBe(true);
    const [occurrencesT1, occurrencesT2] = await Promise.all([tontineOperationsService.listAllOccurrences('T-001'), tontineOperationsService.listAllOccurrences('T-002')]);
    expect(occurrencesT1.every((o) => o.tenantId === 'T-001')).toBe(true);
    expect(occurrencesT2.every((o) => o.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: getOccurrence returns null for a Tour of another tenant', async () => {
    const tontine = await makeMoneyTontine('T-002');
    const occurrence = await tontineOperationsService.createOccurrence('T-002', tontine!.id, '2026-09-05');
    expect(await tontineOperationsService.getOccurrence('T-001', occurrence!.id)).toBeNull();
  });
});

describe('tontineOperationsService — Refonte « Tours » : cotisation ON/OFF (mandat espace de travail du Tour)', () => {
  it('ALLOW: setContributionPayment(true) posts the full expected amount and marks the row as paid', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', contributionAmount: 50_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const status = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    expect(status).toMatchObject({ adhesionId: adhesion!.id, amountDue: 50_000, amountPaid: 50_000, paid: true });
    expect(transactions.length).toBe(before + 1);
    expect(transactions[transactions.length - 1]).toMatchObject({ category: 'EPARGNE', type: 'credit', amount: 50_000 });
  });

  it('ALLOW: the user never re-enters the amount — ON always applies exactly the Tontine’s configured amount, never a manual figure', async () => {
    const tontine = await makeMoneyTontine('T-001', { contributionAmount: 75_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const status = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    expect(status?.amountPaid).toBe(75_000);
  });

  it('ALLOW → ALLOW: toggling ON twice is idempotent (no duplicate Transaction, no double amount)', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', contributionAmount: 20_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    const before = transactions.length;
    const status = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    expect(status?.amountPaid).toBe(20_000);
    expect(transactions.length).toBe(before);
  });

  it('ALLOW: OFF never deletes the historical Contribution — it posts an additive reversal and a compensating debit Transaction', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', contributionAmount: 30_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    const contributionsBefore = (await tontineOperationsService.listContributions('T-001', occurrence!.id)).length;
    const before = transactions.length;
    const status = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, false);
    expect(status).toMatchObject({ amountPaid: 0, paid: false });
    const contributionsAfter = await tontineOperationsService.listContributions('T-001', occurrence!.id);
    expect(contributionsAfter.length).toBe(contributionsBefore + 1); // additive, jamais une suppression
    expect(contributionsAfter.reduce((sum, item) => sum + item.amount, 0)).toBe(0); // net = 0, historique conservé
    expect(transactions.length).toBe(before + 1);
    expect(transactions[transactions.length - 1]).toMatchObject({ category: 'EPARGNE', type: 'debit', amount: 30_000 });
  });

  it('ALLOW: OFF on an already-unpaid adhesion is a safe no-op (no reversal transaction created)', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', contributionAmount: 30_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const status = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, false);
    expect(status).toMatchObject({ amountPaid: 0, paid: false });
    expect(transactions.length).toBe(before);
  });

  it('HISTORY: every ON/OFF toggle writes an AuditEvent with actor, amount, before/after', async () => {
    const tontine = await makeMoneyTontine('T-001', { contributionAmount: 40_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, false);
    const events = auditEvents.filter((event) => event.action === 'tontines.contributionPaymentToggled' && event.correlationId === occurrence!.id);
    expect(events.length).toBe(2);
    expect(events[0]).toMatchObject({ before: { paid: 'false' }, after: { paid: 'true' } });
    expect(events[1]).toMatchObject({ before: { paid: 'true' }, after: { paid: 'false' } });
    expect(events[0].actorName).toBeTruthy();
  });

  it('DENY: setContributionPayment is refused once the Tour is REALIZED (immutability)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, contributionAmount: 10_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const afterClose = await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, false);
    expect(afterClose).toBeNull();
  });

  it('DENY: listContributionStatuses never leaks another tenant’s adhesions/amounts', async () => {
    const tontine = await makeMoneyTontine('T-001', { contributionAmount: 10_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesion!.id, true);
    const statusesOtherTenant = await tontineOperationsService.listContributionStatuses('T-002', occurrence!.id);
    expect(statusesOtherTenant).toEqual([]);
  });

  it('BATCH: markAllContributionsPaid settles every eligible unpaid adhesion in ONE call, skips already-paid ones, never duplicates', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', contributionAmount: 15_000 });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.setContributionPayment('T-001', occurrence!.id, adhesionA!.id, true); // déjà réglé
    const before = transactions.length;
    const result = await tontineOperationsService.markAllContributionsPaid('T-001', occurrence!.id);
    expect(result).toEqual({ updated: 1 }); // seule adhesionB était non réglée
    expect(transactions.length).toBe(before + 1);
    const statuses = await tontineOperationsService.listContributionStatuses('T-001', occurrence!.id);
    expect(statuses.every((row) => row.paid)).toBe(true);
    expect(statuses.find((row) => row.adhesionId === adhesionB!.id)?.paid).toBe(true);
    const rerun = await tontineOperationsService.markAllContributionsPaid('T-001', occurrence!.id);
    expect(rerun).toEqual({ updated: 0 }); // aucun doublon sur un second appel
  });
});

describe('tontineOperationsService — Refonte « Tours » : Ajouter/Enlever des bénéficiaires (gauche ↔ droite)', () => {
  it('ALLOW: addOccurrenceBeneficiaries adds several beneficiaries in ONE batch call, each with its own line', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, contributionAmount: 25_000 });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesionA!.id, adhesionB!.id]);
    expect(result?.added.length).toBe(2);
    expect(result?.skipped).toBe(0);
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries.map((b) => b.adhesionId).sort()).toEqual([adhesionA!.id, adhesionB!.id].sort());
    expect(beneficiaries.every((b) => b.amountDue === 25_000)).toBe(true);
  });

  it('DENY: addOccurrenceBeneficiaries is refused for a SANS-ACHAT tontine — beneficiaries come from the Plan only', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    expect(result).toEqual({ added: [], skipped: 1 });
  });

  it('HISTORY: addOccurrenceBeneficiaries writes one AuditEvent per beneficiary added', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesionA!.id, adhesionB!.id]);
    const events = auditEvents.filter((event) => event.action === 'tontines.beneficiaryAdded' && event.correlationId === occurrence!.id);
    expect(events.length).toBe(2);
  });

  it('ALLOW → DENY: removeOccurrenceBeneficiary removes an unpaid beneficiary, but refuses once a reception was recorded (immutability of a real payment)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    const refused = await tontineOperationsService.removeOccurrenceBeneficiary('T-001', beneficiary!.id);
    expect(refused).toBeNull();
    const stillThere = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(stillThere.some((b) => b.id === beneficiary!.id)).toBe(true);
  });

  it('ALLOW: removeOccurrenceBeneficiaries removes several beneficiaries in ONE batch call and reports the exact count', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 10_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 10_000);
    const result = await tontineOperationsService.removeOccurrenceBeneficiaries('T-001', [beneficiaryA!.id, beneficiaryB!.id]);
    expect(result).toEqual({ removed: 2, skipped: 0 });
    const remaining = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(remaining.length).toBe(0);
  });

  it('HISTORY: removeOccurrenceBeneficiary writes an AuditEvent, never a silent deletion of history', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.removeOccurrenceBeneficiary('T-001', beneficiary!.id);
    const event = auditEvents.find((item) => item.action === 'tontines.beneficiaryRemoved' && item.resourceId === beneficiary!.id);
    expect(event).toBeTruthy();
  });

  it('DENY: removeOccurrenceBeneficiary is refused once the Tour is REALIZED', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 10_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 10_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const refused = await tontineOperationsService.removeOccurrenceBeneficiary('T-001', beneficiaryA!.id);
    expect(refused).toBeNull();
  });

  it('DENY: addOccurrenceBeneficiaries never leaks a beneficiary across tenants', async () => {
    const tontineT1 = await makeMoneyTontine('T-001', { withPurchase: true });
    const occurrenceT1 = await tontineOperationsService.createOccurrence('T-001', tontineT1!.id, '2026-09-05');
    const adhesionT2 = await tontinesService.addAdhesion('T-002', 'TON-001', 'M-002', '2026-09-01');
    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrenceT1!.id, [adhesionT2!.id]);
    expect(result).toEqual({ added: [], skipped: 1 });
  });

  it('CAS 1/2/3 — un Tour peut porter 1, puis 2, puis 3 bénéficiaires distincts, chacun sa propre ligne OccurrenceBeneficiary', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, contributionAmount: 50_000 });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const paul = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');

    const afterOne = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [jean!.id]);
    expect(afterOne?.added.length).toBe(1);
    expect((await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).length).toBe(1);

    const afterTwo = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [marie!.id]);
    expect(afterTwo?.added.length).toBe(1);
    expect((await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).length).toBe(2);

    const afterThree = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [paul!.id]);
    expect(afterThree?.added.length).toBe(1);
    const finalList = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(finalList.length).toBe(3);
    expect(new Set(finalList.map((b) => b.id)).size).toBe(3); // trois enregistrements distincts, jamais un champ fusionné
    expect(finalList.map((b) => b.adhesionId).sort()).toEqual([jean!.id, marie!.id, paul!.id].sort());
  });

  it('CAS 4/5 — ajout batch de 3, puis retrait batch de 2 : le troisième bénéficiaire reste seul', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const paul = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');

    const added = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [jean!.id, marie!.id, paul!.id]);
    expect(added?.added.length).toBe(3);
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    const marieBeneficiary = beneficiaries.find((b) => b.adhesionId === marie!.id)!;
    const paulBeneficiary = beneficiaries.find((b) => b.adhesionId === paul!.id)!;

    const removed = await tontineOperationsService.removeOccurrenceBeneficiaries('T-001', [marieBeneficiary.id, paulBeneficiary.id]);
    expect(removed).toEqual({ removed: 2, skipped: 0 });
    const remaining = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].adhesionId).toBe(jean!.id);
  });

  it('CAS 6 — deux représentations DISTINCTES du même Member peuvent être bénéficiaires du MÊME Tour, jamais fusionnées par memberId', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01'); // Fatou Ndiaye, représentation 1
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01'); // Fatou Ndiaye, représentation 2
    expect(repA!.id).not.toBe(repB!.id);
    expect(repA!.memberId).toBe(repB!.memberId);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const result = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [repA!.id, repB!.id]);
    expect(result?.added.length).toBe(2);
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries.map((b) => b.adhesionId).sort()).toEqual([repA!.id, repB!.id].sort());
    expect(beneficiaries[0].id).not.toBe(beneficiaries[1].id); // deux OccurrenceBeneficiary distincts
  });

  it('CAS 7 — le même Member dans Tontine A et Tontine B garde des bénéficiaires strictement isolés par Tontine/Tour', async () => {
    const tontineA = await makeMoneyTontine('T-001', { withPurchase: true });
    const tontineB = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionInA = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-001', '2026-09-01');
    const adhesionInB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-001', '2026-09-01');
    const occurrenceA = await tontineOperationsService.createOccurrence('T-001', tontineA!.id, '2026-09-05');
    const occurrenceB = await tontineOperationsService.createOccurrence('T-001', tontineB!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrenceA!.id, [adhesionInA!.id]);
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrenceB!.id, [adhesionInB!.id]);
    const beneficiariesA = await tontineOperationsService.listBeneficiaries('T-001', occurrenceA!.id);
    const beneficiariesB = await tontineOperationsService.listBeneficiaries('T-001', occurrenceB!.id);
    expect(beneficiariesA.length).toBe(1);
    expect(beneficiariesB.length).toBe(1);
    expect(beneficiariesA[0].adhesionId).toBe(adhesionInA!.id);
    expect(beneficiariesB[0].adhesionId).toBe(adhesionInB!.id);
    expect(beneficiariesA[0].id).not.toBe(beneficiariesB[0].id);
  });

  it('CAS 8 — historique : 3 ajouts produisent 3 traces distinctes, 2 retraits produisent 2 traces distinctes', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const paul = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [jean!.id, marie!.id, paul!.id]);
    const addedEvents = auditEvents.filter((e) => e.action === 'tontines.beneficiaryAdded' && e.correlationId === occurrence!.id);
    expect(addedEvents.length).toBe(3);
    expect(new Set(addedEvents.map((e) => e.resourceId)).size).toBe(3);

    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    const marieBeneficiary = beneficiaries.find((b) => b.adhesionId === marie!.id)!;
    const paulBeneficiary = beneficiaries.find((b) => b.adhesionId === paul!.id)!;
    await tontineOperationsService.removeOccurrenceBeneficiaries('T-001', [marieBeneficiary.id, paulBeneficiary.id]);
    const removedEvents = auditEvents.filter((e) => e.action === 'tontines.beneficiaryRemoved' && e.correlationId === occurrence!.id);
    expect(removedEvents.length).toBe(2);
    expect(new Set(removedEvents.map((e) => e.resourceId)).size).toBe(2);
  });

  it('CAS 9 — ajouter plusieurs bénéficiaires ne crée AUCUNE Transaction Finance parasite (seule `recordReception` en poste)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, accountId: 'AC-002' });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [jean!.id, marie!.id]);
    expect(transactions.length).toBe(before); // aucune écriture Finance au simple ajout d'un bénéficiaire
  });

  it('CAS 10 — reliquat avec plusieurs bénéficiaires : le reliquat reste la différence entre le total collecté et le total RÉELLEMENT distribué à TOUS les bénéficiaires', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, accountId: 'AC-002', contributionAmount: 50_000 });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const paul = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    // 3 cotisants collectent 3 × 50 000 = 150 000
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, jean!.id, 50_000);
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, marie!.id, 50_000);
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, paul!.id, 50_000);
    // 2 bénéficiaires du même Tour, chacun reçoit individuellement 60 000 → distribué = 120 000
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, jean!.id, 60_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, marie!.id, 60_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 60_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 60_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    // reliquat attendu = 150 000 collecté − (60 000 + 60 000) distribué = 30 000
    const remainders = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    const remainder = remainders.find((r) => r.occurrenceId === occurrence!.id);
    expect(remainder?.amount).toBe(30_000);
    expect(remainder?.status).toBe('OPEN');
  });
});

describe('tontineOperationsService — candidats de planification de Tour', () => {
  it('un adhérent ajouté après la création du Tour devient candidat par adhesionId, sans bénéficiaire automatique', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-06-01');
    const added = await tontinesService.addAdhesions('T-001', tontine!.id, ['M-001', 'M-006', 'M-016', 'M-018'], '2026-09-21');

    const candidates = await tontineOperationsService.listOccurrencePlanningCandidates('T-001', occurrence!.id);
    expect(candidates.map((adhesion) => adhesion.id)).toEqual(added.created.map((adhesion) => adhesion.id));
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).toEqual([]);

    const addedBeneficiaries = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [added.created[0].id]);
    expect(addedBeneficiaries.added).toHaveLength(1);
    expect(addedBeneficiaries.added[0].adhesionId).toBe(added.created[0].id);
  });
});

describe('tontineOperationsService — Statut automatique du bénéficiaire (getBeneficiaryPaymentStatus)', () => {
  it('CAS 1 : amountPaid = 0 → PENDING (En attente)', () => {
    expect(getBeneficiaryPaymentStatus({ amountDue: 25_000, amountPaid: 0 })).toBe('PENDING');
  });

  it('CAS 2 : 0 < amountPaid < amountDue → PARTIAL (Partiellement réglé)', () => {
    expect(getBeneficiaryPaymentStatus({ amountDue: 25_000, amountPaid: 10_000 })).toBe('PARTIAL');
  });

  it('CAS 3 : amountPaid >= amountDue → PAID (Réglé)', () => {
    expect(getBeneficiaryPaymentStatus({ amountDue: 25_000, amountPaid: 25_000 })).toBe('PAID');
  });

  it('ALLOW : un statut ne dépend QUE de amountDue/amountPaid — jamais un champ status stocké séparément (fonction pure, centralisée)', () => {
    // Une seule fonction, jamais dupliquée : appelée deux fois avec les mêmes montants, toujours le même résultat.
    const beneficiary = { amountDue: 25_000, amountPaid: 25_000 };
    expect(getBeneficiaryPaymentStatus(beneficiary)).toBe(getBeneficiaryPaymentStatus({ ...beneficiary }));
  });
});

describe('tontineOperationsService — Action « Régler » : recordReception journal-lié, historisé, paiement partiel supporté', () => {
  it('ALLOW : un règlement PARTIEL est supporté par le modèle — amountPaid s’accumule, jamais remplacé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 25_000);
    expect(getBeneficiaryPaymentStatus(beneficiary!)).toBe('PENDING');

    const afterPartial = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    expect(afterPartial).toMatchObject({ amountPaid: 10_000 });
    expect(getBeneficiaryPaymentStatus(afterPartial!)).toBe('PARTIAL');

    const afterFull = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000);
    expect(afterFull).toMatchObject({ amountPaid: 25_000 });
    expect(getBeneficiaryPaymentStatus(afterFull!)).toBe('PAID');
  });

  it('ALLOW : Jean réglé, Marie en attente, Paul partiellement réglé sur le MÊME Tour — chaque règlement reste indépendant des autres', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const jean = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const marie = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const paul = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-016', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiaryJean = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, jean!.id, 25_000);
    const beneficiaryMarie = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, marie!.id, 25_000);
    const beneficiaryPaul = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, paul!.id, 25_000);

    await tontineOperationsService.recordReception('T-001', beneficiaryJean!.id, 25_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryPaul!.id, 10_000);

    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    const jeanRow = beneficiaries.find((b) => b.id === beneficiaryJean!.id)!;
    const marieRow = beneficiaries.find((b) => b.id === beneficiaryMarie!.id)!;
    const paulRow = beneficiaries.find((b) => b.id === beneficiaryPaul!.id)!;
    expect(getBeneficiaryPaymentStatus(jeanRow)).toBe('PAID');
    expect(getBeneficiaryPaymentStatus(marieRow)).toBe('PENDING'); // le règlement de Jean/Paul ne l'affecte jamais
    expect(getBeneficiaryPaymentStatus(paulRow)).toBe('PARTIAL');
    expect(Math.max(marieRow.amountDue - marieRow.amountPaid, 0)).toBe(25_000);
    expect(Math.max(paulRow.amountDue - paulRow.amountPaid, 0)).toBe(15_000);
  });

  it('HISTORY : recordReception écrit un AuditEvent avec montant avant/après et statut avant/après', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true, accountId: 'AC-002' });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 25_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 25_000);
    const event = auditEvents.find((item) => item.action === 'tontines.beneficiaryPaymentRecorded' && item.resourceId === beneficiary!.id);
    expect(event).toBeTruthy();
    expect(event).toMatchObject({ before: { amountPaid: '0', status: 'PENDING' }, after: { amountPaid: '25000', status: 'PAID' }, correlationId: occurrence!.id });
    expect(event?.actorName).toBeTruthy();
  });

  it('DENY : recordReception refusé une fois le Tour RÉALISÉ — protection contre le double règlement après clôture', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const afterClose = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 1);
    expect(afterClose).toBeNull();
  });

  it('DENY : recordReception ne fuit jamais entre tenants — un bénéficiaire de T-002 reste invisible/inaccessible depuis T-001', async () => {
    const tontineT2 = await makeMoneyTontine('T-002', { withPurchase: true });
    const adhesionT2 = await tontinesService.addAdhesion('T-002', tontineT2!.id, 'M-002', '2026-09-01');
    const occurrenceT2 = await tontineOperationsService.createOccurrence('T-002', tontineT2!.id, '2026-09-05');
    const beneficiaryT2 = await tontineOperationsService.addOccurrenceBeneficiary('T-002', occurrenceT2!.id, adhesionT2!.id, 10_000);
    const crossTenant = await tontineOperationsService.recordReception('T-001', beneficiaryT2!.id, 10_000);
    expect(crossTenant).toBeNull();
  });
});

describe('tontineOperationsService — Cycle système (mandat « recommencement automatique de la Tontine »)', () => {
  /**
   * AUDIT CIBLÉ 2026-09-18 — « bénéficié » = réglé intégralement
   * (`getBeneficiaryPaymentStatus === 'PAID'`), jamais une simple
   * désignation `OccurrenceBeneficiary`. TEST 1/2/3 ci-dessous couvrent
   * exactement les 3 états (désigné non réglé / partiellement réglé /
   * intégralement réglé) exigés par l'audit.
   */
  it('AUDIT TEST 1 — participation désignée bénéficiaire mais NON réglée (amountPaid = 0) : le cycle n’est PAS terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(beneficiary?.amountPaid).toBe(0);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // désignation seule, jamais un bénéfice réalisé
  });

  it('AUDIT TEST 2 — participation PARTIELLEMENT réglée (amountPaid < amountDue) : le cycle n’est PAS terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000); // 5 000 / 10 000 → PARTIAL
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false);
  });

  it('AUDIT TEST 3 — participation intégralement réglée (amountPaid >= amountDue) : le cycle EST terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('AUDIT TEST 4 — plusieurs participations, certaines réglées certaines non : cycle non terminé tant que TOUTES ne sont pas réglées', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repA!.id, 10_000);
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repB!.id, 10_000); // désignée, jamais réglée dans ce test
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // repB reste désignée mais non réglée
  });

  it('AUDIT TEST 5 — toutes les participations effectivement réglées → cycle terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repA!.id, 10_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repB!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('AUDIT TEST 6 — deux participations du MÊME membre : une réglée, une non → cycle non terminé (granularité adhesionId, jamais memberId)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adh1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const adh2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adh1!.id, 10_000);
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adh2!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary1!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false);
  });

  it('AUDIT TEST 7 — deux participations du MÊME membre, toutes deux réglées (seules participations éligibles) → cycle terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adh1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const adh2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adh1!.id, 10_000);
    const beneficiary2 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adh2!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary1!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary2!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('AUDIT TEST 8 — AVEC-ACHAT : `amountPurchased` (achat) jamais confondu avec la réalisation du bénéfice (`amountPaid`/`amountDue`)', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    // Règlement PARTIEL du montant dû, mais un montant d'achat déjà versé — l'achat ne doit jamais suffire à marquer le bénéfice réalisé.
    const afterPartial = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 8_000, 5_000);
    expect(afterPartial?.amountPurchased).toBe(5_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // amountPurchased > 0, mais amountPaid (8 000) < amountDue (20 000)
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 12_000); // complète le règlement : 8 000 + 12 000 = 20 000
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('AUDIT TEST 9 — SANS-ACHAT : même principe — une désignation (`amountPaid = 0` à la création) ne suffit pas, seul le règlement compte', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence!.id, [adhesion!.id]);
    const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiary.adhesionId).toBe(adhesion!.id);
    expect(beneficiary.amountPaid).toBe(0); // désigné, mais pas encore réglé
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, beneficiary.amountDue);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('AUDIT TEST 10 — startNewCycle refusé côté service tant qu’une participation n’est pas RÉELLEMENT réglée (même si toutes sont désignées)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repA!.id, 10_000);
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repB!.id, 10_000); // désignée, jamais réglée
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    const refused = await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    expect(refused).toBeNull();
  });

  it('AUDIT TEST 11 — startNewCycle réussit une fois TOUTES les participations réellement réglées', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    const newCycle = await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    expect(newCycle).toBeTruthy();
    expect(newCycle!.status).toBe('OPEN');
  });

  it('TEST 1 — une participation unique bénéficie une fois (intégralement réglée) → cycle terminé', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('TEST 2 — deux participations du MÊME membre : cycle terminé seulement quand les DEUX ont RÉELLEMENT bénéficié (réglées)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repA!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // repB n'a pas encore bénéficié
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repB!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('TEST 3 — une participation ne peut jamais bénéficier deux fois dans le même cycle, même sur deux Tours différents', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-03-01');
    const first = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, adhesion!.id, 10_000);
    expect(first).toBeTruthy();
    const second = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence2!.id, adhesion!.id, 10_000);
    expect(second).toBeNull(); // refusé — même cycle
  });

  it('TEST 4/16 — 4 participations dont seulement 3 ont bénéficié : cycle non terminé, démarrage d’un nouveau cycle refusé côté service', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesions = await Promise.all(['M-001', 'M-006', 'M-016', 'M-018'].map((memberId) => tontinesService.addAdhesion('T-001', tontine!.id, memberId, '2026-01-01')));
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    for (const adhesion of adhesions.slice(0, 3)) await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false);
    const refused = await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    expect(refused).toBeNull();
  });

  it('TEST 5 — getCycleStatus reflète exactement l’état « toutes les participations ont RÉELLEMENT bénéficié » (réglées, pas seulement désignées)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    expect((await tontineOperationsService.getCycleStatus('T-001', tontine!.id))?.complete).toBe(false);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect((await tontineOperationsService.getCycleStatus('T-001', tontine!.id))?.complete).toBe(false); // désignée, pas encore réglée
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    expect((await tontineOperationsService.getCycleStatus('T-001', tontine!.id))?.complete).toBe(true);
  });

  it('TEST 6/7 — démarrer un nouveau cycle conserve l’ancien, crée/rend courant le nouveau, et une ancienne participation peut de nouveau bénéficier', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary1!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);

    const newCycle = await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    expect(newCycle).toBeTruthy();
    expect(newCycle!.status).toBe('OPEN');
    expect((await tontineOperationsService.getCycleStatus('T-001', tontine!.id))?.complete).toBe(false); // nouvelle séquence, personne n'a encore bénéficié

    // l'ancien Tour reste consultable, inchangé
    const occurrences = await tontineOperationsService.listOccurrences('T-001', tontine!.id);
    expect(occurrences.some((item) => item.id === occurrence1!.id)).toBe(true);
    const [oldBeneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence1!.id);
    expect(oldBeneficiary?.adhesionId).toBe(adhesion!.id); // le bénéficiaire de l'ancien cycle reste intact
    expect(oldBeneficiary?.amountPaid).toBe(10_000); // son règlement reste intact, jamais réinitialisé

    // l'ancienne participation peut de nouveau bénéficier dans le nouveau cycle
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-04-01');
    const beneficiaryAgain = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence2!.id, adhesion!.id, 10_000);
    expect(beneficiaryAgain).toBeTruthy();
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // désignée dans le nouveau cycle, pas encore réglée
    await tontineOperationsService.recordReception('T-001', beneficiaryAgain!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('TEST 8 — plusieurs bénéficiaires sur un même Tour sont chacun comptabilisés par adhesionId (une fois réglés), jamais un nombre de Tours fixe', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const repA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const repB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01'); // un SEUL Tour
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repA!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryA!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, repB!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryB!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true); // les deux participations ont RÉELLEMENT bénéficié, sur un seul Tour
  });

  it('TEST 9 — AVEC-ACHAT : une participation ne peut bénéficier qu’une fois dans le cycle', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    const secondOccurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-03-01');
    const refused = await tontineOperationsService.addOccurrenceBeneficiary('T-001', secondOccurrence!.id, adhesion!.id, 10_000);
    expect(refused).toBeNull();
  });

  it('TEST 10 — SANS-ACHAT : même règle, une participation ne peut bénéficier qu’une fois dans le cycle (Plan épuisé, jamais reconsommé) — et doit être RÉGLÉE pour compter', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence1!.id, [adhesion!.id]);
    const [beneficiary1] = await tontineOperationsService.listBeneficiaries('T-001', occurrence1!.id);
    expect(beneficiary1?.adhesionId).toBe(adhesion!.id);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // désignée, pas encore réglée
    await tontineOperationsService.recordReception('T-001', beneficiary1.id, beneficiary1.amountDue);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
    // le Plan du cycle courant est épuisé : plus aucune position à désigner (refus explicite, jamais silencieux)
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-03-01');
    const result2 = await tontineOperationsService.addOccurrenceBeneficiaries('T-001', occurrence2!.id, [adhesion!.id]);
    expect(result2?.added).toEqual([]);
    const beneficiaries2 = await tontineOperationsService.listBeneficiaries('T-001', occurrence2!.id);
    expect(beneficiaries2).toHaveLength(0);
  });

  it('TEST 11/12 — un membre avec plusieurs représentations peut bénéficier une fois PAR représentation dans le même cycle (2, puis 3), une fois RÉGLÉES', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const rep1 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep2 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const rep3 = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const b1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, rep1!.id, 10_000);
    const b2 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, rep2!.id, 10_000);
    const b3 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, rep3!.id, 10_000);
    expect([b1, b2, b3].every(Boolean)).toBe(true); // 3 bénéfices distincts, même membre, même Tour, même cycle
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // désignés, pas encore réglés
    await tontineOperationsService.recordReception('T-001', b1!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', b2!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(false); // rep3 toujours non réglé
    await tontineOperationsService.recordReception('T-001', b3!.id, 10_000);
    expect(isCycleComplete('T-001', tontine!.id)).toBe(true);
  });

  it('TEST 13 — isolation tenant : les participations d’un autre tenant n’influencent jamais la fin de cycle', async () => {
    const tontineT1 = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionT1 = await tontinesService.addAdhesion('T-001', tontineT1!.id, 'M-001', '2026-01-01');
    const tontineT2 = await makeMoneyTontine('T-002', { withPurchase: true });
    await tontinesService.addAdhesion('T-002', tontineT2!.id, 'M-002', '2026-01-01'); // jamais bénéficiaire — ne doit jamais compter pour T-001

    const occurrenceT1 = await tontineOperationsService.createOccurrence('T-001', tontineT1!.id, '2026-02-01');
    const beneficiaryT1 = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrenceT1!.id, adhesionT1!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiaryT1!.id, 10_000);
    expect(isCycleComplete('T-001', tontineT1!.id)).toBe(true); // complet malgré la participation T-002 jamais servie
    expect(isCycleComplete('T-002', tontineT2!.id)).toBe(false); // T-002 reste indépendant, sa propre participation n'a pas bénéficié
  });

  it('TEST 14 — le reliquat d’un ancien cycle reste intact après démarrage d’un nouveau cycle', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 6_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 6_000); // reliquat 4 000
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const [remainderBefore] = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    expect(remainderBefore.amount).toBe(4_000);

    await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    const remaindersAfter = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    expect(remaindersAfter).toHaveLength(1); // toujours là, jamais supprimé/remis à zéro/déplacé
    expect(remaindersAfter[0]).toMatchObject({ id: remainderBefore.id, amount: 4_000, occurrenceId: occurrence!.id });
  });

  it('TEST 15 — les transactions Finance d’un ancien cycle restent intactes après démarrage d’un nouveau cycle', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-01-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-02-01');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    const transactionCountBefore = transactions.length;

    await tontineOperationsService.startNewCycle('T-001', tontine!.id);
    expect(transactions.length).toBe(transactionCountBefore); // démarrer un cycle ne poste/ne modifie aucune écriture Finance
  });
});
