import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { tontineOperationsService } from './tontine-operations.service';
import { tontinesService } from './tontines.service';
import { fiscalSessionService, currentSessionFor, sessionTiming } from './fiscal-session.service';
import { transactions } from '@/mocks/finance/transactions';

/**
 * TEST DE CARACTÉRISATION — séance d'une écriture « Achat tontine » quand la séance la plus récente
 * de l'exercice est FUTURE (« À venir »). Comportement ACTUEL, documenté sans être validé comme règle
 * métier (mandat du 2026-09-28) : `currentSessionFor` prend la séance la plus RÉCENTE de l'exercice
 * contenant la date de l'encaissement (`latestSession`), sans comparer sa date à celle de
 * l'encaissement. Une séance future est donc retenue. Si une règle est validée, ce test changera
 * avec elle.
 */
describe('Achat tontine — séance retenue quand la dernière séance de l’exercice est à venir (comportement actuel)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-28T10:00:00Z')); });
  afterAll(() => { vi.useRealTimers(); });

  it('encaissement du 28/09/2026 avec une séance le 15/11/2026 : la transaction est rattachée à la séance FUTURE', async () => {
    const future = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-11-15');
    expect(future).toBeTruthy();
    expect(sessionTiming(future!.date, '2026-09-28')).toBe('upcoming');
    expect(currentSessionFor('T-001', '2026-09-28')?.id).toBe(future!.id);

    const tontine = await tontinesService.createTontine({
      tenantId: 'T-001', name: `Séance future ${Date.now()}`, valueType: 'MONEY', contributionAmount: 10_000,
      frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase: true,
    } as never);
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 20_000, 50_000);

    const [tx] = transactions.filter((item) => item.tontineBeneficiaryId === beneficiary!.id && item.status !== 'cancelled');
    // La date de la transaction reste celle de l'encaissement ; seule la séance est la séance future.
    expect(tx).toMatchObject({ date: '2026-09-28', fiscalYearId: 'FY-T001-2026', sessionId: future!.id, amount: 50_000 });
  });
});
