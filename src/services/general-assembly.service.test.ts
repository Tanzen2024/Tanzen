import { describe, it, expect } from 'vitest';
import { generalAssemblyService, type GeneralAssemblyInput } from './general-assembly.service';
import { organizationService } from './organization.service';

const validInput: GeneralAssemblyInput = { title: 'Assemblée Test Playwright', assemblyDate: '2026-12-01', description: 'Ordre du jour de test.' };

describe('generalAssemblyService — CREATE (backed by Meeting(type=GENERAL_ASSEMBLY), D-4C4-WEB-01)', () => {
  it('ALLOW: createGeneralAssembly succeeds with valid input, defaults to status PLANNED', async () => {
    const assembly = await generalAssemblyService.createGeneralAssembly('T-001', validInput);
    expect(assembly).not.toBeNull();
    expect(assembly?.tenantId).toBe('T-001');
    expect(assembly?.status).toBe('PLANNED');
    expect(assembly?.title).toBe(validInput.title);
    expect(assembly?.assemblyDate).toBe(validInput.assemblyDate);
    expect(assembly?.description).toBe(validInput.description);
  });

  it('DENY: createGeneralAssembly refuses an empty title', async () => {
    const result = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: '   ' });
    expect(result).toBeNull();
  });

  it('DENY: createGeneralAssembly refuses a missing assemblyDate (ck_general_assemblies_date)', async () => {
    const result = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, assemblyDate: '' });
    expect(result).toBeNull();
  });

  it('DENY: createGeneralAssembly refuses a duplicate (uq_general_assemblies_title_date = UNIQUE(tenant_id, title, assembly_date))', async () => {
    const first = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Duplicat' });
    expect(first).not.toBeNull();
    const duplicate = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Duplicat' });
    expect(duplicate).toBeNull();
  });

  it('ALLOW: the same title+date is accepted for a different tenant (uniqueness is per-tenant)', async () => {
    const t001 = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Multi-Tenant' });
    const t002 = await generalAssemblyService.createGeneralAssembly('T-002', { ...validInput, title: 'Assemblée Multi-Tenant' });
    expect(t001).not.toBeNull();
    expect(t002).not.toBeNull();
  });

  it('ALLOW: the same tenant can reuse the same title on a different date (composite key includes the date)', async () => {
    const first = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Récurrente', assemblyDate: '2026-01-10' });
    const second = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Récurrente', assemblyDate: '2026-02-10' });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  it('ALLOW: a REGULAR meeting with the same title/date does not collide with the AG uniqueness check', async () => {
    await organizationService.createMeeting('T-001', { title: 'Titre partagé AG/Regular', date: '2026-03-01', location: 'Test', participants: 1, agenda: 'Test' });
    const ga = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Titre partagé AG/Regular', assemblyDate: '2026-03-01' });
    expect(ga).not.toBeNull();
  });
});

describe('generalAssemblyService — GET / LIST — tenant isolation, données migrées (D-4C4-WEB-01)', () => {
  it('ALLOW: listGeneralAssemblies returns only assemblies of the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([generalAssemblyService.listGeneralAssemblies('T-001'), generalAssemblyService.listGeneralAssemblies('T-002')]);
    expect(t001.every((assembly) => assembly.tenantId === 'T-001')).toBe(true);
    expect(t002.every((assembly) => assembly.tenantId === 'T-002')).toBe(true);
    expect(t002.length).toBeGreaterThan(0);
  });

  it('ALLOW: getGeneralAssembly returns the migrated MT-005 (ex-GA-001), data preserved', async () => {
    const result = await generalAssemblyService.getGeneralAssembly('T-001', 'MT-005');
    expect(result?.id).toBe('MT-005');
    expect(result?.title).toBe('Assemblée Générale Ordinaire 2026');
    expect(result?.assemblyDate).toBe('2026-06-15');
    expect(result?.description).toBe('Bilan annuel, élection du bureau, vote du budget 2026.');
    expect(result?.status).toBe('COMPLETED');
  });

  it('DENY: Tenant B cannot get() Tenant A\'s assembly (§20 du mandat — test explicite)', async () => {
    const [t002Assembly] = await generalAssemblyService.listGeneralAssemblies('T-002');
    expect(t002Assembly).toBeDefined();
    const resultAsT001 = await generalAssemblyService.getGeneralAssembly('T-001', t002Assembly.id);
    expect(resultAsT001).toBeNull();
  });

  it('DENY: Tenant B never sees Tenant A\'s assembly in a list (§20 du mandat)', async () => {
    const [t001Assembly] = await generalAssemblyService.listGeneralAssemblies('T-001');
    const t002List = await generalAssemblyService.listGeneralAssemblies('T-002');
    expect(t002List.find((assembly) => assembly.id === t001Assembly.id)).toBeUndefined();
  });

  it('DENY: getGeneralAssembly returns null for an invalid/unknown id', async () => {
    const result = await generalAssemblyService.getGeneralAssembly('T-001', 'MT-999');
    expect(result).toBeNull();
  });

  it('DENY: getGeneralAssembly does not return a REGULAR meeting even if the id exists', async () => {
    const result = await generalAssemblyService.getGeneralAssembly('T-001', 'MT-001'); // MT-001 is type REGULAR
    expect(result).toBeNull();
  });
});

describe('generalAssemblyService — status', () => {
  it('a newly created assembly is never anything other than PLANNED', async () => {
    const assembly = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée Statut Test' });
    expect(assembly?.status).toBe('PLANNED');
  });

  it('ALLOW (amélioration D-4C4-WEB-01) : une AG peut désormais suivre le cycle de vie complet de Meeting, via organizationService', async () => {
    const created = await generalAssemblyService.createGeneralAssembly('T-001', { ...validInput, title: 'Assemblée cycle de vie', assemblyDate: '2026-12-05' });
    expect(created).not.toBeNull();
    const started = await organizationService.startMeeting('T-001', created!.id);
    expect(started?.status).toBe('ONGOING');
    const completed = await organizationService.completeMeeting('T-001', created!.id);
    expect(completed?.status).toBe('COMPLETED');
    const reflected = await generalAssemblyService.getGeneralAssembly('T-001', created!.id);
    expect(reflected?.status).toBe('COMPLETED');
  });
});
