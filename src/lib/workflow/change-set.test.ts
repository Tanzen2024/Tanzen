import { describe, expect, it } from 'vitest';
import { computeChangeSet } from './change-set';

describe('computeChangeSet', () => {
  it('retourne un ChangeSetItem par champ réellement modifié', () => {
    const before = { firstName: 'Fatou', lastName: 'Ndiaye', occupation: 'Commerçante' };
    const patch = { firstName: 'Fatou', lastName: 'Diop', occupation: 'Enseignante' };
    expect(computeChangeSet(before, patch)).toEqual([
      { field: 'lastName', before: 'Ndiaye', after: 'Diop' },
      { field: 'occupation', before: 'Commerçante', after: 'Enseignante' },
    ]);
  });

  it("ignore les champs du patch identiques à l'existant", () => {
    const before = { status: 'active' };
    const patch = { status: 'active' as const };
    expect(computeChangeSet(before, patch)).toEqual([]);
  });

  it('ignore les champs undefined du patch (non proposés)', () => {
    const before = { firstName: 'Fatou', lastName: 'Ndiaye' };
    const patch = { firstName: undefined, lastName: 'Diop' };
    expect(computeChangeSet(before, patch)).toEqual([{ field: 'lastName', before: 'Ndiaye', after: 'Diop' }]);
  });

  it('retourne un tableau vide quand le patch est vide', () => {
    expect(computeChangeSet({ firstName: 'Fatou' }, {})).toEqual([]);
  });

  it('détecte un changement vers une chaîne vide (pas juste "falsy")', () => {
    const before = { matricule: 'MAT-001' };
    const patch = { matricule: '' };
    expect(computeChangeSet(before, patch)).toEqual([{ field: 'matricule', before: 'MAT-001', after: '' }]);
  });
});
